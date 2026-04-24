#!/usr/bin/env python3
"""
Remove MVA records whose source address is only a road name (no house
number, no cross street). These get geocoded to an arbitrary midpoint
of the street and are misleading on the map.

Usage:
  python3 scripts/mva-import/remove_imprecise.py           # dry run
  python3 scripts/mva-import/remove_imprecise.py --apply
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT      = Path(__file__).resolve().parents[2]
DATA_JSON = ROOT / 'src' / 'data' / 'data.json'


def is_road_only(addr: str) -> bool:
    """
    True if the address is JUST a road name — no house number, no cross street.
    The trailing ", Jersey City, NJ ..." is stripped before checking, but NOT
    when the first token IS "Jersey City" (as in "Jersey City Blvd").
    """
    # Strip ", Jersey City, NJ ..." suffix only when it's preceded by a comma
    # (otherwise it's part of the street name like "Jersey City Blvd").
    main = re.sub(r',\s*Jersey City.*$', '', addr, flags=re.IGNORECASE).strip()
    # Also strip common ", NJ zzzzz" suffix
    main = re.sub(r',\s*NJ\s*\d{5}.*$', '', main, flags=re.IGNORECASE).strip()

    has_house     = re.match(r'^\d+\S*\s+\w', main) is not None
    has_intersect = '&' in main

    return not has_house and not has_intersect


def run(apply: bool):
    data = json.loads(DATA_JSON.read_text())
    incidents = data['incidents']

    to_remove = []
    keep = []
    for i in incidents:
        if i.get('type') == 'MVA' and is_road_only(i['address']):
            to_remove.append(i)
        else:
            keep.append(i)

    print(f'Scanning {len(incidents)} incidents')
    print(f'Road-only MVAs to remove: {len(to_remove)}')
    for r in to_remove:
        print(f'  {r["id"]:20s}  {r["date"]}  {r["district"]:6s}  "{r["address"]}"')

    if not apply:
        print('\n=== DRY RUN — nothing written. Use --apply to commit.')
        return

    data['incidents'] = keep
    regenerate_stats(data)
    DATA_JSON.write_text(json.dumps(data))
    print(f'\nRemoved {len(to_remove)} records.')
    print(f'New totals — citywide.mvas = {data["citywide"]["mvas"]}')
    for d in data['byDistrict']:
        print(f'  byDistrict.{d["district"]:6s}.mvas = {d["mvas"]}')


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
