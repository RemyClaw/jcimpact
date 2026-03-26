'use client';

import { useState } from 'react';
import { DistrictStats } from '@/types';
import { DISTRICT_COLORS } from '@/lib/colors';

type SortKey = keyof Omit<DistrictStats, 'district'>;

const cols: { key: SortKey; label: string }[] = [
  { key: 'totalCrimes',    label: 'Total'    },
  { key: 'shootings',      label: 'Shots'    },
  { key: 'homicides',      label: 'Hom'      },
  { key: 'mvas',           label: 'Accidents'},
  { key: 'thefts',         label: 'Thefts'   },
  { key: 'stolenVehicles', label: 'Stolen'   },
];

export default function DistrictTable({ data }: { data: DistrictStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalCrimes');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...data].sort((a, b) => {
    const d = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
    return sortAsc ? d : -d;
  });

  return (
    <div className="flex flex-col h-full">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1.5px solid #c8a96b' }}>
            <th className="text-left pb-2 pr-4" style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              District
            </th>
            {cols.map(({ key, label }) => (
              <th key={key} className="pb-2 px-2 text-right">
                <button
                  onClick={() => handleSort(key)}
                  className="flex items-center gap-0.5 ml-auto transition-opacity hover:opacity-80"
                  style={{
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {label}
                  {sortKey === key && (
                    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 12 12">
                      {sortAsc ? <path d="M6 2l4 6H2z" /> : <path d="M6 10L2 4h8z" />}
                    </svg>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isSelected = selectedDistrict === row.district;
            return (
              <tr
                key={row.district}
                onClick={() => setSelectedDistrict(isSelected ? null : row.district)}
                style={{
                  borderBottom: '1px solid rgba(200, 169, 107, 0.3)',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(200, 169, 107, 0.12)' : 'transparent',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(200, 169, 107, 0.08)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: isSelected ? '#c8a96b' : '#FFFFFF',
                      transition: 'color 0.15s ease',
                    }}>
                      {row.district}
                    </span>
                  </div>
                </td>
                {cols.map(({ key }) => (
                  <td
                    key={key}
                    className="py-2.5 px-2 text-right tabular-nums"
                    style={{
                      fontSize: '14px',
                      color: isSelected ? '#c8a96b' : '#FFFFFF',
                      fontWeight: key === 'totalCrimes' ? 700 : 500,
                      transition: 'color 0.15s ease',
                    }}
                  >
                    {row[key] ?? 0}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
