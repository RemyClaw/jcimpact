'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { MonthlyStat } from '@/types';

type SeriesKey = 'totalCrimes' | 'shootings' | 'mvas' | 'thefts' | 'stolenVehicles';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'totalCrimes',    label: 'Total',          color: '#3b82f6' },
  { key: 'shootings',      label: 'Shootings',      color: '#f43f5e' },
  { key: 'mvas',           label: 'MVAs',           color: '#f59e0b' },
  { key: 'thefts',         label: 'Thefts',         color: '#8b5cf6' },
  { key: 'stolenVehicles', label: 'Stolen Vehicles',color: '#10b981' },
];

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl px-3 py-2.5 shadow-2xl text-[11px]">
      <p className="text-slate-400 font-semibold mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-slate-400">{entry.name}</span>
          <span className="font-bold tabular-nums ml-auto pl-4" style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function MonthlyTrendChart({ data }: { data: MonthlyStat[] }) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  function toggle(key: SeriesKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Legend toggles */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {SERIES.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`flex items-center gap-1.5 text-[10px] font-medium transition-opacity ${hidden.has(key) ? 'opacity-25' : 'opacity-100'}`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-slate-400">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#475569', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} />
            {SERIES.map(({ key, label, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={{ fill: color, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
                hide={hidden.has(key)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
