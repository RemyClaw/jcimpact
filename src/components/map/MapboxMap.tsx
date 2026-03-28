'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Incident } from '@/types';
import { incidentsToGeoJSON, buildTypeFilter } from '@/lib/mapUtils';
import { districtGeoJSON, wardsGeoJSON } from '@/data/boundaryData';

interface MapboxMapProps {
  incidents: Incident[];
  showMVA: boolean;
  showShotsFired: boolean;
  showShootingHit: boolean;
  showTheft: boolean;
  showStolenVehicle: boolean;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const JC_CENTER: [number, number] = [-74.0706, 40.7178];
const JC_ZOOM = 12.35;
const MAP_STYLE = 'mapbox://styles/mapbox/standard';
const SOURCE_ID = 'incidents';

const DISTRICT_LAYERS = ['districts-fill', 'districts-border', 'district-labels', 'district-selected-outline'] as const;
const WARD_LAYERS    = ['wards-fill', 'wards-border', 'ward-labels', 'ward-selected-outline'] as const;

export default function MapboxMap({ incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle }: MapboxMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const popupRef      = useRef<mapboxgl.Popup | null>(null);
  const initializedRef = useRef(false);
  const mapLoadedRef  = useRef(false);

  const [showDistricts, setShowDistricts] = useState(true);
  const [showWards,     setShowWards]     = useState(false);
  const [mapReady,      setMapReady]      = useState(false);

  // ── Initialize map once ────────────────────────────────────────────────
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: JC_CENTER,
      zoom: JC_ZOOM,
      attributionControl: false,
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
            'Shots Fired',    '#F87171',
            'Shooting Hit',   '#DC2626',
            'MVA',            '#f59e0b',
            'Theft',          '#3b82f6',
            'Stolen Vehicle', '#22c55e',
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
        const TYPE_COLORS: Record<string, string> = {
          'Shots Fired':    '#F87171',
          'Shooting Hit':   '#DC2626',
          'MVA':            '#f59e0b',
          'Theft':          '#3b82f6',
          'Stolen Vehicle': '#22c55e',
        };
        const TYPE_LABELS: Record<string, string> = {
          'Shots Fired':    'Shots Fired',
          'Shooting Hit':   'Shooting Hit',
          'MVA':            'Motor Vehicle Accident',
          'Theft':          'Theft',
          'Stolen Vehicle': 'Stolen Vehicle',
        };
        const typeColor = TYPE_COLORS[props.type] ?? '#6b7280';
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
      map.setFilter('unclustered-point', buildTypeFilter(showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle) as mapboxgl.FilterSpecification);
    }
  }, [incidents, showMVA, showShotsFired, showShootingHit, showTheft, showStolenVehicle, mapReady]);

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


  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Layer toggles — top-right (matching stitch) ─────────────── */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
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

      {/* ── Incident type legend — bottom left ───────────────────────── */}
      <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
        <div className="flex items-center gap-3 bg-[#0F172A]/90 px-3 py-1.5 rounded-lg">
          {([
            { label: 'Shots Fired',    color: '#F87171' },
            { label: 'Shooting Hit',   color: '#DC2626' },
            { label: 'MVA',            color: '#f59e0b' },
            { label: 'Theft',          color: '#3b82f6' },
            { label: 'Stolen Vehicle', color: '#22c55e' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
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
