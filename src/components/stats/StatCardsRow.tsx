import StatCard from './StatCard';
import { SummaryStats } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

interface StatCardsRowProps {
  citywide: SummaryStats['citywide'] & {
    shotsFired?: number;
    shootingHit?: number;
  };
}

export default function StatCardsRow({ citywide }: StatCardsRowProps) {
  const sf = citywide.shotsFired  ?? 0;
  const sh = citywide.shootingHit ?? 0;
  const shootingsSubtitle =
    citywide.shootings > 0 ? `${sf} fired · ${sh} hit` : undefined;

  return (
    <div className="grid grid-cols-2 gap-1 md:flex md:items-stretch md:gap-1.5">
      <StatCard label="Tracked Incidents" value={citywide.totalCrimes}      color={METRIC_COLORS.totalCrimes}      index={0} />
      <StatCard label="Shootings"         value={citywide.shootings}        color={METRIC_COLORS.shootings}        index={1} critical subtitle={shootingsSubtitle} />
      <StatCard label="Homicides"         value={citywide.homicides}        color={METRIC_COLORS.homicides}        index={2} critical />
      <StatCard label="Car Accidents"     value={citywide.mvas}             color={METRIC_COLORS.mvas}             index={3} />
      <StatCard label="Pedestrian Struck" value={citywide.pedestrianStruck} color={METRIC_COLORS.pedestrianStruck} index={4} />
      <StatCard label="Traffic Stops"     value={citywide.trafficStops}     color={METRIC_COLORS.trafficStops}     index={5} />
      <StatCard label="Thefts"            value={citywide.thefts}           color={METRIC_COLORS.thefts}           index={6} />
      <StatCard label="Stolen Cars"       value={citywide.stolenVehicles}   color={METRIC_COLORS.stolenVehicles}   index={7} />
    </div>
  );
}
