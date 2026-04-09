'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Incident } from '@/types';
import { incidentsToGeoJSON, buildTypeFilter } from '@/lib/mapUtils';
import { TYPE_COLORS } from '@/lib/colors';
import { districtGeoJSON, wardsGeoJSON } from '@/data/boundaryData';

interface MapboxMapProps {
  incidents: Incident[];
  showMVA: boolean;
  showShotsFired: boolean;
  showShootingHit: boolean;
  showTheft: boolean;
  showStolenVehicle: boolean;
  showTrafficStop: boolean;
  showPedestrianStruck: boolean;
  selectedDistrict?: string | null;
  onDistrictClick?: (district: string | null) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const JC_CENTER: [number, number] = [-74.0706, 40.7178];
const JC_ZOOM = 12.35;
const MAP_STYLE = 'mapbox://styles/mapbox/standard';
const SOURCE_ID = 'incidents';

const DISTRICT_LAYERS = ['districts-fill', 'districts-border', 'district-labels', 'district-selected-outline'] as const;
const WARD_LAYERS    = ['wards-fill', 'wards-border', 'ward-labels', 'ward-selected-outline'] as const;

export default function MapboxMap({ incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck, selectedDistrict, onDistrictClick }: MapboxMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const popupRef      = useRef<mapboxgl.Popup | null>(null);
  const initializedRef = useRef(false);
  const mapLoadedRef  = useRef(false);

  const [showDistricts, setShowDistricts] = useState(true);
  const [showWards,     setShowWards]     = useState(false);
  const [mapReady,      setMapReady]      = useState(false);
  const [mapError,      setMapError]      = useState<string | null>(null);
  const [darkMode,      setDarkMode]      = useState(true);
  const onDistrictClickRef = useRef(onDistrictClick);

  onDistrictClickRef.current = onDistrictClick;

  // ── Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    if (!MAPBOX_TOKEN) {
      setMapError('Mapbox token missing — add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: JC_CENTER,
      zoom: JC_ZOOM,
      attributionControl: false,
    });

    map.on('error', (e) => {
      console.error('Mapbox error:', e.error?.message || e);
      if (e.error?.message?.includes('access token')) {
        setMapError('Invalid Mapbox token — check NEXT_PUBLIC_MAPBOX_TOKEN');
      }
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      // eslint-disable-next-line
      (map as Record<string, any>).setConfigProperty('basemap', 'lightPreset', 'night');
      // eslint-disable-next-line
      (map as Record<string, any>).setConfigProperty('basemap', 'showPointOfInterestLabels', false);

      // ── District polygons (behind wards) ────────────────────────────
      map.addSource('districts', { type: 'geojson', data: districtGeoJSON as GeoJSON.FeatureCollection });

      map.addLayer({
        id: 'districts-fill', type: 'fill', source: 'districts',
        slot: 'middle',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35,
          'fill-emissive-strength': 0.65,
        },
      });
      map.addLayer({
        id: 'districts-border', type: 'line', source: 'districts',
        slot: 'middle',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 1,
          'line-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'district-selected-outline', type: 'line', source: 'districts',
        slot: 'middle',
        filter: ['==', ['get', 'id'], '__NONE__'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 1,
        },
      });
      map.addLayer({
        id: 'district-labels', type: 'symbol', source: 'districts',
        slot: 'top',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Italic', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
          'text-opacity': 0.9,
        },
      });

      // ── Ward polygons (on top of districts) ─────────────────────────
      map.addSource('wards', { type: 'geojson', data: wardsGeoJSON as GeoJSON.FeatureCollection });

