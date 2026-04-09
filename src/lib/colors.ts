import type { IncidentType } from '@/types';

/** Metric colors — exact CompStat command dashboard palette */
export const METRIC_COLORS = {
  totalCrimes:    '#3B82F6',  // blue
  shootings:      '#EF4444',  // red (aggregate)
  homicides:      '#9CA3AF',  // gray
  mvas:           '#F59E0B',  // amber
  thefts:         '#F97316',  // orange
  stolenVehicles: '#22C55E',  // green
} as const;

/** Dot/map colors by incident type — single source of truth */
export const TYPE_COLORS: Record<IncidentType, string> = {
  'Shots Fired':      '#F87171',
  'Shooting Hit':     '#DC2626',
  'MVA':              '#F59E0B',
  'Theft':            '#3b82f6',
  'Stolen Vehicle':   '#22C55E',
  'Traffic Stop':     '#A78BFA',  // purple
  'Pedestrian Struck':'#F472B6',  // pink
};

/** District colors */
export const DISTRICT_COLORS: Record<string, string> = {
  North: '#4CC9F0',
  East:  '#7B61FF',
  West:  '#FF9F1C',
  South: '#F72585',
};
