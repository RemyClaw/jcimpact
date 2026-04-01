import os
#!/usr/bin/env python3
"""
One-time script: reads JCIMPACT_Redesigned.xlsx, geocodes all incidents via
Mapbox, and writes src/data/data.json — the single source of truth.
"""
import json, math, random, re, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import urllib.request, urllib.parse

TOKEN  = os.environ.get('MAPBOX_TOKEN', '')  # Set via: export MAPBOX_TOKEN=your_token
BBOX   = '-74.1197,40.6627,-74.0156,40.7681'
PROX   = '-74.0706,40.7178'
OUTPUT = '/Users/geremy/JCIMPACT/src/data/data.json'
EXCEL  = '/Users/geremy/Desktop/JCIMPACT_Redesigned.xlsx'

# ── District centroids (fallback for failed geocoding) ────────────────────
CENTROIDS = {
    'NORTH': (40.7378, -74.0533),
    'EAST':  (40.7178, -74.0450),
    'SOUTH': (40.7040, -74.0680),
    'WEST':  (40.7220, -74.0870),
}

random.seed(42)

def jitter(lat, lng, radius_m=600):
    dlat = (random.uniform(-1,1) * radius_m) / 111_111
    dlng = (random.uniform(-1,1) * radius_m) / (111_111 * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)

def geocode(query: str):
    q = query + ', Jersey City, NJ'
    url = (f'https://api.mapbox.com/geocoding/v5/mapbox.places/'
           f'{urllib.parse.quote(q)}.json'
           f'?proximity={PROX}&bbox={BBOX}&limit=1&access_token={TOKEN}')
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        feats = data.get('features', [])
        if feats:
            c = feats[0]['center']
            return round(c[1], 6), round(c[0], 6)
    except Exception:
        pass
    return None

# ── Summary stats (hardcoded from Excel analysis) ─────────────────────────
# Source: YTD Summary sheet + weekly district totals (North+East+South+West each month)
# Citywide: Jan=543, Feb=514, Mar(3wks)=317 → YTD=1374
# District YTD = Jan+Feb+Mar3wks
# Shootings: 5 shooting hits + 8 shots fired = 13 total events (all on map)
# For stat card "Shootings" we show the 5 shooting hits (people struck)
# MVAs: March Wk1-3 only = 333 (Jan/Feb not yet in dataset)

SUMMARY = {
    "meta": {
        "period": "YTD 2026 (Jan 1 – Mar 21)",
        "generated": "2026-03-24",
        "source": "JCPD CompStat / NJ Crash Reports"
    },
    "citywide": {
        "totalCrimes": 1374,
        "shootings": 13,
        "homicides": 0,
        "mvas": 333
    },
    "byDistrict": [
        {"district": "South", "totalCrimes": 418, "shootings": 9,  "homicides": 0, "mvas": 99},
        {"district": "West",  "totalCrimes": 388, "shootings": 2,  "homicides": 0, "mvas": 127},
        {"district": "East",  "totalCrimes": 340, "shootings": 2,  "homicides": 0, "mvas": 58},
        {"district": "North", "totalCrimes": 228, "shootings": 0,  "homicides": 0, "mvas": 49},
    ],
    "monthlyTrends": [
        {"month": "2026-01", "label": "Jan '26", "totalCrimes": 543, "shootings": 5, "homicides": 0, "mvas": 0},
        {"month": "2026-02", "label": "Feb '26", "totalCrimes": 514, "shootings": 3, "homicides": 0, "mvas": 0},
        {"month": "2026-03", "label": "Mar '26", "totalCrimes": 317, "shootings": 5, "homicides": 0, "mvas": 333},
    ],
}

