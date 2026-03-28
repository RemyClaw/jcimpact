import StatCard from './StatCard';
import { SummaryStats } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

interface StatCardsRowProps {
  citywide: SummaryStats['citywide'];
}

export default function StatCardsRow({ citywide }: StatCardsRowProps) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto">
      <StatCard label="Total Crimes"  value={citywide.totalCrimes}    color={METRIC_COLORS.totalCrimes}    index={0} />
      <StatCard label="Shootings"     value={citywide.shootings}      color={METRIC_COLORS.shootings}      index={1} critical />
      <StatCard label="Homicides"     value={citywide.homicides}      color={METRIC_COLORS.homicides}      index={2} critical />
      <StatCard label="Car Accidents" value={citywide.mvas}           color={METRIC_COLORS.mvas}           index={3} />
      <StatCard label="Thefts"        value={citywide.thefts}         color={METRIC_COLORS.thefts}         index={4} />
      <StatCard label="Stolen Cars"   value={citywide.stolenVehicles} color={METRIC_COLORS.stolenVehicles} index={5} />
    </div>
  );
}
