'use client';

import { useState } from 'react';
import { DistrictStats } from '@/types';

type RankMetric = 'totalCrimes' | 'shootings' | 'mvas' | 'thefts' | 'stolenVehicles';

const METRICS: { key: RankMetric; label: string; bar: string; text: string }[] = [
  { key: 'totalCrimes',    label: 'Total',   bar: 'bg-accent-blue',   text: 'text-accent-blue'   },
  { key: 'shootings',      label: 'Shots',   bar: 'bg-accent-red',    text: 'text-accent-red'    },
  { key: 'mvas',           label: 'MVAs',    bar: 'bg-accent-amber',  text: 'text-accent-amber'  },
  { key: 'thefts',         label: 'Thefts',  bar: 'bg-accent-purple', text: 'text-accent-purple' },
  { key: 'stolenVehicles', label: 'Stolen',  bar: 'bg-accent-green',  text: 'text-accent-green'  },
];

const DISTRICT_COLORS: Record<string, string> = {
  North: '#4CC9F0',
  East:  '#7B61FF',
  West:  '#FF9F1C',
  South: '#F72585',
};

export default function DistrictRankings({ data }: { data: DistrictStats[] }) {
  const [metric, setMetric] = useState<RankMetric>('totalCrimes');

  const sorted = [...data].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const max = (sorted[0]?.[metric] ?? 1) || 1;
  const m = METRICS.find((x) => x.key === metric)!;

  return (
    <div className="flex flex-col h-full">
      {/* Metric tabs */}
      <div className="flex items-center gap-0.5 mb-3 flex-wrap">
        {METRICS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors ${
              metric === key
                ? 'bg-white/10 text-slate-200'
                : 'text-slate-600 hover:text-slate-400 hover:bg-white/[0.03]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 flex-1">
        {sorted.map((row, i) => {
          const val = row[metric] ?? 0;
          const pct = (val / max) * 100;
          const distColor = DISTRICT_COLORS[row.district] ?? '#6b7280';
          return (
            <div key={row.district} className="flex items-center gap-3">
              <span className="text-[11px] text-slate-700 font-mono w-3 text-right flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: distColor }} />
                    <span className="text-[12px] text-slate-300 font-medium">{row.district}</span>
                  </div>
                  <span className={`text-[12px] font-bold tabular-nums flex-shrink-0 ml-2 ${m.text}`}>
                    {val.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${m.bar} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%`, opacity: 0.9 - i * 0.1 }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
