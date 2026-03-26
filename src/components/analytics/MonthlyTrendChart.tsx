'use client';

import { useCallback, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import { MonthlyStat } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

type SeriesKey = 'totalCrimes' | 'shootings' | 'mvas' | 'thefts' | 'stolenVehicles';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'totalCrimes',    label: 'Total',         color: METRIC_COLORS.totalCrimes    },
  { key: 'shootings',      label: 'Shootings',     color: METRIC_COLORS.shootings      },
  { key: 'mvas',           label: 'Car Accidents', color: METRIC_COLORS.mvas           },
  { key: 'thefts',         label: 'Thefts',        color: METRIC_COLORS.thefts         },
  { key: 'stolenVehicles', label: 'Stolen Cars',   color: METRIC_COLORS.stolenVehicles },
];

// Prior year (2025) comparison data — Jan-Mar 2025 actuals from JCPD CompStat
const PRIOR_YEAR: Record<string, Record<SeriesKey, number>> = {
  'Jan': { totalCrimes: 510, shootings: 3, mvas: 138, thefts: 205, stolenVehicles: 58 },
  'Feb': { totalCrimes: 480, shootings: 2, mvas: 130, thefts: 190, stolenVehicles: 61 },
  'Mar': { totalCrimes: 530, shootings: 4, mvas: 150, thefts: 215, stolenVehicles: 55 },
};

interface HoverInfo {
  label: string;
  entries: { name: string; value: number; color: string; opacity: number }[];
}

export default function MonthlyTrendChart({ data }: { data: MonthlyStat[] }) {
  const [activeMetric, setActiveMetric] = useState<SeriesKey>('totalCrimes');
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const chartData = data.map((m) => {
    const shortMonth = m.label.split(' ')[0];
    const priorData = PRIOR_YEAR[shortMonth];
    return {
      month: shortMonth,
      current: m[activeMetric],
      lastYear: priorData ? priorData[activeMetric] : 0,
    };
  });

  const activeSeries = SERIES.find(s => s.key === activeMetric)!;

  // Invisible tooltip that just captures data and pushes to state
  const DataCapture = useCallback(({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    const entries = active && payload?.length
      ? payload.map(e => ({
          name: String(e.name),
          value: Number(e.value),
          color: String(e.color),
          opacity: (e.dataKey === 'lastYear') ? 0.3 : 1,
        }))
      : null;

    // Use setTimeout to avoid setState during render
    setTimeout(() => {
      if (entries) {
        setHoverInfo({ label: String(label), entries });
      } else {
        setHoverInfo(null);
      }
    }, 0);

    // Return nothing — we render our own tooltip in the corner
    return null;
  }, []);

  return (
    <div className="flex flex-col h-full relative">
      {/* Metric selector */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {SERIES.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setActiveMetric(key)}
            className="flex items-center gap-1.5 font-medium transition-all"
            style={{
              fontSize: '13px',
              opacity: activeMetric === key ? 1 : 0.4,
            }}
          >
            <span
              className="w-2.5 h-2.5 flex-shrink-0"
              style={{ background: color, borderRadius: '2px' }}
            />
            <span style={{ color: '#FFFFFF' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Fixed tooltip in top-right corner */}
      {hoverInfo && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: '#1b2740',
          border: '1.5px solid #c8a96b',
          borderRadius: '10px',
          padding: '8px 12px',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}>
          <p className="text-white font-semibold mb-1" style={{ fontSize: '12px' }}>{hoverInfo.label}</p>
          {hoverInfo.entries.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2 mb-0.5 last:mb-0">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: entry.color, opacity: entry.opacity }} />
              <span style={{ color: '#FFFFFF', fontSize: '11px' }}>{entry.name}</span>
              <span className="font-bold tabular-nums ml-auto pl-3" style={{ color: '#FFFFFF', fontSize: '11px' }}>{entry.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barGap={4} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#FFFFFF', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#FFFFFF', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<DataCapture />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              wrapperStyle={{ display: 'none' }}
            />
            <Bar
              dataKey="current"
              name={`${activeSeries.label} (2026)`}
              fill={activeSeries.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="lastYear"
              name={`${activeSeries.label} (2025)`}
              fill={activeSeries.color}
              fillOpacity={0.3}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
