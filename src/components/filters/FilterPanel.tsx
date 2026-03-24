'use client';

import { FilterState } from '@/types';
import IncidentTypeFilter from './IncidentTypeFilter';
import DistrictFilter from './DistrictFilter';
import DateRangePicker from './DateRangePicker';

interface FilterPanelProps {
  filterState: FilterState;
  onChange: (next: FilterState) => void;
  incidentCount: number;
}

export default function FilterPanel({ filterState, onChange, incidentCount }: FilterPanelProps) {
  function reset() {
    onChange({
      dateRange: { from: undefined, to: undefined },
      incidentTypes: ['MVA', 'Shooting'],
      district: 'All',
    });
  }

  const isFiltered =
    filterState.dateRange.from ||
    filterState.dateRange.to ||
    filterState.district !== 'All' ||
    filterState.incidentTypes.length < 2;

  return (
    <div className="flex flex-col h-full">

      {/* Section header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">Filters</span>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {incidentCount} shown
        </span>
      </div>

      {/* Filter groups */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">

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

        <FilterGroup label="Date Range">
          <DateRangePicker
            from={filterState.dateRange.from}
            to={filterState.dateRange.to}
            onChange={(from, to) => onChange({ ...filterState, dateRange: { from, to } })}
          />
        </FilterGroup>

      </div>

      {/* Reset */}
      {isFiltered && (
        <div className="px-4 py-2.5 border-t border-white/[0.06]">
          <button
            onClick={reset}
            className="w-full text-[11px] text-slate-500 hover:text-slate-300 py-1.5 rounded-md hover:bg-white/5 transition-colors tracking-wide"
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
    <div>
      <p className="text-[10px] font-medium text-slate-600 uppercase tracking-widest mb-2.5">
        {label}
      </p>
      {children}
    </div>
  );
}
