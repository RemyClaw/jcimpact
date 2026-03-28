'use client';

import { FilterState } from '@/types';
import IncidentTypeFilter from './IncidentTypeFilter';
import DistrictFilter from './DistrictFilter';

interface FilterPanelProps {
  filterState: FilterState;
  onChange: (next: FilterState) => void;
  incidentCount: number;
}

export default function FilterPanel({ filterState, onChange, incidentCount }: FilterPanelProps) {
  function reset() {
    onChange({
      incidentTypes: [],
      district: 'All',
    });
  }

  const isFiltered =
    filterState.district !== 'All' ||
    filterState.incidentTypes.length > 0;

  return (
    <div
      className="flex flex-col"
      style={{
        background: '#0a1628',
        border: '2px solid #c8a96b',
        borderRadius: '24px',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px 10px' }}>
        <div className="flex items-center justify-between">
          <span
            style={{
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase' as const,
            }}
          >
            Filters
          </span>
          <span style={{ color: '#c8a96b', fontSize: '11px', fontWeight: 500 }}>
            {incidentCount} shown
          </span>
        </div>
        {/* Gold divider */}
        <div style={{ height: '1px', background: '#c8a96b', marginTop: '10px', opacity: 0.5 }} />
      </div>

      {/* ── Filter groups ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '4px 16px 16px' }}>
        <FilterGroup label="Incident Type">
          <IncidentTypeFilter
            selected={filterState.incidentTypes}
            onChange={(incidentTypes) => onChange({ ...filterState, incidentTypes })}
          />
        </FilterGroup>

        <FilterGroup label="District">
          <DistrictFilter
            selected={filterState.district}
            onChange={(district) => onChange({ ...filterState, district })}
          />
        </FilterGroup>
      </div>

      {/* ── Reset ───────────────────────────────────────────────────────── */}
      {isFiltered && (
        <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(200,169,107,0.25)' }}>
          <button
            onClick={reset}
            style={{
              width: '100%',
              fontSize: '11px',
              color: '#c8a96b',
              padding: '6px 0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              fontWeight: 600,
            }}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <p
        style={{
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          marginBottom: '10px',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
