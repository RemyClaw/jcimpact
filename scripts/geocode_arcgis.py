#!/usr/bin/env python3
"""
Re-geocode ALL non-Shooting incidents using ArcGIS World Geocoding Service.
ArcGIS has a dedicated intersection locator — far more accurate than Mapbox
for police-style address data (cross streets, abbreviations, highway refs).

No API key required. Free public endpoint.
"""

import json, urllib.request, urllib.parse, time, re
from collections import defaultdict

DATA = "/Users/geremy/JCIMPACT/src/data/data.json"
JC_BOX = (40.66, 40.77, -74.13, -74.02)  # lat_min, lat_max, lng_min, lng_max

# ArcGIS World Geocoding — findAddressCandidates endpoint
ARCGIS_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"

# Minimum score threshold (0-100). ArcGIS scores intersections accurately.
MIN_SCORE = 75

# ── Address normalisation ──────────────────────────────────────────────────
ABBREVS = [
    # Highways — expand BEFORE generic patterns
    (r'\bST HWY 440 S\b',          'Route 440 South'),
    (r'\bST HWY 440 N\b',          'Route 440 North'),
    (r'\bST HWY 440\b',            'Route 440'),
    (r'\bHWY 440\b',               'Route 440'),
    (r'\bRT 440\b',                'Route 440'),
    (r'\bROUTE 440 SOUTH\b',       'Route 440 South'),
    (r'\bROUTE 440\b',             'Route 440'),
    (r'\bUS 1.{0,3}9 NORTH\b',     'US Route 1 9 North'),
    (r'\bUS 1.{0,3}9 SOUTH\b',     'US Route 1 9 South'),
    (r'\bUS 1.{0,3}9\b',           'US Route 1 9'),
    (r'\bROUTE 1.{0,3}9\b',        'US Route 1 9'),
    (r'\bRT 1.{0,3}9\b',           'US Route 1 9'),
    (r'\b1&9 TONNELE AVE\b',       'Tonnele Avenue'),  # "1&9 Tonnele Ave & Carlton" → just Tonnele
    (r'\bLOWER RT 139\b',          'Route 139'),
    (r'\bUPPER RT 139\b',          'Route 139'),
    (r'\bLOWER 139\b',             'Route 139'),
    (r'\bUPPER 139\b',             'Route 139'),
    (r'\bROUTE 139\b',             'Route 139'),
    (r'\bRT 139 RAMP\b',           'Route 139'),
    (r'\bRT 139\b',                'Route 139'),
    (r'\bNJ 139\b',                'Route 139'),
    (r'\bROUTE 7\b',               'Route 7'),
    (r'\bRT 185\b',                'Route 185'),
    (r'\bROUTE 185\b',             'Route 185'),
    (r'\bPULASKI SKYWAY\b',        'Pulaski Skyway'),
    # JFK / Kennedy variations
    (r'\bJFK BLVD\b',              'Kennedy Boulevard'),
    (r'\bJFK\b',                   'Kennedy Boulevard'),
    (r'\bKENNEDY BLVD\b',          'Kennedy Boulevard'),
    (r'\bMLK DR(?:IVE)?\b',        'Martin Luther King Drive'),
    (r'\bMLK\b',                   'Martin Luther King Drive'),
    # Tonnele spelling variants
    (r'\bTONNELLE AVE\b',          'Tonnele Avenue'),
    (r'\bTONNELLE CIRCLE\b',       'Tonnele Circle'),
    (r'\bTONNELE CIRCLE\b',        'Tonnele Circle'),
    # Common street abbreviations
    (r'\bST PAULS AVE\b',          'Saint Pauls Avenue'),
    (r'\bWESTSIDE AVE\b',          'West Side Avenue'),
    (r'\bCOMMUNIPAW AVE\b',        'Communipaw Avenue'),
    (r'\bNEWARK AVE\b',            'Newark Avenue'),
    (r'\bMONTGOMERY ST\b',         'Montgomery Street'),
    (r'\bMONMOUTH ST\b',           'Monmouth Street'),
    (r'\bWASHINGTON BLVD\b',       'Washington Boulevard'),
    (r'\bNEWPORT PKWY\b',          'Newport Parkway'),
    (r'\bCOLUMBUS DR(?:IVE)?\b',   'Columbus Drive'),
    (r'\bSECAUCUS RD\b',           'Secaucus Road'),
    (r'\bSECAUCUS ROAD RAMP\b',    'Secaucus Road'),
    (r'\bPATERSON PLANK RD\b',     'Paterson Plank Road'),
    (r'\bGARFIELD AVE\b',          'Garfield Avenue'),
    (r'\bDANFORTH AVE\b',          'Danforth Avenue'),
    (r'\bPORT JERSEY BLVD\b',      'Port Jersey Boulevard'),
    (r'\bRESERVOIR AVE\b',         'Reservoir Avenue'),
    (r'\bPALISADE AVE\b',          'Palisade Avenue'),
    (r'\bSUMMIT AVE\b',            'Summit Avenue'),
    (r'\bPAVONIA AVE\b',           'Pavonia Avenue'),
    (r'\bCENTRAL AVE\b',           'Central Avenue'),
    (r'\bBERGEN AVE\b',            'Bergen Avenue'),
    (r'\bDUNCAN AVE\b',            'Duncan Avenue'),
    (r'\bFULTON AVE\b',            'Fulton Avenue'),
    (r'\bBRAMHALL\b',              'Bramhall Avenue'),
    (r'\bRAVINE AVE\b',            'Ravine Avenue'),
    (r'\bSHERMAN AVE\b',           'Sherman Avenue'),
    (r'\bZABRISKIE ST\b',          'Zabriskie Street'),
    (r'\bCHARLES ST\b',            'Charles Street'),
    (r'\bJEFFERSON AVE\b',         'Jefferson Avenue'),
    (r'\bWALLIS AVE\b',            'Wallis Avenue'),
    (r'\bHALLECK AVE\b',           'Halleck Avenue'),
    (r'\bBALDWIN AVE\b',           'Baldwin Avenue'),
    (r'\bTONNELE AVE\b',           'Tonnele Avenue'),
    (r'\bVIRGINIA AVE\b',          'Virginia Avenue'),
    (r'\bNORTH ST\b',              'North Street'),
    (r'\bIRVING ST\b',             'Irving Street'),
    (r'\bGRANT AVE\b',             'Grant Avenue'),
    (r'\bLEXINGTON AVE\b',         'Lexington Avenue'),
    (r'\bSIP AVE\b',               'Sip Avenue'),
    (r'\bCULVER AVE\b',            'Culver Avenue'),
    (r'\bBEACH ST\b',              'Beach Street'),
    (r'\bFLORENCE ST\b',           'Florence Street'),
    (r'\bTHORNE ST\b',             'Thorne Street'),
    (r'\bMARIN BLVD\b',            'Marin Boulevard'),
    (r'\bJERSEY AVE\b',            'Jersey Avenue'),
    (r'\bAVENUE C\b',              'Avenue C'),
    (r'\bMALLORY\b',               'Mallory Avenue'),
    (r'\bWILKINSON\b',             'Wilkinson Avenue'),
    (r'\bCARLTON AVE\b',           'Carlton Avenue'),
    (r'\bPACIFIC AVE\b',           'Pacific Avenue'),
    (r'\bANYON ST\b',              'Anyon Street'),
    (r'\bSTUYVESANT\b',            'Stuyvesant Avenue'),
    (r'\bBOWERS ST\b',             'Bowers Street'),
    (r'\bPALISADE AVE\b',          'Palisade Avenue'),
    (r'\bDWIGHT ST\b',             'Dwight Street'),
    (r'\bMERSELES ST\b',           'Merseles Street'),
    (r'\bCLIFTON PL\b',            'Clifton Place'),
    (r'\bHERBERT PL\b',            'Herbert Place'),
    (r'\bUNION ST(?:REET)?\b',     'Union Street'),
]

