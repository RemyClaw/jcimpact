'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { MonthlyStat } from '@/types';

type SeriesKey = 'totalCrimes' | 'shootings' | 'mvas';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'totalCrimes', label: 'Total',     color: '#3b82f6' },
  { key: 'shootings',   label: 'Shootings', color: '#ef4444' },
  { key: 'mvas',        label: 'MVAs',      color: '#f59e0b' },
];

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#131929] border border-white/[0.08] rounded-lg px-3 py-2 shadow-xl text-[11px]">
      <p className="text-slate-500 mb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: entry.color }} />
          <span className="text-slate-400">{entry.name}</span>
          <span className="font-semibold tabular-nums ml-auto pl-3" style={{ color: entry.color }}>{entry.value}</span>
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
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest leading-none">
          Monthly Trends
        </p>
        <div className="flex gap-2">
          {SERIES.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`flex items-center gap-1 text-[10px] transition-opacity ${hidden.has(key) ? 'opacity-25' : 'opacity-100'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-slate-500">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[9px] text-slate-700 mb-1">
        † MVA data: NJ Crash Reports — Jan–Feb not yet available
      </p>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            {SERIES.map(({ key, label, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                hide={hidden.has(key)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
