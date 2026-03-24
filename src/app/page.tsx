'use client';

import { useMemo, useState } from 'react';
import { FilterState, DistrictStats, MonthlyStat } from '@/types';
import rawData from '@/data/data.json';
import { useFilteredIncidents } from '@/hooks/useFilteredIncidents';
import FilterPanel from '@/components/filters/FilterPanel';
import StatCardsRow from '@/components/stats/StatCardsRow';
import MapWrapper from '@/components/map/MapWrapper';
import DistrictTable from '@/components/analytics/DistrictTable';
import DistrictRankings from '@/components/analytics/DistrictRankings';
import MonthlyTrendChart from '@/components/analytics/MonthlyTrendChart';
import type { Incident } from '@/types';

// Cast the JSON once — data.json is the single source of truth
const allIncidents = rawData.incidents as Incident[];
const baseStats    = rawData.citywide;
const allDistricts = rawData.byDistrict as DistrictStats[];
const allMonths    = rawData.monthlyTrends as MonthlyStat[];

// Derive a clean "Updated MMM D, YYYY" string from meta.generated ("2026-03-24")
const [_y, _m, _d] = rawData.meta.generated.split('-').map(Number);
const META_UPDATED = new Date(_y, _m - 1, _d).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});

const DEFAULT_FILTER: FilterState = {
  dateRange: { from: undefined, to: undefined },
  incidentTypes: ['MVA', 'Shooting'],
  district: 'All',
};

export default function DashboardPage() {
  const [filterState, setFilterState]       = useState<FilterState>(DEFAULT_FILTER);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const filteredIncidents = useFilteredIncidents(allIncidents, filterState);

  // ── Derived stat cards — react to district + type filters ─────────────
  const derivedStats = useMemo(() => {
    const { district, incidentTypes, dateRange } = filterState;
    const showMVA      = incidentTypes.includes('MVA');
    const showShooting = incidentTypes.includes('Shooting');

    // Date-range: sum monthly trends within the window
    const { from, to } = dateRange;
    if (from || to) {
      const inRange = allMonths.filter((m) => {
        const d = new Date(m.month + '-01');
        if (from && d < new Date(from.getFullYear(), from.getMonth(), 1)) return false;
        if (to   && d > new Date(to.getFullYear(),   to.getMonth(),   1)) return false;
        return true;
      });
      return {
        totalCrimes: inRange.reduce((s, m) => s + m.totalCrimes, 0),
        shootings:   showShooting ? inRange.reduce((s, m) => s + m.shootings, 0) : 0,
        homicides:   inRange.reduce((s, m) => s + m.homicides, 0),
        mvas:        showMVA      ? inRange.reduce((s, m) => s + m.mvas, 0) : 0,
      };
    }

    // District filter: show that district's numbers
    if (district !== 'All') {
      const d = allDistricts.find((x) => x.district === district);
      return {
        totalCrimes: d?.totalCrimes ?? 0,
        shootings:   showShooting ? (d?.shootings ?? 0) : 0,
        homicides:   d?.homicides ?? 0,
        mvas:        showMVA      ? (d?.mvas ?? 0) : 0,
      };
    }

    // No filter: citywide totals, zero out hidden types
    return {
      totalCrimes: baseStats.totalCrimes,
      shootings:   showShooting ? baseStats.shootings : 0,
      homicides:   baseStats.homicides,
      mvas:        showMVA      ? baseStats.mvas : 0,
    };
  }, [filterState]);

  // ── Derived district table — filter to selected district ──────────────
  const derivedDistricts = useMemo<DistrictStats[]>(() => {
    if (filterState.district === 'All') return allDistricts;
    return allDistricts.filter((d) => d.district === filterState.district);
  }, [filterState.district]);

  // ── Derived monthly trends — filter by date range ─────────────────────
  const derivedMonths = useMemo<MonthlyStat[]>(() => {
    const { from, to } = filterState.dateRange;
    if (!from && !to) return allMonths;
    return allMonths.filter((m) => {
      const d = new Date(m.month + '-01');
      if (from && d < new Date(from.getFullYear(), from.getMonth(), 1)) return false;
      if (to   && d > new Date(to.getFullYear(),   to.getMonth(),   1)) return false;
      return true;
    });
  }, [filterState.dateRange]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0f18] text-slate-200">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileFilterOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0e1420] border-r border-white/[0.06]
          transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:z-auto lg:w-[200px] lg:flex-shrink-0
          ${mobileFilterOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
            <span className="text-sm font-semibold tracking-tight text-white">JCImpact</span>
          </div>
          <p className="text-[11px] text-slate-500 pl-3.5">Jersey City, NJ · Crime Intelligence</p>
        </div>

        {/* Filters */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FilterPanel
            filterState={filterState}
            onChange={setFilterState}
            incidentCount={filteredIncidents.length}
          />
        </div>

        {/* Data attribution */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]">
          <p className="text-[10px] font-medium text-slate-600 uppercase tracking-widest mb-1.5">Data Sources</p>
          <p className="text-[10px] text-slate-600 leading-relaxed">{rawData.meta.source}</p>
          <p className="text-[10px] text-slate-600 leading-relaxed">{rawData.meta.period}</p>
          <p className="text-[10px] text-slate-700 mt-1">Updated {META_UPDATED}</p>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0e1420]">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
              onClick={() => setMobileFilterOpen(true)}
              aria-label="Open filters"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 8h12M9 12h6" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-white">JCImpact</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
            Live data · {rawData.meta.period}
          </div>

          <span className="lg:hidden text-[11px] text-slate-500 bg-white/5 border border-white/[0.06] px-2.5 py-1 rounded-full">
            YTD 2026
          </span>
        </div>

        {/* Stat cards */}
        <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-white/[0.06]">
          <StatCardsRow citywide={derivedStats} />
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0 p-3">
          <MapWrapper
            incidents={filteredIncidents}
            showMVA={filterState.incidentTypes.includes('MVA')}
            showShooting={filterState.incidentTypes.includes('Shooting')}
          />
        </div>

        {/* Analytics strip */}
        <div
          className="flex-shrink-0 border-t border-white/[0.06] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]"
          style={{ height: '236px' }}
        >
          <div className="p-3 min-h-0 overflow-auto">
            <DistrictTable data={derivedDistricts} />
          </div>
          <div className="p-3 min-h-0 overflow-auto">
            <DistrictRankings data={derivedDistricts} />
          </div>
          <div className="p-3 min-h-0 overflow-auto">
            <MonthlyTrendChart data={derivedMonths} />
          </div>
        </div>

      </div>
    </div>
  );
}
