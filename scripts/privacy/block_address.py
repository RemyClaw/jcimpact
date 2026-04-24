#!/usr/bin/env python3
"""
Block-level address helper — shared across import pipelines.

Transform:
  "748 OCEAN AVE, JERSEY CITY, NJ"        → "700 block of OCEAN AVE, JERSEY CITY, NJ"
  "45 SHEFFIELD ST, JERSEY CITY, NJ"      → "1-99 block of SHEFFIELD ST, JERSEY CITY, NJ"
  "1645 KENNEDY BLVD"                     → "1600 block of KENNEDY BLVD"
  "2 GARRISON AVE & DEKALB AVE"           → "GARRISON AVE & DEKALB AVE"  (intersection: drop house #)
  "MARIN BLVD & GRAND ST"                 → unchanged (no house number)
  "6TH ST & MARIN BLVD"                   → unchanged (6TH is ordinal, not house #)
  "ORIENT AVE & MLK DR"                   → unchanged
"""
from __future__ import annotations
import re


def to_block(address: str) -> str:
    """
    Strip specific house numbers in favor of block-level identifiers.

    Rules:
      1. If the address begins with a pure house number (digits + optional single
         trailing letter) followed by whitespace and a street name, transform it.
      2. For intersection addresses (contains " & "), drop the house number
         entirely — the intersection is already the location identifier.
      3. For block-only addresses, round DOWN to the nearest 100:
           1-99     → "1-99 block of"
           100-199  → "100 block of"
           748      → "700 block of"
      4. Ordinal street names like "6TH ST", "2ND ST", "18TH AVE" are NOT treated
         as house numbers — they stay as-is.
    """
    # Must begin with pure digits (optionally one letter suffix like "123A"),
    # followed by whitespace, then a letter (so ordinals like "6TH" don't match
    # because the char after the letter-suffix is another letter, not whitespace).
    m = re.match(r'^(\d+)[A-Z]?\s+(?=[A-Z])(.*)$', address, flags=re.IGNORECASE)
    if not m:
        return address

    house_num_str, rest = m.group(1), m.group(2)
    house_num = int(house_num_str)

    # Intersection address? Drop house number entirely.
    if '&' in rest:
        return rest.strip()

    # Block-level rounding
    if house_num < 100:
        block = '1-99'
    else:
        block = str((house_num // 100) * 100)

    return f'{block} block of {rest}'
