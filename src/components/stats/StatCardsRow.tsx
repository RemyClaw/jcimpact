import StatCard from './StatCard';
import { SummaryStats } from '@/types';

interface StatCardsRowProps {
  citywide: SummaryStats['citywide'];
}

export default function StatCardsRow({ citywide }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <StatCard
        label="Total Crimes YTD"
        value={citywide.totalCrimes}
        accentColor="blue"
        sublabel="Part 1 crimes · CompStat"
      />
      <StatCard
        label="Shootings"
        value={citywide.shootings}
        accentColor="red"
        sublabel="Shots fired & hits"
      />
      <StatCard
        label="Homicides"
        value={citywide.homicides}
        accentColor="slate"
        sublabel="Year to date"
      />
      <StatCard
        label="Motor Vehicle Accidents"
        value={citywide.mvas}
        accentColor="amber"
        sublabel="NJ Crash Reports"
      />
    </div>
  );
}
