#!/usr/bin/env python3
"""
Import week-16 (4/12–4/18/2026) Stolen Vehicles from stolen_vehicles_week16_geocode_1.csv.

PII STRIPPED — the public dataset does NOT carry:
  • license_plate
  • vin
  • license_state
  • vehicle (make/model/year)
  • recovery_note (may contain secondary recovery addresses)
  • status (STOLEN vs RECOVERED — not currently tracked on the dashboard)

Exported fields match the existing Stolen Vehicle schema:
  id:       sv4-XXXX
  type:     Stolen Vehicle
  category: Property Crime
  date:     YYYY-MM-DD
  address:  raw_location (keeping city/state/zip suffix for existing Stolen
            Vehicle records' style)
  district: assigned via point-in-polygon
  lat, lng: from ArcGIS geocode

Dedup:
  Map case_number → sv4 id once committed; re-running this script twice
  in a row won't double-import because we check case_number uniqueness.

Usage:
  python3 scripts/mva-import/import_stolen_vehicles_wk16.py            # dry run
  python3 scripts/mva-import/import_stolen_vehicles_wk16.py --apply
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
CSV_IN     = Path('/Users/geremy/Downloads/stolen_vehicles_week16_geocode_1.csv')

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
    """Recompute all derived stats — shared helper lives in _stats.py."""
    from _stats import regenerate_stats as _rs
    _rs(data)

def run(apply: bool):
    with CSV_IN.open() as f:
        rows = [r for r in csv.DictReader(f) if r.get('case_number')]
    print(f'CSV rows: {len(rows)}')

    data = json.loads(DATA_JSON.read_text())

    # Next sv4- id
    max_sv4 = 0
    for i in data['incidents']:
        m = re.match(r'sv4-(\d+)$', i.get('id', ''))
        if m:
            max_sv4 = max(max_sv4, int(m.group(1)))
    next_id = max_sv4 + 1
    print(f'Next sv4- id starts at: sv4-{next_id:04d}')

    # Load cache
    try:
        cache = json.loads(CACHE_FILE.read_text())
    except Exception:
        cache = {}

    to_add = []
    failed = []
    api_calls = 0
    cache_hits = 0

    for r in rows:
        raw  = r['raw_location'].strip()
        query = r['geocode_query'].strip()
        if not query:
            failed.append({'case': r['case_number'], 'reason': 'empty geocode_query'})
            continue

        cache_key = query.lower().strip()
        hit = cache.get(cache_key)
        if hit:
            lat, lng = hit['lat'], hit['lng']
            cache_hits += 1
        else:
            if not apply:
                failed.append({'case': r['case_number'], 'query': query, 'reason': 'dry-run'})
                continue
            lat, lng, score, addr_type = arcgis_geocode(query)
            api_calls += 1
            time.sleep(0.25)
            if not (lat and lng):
                failed.append({'case': r['case_number'], 'query': query, 'reason': 'no JC match'})
                continue
            cache[cache_key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type, 'cached_at': '2026-04-21'}

        dist = district_for(lng, lat)
        if not dist:
            # Fall back to district_cad if the point-in-polygon fails (edge cases near borders)
            cad = (r.get('district_cad') or '').strip().title()
            if cad in ('North', 'East', 'South', 'West'):
                dist = cad
            else:
                failed.append({'case': r['case_number'], 'query': query, 'reason': 'outside all districts'})
                continue

        # Build record. NO license_plate, VIN, vehicle details, recovery_note.
        to_add.append({
            'id':       f'sv4-{next_id:04d}',
            'type':     'Stolen Vehicle',
            'category': 'Property Crime',
            'date':     r['date'],
            'address':  query,  # already in "ADDRESS, JERSEY CITY, NJ" format
            'district': dist,
            'arrest':   '',
            'lat':      lat,
            'lng':      lng,
        })
        next_id += 1

    print(f'\nCache hits:     {cache_hits}')
    print(f'API calls:      {api_calls}')
    print(f'Failed:         {len(failed)}')
    print(f'To import:      {len(to_add)}')

    for f_ in failed:
        print(f'  failed: {f_["case"]}  {f_.get("query","")!r}  — {f_["reason"]}')

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
    print(f'\nNew Stolen Vehicle total: {sum(1 for i in data["incidents"] if i["type"] == "Stolen Vehicle")}')
    print(f'Saved {DATA_JSON}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
