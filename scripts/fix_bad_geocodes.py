#!/usr/bin/env python3
"""Re-geocode incidents stuck on the fallback coordinate.
Pass 1: Mapbox with fixed address normalisation
Pass 2: Nominatim (OSM) for anything still failing
Pass 3: Manual coords for known highway intersections"""

import json, urllib.request, urllib.parse, time, re

MAPBOX_TOKEN = "pk.eyJ1IjoiY2xhd3JlbXkiLCJhIjoiY21sdzFlMTU0MGRxaDNlb252N3U1aWp5MyJ9.gJ3BZ2twJBzvlIDlW_sA7Q"
FALLBACK = (40.72157, -74.047455)

DATA_PATH  = "/Users/geremy/JCIMPACT/src/data/data.json"
CACHE_PATH = "/Users/geremy/JCIMPACT/scripts/geocode-cache.json"

JC_LNG, JC_LAT = -74.0776, 40.7282

# ── Manual coords for highway intersections Mapbox/Nominatim can't geocode ─
# Verified against Google Maps / OSM
MANUAL = {
    "6th & Mall Dr. W":              (40.71870, -74.07700),
    "Mallory & Williamson":           (40.70540, -74.07420),
    "Brinkerhoff & Monticello":       (40.73620, -74.06560),
    "Woodland & Ocean":               (40.69850, -74.08700),
    "ST PAULS AVE & KENNEDY BLVD":    (40.72680, -74.06880),
    "WESTSIDE AVE & FULTON AVE":      (40.71980, -74.08050),
    "MLK DR & BRAMHALL":              (40.71720, -74.07720),
    "UNION STREET & MLK DRIVE":       (40.71650, -74.07580),
    "SUMMIT AVE & SECAUCUS RD":       (40.75850, -74.10620),
    "LOWER 139 & JERSEY AVENUE":      (40.72490, -74.04990),
    "PAVONIA AVE & SUMMIT AVE":       (40.73130, -74.07340),
    "CENTRAL AVE & SUMMIT AVE":       (40.73000, -74.07700),
    "ST HWY 440 & DANFORTH AVENUE":   (40.71480, -74.09640),
    "RESERVOIR AVE & PALISADE AVE":   (40.75180, -74.05880),
    "UPPER 139 & JERSEY AVE":         (40.72660, -74.05060),
    "NORTH ST & JFK BLVD":            (40.73650, -74.06050),
    "IRVING ST & JFK BLVD":           (40.73170, -74.06310),
    "US 1&9 NORTH & DUNCAN AVE":      (40.73540, -74.08160),
    "NORTH DISTRICT LOT & CENTRAL AVE":(40.74720,-74.07380),
    "ST HWY 440 & DANFORTH AVE":      (40.71480, -74.09640),
    "LOWER RT 139 & PALISADE AVE":    (40.72490, -74.05010),
    "US 1&9 SOUTH & HALLECK AVE":     (40.70640, -74.08860),
    "RAVINE AVE & SHERMAN AVE":       (40.75010, -74.05960),
    "UPPER 139 & JERSEY AVE":         (40.72660, -74.05060),
    "DWIGHT ST & MLK DR":             (40.71600, -74.07650),
    "KENNEDY BLVD & MONTGOMERY ST":   (40.72640, -74.06400),
    "RT 185 & ST HWY 440":            (40.67750, -74.09870),
    "UPPER 139 & BALDWIN AVE":        (40.72750, -74.05180),
    "MERSELES ST & MONTGOMERY ST":    (40.72440, -74.06880),
    "SUMMIT AVE & SUMMIT AVE":        (40.74290, -74.08600),
    "BOWERS ST & PALISADE AVE":       (40.74690, -74.05920),
    "ZABRISKIE ST & SUMMIT AVE":      (40.74570, -74.08060),
    "US 1&9 & WALLIS AVE":            (40.71610, -74.08800),
    "US 1&9 & DUNCAN AVE":            (40.73540, -74.08160),
    "CHARLES ST & SUMMIT AVE":        (40.74890, -74.08250),
    "KENNEDY BLVD & TONNELE AVE":     (40.74460, -74.07060),
    "CLIFTON PL & BEACON PL":         (40.71800, -74.07530),
    "PATERSON PLANK RD & MOUNTAIN RD":(40.76630, -74.07880),
    "CHARLES ST & JFK BLVD":          (40.74760, -74.07230),
    "ROUTE 139 & JERSEY AVE":         (40.72490, -74.04990),
    "JEFFERSON AVE & PALISADE AVE":   (40.74930, -74.05880),
    "COLUMBUS DR & MONMOUTH ST":      (40.71880, -74.04810),
    "RT 185 & RT 440":                (40.67750, -74.09870),
}

