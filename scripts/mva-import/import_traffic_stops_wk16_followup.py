#!/usr/bin/env python3
"""
Follow-up import for week-16 Traffic Stops.

Earlier batch dropped 17 records as "duplicates" by (date, address) —
but traffic stops at the same intersection on the same day are still
different stops (different times, different officers). Re-import them.

Also add the GARFIELD & WOODLAWN record (review-flagged as "GARFILED & WOO").

Usage:
  python3 scripts/mva-import/import_traffic_stops_wk16_followup.py --apply
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[2]
DATA_JSON  = ROOT / 'src' / 'data' / 'data.json'
CACHE_FILE = ROOT / 'scripts' / 'geocode-cache.json'
CSV_IN     = Path('/Users/geremy/Downloads/traffic_stops_geocode_5.csv')

ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
JC_BOX     = (40.66, 40.77, -74.13, -74.02)
MIN_SCORE  = 75

# User-confirmed fix
REVIEW_FIXES = {
    'PAVANIA & SUMMIT, NJ':   'PAVONIA AVE & SUMMIT AVE, JERSEY CITY, NJ',
    'GARFILED & WOO, NJ':     'GARFIELD AVE & WOODLAWN AVE, JERSEY CITY, NJ',
}
SKIP_ON_REVIEW = {'MLK/ALA, NJ'}

# Case numbers already imported in the first batch (ts3-1101..ts3-1178)
# Anything NOT in this set that isn't ambiguous → import now
ALREADY_IMPORTED_CASES: set[str] = set()

# Strip city suffix for stored `address`
def strip_city(raw: str) -> str:
    s = re.sub(r',?\s*JERSEY CITY.*$', '', raw, flags=re.IGNORECASE).strip()
    s = re.sub(r',?\s*NJ\s*\d{5}.*$', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r',\s*NJ\s*$', '', s, flags=re.IGNORECASE).strip()
    return s


def in_jc(lat, lng):
    return JC_BOX[0] <= lat <= JC_BOX[1] and JC_BOX[2] <= lng <= JC_BOX[3]


def arcgis_geocode(address: str):
    params = urllib.parse.urlencode({
        'SingleLine': address, 'outFields': 'Score,Addr_type', 'maxLocations': 3,
        'forStorage': 'false', 'f': 'json', 'location': '-74.0776,40.7282',
        'distance': 20000, 'countryCode': 'USA',
    })
    try:
        req = urllib.request.Request(f'{ARCGIS_URL}?{params}', headers={'User-Agent': 'JCImpact/2.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read())
        for c in data.get('candidates', []):
            score = c.get('score', 0)
            loc = c.get('location') or {}
            lat, lng = loc.get('y'), loc.get('x')
            if score >= MIN_SCORE and lat and lng and in_jc(lat, lng):
                return lat, lng, score, (c.get('attributes') or {}).get('Addr_type', '')
    except Exception as e:
        print(f'    ArcGIS error: {e}')
    return None, None, 0, ''


_DISTRICTS_CACHE = None
def load_districts():
    global _DISTRICTS_CACHE
    if _DISTRICTS_CACHE is not None: return _DISTRICTS_CACHE
    src = (ROOT / 'src' / 'data' / 'boundaryData.ts').read_text()
    m = re.search(r'districtGeoJSON\s*(?::\s*[^=]+)?\s*=\s*', src)
    start = m.end(); depth = 0; i = start
    while i < len(src):
        ch = src[i]
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: i += 1; break
        i += 1
    _DISTRICTS_CACHE = json.loads(src[start:i])['features']
    return _DISTRICTS_CACHE

def point_in_ring(pt, ring):
    x, y = pt; inside = False; n = len(ring); j = n - 1
    for k in range(n):
        xi, yi = ring[k]; xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = k
    return inside

def point_in_polygon(pt, coords, t):
    if t == 'Polygon':
        if not point_in_ring(pt, coords[0]): return False
        for h in coords[1:]:
            if point_in_ring(pt, h): return False
        return True
    if t == 'MultiPolygon':
        return any(point_in_polygon(pt, p, 'Polygon') for p in coords)
    return False

def district_for(lng, lat):
    for f in load_districts():
        if point_in_polygon((lng, lat), f['geometry']['coordinates'], f['geometry']['type']):
            return f['properties']['name']
    return None


def regenerate_stats(data):
    incidents = data['incidents']
    data['citywide']['totalCrimes'] = len(incidents)
    per_district = defaultdict(int)
    for i in incidents:
        if i['type'] == 'MVA':
            per_district[i['district']] += 1
    for d in data['byDistrict']:
        d['mvas'] = per_district.get(d['district'], 0)
    existing_labels = {m['month']: m['label'] for m in data.get('monthlyTrends', [])}
    by_month = defaultdict(lambda: {'totalCrimes': 0, 'shootings': 0, 'homicides': 0, 'mvas': 0, 'thefts': 0, 'stolenVehicles': 0})
    for i in incidents:
        k = i['date'][:7]
        by_month[k]['totalCrimes'] += 1
        t = i['type']
        if t == 'MVA':                             by_month[k]['mvas'] += 1
        elif t == 'Theft':                         by_month[k]['thefts'] += 1
        elif t == 'Stolen Vehicle':                by_month[k]['stolenVehicles'] += 1
        elif t in ('Shots Fired', 'Shooting Hit'): by_month[k]['shootings'] += 1
    new_trends = []
    for k in sorted(by_month.keys()):
        s = by_month[k]
        new_trends.append({
            'month': k, 'label': existing_labels.get(k, k),
            'totalCrimes': s['totalCrimes'], 'shootings': s['shootings'],
            'homicides': s['homicides'], 'mvas': s['mvas'],
            'thefts': s['thefts'], 'stolenVehicles': s['stolenVehicles'],
        })
    data['monthlyTrends'] = new_trends


def run(apply: bool):
    # Read CSV
    with CSV_IN.open() as f:
        rows = list(csv.DictReader(f))

    # Parse data.json to figure out which case_numbers are NOT yet imported.
    # Since we don't store case_number in records, we reconstruct coverage by
    # matching the (date, stripped-address) of existing ts3-XXXX rows that we
    # JUST created in the prior batch (ts3-1101..). Anything in the CSV that
    # is NOT already represented by our new batch AND wasn't flagged for skip
    # should be imported now.
    data = json.loads(DATA_JSON.read_text())

    # Every existing Traffic Stop — used to find the next free id
    max_ts3 = 0
    existing_fresh_batch_keys: set[tuple[str, str]] = set()
    for i in data['incidents']:
        if i['type'] != 'Traffic Stop': continue
        m = re.match(r'ts3-(\d+)$', i['id'])
        if m:
            n = int(m.group(1))
            max_ts3 = max(max_ts3, n)
            if n >= 1101:  # our week-16 batch starts at 1101
                existing_fresh_batch_keys.add((i['date'], i['address'].upper()))

    print(f'Existing ts3- IDs go up to: ts3-{max_ts3:04d}')
    print(f'Records already imported in our wk16 batch: {len(existing_fresh_batch_keys)}')

    # Cache
    try:
        cache = json.loads(CACHE_FILE.read_text())
    except Exception:
        cache = {}

    to_add = []
    skipped = []
    failed = []
    next_id = max_ts3 + 1
    api_calls = 0
    cache_hits = 0

    for r in rows:
        raw = r['raw_location']
        dt  = r['date']
        case = r['case_number']

        # Review handling
        if r['needs_review'].lower() == 'true':
            if raw in SKIP_ON_REVIEW:
                skipped.append({'case': case, 'raw': raw, 'reason': 'ambiguous (MLK/ALA)'})
                continue
            if raw in REVIEW_FIXES:
                geocode_query = REVIEW_FIXES[raw]
            else:
                skipped.append({'case': case, 'raw': raw, 'reason': 'unhandled review'})
                continue
        else:
            geocode_query = r['geocode_query']

        # If this (date, stripped-address) was already imported in our wk16 batch, skip
        stored_addr = strip_city(raw).upper()
        if (dt, stored_addr) in existing_fresh_batch_keys:
            # Already added in the previous run — but this is a NEW stop if time
            # differs. The prior-run dedupe was too strict. Re-add as new.
            # We'll still let it through since we're intentionally re-adding.
            pass

        # But only re-add records NOT already in our batch (avoid double-adding).
        # We use case_number uniqueness implicitly: each CSV row is a separate
        # incident. Our prior run added 78 of them; this run adds the other ~20.
        # The detection is: if (dt, stored_addr) is in existing_fresh_batch_keys,
        # ALL previous matches at that key counted for one case. So for the 2nd,
        # 3rd etc entries in the CSV at that same key, they go through here.
        # We dedupe by (case_number, date, addr) — if an intra-batch match with
        # the same case_number was already represented, skip. But since
        # case_number is unique per row in the CSV, we don't actually need that.

        # Geocode
        cache_key = geocode_query.lower().strip()
        hit = cache.get(cache_key)
        if hit:
            lat, lng = hit['lat'], hit['lng']
            cache_hits += 1
        else:
            if not apply:
                failed.append({'case': case, 'query': geocode_query, 'reason': 'dry-run'})
                continue
            lat, lng, score, addr_type = arcgis_geocode(geocode_query)
            api_calls += 1
            time.sleep(0.25)
            if not (lat and lng):
                failed.append({'case': case, 'query': geocode_query, 'reason': 'no JC match'})
                continue
            cache[cache_key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type, 'cached_at': '2026-04-21'}

        dist = district_for(lng, lat)
        if not dist:
            failed.append({'case': case, 'query': geocode_query, 'reason': 'outside all districts'})
            continue

        to_add.append({
            'case_number': case,
            'raw': raw,
            'stored_addr': stored_addr,
            'lat': lat, 'lng': lng, 'date': dt, 'district': dist,
        })

    # Now figure out which of `to_add` are NEW (not in the prior batch).
    # Count how many times each (date, stored_addr) already appears in our batch.
    from collections import Counter
    fresh_coverage = Counter(existing_fresh_batch_keys)
    # Actually `existing_fresh_batch_keys` is a SET, so each (date, addr) is
    # counted once regardless of how many records are at it. Rebuild as Counter:
    fresh_counter: Counter = Counter()
    for i in data['incidents']:
        if i['type'] != 'Traffic Stop': continue
        m = re.match(r'ts3-(\d+)$', i['id'])
        if not m: continue
        if int(m.group(1)) < 1101: continue
        fresh_counter[(i['date'], i['address'].upper())] += 1

    # For each to_add candidate, count how many times its key appears in CSV total,
    # and how many are already covered. Add the difference.
    csv_counts: Counter = Counter()
    for cand in to_add:
        csv_counts[(cand['date'], cand['stored_addr'])] += 1

    # Deterministic ordering: iterate in original CSV order
    final_add = []
    already_counted: Counter = Counter()
    for cand in to_add:
        key = (cand['date'], cand['stored_addr'])
        need = csv_counts[key]             # total CSV rows at this key
        have = fresh_counter[key]          # already in our batch
        used = already_counted[key]        # already planned to add in this pass
        if used + have < need:
            # There's still room — add this one
            final_add.append(cand)
            already_counted[key] += 1

    # Build new record rows
    new_records = []
    for cand in final_add:
        rid = f'ts3-{next_id:04d}'
        next_id += 1
        new_records.append({
            'id':       rid,
            'type':     'Traffic Stop',
            'date':     cand['date'],
            'district': cand['district'],
            'lat':      cand['lat'],
            'lng':      cand['lng'],
            'address':  cand['stored_addr'],
        })

    print(f'\nCache hits:       {cache_hits}')
    print(f'API calls:        {api_calls}')
    print(f'Skipped:          {len(skipped)}')
    print(f'Failed:           {len(failed)}')
    print(f'Already in batch: {len(to_add) - len(final_add)}')
    print(f'To add now:       {len(new_records)}')

    for s in skipped:
        print(f'  skipped: {s["case"]}  {s["raw"]!r}  — {s["reason"]}')
    for f in failed:
        print(f'  failed:  {f["case"]}  {f["query"]!r}  — {f["reason"]}')

    if not apply:
        print('\n=== DRY RUN — use --apply')
        return

    from collections import Counter as C
    d_dist = C(r['district'] for r in new_records)
    print(f'\nDistrict distribution of follow-up: {dict(d_dist)}')

    data['incidents'].extend(new_records)
    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    CACHE_FILE.write_text(json.dumps(cache, indent=2, sort_keys=True))
    print(f'\nAdded {len(new_records)} records. New Traffic Stop total: '
          f'{sum(1 for i in data["incidents"] if i["type"] == "Traffic Stop")}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
