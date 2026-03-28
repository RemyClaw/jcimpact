'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { DistrictStats } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

type RankMetric = 'totalCrimes' | 'shootings' | 'mvas' | 'thefts' | 'stolenVehicles';

const METRICS: { key: RankMetric; label: string; color: string }[] = [
  { key: 'totalCrimes',    label: 'Total',       color: METRIC_COLORS.totalCrimes    },
  { key: 'shootings',      label: 'Shootings',   color: METRIC_COLORS.shootings      },
  { key: 'mvas',           label: 'Accidents',   color: METRIC_COLORS.mvas           },
  { key: 'thefts',         label: 'Thefts',      color: METRIC_COLORS.thefts         },
  { key: 'stolenVehicles', label: 'Stolen Cars', color: METRIC_COLORS.stolenVehicles },
];

export default function DistrictRankings({ data }: { data: DistrictStats[] }) {
  const [metric, setMetric] = useState<RankMetric>('totalCrimes');

  const sorted = useMemo(() => [...data].sort((a, b) => (a[metric] ?? 0) - (b[metric] ?? 0)), [data, metric]);
  const max    = (sorted[sorted.length - 1]?.[metric] ?? 1) || 1;
  const m      = METRICS.find((x) => x.key === metric)!;

  return (
    <div className="flex flex-col h-full">
      {/* Metric tabs */}
      <div className="flex items-center gap-0.5 mb-3 flex-wrap">
        {METRICS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className="px-2.5 py-1 font-semibold transition-colors"
            style={{
              fontSize: '13px',
              border: metric === key ? '1px solid #c8a96b' : '1px solid transparent',
              background: metric === key ? '#0a1628' : 'transparent',
              color: metric === key ? '#ffffff' : '#9CA3AF',
              borderRadius: '8px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 flex-1">
        {sorted.map((row, i) => {
          const val = row[metric] ?? 0;
          const pct = Math.max((val / max) * 100, 2);
          return (
            <div key={row.district} className="flex items-center gap-3">
              <span className="font-mono w-4 text-right flex-shrink-0" style={{ fontSize: '13px', color: '#9CA3AF' }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>{row.district}</span>
                  <span className="font-bold tabular-nums flex-shrink-0 ml-2" style={{ fontSize: '14px', color: '#FFFFFF' }}>
                    {val.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-muted overflow-hidden">
                  <motion.div
                    className="h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
                    style={{
                      backgroundColor: m.color,
                      opacity: 0.35 + (i / Math.max(sorted.length - 1, 1)) * 0.65,
                    }}
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
