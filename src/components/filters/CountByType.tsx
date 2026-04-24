'use client';

import type { Incident, IncidentType } from '@/types';
import { TYPE_COLORS } from '@/lib/colors';

interface CountByTypeProps {
  /** Incidents filtered by time period + district, but NOT by type toggles. */
  incidents: Incident[];
  /** e.g. "March 2026", "YTD 2026", "March 2026 (wk 2)" */
  periodLabel: string;
  /** e.g. "All Districts", "North District" */
  districtLabel: string;
}

const ORDERED: { value: IncidentType; label: string }[] = [
  { value: 'Shots Fired',       label: 'Shots Fired'       },
  { value: 'Shooting Hit',      label: 'Shooting Hit'      },
  { value: 'MVA',               label: 'Car Accidents'     },
  { value: 'Pedestrian Struck', label: 'Pedestrian Struck' },
  { value: 'Traffic Stop',      label: 'Traffic Stops'     },
  { value: 'Theft',             label: 'Thefts'            },
  { value: 'Stolen Vehicle',    label: 'Stolen Cars'       },
];

export default function CountByType({ incidents, periodLabel, districtLabel }: CountByTypeProps) {
  // Tally per type — initialize all at 0 so the list length is stable
  const counts: Record<IncidentType, number> = {
    'Shots Fired': 0,
    'Shooting Hit': 0,
    'MVA': 0,
    'Pedestrian Struck': 0,
    'Traffic Stop': 0,
    'Theft': 0,
    'Stolen Vehicle': 0,
  };
  for (const i of incidents) {
    if (i.type in counts) counts[i.type] += 1;
  }
  const total = incidents.length;

  return (
    <div>
      <p style={{
        color: '#ffffff',
        fontWeight: 700,
        fontSize: '10px',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        margin: 0,
      }}>
        Count by Type
      </p>
      <p style={{
        color: '#9CA3AF',
        fontSize: '10px',
        fontWeight: 500,
        marginTop: '2px',
        marginBottom: '10px',
      }}>
        {periodLabel} · {districtLabel}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {ORDERED.map(({ value, label }) => (
          <div
            key={value}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: TYPE_COLORS[value],
                  boxShadow: `0 0 4px ${TYPE_COLORS[value]}80`,
                  flexShrink: 0,
                }}
              />
              <span style={{
                color: '#E5E7EB',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {label}
              </span>
            </span>
            <span
              style={{
                color: '#FFFFFF',
                fontWeight: 700,
                fontFamily: 'ui-monospace, monospace',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
                marginLeft: '8px',
              }}
            >
              {counts[value].toLocaleString()}
            </span>
          </div>
        ))}

        {/* Total */}
        <div
          style={{
            borderTop: '1px solid rgba(200,169,107,0.25)',
            marginTop: '4px',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
          }}
        >
          <span
            style={{
              color: '#c8a96b',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Total
          </span>
          <span
            style={{
              color: '#c8a96b',
              fontWeight: 800,
              fontFamily: 'ui-monospace, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
