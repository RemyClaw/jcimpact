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

export function buildTypeFilter(
  showMVA: boolean,
  showShooting: boolean,
  showTheft: boolean,
  showStolenVehicle: boolean,
): mapboxgl.Expression {
  const types: string[] = [];
  if (showShooting)     types.push('Shooting');
  if (showMVA)          types.push('MVA');
  if (showTheft)        types.push('Theft');
  if (showStolenVehicle) types.push('Stolen Vehicle');

  if (types.length === 0) {
    return ['==', ['get', 'type'], '__none__'] as unknown as mapboxgl.Expression;
  }
  if (types.length === 4) {
    return ['!', ['has', 'point_count']] as unknown as mapboxgl.Expression;
  }
  return [
    'all',
    ['!', ['has', 'point_count']],
    ['in', ['get', 'type'], ['literal', types]],
  ] as unknown as mapboxgl.Expression;
}
