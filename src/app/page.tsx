'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilterState, DistrictStats, IncidentType } from '@/types';
import rawData from '@/data/data.json';
import { useFilteredIncidents } from '@/hooks/useFilteredIncidents';
import FilterPanel from '@/components/filters/FilterPanel';
import StatCardsRow from '@/components/stats/StatCardsRow';
import MapWrapper from '@/components/map/MapWrapper';
import MapSearchBox, { type SearchTarget } from '@/components/map/MapSearchBox';
import TimelineStrip, { filterByPeriod, type TimePeriod } from '@/components/filters/TimelineStrip';
import type { Incident } from '@/types';

const allIncidents = rawData.incidents as Incident[];
const baseStats    = rawData.citywide;
const allDistricts = rawData.byDistrict as DistrictStats[];

const [_y, _m, _d] = rawData.meta.generated.split('-').map(Number);
const DATA_YEAR = _y;
const META_UPDATED = new Date(_y, _m - 1, _d).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
});

const DEFAULT_FILTER: FilterState = {
  incidentTypes: [],
  district: 'All',
};

const REPORTS = [
  { name: 'CompStat — January 2026', file: '/CompStat January 2026.pdf', month: 'January 2026' },
  { name: 'CompStat — February 2026', file: '/CompStat February 2026.pdf', month: 'February 2026' },
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function DashboardPage() {
  const [filterState, setFilterState]       = useState<FilterState>(DEFAULT_FILTER);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen]   = useState(false);
  const [activePeriod, setActivePeriod]     = useState<TimePeriod>({ month: null, weeks: [] });
  const [openReport, setOpenReport]         = useState<{ name: string; file: string } | null>(null);
  const [reportLoading, setReportLoading]   = useState(false);
  const [reportsOpen, setReportsOpen]       = useState(false);
  const [searchTarget, setSearchTarget]     = useState<SearchTarget | null>(null);
  const [aboutOpen, setAboutOpen]           = useState(false);

  // Reset loading state whenever a new report is opened
  useEffect(() => {
    if (openReport) setReportLoading(true);
  }, [openReport]);

  // Escape closes whichever modal is open (About > report viewer > fullscreen map)
  useEffect(() => {
    if (!openReport && !mapFullscreen && !aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (aboutOpen)        setAboutOpen(false);
      else if (openReport)  setOpenReport(null);
      else if (mapFullscreen) setMapFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openReport, mapFullscreen, aboutOpen]);

  const handlePeriodSelect = (period: TimePeriod) => {
    setActivePeriod(period);

    // YTD clears the time window; keep the user's current incident-type +
    // district filters intact (don't auto-toggle everything on).
    if (period.month === null) return;

    // Month/week selection: only auto-enable types if the user hasn't
    // already toggled some on — otherwise respect what they've chosen.
    if (filterState.incidentTypes.length > 0) return;

    const periodIncidents = filterByPeriod(allIncidents, period, DATA_YEAR);
    const typesWithData = Array.from(new Set(periodIncidents.map(i => i.type))) as IncidentType[];
    setFilterState(prev => ({ ...prev, incidentTypes: typesWithData }));
  };

  const typeFiltered = useFilteredIncidents(allIncidents, filterState);
  const filteredIncidents = useMemo(() => filterByPeriod(typeFiltered, activePeriod, DATA_YEAR), [typeFiltered, activePeriod]);

  const periodFiltered = useMemo(() => filterByPeriod(allIncidents, activePeriod, DATA_YEAR), [activePeriod]);

  // Pool for the Count-by-Type sidebar widget — respects period + district,
  // but ignores type toggles (so you always see the full category breakdown).
  const countPool = useMemo(() => {
    return filterState.district === 'All'
      ? periodFiltered
      : periodFiltered.filter((i) => i.district === filterState.district);
  }, [periodFiltered, filterState.district]);

  const periodLabel = useMemo(() => {
    if (activePeriod.month === null) return `YTD ${DATA_YEAR}`;
    const month = MONTH_NAMES[activePeriod.month];
    if (!activePeriod.weeks || activePeriod.weeks.length === 0) return `${month} ${DATA_YEAR}`;
    const weeks = [...activePeriod.weeks].sort((a, b) => a - b);
    const wkLabel = weeks.length === 1 ? `wk ${weeks[0]}` : `wk ${weeks[0]}-${weeks[weeks.length - 1]}`;
    return `${month} ${DATA_YEAR} (${wkLabel})`;
  }, [activePeriod]);

  const districtLabel = filterState.district === 'All'
    ? 'All Districts'
    : `${filterState.district} District`;

  const derivedStats = useMemo(() => {
    const { district } = filterState;
    const isYTD = activePeriod.month === null;

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

    const pool = district !== 'All'
      ? periodFiltered.filter(i => i.district === district)
      : periodFiltered;

    return {
      totalCrimes:    pool.length,
      shootings:      pool.filter(i => i.type === 'Shots Fired' || i.type === 'Shooting Hit').length,
      homicides:      0,
      mvas:           pool.filter(i => i.type === 'MVA').length,
      thefts:         pool.filter(i => i.type === 'Theft').length,
      stolenVehicles: pool.filter(i => i.type === 'Stolen Vehicle').length,
    };
  }, [filterState.district, activePeriod, periodFiltered]);

  return (
    <div className="flex flex-col h-screen overflow-hidden text-white" style={{ backgroundColor: '#000000' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="w-full flex-shrink-0" style={{ backgroundColor: '#000000' }}>
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

          <div className="coin-container w-[40px] h-[40px] md:w-[72px] md:h-[72px]" style={{ flexShrink: 0, perspective: '600px' }}>
            <div className="coin-spinner" style={{
              width: '100%', height: '100%',
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

          {/* About button — opens the info modal */}
          <button
            onClick={() => setAboutOpen(true)}
            className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 transition-colors"
            style={{
              border: '1.5px solid #c8a96b',
              background: 'transparent',
              color: '#c8a96b',
              borderRadius: '50%',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
              lineHeight: 1,
            }}
            aria-label="About this dashboard"
            title="About"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            i
          </button>
        </div>

        <div className="px-3 pb-1 md:px-4">
          <StatCardsRow citywide={derivedStats} />
        </div>
      </header>

      {/* ── Timeline strip ───────────────────────────────────────────── */}
      <div className="px-2 md:px-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(200,169,107,0.2)' }}>
        <TimelineStrip
          incidents={filterState.incidentTypes.length > 0 ? typeFiltered : allIncidents}
          activePeriod={activePeriod}
          onSelect={handlePeriodSelect}
          year={DATA_YEAR}
          hasActiveFilters={filterState.incidentTypes.length > 0}
        />
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden px-2 py-1 md:px-4 md:py-2.5">

        {/* Mobile overlay */}
        {mobileFilterOpen && (
          <div
            className="fixed inset-0 bg-black/85 z-40 md:hidden"
            onClick={() => setMobileFilterOpen(false)}
          />
        )}

        {/* Mobile top bar */}
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

        {/* ── Main row: left column + map ─────────────────────────────── */}
        <div className="flex flex-1 min-h-0 gap-4">

          {/* ── Left column: Filters + Reports stacked ─────────────── */}
          <aside
            className={`
              fixed inset-y-0 left-0 z-50 w-64 flex flex-col gap-2
              transition-transform duration-300 ease-in-out
              md:relative md:translate-x-0 md:z-auto md:w-[220px] md:flex-shrink-0
              ${mobileFilterOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
            style={{ background: 'transparent', padding: 0 }}
          >
            {/* Filter panel — fills available space */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <FilterPanel
                filterState={filterState}
                onChange={setFilterState}
                incidentCount={filteredIncidents.length}
                countIncidents={countPool}
                periodLabel={periodLabel}
                districtLabel={districtLabel}
              />
            </div>

            {/* Reports panel — click header to expand vertical scroll tabs */}
            <div style={{ flexShrink: 0 }}>
              <div style={{
                background: '#0a1628',
                border: '2px solid #c8a96b',
                borderRadius: '24px',
                overflow: 'hidden',
              }}>
                {/* Clickable header — toggles the dropdown */}
                <button
                  onClick={() => setReportsOpen(v => !v)}
                  className="w-full flex items-center gap-2 transition-colors"
                  style={{
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  aria-expanded={reportsOpen}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span style={{
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '13px',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    flex: 1,
                  }}>
                    Reports
                  </span>
                  <span style={{ color: '#c8a96b', fontSize: '11px', fontWeight: 500 }}>
                    {REPORTS.length}
                  </span>
                  {/* Chevron rotates when open */}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      flexShrink: 0,
                      transition: 'transform 0.2s ease',
                      transform: reportsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Collapsible: vertical scroll tab list */}
                {reportsOpen && (
                  <>
                    <div style={{ height: '1px', background: '#c8a96b', opacity: 0.5, margin: '0 16px' }} />
                    {REPORTS.length === 0 ? (
                      <div style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center', padding: '10px 16px 16px' }}>
                        No reports available yet.
                      </div>
                    ) : (
                      <div
                        className="reports-scroll"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          padding: '10px 12px 14px',
                          maxHeight: '120px',
                          overflowY: 'scroll',
                          overflowX: 'hidden',
                          scrollbarWidth: 'thin',
                          scrollbarGutter: 'stable',
                        }}
                      >
                        {REPORTS.map((report) => (
                          <button
                            key={report.file}
                            onClick={() => setOpenReport(report)}
                            className="transition-colors w-full text-left flex items-center gap-2"
                            style={{
                              flexShrink: 0,
                              border: '1.5px solid rgba(200,169,107,0.4)',
                              borderRadius: '10px',
                              background: 'rgba(200,169,107,0.08)',
                              color: '#FFFFFF',
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              letterSpacing: '0.02em',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#c8a96b'; e.currentTarget.style.color = '#0a1628'; e.currentTarget.style.borderColor = '#c8a96b'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.08)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'rgba(200,169,107,0.4)'; }}
                          >
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {report.month}
                            </span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.75 }}>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Mobile close button */}
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

          {/* ── Map — fills all remaining space ────────────────────── */}
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
                flyToTarget={searchTarget}
              />
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
              <MapSearchBox
                onSelect={setSearchTarget}
                onClear={() => setSearchTarget(null)}
                style={{ position: 'absolute', top: 8, left: 48, zIndex: 10, width: 260 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Report viewer modal ───────────────────────────────────── */}
      {openReport && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(200,169,107,0.3)', background: '#0a1628' }}>
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: '15px' }}>{openReport.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Download link */}
              <a
                href={openReport.file}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                style={{ border: '1.5px solid rgba(200,169,107,0.4)', color: '#c8a96b', fontSize: '12px', fontWeight: 600, textDecoration: 'none', background: 'rgba(200,169,107,0.08)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.18)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(200,169,107,0.08)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </a>
              {/* Close */}
              <button
                onClick={() => setOpenReport(null)}
                className="p-2 rounded-lg transition-colors hover:bg-white/10"
                style={{ border: '1.5px solid rgba(200,169,107,0.3)', color: '#9CA3AF' }}
                aria-label="Close report"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Iframe — PDFs render natively, .docx uses Google Docs viewer */}
          <div className="flex-1 min-h-0 relative" style={{ background: '#0a1628' }}>
            <iframe
              key={openReport.file}
              onLoad={() => setReportLoading(false)}
              src={
                openReport.file.toLowerCase().endsWith('.pdf')
                  ? encodeURI(openReport.file)
                  : `https://docs.google.com/gview?url=${encodeURIComponent(
                      typeof window !== 'undefined' ? window.location.origin + openReport.file : openReport.file
                    )}&embedded=true`
              }
              className="w-full h-full"
              style={{
                border: 'none',
                background: '#fff',
                opacity: reportLoading ? 0 : 1,
                transition: 'opacity 0.2s ease',
              }}
              title={openReport.name}
            />
            {/* Spinner — visible above the dark container while iframe is loading */}
            {reportLoading && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
                style={{ color: '#c8a96b' }}
              >
                <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>
                  Loading document&hellip;
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fullscreen map modal ───────────────────────────────────── */}
      {mapFullscreen && (
        <div className="fixed inset-0 z-[100] flex flex-col" style={{ backgroundColor: '#000000' }}>
          <div className="px-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(200,169,107,0.3)' }}>
            <TimelineStrip
              incidents={filterState.incidentTypes.length > 0 ? typeFiltered : allIncidents}
              activePeriod={activePeriod}
              onSelect={handlePeriodSelect}
              year={DATA_YEAR}
              hasActiveFilters={filterState.incidentTypes.length > 0}
            />
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-[220px] flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid rgba(200,169,107,0.3)' }}>
              <FilterPanel
                filterState={filterState}
                onChange={setFilterState}
                incidentCount={filteredIncidents.length}
                countIncidents={countPool}
                periodLabel={periodLabel}
                districtLabel={districtLabel}
              />
            </div>
            <div className="flex-1 min-h-0 relative">
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
                flyToTarget={searchTarget}
              />
              <button
                onClick={() => setMapFullscreen(false)}
                className="absolute top-3 left-3 z-10 p-2 rounded-lg transition-colors hover:bg-white/10"
                style={{ background: 'rgba(10,22,40,0.85)', border: '1.5px solid rgba(200,169,107,0.4)' }}
                aria-label="Close fullscreen map"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <MapSearchBox
                onSelect={setSearchTarget}
                onClear={() => setSearchTarget(null)}
                style={{ position: 'absolute', top: 12, left: 56, zIndex: 10, width: 300 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── About modal ────────────────────────────────────────────── */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
          onClick={() => setAboutOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0a1628',
              border: '2px solid #c8a96b',
              borderRadius: '12px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(200,169,107,0.3)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 30, height: 30, borderRadius: '50%', overflow: 'hidden',
                    border: '2px solid #c8a96b', flexShrink: 0,
                  }}
                >
                  <img src="/jcimpact-logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <h2
                  id="about-title"
                  style={{
                    fontFamily: 'var(--font-orbitron)',
                    fontWeight: 900,
                    fontSize: '15px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    margin: 0,
                  }}
                >
                  <span style={{ color: '#c8a96b' }}>About</span>{' '}
                  <span style={{ color: '#FFFFFF' }}>JC IMPACT</span>
                </h2>
              </div>
              <button
                onClick={() => setAboutOpen(false)}
                aria-label="Close about"
                className="p-2 rounded-lg transition-colors hover:bg-white/10"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div
              className="overflow-y-auto px-5 md:px-6 py-5"
              style={{ color: '#E5E7EB', fontSize: '14px', lineHeight: 1.6 }}
            >
              <AboutSection title="What this dashboard is">
                JC IMPACT (Integrated Metrics for Public Accountability &amp; Community Trust) publishes public-safety incident
                data tracked by the Jersey City Police Department&apos;s IMPACT program. The dashboard is updated weekly and
                reflects incidents reported Monday through Sunday of the prior week.
              </AboutSection>

              <AboutSection title="Incident categories displayed">
                The map plots seven IMPACT-tracked categories:
                <ul style={{ marginTop: '8px', marginLeft: '20px', listStyle: 'disc' }}>
                  <li>Shots Fired</li>
                  <li>Shooting Hit</li>
                  <li>Motor Vehicle Accidents (MVAs)</li>
                  <li>Pedestrian Struck</li>
                  <li>Traffic Stops</li>
                  <li>Theft</li>
                  <li>Stolen Vehicle</li>
                </ul>
                <p style={{ marginTop: '10px' }}>
                  Data is sourced from JCPD reports and New Jersey Crash Reports. Each incident is geocoded to its street
                  intersection using the ArcGIS World Geocoder and validated against the OpenStreetMap street network to
                  correct ambiguous cases.
                </p>
              </AboutSection>

              <AboutSection title="What this dashboard is not">
                This is a subset of public-safety data, not a complete crime report. Categories outside IMPACT&apos;s tracking
                scope — including domestic violence, burglary, drug offenses, weapons offenses, fraud, and others — are not
                displayed here. For comprehensive crime statistics, contact the Jersey City Police Department directly.
              </AboutSection>

              <AboutSection title="Address and privacy">
                Individual addresses are displayed at <strong style={{ color: '#FFFFFF' }}>block level</strong> (e.g.,
                &ldquo;700 block of Ocean Ave&rdquo;) to protect the privacy of residents and victims. Intersection-level
                incidents retain their cross-street labels. No personal identifiers — officer names, victim or suspect names,
                case numbers, license plates, or vehicle identification numbers — are included in any published record.
              </AboutSection>

              <AboutSection title="District assignment">
                Each incident is mapped to one of the four JCPD patrol districts (North, East, South, West) based on where
                the geocoded point falls within the official JCPD patrol boundaries.
              </AboutSection>

              <AboutSection title="Data caveats">
                All figures are preliminary and subject to further analysis and revision. Records with incomplete, ambiguous,
                or unresolvable addresses are excluded from the map. Numbers shown may shift slightly as incidents are
                reviewed and reclassified.
              </AboutSection>

              <div
                style={{
                  marginTop: '18px',
                  paddingTop: '14px',
                  borderTop: '1px solid rgba(200,169,107,0.15)',
                  color: '#9CA3AF',
                  fontSize: '12px',
                }}
              >
                Last updated: <span style={{ color: '#c8a96b', fontWeight: 600 }}>{META_UPDATED}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small helper component for each About section ────────────────────────
function AboutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '18px' }}>
      <h3
        style={{
          color: '#c8a96b',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}
      >
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}
