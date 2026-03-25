// Superseded by src/data/data.json
// All summary stats now loaded from data.json in page.tsx.
import type { SummaryStats } from '@/types';
export const summaryStats: SummaryStats = {
  citywide:      { totalCrimes: 0, shootings: 0, homicides: 0, mvas: 0, thefts: 0, stolenVehicles: 0 },
  byDistrict:    [],
  monthlyTrends: [],
};
