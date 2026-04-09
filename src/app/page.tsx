'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FilterState, DistrictStats, MonthlyStat, IncidentType } from '@/types';
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
  incidentTypes: [], // empty = nothing shown (toggles start off)
  district: 'All',
};

type AnalyticsTab = 'districts' | 'rankings' | 'trends' | 'yoy' | 'reports';

const REPORTS = [
  { name: 'January 2026 Report', file: '/January 2026 Report.docx', month: 'January 2026' },
];

export default function DashboardPage() {
  const [filterState, setFilterState]       = useState<FilterState>(DEFAULT_FILTER);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [analyticsTab, setAnalyticsTab]     = useState<AnalyticsTab>('districts');
  const [mapFullscreen, setMapFullscreen]   = useState(false);
  const [activePeriod, setActivePeriod]     = useState<TimePeriod>({ month: null, week: null });

  // When user clicks a month:
  //   - If types are already toggled on → keep them (user is drilling into that month)
  //   - If nothing is toggled → auto-enable types with data in that month
  // When clicking YTD → clear toggles (clean slate)
  const handlePeriodSelect = (period: TimePeriod) => {
    setActivePeriod(period);

    if (period.month === null) {
      // YTD → clear toggles
      setFilterState(prev => ({ ...prev, incidentTypes: [] }));
      return;
    }

    // Only auto-toggle if nothing is currently selected
    if (filterState.incidentTypes.length > 0) return;

    // Auto-enable types that have data in the selected period
    const periodIncidents = filterByPeriod(allIncidents, period);
    const typesWithData = Array.from(new Set(periodIncidents.map(i => i.type))) as IncidentType[];
    setFilterState(prev => ({ ...prev, incidentTypes: typesWithData }));
  };

  const typeFiltered = useFilteredIncidents(allIncidents, filterState);
  const filteredIncidents = useMemo(() => filterByPeriod(typeFiltered, activePeriod), [typeFiltered, activePeriod]);

  // When a time period is selected, compute stats from filtered incidents
  // When YTD + All districts, use the authoritative CompStat summary stats
  const periodFiltered = useMemo(() => filterByPeriod(allIncidents, activePeriod), [activePeriod]);

  const derivedStats = useMemo(() => {
    const { district } = filterState;
    const isYTD = activePeriod.month === null;

    // YTD + All districts → use CompStat authoritative totals
    if (isYTD && district === 'All') {
      return {
        totalCrimes:    baseStats.totalCrimes,
        shootings:      baseStats.shootings,
        homicides:      baseStats.homicides,
        mvas:           baseStats.mvas,
        thefts:         baseStats.thefts,
        stolenVehicles: baseStats.stolenVehicles,
      };
    }

    // YTD + specific district → use stored district stats
    if (isYTD && district !== 'All') {
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

    // Specific period selected → count from actual incident records
    const pool = district !== 'All'
      ? periodFiltered.filter(i => i.district === district)
      : periodFiltered;

    return {
      totalCrimes:    pool.length, // count of mapped incidents in this period
      shootings:      pool.filter(i => i.type === 'Shots Fired' || i.type === 'Shooting Hit').length,
      homicides:      0, // no homicide incidents in data
      mvas:           pool.filter(i => i.type === 'MVA').length,
      thefts:         pool.filter(i => i.type === 'Theft').length,
      stolenVehicles: pool.filter(i => i.type === 'Stolen Vehicle').length,
    };
  }, [filterState.district, activePeriod, periodFiltered]);

  const derivedDistricts = useMemo<DistrictStats[]>(() => {
    const isYTD = activePeriod.month === null;

    // YTD → use authoritative CompStat district stats
    if (isYTD) {
      if (filterState.district === 'All') return allDistricts;
      return allDistricts.filter((d) => d.district === filterState.district);
    }

    // Specific period → compute district stats from actual incidents
    const pool = periodFiltered;
    const districts = filterState.district === 'All'
      ? ['North', 'East', 'South', 'West']
      : [filterState.district];

    return districts.map(dist => {
      const distPool = pool.filter(i => i.district === dist);
      return {
        district: dist as DistrictStats['district'],
        totalCrimes: distPool.length,
        shootings: distPool.filter(i => i.type === 'Shots Fired' || i.type === 'Shooting Hit').length,
        homicides: 0,
        mvas: distPool.filter(i => i.type === 'MVA').length,
        thefts: distPool.filter(i => i.type === 'Theft').length,
        stolenVehicles: distPool.filter(i => i.type === 'Stolen Vehicle').length,
      };
    });
  }, [filterState.district, activePeriod, periodFiltered]);

  return (
    <div className="flex flex-col h-screen overflow-hidden text-white" style={{ backgroundColor: '#000000' }}>

      {/* ── Header — stacks on mobile, row on desktop ──────────────────── */}
      <header className="w-full flex-shrink-0" style={{ backgroundColor: '#000000' }}>
        {/* Top row: logo + coin side by side */}
        <div className="flex items-center gap-3 px-3 py-2 md:px-4">
          <a href="/" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, textDecoration: 'none', cursor: 'pointer' }}>
            <h1 className="text-[16px] md:text-[24px]" style={{ fontFamily: 'var(--font-orbitron)', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1, margin: 0 }}>
              <span style={{ color: '#c8a96b' }}>Jersey City</span>{' '}
              <span style={{ color: '#FFFFFF' }}>IMPACT</span>
            </h1>
            <p className="hidden md:block" style={{ color: '#9CA3AF', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1, margin: '6px 0 0 0' }}>
              Integrated Metrics for Public Accountability &amp; Community Trust
            </p>
          </a>

          {/* JCPD badge — 3D spinning coin, right next to title */}
          <div className="coin-container w-[40px] h-[40px] md:w-[72px] md:h-[72px]" style={{ flexShrink: 0, perspective: '600px' }}>
            <div className="coin-spinner" style={{
              width: '100%',
              height: '100%',
              transformStyle: 'preserve-3d',
              animation: 'coinSpin 8s linear infinite',
            }}>
              <div style={{
                position: 'absolute', width: '100%', height: '100%',
                backfaceVisibility: 'hidden', borderRadius: '50%', overflow: 'hidden',
                border: '2px solid #c8a96b', boxShadow: '0 0 12px rgba(200,169,107,0.4)',
              }}>
                <img src="/jcimpact-logo.png" alt="JC IMPACT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{
                position: 'absolute', width: '100%', height: '100%',
                backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: '50%',
                overflow: 'hidden', border: '2px solid #c8a96b',
                boxShadow: '0 0 12px rgba(200,169,107,0.4)', background: '#000',
              }}>
                <img src="/jcpd-badge.webp" alt="JCPD Badge" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards — below logo on mobile, beside it on desktop */}
        <div className="px-3 pb-1 md:px-4">
          <StatCardsRow citywide={derivedStats} />
        </div>
      </header>

      {/* ── Bi-weekly timeline strip ─────────────────────────────────── */}
      <div className="px-2 md:px-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(200,169,107,0.2)' }}>
        <TimelineStrip
          incidents={filterState.incidentTypes.length > 0 ? typeFiltered : allIncidents}
          activePeriod={activePeriod}
          onSelect={handlePeriodSelect}
          hasActiveFilters={filterState.incidentTypes.length > 0}
        />
      </div>

      {/* ── Body: filter + map side by side, analytics below ──────────── */}
      <div className="flex flex-1 flex-col overflow-hidden px-2 py-1 md:px-4 md:py-2.5">

        {/* ── Mobile overlay ─────────────────────────────────────────── */}
        {mobileFilterOpen && (
          <div
            className="fixed inset-0 bg-black/85 z-40 md:hidden"
            onClick={() => setMobileFilterOpen(false)}
          />
        )}

        {/* ── Mobile top bar (hamburger only, hidden on desktop) ────── */}
        <div className="flex items-center px-3 h-11 border-b border-surface-border md:hidden" style={{ backgroundColor: '#0a1628' }}>
          <button
            className="p-2.5 -ml-1 text-[#9CA3AF] hover:text-white hover:bg-white/5 transition-colors rounded-lg"
            onClick={() => setMobileFilterOpen(true)}
            aria-label="Open filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="ml-2 text-xs text-white font-medium">Filters</span>
        </div>

        {/* ── Top row: Filter panel + Map side by side ────────────────── */}
        <div className="flex flex-1 min-h-0 gap-4">

          {/* ── Filter sidebar ─────────────────────────────────────── */}
          <aside
            className={`
              fixed inset-y-0 left-0 z-50 w-64 flex flex-col
              transition-transform duration-300 ease-in-out
              md:relative md:translate-x-0 md:z-auto md:w-[220px] md:flex-shrink-0
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
              className="absolute top-2 right-2 p-3 text-[#9CA3AF] hover:text-white transition-colors md:hidden rounded-lg"
              onClick={() => setMobileFilterOpen(false)}
              aria-label="Close filters"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              background: '#0a1628',
              flex: 1,
              minHeight: 0,
              position: 'relative',
            }}>
              <MapWrapper
                incidents={filteredIncidents}
                showMVA={filterState.incidentTypes.includes('MVA')}
                showShotsFired={filterState.incidentTypes.includes('Shots Fired')}
                showShootingHit={filterState.incidentTypes.includes('Shooting Hit')}
                showTheft={filterState.incidentTypes.includes('Theft')}
                showStolenVehicle={filterState.incidentTypes.includes('Stolen Vehicle')}
                showTrafficStop={filterState.incidentTypes.includes('Traffic Stop')}
                showPedestrianStruck={filterState.incidentTypes.includes('Pedestrian Struck')}
                selectedDistrict={filterState.district === 'All' ? null : filterState.district}
                onDistrictClick={(district) => {
                  setFilterState(prev => ({
                    ...prev,
                    district: prev.district === district ? 'All' : (district ?? 'All') as FilterState['district'],
                  }));
                }}
              />
              {/* Fullscreen expand button */}
              <button
                onClick={() => setMapFullscreen(true)}
                className="absolute top-2 left-2 z-10 p-2 rounded-lg transition-colors"
                style={{ background: 'rgba(10,22,40,0.85)', border: '1.5px solid rgba(200,169,107,0.4)' }}
                aria-label="Expand map"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Analytics panel with tabs (below filter+map) ────────── */}
        <div className="min-h-0 flex-1 max-h-[180px] md:max-h-[200px]" style={{ marginTop: '6px' }}>
          <div style={{
            border: '2px solid #c8a96b',
            borderRadius: '24px',
            overflow: 'hidden',
            background: '#0a1628',
            height: '100%',
            display: 'flex',
            flexDirection: 'column' as const,
          }}>
            {/* Tab bar */}
            <div className="flex items-center gap-0 px-1 md:px-3 w-full" style={{ borderBottom: '1px solid rgba(200,169,107,0.3)', flexShrink: 0 }}>
              {([
                { id: 'districts',  label: 'Districts' },
                { id: 'rankings',   label: 'Rankings' },
                { id: 'trends',     label: 'Trends' },
                { id: 'yoy',        label: 'YoY' },
                { id: 'reports',    label: 'Reports' },
              ] as { id: AnalyticsTab; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setAnalyticsTab(id)}
                  className={`flex-1 text-center py-1.5 text-[10px] md:py-2 md:text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
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
                  {analyticsTab === 'reports'   && (
                    <div className="flex flex-col gap-2">
                      {REPORTS.map((report) => (
                        <a
                          key={report.file}
                          href={`https://docs.google.com/gview?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + report.file : report.file)}&embedded=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 px-4 py-3 transition-colors"
                          style={{
                            border: '1.5px solid rgba(200,169,107,0.3)',
                            borderRadius: '12px',
                            background: 'rgba(200,169,107,0.05)',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.12)'; e.currentTarget.style.borderColor = '#c8a96b'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.05)'; e.currentTarget.style.borderColor = 'rgba(200,169,107,0.3)'; }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          <div>
                            <div style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600 }}>{report.name}</div>
                            <div style={{ color: '#9CA3AF', fontSize: '11px', marginTop: '2px' }}>Click to open • {report.month}</div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                      ))}
                      {REPORTS.length === 0 && (
                        <div style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                          No reports available yet.
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

      </div>

      {/* ── Fullscreen map modal ───────────────────────────────────── */}
      {mapFullscreen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ backgroundColor: '#000000' }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(200,169,107,0.3)' }}>
            <span style={{ color: '#c8a96b', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Incident Map
            </span>
            <button
              onClick={() => setMapFullscreen(false)}
              className="p-2 rounded-lg transition-colors hover:bg-white/10"
              style={{ border: '1.5px solid rgba(200,169,107,0.4)' }}
              aria-label="Close fullscreen map"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {/* Full map */}
          <div className="flex-1 min-h-0">
            <MapWrapper
              incidents={filteredIncidents}
              showMVA={filterState.incidentTypes.includes('MVA')}
              showShotsFired={filterState.incidentTypes.includes('Shots Fired')}
              showShootingHit={filterState.incidentTypes.includes('Shooting Hit')}
              showTheft={filterState.incidentTypes.includes('Theft')}
              showStolenVehicle={filterState.incidentTypes.includes('Stolen Vehicle')}
              showTrafficStop={filterState.incidentTypes.includes('Traffic Stop')}
              showPedestrianStruck={filterState.incidentTypes.includes('Pedestrian Struck')}
              selectedDistrict={filterState.district === 'All' ? null : filterState.district}
              onDistrictClick={(district) => {
                setFilterState(prev => ({
                  ...prev,
                  district: prev.district === district ? 'All' : (district ?? 'All') as FilterState['district'],
                }));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