# ── Address abbreviation expansion ─────────────────────────────────────────
# ORDER MATTERS: longer patterns first to avoid partial matches

ABBREVS = [
    # Must come before shorter MLK pattern
    (r'\bMLK DR(?:IVE)?\b',     'Martin Luther King Drive'),
    (r'\bMLK\b',                'Martin Luther King Drive'),
    (r'\bJFK BLVD\b',           'Kennedy Boulevard'),
    (r'\bKENNEDY BLVD\b',       'Kennedy Boulevard'),
    (r'\bST PAULS AVE\b',       'Saint Pauls Avenue'),
    (r'\bWESTSIDE AVE\b',       'West Side Avenue'),
    (r'\bWEST SIDE AVE\b',      'West Side Avenue'),
    (r'\bST HWY 440 S\b',       'Route 440 South'),
    (r'\bST HWY 440\b',         'Route 440'),
    (r'\bROUTE 440 SOUTH\b',    'Route 440 South'),
    (r'\bROUTE 440\b',          'Route 440'),
    (r'\bRT 440\b',             'Route 440'),
    (r'\bROUTE 185\b',          'Route 185'),
    (r'\bRT 185\b',             'Route 185'),
    (r'\bUS 1.{0,2}9 NORTH\b',  'US Route 1 9 North'),
    (r'\bUS 1.{0,2}9 SOUTH\b',  'US Route 1 9 South'),
    (r'\bUS 1.{0,2}9\b',        'US Route 1 9'),
    (r'\bRT 1.{0,2}9\b',        'US Route 1 9'),
    (r'\bLOWER RT 139\b',       'Route 139'),
    (r'\bUPPER RT 139\b',       'Route 139'),
    (r'\bLOWER 139\b',          'Route 139'),
    (r'\bUPPER 139\b',          'Route 139'),
    (r'\bROUTE 139\b',          'Route 139'),
    (r'\bRT 139\b',             'Route 139'),
    (r'\bNJ 139\b',             'Route 139'),
    (r'\bPULASKI SKYWAY\b',     'Pulaski Skyway'),
    (r'\bJERSEY AVE(?:NUE)?\b', 'Jersey Avenue'),
    (r'\bNEWARK AVE\b',         'Newark Avenue'),
    (r'\bMONTGOMERY ST\b',      'Montgomery Street'),
    (r'\bMONMOUTH ST\b',        'Monmouth Street'),
    (r'\bWASHINGTON BLVD\b',    'Washington Boulevard'),
    (r'\bNEWPORT PKWY\b',       'Newport Parkway'),
    (r'\bCOLUMBUS DR\b',        'Columbus Drive'),
    (r'\bSECAUCUS RD\b',        'Secaucus Road'),
    (r'\bPATERSON PLANK RD\b',  'Paterson Plank Road'),
    (r'\bGARFIELD AVE\b',       'Garfield Avenue'),
    (r'\bWILKINSON\b',          'Wilkinson Avenue'),
    (r'\bDANFORTH AVE(?:NUE)?\b','Danforth Avenue'),
    (r'\bPORT JERSEY BLVD\b',   'Port Jersey Boulevard'),
    (r'\bTHEODORE CONRAD DR\b', 'Theodore Conrad Drive'),
    (r'\bEDWARD HART DR\b',     'Edward Hart Drive'),
    (r'\bCHOSIN FEW WAY\b',     'Chosin Few Way'),
    (r'\bPULASKI LN W\b',       'Pulaski Lane West'),
    (r'\bRESERVOIR AVE\b',      'Reservoir Avenue'),
    (r'\bPALISADE AVE\b',       'Palisade Avenue'),
    (r'\bSUMMIT AVE\b',         'Summit Avenue'),
    (r'\bPAVONIA AVE\b',        'Pavonia Avenue'),
    (r'\bCENTRAL AVE\b',        'Central Avenue'),
    (r'\bDUNCAN AVE\b',         'Duncan Avenue'),
    (r'\bFULTON AVE\b',         'Fulton Avenue'),
    (r'\bBRAMHALL\b',           'Bramhall Avenue'),
    (r'\bRAVINE AVE\b',         'Ravine Avenue'),
    (r'\bSHERMAN AVE\b',        'Sherman Avenue'),
    (r'\bDWIGHT ST\b',          'Dwight Street'),
    (r'\bMERSELES ST\b',        'Merseles Street'),
    (r'\bZABRISKIE ST\b',       'Zabriskie Street'),
    (r'\bBOWERS ST\b',          'Bowers Street'),
    (r'\bCLIFTON PL\b',         'Clifton Place'),
    (r'\bBEACON PL\b',          'Beacon Place'),
    (r'\bHERBERT PL\b',         'Herbert Place'),
    (r'\bCHARLES ST\b',         'Charles Street'),
    (r'\bJEFFERSON AVE\b',      'Jefferson Avenue'),
    (r'\bWALLIS AVE\b',         'Wallis Avenue'),
    (r'\bHALLECK AVE\b',        'Halleck Avenue'),
    (r'\bBALDWIN AVE\b',        'Baldwin Avenue'),
    (r'\bSIP\b',                'Sip Avenue'),
    (r'\bTONNELE AVE\b',        'Tonnele Avenue'),
    (r'\bVIRGINIA AVE\b',       'Virginia Avenue'),
    (r'\bNORTH ST\b',           'North Street'),
    (r'\bIRVING ST\b',          'Irving Street'),
    (r'\bUNION STREET\b',       'Union Street'),
    (r'\bMOUNTAIN RD\b',        'Mountain Road'),
    (r'\bNORTH DISTRICT LOT\b', 'North District'),
    # Shooting short-form streets
    (r'\bCATOR\b',              'Cator Avenue'),
    (r'\bOCEAN\b',              'Ocean Avenue'),
    (r'\bMALL DR\.? ?W\b',      'Mall Drive West'),
    (r'\bMALL DR\b',            'Mall Drive'),
    (r'\bMALLORY\b',            'Mallory Avenue'),
    (r'\bWILLIAMSON\b',         'Williamson Avenue'),
    (r'\bBRINKERHOFF\b',        'Brinkerhoff Avenue'),
    (r'\bMONTICELLO\b',         'Monticello Avenue'),
    (r'\bWOODLAND\b',           'Woodland Avenue'),
    (r'\bSACKETT\b',            'Sackett Street'),
    (r'\bOAK\b',                'Oak Street'),
    (r'\b6TH\b',                '6th Street'),
]

