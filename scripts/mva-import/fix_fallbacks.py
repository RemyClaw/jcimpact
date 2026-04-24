#!/usr/bin/env python3
"""
Fix MVA records that landed on an ArcGIS fallback centroid.

Problem
-------
When addresses like "100 SKYWAY & SAINT PAULS AVE" are geocoded, ArcGIS
often matches "100 SKYWAY" (a valid building) and ignores the cross street,
so every record with "100 SKYWAY & X" lands at the same point regardless of X.

Same pattern for "276 TONNELE AVE", highway milemarks, generic ramps, etc.

Fix
---
Find coords where several DISTINCT cross streets pile onto one point. For
each record on such a coord, retry geocoding with the cross street promoted
to primary (e.g. "SAINT PAULS AVE & PULASKI SKYWAY, JERSEY CITY, NJ").

Accept the new geocode if:
  1) score >= 80
  2) it lands in JC bbox
  3) it's meaningfully different from the original fallback point (>50m away)

Usage:
  python3 scripts/mva-import/fix_fallbacks.py           # dry run
  python3 scripts/mva-import/fix_fallbacks.py --apply
"""
from __future__ import annotations

import argparse
import json
import math
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

ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
JC_BOX = (40.66, 40.77, -74.13, -74.02)
MIN_SCORE = 80

# Primaries that often cause fallback geocoding (highway/bridge/ramp/building
# where ArcGIS falls back instead of honoring the cross street)
AMBIGUOUS_PRIMARY_PATTERNS = [
    r'\b100\s+SKYWAY\b',
    r'\bPULASKI\s+SKYWAY\b',
    r'\bSKYWAY\b',
    r'\b276\s+TONNELE\s+AVE\b',
    r'\bRT\s+7\s+(OFF\s+)?(W\s+)?RAMP\b',
    r'\bROUTE\s+7\s+(OFF\s+)?(W\s+)?RAMP\b',
    r'\bMILE\s+MARK(ER)?\b',
    r'\bEXIT\s+\d+\b',
    r'\bRT\s+139\s+RAMP\b',
    r'\bROUTE\s+139\s+RAMP\b',
    r'\bLOWER\s+RT\s+139\s+RAMP\b',
    r'\bUPPER\s+RT\s+139\s+RAMP\b',
    r'\b(TRUCK\s+)?US\s+1.{0,3}9\s+(N(ORTH)?|S(OUTH)?)?\s*TRUCK\b',
    r'\bRAMP\s+TO\b',
    r'\b(NJ|US)\s+1.{0,3}9\s+(ENTRANCE|EXIT)\s+RAMP\b',
]

# Street name normalization for the cross-street query
STREET_NORMALIZATIONS = [
    (r'\bJFK\s+BLVD\b',                    'Kennedy Boulevard'),
    (r'\bJFK\b',                            'Kennedy Boulevard'),
    (r'\bJOHN F\.?\s+KENNE?DY\s+BLVD\b',   'Kennedy Boulevard'),
    (r'\bJOHN F\.?\s+KENNE?DY\s+BOULEVARD\b', 'Kennedy Boulevard'),
    (r'\bKENNEDY\s+BLVD\b',                 'Kennedy Boulevard'),
    (r'\bMLK\s+DR(IVE)?\b',                 'Martin Luther King Drive'),
    (r'\bMLK\b',                            'Martin Luther King Drive'),
    (r'\bST\s+PAULS\s+AVE\b',               'Saint Pauls Avenue'),
    (r"\bST\.\s*PAUL'?S\s+AVE\b",          'Saint Pauls Avenue'),
    (r'\bWESTSIDE\s+AVE\b',                 'West Side Avenue'),
    (r'\bTONNELLE\s+AVE?\b',                'Tonnele Avenue'),
    (r'\bTONNELE\s+AVE?\b',                 'Tonnele Avenue'),
    (r'\bTONNELLE\s+CIRCLE\b',              'Tonnele Circle'),
]


def normalize_street(s: str) -> str:
    s = s.strip()
    # Drop JERSEY CITY, NJ suffix
    s = re.sub(r',?\s*JERSEY CITY.*$', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r',?\s*NJ\s*\d{5}.*$', '', s, flags=re.IGNORECASE).strip()
    for pat, repl in STREET_NORMALIZATIONS:
        s = re.sub(pat, repl, s, flags=re.IGNORECASE)
    return s.strip()


def is_ambiguous_primary(primary: str) -> bool:
    for pat in AMBIGUOUS_PRIMARY_PATTERNS:
        if re.search(pat, primary, flags=re.IGNORECASE):
            return True
    return False


def split_address(addr: str) -> list[str]:
    parts = [p.strip() for p in addr.split('&')]
    return [p for p in parts if p]


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def in_jc(lat: float, lng: float) -> bool:
    return JC_BOX[0] <= lat <= JC_BOX[1] and JC_BOX[2] <= lng <= JC_BOX[3]


def arcgis_geocode(address: str):
    params = urllib.parse.urlencode({
        'SingleLine':   f'{address}, Jersey City, NJ',
        'outFields':    'Score,Addr_type',
        'maxLocations': 3,
        'forStorage':   'false',
        'f':            'json',
        'location':     '-74.0776,40.7282',
        'distance':     20000,
        'countryCode':  'USA',
    })
    url = f'{ARCGIS_URL}?{params}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'JCImpact/2.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read())
        for c in data.get('candidates', []):
            score = c.get('score', 0)
            loc = c.get('location') or {}
            lat = loc.get('y')
            lng = loc.get('x')
            addr_type = (c.get('attributes') or {}).get('Addr_type', '')
            if score >= MIN_SCORE and lat and lng and in_jc(lat, lng):
                return lat, lng, score, addr_type
    except Exception as e:
        print(f'    ArcGIS error: {e}')
    return None, None, 0, ''


