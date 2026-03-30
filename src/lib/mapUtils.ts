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
  showShotsFired: boolean,
  showShootingHit: boolean,
  showTheft: boolean,
  showStolenVehicle: boolean,
  showTrafficStop: boolean,
  showPedestrianStruck: boolean,
): mapboxgl.Expression {
  const types: string[] = [];
  if (showShotsFired)       types.push('Shots Fired');
  if (showShootingHit)      types.push('Shooting Hit');
  if (showMVA)              types.push('MVA');
  if (showTheft)            types.push('Theft');
  if (showStolenVehicle)    types.push('Stolen Vehicle');
  if (showTrafficStop)      types.push('Traffic Stop');
  if (showPedestrianStruck) types.push('Pedestrian Struck');

  if (types.length === 0) {
    return ['==', ['get', 'type'], '__none__'] as unknown as mapboxgl.Expression;
  }
  if (types.length === 7) {
    return ['!', ['has', 'point_count']] as unknown as mapboxgl.Expression;
  }
  return [
    'all',
    ['!', ['has', 'point_count']],
    ['in', ['get', 'type'], ['literal', types]],
  ] as unknown as mapboxgl.Expression;
}
