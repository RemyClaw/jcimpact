#!/usr/bin/env python3
"""
Full MVA import pipeline for January + February 2026.

1. Read parsed records (scripts/mva-import/records.json from extract.py).
2. Normalize each address the same way the main geocoder does.
3. Try the existing geocode-cache.json first; only hit ArcGIS on misses.
4. Assign district via point-in-polygon against boundaryData.ts polygons.
5. Merge records into src/data/data.json as typed MVA incidents.
6. Regenerate citywide.mvas, byDistrict.*.mvas, and monthlyTrends.

Run:
  python3 scripts/mva-import/pipeline.py            # dry run (no API calls)
  python3 scripts/mva-import/pipeline.py --apply    # live run
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Optional, Tuple

ROOT            = Path(__file__).resolve().parents[2]
RECORDS         = ROOT / 'scripts' / 'mva-import' / 'records.json'
DATA_JSON       = ROOT / 'src' / 'data' / 'data.json'
BOUNDARY_FILE   = ROOT / 'src' / 'data' / 'boundaryData.ts'
CACHE_FILE      = ROOT / 'scripts' / 'geocode-cache.json'
REPORT_FILE     = ROOT / 'scripts' / 'mva-import' / 'pipeline-report.json'

ARCGIS_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
JC_BOX     = (40.66, 40.77, -74.13, -74.02)  # lat_min, lat_max, lng_min, lng_max
MIN_SCORE  = 75

# Same normalization as scripts/geocode_arcgis.py (keeps results consistent)
ABBREVS = [
    (r'\bST HWY 440 S\b',          'Route 440 South'),
    (r'\bST HWY 440 N\b',          'Route 440 North'),
    (r'\bST HWY 440\b',            'Route 440'),
    (r'\bHWY 440\b',               'Route 440'),
    (r'\bRT 440 HWY\b',            'Route 440'),
    (r'\bRT 440\b',                'Route 440'),
    (r'\bROUTE 440 SOUTH\b',       'Route 440 South'),
    (r'\bROUTE 440\b',             'Route 440'),
    (r'\bUS 1.{0,3}9 NORTH\b',     'US Route 1 9 North'),
    (r'\bUS 1.{0,3}9 SOUTH\b',     'US Route 1 9 South'),
    (r'\bUS 1.{0,3}9\b',           'US Route 1 9'),
    (r'\bROUTE 1.{0,3}9\b',        'US Route 1 9'),
    (r'\bRT 1.{0,3}9\b',           'US Route 1 9'),
    (r'\bNJ ROUTE 1.{0,3}9\b',     'US Route 1 9'),
    (r'\b1.{0,3}9 TONNELE AVE\b',  'Tonnele Avenue'),
    (r'\bLOWER RT 139\b',          'Route 139'),
    (r'\bUPPER RT 139\b',          'Route 139'),
    (r'\bLOWER 139\b',              'Route 139'),
    (r'\bUPPER 139\b',              'Route 139'),
    (r'\bROUTE 139\b',              'Route 139'),
    (r'\bSTATE HWY 139\b',          'Route 139'),
    (r'\bSTATE ROUTE 139\b',        'Route 139'),
    (r'\bRT 139\b',                 'Route 139'),
    (r'\bNJ 139\b',                 'Route 139'),
    (r'\bROUTE 7\b',                'Route 7'),
    (r'\bRT 7\b',                   'Route 7'),
    (r'\bRT 185\b',                 'Route 185'),
    (r'\bROUTE 185\b',              'Route 185'),
    (r'\bPULASKI SKYWAY\b',         'Pulaski Skyway'),
    (r'\bJFK BLVD\b',               'Kennedy Boulevard'),
    (r'\bJFK\b',                    'Kennedy Boulevard'),
    (r'\bJOHN F\.? KENNEDY BLVD\b', 'Kennedy Boulevard'),
    (r'\bJOHN F\.? KENNDEY BLVD\b', 'Kennedy Boulevard'),   # typo in source
    (r'\bJOHN F\.? KENNEDY BOULEVARD\b', 'Kennedy Boulevard'),
    (r'\bKENNEDY BLVD\b',           'Kennedy Boulevard'),
    (r'\bMLK DR(?:IVE)?\b',         'Martin Luther King Drive'),
    (r'\bMLK\b',                    'Martin Luther King Drive'),
    (r'\bTONNELLE AVE\b',           'Tonnele Avenue'),
    (r'\bTONNELE AVE\b',            'Tonnele Avenue'),
    (r'\bTONNELLE CIRCLE\b',        'Tonnele Circle'),
    (r'\bTONNELE CIRCLE\b',         'Tonnele Circle'),
    (r'\bVIRGNIA AVE\b',            'Virginia Avenue'),     # typo in source
    (r'\bST PAULS AVE\b',           'Saint Pauls Avenue'),
    (r"\bST\. PAUL'S AVE\b",        'Saint Pauls Avenue'),
    (r'\bST\. PAULS AVE\b',         'Saint Pauls Avenue'),
    (r'\bWESTSIDE AVE\b',           'West Side Avenue'),
    (r'\bCOMMUNIPAW AVE\b',         'Communipaw Avenue'),
    (r'\bNEWARK AVE\b',             'Newark Avenue'),
    (r'\bMONTGOMERY ST\b',          'Montgomery Street'),
    (r'\bMONMOUTH ST\b',            'Monmouth Street'),
    (r'\bWASHINGTON BLVD\b',        'Washington Boulevard'),
    (r'\bNEWPORT PKWY\b',           'Newport Parkway'),
    (r'\bCOLUMBUS DR(?:IVE)?\b',    'Columbus Drive'),
    (r'\bSECAUCUS RD\b',            'Secaucus Road'),
    (r'\bPATERSON PLANK RD\b',      'Paterson Plank Road'),
    (r'\bGARFIELD AVE\b',           'Garfield Avenue'),
    (r'\bDANFORTH AVE\b',           'Danforth Avenue'),
    (r'\bPORT JERSEY BLVD\b',       'Port Jersey Boulevard'),
    (r'\bRESERVOIR AVE\b',          'Reservoir Avenue'),
    (r'\bPALISADE AVE\b',           'Palisade Avenue'),
    (r'\bSUMMIT AVE\b',             'Summit Avenue'),
    (r'\bPAVONIA AVE\b',            'Pavonia Avenue'),
    (r'\bCENTRAL AVE\b',            'Central Avenue'),
    (r'\bBERGEN AVE\b',             'Bergen Avenue'),
    (r'\bDUNCAN AVE\b',             'Duncan Avenue'),
    (r'\bFULTON AVE\b',             'Fulton Avenue'),
    (r'\bBRAMHALL(?:\s+AVE(?:NUE)?)?\b', 'Bramhall Avenue'),
    (r'\bRAVINE AVE\b',             'Ravine Avenue'),
    (r'\bSHERMAN AVE\b',            'Sherman Avenue'),
    (r'\bZABRISKIE ST\b',           'Zabriskie Street'),
    (r'\bCHARLES ST\b',             'Charles Street'),
    (r'\bJEFFERSON AVE\b',          'Jefferson Avenue'),
    (r'\bWALLIS AVE\b',             'Wallis Avenue'),
    (r'\bHALLECK AVE\b',            'Halleck Avenue'),
    (r'\bBALDWIN AVE\b',            'Baldwin Avenue'),
    (r'\bVIRGINIA AVE\b',           'Virginia Avenue'),
    (r'\bNORTH ST\b',               'North Street'),
    (r'\bIRVING ST\b',              'Irving Street'),
    (r'\bGRANT AVE\b',              'Grant Avenue'),
    (r'\bLEXINGTON AVE\b',          'Lexington Avenue'),
    (r'\bSIP AVE(?:NUE)?\b',        'Sip Avenue'),
    (r'\bCULVER AVE\b',             'Culver Avenue'),
    (r'\bBEACH ST\b',               'Beach Street'),
    (r'\bFLORENCE ST\b',            'Florence Street'),
    (r'\bTHORNE ST\b',              'Thorne Street'),
    (r'\bMARIN BLVD\b',             'Marin Boulevard'),
    (r'\bJERSEY AVE\b',             'Jersey Avenue'),
    (r'\bAVENUE C\b',               'Avenue C'),
    (r'\bMALLORY(?:\s+AVE(?:NUE)?)?\b', 'Mallory Avenue'),
    (r'\bWILKINSON(?:\s+AVE(?:NUE)?)?\b', 'Wilkinson Avenue'),
    (r'\bSTUYVESANT(?:\s+AVE(?:NUE)?)?\b', 'Stuyvesant Avenue'),
    (r'\bCARLTON AVE\b',            'Carlton Avenue'),
    (r'\bPACIFIC AVE\b',            'Pacific Avenue'),
]


def clean_addr(addr: str) -> str:
    """Strip city/state/zip suffix and apply abbreviations."""
    a = re.sub(r',?\s*JERSEY CITY.*$', '', addr, flags=re.IGNORECASE).strip()
    a = re.sub(r',?\s*NJ\s*\d{5}.*$', '', a, flags=re.IGNORECASE).strip()
    # Collapse double `&` from duplicated segments e.g. "MLK DR & MLK DR"
    a = re.sub(r'\s*&\s*', ' & ', a)
    # "STREET A & STREET A" → "STREET A"
    parts = [p.strip() for p in a.split(' & ')]
    seen: list[str] = []
    for p in parts:
        if p and p.upper() not in [s.upper() for s in seen]:
            seen.append(p)
    a = ' & '.join(seen)
    for pat, repl in ABBREVS:
        a = re.sub(pat, repl, a, flags=re.IGNORECASE)
    # Collapse leftover duplications the abbrev pass can leave behind
    a = re.sub(r'\bUS\s+US\b',                 'US',      a, flags=re.IGNORECASE)
    a = re.sub(r'\bAVE(?:NUE)?\s+AVE(?:NUE)?\b', 'Avenue', a, flags=re.IGNORECASE)
    a = re.sub(r'\bSTREET\s+STREET\b',         'Street',  a, flags=re.IGNORECASE)
    a = re.sub(r'\s+', ' ', a).strip()
    return a


def in_jc(lat: float, lng: float) -> bool:
    return JC_BOX[0] <= lat <= JC_BOX[1] and JC_BOX[2] <= lng <= JC_BOX[3]


def arcgis_geocode(address: str) -> Tuple[Optional[float], Optional[float], float, str]:
    params = urllib.parse.urlencode({
        'SingleLine':    f'{address}, Jersey City, NJ',
        'outFields':     'Score,Addr_type',
        'maxLocations':  3,
        'forStorage':    'false',
        'f':             'json',
        'location':      '-74.0776,40.7282',
        'distance':      20000,
        'countryCode':   'USA',
    })
    url = f'{ARCGIS_URL}?{params}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'JCImpact/2.0'})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read())
        for c in data.get('candidates', []):
            score = c.get('score', 0)
            loc   = c.get('location') or {}
            lat   = loc.get('y')
            lng   = loc.get('x')
            addr_type = (c.get('attributes') or {}).get('Addr_type', '')
            if score >= MIN_SCORE and lat and lng and in_jc(lat, lng):
                return lat, lng, score, addr_type
    except Exception as e:
        print(f'    ArcGIS error: {e}')
    return None, None, 0.0, ''


# ── District polygon extraction + point-in-polygon ───────────────────────

def load_districts() -> list[dict]:
    """Parse boundaryData.ts and return the district FeatureCollection's features."""
    src = BOUNDARY_FILE.read_text()
    # Locate `export const districtGeoJSON ... = {...};` — strip TS annotation/type cast
    m = re.search(r'districtGeoJSON\s*(?::\s*[^=]+)?\s*=\s*', src)
    if not m:
        raise RuntimeError('districtGeoJSON export not found')
    start = m.end()
    # Balanced-brace scan to find the end of the literal
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
    raw = src[start:i]
    fc = json.loads(raw)
    return fc['features']


