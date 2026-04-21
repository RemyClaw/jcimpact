#!/usr/bin/env python3
"""
Import week-16 (4/12–4/18/2026) traffic stops from the CSV export.

Pipeline:
  1. Read /Users/geremy/Downloads/traffic_stops_geocode_5.csv
  2. Drop records flagged needs_review (unless typo is fixable inline).
  3. Skip records duplicating existing Traffic Stops by (date, raw_location).
  4. Use the existing geocode cache first; fall back to ArcGIS.
  5. Assign district by point-in-polygon against boundaryData.ts.
  6. Strip `primary_officer` and internal case_number from output (PII / policy).
  7. Build records with ids ts3-1101…ts3-XXXX, append to data.json.
  8. Regenerate stats.

Usage:
  python3 scripts/mva-import/import_traffic_stops_wk16.py            # dry run
  python3 scripts/mva-import/import_traffic_stops_wk16.py --apply
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
from typing import Optional

ROOT       = Path(__file__).resolve().parents[2]
DATA_JSON  = ROOT / 'src' / 'data' / 'data.json'
CACHE_FILE = ROOT / 'scripts' / 'geocode-cache.json'
CSV_IN     = Path('/Users/geremy/Downloads/traffic_stops_geocode_5.csv')

ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
JC_BOX     = (40.66, 40.77, -74.13, -74.02)
MIN_SCORE  = 75

# Inline typo fixes for review-flagged rows
REVIEW_FIXES = {
    'PAVANIA & SUMMIT, NJ':   'PAVONIA AVE & SUMMIT AVE, JERSEY CITY, NJ',
    # "MLK/ALA" and "GARFILED & WOO" are too ambiguous — skip these
}
SKIP_ON_REVIEW = {'MLK/ALA, NJ', 'GARFILED & WOO, NJ'}


def clean_address_for_geocode(s: str) -> str:
    """Light cleanup for the geocoder query string."""
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def in_jc(lat, lng):
    return JC_BOX[0] <= lat <= JC_BOX[1] and JC_BOX[2] <= lng <= JC_BOX[3]


def arcgis_geocode(address: str):
    params = urllib.parse.urlencode({
        'SingleLine': address, 'outFields': 'Score,Addr_type',
        'maxLocations': 3, 'forStorage': 'false', 'f': 'json',
        'location': '-74.0776,40.7282', 'distance': 20000, 'countryCode': 'USA',
    })
    try:
        req = urllib.request.Request(f'{ARCGIS_URL}?{params}', headers={'User-Agent': 'JCImpact/2.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read())
        for c in data.get('candidates', []):
            score = c.get('score', 0)
            loc = c.get('location') or {}
            lat, lng = loc.get('y'), loc.get('x')
            addr_type = (c.get('attributes') or {}).get('Addr_type', '')
            if score >= MIN_SCORE and lat and lng and in_jc(lat, lng):
                return lat, lng, score, addr_type
    except Exception as e:
        print(f'    ArcGIS error: {e}')
    return None, None, 0, ''


# ── Point-in-polygon (shared with pipeline.py) ────────────────────────────

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


# ── Storage address normalisation (for data.json `address`) ──────────────

def strip_city_suffix(raw: str) -> str:
    """Match existing Traffic Stop address format — no city/state/zip suffix."""
    s = re.sub(r',?\s*JERSEY CITY.*$', '', raw, flags=re.IGNORECASE).strip()
    s = re.sub(r',?\s*NJ\s*\d{5}.*$', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r',\s*NJ\s*$', '', s, flags=re.IGNORECASE).strip()
    return s


def regenerate_stats(data):
    incidents = data['incidents']
    data['citywide']['totalCrimes'] = len(incidents)
    # Only MVA is tracked as its own stat field; stop-level counts go into monthlyTrends totalCrimes
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


# ── Main ─────────────────────────────────────────────────────────────────

def run(apply: bool):
    # Load CSV
    with CSV_IN.open() as f:
        rows = list(csv.DictReader(f))
    print(f'CSV rows: {len(rows)}')

    # Load existing data
    data = json.loads(DATA_JSON.read_text())
    existing_ts_keys = set()
    max_ts3 = 0
    for i in data['incidents']:
        if i['type'] == 'Traffic Stop':
            existing_ts_keys.add((i['date'], strip_city_suffix(i['address']).upper()))
            m = re.match(r'ts3-(\d+)$', i['id'])
            if m:
                max_ts3 = max(max_ts3, int(m.group(1)))
    print(f'Existing Traffic Stops: {sum(1 for i in data["incidents"] if i["type"] == "Traffic Stop")}')
    print(f'Next ts3- id starts at: ts3-{max_ts3 + 1:04d}')

    # Cache
    try:
        cache = json.loads(CACHE_FILE.read_text())
    except Exception:
        cache = {}

    # Process rows
    skipped_review = []
    skipped_dupes  = []
    failed_geocode = []
    new_records    = []
    api_calls      = 0
    cache_hits     = 0

    next_id = max_ts3 + 1

    for r in rows:
        raw = r['raw_location']
        dt  = r['date']

        # Needs-review handling
        if r['needs_review'].lower() == 'true':
            if raw in SKIP_ON_REVIEW:
                skipped_review.append({'case': r['case_number'], 'raw': raw, 'reason': 'ambiguous'})
                continue
            if raw in REVIEW_FIXES:
                geocode_query = REVIEW_FIXES[raw]
            else:
                # Unknown review reason — skip
                skipped_review.append({'case': r['case_number'], 'raw': raw, 'reason': 'unhandled review flag'})
                continue
        else:
            geocode_query = r['geocode_query']

        # Duplicate check against existing Traffic Stops
        stored_addr = strip_city_suffix(raw).upper()
        dedupe_key  = (dt, stored_addr)
        if dedupe_key in existing_ts_keys:
            skipped_dupes.append({'case': r['case_number'], 'date': dt, 'address': stored_addr})
            continue

        # Geocode — cache first
        cache_key = geocode_query.lower().strip()
        hit = cache.get(cache_key)
        if hit:
            lat, lng = hit['lat'], hit['lng']
            cache_hits += 1
        else:
            if not apply:
                # Count would-be calls but don't hit the API on dry-run
                failed_geocode.append({'case': r['case_number'], 'query': geocode_query, 'reason': 'dry-run skipped API'})
                continue
            lat, lng, score, addr_type = arcgis_geocode(clean_address_for_geocode(geocode_query))
            api_calls += 1
            time.sleep(0.25)
            if not (lat and lng):
                failed_geocode.append({'case': r['case_number'], 'query': geocode_query, 'reason': 'no JC match'})
                continue
            cache[cache_key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type, 'cached_at': '2026-04-21'}

        # District via PIP
        dist = district_for(lng, lat)
        if not dist:
            failed_geocode.append({'case': r['case_number'], 'query': geocode_query, 'reason': 'outside all districts'})
            continue

        # Build the record (no officer name, no case_number, matches schema)
        rec_id = f'ts3-{next_id:04d}'
        next_id += 1
        new_records.append({
            'id':       rec_id,
            'type':     'Traffic Stop',
            'date':     dt,
            'district': dist,
            'lat':      lat,
            'lng':      lng,
            'address':  stored_addr,
        })
        # Track to prevent intra-batch duplicates as well
        existing_ts_keys.add(dedupe_key)

    # Report
    print()
    print(f'To import:        {len(new_records)}')
    print(f'Skipped (review): {len(skipped_review)}')
    print(f'Skipped (dupes):  {len(skipped_dupes)}')
    print(f'Failed geocode:   {len(failed_geocode)}')
    print(f'Cache hits:       {cache_hits}')
    print(f'API calls:        {api_calls}')

    if skipped_review:
        print('\nReview-flagged rows skipped:')
        for s in skipped_review: print(f'  {s["case"]}  {s["raw"]!r}  — {s["reason"]}')
    if failed_geocode:
        print('\nFailed geocodes:')
        for s in failed_geocode[:10]: print(f'  {s["case"]}  {s["query"]!r}  — {s["reason"]}')
        if len(failed_geocode) > 10:
            print(f'  ... {len(failed_geocode) - 10} more')

    if not apply:
        print('\n=== DRY RUN — use --apply to write.')
        return

    # District distribution of new records
    from collections import Counter
    d_dist = Counter(r['district'] for r in new_records)
    print('\nDistrict distribution of new Traffic Stops:')
    for k in sorted(d_dist): print(f'  {k:6s}: {d_dist[k]}')

    # Apply: append, regenerate stats, save
    data['incidents'].extend(new_records)
    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    CACHE_FILE.write_text(json.dumps(cache, indent=2, sort_keys=True))
    print(f'\nWrote {DATA_JSON} ({len(new_records)} new Traffic Stops added)')
    print(f'New Traffic Stop total: {sum(1 for i in data["incidents"] if i["type"] == "Traffic Stop")}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
