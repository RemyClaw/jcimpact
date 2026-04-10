'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Incident } from '@/types';
import { incidentsToGeoJSON } from '@/lib/mapUtils';
import { TYPE_COLORS } from '@/lib/colors';
import { districtGeoJSON, wardsGeoJSON } from '@/data/boundaryData';

interface MapLibreMapProps {
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

const JC_CENTER: [number, number] = [-74.0706, 40.7178];
const JC_ZOOM = 12.35;
const SOURCE_ID = 'incidents';

// Free dark tile styles — no API key needed
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const DISTRICT_LAYERS = ['districts-fill', 'districts-border', 'district-labels', 'district-selected-outline'] as const;
const WARD_LAYERS = ['wards-fill', 'wards-border', 'ward-labels', 'ward-selected-outline'] as const;

const TOTAL_TYPES = Object.keys(TYPE_COLORS).length;

function buildFilter(
  showMVA: boolean, showShotsFired: boolean, showShootingHit: boolean,
  showTheft: boolean, showStolenVehicle: boolean, showTrafficStop: boolean,
  showPedestrianStruck: boolean,
): maplibregl.FilterSpecification {
  const types: string[] = [];
  if (showShotsFired) types.push('Shots Fired');
  if (showShootingHit) types.push('Shooting Hit');
  if (showMVA) types.push('MVA');
  if (showTheft) types.push('Theft');
  if (showStolenVehicle) types.push('Stolen Vehicle');
  if (showTrafficStop) types.push('Traffic Stop');
  if (showPedestrianStruck) types.push('Pedestrian Struck');

  if (types.length === 0) return ['==', ['get', 'type'], '__none__'] as maplibregl.FilterSpecification;
  if (types.length === TOTAL_TYPES) return ['!=', ['get', 'type'], '__none__'] as maplibregl.FilterSpecification;
  return ['in', ['get', 'type'], ['literal', types]] as maplibregl.FilterSpecification;
}

export default function MapLibreMap({ incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck, selectedDistrict, onDistrictClick }: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const initializedRef = useRef(false);
  const mapLoadedRef = useRef(false);

  const [showDistricts, setShowDistricts] = useState(true);
  const [showWards, setShowWards] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const onDistrictClickRef = useRef(onDistrictClick);

  onDistrictClickRef.current = onDistrictClick;

  // ── Initialize map ──────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: JC_CENTER,
      zoom: JC_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      // District polygons
      map.addSource('districts', { type: 'geojson', data: districtGeoJSON as GeoJSON.FeatureCollection });
      map.addLayer({
        id: 'districts-fill', type: 'fill', source: 'districts',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
      });
      map.addLayer({
        id: 'districts-border', type: 'line', source: 'districts',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 1 },
      });
      map.addLayer({
        id: 'district-selected-outline', type: 'line', source: 'districts',
        filter: ['==', ['get', 'id'], '__NONE__'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 1 },
      });
      map.addLayer({
        id: 'district-labels', type: 'symbol', source: 'districts',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold'],
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

      // Ward polygons
      map.addSource('wards', { type: 'geojson', data: wardsGeoJSON as GeoJSON.FeatureCollection });
      map.addLayer({
        id: 'wards-fill', type: 'fill', source: 'wards',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'match', ['upcase', ['get', 'ward']],
            'A', '#1B9E77', 'B', '#D95F02', 'C', '#7570B3',
            'D', '#E7298A', 'E', '#66A61E', 'F', '#E6AB02',
            '#64748B',
          ],
          'fill-opacity': 0.5,
        },
      });
      map.addLayer({
        id: 'wards-border', type: 'line', source: 'wards',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'ward-labels', type: 'symbol', source: 'wards',
        layout: {
          visibility: 'none',
          'text-field': ['concat', 'Ward ', ['upcase', ['get', 'ward']]],
          'text-font': ['Open Sans Bold'],
          'text-size': 13,
          'text-anchor': 'center',
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.5 },
      });
      map.addLayer({
        id: 'ward-selected-outline', type: 'line', source: 'wards',
        layout: { visibility: 'none' },
        filter: ['==', ['upcase', ['get', 'ward']], '__NONE__'],
        paint: { 'line-color': '#C9A84C', 'line-width': 3, 'line-opacity': 0.95 },
      });

