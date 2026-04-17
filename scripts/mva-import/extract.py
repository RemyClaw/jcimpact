#!/usr/bin/env python3
"""
Extract MVA records from the JCPD "New Jersey Crash Statistical Report" PDFs.

Reads both January and February 2026 PDFs, flattens the tables, cleans up
whitespace and line-wraps, and emits a JSON array with one object per record:

  {
    "case_number": "26-014881",
    "date": "2026-01-26",
    "road": "WEST SIDE AVE",
    "cross_road": "STEVENS AVE",
    "at_intersection": true,
    "feet": null,
    "miles": null,
    "address_for_geocode": "West Side Ave & Stevens Ave, Jersey City, NJ"
  }

Run:  python3 scripts/mva-import/extract.py
Out:  scripts/mva-import/records.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Optional

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
PDFS = {
    'January':  '/Users/geremy/Downloads/January Crash Report.pdf',
    'February': '/Users/geremy/Downloads/February Crash Report.pdf',
}
OUT = ROOT / 'scripts' / 'mva-import' / 'records.json'


def normalize(s: Optional[str]) -> str:
    """Strip, collapse internal whitespace/newlines into single spaces."""
    if not s:
        return ''
    return re.sub(r'\s+', ' ', s).strip()


def build_address(road: str, cross: str, at_intersection: bool) -> str:
    """
    Assemble a geocoder-friendly address string.

    Priorities:
      1. "123 STREET" (house number at start of road) → use road alone as street address
      2. "ROAD & CROSS_ROAD" when both sides have street names (intersection)
      3. Road-only fallback when cross_road is missing
    """
    road = normalize(road)
    cross = normalize(cross)

    house_match = re.match(r'^(\d+\S*)\s+(.+)$', road)
    if house_match:
        # Full address with house number — most precise
        return f'{road}, Jersey City, NJ'

    if cross:
        return f'{road} & {cross}, Jersey City, NJ'

    return f'{road}, Jersey City, NJ'


def extract_pdf(path: str, label: str) -> list[dict]:
    records: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                for row in table:
                    if not row or not row[0]:
                        continue
                    case_num = normalize(row[0])
                    # Skip the header row
                    if not re.match(r'^26-\d{6}$', case_num):
                        continue

                    # Column layout from pdfplumber (observed):
                    # 0  case_number
                    # 1  "TYPES OF INCIDENTS" container (blank in data rows)
                    # 2  FATAL
                    # 3  REPORTABLE
                    # 4  NON-REPORTABLE
                    # 5  CRASH DATE INFORMATION container (blank)
                    # 6  DATE  YYYY/MM/DD
                    # 7  DAY OF WEEK
                    # 8  TIME  HHMM
                    # 9  LOCATION container (blank)
                    # 10 MUNICIPAL CODE  0906
                    # 11 ROAD NAME
                    # 12 CROSS ROAD NAME
                    # 13 AT INTERSECTION (X or blank)
                    # 14 FEET (numeric or blank)
                    # 15 MILES (numeric or blank)
                    date_str = normalize(row[6] if len(row) > 6 else '')
                    time_str = normalize(row[8] if len(row) > 8 else '')
                    road     = normalize(row[11] if len(row) > 11 else '')
                    cross    = normalize(row[12] if len(row) > 12 else '')
                    at_int   = normalize(row[13] if len(row) > 13 else '').upper() == 'X'
                    feet     = normalize(row[14] if len(row) > 14 else '')
                    miles    = normalize(row[15] if len(row) > 15 else '')
                    fatal    = normalize(row[2] if len(row) > 2 else '').upper() == 'X'
                    reportable = normalize(row[3] if len(row) > 3 else '').upper() == 'X'
                    non_rep  = normalize(row[4] if len(row) > 4 else '').upper() == 'X'

                    # Convert 2026/01/26 → 2026-01-26
                    date_iso = date_str.replace('/', '-')
                    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_iso):
                        continue
                    if not road:
                        continue

                    records.append({
                        'case_number': case_num,
                        'date': date_iso,
                        'time': time_str,
                        'road': road,
                        'cross_road': cross,
                        'at_intersection': at_int,
                        'feet': feet or None,
                        'miles': miles or None,
                        'fatal': fatal,
                        'reportable': reportable,
                        'non_reportable': non_rep,
                        'source_month': label,
                        'address_for_geocode': build_address(road, cross, at_int),
                    })
    return records


def main():
    all_records: list[dict] = []
    for label, path in PDFS.items():
        print(f'Reading {label} from {path}')
        recs = extract_pdf(path, label)
        print(f'  → {len(recs)} records')
        all_records.extend(recs)

    # De-dupe by case_number (each case should be unique)
    by_case: dict[str, dict] = {}
    for r in all_records:
        by_case[r['case_number']] = r
    deduped = list(by_case.values())
    print(f'\nTotal parsed:      {len(all_records)}')
    print(f'After de-dupe:     {len(deduped)}')

    # Sort by date then case number for stable output
    deduped.sort(key=lambda r: (r['date'], r['case_number']))

    # Quick sanity split
    by_month: dict[str, int] = {}
    for r in deduped:
        m = r['date'][:7]
        by_month[m] = by_month.get(m, 0) + 1
    print('\nBy month:')
    for m in sorted(by_month):
        print(f'  {m}: {by_month[m]}')

    # Show the first 5 samples
    print('\nFirst 5 records:')
    for r in deduped[:5]:
        print(f'  {r["case_number"]}  {r["date"]}  "{r["address_for_geocode"]}"  at_int={r["at_intersection"]}  feet={r["feet"]}')

    OUT.write_text(json.dumps(deduped, indent=2))
    print(f'\nWrote {OUT}')


if __name__ == '__main__':
    sys.exit(main() or 0)
