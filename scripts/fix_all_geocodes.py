#!/usr/bin/env python3
import os
"""
fix_all_geocodes.py

Re-geocodes bad coordinate clusters in data.json.
For each unique address in a bad cluster, fetches a fresh coordinate from
Mapbox (primary) or Nominatim OSM (fallback), validates it falls inside
Jersey City's bounding box, and updates ALL matching incidents in data.json.

Usage:
    python3 scripts/fix_all_geocodes.py

Requirements: requests  (pip3 install requests)
"""

import json
import time
import re
import urllib.parse
import urllib.request
import urllib.error
from collections import defaultdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATA_PATH = "/Users/geremy/JCIMPACT/src/data/data.json"

MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN', '')  # Set via: export MAPBOX_TOKEN=your_token
JC_CENTER_LNG = -74.0776
JC_CENTER_LAT = 40.7282

# Jersey City bounding box (lat_min, lat_max, lng_min, lng_max)
JC_BBOX = (40.66, 40.77, -74.13, -74.02)

MAPBOX_DELAY  = 0.15   # seconds between Mapbox calls
NOMINATIM_DELAY = 1.1  # seconds between Nominatim calls

# ---------------------------------------------------------------------------
# Bad clusters — the (lat, lng) pairs that are known fallback/wrong coords.
# Only non-Shooting incidents at these coordinates will be re-geocoded.
# ---------------------------------------------------------------------------
BAD_COORDS = {
    (40.714965, -74.096301),   # highway 440 fallback
    (40.713857, -74.075607),   # JFK Blvd centroid
    (40.71145,  -74.06264),    # Communipaw/HWY 440 cluster
    (40.736625, -74.083613),   # Pulaski/Route 7 cluster
    (40.748549, -74.047615),   # Heights intersections cluster
    (40.7354,   -74.0816),     # US 1&9/Duncan cluster
    (40.73529,  -74.081804),   # Newark Ave/Route 1&9 cluster
    (40.753996, -74.05645),    # Tonnele highway ramp cluster
    (40.720149, -74.094337),   # Additional RT-440 cluster
    (40.732996, -74.062937),   # JFK/Kennedy/Newark mix
    (40.719006, -74.041352),   # Columbus Dr / Florence St mix
    (40.72015,  -74.09434),    # ST HWY 440 S / Avenue C
    (40.72039,  -74.09424),    # variant of above
    (40.745497, -74.062304),   # Tonnele & Carlton — verify
    (40.748549, -74.047615),   # Heights cluster duplicate check
    (40.73887,  -74.06186),    # Pulaski Skyway / NJ 139 check
    (40.7354,   -74.08160),    # Duncan Ave variant
    (40.73540,  -74.08160),    # Duncan Ave variant 2
}

# ---------------------------------------------------------------------------
# Highway / abbreviation expansion map
# Applied to the address BEFORE sending to the geocoder.
# Order matters — longer patterns first.
# ---------------------------------------------------------------------------
EXPANSIONS = [
    # State Highway 440
    (r'\bST HWY 440 N\b',       'Route 440 North'),
    (r'\bST HWY 440 S\b',       'Route 440 South'),
    (r'\bST HWY 440\b',         'Route 440'),
    (r'\bHWY 440\b',            'Route 440'),
    (r'\bRT 440\b',             'Route 440'),
    (r'\bROUTE 440 SOUTH\b',    'Route 440 South'),
    (r'\bROUTE 440\b',          'Route 440'),
    (r'\b440\b(?= &| AND)',     'Route 440'),   # bare "440" in intersection

    # US 1&9
    (r'\bUS 1&9 NORTH\b',       'US Route 1 and 9 North'),
    (r'\bUS 1&9 SOUTH\b',       'US Route 1 and 9 South'),
    (r'\bUS 1&9\b',             'US Route 1 and 9'),
    (r'\b1&9 NORTH\b',          'US Route 1 and 9 North'),
    (r'\b1&9 SOUTH\b',          'US Route 1 and 9 South'),
    (r'\b1&9\b',                'US Route 1 and 9'),
    (r'\bROUTE 1&9\b',          'US Route 1 and 9'),
    (r'\bRT 1 & 9\b',           'US Route 1 and 9'),
    (r'\bRT 1&9\b',             'US Route 1 and 9'),

    # Route 139 / Lower 139
    (r'\bLOWER 139\b',          'Route 139'),
    (r'\bLOWER RT 139\b',       'Route 139'),
    (r'\bRT 139 RAMP\b',        'Route 139'),
    (r'\bRT 139\b',             'Route 139'),
    (r'\bROUTE 139\b',          'Route 139'),

    # Route 7 / Pulaski Skyway
    (r'\bROUTE 7\b',            'Route 7'),
    (r'\bPULASKI SKYWAY\b',     'Pulaski Skyway'),

    # Route 185
    (r'\bRT 185\b',             'Route 185'),

    # JFK Blvd variants
    (r'\bJFK BLVD\b',           'John F Kennedy Boulevard'),
    (r'\bJFK\b',                'John F Kennedy Boulevard'),
    (r'\bKENNEDY BLVD\b',       'Kennedy Boulevard'),

    # Tonnele / Tonnelle (both spellings exist)
    (r'\bTONNELLE AVE\b',       'Tonnelle Avenue'),
    (r'\bTONNELE AVE\b',        'Tonnelle Avenue'),
    (r'\bTONNELLE CIRCLE\b',    'Tonnelle Circle'),
    (r'\bTONNELE CIRCLE\b',     'Tonnelle Circle'),

    # Communipaw
    (r'\bCOMMUNIPAW AVE\b',     'Communipaw Avenue'),

    # Misc
    (r'\bSECAUCUS ROAD RAMP\b', 'Secaucus Road'),
    (r'\bBROADWAY\b',           'Broadway'),
]


