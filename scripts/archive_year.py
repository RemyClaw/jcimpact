#!/usr/bin/env python3
"""
Year-end rotation: archive the current year's data.json and create a fresh
one for the new year.

Usage:
  python3 scripts/archive_year.py 2026
  python3 scripts/archive_year.py 2026 --apply

What it does:
  1. Copy   src/data/data.json  →  src/data/archive/data-{YEAR}.json
  2. Write  src/data/data.json  as a fresh empty scaffold for {YEAR+1}
  3. Leave src/data/boundaryData.ts unchanged (districts don't change)

Nothing is deleted. Old years live on as static files in src/data/archive/.

Safety:
  • Refuses to overwrite an existing archive file
  • Warns if data.json contains records outside the year you're archiving
  • Dry-run is the default — pass --apply to actually move files
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[1]
DATA_JSON  = ROOT / 'src' / 'data' / 'data.json'
ARCHIVE    = ROOT / 'src' / 'data' / 'archive'

DISTRICTS = ['North', 'East', 'South', 'West']


def empty_scaffold(new_year: int) -> dict:
    """Return a minimal but valid data.json for a fresh year."""
    jan_1 = f'{new_year}-01-01'
    return {
        'meta': {
            'period':      f'YTD {new_year}',
            'generated':   jan_1,
            'source':      'JCPD CompStat / NJ Crash Reports',
            'lastUpdated': jan_1,
        },
        'citywide': {
            'totalCrimes':    0,
            'shootings':      0,
            'homicides':      0,
            'mvas':           0,
            'thefts':         0,
            'stolenVehicles': 0,
        },
        'byDistrict': [
            {
                'district': d,
                'totalCrimes':    0,
                'shootings':      0,
                'homicides':      0,
                'mvas':           0,
                'thefts':         0,
                'stolenVehicles': 0,
            }
            for d in DISTRICTS
        ],
        'monthlyTrends': [],
        'incidents':     [],
    }


def run(year: int, apply: bool) -> int:
    # ── Sanity checks ────────────────────────────────────────────────
    if not (2020 <= year <= 2099):
        print(f'ERROR: year {year} looks wrong. Expected a 4-digit year like 2026.', file=sys.stderr)
        return 2

    if not DATA_JSON.exists():
        print(f'ERROR: {DATA_JSON} does not exist.', file=sys.stderr)
        return 2

    archive_target = ARCHIVE / f'data-{year}.json'
    if archive_target.exists():
        print(f'ERROR: {archive_target} already exists. Refusing to overwrite.', file=sys.stderr)
        print(f'       If you really want to re-archive, delete that file first.', file=sys.stderr)
        return 2

    # ── Read current data and audit it ───────────────────────────────
    data = json.loads(DATA_JSON.read_text())
    incidents = data.get('incidents', [])
    year_buckets = Counter(i['date'][:4] for i in incidents if 'date' in i)

    print(f'Current data.json summary:')
    print(f'  Total incidents: {len(incidents)}')
    for y, n in sorted(year_buckets.items()):
        tag = '  ← archiving this' if y == str(year) else ''
        print(f'  Year {y}: {n:,} records{tag}')

    if str(year) not in year_buckets:
        print(f'\n⚠  WARNING: no {year} records found in data.json. Are you sure this is the right year?')

    other_years = {y: n for y, n in year_buckets.items() if y != str(year)}
    if other_years:
        print(f'\n⚠  WARNING: data.json contains {sum(other_years.values())} records from OTHER years:')
        for y, n in sorted(other_years.items()):
            print(f'     {y}: {n:,}')
        print(f'   Those will be archived along with the {year} records, then wiped from data.json.')
        print(f'   If that is not what you want, cancel now and investigate.')

    new_year = year + 1

    # ── Action plan ──────────────────────────────────────────────────
    print(f'\nPlanned actions:')
    print(f'  1. Copy  {DATA_JSON.relative_to(ROOT)}')
    print(f'     to    {archive_target.relative_to(ROOT)}')
    print(f'  2. Replace  {DATA_JSON.relative_to(ROOT)}  with a fresh empty scaffold for {new_year}')

    if not apply:
        print(f'\n=== DRY RUN — nothing changed. Run again with --apply to commit.')
        return 0

    # ── Execute ──────────────────────────────────────────────────────
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    shutil.copy2(DATA_JSON, archive_target)
    print(f'\n✓ Archived → {archive_target.relative_to(ROOT)} ({archive_target.stat().st_size / 1024:,.1f} KB)')

    scaffold = empty_scaffold(new_year)
    DATA_JSON.write_text(json.dumps(scaffold, indent=2))
    print(f'✓ New empty {DATA_JSON.relative_to(ROOT)} created for {new_year}')

    # ── Next steps ───────────────────────────────────────────────────
    print(f"""
Next steps:
  1. cd {ROOT}
  2. git add src/data/data.json src/data/archive/data-{year}.json
  3. git commit -m "chore: archive {year} data, start fresh for {new_year}"
  4. git push

The dashboard will redeploy automatically with the empty {new_year} scaffold.
As you import each week of {new_year} data, the stats will repopulate.

The {year} archive lives at:
  {archive_target}

You can always open it to pull {year} reports or do year-over-year
comparisons later.
""")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('year', type=int, help='The year to archive (e.g. 2026)')
    p.add_argument('--apply', action='store_true', help='Actually move files. Default is dry-run.')
    args = p.parse_args()
    return run(args.year, args.apply)


if __name__ == '__main__':
    sys.exit(main())
