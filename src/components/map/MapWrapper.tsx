import dynamic from 'next/dynamic';
import { Incident } from '@/types';

const MapboxMap = dynamic(() => import('./MapboxMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#0a1628] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Loading map&hellip;</span>
      </div>
    </div>
  ),
});

interface MapWrapperProps {
  incidents: Incident[];
  showMVA: boolean;
  showShotsFired: boolean;
  showShootingHit: boolean;
  showTheft: boolean;
  showStolenVehicle: boolean;
  showTrafficStop: boolean;
  showPedestrianStruck: boolean;
}

export default function MapWrapper(props: MapWrapperProps) {
  return <MapboxMap {...props} />;
}