def expand_highway(address: str) -> str:
    """Apply highway name expansions to a raw address string."""
    result = address.upper()
    for pattern, replacement in EXPANSIONS:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def build_geocode_query(address: str) -> str:
    """
    Convert a raw incident address into a clean geocoding query.

    Rules:
    - Intersection (contains & or AND): "Street A at Street B, Jersey City NJ"
    - Already contains Jersey City: just expand and return
    - Otherwise: append ", Jersey City NJ"
    """
    expanded = expand_highway(address)

    # Strip trailing zip / state junk like ", NJ 07305" or ", JERSEY CITY, NJ 07305"
    expanded = re.sub(
        r',?\s*(JERSEY CITY,?\s*)?NJ\s*\d{5}(-\d{4})?.*$',
        '',
        expanded,
        flags=re.IGNORECASE,
    ).strip().rstrip(',').strip()

    # Normalise intersection separators to " at "
    if re.search(r'\s+(&|AND)\s+', expanded, re.IGNORECASE):
        expanded = re.sub(r'\s+(&|AND)\s+', ' at ', expanded, flags=re.IGNORECASE)
        query = f"{expanded}, Jersey City NJ"
    else:
        query = f"{expanded}, Jersey City NJ"

    return query


def in_jc_bbox(lat: float, lng: float) -> bool:
    """Return True if coordinate falls within Jersey City bounding box."""
    lat_min, lat_max, lng_min, lng_max = JC_BBOX
    return lat_min <= lat <= lat_max and lng_min <= lng <= lng_max


