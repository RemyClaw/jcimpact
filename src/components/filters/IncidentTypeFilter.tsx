'use client';

import { IncidentType } from '@/types';

interface IncidentTypeFilterProps {
  selected: IncidentType[];
  onChange: (next: IncidentType[]) => void;
}

/* Dot colors per spec — with glow */
const DOT_COLORS: Record<IncidentType, string> = {
  'Shooting':       '#3B82F6',  // blue glow
  'MVA':            '#22C55E',  // green glow
  'Theft':          '#A855F7',  // purple glow
  'Stolen Vehicle': '#F59E0B',  // yellow/orange glow
};

const TYPES: { value: IncidentType; label: string }[] = [
  { value: 'Shooting',       label: 'Shootings'     },
  { value: 'MVA',            label: 'Car Accidents' },
  { value: 'Theft',          label: 'Thefts'        },
  { value: 'Stolen Vehicle', label: 'Stolen Cars'   },
];

// Empty selected = all types shown (no filter)
export default function IncidentTypeFilter({ selected, onChange }: IncidentTypeFilterProps) {
  function toggle(type: IncidentType) {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
    } else {
      onChange([...selected, type]);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {TYPES.map(({ value, label }) => {
        const active = selected.includes(value);
        const dotColor = DOT_COLORS[value];

        return (
          <button
            key={value}
            onClick={() => toggle(value)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 0',
            }}
          >
            {/* Glowing dot + white label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  opacity: active ? 1 : 0.3,
                  boxShadow: active ? `0 0 6px 2px ${dotColor}80` : 'none',
                  flexShrink: 0,
                  transition: 'opacity 0.2s, box-shadow 0.2s',
                }}
              />
              <span
                style={{
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  opacity: active ? 1 : 0.4,
                  transition: 'opacity 0.2s',
                }}
              >
                {label}
              </span>
            </div>

            {/* Gold/brass physical toggle */}
            <div
              style={{
                position: 'relative',
                width: '34px',
                height: '18px',
                borderRadius: '9px',
                backgroundColor: active ? '#8B6914' : '#2a3650',
                border: `1.5px solid ${active ? '#c8a96b' : '#3a4a65'}`,
                flexShrink: 0,
                transition: 'background-color 0.2s, border-color 0.2s',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: active ? '#F5E6C8' : '#5a6a80',
                  left: active ? '17px' : '3px',
                  transition: 'left 0.2s, background-color 0.2s',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
