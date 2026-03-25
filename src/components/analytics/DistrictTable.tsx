'use client';

import { useState } from 'react';
import { DistrictStats } from '@/types';

type SortKey = keyof Omit<DistrictStats, 'district'>;

const cols: { key: SortKey; label: string }[] = [
  { key: 'totalCrimes', label: 'Total' },
  { key: 'shootings',   label: 'Shots' },
  { key: 'homicides',   label: 'Hom' },
  { key: 'mvas',        label: 'MVAs' },
];

const colColor: Record<SortKey, string> = {
  totalCrimes:   'text-accent-blue',
  shootings:     'text-accent-red',
  homicides:     'text-slate-400',
  mvas:          'text-accent-amber',
  thefts:        'text-accent-blue',
  stolenVehicles:'text-accent-green',
};

export default function DistrictTable({ data }: { data: DistrictStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalCrimes');
  const [sortAsc, setSortAsc]   = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...data].sort((a, b) => {
    const d = a[sortKey] - b[sortKey];
    return sortAsc ? d : -d;
  });

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="District Breakdown" />
      <table className="w-full text-xs mt-1.5">
        <thead>
          <tr>
            <th className="text-left pb-1 pr-3 text-[10px] text-slate-600 font-medium">District</th>
            {cols.map(({ key, label }) => (
              <th key={key} className="pb-1 px-1 text-right">
                <button
                  onClick={() => handleSort(key)}
                  className={`text-[10px] font-medium flex items-center gap-0.5 ml-auto transition-colors ${
                    sortKey === key ? colColor[key] : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {label}
                  {sortKey === key && (
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 12 12">
                      {sortAsc ? <path d="M6 2l4 6H2z" /> : <path d="M6 10L2 4h8z" />}
                    </svg>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.district} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="py-1 pr-3 text-slate-400 font-medium whitespace-nowrap">
                {i === 0 && !sortAsc
                  ? <span className="text-white">{row.district}</span>
                  : row.district}
              </td>
              <td className={`py-1 px-1 text-right tabular-nums font-semibold ${i === 0 && !sortAsc ? colColor.totalCrimes : 'text-slate-400'}`}>
                {row.totalCrimes}
              </td>
              <td className="py-1 px-1 text-right tabular-nums text-accent-red/70">{row.shootings}</td>
              <td className="py-1 px-1 text-right tabular-nums text-slate-600">{row.homicides}</td>
              <td className="py-1 px-1 text-right tabular-nums text-accent-amber/70">{row.mvas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest leading-none">
      {title}
    </p>
  );
}