def http_get_json(url: str, headers: dict = None):
    """Simple HTTP GET that returns parsed JSON or None on error."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        print(f"    HTTP error: {exc}")
        return None


def geocode_mapbox(query: str):
    """
    Geocode with Mapbox Geocoding API.
    Returns (lat, lng) or None.
    """
    encoded = urllib.parse.quote(query)
    url = (
        f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded}.json"
        f"?access_token={MAPBOX_TOKEN}"
        f"&proximity={JC_CENTER_LNG},{JC_CENTER_LAT}"
        f"&country=US"
        f"&limit=1"
    )
    data = http_get_json(url)
    if not data:
        return None
    features = data.get("features", [])
    if not features:
        return None
    coords = features[0].get("geometry", {}).get("coordinates", [])
    if len(coords) < 2:
        return None
    lng, lat = coords[0], coords[1]
    if in_jc_bbox(lat, lng):
        return lat, lng
    print(f"    Mapbox result out of JC bbox: [{lat}, {lng}]")
    return None


def geocode_nominatim(query: str):
    """
    Geocode with Nominatim OSM as fallback.
    Returns (lat, lng) or None.
    """
    encoded = urllib.parse.quote(query)
    url = (
        f"https://nominatim.openstreetmap.org/search"
        f"?q={encoded}&format=json&limit=1&countrycodes=us"
        f"&viewbox=-74.13,40.66,-74.02,40.77&bounded=1"
    )
    headers = {"User-Agent": "JCImpact-geocoder/1.0"}
    data = http_get_json(url, headers=headers)
    if not data:
        return None
    if not isinstance(data, list) or len(data) == 0:
        return None
    item = data[0]
    try:
        lat = float(item["lat"])
        lng = float(item["lon"])
    except (KeyError, ValueError):
        return None
    if in_jc_bbox(lat, lng):
        return lat, lng
    print(f"    Nominatim result out of JC bbox: [{lat}, {lng}]")
    return None


def geocode(address: str):
    """Try Mapbox first, then Nominatim. Returns (lat, lng) or None."""
    query = build_geocode_query(address)
    print(f"    Query: {query!r}")

    # --- Mapbox ---
    time.sleep(MAPBOX_DELAY)
    result = geocode_mapbox(query)
    if result:
        print(f"    Mapbox -> [{result[0]}, {result[1]}]")
        return result

    print(f"    Mapbox failed, trying Nominatim...")

    # --- Nominatim fallback ---
    time.sleep(NOMINATIM_DELAY)
    result = geocode_nominatim(query)
    if result:
        print(f"    Nominatim -> [{result[0]}, {result[1]}]")
        return result

    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 70)
    print("fix_all_geocodes.py — re-geocoding bad coordinate clusters")
    print("=" * 70)

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Support both bare list and object-with-key formats
    is_list = isinstance(data, list)
    incidents = data if is_list else data.get("incidents", [])

    print(f"\nLoaded {len(incidents)} incidents from {DATA_PATH}\n")

    # ------------------------------------------------------------------
    # Step 1: collect all unique addresses in bad clusters (non-Shooting)
    # ------------------------------------------------------------------
    # Map: address -> list of incident indices that need updating
    addr_to_indices = defaultdict(list)

    for i, inc in enumerate(incidents):
        lat = inc.get("lat")
        lng = inc.get("lng")
        inc_type = inc.get("type", "")
        if (lat, lng) in BAD_COORDS and inc_type != "Shooting":
            addr = inc.get("address", "").strip()
            if addr:
                addr_to_indices[addr].append(i)

    print(f"Unique addresses to re-geocode: {len(addr_to_indices)}")
    print(f"Total incidents affected:       {sum(len(v) for v in addr_to_indices.values())}\n")

    # ------------------------------------------------------------------
    # Step 2: geocode each unique address once, then patch all incidents
    # ------------------------------------------------------------------
    fixed_count = 0
    fail_count  = 0
    results_log = []

    for addr, indices in sorted(addr_to_indices.items()):
        inc_ids = [incidents[i].get("id", f"idx-{i}") for i in indices]
        old_lat = incidents[indices[0]].get("lat")
        old_lng = incidents[indices[0]].get("lng")

        print(f"\nAddress : {addr!r}")
        print(f"IDs     : {', '.join(str(x) for x in inc_ids)}")
        print(f"Old coords: [{old_lat}, {old_lng}]")

        new_coords = geocode(addr)

        if new_coords:
            new_lat, new_lng = new_coords
            for idx in indices:
                incidents[idx]["lat"] = new_lat
                incidents[idx]["lng"] = new_lng
            fixed_count += len(indices)
            results_log.append(("FIXED", addr, old_lat, old_lng, new_lat, new_lng, inc_ids))
            print(f"    FIXED -> [{new_lat}, {new_lng}]  ({len(indices)} incident(s) updated)")
        else:
            fail_count += len(indices)
            results_log.append(("FAIL", addr, old_lat, old_lng, None, None, inc_ids))
            print(f"    FAIL  — no valid coordinate found, incident(s) unchanged")

    # ------------------------------------------------------------------
    # Step 3: save
    # ------------------------------------------------------------------
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for status, addr, old_lat, old_lng, new_lat, new_lng, inc_ids in results_log:
        if status == "FIXED":
            print(
                f"FIXED  [{old_lat}, {old_lng}] -> [{new_lat}, {new_lng}]  "
                f"'{addr}'  IDs: {', '.join(str(x) for x in inc_ids)}"
            )
        else:
            print(
                f"FAIL   [{old_lat}, {old_lng}] -> ???  "
                f"'{addr}'  IDs: {', '.join(str(x) for x in inc_ids)}"
            )

    print(f"\nTotal incidents fixed : {fixed_count}")
    print(f"Total incidents failed: {fail_count}")

    if fixed_count > 0:
        out = data if is_list else {**data, "incidents": incidents}
        if not is_list:
            out["incidents"] = incidents
        else:
            out = incidents

        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f"\nSaved updated data.json -> {DATA_PATH}")
    else:
        print("\nNo changes to save.")


if __name__ == "__main__":
    main()