# ── Shooting incidents ─────────────────────────────────────────────────────
# Source: "Shots Fired & Shootings" sheet
SHOOTING_RECORDS = [
    # Shooting Hits
    ("sh-1", "2026-01-01", "352 West Side Ave",           "West",  "Shooting Hit"),
    ("sh-2", "2026-01-20", "Woodland Ave & Ocean Ave",     "South", "Shooting Hit"),
    ("sh-3", "2026-02-03", "117 Wade St",                  "South", "Shooting Hit · Arrest"),
    ("sh-4", "2026-02-22", "117 Wade St",                  "South", "Shooting Hit · Arrest"),
    ("sh-5", "2026-03-20", "Oak St & Sackett St",          "East",  "Shooting Hit · Arrest"),
    # Shots Fired
    ("sf-1", "2026-01-12", "Cator Ave & Ocean Ave",        "South", "Shots Fired · Arrest"),
    ("sf-2", "2026-01-16", "6th St & Mall Dr W",           "East",  "Shots Fired"),
    ("sf-3", "2026-01-17", "112 Stuyvesant Ave",           "South", "Shots Fired · Arrest"),
    ("sf-4", "2026-02-22", "Mallory Ave & Williamson Ave", "South", "Shots Fired"),
    ("sf-5", "2026-03-06", "80 Van Nostrand Ave",          "South", "Shots Fired · Arrest"),
    ("sf-6", "2026-03-07", "73 Dales Ave",                 "West",  "Shots Fired"),
    ("sf-7", "2026-03-07", "33 Gloria Robinson Ct",        "South", "Shots Fired · Arrest"),
    ("sf-8", "2026-03-20", "Brinkerhoff Ave & Monticello Ave", "South", "Shots Fired · Arrest"),
]

# ── Load MVA data from Excel ───────────────────────────────────────────────
print("Reading Excel…", flush=True)
xl = pd.read_excel(EXCEL, sheet_name='MVA Data', header=None)

# Find header row containing "Case #"
header_row = None
for i, row in xl.iterrows():
    if any(str(v).strip().lower() in ('case #', 'case#') for v in row):
        header_row = i
        break

if header_row is None:
    print("ERROR: Could not find header row in MVA Data sheet", file=sys.stderr)
    sys.exit(1)

xl.columns = xl.iloc[header_row]
mva_df = xl.iloc[header_row+1:].copy().reset_index(drop=True)
mva_df.columns = [str(c).strip() for c in mva_df.columns]

# Keep only rows with a valid case number
case_col   = next((c for c in mva_df.columns if 'case' in c.lower()), None)
date_col   = next((c for c in mva_df.columns if c.lower() == 'date'), None)
road_col   = next((c for c in mva_df.columns if c.lower() == 'road'), None)
cross_col  = next((c for c in mva_df.columns if 'cross' in c.lower()), None)
dist_col   = next((c for c in mva_df.columns if 'district' in c.lower()), None)

print(f"MVA cols: {case_col}, {date_col}, {road_col}, {cross_col}, {dist_col}", flush=True)

mva_df = mva_df[mva_df[case_col].notna() & mva_df[case_col].astype(str).str.match(r'26-\d+')].copy()
print(f"MVA records: {len(mva_df)}", flush=True)

def clean_road(s):
    if pd.isna(s): return ''
    s = str(s).strip()
    replacements = {
        'ST HWY 440': 'Route 440', 'HWY 440': 'Route 440', 'ROUTE 440': 'Route 440',
        'US 1&9': 'US Route 1 9', 'US 1 & 9': 'US Route 1 9', '1&9': 'Route 1 9',
        'LOWER 139': 'Route 139', 'UPPER 139': 'Route 139', 'LOWER RT 139': 'Route 139',
        'RT 139': 'Route 139', 'NJ 139': 'Route 139',
        'RT 185': 'Route 185', 'ST HWY': 'Route', 'RT ': 'Route ',
        'JFK BLVD': 'John F Kennedy Blvd', 'MLK DR': 'Martin Luther King Dr',
        'PULASKI SKYWAY': 'Pulaski Skyway',
    }
    su = s.upper()
    for k, v in replacements.items():
        if k in su:
            s = su.replace(k, v)
            break
    return s.title()

def parse_date(s):
    s = str(s).strip()
    m = re.match(r'(\d{2})/(\d{2})', s)
    if m:
        return f"2026-{m.group(1)}-{m.group(2)}"
    return '2026-03-01'

def build_mva_query(road, cross):
    r = clean_road(road)
    c = clean_road(cross)
    skip = {'', '—', '-', 'nan', 'None'}
    if c.strip() in skip or len(c.strip()) < 2:
        return r
    # Skip ramp/lot descriptions
    if any(x in c.upper() for x in ['RAMP', 'LOT', 'PKWY', 'LN W', 'SOUTH RAMP']):
        return r
    return f"{r} & {c}"