      map.addLayer({
        id: 'wards-fill', type: 'fill', source: 'wards',
        slot: 'middle',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'match', ['upcase', ['get', 'ward']],
            'A', '#1B9E77', 'B', '#D95F02', 'C', '#7570B3',
            'D', '#E7298A', 'E', '#66A61E', 'F', '#E6AB02',
            '#64748B',
          ],
          'fill-opacity': 0.5,
          'fill-emissive-strength': 0.62,
        },
      });
      map.addLayer({
        id: 'wards-border', type: 'line', source: 'wards',
        slot: 'middle',
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-opacity': 0.9,
          'line-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'ward-labels', type: 'symbol', source: 'wards',
        slot: 'top',
        layout: {
          visibility: 'none',
          'text-field': ['concat', 'Ward ', ['upcase', ['get', 'ward']]],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 13,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'ward-selected-outline', type: 'line', source: 'wards',
        slot: 'middle',
        layout: { visibility: 'none' },
        filter: ['==', ['upcase', ['get', 'ward']], '__NONE__'],
        paint: {
          'line-color': '#C9A84C',
          'line-width': 3,
          'line-opacity': 0.95,
          'line-emissive-strength': 1,
        },
      });

      // ── Incident clusters + points ───────────────────────────────────
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: incidentsToGeoJSON([]),
      });
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: SOURCE_ID,
        slot: 'top',
        paint: {
          'circle-color': ['match', ['get', 'type'],
            'Shots Fired',      TYPE_COLORS['Shots Fired'],
            'Shooting Hit',     TYPE_COLORS['Shooting Hit'],
            'MVA',              TYPE_COLORS['MVA'],
            'Theft',            TYPE_COLORS['Theft'],
            'Stolen Vehicle',   TYPE_COLORS['Stolen Vehicle'],
            'Traffic Stop',     TYPE_COLORS['Traffic Stop'],
            'Pedestrian Struck',TYPE_COLORS['Pedestrian Struck'],
            '#6b7280'],
          'circle-radius': 9,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.6,
          'circle-opacity': 1,
          'circle-emissive-strength': 1,
        },
      });


      // ── Cursors ──────────────────────────────────────────────────────
      (['unclustered-point', 'wards-fill', 'districts-fill'] as const).forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      // ── Incident point popup ─────────────────────────────────────────
      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string>;
        const geom  = feature.geometry as GeoJSON.Point;
        if (popupRef.current) popupRef.current.remove();
        const POPUP_COLORS: Record<string, string> = TYPE_COLORS as Record<string, string>;
        const TYPE_LABELS: Record<string, string> = {
          'Shots Fired':      'Shots Fired',
          'Shooting Hit':     'Shooting Hit',
          'MVA':              'Motor Vehicle Accident',
          'Theft':            'Theft',
          'Stolen Vehicle':   'Stolen Vehicle',
          'Traffic Stop':     'Traffic Stop',
          'Pedestrian Struck':'Pedestrian Struck',
        };
        const typeColor = POPUP_COLORS[props.type] ?? '#6b7280';
        const typeLabel = TYPE_LABELS[props.type] ?? props.type;
        const dateStr   = new Date(props.date + 'T00:00:00').toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });
        popupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(`
            <div style="line-height:1.5">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${typeColor};flex-shrink:0"></span>
                <span style="font-weight:600;font-size:13px;color:${typeColor}">${typeLabel}</span>
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">${dateStr}</div>
              <div style="font-size:13px;color:#e2e8f0;margin-bottom:${props.description ? '6px' : '0'}">${props.address}</div>
              ${props.description ? `<div style="font-size:11px;color:#64748b;font-style:italic">${props.description}</div>` : ''}
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid #1e2535;font-size:11px;color:#475569">${props.district} District</div>
            </div>
          `)
          .addTo(map);
      });

      // ── Ward hover popup ─────────────────────────────────────────────
      const wardPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on('mousemove', 'wards-fill', (e) => {
        const props = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!props) return;
        wardPopup.setLngLat(e.lngLat).setHTML(`
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">Ward ${(props.ward || '').toUpperCase()}</div>
          <div style="font-size:11px;color:#94a3b8">Council: ${props.council_pe || ''}</div>
        `).addTo(map);
      });
      map.on('mouseleave', 'wards-fill', () => wardPopup.remove());

      // ── District hover popup ─────────────────────────────────────────
      const districtPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on('mousemove', 'districts-fill', (e) => {
        const props = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!props) return;
        districtPopup.setLngLat(e.lngLat).setHTML(`
          <div style="font-weight:600;font-size:13px;color:${props.color || '#fff'};margin-bottom:2px">${props.name}</div>
          <div style="font-size:11px;color:#94a3b8">JCPD Patrol District</div>
        `).addTo(map);
      });
      map.on('mouseleave', 'districts-fill', () => districtPopup.remove());

      // ── District click → filter ────────────────────────────────────
      map.on('click', 'districts-fill', (e) => {
        const props = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!props?.name) return;
        onDistrictClickRef.current?.(props.name);
      });

      mapLoadedRef.current = true;
      setMapReady(true);

      // Ensure map fills its new container properly
      setTimeout(() => map.resize(), 100);
    });

    // Resize map when container dimensions change (e.g. new wrapper)
    const ro = new ResizeObserver(() => { map.resize(); });
    ro.observe(containerRef.current!);

    return () => {
      ro.disconnect();
      mapLoadedRef.current = false;
      setMapReady(false);
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  // ── Sync incident data + type filter ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(incidentsToGeoJSON(incidents));
    if (map.getLayer('unclustered-point')) {
      map.setFilter('unclustered-point', buildTypeFilter(showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck) as mapboxgl.FilterSpecification);
    }
  }, [incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck, mapReady]);

  // ── Toggle light/dark mode ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    try {
      (map as Record<string, any>).setConfigProperty('basemap', 'lightPreset', darkMode ? 'night' : 'day');
    } catch {}
  }, [darkMode, mapReady]);

  // ── Highlight selected district ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('district-selected-outline')) {
      const filter = selectedDistrict
        ? ['==', ['get', 'name'], selectedDistrict]
        : ['==', ['get', 'name'], '__NONE__'];
      map.setFilter('district-selected-outline', filter as mapboxgl.FilterSpecification);
    }
  }, [selectedDistrict, mapReady]);

  // ── Toggle district layer visibility ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = showDistricts ? 'visible' : 'none';
    DISTRICT_LAYERS.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }, [showDistricts]);

  // ── Toggle ward layer visibility ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = showWards ? 'visible' : 'none';
    WARD_LAYERS.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }, [showWards]);


  if (mapError) {
    return (
      <div className="w-full h-full bg-[#0a1628] flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-red-400 text-sm font-semibold mb-1">Map Error</div>
          <div className="text-slate-400 text-xs">{mapError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Layer toggles + dark/light — top-right ─────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        {/* Sun/Moon toggle */}
        <button
          onClick={() => setDarkMode(v => !v)}
          className="flex items-center justify-center w-8 h-8 border transition-all duration-150 cursor-pointer select-none"
          style={{
            background: '#0F172A',
            borderColor: '#1F2937',
            borderRadius: '4px',
          }}
          aria-label={darkMode ? 'Switch to light map' : 'Switch to dark map'}
        >
          {darkMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <LayerToggle
          label="Districts"
          active={showDistricts}
          color="#F59E0B"
          onClick={() => setShowDistricts(v => !v)}
        />
        <LayerToggle
          label="Wards"
          active={showWards}
          color="#C9A84C"
          onClick={() => setShowWards(v => !v)}
        />
      </div>

      {/* ── District legend (only when visible) ──────────────────────── */}
      {showDistricts && (
        <div className="absolute top-[44px] right-3 z-10 flex flex-col gap-1 pointer-events-none">
          {([
            { label: 'North', color: '#4CC9F0' },
            { label: 'East',  color: '#7B61FF' },
            { label: 'West',  color: '#FF9F1C' },
            { label: 'South', color: '#F72585' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-[#0F172A]/90 px-2 py-0.5 text-xs">
              <span className="w-2 h-2 flex-shrink-0" style={{ background: color }} />
              <span className="text-white/75">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Ward legend (only when visible) ──────────────────────────── */}
      {showWards && (
        <div className="absolute top-[44px] right-[90px] z-10 flex flex-col gap-1 pointer-events-none">
          {([
            { label: 'A', color: '#1B9E77' },
            { label: 'B', color: '#D95F02' },
            { label: 'C', color: '#7570B3' },
            { label: 'D', color: '#E7298A' },
            { label: 'E', color: '#66A61E' },
            { label: 'F', color: '#E6AB02' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-[#0F172A]/90 px-2 py-0.5 text-xs">
              <span className="w-2 h-2 flex-shrink-0" style={{ background: color }} />
              <span className="text-white/75">Ward {label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Incident type legend — bottom left, wraps on mobile ──────── */}
      <div className="absolute bottom-2 left-2 right-2 md:right-auto md:left-3 md:bottom-3 z-10 pointer-events-none">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-3 bg-[#0F172A]/90 px-2 py-1.5 md:px-3 rounded-lg">
          {([
            { label: 'Shots Fired',    color: TYPE_COLORS['Shots Fired'] },
            { label: 'Shooting Hit',   color: TYPE_COLORS['Shooting Hit'] },
            { label: 'MVA',            color: TYPE_COLORS['MVA'] },
            { label: 'Theft',          color: TYPE_COLORS['Theft'] },
            { label: 'Stolen',         color: TYPE_COLORS['Stolen Vehicle'] },
            { label: 'Traffic',        color: TYPE_COLORS['Traffic Stop'] },
            { label: 'Ped.',           color: TYPE_COLORS['Pedestrian Struck'] },
          ]).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-white/80 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reusable toggle chip ───────────────────────────────────────────────────
function LayerToggle({
  label, active, color, onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 text-xs font-medium
        border transition-all duration-150 cursor-pointer select-none
        ${active
          ? 'bg-[#0F172A] border-[#1F2937] text-white'
          : 'bg-[#0F172A]/60 border-[#1F2937]/50 text-white/40'}
      `}
    >
      {/* Swatch / indicator */}
      <span
        className="w-2.5 h-2.5 flex-shrink-0 transition-opacity duration-150"
        style={{ background: color, opacity: active ? 1 : 0.3 }}
      />
      {label}
      {/* On/off pill */}
      <span
        className={`ml-1 text-[10px] font-mono px-1 py-0.5 transition-colors duration-150 ${
          active ? 'bg-white/15 text-white/80' : 'bg-white/5 text-white/25'
        }`}
      >
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