def point_in_ring(pt: Tuple[float, float], ring: list[list[float]]) -> bool:
    """Ray-casting algorithm — returns True if pt (lng, lat) is inside ring."""
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


def point_in_polygon(pt: Tuple[float, float], polygon_coords: list, geom_type: str) -> bool:
    if geom_type == 'Polygon':
        rings = [polygon_coords[0]] + polygon_coords[1:]
        if not point_in_ring(pt, rings[0]):
            return False
        for hole in rings[1:]:
            if point_in_ring(pt, hole):
                return False
        return True
    if geom_type == 'MultiPolygon':
        for poly in polygon_coords:
            if point_in_polygon(pt, poly, 'Polygon'):
                return True
    return False


def district_for(lng: float, lat: float, districts: list[dict]) -> Optional[str]:
    pt = (lng, lat)
    for feat in districts:
        geom = feat['geometry']
        if point_in_polygon(pt, geom['coordinates'], geom['type']):
            return feat['properties']['name']
    return None


# ── Main pipeline ─────────────────────────────────────────────────────────

def load_cache() -> dict:
    try:
        return json.loads(CACHE_FILE.read_text())
    except Exception:
        return {}


def save_cache(cache: dict) -> None:
    CACHE_FILE.write_text(json.dumps(cache, indent=2, sort_keys=True))