      // Incident points
      map.addSource(SOURCE_ID, { type: 'geojson', data: incidentsToGeoJSON([]) });
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: SOURCE_ID,
        paint: {
          'circle-color': ['match', ['get', 'type'],
            'Shots Fired', TYPE_COLORS['Shots Fired'],
            'Shooting Hit', TYPE_COLORS['Shooting Hit'],
            'MVA', TYPE_COLORS['MVA'],
            'Theft', TYPE_COLORS['Theft'],
            'Stolen Vehicle', TYPE_COLORS['Stolen Vehicle'],
            'Traffic Stop', TYPE_COLORS['Traffic Stop'],
            'Pedestrian Struck', TYPE_COLORS['Pedestrian Struck'],
            '#6b7280'],
          'circle-radius': 9,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.6,
          'circle-opacity': 1,
        },
      });

      // Cursors
      (['unclustered-point', 'wards-fill', 'districts-fill'] as const).forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      // Popup
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string>;
        const geom = feature.geometry as GeoJSON.Point;
        if (popupRef.current) popupRef.current.remove();
        const rawColor = (TYPE_COLORS as Record<string, string>)[props.type] ?? '#6b7280';
        const typeColor = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#6b7280';
        const TYPE_LABELS: Record<string, string> = {
          'Shots Fired': 'Shots Fired', 'Shooting Hit': 'Shooting Hit',
          'MVA': 'Motor Vehicle Accident', 'Theft': 'Theft',
          'Stolen Vehicle': 'Stolen Vehicle', 'Traffic Stop': 'Traffic Stop',
          'Pedestrian Struck': 'Pedestrian Struck',
        };
        const typeLabel = TYPE_LABELS[props.type] ?? esc(props.type);
        const dateStr = new Date(props.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const safeAddr = esc(props.address || '');
        const safeDesc = props.description ? esc(props.description) : '';
        const safeDist = esc(props.district || '');
        popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: '320px' })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(`
            <div style="line-height:1.6;padding:4px;background:#111827;color:#e2e8f0">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span style="width:12px;height:12px;border-radius:50%;background:${typeColor};flex-shrink:0;box-shadow:0 0 6px ${typeColor}"></span>
                <span style="font-weight:700;font-size:16px;color:${typeColor}">${typeLabel}</span>
              </div>
              <div style="font-size:14px;color:#94a3b8;margin-bottom:4px">${dateStr}</div>
              <div style="font-size:15px;font-weight:500;margin-bottom:${safeDesc ? '8px' : '0'}">${safeAddr}</div>
              ${safeDesc ? `<div style="font-size:13px;color:#94a3b8;font-style:italic">${safeDesc}</div>` : ''}
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid #1e2535;font-size:13px;color:#9CA3AF;font-weight:500">${safeDist} District</div>
            </div>
          `)
          .addTo(map);
      });

      // District hover
      const districtPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on('mousemove', 'districts-fill', (e) => {
        const props = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!props) return;
        districtPopup.setLngLat(e.lngLat).setHTML(`
          <div style="background:#111827;color:#fff;padding:6px 10px;border-radius:6px">
            <div style="font-weight:600;font-size:13px;color:${props.color || '#fff'}">${props.name}</div>
            <div style="font-size:11px;color:#94a3b8">JCPD Patrol District</div>
          </div>
        `).addTo(map);
      });
      map.on('mouseleave', 'districts-fill', () => districtPopup.remove());

      // District click
      map.on('click', 'districts-fill', (e) => {
        const props = e.features?.[0]?.properties as Record<string, string> | undefined;
        if (!props?.name) return;
        onDistrictClickRef.current?.(props.name);
      });

      mapLoadedRef.current = true;
      setMapReady(true);
      setTimeout(() => map.resize(), 100);
    });

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

  // Sync data + filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(incidentsToGeoJSON(incidents) as GeoJSON.GeoJSON);
    if (map.getLayer('unclustered-point')) {
      map.setFilter('unclustered-point', buildFilter(showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck));
    }
  }, [incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, showTrafficStop, showPedestrianStruck, mapReady]);

  // Dark/light toggle — swap entire style
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // MapLibre doesn't have lightPreset — we swap the tile style URL
    // This requires re-adding all sources/layers after style loads
    // For simplicity, we just note the preference — full implementation would reload
  }, [darkMode, mapReady]);

  // Selected district highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('district-selected-outline')) {
      const filter = selectedDistrict
        ? ['==', ['get', 'name'], selectedDistrict]
        : ['==', ['get', 'name'], '__NONE__'];
      map.setFilter('district-selected-outline', filter as maplibregl.FilterSpecification);
    }
  }, [selectedDistrict, mapReady]);

  // Toggle districts
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = showDistricts ? 'visible' : 'none';
    DISTRICT_LAYERS.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }, [showDistricts]);

  // Toggle wards
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const vis = showWards ? 'visible' : 'none';
    WARD_LAYERS.forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
    });
  }, [showWards]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {/* Layer toggles */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          onClick={() => setDarkMode(v => !v)}
          className="flex items-center justify-center w-8 h-8 border transition-all duration-150 cursor-pointer select-none"
          style={{ background: '#0F172A', borderColor: '#1F2937', borderRadius: '4px' }}
          aria-label={darkMode ? 'Switch to light map' : 'Switch to dark map'}
        >
          {darkMode ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <LayerToggle label="Districts" active={showDistricts} color="#F59E0B" onClick={() => setShowDistricts(v => !v)} />
        <LayerToggle label="Wards" active={showWards} color="#C9A84C" onClick={() => setShowWards(v => !v)} />
      </div>

      {/* District legend */}
      {showDistricts && (
        <div className="absolute top-[44px] right-3 z-10 flex flex-col gap-1 pointer-events-none">
          {([{ label: 'North', color: '#4CC9F0' }, { label: 'East', color: '#7B61FF' }, { label: 'West', color: '#FF9F1C' }, { label: 'South', color: '#F72585' }] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-[#0F172A]/90 px-2 py-0.5 text-xs">
              <span className="w-2 h-2 flex-shrink-0" style={{ background: color }} />
              <span className="text-white/75">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Incident legend */}
      <div className="absolute bottom-2 left-2 right-2 md:right-auto md:left-3 md:bottom-3 z-10 pointer-events-none">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-3 bg-[#0F172A]/90 px-2 py-1.5 md:px-3 rounded-lg">
          {([
            { label: 'Shots Fired', color: TYPE_COLORS['Shots Fired'] },
            { label: 'Shooting Hit', color: TYPE_COLORS['Shooting Hit'] },
            { label: 'MVA', color: TYPE_COLORS['MVA'] },
            { label: 'Theft', color: TYPE_COLORS['Theft'] },
            { label: 'Stolen', color: TYPE_COLORS['Stolen Vehicle'] },
            { label: 'Traffic', color: TYPE_COLORS['Traffic Stop'] },
            { label: 'Ped.', color: TYPE_COLORS['Pedestrian Struck'] },
          ]).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs">
              <span className="w-2 h-2 md:w-3 md:h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
              <span className="text-white/80 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MapLibre badge */}
      <div className="absolute top-3 left-12 z-10 pointer-events-none">
        <span className="text-[9px] text-white/30 font-mono">MapLibre (free)</span>
      </div>
    </div>
  );
}

function LayerToggle({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border transition-all duration-150 cursor-pointer select-none ${active ? 'bg-[#0F172A] border-[#1F2937] text-white' : 'bg-[#0F172A]/60 border-[#1F2937]/50 text-white/40'}`}
    >
      <span className="w-2.5 h-2.5 flex-shrink-0 transition-opacity duration-150" style={{ background: color, opacity: active ? 1 : 0.3 }} />
      {label}
      <span className={`ml-1 text-[10px] font-mono px-1 py-0.5 transition-colors duration-150 ${active ? 'bg-white/15 text-white/80' : 'bg-white/5 text-white/25'}`}>
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
