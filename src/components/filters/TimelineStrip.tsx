'use client';

import { useMemo } from 'react';
import type { Incident } from '@/types';

/** Parse ISO date string without timezone shift (avoids UTC midnight → previous day in local tz) */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface TimePeriod {
  month: number | null;   // 0-11, null = YTD
  half: 'first' | 'second' | null; // null = full month
}

function getDateRange(period: TimePeriod, year: number): [Date, Date] | null {
  if (period.month === null) return null;
  const m = period.month;
  if (period.half === null) {
    return [new Date(year, m, 1), new Date(year, m + 1, 0)];
  }
  if (period.half === 'first') {
    return [new Date(year, m, 1), new Date(year, m, 14)];
  }
  return [new Date(year, m, 15), new Date(year, m + 1, 0)];
}

function countInRange(incidents: Incident[], start: Date, end: Date): number {
  return incidents.filter((inc) => {
    const d = parseLocalDate(inc.date);
    return d >= start && d <= end;
  }).length;
}

interface TimelineStripProps {
  incidents: Incident[];
  activePeriod: TimePeriod;
  onSelect: (period: TimePeriod) => void;
  year?: number;
  hasActiveFilters?: boolean;
}

export default function TimelineStrip({ incidents, activePeriod, onSelect, year = 2026, hasActiveFilters = false }: TimelineStripProps) {
  const monthlyCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    incidents.forEach((inc) => {
      const d = parseLocalDate(inc.date);
      if (d.getFullYear() === year) {
        counts[d.getMonth()]++;
      }
    });
    return counts;
  }, [incidents, year]);

  const halfCounts = useMemo(() => {
    if (activePeriod.month === null) return { first: 0, second: 0 };
    const m = activePeriod.month;
    const firstRange = getDateRange({ month: m, half: 'first' }, year)!;
    const secondRange = getDateRange({ month: m, half: 'second' }, year)!;
    return {
      first: countInRange(incidents, firstRange[0], firstRange[1]),
      second: countInRange(incidents, secondRange[0], secondRange[1]),
    };
  }, [incidents, activePeriod.month, year]);

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Row 1: YTD + Month pills */}
      <div className="flex items-center gap-2 overflow-x-auto" style={{ padding: '8px 0 6px' }}>
        {/* YTD */}
        <button
          onClick={() => onSelect({ month: null, half: null })}
          className="flex items-center gap-2 px-4 py-2 transition-all flex-shrink-0"
          style={{
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            border: activePeriod.month === null ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.35)',
            background: activePeriod.month === null ? 'rgba(200,169,107,0.2)' : 'transparent',
            color: activePeriod.month === null ? '#c8a96b' : '#FFFFFF',
          }}
        >
          YTD
        </button>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'rgba(200,169,107,0.3)', flexShrink: 0 }} />

        {/* Month pills */}
        {MONTHS.map((label, i) => {
          const isActive = activePeriod.month === i;
          const hasData = monthlyCounts[i] > 0;
          // When filters are active, disable months with no matching data
          const disabled = hasActiveFilters && !hasData && !isActive;

          return (
            <button
              key={label}
              onClick={() => !disabled && onSelect({ month: i, half: null })}
              className="flex items-center gap-1.5 px-3 py-2 transition-all flex-shrink-0"
              style={{
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 800 : 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.3 : 1,
                border: isActive
                  ? '2px solid #c8a96b'
                  : hasData
                    ? '2px solid rgba(200,169,107,0.35)'
                    : '2px solid rgba(200,169,107,0.15)',
                background: isActive ? 'rgba(200,169,107,0.2)' : 'transparent',
                color: isActive ? '#FFFFFF' : hasData ? '#E5E7EB' : '#6b7280',
              }}
            >
              {label}
              {hasData && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: isActive ? '#1b2740' : '#c8a96b',
                  background: isActive ? '#c8a96b' : 'rgba(200,169,107,0.15)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  minWidth: '20px',
                  textAlign: 'center',
                }}>
                  {monthlyCounts[i]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Row 2: Bi-weekly sub-periods (only visible when a month is selected) */}
      {activePeriod.month !== null && (() => {
        const displayMonth = activePeriod.month;
        const displayLastDay = new Date(year, displayMonth + 1, 0).getDate();
        const displayHalfCounts = halfCounts;
        const displayFullCount = monthlyCounts[displayMonth];
        const monthLabel = MONTHS[displayMonth];

        return (
        <div className="flex items-center gap-2" style={{ padding: '0 0 8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>
            {monthLabel} Period:
          </span>

          {/* Full month */}
          <button
            onClick={() => onSelect({ month: displayMonth, half: null })}
            className="flex items-center gap-1.5 px-3 py-1.5 transition-all"
            style={{
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activePeriod.month === displayMonth && activePeriod.half === null ? 800 : 600,
              border: activePeriod.month === displayMonth && activePeriod.half === null ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.3)',
              background: activePeriod.month === displayMonth && activePeriod.half === null ? 'rgba(200,169,107,0.2)' : 'transparent',
              color: activePeriod.month === displayMonth && activePeriod.half === null ? '#FFFFFF' : '#E5E7EB',
            }}
          >
            Full Month
            <span style={{
              fontSize: '11px', fontWeight: 800,
              color: activePeriod.month === displayMonth && activePeriod.half === null ? '#1b2740' : '#c8a96b',
              background: activePeriod.month === displayMonth && activePeriod.half === null ? '#c8a96b' : 'rgba(200,169,107,0.15)',
              borderRadius: '4px', padding: '1px 5px',
            }}>
              {displayFullCount}
            </span>
          </button>

          {/* 1st half */}
          <button
            onClick={() => onSelect({ month: displayMonth, half: 'first' })}
            className="flex items-center gap-1.5 px-3 py-1.5 transition-all"
            style={{
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activePeriod.month === displayMonth && activePeriod.half === 'first' ? 800 : 600,
              border: activePeriod.month === displayMonth && activePeriod.half === 'first' ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.3)',
              background: activePeriod.month === displayMonth && activePeriod.half === 'first' ? 'rgba(200,169,107,0.2)' : 'transparent',
              color: activePeriod.month === displayMonth && activePeriod.half === 'first' ? '#FFFFFF' : '#E5E7EB',
            }}
          >
            1st – 14th
            <span style={{
              fontSize: '11px', fontWeight: 800,
              color: activePeriod.month === displayMonth && activePeriod.half === 'first' ? '#1b2740' : '#c8a96b',
              background: activePeriod.month === displayMonth && activePeriod.half === 'first' ? '#c8a96b' : 'rgba(200,169,107,0.15)',
              borderRadius: '4px', padding: '1px 5px',
            }}>
              {displayHalfCounts.first}
            </span>
          </button>

          {/* 2nd half */}
          <button
            onClick={() => onSelect({ month: displayMonth, half: 'second' })}
            className="flex items-center gap-1.5 px-3 py-1.5 transition-all"
            style={{
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activePeriod.month === displayMonth && activePeriod.half === 'second' ? 800 : 600,
              border: activePeriod.month === displayMonth && activePeriod.half === 'second' ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.3)',
              background: activePeriod.month === displayMonth && activePeriod.half === 'second' ? 'rgba(200,169,107,0.2)' : 'transparent',
              color: activePeriod.month === displayMonth && activePeriod.half === 'second' ? '#FFFFFF' : '#E5E7EB',
            }}
          >
            15th – {displayLastDay}th
            <span style={{
              fontSize: '11px', fontWeight: 800,
              color: activePeriod.month === displayMonth && activePeriod.half === 'second' ? '#1b2740' : '#c8a96b',
              background: activePeriod.month === displayMonth && activePeriod.half === 'second' ? '#c8a96b' : 'rgba(200,169,107,0.15)',
              borderRadius: '4px', padding: '1px 5px',
            }}>
              {displayHalfCounts.second}
            </span>
          </button>
        </div>
        );
      })()}
    </div>
  );
}

// Filter incidents by the selected time period
export function filterByPeriod(incidents: Incident[], period: TimePeriod, year: number = 2026): Incident[] {
  const range = getDateRange(period, year);
  if (!range) return incidents;

  const [start, end] = range;
  return incidents.filter((inc) => {
    const d = parseLocalDate(inc.date);
    return d >= start && d <= end;
  });
}
