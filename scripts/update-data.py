#!/usr/bin/env python3
"""
update-data.py — repeatable JCImpact dashboard data updater.

Usage:
    python3 scripts/update-data.py [path/to/workbook.xlsx]
    npm run update-data

What it does:
  1. Parses CITYWIDE sheet        → monthly crime totals (7 major categories)
  2. Parses NORTH/EAST/SOUTH/WEST → district monthly breakdowns
  3. Parses Shots Fired sheet      → shooting incidents (geocoded)
  4. Parses MVA Data sheet         → MVA incidents (geocoded)
  5. Geocodes new addresses only   → cache in scripts/geocode-cache.json
  6. Writes src/data/data.json     → single source of truth for dashboard

On first run, all addresses are geocoded (~1-2 min).
On subsequent runs, only NEW addresses are geocoded (seconds).
"""

import json, math, os, re, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
import pandas as pd
import urllib.request, urllib.parse

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT    = os.path.dirname(SCRIPT_DIR)
OUTPUT_JSON  = os.path.join(REPO_ROOT, 'src', 'data', 'data.json')
CACHE_FILE   = os.path.join(SCRIPT_DIR, 'geocode-cache.json')
DEFAULT_EXCEL = os.path.expanduser('~/Desktop/JCIMPACT_Redesigned.xlsx')

# ── Mapbox ─────────────────────────────────────────────────────────────────────
MAPBOX_TOKEN = 'pk.eyJ1IjoiY2xhd3JlbXkiLCJhIjoiY21sdzFlMTU0MGRxaDNlb252N3U1aWp5MyJ9.gJ3BZ2twJBzvlIDlW_sA7Q'
BBOX = '-74.1197,40.6627,-74.0156,40.7681'
PROX = '-74.0706,40.7178'

# ── Constants ──────────────────────────────────────────────────────────────────
DISTRICT_SHEETS = ['NORTH', 'EAST', 'SOUTH', 'WEST']

# The 7 Major Impact Categories tracked in JCPD CompStat
# Must match Excel row labels exactly (case-insensitive, no leading whitespace)
MAJOR_OFFENSES = {
    'assault total', 'stolen vehicles', 'burglary total',
    'homicide', 'theft', 'sex offenses', 'robbery total',
}

DISTRICT_CENTROIDS = {
    'North': (40.7378, -74.0533),
    'East':  (40.7178, -74.0450),
    'South': (40.7040, -74.0680),
    'West':  (40.7220, -74.0870),
}

MONTH_NAMES = {
    'january':('01','Jan'), 'february':('02','Feb'), 'march':('03','Mar'),
    'april':  ('04','Apr'), 'may':     ('05','May'), 'june': ('06','Jun'),
    'july':   ('07','Jul'), 'august':  ('08','Aug'), 'september':('09','Sep'),
    'october':('10','Oct'), 'november':('11','Nov'), 'december': ('12','Dec'),
}

# ── Geocode cache ──────────────────────────────────────────────────────────────
def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

def _geocode_api(query: str):
    q = query + ', Jersey City, NJ'
    url = (f'https://api.mapbox.com/geocoding/v5/mapbox.places/'
           f'{urllib.parse.quote(q)}.json'
           f'?proximity={PROX}&bbox={BBOX}&limit=1&access_token={MAPBOX_TOKEN}')
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        feats = data.get('features', [])
        if feats:
            c = feats[0]['center']
            return (round(c[1], 6), round(c[0], 6))
    except Exception:
        pass
    return None

def batch_geocode(queries: list, cache: dict) -> dict:
    """Geocode only addresses not already in cache. Returns updated cache."""
    new_q = list({q for q in queries if q and q.lower().strip() not in cache})
    if not new_q:
        print(f'  All {len(queries)} addresses already cached — skipping geocoding.', flush=True)
        return cache
    print(f'  Geocoding {len(new_q)} new addresses ({len(queries)-len(new_q)} cached)…', flush=True)

    def fetch(q):
        return (q, _geocode_api(q))

    today = date.today().isoformat()
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(fetch, q) for q in new_q]
        done = 0
        for fut in as_completed(futures):
            q, coords = fut.result()
            if coords:
                cache[q.lower().strip()] = {'lat': coords[0], 'lng': coords[1], 'cached_at': today}
            done += 1
            if done % 50 == 0 or done == len(new_q):
                print(f'    {done}/{len(new_q)}…', flush=True)
    return cache

