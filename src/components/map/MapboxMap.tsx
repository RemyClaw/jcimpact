'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Incident } from '@/types';
import { incidentsToGeoJSON, buildTypeFilter } from '@/lib/mapUtils';
import { districtGeoJSON, wardsGeoJSON } from '@/data/boundaryData';

interface MapboxMapProps {
  incidents: Incident[];
  showMVA: boolean;
  showShooting: boolean;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const JC_CENTER: [number, number] = [-74.0706, 40.7178];
const JC_ZOOM = 12.35;
const MAP_STYLE = 'mapbox://styles/mapbox/standard';
const SOURCE_ID = 'incidents';

const DISTRICT_LAYERS = ['districts-fill', 'districts-border', 'district-labels', 'district-selected-outline'] as const;
const WARD_LAYERS    = ['wards-fill', 'wards-border', 'ward-labels', 'ward-selected-outline'] as const;

export default function MapboxMap({ incidents, showMVA, showShooting }: MapboxMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const popupRef      = useRef<mapboxgl.Popup | null>(null);
  const initializedRef = useRef(false);
  const mapLoadedRef  = useRef(false);

  const [showDistricts, setShowDistricts] = useState(true);
  const [showWards,     setShowWards]     = useState(true);

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
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'fill-opacity': 0.25,
          'fill-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'districts-border', type: 'line', source: 'districts',
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-width': 3,
          'line-opacity': 1,
          'line-dasharray': [5, 3],
          'line-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'district-selected-outline', type: 'line', source: 'districts',
        filter: ['==', ['get', 'id'], '__NONE__'],
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
          'line-width': 5,
          'line-opacity': 1,
          'line-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'district-labels', type: 'symbol', source: 'districts',
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
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-opacity': 0.9,
          'line-emissive-strength': 1,
        },
      });
      map.addLayer({
        id: 'ward-labels', type: 'symbol', source: 'wards',
        layout: {
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
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
      map.addLayer({
        id: 'clusters', type: 'circle', source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#3b82f6', 5, '#f59e0b', 10, '#ef4444'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 22, 10, 28],
          'circle-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'unclustered-point', type: 'circle', source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'type'], 'Shooting', '#ef4444', 'MVA', '#f59e0b', '#6b7280'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f1117',
          'circle-opacity': 0.9,
        },
      });

      // ── Cursors ──────────────────────────────────────────────────────
      (['clusters', 'unclustered-point', 'wards-fill', 'districts-fill'] as const).forEach(id => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      });

      // ── Cluster click → zoom ─────────────────────────────────────────
      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id as number;
        const geom = features[0].geometry as GeoJSON.Point;
        (map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
          clusterId, (err, zoom) => {
            if (err || zoom == null) return;
            map.easeTo({ center: geom.coordinates as [number, number], zoom });
          }
        );
      });

      // ── Incident point popup ─────────────────────────────────────────
      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string>;
        const geom  = feature.geometry as GeoJSON.Point;
        if (popupRef.current) popupRef.current.remove();
        const typeColor = props.type === 'Shooting' ? '#ef4444' : '#f59e0b';
        const dateStr   = new Date(props.date + 'T00:00:00').toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });
        popupRef.current = new mapboxgl.Popup({ offset: 12, closeButton: true })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(`
            <div style="line-height:1.5">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="width:8px;height:8px;border-radius:50%;background:${typeColor};flex-shrink:0"></span>
                <span style="font-weight:600;font-size:13px;color:${typeColor}">${props.type === 'MVA' ? 'Motor Vehicle Accident' : 'Shooting'}</span>
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
    });

    return () => {
      mapLoadedRef.current = false;
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  // ── Sync incident data + type filter ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(incidentsToGeoJSON(incidents));
    if (map.getLayer('unclustered-point')) {
      map.setFilter('unclustered-point', buildTypeFilter(showMVA, showShooting) as mapboxgl.FilterSpecification);
    }
  }, [incidents, showMVA, showShooting]);

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
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-surface-border">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Layer toggles — top-left ──────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <LayerToggle
          label="Districts"
          active={showDistricts}
          color="#4CC9F0"
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
        <div className="absolute top-[88px] left-3 z-10 flex flex-col gap-1 pointer-events-none">
          {([
            { label: 'North', color: '#4CC9F0' },
            { label: 'East',  color: '#7B61FF' },
            { label: 'West',  color: '#FF9F1C' },
            { label: 'South', color: '#F72585' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded text-xs">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
              <span className="text-white/75">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Ward legend (only when visible) ──────────────────────────── */}
      {showWards && (
        <div className="absolute top-[88px] left-[90px] z-10 flex flex-col gap-1 pointer-events-none">
          {([
            { label: 'A', color: '#1B9E77' },
            { label: 'B', color: '#D95F02' },
            { label: 'C', color: '#7570B3' },
            { label: 'D', color: '#E7298A' },
            { label: 'E', color: '#66A61E' },
            { label: 'F', color: '#E6AB02' },
          ] as const).map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-white/75">Ward {label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Bottom disclaimer ─────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <div className="bg-surface-card/90 backdrop-blur-sm border border-surface-border text-xs text-slate-400 px-3 py-1.5 rounded-full whitespace-nowrap">
          Only{' '}
          <span className="text-accent-amber font-medium">MVAs</span> and{' '}
          <span className="text-accent-red font-medium">shootings</span> are mapped — other crimes in aggregate stats only
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
        flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
        border backdrop-blur-sm transition-all duration-150 cursor-pointer select-none
        ${active
          ? 'bg-black/65 border-white/20 text-white'
          : 'bg-black/40 border-white/10 text-white/40'}
      `}
    >
      {/* Swatch / indicator */}
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity duration-150"
        style={{ background: color, opacity: active ? 1 : 0.3 }}
      />
      {label}
      {/* On/off pill */}
      <span
        className={`ml-1 text-[10px] font-mono px-1 py-0.5 rounded transition-colors duration-150 ${
          active ? 'bg-white/15 text-white/80' : 'bg-white/5 text-white/25'
        }`}
      >
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
