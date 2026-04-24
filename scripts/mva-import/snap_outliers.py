#!/usr/bin/env python3
"""
Snap MVA "outlier" records to the consensus location of their shared
rare-street-name peers.

When the source address contains a rare/unusual street name (e.g.
"GOTHIC KNIGHTS RD" — an NJCU campus road), ArcGIS often fails to
resolve the intersection and falls back to a nearby known point. Some
records land correctly, others land on fallback centroids across town.

Approach:
  1. Find street names that appear in ≥3 MVA addresses.
  2. Cluster the records for each such street by coord proximity.
  3. If one cluster contains the majority (>=60%) of records and others
     are >500m away, snap the outliers to the dominant cluster centroid.

Usage:
  python3 scripts/mva-import/snap_outliers.py           # dry run
  python3 scripts/mva-import/snap_outliers.py --apply
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

ROOT      = Path(__file__).resolve().parents[2]
DATA_JSON = ROOT / 'src' / 'data' / 'data.json'

DOMINANT_MIN_FRACTION = 0.55   # majority — per-record cross-street check filters false positives
OUTLIER_MIN_DIST_M    = 500
STREET_MIN_OCCURRENCES = 3
DOMINANT_MAX_SPAN_M   = 400    # "short street" test — dominant cluster must be compact

# Street names that are TOO common to use for consensus (would cluster all
# records into one blob, not useful). These are long streets spanning the city.
EXCLUDE_COMMON_STREETS = {
    'KENNEDY BLVD', 'MARTIN LUTHER KING DR', 'TONNELE AVE', 'ROUTE 440',
    'ST HWY 440', 'WEST SIDE AVE', 'BERGEN AVE', 'COMMUNIPAW AVE',
    'US 1 9', 'US 1&9', 'ROUTE 139', 'RT 139', 'STATE ROUTE 440',
    'CENTRAL AVE', 'GARFIELD AVE', 'OCEAN AVE', 'GRAND ST', 'NEWARK AVE',
    'PACIFIC AVE', 'SUMMIT AVE', 'PALISADE AVE', 'MARIN BLVD', 'JERSEY AVE',
    'PAVONIA AVE', 'MONTGOMERY ST',
}


def normalize_street(s: str) -> str:
    s = s.strip().upper()
    # Drop leading house numbers
    s = re.sub(r'^\d+\S*\s+', '', s)
    s = re.sub(r',.*$', '', s)
    s = s.rstrip('.,').strip()
    s = re.sub(r'\bAVE(NUE)?\b', 'AVE', s)
    s = re.sub(r'\bST(REET)?\b', 'ST', s)
    s = re.sub(r'\b(BLVD|BOULEVARD)\b', 'BLVD', s)
    s = re.sub(r'\b(DR|DRIVE)\b', 'DR', s)
    s = re.sub(r'\b(RD|ROAD)\b', 'RD', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def streets_in(addr: str) -> list[str]:
    main = re.sub(r',\s*Jersey City.*$', '', addr, flags=re.IGNORECASE).strip()
    parts = [p.strip() for p in main.split('&')]
    out = []
    for p in parts:
        norm = normalize_street(p)
        if norm and len(norm) > 1:
            out.append(norm)
    return out


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def cluster_points(records: list[dict], radius_m: float = 200) -> list[list[dict]]:
    """Simple greedy clustering — assign each record to the first cluster
    whose centroid is within radius_m, else start a new cluster."""
    clusters: list[list[dict]] = []
    for r in records:
        placed = False
        for c in clusters:
            # centroid of cluster so far
            lat0 = sum(x['lat'] for x in c) / len(c)
            lng0 = sum(x['lng'] for x in c) / len(c)
            if haversine_m(r['lat'], r['lng'], lat0, lng0) <= radius_m:
                c.append(r); placed = True; break
        if not placed:
            clusters.append([r])
    return clusters


def centroid(c: list[dict]) -> tuple[float, float]:
    return (sum(x['lat'] for x in c) / len(c), sum(x['lng'] for x in c) / len(c))


def run(apply: bool):
    data = json.loads(DATA_JSON.read_text())
    mvas = [i for i in data['incidents'] if i['type'] == 'MVA']

    # Map normalized street name → records containing it
    street_to_records = defaultdict(list)
    for m in mvas:
        for s in streets_in(m['address']):
            street_to_records[s].append(m)

    print(f'Scanning {len(mvas)} MVAs across {len(street_to_records)} unique street names')

    # Only look at rare streets (strong consensus signal)
    candidates = {s: rs for s, rs in street_to_records.items()
                  if s not in EXCLUDE_COMMON_STREETS and len(rs) >= STREET_MIN_OCCURRENCES}
    print(f'Rare street candidates (>=3 uses, not common street): {len(candidates)}\n')

    fixed = 0
    for street, records in sorted(candidates.items()):
        # Dedupe by id (same record may appear for both streets in an intersection)
        unique_records = list({r['id']: r for r in records}.values())
        clusters = cluster_points(unique_records, radius_m=200)
        if len(clusters) < 2:
            continue

        # Find the dominant cluster
        clusters.sort(key=len, reverse=True)
        dominant = clusters[0]
        if len(dominant) / len(unique_records) < DOMINANT_MIN_FRACTION:
            continue
        if len(dominant) < 3:
            continue

        # Require the dominant cluster to be tightly packed. If it spans more
        # than DOMINANT_MAX_SPAN_M, the street is too long for consensus to
        # be meaningful (different intersections along the same street are
        # legitimately far apart).
        max_span = 0.0
        for i, r1 in enumerate(dominant):
            for r2 in dominant[i+1:]:
                d = haversine_m(r1['lat'], r1['lng'], r2['lat'], r2['lng'])
                if d > max_span:
                    max_span = d
        if max_span > DOMINANT_MAX_SPAN_M:
            continue

        lat0, lng0 = centroid(dominant)

        # Check outliers in other clusters. An outlier is only snapped if its
        # *current* coord is missing peers for one of its cross streets — which
        # indicates ArcGIS fell back to a different street without honoring
        # the full intersection.
        outliers_fixed = []
        for c in clusters[1:]:
            for r in c:
                dist = haversine_m(r['lat'], r['lng'], lat0, lng0)
                if dist < OUTLIER_MIN_DIST_M:
                    continue

                # Does the outlier's current location have peers for BOTH of
                # its cross streets? If yes, it's probably at a legitimate
                # different intersection.
                my_streets = streets_in(r['address'])
                if len(my_streets) < 2:
                    continue  # single-street address, no cross-street signal
                all_streets_have_peers = True
                for s in my_streets:
                    peers_for_s = [x for x in street_to_records.get(s, [])
                                   if x['id'] != r['id']
                                   and haversine_m(r['lat'], r['lng'], x['lat'], x['lng']) < 150]
                    if not peers_for_s:
                        all_streets_have_peers = False
                        break
                if all_streets_have_peers:
                    continue  # both cross streets are represented here → legit

                outliers_fixed.append((dist, r))

        if not outliers_fixed:
            continue

        print(f'Street "{street}": {len(unique_records)} records — dominant cluster has {len(dominant)} at {lat0:.5f}, {lng0:.5f}')
        for dist, r in outliers_fixed:
            print(f'  ✗ {r["id"]}  "{r["address"]}"  at {r["lat"]:.5f}, {r["lng"]:.5f}  ({dist:.0f}m away)')
            if apply:
                r['lat'] = lat0
                r['lng'] = lng0
                # Recompute district
                new_d = district_for(lng0, lat0, load_districts())
                if new_d:
                    old_d = r['district']
                    if old_d != new_d:
                        print(f'       district: {old_d} → {new_d}')
                    r['district'] = new_d
                fixed += 1
        print()

    print(f'{"Would fix" if not apply else "Fixed"}: {fixed} records')

    if not apply:
        print('\n=== DRY RUN — use --apply to commit changes.')
        return

    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    print(f'Saved {DATA_JSON}')


# ── Helpers ───────────────────────────────────────────────────────────────

_DISTRICTS_CACHE: Optional[list] = None

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
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
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


def district_for(lng, lat, districts):
    for f in districts:
        if point_in_polygon((lng, lat), f['geometry']['coordinates'], f['geometry']['type']):
            return f['properties']['name']
    return None


def regenerate_stats(data):
    """Recompute all derived stats — shared helper lives in _stats.py."""
    from _stats import regenerate_stats as _rs
    _rs(data)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    run(apply=args.apply)


if __name__ == '__main__':
    sys.exit(main() or 0)