# ── Fallback coordinates (deterministic jitter so re-runs are stable) ──────────
def centroid_coords(district: str, seed_str: str = '') -> tuple:
    import hashlib, random as _random
    lat, lng = DISTRICT_CENTROIDS.get(district, DISTRICT_CENTROIDS['South'])
    seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    rng = _random.Random(seed)
    r = 600
    dlat = rng.uniform(-r, r) / 111_111
    dlng = rng.uniform(-r, r) / (111_111 * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)

def nearest_district(lat: float, lng: float) -> str:
    best, best_d = 'South', float('inf')
    for dist, (clat, clng) in DISTRICT_CENTROIDS.items():
        d = math.sqrt((lat - clat)**2 + (lng - clng)**2)
        if d < best_d:
            best_d, best = d, dist
    return best

# ── Road name cleanup for MVA geocoding ───────────────────────────────────────
def clean_road(s) -> str:
    if pd.isna(s): return ''
    subs = [
        ('ST HWY 440','Route 440'), ('HWY 440','Route 440'), ('ROUTE 440','Route 440'),
        ('US 1&9','US Route 1 9'), ('US 1 & 9','US Route 1 9'), ('1&9','Route 1 9'),
        ('LOWER 139','Route 139'), ('UPPER 139','Route 139'), ('LOWER RT 139','Route 139'),
        ('RT 139','Route 139'), ('NJ 139','Route 139'), ('RT 185','Route 185'),
        ('ST HWY','Route'), ('RT ','Route '),
        ('JFK BLVD','John F Kennedy Blvd'), ('KENNEDY BLVD','Kennedy Blvd'),
        ('MLK DR','Martin Luther King Dr'), ('PULASKI SKYWAY','Pulaski Skyway'),
    ]
    su = str(s).strip().upper()
    for k, v in subs:
        if k in su:
            su = su.replace(k, v)
            break
    return su.title()

def mva_geocode_query(road, cross) -> str:
    r, c = clean_road(road), clean_road(cross)
    skip = {'', '—', '-', 'nan', 'None', 'N/A'}
    if not c or c.strip() in skip or len(c.strip()) < 2:
        return r
    if any(x in c.upper() for x in ['RAMP', 'LOT', 'LN W', 'SOUTH RAMP']):
        return r
    return f'{r} & {c}'

# ── Date parsers ───────────────────────────────────────────────────────────────
def parse_mva_date(s, year=2026) -> str:
    m = re.match(r'(\d{1,2})/(\d{1,2})', str(s).strip())
    if m:
        return f'{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}'
    return f'{year}-03-01'

def parse_shot_date(s) -> str:
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', str(s).strip())
    if m:
        mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        yr = yr + 2000 if yr < 100 else yr
        return f'{yr}-{mo:02d}-{dy:02d}'
    return '2026-01-01'

def month_key(date_str: str) -> str:
    return date_str[:7]

# ── Parse CITYWIDE / district crime sheets ────────────────────────────────────
def _find_week_cols(header: list) -> list:
    """Return column indices whose header looks like a date range: '1/1-1/3'"""
    pat = re.compile(r'\d+/\d+\s*[-–]\s*\d+/\d+')
    return [i for i, h in enumerate(header) if pat.match(str(h).strip())]

def _find_total_col(header: list):
    """Return index of the 'MON Total' column (e.g. 'MAR Total', 'JAN Total')."""
    pat = re.compile(r'^[A-Za-z]{3}\s+Total$')
    for i, h in enumerate(header):
        if pat.match(str(h).strip()):
            return i
    return None

def _int(v) -> int:
    try: return int(float(str(v)))
    except (ValueError, TypeError): return 0

def _sum_week_cols(row: list, cols: list) -> int:
    return sum(_int(row[i]) for i in cols if i < len(row))

def _offense_total(row: list, week_cols: list, total_col) -> int:
    """
    Best-effort monthly total for one offense row.
    Takes max(sum-of-week-cols, value-in-MonthTotal-col) so either entry
    style works — weekly breakdown OR pre-summed total column.
    """
    week_sum = _sum_week_cols(row, week_cols)
    if total_col is not None and total_col < len(row):
        col_val = _int(row[total_col])
        return max(week_sum, col_val)
    return week_sum