def run(apply: bool):
    records = json.loads(RECORDS.read_text())
    print(f'Loaded {len(records)} parsed records')

    districts = load_districts()
    print(f'Loaded {len(districts)} district polygons: ' + ', '.join(f['properties']['name'] for f in districts))

    cache = load_cache()
    cache_hit  = 0
    cache_miss = 0
    api_calls  = 0
    failures: list[dict] = []

    # Map: normalized_address → (lat, lng, score, type)
    geocodes: dict[str, dict] = {}

    # Deduplicate to avoid re-geocoding the same place.
    # Key by the cleaned form; also track a "raw" lowercased form per record so
    # we can hit the existing cache (which was keyed by short abbreviations).
    unique_addrs: dict[str, list[int]] = defaultdict(list)
    raw_keys: dict[str, str] = {}  # cleaned → raw lowercased form for cache lookup
    for i, r in enumerate(records):
        cleaned = clean_addr(r['address_for_geocode'])
        r['cleaned_address'] = cleaned
        raw = re.sub(r',?\s*Jersey City.*$', '', r['address_for_geocode'], flags=re.IGNORECASE).strip().lower()
        unique_addrs[cleaned.lower()].append(i)
        raw_keys[cleaned.lower()] = raw

    print(f'Unique addresses after cleanup: {len(unique_addrs)}')

    for idx, (key, indices) in enumerate(sorted(unique_addrs.items())):
        cleaned = records[indices[0]]['cleaned_address']
        raw_key = raw_keys[key]

        # Try both cleaned and raw keys against the cache
        hit = cache.get(key) or cache.get(raw_key)
        if hit:
            geocodes[key] = {'lat': hit['lat'], 'lng': hit['lng'], 'score': hit.get('score', 100), 'addr_type': hit.get('addr_type', 'cached')}
            cache_hit += 1
            if (idx + 1) % 100 == 0 or idx < 5:
                print(f'[{idx+1:4d}/{len(unique_addrs)}] ✓ cache  {cleaned[:60]}')
            continue

        cache_miss += 1
        if not apply:
            print(f'[{idx+1:4d}/{len(unique_addrs)}] ○ MISS (dry-run)   {cleaned[:60]}')
            continue

        lat, lng, score, addr_type = arcgis_geocode(cleaned)
        api_calls += 1
        time.sleep(0.25)
        if lat and lng:
            geocodes[key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type}
            cache[key] = {'lat': lat, 'lng': lng, 'score': score, 'addr_type': addr_type, 'cached_at': '2026-04-17'}
            print(f'[{idx+1:4d}/{len(unique_addrs)}] ✓ {score:3.0f} [{addr_type:20s}]  {cleaned[:60]}')
        else:
            failures.append({'address': cleaned, 'case_numbers': [records[i]['case_number'] for i in indices]})
            print(f'[{idx+1:4d}/{len(unique_addrs)}] ✗ FAIL                          {cleaned[:60]}')

    if apply:
        save_cache(cache)

    print()
    print(f'Cache hits:    {cache_hit}')
    print(f'Cache misses:  {cache_miss}')
    print(f'API calls:     {api_calls}')
    print(f'Failures:      {len(failures)}')

    if not apply:
        print('\n=== DRY RUN — nothing written. Re-run with --apply to geocode + merge.')
        return

    # ── Build new incident records ──
    new_incidents: list[dict] = []
    unassigned_district = 0
    for r in records:
        key = r['cleaned_address'].lower()
        g = geocodes.get(key)
        if not g:
            continue   # failed geocoding
        dist = district_for(g['lng'], g['lat'], districts)
        if not dist:
            unassigned_district += 1
            continue
        new_incidents.append({
            'id':       f'mva-{r["case_number"]}',
            'type':     'MVA',
            'date':     r['date'],
            'district': dist,
            'lat':      g['lat'],
            'lng':      g['lng'],
            'address':  _pretty_address(r),
        })

    print(f'\nBuilt {len(new_incidents)} MVA incidents')
    print(f'Unassigned district (point outside all polygons): {unassigned_district}')

    # ── Merge into data.json ──
    data = json.loads(DATA_JSON.read_text())
    existing_ids = {i['id'] for i in data['incidents']}
    added = 0
    skipped = 0
    for inc in new_incidents:
        if inc['id'] in existing_ids:
            skipped += 1
            continue
        data['incidents'].append(inc)
        existing_ids.add(inc['id'])
        added += 1

    print(f'Merged into data.json — added {added}, skipped {skipped} (already present)')

    # ── Regenerate stats ──
    regenerate_stats(data)

    DATA_JSON.write_text(json.dumps(data))
    print(f'Wrote {DATA_JSON}')

    # Save a report
    REPORT_FILE.write_text(json.dumps({
        'parsed_records':        len(records),
        'unique_addresses':      len(unique_addrs),
        'cache_hits':            cache_hit,
        'api_calls':             api_calls,
        'geocode_failures':      failures,
        'incidents_added':       added,
        'incidents_skipped':     skipped,
        'unassigned_district':   unassigned_district,
    }, indent=2))


def _pretty_address(r: dict) -> str:
    """Mirror the `address` style the existing MVA records use: "ROAD & CROSS"."""
    road = r['road'].strip()
    cross = r['cross_road'].strip() if r['cross_road'] else ''
    if cross:
        return f'{road} & {cross}'
    return road


def regenerate_stats(data):
    """Recompute all derived stats — shared helper lives in _stats.py."""
    from _stats import regenerate_stats as _rs
    _rs(data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='Actually hit the API + write files')
    args = parser.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
