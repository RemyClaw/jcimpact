'use client';

import { useState } from 'react';
import { DistrictStats } from '@/types';

type SortKey = keyof Omit<DistrictStats, 'district'>;

const cols: { key: SortKey; label: string; color: string }[] = [
  { key: 'totalCrimes',    label: 'Total',    color: 'text-accent-blue'   },
  { key: 'shootings',      label: 'Shots',    color: 'text-accent-red'    },
  { key: 'homicides',      label: 'Hom',      color: 'text-slate-500'     },
  { key: 'mvas',           label: 'MVAs',     color: 'text-accent-amber'  },
  { key: 'thefts',         label: 'Thefts',   color: 'text-accent-purple' },
  { key: 'stolenVehicles', label: 'Stolen V', color: 'text-accent-green'  },
];

const DISTRICT_COLORS: Record<string, string> = {
  North: 'bg-[#4CC9F0]',
  East:  'bg-[#7B61FF]',
  West:  'bg-[#FF9F1C]',
  South: 'bg-[#F72585]',
};

export default function DistrictTable({ data }: { data: DistrictStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalCrimes');
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...data].sort((a, b) => {
    const d = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    return sortAsc ? d : -d;
  });

  const colColor: Record<SortKey, string> = Object.fromEntries(
    cols.map(c => [c.key, c.color])
  ) as Record<SortKey, string>;

  return (
    <div className="flex flex-col h-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="text-left pb-2 pr-4 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
              District
            </th>
            {cols.map(({ key, label, color }) => (
              <th key={key} className="pb-2 px-2 text-right">
                <button
                  onClick={() => handleSort(key)}
                  className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-0.5 ml-auto transition-colors ${
                    sortKey === key ? color : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {label}
                  {sortKey === key && (
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 12 12">
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
            <tr
              key={row.district}
              className="border-b border-surface-border/50 hover:bg-surface-elevated/50 transition-colors"
            >
              <td className="py-2 pr-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${DISTRICT_COLORS[row.district] ?? 'bg-slate-500'}`} />
                  <span className={`text-[12px] font-medium ${i === 0 && !sortAsc ? 'text-white' : 'text-slate-400'}`}>
                    {row.district}
                  </span>
                </div>
              </td>
              <td className={`py-2 px-2 text-right tabular-nums font-bold text-[12px] ${i === 0 && !sortAsc ? colColor[sortKey] : 'text-slate-400'}`}>
                {row.totalCrimes}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-[12px] text-accent-red/80">{row.shootings}</td>
              <td className="py-2 px-2 text-right tabular-nums text-[12px] text-slate-600">{row.homicides}</td>
              <td className="py-2 px-2 text-right tabular-nums text-[12px] text-accent-amber/80">{row.mvas}</td>
              <td className="py-2 px-2 text-right tabular-nums text-[12px] text-accent-purple/80">{row.thefts ?? 0}</td>
              <td className="py-2 px-2 text-right tabular-nums text-[12px] text-accent-green/80">{row.stolenVehicles ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