def parse_crime_sheet(df) -> list:
    """
    Parse a CITYWIDE or district sheet.
    Returns list of {month, label, totalCrimes, homicides}, one entry per month found.
    totalCrimes = sum of the 7 Major Impact Categories (not arrest-generated).
    """
    rows = df.values.tolist()
    results = []
    i = 0
    while i < len(rows):
        cell0 = str(rows[i][0]).strip() if rows[i][0] is not None else ''
        # Month section header: "▌  JANUARY 2026   (01/01 – 01/31)"
        if '▌' in cell0:
            m = re.search(r'(\w+)\s+(\d{4})', cell0)
            if m and m.group(1).lower() in MONTH_NAMES:
                mo_num, mo_short = MONTH_NAMES[m.group(1).lower()]
                year = m.group(2)
                month_str = f'{year}-{mo_num}'
                label     = f"{mo_short} '{year[2:]}"

                # Find header row (contains "OFFENSE")
                j = i + 1
                while j < len(rows) and 'offense' not in str(rows[j][0]).lower():
                    j += 1
                    if j > i + 6: break

                if j < len(rows):
                    header    = [str(c).strip() for c in rows[j]]
                    week_cols = _find_week_cols(header)
                    total_col = _find_total_col(header)

                    total_crimes = 0
                    homicides    = 0
                    in_major     = True
                    k = j + 1
                    while k < len(rows):
                        raw = str(rows[k][0]) if rows[k][0] is not None else ''
                        cell = raw.strip()
                        if '▌' in cell:
                            break
                        if cell.lower().startswith('arrest-generated'):
                            in_major = False
                        if in_major and not raw.startswith(' ') and cell:
                            offense = cell.lower()
                            if offense in MAJOR_OFFENSES and (week_cols or total_col is not None):
                                val = _offense_total(rows[k], week_cols, total_col)
                                total_crimes += val
                                if offense == 'homicide':
                                    homicides = val
                        k += 1

                    results.append({
                        'month': month_str, 'label': label,
                        'totalCrimes': total_crimes, 'homicides': homicides,
                    })
        i += 1
    return results

# ── Parse Shots Fired & Shootings sheet ───────────────────────────────────────
def parse_shots_sheet(df) -> list:
    """
    Returns list of incident dicts: {id, date, address, district_hint, description, geocode_query}
    Handles both 'SHOTS FIRED' and 'SHOOTING HITS' sections.
    """
    rows = df.values.tolist()
    incidents = []
    current_type = None
    header_found = False
    date_col = loc_col = arrest_col = district_col = None
    sh_n = sf_n = 0

    for row in rows:
        cells = [str(c).strip() if c is not None and str(c) != 'nan' else '' for c in row]
        c0 = cells[0] if cells else ''

        # Section detection (specific patterns to avoid matching the sheet title)
        if re.match(r'SHOTS\s+FIRED\s*\(\d+', c0, re.IGNORECASE):
            current_type = 'Shots Fired'
            header_found = False
            date_col = loc_col = arrest_col = district_col = None
            continue
        if re.match(r'SHOOTING\s+HITS?\s*\(\d+', c0, re.IGNORECASE):
            current_type = 'Shooting Hit'
            header_found = False
            date_col = loc_col = arrest_col = district_col = None
            continue
        if current_type is None:
            continue

        # Header row
        if not header_found:
            lower = [c.lower() for c in cells]
            if 'date' in lower:
                date_col     = lower.index('date')
                loc_col      = next((i for i, c in enumerate(lower) if 'location' in c or 'address' in c), 2)
                arrest_col   = next((i for i, c in enumerate(lower) if 'arrest' in c), 3)
                district_col = next((i for i, c in enumerate(lower) if 'district' in c), None)
                header_found = True
            continue

        # Data rows — first cell must look like a date
        date_val = cells[date_col] if date_col is not None and date_col < len(cells) else ''
        if not re.match(r'\d{1,2}/\d{1,2}', date_val):
            continue
        loc_val = cells[loc_col] if loc_col is not None and loc_col < len(cells) else ''
        if not loc_val:
            continue

        arrest_val = cells[arrest_col] if arrest_col is not None and arrest_col < len(cells) else ''

        # Optional district column
        district_hint = None
        if district_col is not None and district_col < len(cells):
            d = cells[district_col].strip().capitalize()
            if d in DISTRICT_CENTROIDS:
                district_hint = d

        desc = current_type
        if arrest_val.lower() in ('yes', 'y'):
            desc += ' · Arrest'

        if current_type == 'Shooting Hit':
            sh_n += 1
            iid = f'sh-{sh_n}'
        else:
            sf_n += 1
            iid = f'sf-{sf_n}'

        incidents.append({
            'id':            iid,
            'date':          parse_shot_date(date_val),
            'address':       loc_val,
            'district_hint': district_hint,
            'description':   desc,
            'geocode_query': loc_val,
        })
    return incidents

