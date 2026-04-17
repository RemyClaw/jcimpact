'use client';

import { useEffect, useRef, useState } from 'react';

export interface SearchTarget {
  lng: number;
  lat: number;
  label: string;
}

interface MapSearchBoxProps {
  onSelect: (target: SearchTarget) => void;
  onClear?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface GeocodeFeature {
  id: string;
  lng: number;
  lat: number;
  primary: string;   // e.g. "123 Newark Ave"
  secondary: string; // e.g. "Jersey City, NJ 07306"
}

/** Jersey City area bounding box — [west, south, east, north] */
const JC_BBOX: [number, number, number, number] = [-74.15, 40.66, -74.00, 40.78];
/** City center for proximity biasing */
const JC_PROXIMITY: [number, number] = [-74.0706, 40.7178];

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type V6Feature = {
  id?: string;
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    place_formatted?: string;
    full_address?: string;
    mapbox_id?: string;
  };
};

export default function MapSearchBox({ onSelect, onClear, className, style }: MapSearchBoxProps) {
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState<GeocodeFeature[]>([]);
  const [open, setOpen]               = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading]         = useState(false);

  const abortRef     = useRef<AbortController | null>(null);
  const debounceRef  = useRef<number | null>(null);
  const wrapRef      = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Run a geocode request immediately (bypasses debounce)
  const runSearch = async (q: string) => {
    if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (abortRef.current) abortRef.current.abort();
    if (q.length < 2 || !TOKEN) return;

    setLoading(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
      url.searchParams.set('q', q);
      url.searchParams.set('bbox', JC_BBOX.join(','));
      url.searchParams.set('proximity', JC_PROXIMITY.join(','));
      url.searchParams.set('limit', '5');
      // Mapbox Geocoding API v6 valid types only (no `poi` — that's Search Box API)
      url.searchParams.set('types', 'address,place,neighborhood,street,locality,postcode');
      url.searchParams.set('access_token', TOKEN);

      const res = await fetch(url.toString(), { signal: ctl.signal });
      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Mapbox geocode failed', res.status, await res.text().catch(() => ''));
        }
        throw new Error(`geocode ${res.status}`);
      }
      const data = (await res.json()) as { features?: V6Feature[] };

      const features: GeocodeFeature[] = (data.features ?? []).map((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        const primary   = f.properties.name ?? f.properties.place_formatted ?? '(unknown)';
        const secondary = f.properties.full_address?.replace(new RegExp(`^${primary},?\\s*`), '')
                        ?? f.properties.place_formatted
                        ?? '';
        return {
          id: f.id ?? f.properties.mapbox_id ?? `r${i}`,
          lng, lat,
          primary,
          secondary,
        };
      });
      setResults(features);
      setHighlighted(0);
      setOpen(features.length > 0);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Debounced geocode fetch on query change
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const q = query.trim();
    if (q.length < 2 || !TOKEN) {
      setResults([]);
      setLoading(false);
      if (q.length < 2) setOpen(false);
      return;
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => { void runSearch(q); }, 250);

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
    // runSearch captures state setters only; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const select = (f: GeocodeFeature) => {
    onSelect({ lng: f.lng, lat: f.lat, label: f.primary });
    setQuery(f.primary);
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onClear?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query || open) { e.stopPropagation(); clear(); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0) {
        select(results[open ? highlighted : 0]);
      } else if (query.trim().length >= 2) {
        // Debounce hasn't fired yet or no results — kick an immediate fetch
        runSearch(query.trim());
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div ref={wrapRef} className={className} style={style}>
      <div style={{ position: 'relative' }}>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#c8a96b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Search address…"
          role="combobox"
          aria-label="Search address on map"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="map-search-results"
          spellCheck={false}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '7px 30px 7px 30px',
            fontSize: '13px',
            borderRadius: '8px',
            outline: 'none',
            background: 'rgba(10,22,40,0.85)',
            border: '1.5px solid rgba(200,169,107,0.4)',
            color: '#fff',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: 3,
              borderRadius: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {open && (results.length > 0 || loading) && (
        <div
          id="map-search-results"
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            marginTop: 4,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'rgba(10,22,40,0.97)',
            border: '1.5px solid rgba(200,169,107,0.35)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 20,
          }}
        >
          {loading && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>Searching…</div>
          )}
          {results.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onClick={() => select(f)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 13,
                background: i === highlighted ? 'rgba(200,169,107,0.15)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderBottom: i < results.length - 1 ? '1px solid rgba(200,169,107,0.1)' : 'none',
                cursor: 'pointer',
                display: 'block',
              }}
            >
              <div style={{ fontWeight: 500 }}>{f.primary}</div>
              {f.secondary && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{f.secondary}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
