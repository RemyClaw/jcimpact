import type { IncidentType } from '@/types';

/** Metric colors — exact CompStat command dashboard palette */
export const METRIC_COLORS = {
  totalCrimes:      '#3B82F6',  // blue
  shootings:        '#EF4444',  // red (aggregate)
  homicides:        '#9CA3AF',  // gray
  mvas:             '#F59E0B',  // amber
  thefts:           '#F97316',  // orange
  stolenVehicles:   '#22C55E',  // green
  trafficStops:     '#A78BFA',  // purple — matches map dot
  pedestrianStruck: '#F472B6',  // pink — matches map dot
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