# ── Parse MVA Data sheet ───────────────────────────────────────────────────────
def parse_mva_sheet(df) -> list:
    """Returns list of MVA task dicts with id, date, district, address, geocode_query."""
    # Find header row containing "Case #"
    header_idx = None
    for i, row in df.iterrows():
        if any(str(v).strip().lower() in ('case #', 'case#') for v in row):
            header_idx = i
            break
    if header_idx is None:
        print('  WARNING: MVA Data header row not found', file=sys.stderr)
        return []

    df = df.copy()
    df.columns = df.iloc[header_idx]
    mva = df.iloc[header_idx+1:].reset_index(drop=True)
    mva.columns = [str(c).strip() for c in mva.columns]

    case_col  = next((c for c in mva.columns if 'case' in c.lower()), None)
    date_col  = next((c for c in mva.columns if c.lower() == 'date'), None)
    road_col  = next((c for c in mva.columns if c.lower() == 'road'), None)
    cross_col = next((c for c in mva.columns if 'cross' in c.lower()), None)
    dist_col  = next((c for c in mva.columns if 'district' in c.lower()), None)
    if not case_col:
        return []

    # Infer year from case numbers: "26-040062" → 2026
    valid = mva[mva[case_col].notna() & mva[case_col].astype(str).str.match(r'\d{2}-\d+')]
    year = 2026
    if not valid.empty:
        prefix = str(valid[case_col].iloc[0]).split('-')[0]
        if prefix.isdigit():
            year = 2000 + int(prefix)

    mva = mva[mva[case_col].notna() & mva[case_col].astype(str).str.match(r'\d{2}-\d+')].copy()

    tasks = []
    for _, row in mva.iterrows():
        case_num = str(row[case_col]).strip()
        date_str = parse_mva_date(row.get(date_col, ''), year)
        road     = row.get(road_col, '')
        cross    = row.get(cross_col, '')
        district = str(row[dist_col]).strip().capitalize() if dist_col and not pd.isna(row.get(dist_col)) else 'West'
        if district not in DISTRICT_CENTROIDS:
            district = 'West'
        query = mva_geocode_query(road, cross)
        addr  = (f"{str(road).strip()} & {str(cross).strip()}"
                 if cross and str(cross).strip() not in ('', '—', '-', 'nan', 'None')
                 else str(road).strip())
        tasks.append({
            'id':            f'mva-{case_num}',
            'date':          date_str,
            'district':      district,
            'address':       addr,
            'geocode_query': query,
        })
    return tasks

