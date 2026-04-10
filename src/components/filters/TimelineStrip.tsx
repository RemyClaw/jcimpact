'use client';

import { useMemo } from 'react';
import type { Incident } from '@/types';

/** Parse ISO date string without timezone shift */
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
  weeks: number[];        // e.g. [1], [1,2], [] = full month
}

/** Get Sunday-Saturday weeks for a given month/year */
function getWeeksForMonth(month: number, year: number): { start: Date; end: Date; label: string }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: { start: Date; end: Date; label: string }[] = [];

  // Find the first Sunday on or before the 1st of the month
  let current = new Date(firstDay);
  // If the 1st isn't Sunday, the first week starts on the 1st (partial week)
  // Week always starts on Sunday
  let weekStart = new Date(current);

  while (weekStart <= lastDay) {
    // Week ends on Saturday (6 days after Sunday) or end of month
    const saturday = new Date(weekStart);
    saturday.setDate(saturday.getDate() + (6 - saturday.getDay()));
    const weekEnd = saturday > lastDay ? lastDay : saturday;

    // Only include if the week has days in this month
    const effectiveStart = weekStart < firstDay ? firstDay : weekStart;
    if (effectiveStart <= lastDay) {
      const startDay = effectiveStart.getDate();
      const endDay = weekEnd.getDate();
      weeks.push({
        start: new Date(effectiveStart),
        end: new Date(weekEnd),
        label: startDay === endDay ? `${startDay}` : `${startDay}–${endDay}`,
      });
    }

    // Move to next Sunday
    const nextSunday = new Date(weekEnd);
    nextSunday.setDate(nextSunday.getDate() + 1);
    weekStart = nextSunday;
  }

  return weeks;
}

function getDateRange(period: TimePeriod, year: number): [Date, Date] | null {
  if (period.month === null) return null;
  const m = period.month;
  if (period.weeks.length === 0) {
    return [new Date(year, m, 1), new Date(year, m + 1, 0)];
  }
  const allWeeks = getWeeksForMonth(m, year);
  // Find earliest start and latest end among selected weeks
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const wn of period.weeks) {
    const w = allWeeks[wn - 1];
    if (!w) continue;
    if (!earliest || w.start < earliest) earliest = w.start;
    if (!latest || w.end > latest) latest = w.end;
  }
  if (!earliest || !latest) return [new Date(year, m, 1), new Date(year, m + 1, 0)];
  return [earliest, latest];
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

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Row 1: YTD + Month pills */}
      <div className="flex items-center gap-1 md:gap-2 overflow-x-auto" style={{ padding: '8px 0 6px' }}>
        {/* YTD */}
        <button
          onClick={() => onSelect({ month: null, weeks: [] })}
          className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 transition-all flex-shrink-0"
          style={{
            borderRadius: '8px',
            fontSize: '13px',
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
          const disabled = hasActiveFilters && !hasData && !isActive;

          return (
            <button
              key={label}
              onClick={() => !disabled && onSelect({ month: i, weeks: [] })}
              className="flex items-center gap-1 md:gap-1.5 px-2 py-1.5 md:px-3 md:py-2 transition-all flex-shrink-0"
              style={{
                borderRadius: '8px',
                fontSize: '12px',
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
                  fontSize: '10px',
                  fontWeight: 800,
                  color: isActive ? '#1b2740' : '#c8a96b',
                  background: isActive ? '#c8a96b' : 'rgba(200,169,107,0.15)',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}>
                  {monthlyCounts[i]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Row 2: Weekly periods (Sun–Sat) — only when a month is selected */}
      {activePeriod.month !== null && (() => {
        const displayMonth = activePeriod.month;
        const weeks = getWeeksForMonth(displayMonth, year);
        const displayFullCount = monthlyCounts[displayMonth];
        const monthLabel = MONTHS[displayMonth];

        return (
        <div className="flex items-center gap-1 md:gap-2 overflow-x-auto" style={{ padding: '0 0 8px' }}>
          <span className="text-[10px] md:text-[11px]" style={{ fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '2px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {monthLabel}:
          </span>

          {/* Full month */}
          <button
            onClick={() => onSelect({ month: displayMonth, weeks: [] })}
            className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 transition-all flex-shrink-0"
            style={{
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: activePeriod.weeks.length === 0 ? 800 : 600,
              border: activePeriod.weeks.length === 0 ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.3)',
              background: activePeriod.weeks.length === 0 ? 'rgba(200,169,107,0.2)' : 'transparent',
              color: activePeriod.weeks.length === 0 ? '#FFFFFF' : '#E5E7EB',
            }}
          >
            All
            <span style={{
              fontSize: '10px', fontWeight: 800,
              color: activePeriod.weeks.length === 0 ? '#1b2740' : '#c8a96b',
              background: activePeriod.weeks.length === 0 ? '#c8a96b' : 'rgba(200,169,107,0.15)',
              borderRadius: '4px', padding: '1px 4px',
            }}>
              {displayFullCount}
            </span>
          </button>

          {/* Weekly periods — click to toggle, multi-select */}
          {weeks.map((w, idx) => {
            const weekNum = idx + 1;
            const isActiveWeek = activePeriod.weeks.includes(weekNum);
            const weekCount = countInRange(incidents, w.start, w.end);

            return (
              <button
                key={weekNum}
                onClick={() => {
                  const current = activePeriod.weeks;
                  const next = current.includes(weekNum)
                    ? current.filter(n => n !== weekNum)
                    : [...current, weekNum].sort();
                  onSelect({ month: displayMonth, weeks: next });
                }}
                className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 transition-all flex-shrink-0"
                style={{
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: isActiveWeek ? 800 : 600,
                  border: isActiveWeek ? '2px solid #c8a96b' : '2px solid rgba(200,169,107,0.3)',
                  background: isActiveWeek ? 'rgba(200,169,107,0.2)' : 'transparent',
                  color: isActiveWeek ? '#FFFFFF' : '#E5E7EB',
                }}
              >
                {w.label}
                <span style={{
                  fontSize: '10px', fontWeight: 800,
                  color: isActiveWeek ? '#1b2740' : '#c8a96b',
                  background: isActiveWeek ? '#c8a96b' : 'rgba(200,169,107,0.15)',
                  borderRadius: '4px', padding: '1px 4px',
                }}>
                  {weekCount}
                </span>
              </button>
            );
          })}
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
