#!/usr/bin/env python3
"""
Import week-16 (4/12–4/18/2026) MVA crashes from crashes_week16_geocode_4.csv.

Schema matches existing MVAs in data.json:
  id:       mva-26-XXXXXX  (from source case number)
  type:     MVA
  date:     YYYY-MM-DD
  district: assigned via point-in-polygon against boundaryData.ts
  lat, lng: from ArcGIS geocode (cache first)
  address:  "ROAD & CROSS" (or "ROAD" if no cross) — strip city/state/zip

Dedup:
  by case_number (via id uniqueness). Same-address-same-date is NOT treated
  as a duplicate — multiple crashes can occur at the same intersection.

Usage:
  python3 scripts/mva-import/import_crashes_wk16.py            # dry run
  python3 scripts/mva-import/import_crashes_wk16.py --apply
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
from collections import defaultdict, Counter
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[2]
DATA_JSON  = ROOT / 'src' / 'data' / 'data.json'
CACHE_FILE = ROOT / 'scripts' / 'geocode-cache.json'
CSV_IN     = Path('/Users/geremy/Downloads/crashes_week16_geocode_4.csv')

ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
JC_BOX     = (40.66, 40.77, -74.13, -74.02)
MIN_SCORE  = 75


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


# Point-in-polygon district assignment
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


def build_stored_address(row: dict) -> str:
    """Mirror existing MVA address style: 'ROAD & CROSS' (no city suffix)."""
    road = (row.get('road') or '').strip()
    cross = (row.get('cross') or '').strip()
    if road and cross:
        return f'{road} & {cross}'
    return road or cross


def regenerate_stats(data):
    incidents = data['incidents']
    data['citywide']['totalCrimes'] = len(incidents)
    data['citywide']['mvas']        = sum(1 for i in incidents if i['type'] == 'MVA')
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
    with CSV_IN.open() as f:
        rows = list(csv.DictReader(f))
    # Drop blank trailing row(s)
    rows = [r for r in rows if r.get('case_number')]
    print(f'CSV rows: {len(rows)}')

    data = json.loads(DATA_JSON.read_text())
    existing_ids = {i['id'] for i in data['incidents']}
    existing_mvas = sum(1 for i in data['incidents'] if i['type'] == 'MVA')
    print(f'Existing MVAs: {existing_mvas}')

    try:
        cache = json.loads(CACHE_FILE.read_text())
    except Exception:
        cache = {}

    to_add    = []
    skipped_existing = 0
    failed    = []
    api_calls = 0
    cache_hits = 0

    for r in rows:
        case = r['case_number'].strip()
        rid  = f'mva-{case}'
        if rid in existing_ids:
            skipped_existing += 1
            continue

        geocode_query = (r.get('geocode_query') or '').strip()
        if not geocode_query:
            failed.append({'case': case, 'reason': 'empty geocode_query'})
            continue

        cache_key = geocode_query.lower().strip()
        hit = cache.get(cache_key)
        if hit:
            lat, lng = hit['lat'], hit['lng']
            cache_hits += 1
        else:
            if not apply:
                failed.append({'case': case, 'query': geocode_query, 'reason': 'dry-run (would call API)'})
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
            'id':       rid,
            'type':     'MVA',
            'date':     r['date'],
            'district': dist,
            'lat':      lat,
            'lng':      lng,
            'address':  build_stored_address(r),
        })

    print(f'\nCache hits:        {cache_hits}')
    print(f'API calls:         {api_calls}')
    print(f'Skipped (existing):{skipped_existing}')
    print(f'Failed geocode:    {len(failed)}')
    print(f'To import:         {len(to_add)}')

    for f_ in failed[:10]:
        print(f'  failed: {f_["case"]}  {f_.get("query","")!r}  — {f_["reason"]}')
    if len(failed) > 10:
        print(f'  ... {len(failed) - 10} more')

    if not apply:
        print('\n=== DRY RUN — use --apply')
        return

    d_dist = Counter(r['district'] for r in to_add)
    d_date = Counter(r['date'] for r in to_add)
    print(f'\nDistrict split: {dict(d_dist)}')
    print(f'By date:')
    for k in sorted(d_date): print(f'  {k}: {d_date[k]}')

    data['incidents'].extend(to_add)
    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    CACHE_FILE.write_text(json.dumps(cache, indent=2, sort_keys=True))
    print(f'\nNew MVA total: {sum(1 for i in data["incidents"] if i["type"] == "MVA")}')
    print(f'Saved {DATA_JSON}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