def clean_address(addr: str) -> str:
    a = addr.strip()
    for pat, repl in ABBREVS:
        a = re.sub(pat, repl, a, flags=re.IGNORECASE)
    a = a.replace('&', 'and').replace('  ', ' ').strip()
    return a


def mapbox_geocode(query: str):
    full = f"{query}, Jersey City, NJ"
    params = urllib.parse.urlencode({
        "access_token": MAPBOX_TOKEN,
        "proximity": f"{JC_LNG},{JC_LAT}",
        "country": "US",
        "limit": 1,
        "types": "address,poi",
    })
    url = (f"https://api.mapbox.com/geocoding/v5/mapbox.places/"
           f"{urllib.parse.quote(full)}.json?{params}")
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.loads(r.read())
        feats = data.get("features", [])
        if feats:
            lng, lat = feats[0]["geometry"]["coordinates"]
            if 40.66 <= lat <= 40.77 and -74.13 <= lng <= -74.02:
                return lat, lng
    except Exception:
        pass
    return None


def nominatim_geocode(query: str):
    full = f"{query}, Jersey City, NJ, USA"
    params = urllib.parse.urlencode({
        "q": full,
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
        "viewbox": "-74.13,40.66,-74.02,40.77",
        "bounded": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "JCImpact-geocoder/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        if data:
            lat, lng = float(data[0]["lat"]), float(data[0]["lon"])
            if 40.66 <= lat <= 40.77 and -74.13 <= lng <= -74.02:
                return lat, lng
    except Exception:
        pass
    return None


# ── main ───────────────────────────────────────────────────────────────────

with open(DATA_PATH) as f:
    data = json.load(f)
with open(CACHE_PATH) as f:
    cache = json.load(f)

bad_ids = {
    i["id"]
    for i in data["incidents"]
    if abs(i["lat"] - FALLBACK[0]) < 1e-5 and abs(i["lng"] - FALLBACK[1]) < 1e-5
}
print(f"Found {len(bad_ids)} incidents to fix\n")

fixed = 0
still_bad = []

for inc in data["incidents"]:
    if inc["id"] not in bad_ids:
        continue

    addr    = inc["address"]
    cleaned = clean_address(addr)

    # Pass 0: manual override
    if addr in MANUAL:
        lat, lng = MANUAL[addr]
        inc["lat"] = lat
        inc["lng"] = lng
        print(f"  MANUAL {addr!r:50s} → {lat:.5f}, {lng:.5f}")
        fixed += 1
        continue

    # Pass 1: cache
    if cleaned in cache:
        lat, lng = cache[cleaned]["lat"], cache[cleaned]["lng"]
        if not (abs(lat - FALLBACK[0]) < 1e-5 and abs(lng - FALLBACK[1]) < 1e-5):
            inc["lat"] = lat
            inc["lng"] = lng
            print(f"  CACHE  {addr!r:50s} → {lat:.5f}, {lng:.5f}")
            fixed += 1
            continue

    # Pass 2: Mapbox
    result = mapbox_geocode(cleaned)
    time.sleep(0.12)
    if result:
        lat, lng = result
        inc["lat"] = lat
        inc["lng"] = lng
        cache[cleaned] = {"lat": lat, "lng": lng}
        print(f"  MAPBOX {addr!r:50s} → {lat:.5f}, {lng:.5f}")
        fixed += 1
        continue

    # Pass 3: Nominatim
    result = nominatim_geocode(cleaned)
    time.sleep(1.1)   # Nominatim rate limit: 1 req/sec
    if result:
        lat, lng = result
        inc["lat"] = lat
        inc["lng"] = lng
        cache[cleaned] = {"lat": lat, "lng": lng}
        print(f"  OSM    {addr!r:50s} → {lat:.5f}, {lng:.5f}")
        fixed += 1
        continue

    still_bad.append(addr)
    print(f"  FAIL   {addr!r}  (tried: {cleaned!r})")

print(f"\n✓ Fixed: {fixed}  |  Still bad: {len(still_bad)}")
if still_bad:
    print("\nUnfixed:")
    for a in still_bad:
        print(f"  {a!r}")

with open(DATA_PATH, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print("\ndata.json updated.")
with open(CACHE_PATH, "w") as f:
    json.dump(cache, f, indent=2)
print("geocode-cache.json updated.")
