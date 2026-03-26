'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FilterState, DistrictStats, MonthlyStat } from '@/types';
import rawData from '@/data/data.json';
import { useFilteredIncidents } from '@/hooks/useFilteredIncidents';
import FilterPanel from '@/components/filters/FilterPanel';
import StatCardsRow from '@/components/stats/StatCardsRow';
import MapWrapper from '@/components/map/MapWrapper';
import DistrictTable from '@/components/analytics/DistrictTable';
import DistrictRankings from '@/components/analytics/DistrictRankings';
import MonthlyTrendChart from '@/components/analytics/MonthlyTrendChart';
import YoYComparison from '@/components/analytics/YoYComparison';
import TimelineStrip, { filterByPeriod, type TimePeriod } from '@/components/filters/TimelineStrip';
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
  incidentTypes: [], // empty = all types shown (no filter)
  district: 'All',
};

type AnalyticsTab = 'districts' | 'rankings' | 'trends' | 'yoy';

export default function DashboardPage() {
  const [filterState, setFilterState]       = useState<FilterState>(DEFAULT_FILTER);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab]     = useState<AnalyticsTab>('districts');
  const [activePeriod, setActivePeriod]     = useState<TimePeriod>({ month: null, half: null });

  const typeFiltered = useFilteredIncidents(allIncidents, filterState);
  const filteredIncidents = useMemo(() => filterByPeriod(typeFiltered, activePeriod), [typeFiltered, activePeriod]);

  const derivedStats = useMemo(() => {
    const { district } = filterState;

    if (district !== 'All') {
      const d = allDistricts.find((x) => x.district === district);
      return {
        totalCrimes:    d?.totalCrimes    ?? 0,
        shootings:      d?.shootings      ?? 0,
        homicides:      d?.homicides      ?? 0,
        mvas:           d?.mvas           ?? 0,
        thefts:         d?.thefts         ?? 0,
        stolenVehicles: d?.stolenVehicles ?? 0,
      };
    }

    return {
      totalCrimes:    baseStats.totalCrimes,
      shootings:      baseStats.shootings,
      homicides:      baseStats.homicides,
      mvas:           baseStats.mvas,
      thefts:         baseStats.thefts,
      stolenVehicles: baseStats.stolenVehicles,
    };
  }, [filterState.district]);

  const derivedDistricts = useMemo<DistrictStats[]>(() => {
    if (filterState.district === 'All') return allDistricts;
    return allDistricts.filter((d) => d.district === filterState.district);
  }, [filterState.district]);

  return (
    <div className="flex flex-col h-screen overflow-hidden text-white" style={{ backgroundColor: '#3A3F47' }}>

      {/* ── Full-width command header with stat cards ──────────────────── */}
      <header
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderTop: '3px solid #3B82F6',
          borderBottom: 'none',
          backgroundColor: '#3A3F47',
          flexShrink: 0,
          gap: '16px',
        }}
      >
        {/* Left — title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <h1 style={{ color: '#FFFFFF', fontSize: '22px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>
            JC IMPACT
          </h1>
          <p style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, margin: '5px 0 0 0' }}>
            Integrated Metrics for Public Accountability &amp; Community Trust
          </p>
        </div>

        {/* JCPD badge — between title and stat cards */}
        <div style={{ flexShrink: 0 }}>
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L4 7v9c0 7 5.4 13.5 12 15 6.6-1.5 12-8 12-15V7L16 2z" fill="#3A3F47" stroke="#c4a832" strokeWidth="1.5"/>
            <path d="M16 6L7 10v7c0 5 3.8 9.5 9 10.8 5.2-1.3 9-5.8 9-10.8v-7L16 6z" fill="#1e2229"/>
            <text x="16" y="21" textAnchor="middle" fill="#c4a832" fontSize="9" fontWeight="bold" fontFamily="monospace">JCPD</text>
          </svg>
        </div>

        {/* Stat cards filling remaining space */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <StatCardsRow citywide={derivedStats} />
        </div>
      </header>

      {/* ── Bi-weekly timeline strip ─────────────────────────────────── */}
      <div style={{ padding: '0 16px', flexShrink: 0, borderBottom: '1px solid rgba(200,169,107,0.2)' }}>
        <TimelineStrip
          incidents={typeFiltered}
          activePeriod={activePeriod}
          onSelect={setActivePeriod}
        />
      </div>

      {/* ── Body: filter + map side by side, analytics below ──────────── */}
      <div className="flex flex-1 flex-col overflow-hidden" style={{ padding: '10px 16px 14px' }}>

        {/* ── Mobile overlay ─────────────────────────────────────────── */}
        {mobileFilterOpen && (
          <div
            className="fixed inset-0 bg-black/85 z-40 lg:hidden"
            onClick={() => setMobileFilterOpen(false)}
          />
        )}

        {/* ── Mobile top bar (hamburger only, hidden on desktop) ────── */}
        <div className="flex items-center px-3 h-10 border-b border-surface-border bg-surface-nav lg:hidden">
          <button
            className="p-1.5 text-[#9CA3AF] hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => setMobileFilterOpen(true)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>

        {/* ── Top row: Filter panel + Map side by side ────────────────── */}
        <div className="flex flex-1 min-h-0 gap-4">

          {/* ── Filter sidebar ─────────────────────────────────────── */}
          <aside
            className={`
              fixed inset-y-0 left-0 z-50 w-64 flex flex-col
              transition-transform duration-300 ease-in-out
              lg:relative lg:translate-x-0 lg:z-auto lg:w-[220px] lg:flex-shrink-0
              ${mobileFilterOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
            style={{ background: 'transparent', padding: 0 }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <FilterPanel
                filterState={filterState}
                onChange={setFilterState}
                incidentCount={filteredIncidents.length}
              />
            </div>
            <button
              className="absolute top-3 right-3 p-1.5 text-[#9CA3AF] hover:text-white transition-colors lg:hidden"
              onClick={() => setMobileFilterOpen(false)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </aside>

          {/* ── Map ────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              border: '2px solid #c8a96b',
              borderRadius: '24px',
              overflow: 'hidden',
              background: '#1b2740',
              flex: 1,
              minHeight: 0,
              position: 'relative',
            }}>
              <MapWrapper
                incidents={filteredIncidents}
                showMVA={filterState.incidentTypes.includes('MVA')}
                showShooting={filterState.incidentTypes.includes('Shooting')}
                showTheft={filterState.incidentTypes.includes('Theft')}
                showStolenVehicle={filterState.incidentTypes.includes('Stolen Vehicle')}
              />
            </div>
          </div>
        </div>

        {/* ── Analytics panel with tabs (below filter+map) ────────── */}
        <div className="flex-shrink-0" style={{ height: '260px', marginTop: '12px' }}>
          <div style={{
            border: '2px solid #c8a96b',
            borderRadius: '24px',
            overflow: 'hidden',
            background: '#1b2740',
            height: '100%',
            display: 'flex',
            flexDirection: 'column' as const,
          }}>
            {/* Tab bar */}
            <div className="flex items-center gap-0 px-3" style={{ borderBottom: '1px solid rgba(200,169,107,0.3)', flexShrink: 0 }}>
              {([
                { id: 'districts', label: 'District Breakdown' },
                { id: 'rankings',  label: 'Rankings' },
                { id: 'trends',    label: 'Monthly Trends' },
                { id: 'yoy',       label: 'vs Last Year' },
              ] as { id: AnalyticsTab; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setAnalyticsTab(id)}
                  className={`px-4 py-2.5 text-[14px] font-semibold border-b-2 transition-colors ${
                    analyticsTab === id
                      ? 'border-accent-amber text-white'
                      : 'border-transparent text-[#9CA3AF] hover:text-[#E5E7EB]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={analyticsTab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="p-3 h-full"
                >
                  {analyticsTab === 'districts' && <DistrictTable data={derivedDistricts} />}
                  {analyticsTab === 'rankings'  && <DistrictRankings data={derivedDistricts} />}
                  {analyticsTab === 'trends'    && <MonthlyTrendChart data={allMonths} />}
                  {analyticsTab === 'yoy'       && <YoYComparison data={allMonths} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
