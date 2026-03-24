import { Incident, IncidentFeatureProperties } from '@/types';
import type { GeoJSON } from 'geojson';

export function incidentsToGeoJSON(incidents: Incident[]): GeoJSON.FeatureCollection<GeoJSON.Point, IncidentFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: incidents.map((inc) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [inc.lng, inc.lat],
      },
      properties: {
        id: inc.id,
        type: inc.type,
        date: inc.date,
        district: inc.district,
        address: inc.address,
        description: inc.description ?? '',
      },
    })),
  };
}

export function buildTypeFilter(showMVA: boolean, showShooting: boolean): mapboxgl.Expression {
  const types: string[] = [];
  if (showMVA) types.push('MVA');
  if (showShooting) types.push('Shooting');

  if (types.length === 0) {
    // Show nothing
    return ['==', ['get', 'type'], '__none__'] as unknown as mapboxgl.Expression;
  }
  if (types.length === 2) {
    // Show all (no filter needed beyond "not a cluster")
    return ['!', ['has', 'point_count']] as unknown as mapboxgl.Expression;
  }
  return [
    'all',
    ['!', ['has', 'point_count']],
    ['==', ['get', 'type'], types[0]],
  ] as unknown as mapboxgl.Expression;
}