def clean(addr: str) -> str:
    # Strip city/state/zip suffix
    a = re.sub(r',?\s*JERSEY CITY.*$', '', addr, flags=re.IGNORECASE).strip()
    a = re.sub(r',?\s*NJ\s*\d{5}.*$', '', a, flags=re.IGNORECASE).strip()
    for pat, repl in ABBREVS:
        a = re.sub(pat, repl, a, flags=re.IGNORECASE)
    return a.strip()

def in_jc(lat, lng):
    return JC_BOX[0] <= lat <= JC_BOX[1] and JC_BOX[2] <= lng <= JC_BOX[3]

def arcgis_geocode(address: str):
    """
    Use ArcGIS findAddressCandidates.
    For intersections, ArcGIS uses " & " or " at " and the IntersectionAddr locator.
    """
    params = urllib.parse.urlencode({
        "SingleLine": f"{address}, Jersey City, NJ",
        "outFields":  "Score,Addr_type",
        "maxLocations": 3,
        "forStorage": "false",
        "f": "json",
        "location": "-74.0776,40.7282",   # proximity bias to JC
        "distance": 20000,                 # within 20km
        "countryCode": "USA",
    })
    url = f"{ARCGIS_URL}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JCImpact/2.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        candidates = data.get("candidates", [])
        for c in candidates:
            score = c.get("score", 0)
            loc   = c.get("location", {})
            lat   = loc.get("y")
            lng   = loc.get("x")
            addr_type = c.get("attributes", {}).get("Addr_type", "")
            if score >= MIN_SCORE and lat and lng and in_jc(lat, lng):
                return lat, lng, score, addr_type
    except Exception as e:
        print(f"    ArcGIS error: {e}")
    return None, None, 0, ""

# ── Main ──────────────────────────────────────────────────────────────────

with open(DATA) as f:
    data = json.load(f)

incidents = data["incidents"]
print(f"Loaded {len(incidents)} incidents\n")

# Collect all unique addresses for non-Shooting incidents
addr_map = defaultdict(list)  # address → [indices]
for i, inc in enumerate(incidents):
    if inc["type"] != "Shooting":
        addr_map[inc["address"]].append(i)

unique_count = len(addr_map)
print(f"Unique non-Shooting addresses to geocode: {unique_count}")
print(f"Estimated time: ~{unique_count * 0.3 / 60:.1f} minutes\n")

fixed = 0
low_score = 0
failed = 0
results = {}

for idx, (raw_addr, indices) in enumerate(sorted(addr_map.items())):
    cleaned = clean(raw_addr)
    lat, lng, score, addr_type = arcgis_geocode(cleaned)
    time.sleep(0.25)  # polite rate limit

    if lat and lng:
        for i in indices:
            incidents[i]["lat"] = lat
            incidents[i]["lng"] = lng
        results[raw_addr] = (lat, lng, score, addr_type)
        fixed += len(indices)
        status = f"✓ {score:3.0f} [{addr_type:20s}]"
    else:
        results[raw_addr] = None
        failed += len(indices)
        status = "✗ FAIL                       "

    print(f"[{idx+1:3d}/{unique_count}] {status}  {cleaned[:60]}")

# ── Summary ───────────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print(f"Fixed:  {fixed} incidents")
print(f"Failed: {failed} incidents")

if failed:
    print("\nFailed addresses:")
    for addr, res in results.items():
        if res is None:
            print(f"  {addr}")

with open(DATA, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print(f"\nSaved → {DATA}")
