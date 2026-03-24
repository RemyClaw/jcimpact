'use client';

import { useState } from 'react';
import { DistrictStats } from '@/types';

type RankMetric = 'totalCrimes' | 'shootings' | 'mvas';

const METRICS: { key: RankMetric; label: string; bar: string; text: string }[] = [
  { key: 'totalCrimes', label: 'Total',  bar: 'bg-accent-blue',  text: 'text-accent-blue'  },
  { key: 'shootings',   label: 'Shootings', bar: 'bg-accent-red',   text: 'text-accent-red'   },
  { key: 'mvas',        label: 'MVAs',   bar: 'bg-accent-amber', text: 'text-accent-amber' },
];

export default function DistrictRankings({ data }: { data: DistrictStats[] }) {
  const [metric, setMetric] = useState<RankMetric>('totalCrimes');

  const sorted = [...data].sort((a, b) => b[metric] - a[metric]);
  const max = sorted[0]?.[metric] ?? 1;
  const m = METRICS.find((x) => x.key === metric)!;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest leading-none">
          District Rankings
        </p>
        {/* Metric tabs */}
        <div className="flex gap-0.5">
          {METRICS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                metric === key
                  ? 'bg-white/10 text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1">
        {sorted.map((row, i) => {
          const pct = (row[metric] / max) * 100;
          return (
            <div key={row.district} className="flex items-center gap-2.5">
              <span className="text-[10px] text-slate-700 font-mono w-3 text-right flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-slate-400 truncate">{row.district}</span>
                  <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 ml-2 ${m.text}`}>
                    {row[metric]}
                  </span>
                </div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${m.bar} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%`, opacity: 1 - i * 0.15 }}
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