# Build MVA geocode tasks
mva_tasks = []
for _, row in mva_df.iterrows():
    case_num = str(row[case_col]).strip()
    date_str = parse_date(row[date_col])
    road     = row[road_col]
    cross    = row.get(cross_col, '')
    district = str(row[dist_col]).strip().upper() if dist_col else 'WEST'
    query    = build_mva_query(road, cross)
    mva_tasks.append((case_num, date_str, query, district, road, cross))

# Build shooting geocode tasks
shooting_tasks = [(rec[0], rec[1], rec[2], rec[3].upper(), rec[4]) for rec in SHOOTING_RECORDS]

# ── Geocode in parallel ────────────────────────────────────────────────────
all_tasks = (
    [('mva', t[0], t[1], t[2], t[3], t[4], None) for t in mva_tasks] +
    [('shoot', t[0], t[1], t[2], t[3], t[4], None) for t in shooting_tasks]
)

print(f"Geocoding {len(all_tasks)} incidents…", flush=True)

results = {}
errors  = 0

def fetch_one(task):
    kind, iid, date, query, district, extra, _ = task
    coords = geocode(query)
    return (kind, iid, date, query, district, extra, coords)

with ThreadPoolExecutor(max_workers=12) as pool:
    futures = {pool.submit(fetch_one, t): t for t in all_tasks}
    done = 0
    for fut in as_completed(futures):
        kind, iid, date, query, district, extra, coords = fut.result()
        results[(kind, iid)] = (date, query, district, extra, coords)
        done += 1
        if done % 50 == 0:
            print(f"  {done}/{len(all_tasks)} geocoded…", flush=True)

print(f"Geocoding complete. Failures will use district centroid + jitter.", flush=True)

# ── Build incidents array ──────────────────────────────────────────────────
incidents = []

# Shooting incidents
for rec in SHOOTING_RECORDS:
    iid, date, address, district, desc = rec
    key = ('shoot', iid)
    _, _, _, _, coords = results.get(key, (None, None, None, None, None))
    if coords:
        lat, lng = coords
    else:
        clat, clng = CENTROIDS.get(district.upper(), CENTROIDS['SOUTH'])
        lat, lng = jitter(clat, clng, 400)
    incidents.append({
        "id":       iid,
        "type":     "Shooting",
        "date":     date,
        "district": district.capitalize() if district.upper() in CENTROIDS else district,
        "lat":      lat,
        "lng":      lng,
        "address":  address,
        "description": desc,
    })

# MVA incidents
for case_num, date_str, query, district, road, cross in mva_tasks:
    key = ('mva', case_num)
    _, _, _, _, coords = results.get(key, (None, None, None, None, None))
    if coords:
        lat, lng = coords
    else:
        clat, clng = CENTROIDS.get(district, CENTROIDS['WEST'])
        lat, lng = jitter(clat, clng, 600)
        errors += 1
    road_str  = str(road).strip() if not pd.isna(road) else ''
    cross_str = str(cross).strip() if not pd.isna(cross) else ''
    if cross_str and cross_str not in ('—', '-', 'nan', 'None', ''):
        addr = f"{road_str} & {cross_str}"
    else:
        addr = road_str
    dist_display = district.capitalize()
    incidents.append({
        "id":       f"mva-{case_num}",
        "type":     "MVA",
        "date":     date_str,
        "district": dist_display,
        "lat":      lat,
        "lng":      lng,
        "address":  addr,
    })

print(f"Built {len(incidents)} incidents ({errors} used centroid fallback).", flush=True)

# ── Write data.json ────────────────────────────────────────────────────────
output = {**SUMMARY, "incidents": incidents}
with open(OUTPUT, 'w') as f:
    json.dump(output, f, indent=2)

print(f"\n✓ Wrote {OUTPUT}  ({len(incidents)} incidents)", flush=True)
print(f"  Shooting: {sum(1 for i in incidents if i['type']=='Shooting')}")
print(f"  MVA:      {sum(1 for i in incidents if i['type']=='MVA')}")
