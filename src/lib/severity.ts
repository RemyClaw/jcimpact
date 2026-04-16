import type { Incident, IncidentType } from '@/types';

/**
 * Severity weights for the heatmap layer.
 *
 * A Shooting Hit counts ~33× more than a Traffic Stop. This is the key
 * insight that separates our heatmap from a naive "where are all the dots"
 * heatmap — high-severity incidents dominate the color ramp, so the map
 * actually highlights public-safety priorities instead of enforcement
 * activity corridors.
 *
 * If JCPD has formal priority rankings, replace these numbers — the rest
 * of the pipeline consumes them directly.
 */
export const SEVERITY_WEIGHTS: Record<IncidentType, number> = {
  'Shooting Hit':      10,
  'Shots Fired':        7,
  'Pedestrian Struck':  6,
  'MVA':                2,
  'Stolen Vehicle':   1.5,
  'Theft':              1,
  'Traffic Stop':     0.3,
};

// ─────────────────────────────────────────────────────────────────────────
// Hotspot detection — grid-bucket nearby incidents, rank by severity sum
// ─────────────────────────────────────────────────────────────────────────

export interface Hotspot {
  lng: number;
  lat: number;
  score: number;            // sum of severity weights in this cell
  count: number;            // raw incident count
  breakdown: Partial<Record<IncidentType, number>>;
  addr: string;             // representative address (first incident in the cluster)
  districts: string[];      // unique districts in the cluster
}

/** ~300ft ≈ 0.0012° of latitude at Jersey City's position. Close enough. */
const CELL_SIZE_DEG = 0.0012;

/** A cluster needs at least this many incidents before it earns a badge. */
export const HOTSPOT_MIN_CLUSTER = 4;

/** Max number of badges to render. More than this looks like wallpaper. */
export const HOTSPOT_MAX = 5;

export function detectHotspots(incidents: Incident[]): Hotspot[] {
  if (incidents.length === 0) return [];

  const buckets = new Map<string, Incident[]>();
  for (const inc of incidents) {
    if (typeof inc.lat !== 'number' || typeof inc.lng !== 'number') continue;
    const gx = Math.floor(inc.lng / CELL_SIZE_DEG);
    const gy = Math.floor(inc.lat / CELL_SIZE_DEG);
    const key = `${gx}:${gy}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(inc);
  }

  const candidates: Hotspot[] = [];
  for (const group of Array.from(buckets.values())) {
    if (group.length < HOTSPOT_MIN_CLUSTER) continue;

    const score = group.reduce((sum, i) => sum + (SEVERITY_WEIGHTS[i.type] ?? 0), 0);
    const breakdown: Partial<Record<IncidentType, number>> = {};
    for (const i of group) breakdown[i.type] = (breakdown[i.type] ?? 0) + 1;

    const cLng = group.reduce((s, i) => s + i.lng, 0) / group.length;
    const cLat = group.reduce((s, i) => s + i.lat, 0) / group.length;

    candidates.push({
      lng: cLng,
      lat: cLat,
      score,
      count: group.length,
      breakdown,
      addr: group[0].address,
      districts: Array.from(new Set(group.map(i => i.district as string))),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, HOTSPOT_MAX);
}
