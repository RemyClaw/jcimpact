/** Metric colors — exact CompStat command dashboard palette */
export const METRIC_COLORS = {
  totalCrimes:    '#3B82F6',  // blue
  shootings:      '#EF4444',  // red
  homicides:      '#9CA3AF',  // gray
  mvas:           '#F59E0B',  // amber
  thefts:         '#F97316',  // orange
  stolenVehicles: '#22C55E',  // green
} as const;

/** District colors */
export const DISTRICT_COLORS: Record<string, string> = {
  North: '#4CC9F0',
  East:  '#7B61FF',
  West:  '#FF9F1C',
  South: '#F72585',
};
