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

const allIncidents = rawData.incidents as Incident[];
const baseStats    = rawData.citywide;
const allDistricts = rawData.byDistrict as DistrictStats[];
const allMonths    = rawData.monthlyTrends as MonthlyStat[];

const [_y, _m, _d] = rawData.meta.generated.split('-').map(Number);
const META_UPDATED = new Date(_y, _m - 1, _d).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});

const DEFAULT_FILTER: FilterState = {
  dateRange: { from: undefined, to: undefined },
  incidentTypes: ['MVA', 'Shooting', 'Theft', 'Stolen Vehicle'],
  district: 'All',
};

type AnalyticsTab = 'districts' | 'rankings' | 'trends';

export default function DashboardPage() {
  const [filterState, setFilterState]       = useState<FilterState>(DEFAULT_FILTER);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab]     = useState<AnalyticsTab>('districts');

  const filteredIncidents = useFilteredIncidents(allIncidents, filterState);

  const derivedStats = useMemo(() => {
    const { district, incidentTypes, dateRange } = filterState;
    const showMVA      = incidentTypes.includes('MVA');
    const showShooting = incidentTypes.includes('Shooting');
    const showTheft    = incidentTypes.includes('Theft');
    const showStolen   = incidentTypes.includes('Stolen Vehicle');

    const { from, to } = dateRange;
    if (from || to) {
      const inRange = allMonths.filter((m) => {
        const d = new Date(m.month + '-01');
        if (from && d < new Date(from.getFullYear(), from.getMonth(), 1)) return false;
        if (to   && d > new Date(to.getFullYear(),   to.getMonth(),   1)) return false;
        return true;
      });
      return {
        totalCrimes:    inRange.reduce((s, m) => s + m.totalCrimes, 0),
        shootings:      showShooting ? inRange.reduce((s, m) => s + m.shootings, 0) : 0,
        homicides:      inRange.reduce((s, m) => s + m.homicides, 0),
        mvas:           showMVA    ? inRange.reduce((s, m) => s + m.mvas, 0) : 0,
        thefts:         showTheft  ? inRange.reduce((s, m) => s + (m.thefts ?? 0), 0) : 0,
        stolenVehicles: showStolen ? inRange.reduce((s, m) => s + (m.stolenVehicles ?? 0), 0) : 0,
      };
    }

    if (district !== 'All') {
      const d = allDistricts.find((x) => x.district === district);
      return {
        totalCrimes:    d?.totalCrimes ?? 0,
        shootings:      showShooting ? (d?.shootings ?? 0) : 0,
        homicides:      d?.homicides ?? 0,
        mvas:           showMVA    ? (d?.mvas ?? 0) : 0,
        thefts:         showTheft  ? (d?.thefts ?? 0) : 0,
        stolenVehicles: showStolen ? (d?.stolenVehicles ?? 0) : 0,
      };
    }

    return {
      totalCrimes:    baseStats.totalCrimes,
      shootings:      showShooting ? baseStats.shootings : 0,
      homicides:      baseStats.homicides,
      mvas:           showMVA    ? baseStats.mvas : 0,
      thefts:         showTheft  ? (baseStats.thefts ?? 0) : 0,
      stolenVehicles: showStolen ? (baseStats.stolenVehicles ?? 0) : 0,
    };
  }, [filterState]);

  const derivedDistricts = useMemo<DistrictStats[]>(() => {
    if (filterState.district === 'All') return allDistricts;
    return allDistricts.filter((d) => d.district === filterState.district);
  }, [filterState.district]);

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
    <div className="flex h-screen overflow-hidden bg-surface text-slate-200">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileFilterOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-surface-card
          border-r border-surface-border
          transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:z-auto lg:w-[210px] lg:flex-shrink-0
          ${mobileFilterOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="flex-shrink-0 px-4 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5 mb-1">
            {/* Shield icon */}
            <div className="flex-shrink-0 w-7 h-7 rounded-md bg-accent-red/10 border border-accent-red/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-accent-red" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5l-9-4z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white leading-none">JC IMPACT</p>
              <p className="text-[10px] text-slate-500 leading-none mt-0.5">Crime Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 pl-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse flex-shrink-0" />
            <span className="text-[10px] text-slate-500">{rawData.meta.period}</span>
          </div>
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
        <div className="flex-shrink-0 px-4 py-3 border-t border-surface-border">
          <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest mb-1.5">Data Sources</p>
          <p className="text-[10px] text-slate-600 leading-relaxed">{rawData.meta.source}</p>
          <p className="text-[10px] text-slate-700 mt-1">Updated {META_UPDATED}</p>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top header bar ─────────────────────────────────────────── */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-0 h-11 border-b border-surface-border bg-surface-card">
          {/* Mobile: hamburger + title */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              onClick={() => setMobileFilterOpen(true)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-accent-red flex-shrink-0">
                <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.25C17.25 21.15 21 16.25 21 11V5l-9-4z"/>
              </svg>
              <span className="text-sm font-bold text-white">JC IMPACT</span>
            </div>
          </div>

          {/* Desktop: title */}
          <div className="hidden lg:flex items-center gap-3">
            <h1 className="text-sm font-semibold text-white tracking-tight">
              Jersey City Crime Intelligence Dashboard
            </h1>
            <span className="text-surface-border">|</span>
            <span className="text-[11px] text-slate-500">Jersey City, NJ</span>
          </div>

          {/* Right: live badge + updated */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="text-slate-600">Updated {META_UPDATED}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-accent-green/10 border border-accent-green/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-semibold text-accent-green tracking-wide">LIVE</span>
            </div>
          </div>
        </header>

        {/* ── Stat cards ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-3 pt-2.5 pb-2 border-b border-surface-border">
          <StatCardsRow citywide={derivedStats} />
        </div>

        {/* ── Map ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 px-3 pt-2 pb-2">
          <MapWrapper
            incidents={filteredIncidents}
            showMVA={filterState.incidentTypes.includes('MVA')}
            showShooting={filterState.incidentTypes.includes('Shooting')}
            showTheft={filterState.incidentTypes.includes('Theft')}
            showStolenVehicle={filterState.incidentTypes.includes('Stolen Vehicle')}
          />
        </div>

        {/* ── Analytics panel with tabs ──────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-surface-border" style={{ height: '240px' }}>
          {/* Tab bar */}
          <div className="flex items-center gap-0 px-3 border-b border-surface-border bg-surface-card">
            {([
              { id: 'districts', label: 'District Breakdown' },
              { id: 'rankings',  label: 'Rankings' },
              { id: 'trends',    label: 'Monthly Trends' },
            ] as { id: AnalyticsTab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setAnalyticsTab(id)}
                className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                  analyticsTab === id
                    ? 'border-accent-blue text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="h-[calc(100%-33px)] overflow-auto">
            {analyticsTab === 'districts' && (
              <div className="p-3 h-full">
                <DistrictTable data={derivedDistricts} />
              </div>
            )}
            {analyticsTab === 'rankings' && (
              <div className="p-3 h-full">
                <DistrictRankings data={derivedDistricts} />
              </div>
            )}
            {analyticsTab === 'trends' && (
              <div className="p-3 h-full">
                <MonthlyTrendChart data={derivedMonths} />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
