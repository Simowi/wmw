'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MAP_STYLE } from '@/lib/maptiler';

interface By { id: string; navn: string; land: string; lat: number; lng: number; zoom: number; }

export default function ByPage() {
  const { id } = useParams();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const [by, setBy] = useState<By | null>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [visPanel, setVisPanel] = useState(false);
  const [valgtSted, setValgtSted] = useState<any>(null);
  const [valgtSone, setValgtSone] = useState<any>(null);
  const [aktiveFiltre, setAktiveFiltre] = useState<Set<string>>(new Set());
  const [geoAktiv, setGeoAktiv] = useState(false);
  const [alleByer, setAlleByer] = useState<By[]>([]);
  const [visDropdown, setVisDropdown] = useState(false);

  useEffect(() => {
    supabase.from('byer').select('*').order('sort_order').then(({ data }) => { if (data) setAlleByer(data); });
    supabase.from('byer').select('*').eq('id', id).single().then(({ data }) => { if (data) setBy(data); });
    supabase.from('venues').select('*').eq('by_id', id).order('vibe_score', { ascending: false }).then(({ data }) => { if (data) setVenues(data); });
  }, [id]);

  useEffect(() => {
    if (!by || !mapContainer.current) return;
    initMap(by);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [by]);

  function getKategori(type: string): string {
    const kveld = ['bar', 'nightclub', 'pub', 'music_venue'];
    const dag = ['cafe', 'restaurant', 'shop', 'vintage', 'bakery', 'clothes', 'books'];
    const kultur = ['arts_centre', 'theatre', 'gallery', 'museum', 'cinema'];
    if (kveld.includes(type)) return 'kveld';
    if (kultur.includes(type)) return 'kultur';
    return 'dag';
  }

  function finnMinPosisjon() {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { longitude: lng, latitude: lat } = pos.coords;
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
      if (userMarkerRef.current) userMarkerRef.current.remove();
      
      const el = document.createElement('div');
      el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 6px rgba(59,130,246,0.2),0 2px 8px rgba(0,0,0,0.4);';
      const maplibregl = (window as any)._maplibregl;
      if (maplibregl) {
        userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(mapRef.current);
        setGeoAktiv(true);
      }
    }, (err) => console.error("GPS-feil:", err));
  }

  async function initMap(by: By) {
    const maplibregl = (await import('maplibre-gl')).default;
    await import('maplibre-gl/dist/maplibre-gl.css');
    (window as any)._maplibregl = maplibregl;

    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: MAP_STYLE,
      center: [by.lng, by.lat],
      zoom: by.zoom || 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', async () => {
      const { data: vData } = await supabase.from('venues').select('*').eq('by_id', by.id);
      if (!vData) return;

      const geojson: any = {
        type: 'FeatureCollection',
        features: vData.map((v: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
          properties: { ...v, kategori: getKategori(v.type) }
        }))
      };

      map.addSource('venues', { type: 'geojson', data: geojson });
      
      map.addLayer({
        id: 'heatmap', type: 'heatmap', source: 'venues', maxzoom: 17,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'vibe_score'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.2, 'rgba(80,35,0,0.4)', 0.4, 'rgba(150,70,0,0.6)', 
            0.6, 'rgba(210,110,0,0.75)', 0.8, 'rgba(245,158,11,0.85)', 1.0, 'rgba(255,200,60,0.95)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 60],
          'heatmap-opacity': 0.8
        }
      });

      map.addLayer({
        id: 'venues-points', type: 'circle', source: 'venues', minzoom: 13.5,
        paint: { 'circle-radius': 8, 'circle-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
      });

      const { data: soner } = await supabase.from('soner').select('*').eq('by_id', by.id);
      soner?.forEach((sone: any) => {
        const sid = 'sone-' + sone.id;
        const coords = sone.koordinater.coordinates[0];
        const midLng = coords.reduce((s: any, c: any) => s + c[0], 0) / coords.length;
        const midLat = coords.reduce((s: any, c: any) => s + c[1], 0) / coords.length;

        map.addSource(sid, { type: 'geojson', data: { type: 'Feature', properties: { ...sone, isSone: true }, geometry: sone.koordinater } });
        map.addLayer({ id: sid + '-fill', type: 'fill', source: sid, paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 } });
        map.addLayer({ id: sid + '-line', type: 'line', source: sid, paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [4, 3], 'line-opacity': 0.5 } });

        map.addSource(sid + '-lbl', { type: 'geojson', data: { type: 'Feature', properties: { ...sone, isSone: true }, geometry: { type: 'Point', coordinates: [midLng, midLat] } } });
        map.addLayer({
          id: sid + '-lbl-layer', type: 'symbol', source: sid + '-lbl',
          layout: { 
            'text-field': ['get', 'navn'], 'text-font': ['Open Sans Bold'], 'text-size': 13, 
            'text-transform': 'uppercase', 'text-letter-spacing': 0.1 
          },
          paint: { 'text-color': '#f59e0b', 'text-halo-color': '#000', 'text-halo-width': 2 }
        });
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point);
        const venue = features.find(f => f.layer.id === 'venues-points');
        if (venue) { setValgtSted(venue.properties); setValgtSone(null); setVisPanel(true); return; }
        const sone = features.find(f => f.properties?.isSone);
        if (sone) { setValgtSone(sone.properties); setValgtSted(null); setVisPanel(true); return; }
        if (features.find(f => f.layer.id === 'heatmap')) { setValgtSted(null); setValgtSone(null); setVisPanel(true); }
      });

      map.on('mouseenter', 'venues-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'venues-points', () => { map.getCanvas().style.cursor = ''; });
    });
  }

  const toggleFilter = (fId: string) => {
    setAktiveFiltre(prev => {
      const ny = new Set(prev);
      if (ny.has(fId)) ny.delete(fId); else ny.add(fId);
      if (mapRef.current) {
        const filter = ny.size === 0 ? null : ['in', ['get', 'kategori'], ['literal', Array.from(ny)]];
        mapRef.current.setFilter('heatmap', filter);
        mapRef.current.setFilter('venues-points', filter);
      }
      return ny;
    });
  };

  return (
    <div style={{ background: '#0a0a0a', height: '100vh', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <nav style={{ position: 'fixed', top: 0, width: '100%', zIndex: 50, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <button onClick={() => router.push('/byer')} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#f59e0b', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>←</button>
        <button onClick={() => setVisDropdown(!visDropdown)} style={{ background: 'rgba(38,38,38,0.9)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 9999, fontWeight: 900, fontSize: 16 }}>{by?.navn} ▼</button>
        <div style={{ fontSize: 10, color: '#adaaaa', fontWeight: 600 }}>{by?.land?.toUpperCase()}</div>
        {visDropdown && (
          <div style={{ position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', background: '#121212', borderRadius: 16, overflow: 'hidden', minWidth: 160, zIndex: 100, border: '1px solid #333' }}>
            {alleByer.map(b => (
              <button key={b.id} onClick={() => { router.push('/by/' + b.id); setVisDropdown(false); }} style={{ display: 'block', width: '100%', padding: '12px 20px', background: 'none', border: 'none', color: '#fff', textAlign: 'left', fontWeight: 700 }}>{b.navn}</button>
            ))}
          </div>
        )}
      </nav>

      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {/* GPS-knapp */}
      {!visPanel && (
        <button onClick={finnMinPosisjon} style={{ position: 'fixed', bottom: 100, right: 16, zIndex: 29, width: 44, height: 44, borderRadius: '50%', background: 'rgba(12,12,12,0.95)', border: geoAktiv ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={geoAktiv ? '#3b82f6' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      )}

      {/* Filter-meny */}
      {!visPanel && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: 6, background: 'rgba(10,10,10,0.9)', padding: '6px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
          {[{ id: 'kveld', label: '🌙 Kveld' }, { id: 'dag', label: '☕ Dag' }, { id: 'kultur', label: '🎨 Kultur' }].map(f => (
            <button key={f.id} onClick={() => toggleFilter(f.id)} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, background: aktiveFiltre.has(f.id) ? '#f59e0b' : 'transparent', color: aktiveFiltre.has(f.id) ? '#000' : '#fff' }}>{f.label}</button>
          ))}
        </div>
      )}

      {/* Stedpanel */}
      {visPanel && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#0e0e0e', borderRadius: '28px 28px 0 0', padding: '24px 24px 40px', maxHeight: '70vh', overflowY: 'auto' }}>
          <button onClick={() => { setVisPanel(false); setValgtSted(null); setValgtSone(null); }} style={{ position: 'absolute', top: 20, right: 20, background: '#222', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', fontSize: 20, cursor: 'pointer' }}>×</button>
          
          {valgtSone ? (
            <div>
              <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 800 }}>NABOLAG</span>
              <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{valgtSone.navn}</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.85 }}>{valgtSone.beskrivelse}</p>
            </div>
          ) : valgtSted ? (
            <div>
              <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 800 }}>{valgtSted.type?.toUpperCase()}</span>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>{valgtSted.navn}</h2>
              <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>📍 {valgtSted.adresse || 'Nabolaget ' + by?.navn}</p>
              {valgtSted.beskrivelse && <p style={{ fontStyle: 'italic', borderLeft: '3px solid #f59e0b', paddingLeft: 16, marginBottom: 20, lineHeight: 1.5 }}>"{valgtSted.beskrivelse}"</p>}
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(valgtSted.navn + ' ' + (by?.navn || ''))}`} target="_blank" style={{ display: 'inline-block', background: '#f59e0b', color: '#000', padding: '12px 20px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: 14, marginBottom: 24 }}>🔍 LES MER PÅ GOOGLE MAPS</a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ height: 6, background: '#222', flex: 1, borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', background: '#f59e0b', width: (valgtSted.vibe_score * 100) + '%' }} /></div>
                <span style={{ fontSize: 12, fontWeight: 800 }}>VIBE {Math.round(valgtSted.vibe_score * 10)}/10</span>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Oppdag {by?.navn}</h2>
              {venues.slice(0, 15).map(v => (
                <div key={v.id} onClick={() => setValgtSted(v)} style={{ padding: '14px 0', borderBottom: '1px solid #222', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{v.navn}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{v.type} · {v.adresse || by?.navn}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