# ── Extract last-updated date from sheet header ────────────────────────────────
def extract_last_updated(df) -> str:
    """Row 1 contains 'Last Updated: 03/23/2026' — parse it."""
    try:
        cell = str(df.iloc[1, 0])
        m = re.search(r'Last Updated:\s*(\d{2}/\d{2}/\d{4})', cell)
        if m:
            mo, dy, yr = m.group(1).split('/')
            return f'{yr}-{mo}-{dy}'
    except Exception:
        pass
    return date.today().isoformat()

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    excel_path = (sys.argv[1]
                  if len(sys.argv) > 1
                  else os.environ.get('JCIMPACT_EXCEL', DEFAULT_EXCEL))

    if not os.path.exists(excel_path):
        print(f'\nERROR: Excel file not found:\n  {excel_path}\n')
        print('Usage:')
        print('  python3 scripts/update-data.py [path/to/workbook.xlsx]')
        print('  JCIMPACT_EXCEL=/path/to/file.xlsx npm run update-data\n')
        sys.exit(1)

    print(f'\nReading {os.path.basename(excel_path)}…', flush=True)
    xl = pd.ExcelFile(excel_path)

    # ── Parse meta ────────────────────────────────────────────────────────────
    citywide_df   = pd.read_excel(xl, sheet_name='CITYWIDE', header=None)
    last_updated  = extract_last_updated(citywide_df)

    # ── Parse monthly totals from CITYWIDE ────────────────────────────────────
    print('Parsing CITYWIDE monthly totals…', flush=True)
    citywide_monthly = parse_crime_sheet(citywide_df)
    for m in citywide_monthly:
        print(f"  {m['label']}: {m['totalCrimes']} crimes, {m['homicides']} homicides")

    # ── Parse monthly totals from each district sheet ─────────────────────────
    print('Parsing district sheets…', flush=True)
    district_monthly = {}   # { 'North': [{month, totalCrimes, homicides}, …], … }
    for sheet in DISTRICT_SHEETS:
        if sheet in xl.sheet_names:
            d_df = pd.read_excel(xl, sheet_name=sheet, header=None)
            district_monthly[sheet.capitalize()] = parse_crime_sheet(d_df)
            total = sum(e['totalCrimes'] for e in district_monthly[sheet.capitalize()])
            print(f"  {sheet.capitalize()}: {total} crimes YTD")
        else:
            print(f'  WARNING: Sheet "{sheet}" not found', file=sys.stderr)

    # ── Parse shooting incidents ───────────────────────────────────────────────
    print('Parsing shots/shootings…', flush=True)
    shots_sheet = 'Shots Fired & Shootings'
    if shots_sheet in xl.sheet_names:
        shots_df      = pd.read_excel(xl, sheet_name=shots_sheet, header=None)
        shot_incidents = parse_shots_sheet(shots_df)
        print(f'  Found {len(shot_incidents)} shooting incidents')
    else:
        shot_incidents = []
        print(f'  WARNING: Sheet "{shots_sheet}" not found', file=sys.stderr)

    # ── Parse MVA incidents ────────────────────────────────────────────────────
    print('Parsing MVA data…', flush=True)
    mva_df    = pd.read_excel(xl, sheet_name='MVA Data', header=None)
    mva_tasks = parse_mva_sheet(mva_df)
    print(f'  Found {len(mva_tasks)} MVA incidents')

    # ── Geocode all incidents (new only) ──────────────────────────────────────
    print('\nGeocoding…', flush=True)
    cache = load_cache()
    all_queries = [t['geocode_query'] for t in shot_incidents + mva_tasks if t['geocode_query']]
    cache = batch_geocode(all_queries, cache)
    save_cache(cache)

    # ── Build incident objects ─────────────────────────────────────────────────
    fallbacks = 0
    incidents = []

    for t in shot_incidents:
        key = t['geocode_query'].lower().strip()
        if key in cache:
            lat, lng = cache[key]['lat'], cache[key]['lng']
            district = t['district_hint'] or nearest_district(lat, lng)
        else:
            district = t['district_hint'] or 'South'
            lat, lng = centroid_coords(district, t['id'])
            fallbacks += 1
        incidents.append({
            'id': t['id'], 'type': 'Shooting',
            'date': t['date'], 'district': district,
            'lat': lat, 'lng': lng,
            'address': t['address'], 'description': t['description'],
        })

    for t in mva_tasks:
        key = t['geocode_query'].lower().strip()
        if key in cache:
            lat, lng = cache[key]['lat'], cache[key]['lng']
        else:
            lat, lng = centroid_coords(t['district'], t['id'])
            fallbacks += 1
        incidents.append({
            'id': t['id'], 'type': 'MVA',
            'date': t['date'], 'district': t['district'],
            'lat': lat, 'lng': lng,
            'address': t['address'],
        })

    # ── Aggregate counts by month and district ────────────────────────────────
    shooting_by_month    = defaultdict(int)
    shooting_by_district = defaultdict(int)
    mva_by_month         = defaultdict(int)
    mva_by_district      = defaultdict(int)

    for inc in incidents:
        mk = month_key(inc['date'])
        if inc['type'] == 'Shooting':
            shooting_by_month[mk]            += 1
            shooting_by_district[inc['district']] += 1
        else:
            mva_by_month[mk]                 += 1
            mva_by_district[inc['district']] += 1

    # ── Assemble monthly trends ────────────────────────────────────────────────
    monthly_trends = []
    for entry in sorted(citywide_monthly, key=lambda x: x['month']):
        mk = entry['month']
        monthly_trends.append({
            'month':       mk,
            'label':       entry['label'],
            'totalCrimes': entry['totalCrimes'],
            'shootings':   shooting_by_month[mk],
            'homicides':   entry['homicides'],
            'mvas':        mva_by_month[mk],
        })

    # ── Assemble district totals ───────────────────────────────────────────────
    by_district = []
    for dist in ['South', 'West', 'East', 'North']:
        months = district_monthly.get(dist, [])
        by_district.append({
            'district':   dist,
            'totalCrimes': sum(e['totalCrimes'] for e in months),
            'shootings':   shooting_by_district[dist],
            'homicides':   sum(e['homicides']   for e in months),
            'mvas':        mva_by_district[dist],
        })

    # ── Citywide totals ────────────────────────────────────────────────────────
    # Use CITYWIDE sheet directly as the authoritative source for crime totals
    total_shootings = sum(1 for i in incidents if i['type'] == 'Shooting')
    total_mvas      = sum(1 for i in incidents if i['type'] == 'MVA')
    citywide = {
        'totalCrimes': sum(e['totalCrimes'] for e in citywide_monthly),
        'shootings':   total_shootings,
        'homicides':   sum(e['homicides']   for e in citywide_monthly),
        'mvas':        total_mvas,
    }

    # ── Derive period string ───────────────────────────────────────────────────
    if monthly_trends:
        first = monthly_trends[0]['label']
        last  = monthly_trends[-1]['label']
        year  = monthly_trends[0]['month'][:4]
        period = f"YTD {year} ({first} \u2013 {last})"
    else:
        period = f'YTD {date.today().year}'

    # ── Write data.json ────────────────────────────────────────────────────────
    output = {
        'meta': {
            'period':      period,
            'generated':   date.today().isoformat(),
            'source':      'JCPD CompStat / NJ Crash Reports',
            'lastUpdated': last_updated,
        },
        'citywide':      citywide,
        'byDistrict':    by_district,
        'monthlyTrends': monthly_trends,
        'incidents':     incidents,
    }
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(output, f, indent=2)

    # ── Sanity checks ──────────────────────────────────────────────────────────
    district_sum = sum(b['totalCrimes'] for b in by_district)
    citywide_sum = sum(e['totalCrimes'] for e in citywide_monthly)
    if district_sum != citywide_sum:
        delta = citywide_sum - district_sum
        print(f'\n  ⚠  DATA GAP DETECTED: {delta} crimes appear in CITYWIDE but not district sheets.')
        print(   '     Most likely cause: "Assault Total" rows in one or more district sheets')
        print(   '     for the current partial month are blank — only subcategories were entered.')
        print(   '     Fix: fill in the "Assault Total" row in NORTH/EAST/SOUTH/WEST sheets.\n')

    # ── Summary report ─────────────────────────────────────────────────────────
    sep = '=' * 52
    print(f'\n{sep}')
    print(f'  ✓  Wrote src/data/data.json')
    print(f'     Period:    {period}')
    print(f'     Generated: {date.today().isoformat()}')
    print(f'\n  CITYWIDE')
    print(f'     Total Crimes : {citywide["totalCrimes"]:,}')
    print(f'     Shootings    : {citywide["shootings"]}')
    print(f'     Homicides    : {citywide["homicides"]}')
    print(f'     MVAs         : {citywide["mvas"]}')
    print(f'\n  BY DISTRICT')
    for b in by_district:
        print(f'     {b["district"]:<6}  crimes={b["totalCrimes"]:4d}  '
              f'shots={b["shootings"]}  hom={b["homicides"]}  mvas={b["mvas"]}')
    print(f'\n  MONTHLY TRENDS')
    for m in monthly_trends:
        print(f'     {m["label"]:<8}  crimes={m["totalCrimes"]:4d}  '
              f'shots={m["shootings"]}  mvas={m["mvas"]}')
    print(f'\n  INCIDENTS: {len(incidents)} total  '
          f'({total_shootings} Shooting · {total_mvas} MVA)')
    if fallbacks:
        print(f'  FALLBACKS: {fallbacks} used centroid estimate (geocode failed)')
    if any(t.get('district_hint') is None for t in shot_incidents):
        print(f'\n  TIP: Add a "District" column to the "Shots Fired & Shootings" sheet')
        print( '       for accurate per-district shooting counts. Without it, district')
        print( '       assignment is estimated from geocoded coordinates.')
    print(f'{sep}\n')
    print('  Dashboard will update on next page refresh.\n')

if __name__ == '__main__':
    main()