def find_fallback_coords(mvas: list[dict]) -> dict:
    """Identify coords where ≥3 records share a point and at least one has an
    ambiguous primary — likely a fallback centroid."""
    by_coord = defaultdict(list)
    for m in mvas:
        k = (round(m['lat'], 6), round(m['lng'], 6))
        by_coord[k].append(m)

    fallbacks = {}
    for coord, records in by_coord.items():
        if len(records) < 3:
            continue
        # Check if any record has an ambiguous primary
        has_ambiguous = False
        for r in records:
            parts = split_address(r['address'])
            if parts and is_ambiguous_primary(parts[0]):
                has_ambiguous = True
                break
        if has_ambiguous:
            fallbacks[coord] = records
    return fallbacks


def try_requery(address: str, orig_lat: float, orig_lng: float, cache: dict):
    """For an address with an ambiguous primary, retry with cross street first."""
    parts = split_address(address)
    if len(parts) < 2:
        return None

    primary = parts[0]
    cross_parts = [p for p in parts[1:] if not is_ambiguous_primary(p)]
    if not cross_parts:
        return None
    cross = cross_parts[0]

    # Build a cross-street-first query.
    primary_norm = normalize_street(primary)
    cross_norm = normalize_street(cross)

    # If the cross street has a house number, prefer just the cross street
    if re.match(r'^\d+\S*\s+', cross_norm):
        query = cross_norm
    else:
        # "CROSS & PRIMARY" — ArcGIS will treat as intersection
        query = f'{cross_norm} & {primary_norm}'

    key = query.lower()
    if key in cache:
        c = cache[key]
        return (c['lat'], c['lng'], c.get('score', 100), c.get('addr_type', 'cached'), query)

    lat, lng, score, addr_type = arcgis_geocode(query)
    time.sleep(0.25)
    if lat and lng and haversine_m(lat, lng, orig_lat, orig_lng) > 50:
        cache[key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type, 'cached_at': '2026-04-17'}
        return (lat, lng, score, addr_type, query)
    return None


def run(apply: bool):
    data = json.loads(DATA_JSON.read_text())
    mvas = [i for i in data['incidents'] if i['type'] == 'MVA']
    fallbacks = find_fallback_coords(mvas)
    print(f'Found {len(fallbacks)} fallback coord clusters')
    total_on_fallbacks = sum(len(r) for r in fallbacks.values())
    print(f'Records affected: {total_on_fallbacks}\n')

    try:
        cache = json.loads(CACHE_FILE.read_text())
    except Exception:
        cache = {}

    # Also load districts for re-assignment
    districts = load_districts()

    fixed = 0
    unchanged = 0
    moved_out_of_district = 0
    new_by_coord: dict = {}

    for (orig_lat, orig_lng), records in sorted(fallbacks.items()):
        print(f'\nCluster at {orig_lat:.6f}, {orig_lng:.6f}  ({len(records)} records)')
        for r in records:
            parts = split_address(r['address'])
            if not parts or not is_ambiguous_primary(parts[0]):
                continue
            result = try_requery(r['address'], orig_lat, orig_lng, cache) if apply else None
            if result:
                lat, lng, score, addr_type, used_query = result
                new_district = district_for(lng, lat, districts)
                if not new_district:
                    moved_out_of_district += 1
                    print(f'  ✗ {r["id"]} new point outside districts — keeping original')
                    continue
                old_district = r['district']
                r['lat'] = lat
                r['lng'] = lng
                r['district'] = new_district
                fixed += 1
                note = f' ({old_district}→{new_district})' if old_district != new_district else ''
                print(f'  ✓ {r["id"]}  [{score:3.0f}]  "{r["address"]}" → {lat:.5f}, {lng:.5f}{note}')
                print(f'     via query: "{used_query}"')
            elif apply:
                unchanged += 1
                print(f'  — {r["id"]}  "{r["address"]}"  no better candidate')

    print()
    print(f'Fixed:                     {fixed}')
    print(f'Unchanged (no better hit): {unchanged}')
    print(f'New point outside JC:      {moved_out_of_district}')

    if not apply:
        print('\n=== DRY RUN — nothing written. Use --apply to commit changes.')
        return

    # Persist updated cache
    CACHE_FILE.write_text(json.dumps(cache, indent=2, sort_keys=True))

    # Regenerate stats (district totals may have shifted)
    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    print(f'\nSaved {DATA_JSON}')


# ── Helpers cloned from pipeline.py (kept in-sync deliberately) ─────────

def load_districts() -> list:
    src = (ROOT / 'src' / 'data' / 'boundaryData.ts').read_text()
    m = re.search(r'districtGeoJSON\s*(?::\s*[^=]+)?\s*=\s*', src)
    assert m
    start = m.end()
    depth = 0
    i = start
    while i < len(src):
        ch = src[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                i += 1
                break
        i += 1
    fc = json.loads(src[start:i])
    return fc['features']


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def point_in_polygon(pt, coords, geom_type):
    if geom_type == 'Polygon':
        if not point_in_ring(pt, coords[0]):
            return False
        for hole in coords[1:]:
            if point_in_ring(pt, hole):
                return False
        return True
    if geom_type == 'MultiPolygon':
        for poly in coords:
            if point_in_polygon(pt, poly, 'Polygon'):
                return True
    return False


def district_for(lng, lat, districts) -> Optional[str]:
    for f in districts:
        if point_in_polygon((lng, lat), f['geometry']['coordinates'], f['geometry']['type']):
            return f['properties']['name']
    return None


def regenerate_stats(data):
    """Recompute all derived stats — shared helper lives in _stats.py."""
    from _stats import regenerate_stats as _rs
    _rs(data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
