'use client';

import { District, ALL_DISTRICTS } from '@/types';

interface DistrictFilterProps {
  selected: District | 'All';
  onChange: (district: District | 'All') => void;
}

export default function DistrictFilter({ selected, onChange }: DistrictFilterProps) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={selected}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'All' || (ALL_DISTRICTS as readonly string[]).includes(val)) {
            onChange(val as District | 'All');
          }
        }}
        style={{
          width: '100%',
          backgroundColor: '#0a1628',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 500,
          padding: '8px 32px 8px 12px',
          border: '1.5px solid #c8a96b',
          borderRadius: '10px',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23c8a96b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '14px',
        }}
      >
        <option value="All">All Districts</option>
        {ALL_DISTRICTS.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
