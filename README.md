# JC IMPACT

**Integrated Metrics for Public Accountability & Community Trust**

A public-facing crime and public-safety incident dashboard for Jersey City, NJ, built for the JCPD IMPACT program.

Live at: https://jcimpact.vercel.app

---

## What this shows

An interactive map and stat panel covering the incident categories tracked by the IMPACT program:

| Category | Source |
|----------|--------|
| Shots Fired | JCPD reports |
| Shooting Hit | JCPD reports |
| Motor Vehicle Accidents (MVAs) | NJ Crash Reports |
| Pedestrian Struck | CAD / MV Crash Pedestrian |
| Traffic Stops | JCPD CAD |
| Theft | JCPD reports |
| Stolen Vehicle | JCPD reports |

**This dashboard is a subset, not a complete crime report.** Categories outside IMPACT's tracking scope (e.g., domestic violence, drug offenses, weapons offenses) are not displayed.

All figures are preliminary and subject to further analysis and revision.

## Data handling

Every record is:
- **Geocoded** via ArcGIS World Geocoder → validated/snapped to the actual street-network intersection via OpenStreetMap where applicable
- **District-assigned** by point-in-polygon against the official JCPD district boundaries
- **PII-stripped** before publication: no officer names, victim/suspect names, case numbers, license plates, VINs, or vehicle details reach `data.json`

Source CSV/PDF exports are processed through scripts under `scripts/` and committed as a static `src/data/data.json`. There is no backend, no database, and no user-submitted data.

## Stack

- **Next.js 14** (App Router, static export)
- **TypeScript**
- **Tailwind CSS**
- **Mapbox GL JS** (URL-restricted public token)
- **framer-motion** for stat animations

Hosted on Vercel.

## Local development

```bash
cp .env.example .env.local
# Edit .env.local and set NEXT_PUBLIC_MAPBOX_TOKEN to a URL-restricted Mapbox public token

npm install
npm run dev
# Open http://localhost:3000
```

## Data pipeline — adding a new week of incidents

Each incident category has a dedicated import script under `scripts/mva-import/`. Weekly imports follow this pattern:

```bash
# 1. MVAs (from the weekly crash CSV)
python3 scripts/mva-import/import_crashes_wk<N>.py --apply

# 2. Traffic stops
python3 scripts/mva-import/import_traffic_stops_wk<N>.py --apply

# 3. Stolen vehicles
python3 scripts/mva-import/import_stolen_vehicles_wk<N>.py --apply

# 4. Validate geocodes across all types against OpenStreetMap streets
python3 scripts/street-audit/validate_against_osm.py
python3 scripts/street-audit/regeocode_from_osm.py --apply   # optional, snaps bad records
```

Address-only records (a road name with no cross street) are dropped — they geocode to an arbitrary midpoint and are misleading on the map.

## Security

- Mapbox token is a **public** token (`pk.*`) with URL restrictions to the deployed origins. No secret scopes.
- No API routes, no serverless functions, no user input accepted.
- CSP, HSTS, X-Frame-Options, and Permissions-Policy are enforced in `next.config.mjs`.
- See [`SECURITY.md`](./SECURITY.md) for responsible disclosure.

## License

See [`LICENSE`](./LICENSE).
