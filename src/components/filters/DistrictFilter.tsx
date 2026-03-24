'use client';

import { District, ALL_DISTRICTS } from '@/types';

interface DistrictFilterProps {
  selected: District | 'All';
  onChange: (district: District | 'All') => void;
}

export default function DistrictFilter({ selected, onChange }: DistrictFilterProps) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value as District | 'All')}
      className="w-full bg-white/5 border border-white/[0.08] text-slate-300 text-xs rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-blue/50 focus:border-accent-blue/40 transition-colors"
    >
      <option value="All">All Districts</option>
      {ALL_DISTRICTS.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}
