import StatCard from './StatCard';
import { SummaryStats } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

interface StatCardsRowProps {
  citywide: SummaryStats['citywide'];
}

// Jan–Feb 2025 actuals from JCPD CompStat — used to derive YoY trend direction
const PREV_YTD = { shootings: 5, thefts: 420, stolenVehicles: 119 };

export default function StatCardsRow({ citywide }: StatCardsRowProps) {
  const t = (cur: number, prev: number): 'up' | 'down' =>
    cur >= prev ? 'up' : 'down';

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto">
      <StatCard label="Total Crimes"  value={citywide.totalCrimes}    color={METRIC_COLORS.totalCrimes}    index={0} />
      <StatCard label="Shootings"     value={citywide.shootings}      color={METRIC_COLORS.shootings}      index={1} critical trend={t(citywide.shootings, PREV_YTD.shootings)} />
      <StatCard label="Homicides"     value={citywide.homicides}      color={METRIC_COLORS.homicides}      index={2} critical />
      <StatCard label="Car Accidents" value={citywide.mvas}           color={METRIC_COLORS.mvas}           index={3} />
      <StatCard label="Thefts"        value={citywide.thefts}         color={METRIC_COLORS.thefts}         index={4} trend={t(citywide.thefts, PREV_YTD.thefts)} />
      <StatCard label="Stolen Cars"   value={citywide.stolenVehicles} color={METRIC_COLORS.stolenVehicles} index={5} trend={t(citywide.stolenVehicles, PREV_YTD.stolenVehicles)} />
    </div>
  );
}
