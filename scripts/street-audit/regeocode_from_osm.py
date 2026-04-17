#!/usr/bin/env python3
"""
Re-geocode suspicious MVA records by finding the ACTUAL geometric
intersection of the two named streets in OSM.

Pipeline:
  1. Load scripts/street-audit/suspicious.json (output of validator).
  2. For each record, parse address → cross streets.
  3. Look up each street's OSM polyline segments.
  4. Compute all segment-segment intersections between the two streets.
  5. If there's ≥1 intersection: snap the record to the one closest to
     the original coord (preserves rough neighborhood, fixes precision).
  6. If no intersection exists (streets don't cross) OR a street is missing
     from OSM: remove the record.
  7. Reassign district via point-in-polygon.
  8. Regenerate summary stats.

Usage:
  python3 scripts/street-audit/regeocode_from_osm.py           # dry run
  python3 scripts/street-audit/regeocode_from_osm.py --apply
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

ROOT        = Path(__file__).resolve().parents[2]
DATA_JSON   = ROOT / 'src' / 'data' / 'data.json'
OSM_FILE    = ROOT / 'scripts' / 'street-audit' / 'jc-osm-streets.json'
SUSPICIOUS  = ROOT / 'scripts' / 'street-audit' / 'suspicious.json'
REPORT      = ROOT / 'scripts' / 'street-audit' / 'regeocode-report.json'

# Import the shared name normalization from the validator
sys.path.insert(0, str(Path(__file__).parent))
from validate_against_osm import norm, streets_in_address  # noqa: E402


def load_osm_index():
    with open(OSM_FILE) as f:
        data = json.load(f)
    by_name: dict[str, list] = defaultdict(list)
    for e in data.get('elements', []):
        tags = e.get('tags') or {}
        name = tags.get('name') or tags.get('ref')
        if not name:
            continue
        geom = e.get('geometry')
        if not geom:
            continue
        points = [(p['lon'], p['lat']) for p in geom]
        key = norm(name)
        if key:
            by_name[key].append(points)
        for alt_key in ('alt_name', 'name_1', 'ref', 'official_name'):
            alt = tags.get(alt_key)
            if alt:
                na = norm(alt)
                if na and na != key:
                    by_name[na].append(points)
    return by_name


def segment_intersection(p1, p2, p3, p4) -> Optional[tuple]:
    """
    Return the intersection point of segments p1->p2 and p3->p4, or None.
    Uses 2D parametric intersection in lng/lat space (accurate enough for
    short segments at this latitude).
    """
    x1, y1 = p1; x2, y2 = p2
    x3, y3 = p3; x4, y4 = p4
    denom = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if abs(denom) < 1e-14:
        return None  # parallel
    t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / denom
    u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / denom
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


def find_intersections(ways_a: list, ways_b: list) -> list[tuple[float, float]]:
    """All geometric intersection points between a list of street A polylines
    and a list of street B polylines."""
    points = []
    for a_way in ways_a:
        for i in range(len(a_way) - 1):
            a_seg = (a_way[i], a_way[i + 1])
            a_xmin = min(a_seg[0][0], a_seg[1][0]); a_xmax = max(a_seg[0][0], a_seg[1][0])
            a_ymin = min(a_seg[0][1], a_seg[1][1]); a_ymax = max(a_seg[0][1], a_seg[1][1])
            for b_way in ways_b:
                for j in range(len(b_way) - 1):
                    b_seg = (b_way[j], b_way[j + 1])
                    b_xmin = min(b_seg[0][0], b_seg[1][0]); b_xmax = max(b_seg[0][0], b_seg[1][0])
                    b_ymin = min(b_seg[0][1], b_seg[1][1]); b_ymax = max(b_seg[0][1], b_seg[1][1])
                    if a_xmax < b_xmin or b_xmax < a_xmin or a_ymax < b_ymin or b_ymax < a_ymin:
                        continue
                    hit = segment_intersection(*a_seg, *b_seg)
                    if hit:
                        points.append(hit)
    deduped = []
    for p in points:
        if not any(abs(p[0]-q[0]) < 1e-4 and abs(p[1]-q[1]) < 1e-4 for q in deduped):
            deduped.append(p)
    return deduped


def find_near_intersections(ways_a: list, ways_b: list, max_gap_m: float = 40) -> list[tuple[float, float]]:
    """
    Fallback: find midpoints between ways A and B that come within max_gap_m.
    Handles OSM data gaps where streets meet but aren't geometrically connected.
    """
    near_points = []
    for a_way in ways_a:
        for a_pt in a_way:
            for b_way in ways_b:
                for b_pt in b_way:
                    d = haversine_m(a_pt[1], a_pt[0], b_pt[1], b_pt[0])
                    if d < max_gap_m:
                        mid = ((a_pt[0] + b_pt[0]) / 2, (a_pt[1] + b_pt[1]) / 2)
                        near_points.append(mid)
    deduped = []
    for p in near_points:
        if not any(abs(p[0]-q[0]) < 1e-4 and abs(p[1]-q[1]) < 1e-4 for q in deduped):
            deduped.append(p)
    return deduped


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


# ── District assignment (copied from pipeline.py) ────────────────────────

_DISTRICTS_CACHE = None

def load_districts():
    global _DISTRICTS_CACHE
    if _DISTRICTS_CACHE is not None:
        return _DISTRICTS_CACHE
    src = (ROOT / 'src' / 'data' / 'boundaryData.ts').read_text()
    m = re.search(r'districtGeoJSON\s*(?::\s*[^=]+)?\s*=\s*', src)
    start = m.end()
    depth = 0; i = start
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
        xi, yi = ring[k][0], ring[k][1]
        xj, yj = ring[j][0], ring[j][1]
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
        for p in coords:
            if point_in_polygon(pt, p, 'Polygon'): return True
    return False


def district_for(lng, lat):
    for f in load_districts():
        if point_in_polygon((lng, lat), f['geometry']['coordinates'], f['geometry']['type']):
            return f['properties']['name']
    return None


# ── Main ─────────────────────────────────────────────────────────────────

def regenerate_stats(data):
    incidents = data['incidents']
    data['citywide']['mvas'] = sum(1 for i in incidents if i['type'] == 'MVA')
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
        new_trends.append({'month': k, 'label': existing_labels.get(k, k),
                           'totalCrimes': s['totalCrimes'], 'shootings': s['shootings'],
                           'homicides': s['homicides'], 'mvas': s['mvas'],
                           'thefts': s['thefts'], 'stolenVehicles': s['stolenVehicles']})
    data['monthlyTrends'] = new_trends


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    suspicious = json.loads(SUSPICIOUS.read_text())
    print(f'{len(suspicious)} suspicious records to process\n')

    osm_index = load_osm_index()
    print(f'OSM streets indexed: {len(osm_index)} names\n')

    with open(DATA_JSON) as f:
        data = json.load(f)
    incidents_by_id = {i['id']: i for i in data['incidents']}

    snapped = []
    removed_no_intersection = []
    removed_unknown_street = []
    unchanged = []

    for s in suspicious:
        m = incidents_by_id.get(s['id'])
        if not m:
            continue
        streets = streets_in_address(m['address'])
        if len(streets) < 2:
            unchanged.append(m); continue

        # Need at least 2 streets present in OSM
        known = [x for x in streets if x in osm_index]
        if len(known) < 2:
            # one or more streets missing → can't compute a true intersection
            removed_unknown_street.append({
                'id': m['id'], 'address': m['address'],
                'missing_streets': [x for x in streets if x not in osm_index],
            })
            continue

        pts = find_intersections(osm_index[known[0]], osm_index[known[1]])
        fallback_used = False
        if not pts:
            # Try fallback: streets come within 40m (OSM data gap, but real intersection)
            pts = find_near_intersections(osm_index[known[0]], osm_index[known[1]], max_gap_m=40)
            if pts:
                fallback_used = True
        if not pts:
            removed_no_intersection.append({
                'id': m['id'], 'address': m['address'], 'streets': known,
            })
            continue

        # Pick intersection closest to the original (likely-wrong) coord to
        # at least stay in the correct neighborhood
        pts_scored = sorted(pts, key=lambda p: haversine_m(m['lat'], m['lng'], p[1], p[0]))
        new_lng, new_lat = pts_scored[0]
        new_district = district_for(new_lng, new_lat)
        if not new_district:
            removed_no_intersection.append({
                'id': m['id'], 'address': m['address'],
                'reason': 'new_point_outside_all_districts',
            })
            continue

        snapped.append({
            'id':            m['id'],
            'address':       m['address'],
            'old_lat':       m['lat'],
            'old_lng':       m['lng'],
            'old_district':  m['district'],
            'new_lat':       new_lat,
            'new_lng':       new_lng,
            'new_district':  new_district,
            'intersections_found': len(pts),
            'fallback_used':  fallback_used,
        })

        if args.apply:
            m['lat']      = new_lat
            m['lng']      = new_lng
            m['district'] = new_district

    # Remove records slated for removal
    to_remove_ids = {r['id'] for r in removed_no_intersection} | {r['id'] for r in removed_unknown_street}
    if args.apply:
        data['incidents'] = [i for i in data['incidents'] if i['id'] not in to_remove_ids]
        regenerate_stats(data)
        DATA_JSON.write_text(json.dumps(data))

    # Report
    print(f'Snapped to OSM intersection: {len(snapped)}')
    print(f'Removed (no OSM intersection): {len(removed_no_intersection)}')
    print(f'Removed (street not in OSM):   {len(removed_unknown_street)}')
    print(f'Unchanged (only one street):   {len(unchanged)}')

    print('\n── Sample of snapped records ──')
    for s in snapped[:10]:
        old_new = f'{s["old_lat"]:.5f},{s["old_lng"]:.5f} → {s["new_lat"]:.5f},{s["new_lng"]:.5f}'
        d_note = f' ({s["old_district"]}→{s["new_district"]})' if s['old_district'] != s['new_district'] else ''
        print(f'  ✓ {s["id"]}  "{s["address"]}"')
        print(f'      {old_new}{d_note}  [{s["intersections_found"]} intersections]')

    print('\n── Sample of removed (no intersection) ──')
    for r in removed_no_intersection[:10]:
        print(f'  ✗ {r["id"]}  "{r["address"]}"')

    print('\n── Sample of removed (unknown street) ──')
    for r in removed_unknown_street[:10]:
        print(f'  ✗ {r["id"]}  "{r["address"]}"  missing: {r.get("missing_streets", "?")}')

    if args.apply:
        REPORT.write_text(json.dumps({
            'snapped': snapped,
            'removed_no_intersection': removed_no_intersection,
            'removed_unknown_street': removed_unknown_street,
        }, indent=2))
        print(f'\nWrote {REPORT}')
        print(f'\nNew citywide.mvas: {data["citywide"]["mvas"]}')
        for b in data['byDistrict']:
            print(f'  {b["district"]:6s}: {b["mvas"]}')
    else:
        print('\n=== DRY RUN — use --apply to commit changes.')


if __name__ == '__main__':
    sys.exit(main() or 0)
