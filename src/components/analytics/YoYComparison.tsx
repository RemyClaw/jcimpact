'use client';

import { MonthlyStat } from '@/types';
import { METRIC_COLORS } from '@/lib/colors';

// 2025 figures — verified from JCPD CompStat PDFs (Jan & Feb 2026 editions)
// Jan 2025 from Jan PDF YTD, Feb 2025 = Feb YTD minus Jan
// MVAs excluded — from NJ Crash Reports, no 2025 monthly breakdown available
const PREV: Record<string, { shootings: number; thefts: number; stolenVehicles: number }> = {
  '2026-01': { shootings: 2,  thefts: 223, stolenVehicles: 57 },
  '2026-02': { shootings: 3,  thefts: 197, stolenVehicles: 62 },
};

const METRICS = [
  { key: 'shootings'      as const, label: 'Shootings',  color: METRIC_COLORS.shootings      },
  { key: 'thefts'         as const, label: 'Thefts',     color: METRIC_COLORS.thefts         },
  { key: 'stolenVehicles' as const, label: 'Stolen Cars',color: METRIC_COLORS.stolenVehicles },
];

function pct(a: number, b: number) {
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

function Badge({ val }: { val: number | null }) {
  if (val === null) return <span style={{ color: '#6b7280', fontSize: '13px' }}>—</span>;
  const color = val === 0
    ? '#6b7280'
    : val > 0 ? '#fb7185' : '#34d399';
  const arrow = val === 0 ? '' : val > 0 ? '▲' : '▼';
  return (
    <span className="font-bold tabular-nums" style={{ color, fontSize: '13px' }}>
      {arrow}{Math.abs(val)}%
    </span>
  );
}

export default function YoYComparison({ data }: { data: MonthlyStat[] }) {
  const months = data.filter((m) => PREV[m.month]);

  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: '#6b7280', fontSize: '14px' }}>
        No comparison data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-1">
      {/* Metric cards */}
      <div className="flex gap-3 flex-1 min-h-0">
        {METRICS.map(({ key, label, color }) => {
          const ytd26 = months.reduce((s, r) => s + (r[key] ?? 0), 0);
          const ytd25 = months.reduce((s, r) => s + (PREV[r.month]?.[key] ?? 0), 0);
          const ytdPct = pct(ytd26, ytd25);

          return (
            <div key={key} className="flex-1 px-4 py-2 flex flex-col" style={{
              border: '2px solid #c8a96b',
              background: '#0a1628',
              borderRadius: '14px',
            }}>
              {/* Header */}
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>

              {/* YTD big number */}
              <div className="mt-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold tabular-nums" style={{ fontSize: '22px', color: '#FFFFFF', lineHeight: 1 }}>{ytd26}</span>
                  <Badge val={ytdPct} />
                </div>
                <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>vs {ytd25} in Jan–Feb &apos;25</div>
              </div>

              {/* Monthly breakdown */}
              <div className="mt-auto space-y-1 pt-1.5" style={{ borderTop: '1px solid rgba(200,169,107,0.25)' }}>
                {months.map((row) => {
                  const cur = row[key] ?? 0;
                  const old = PREV[row.month]?.[key] ?? 0;
                  return (
                    <div key={`${key}-${row.month}`} className="flex items-center justify-between">
                      <span style={{ fontSize: '12px', color: '#FFFFFF' }}>{row.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-semibold" style={{ fontSize: '12px', color: '#FFFFFF', width: '28px', textAlign: 'right' }}>{cur}</span>
                        <span style={{ fontSize: '10px', color: '#6b7280' }}>vs</span>
                        <span className="tabular-nums" style={{ fontSize: '12px', color: '#9CA3AF', width: '28px', textAlign: 'right' }}>{old}</span>
                        <div style={{ width: '48px', textAlign: 'right' }}>
                          <Badge val={pct(cur, old)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      <p style={{ fontSize: '10px', color: '#6b7280', lineHeight: 1.3 }} className="flex-shrink-0">
        Source: JCPD Crime Reports (Jan–Feb 2026) · Car accident data from NJ Crash Reports · Mar &apos;25 comparison unavailable
      </p>
    </div>
  );
}
