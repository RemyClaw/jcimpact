#!/usr/bin/env python3
"""
Validate MVA geocoded locations against the OSM street network.

For each MVA record:
  1. Parse its address into street name(s).
  2. Look up each named street in OSM (fuzzy match).
  3. Compute the minimum distance from the geocoded point to any segment of
     each named street.
  4. Flag the record if it's >MAX_DIST_M from ALL segments of its PRIMARY
     cross street (not just the one ArcGIS happened to match).

Output: scripts/street-audit/suspicious.json — list of records that fail
validation, sorted by worst offenders first.

Usage:
  python3 scripts/street-audit/validate_against_osm.py
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT   = Path(__file__).resolve().parents[2]
DATA   = ROOT / 'src' / 'data' / 'data.json'
OSM    = ROOT / 'scripts' / 'street-audit' / 'jc-osm-streets.json'
OUTPUT = ROOT / 'scripts' / 'street-audit' / 'suspicious.json'

# A point is "on" a street if within this distance of its centerline.
MAX_DIST_M = 80

# Name aliases — keys must be in POST-NORMALIZATION form (abbreviations expanded).
ALIASES = {
    'KENNEDY BOULEVARD':                 'JOHN F KENNEDY BOULEVARD',
    'JFK BOULEVARD':                     'JOHN F KENNEDY BOULEVARD',
    'JFK':                               'JOHN F KENNEDY BOULEVARD',
    'JOHN F KENNDEY BOULEVARD':          'JOHN F KENNEDY BOULEVARD',   # typo in source
    'MARTIN LUTHER KING JR DRIVE':       'MARTIN LUTHER KING DRIVE',
    'MLK DRIVE':                         'MARTIN LUTHER KING DRIVE',
    'MLK':                               'MARTIN LUTHER KING DRIVE',
    'TONNELE AVENUE':                    'TONNELLE AVENUE',
    # Route 440 — OSM indexes under "NEW JERSEY 440" (ref normalized)
    'STATE HIGHWAY 440':                 'NEW JERSEY 440',
    'HIGHWAY 440':                       'NEW JERSEY 440',
    'ROUTE 440':                         'NEW JERSEY 440',
    'STATE ROUTE 440':                   'NEW JERSEY 440',
    'NJ ROUTE 440':                      'NEW JERSEY 440',
    'WESTSIDE AVENUE':                   'WEST SIDE AVENUE',
    'STREET PAULS AVENUE':               'SAINT PAULS AVENUE',
    # Route 139 — consolidate all variants under "NEW JERSEY 139"
    'NEW JERSEY ROUTE 139':              'NEW JERSEY 139',
    'ROUTE 139':                         'NEW JERSEY 139',
    'STATE HIGHWAY 139':                 'NEW JERSEY 139',
    'LOWER 139':                         'NEW JERSEY 139',
    'UPPER 139':                         'NEW JERSEY 139',
    'LOWER ROUTE 139':                   'NEW JERSEY 139',
    'UPPER ROUTE 139':                   'NEW JERSEY 139',
    'NEW JERSEY 139 LOWER LEVEL':        'NEW JERSEY 139',
    'NEW JERSEY 139 UPPER LEVEL':        'NEW JERSEY 139',
    'NEW JERSEY 139U':                   'NEW JERSEY 139',
    'I 78;NEW JERSEY 139':               'NEW JERSEY 139',
    'ROUTE 139 (LOWER LEVEL) WESTBOUND': 'NEW JERSEY 139',
    # US Route 1 & 9 — many forms across both OSM (refs) and source data
    'US 1 9':                            'US ROUTE 1 9',
    'US 1&9':                            'US ROUTE 1 9',
    'US HIGHWAY 1 9':                    'US ROUTE 1 9',
    'US HIGHWAY 1':                      'US ROUTE 1 9',
    'ROUTE 1 9':                         'US ROUTE 1 9',
    'ROUTE 1&9':                         'US ROUTE 1 9',
    'US 1 AND 9':                        'US ROUTE 1 9',
    'US 1':                              'US ROUTE 1 9',
    'TRUCK ROUTE 1 9':                   'US ROUTE 1 9',
    'US 1 9 TRUCK':                      'US ROUTE 1 9',
    'US 1 US 9':                         'US ROUTE 1 9',
    'US 1 EXPR US 9 EXPR':               'US ROUTE 1 9',
    'US 1 TRUCK US 9 TRUCK':             'US ROUTE 1 9',
    # Columbus Dr — OSM uses the full name
    'COLUMBUS DRIVE':                    'CHRISTOPHER COLUMBUS DRIVE',
    # Skyway
    'SKYWAY':                            'PULASKI SKYWAY',
    'W SIDE AVENUE':                     'WEST SIDE AVENUE',
}


def norm(s: str) -> str:
    """Normalize a street name for comparison."""
    s = s.upper()
    s = re.sub(r"[.,']", '', s)
    s = re.sub(r'[-;/]', ' ', s)
    # Handle "ST HWY" compound BEFORE generic ST expansion so "ST" doesn't
    # become "STREET" in that specific phrase.
    s = re.sub(r'\bST\s+HWY\b', 'STATE HIGHWAY', s)
    s = re.sub(r'\bST\s+HIGHWAY\b', 'STATE HIGHWAY', s)
    # Also collapse common "& 9" fragments from "US 1&9" splits that happened
    # before this function (the caller doesn't always split on '&' correctly).
    s = re.sub(r'\bAVE(NUE)?\b', 'AVENUE', s)
    s = re.sub(r'\bST(REET)?\b', 'STREET', s)
    s = re.sub(r'\bBLVD\b',      'BOULEVARD', s)
    s = re.sub(r'\bDR(IVE)?\b',  'DRIVE', s)
    s = re.sub(r'\bRD\b',        'ROAD', s)
    s = re.sub(r'\bPKWY\b',      'PARKWAY', s)
    s = re.sub(r'\bHWY\b',       'HIGHWAY', s)
    s = re.sub(r'\bRT\b',        'ROUTE', s)
    s = re.sub(r'\bPL\b',        'PLACE', s)
    s = re.sub(r'\bCIR\b',       'CIRCLE', s)
    s = re.sub(r'\bCT\b',        'COURT', s)
    s = re.sub(r'\bLN\b',        'LANE', s)
    s = re.sub(r'\bSQ\b',        'SQUARE', s)
    s = re.sub(r'\bN\s*J\b',     'NEW JERSEY', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return ALIASES.get(s, s)


def streets_in_address(addr: str) -> list[str]:
    """Parse an MVA address into normalized street name parts (no house #)."""
    main = re.sub(r',\s*Jersey City.*$', '', addr, flags=re.IGNORECASE).strip()
    # Protect "1&9", "1 & 9", "US-1&9" etc so we don't split US Route 1/9 into two pieces
    main = re.sub(r'\bUS[\s-]*1\s*[&]\s*9\b',  'US_ROUTE_ONE_NINE', main, flags=re.IGNORECASE)
    main = re.sub(r'\bROUTE\s*1\s*[&]\s*9\b', 'US_ROUTE_ONE_NINE', main, flags=re.IGNORECASE)
    main = re.sub(r'\b1\s*[&]\s*9\b',          'US_ROUTE_ONE_NINE', main, flags=re.IGNORECASE)
    parts = [p.strip() for p in main.split('&')]
    streets = []
    for p in parts:
        p = p.replace('US_ROUTE_ONE_NINE', 'US ROUTE 1 9')
        # Only strip a leading pure-digit house number (optionally with a single
        # letter suffix like "123A"). Don't strip "6TH" — that's an ordinal.
        p = re.sub(r'^\d+[A-Z]?\s+(?=[A-Z])', '', p)
        n = norm(p)
        if n:
            streets.append(n)
    return streets


# ── Load OSM + build name index ──────────────────────────────────────────

def load_osm_index():
    print('Loading OSM...')
    with open(OSM) as f:
        data = json.load(f)
    by_name: dict[str, list] = defaultdict(list)  # normalized_name → list of [[lng,lat], ...]
    for e in data.get('elements', []):
        tags = e.get('tags') or {}
        name = tags.get('name') or tags.get('ref')
        if not name:
            continue
        geom = e.get('geometry')
        if not geom:
            continue
        n = norm(name)
        if n:
            # Store as list of (lng, lat) tuples
            points = [(p['lon'], p['lat']) for p in geom]
            by_name[n].append(points)
        # Also index by alt_name / ref for highways
        for alt_key in ('alt_name', 'name_1', 'ref', 'official_name'):
            alt = tags.get(alt_key)
            if alt:
                na = norm(alt)
                if na and na != n:
                    by_name[na].append([(p['lon'], p['lat']) for p in geom])
    print(f'  Indexed {len(by_name)} unique street names across {sum(len(v) for v in by_name.values())} way segments')
    return by_name


# ── Distance from point to polyline ──────────────────────────────────────

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def point_to_segment_m(lat: float, lng: float, a: tuple, b: tuple) -> float:
    """
    Minimum distance from (lat, lng) to line segment from a=(lng,lat) to b=(lng,lat).
    Uses flat-earth approximation (accurate enough at JC latitudes).
    """
    # Convert lat/lng degree differences to meters (very rough at this latitude)
    M_PER_DEG_LAT = 111320
    M_PER_DEG_LNG = 111320 * math.cos(math.radians(40.72))

    px = (lng - a[0]) * M_PER_DEG_LNG
    py = (lat - a[1]) * M_PER_DEG_LAT
    bx = (b[0] - a[0]) * M_PER_DEG_LNG
    by = (b[1] - a[1]) * M_PER_DEG_LAT
    seg_len2 = bx*bx + by*by
    if seg_len2 == 0:
        return haversine_m(lat, lng, a[1], a[0])
    t = max(0.0, min(1.0, (px*bx + py*by) / seg_len2))
    cx = t * bx
    cy = t * by
    dx = px - cx
    dy = py - cy
    return math.sqrt(dx*dx + dy*dy)


def min_distance_to_street(lat: float, lng: float, ways: list) -> float:
    """Return minimum distance (m) from point to any segment of any way."""
    best = float('inf')
    for pts in ways:
        for i in range(len(pts) - 1):
            d = point_to_segment_m(lat, lng, pts[i], pts[i+1])
            if d < best:
                best = d
                if best < 5:
                    return best
    return best


# ── Main audit ────────────────────────────────────────────────────────────

def main():
    osm_index = load_osm_index()

    with open(DATA) as f:
        data = json.load(f)
    mvas = [i for i in data['incidents'] if i['type'] == 'MVA']
    print(f'Auditing {len(mvas)} MVA records\n')

    suspicious = []
    unknown_streets = defaultdict(int)
    no_cross = 0

    for m in mvas:
        streets = streets_in_address(m['address'])
        if not streets:
            continue

        # For each cross street, distance from the record's geocoded point to OSM
        distances = {}
        missing = []
        for s in streets:
            ways = osm_index.get(s)
            if not ways:
                unknown_streets[s] += 1
                missing.append(s)
                continue
            distances[s] = min_distance_to_street(m['lat'], m['lng'], ways)

        if not distances:
            # No street in OSM at all — too ambiguous to judge
            continue

        # Find the street closest to where ArcGIS placed the dot
        best_street = min(distances, key=distances.get)
        best_dist   = distances[best_street]
        worst_street = max(distances, key=distances.get) if len(distances) > 1 else best_street
        worst_dist   = distances[worst_street]

        # Flag if the point is close to ONE street but far from ANOTHER named street
        # (classic ArcGIS fallback: matched primary, ignored cross street)
        if best_dist < MAX_DIST_M and worst_dist > 300 and worst_street != best_street:
            suspicious.append({
                'id':            m['id'],
                'address':       m['address'],
                'date':          m['date'],
                'district':      m['district'],
                'lat':           m['lat'],
                'lng':           m['lng'],
                'on_street':     best_street,
                'on_dist_m':     round(best_dist, 1),
                'missing_street': worst_street,
                'missing_dist_m': round(worst_dist, 1),
                'unknown_streets': missing,
                'severity':       round(worst_dist - best_dist),
            })
        # Also flag if ALL named streets are far (>300m) — probably totally misplaced
        elif all(d > 300 for d in distances.values()):
            suspicious.append({
                'id':            m['id'],
                'address':       m['address'],
                'date':          m['date'],
                'district':      m['district'],
                'lat':           m['lat'],
                'lng':           m['lng'],
                'on_street':     None,
                'on_dist_m':     None,
                'missing_street': 'ALL',
                'missing_dist_m': round(min(distances.values()), 1),
                'unknown_streets': missing,
                'severity':       round(min(distances.values())),
            })

    suspicious.sort(key=lambda r: -r['severity'])
    OUTPUT.write_text(json.dumps(suspicious, indent=2))

    print(f'Suspicious records: {len(suspicious)}\n')
    print('Top 20 worst offenders:')
    for r in suspicious[:20]:
        print(f'  {r["severity"]:5d}m  {r["id"]:20s}  "{r["address"]}"')
        if r['on_street']:
            print(f'         on "{r["on_street"]}" ({r["on_dist_m"]}m), but {r["missing_street"]} is {r["missing_dist_m"]}m away')
        else:
            print(f'         no named street within 300m (closest is {r["missing_dist_m"]}m)')

    print()
    print('Top 10 unknown streets (in MVA data but not OSM):')
    for s, n in sorted(unknown_streets.items(), key=lambda x: -x[1])[:10]:
        print(f'  {n:3d}× {s}')

    print(f'\nWrote {OUTPUT}')


if __name__ == '__main__':
    sys.exit(main() or 0)
