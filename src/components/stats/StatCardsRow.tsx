import StatCard from './StatCard';
import { SummaryStats } from '@/types';

interface StatCardsRowProps {
  citywide: SummaryStats['citywide'] & { thefts?: number; stolenVehicles?: number };
}

// SVG icons — inline for zero dependencies
const Icons = {
  shield: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5l-9-4z"/>
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4zM3 11l1.5-5h15L21 11M3 11h18M5 11l1-3h12l1 3"/>
    </svg>
  ),
  bag: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
    </svg>
  ),
  key: (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
      <circle cx="8" cy="15" r="5"/><path strokeLinecap="round" strokeLinejoin="round" d="M13 15h3l2-2 2 2-2 2h-1v2h-2v-2h-2v-2z"/>
    </svg>
  ),
};

export default function StatCardsRow({ citywide }: StatCardsRowProps) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
      <StatCard
        label="Total Crimes YTD"
        value={citywide.totalCrimes}
        accentColor="blue"
        sublabel="Part 1 · CompStat"
        icon={Icons.shield}
      />
      <StatCard
        label="Shootings"
        value={citywide.shootings}
        accentColor="red"
        sublabel="Fired & hits"
        icon={Icons.target}
      />
      <StatCard
        label="Homicides"
        value={citywide.homicides}
        accentColor="slate"
        sublabel="Year to date"
        icon={Icons.alert}
      />
      <StatCard
        label="MVAs"
        value={citywide.mvas}
        accentColor="amber"
        sublabel="NJ Crash Reports"
        icon={Icons.car}
      />
      <StatCard
        label="Thefts"
        value={citywide.thefts ?? 0}
        accentColor="purple"
        sublabel="Property crime"
        icon={Icons.bag}
      />
      <StatCard
        label="Stolen Vehicles"
        value={citywide.stolenVehicles ?? 0}
        accentColor="green"
        sublabel="Property crime"
        icon={Icons.key}
      />
    </div>
  );
}
