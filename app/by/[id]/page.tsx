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
  const [visPanel, setVisPanel] = useState(false);
  const [valgtSted, setValgtSted] = useState<any>(null);
  const [valgtSone, setValgtSone] = useState<any>(null);
  const [aktiveFiltre, setAktiveFiltre] = useState<Set<string>>(new Set());
  const [geoAktiv, setGeoAktiv] = useState(false);
  const [hoodMode, setHoodMode] = useState(false);
  const [alleByer, setAlleByer] = useState<By[]>([]);
  const [visDropdown, setVisDropdown] = useState(false);

  useEffect(() => {
    supabase.from('byer').select('*').order('sort_order').then(({ data }) => { if (data) setAlleByer(data); });
    supabase.from('byer').select('*').eq('id', id).single().then(({ data }) => { if (data) setBy(data); });
  }, [id]);

  useEffect(() => {
    if (!by || !mapContainer.current) return;
    initMap(by);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [by]);

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
      // 1. Venues (Varmepunkter)
      const { data: vData } = await supabase.from('venues').select('*').eq('by_id', by.id);
      if (!vData) return;
      map.addSource('venues', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: vData.map((v: any) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: { ...v, kategori: (v.type === 'bar' || v.type === 'pub') ? 'kveld' : 'dag' }
          }))
        }
      });
      
      map.addLayer({
        id: 'heatmap', type: 'heatmap', source: 'venues',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'vibe_score'], 0, 0, 1, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.2, 'rgba(80,35,0,0.4)', 0.4, 'rgba(150,70,0,0.6)', 
            0.6, 'rgba(210,110,0,0.75)', 0.8, 'rgba(245,158,11,0.85)', 1.0, 'rgba(255,200,60,0.95)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 50]
        }
      });

      map.addLayer({
        id: 'venues-points', type: 'circle', source: 'venues', minzoom: 13.5,
        paint: { 'circle-radius': 8, 'circle-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
      });

      // 2. Hoodmaps Lag (Fargerike tags)
      const { data: hTags } = await supabase.from('hood_tags').select('*').eq('by_id', by.id);
      if (hTags?.length) {
        map.addSource('hood-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: hTags.map(t => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
              properties: { tekst: t.tekst, kategori: t.kategori }
            }))
          }
        });
        map.addLayer({
          id: 'hood-layer', type: 'symbol', source: 'hood-source',
          layout: { 
            'visibility': 'none', 'text-field': ['get', 'tekst'], 'text-font': ['Open Sans Bold'], 
            'text-size': 12, 'text-padding': 10, 'text-allow-overlap': false 
          },
          paint: {
            'text-color': [
              'match', ['get', 'kategori'],
              'cool', '#ff9800', 'rich', '#4caf50', 'suits', '#2196f3', 'tourists', '#f44336', 'crime', '#ff0000', 'uni', '#9c27b0', '#ffffff'
            ],
            'text-halo-color': '#000000', 'text-halo-width': 2.5
          }
        });
      }

      // 3. Originale Vibe-tags (Hvite)
      const { data: soneTags } = await supabase.from('sone_tags').select('*').eq('by_id', by.id);
      if (soneTags?.length) {
        map.addSource('vibe-labels-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: soneTags.map(t => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
              properties: { tekst: t.tekst }
            }))
          }
        });
        map.addLayer({
          id: 'vibe-labels-layer', type: 'symbol', source: 'vibe-labels-source', minzoom: 13.5,
          layout: { 
            'text-field': ['get', 'tekst'], 'text-font': ['Open Sans Bold'], 'text-size': 9,
            'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-padding': 8, 'text-allow-overlap': false
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 3 }
        });
      }

      // 4. Bydeler (Gule felt + Navn)
      const { data: soner } = await supabase.from('soner').select('*').eq('by_id', by.id);
      soner?.forEach((sone: any) => {
        const sid = 'sone-' + sone.id;
        const coords = sone.koordinater.coordinates[0];
        const midLng = coords.reduce((s: any, c: any) => s + c[0], 0) / coords.length;
        const midLat = coords.reduce((s: any, c: any) => s + c[1], 0) / coords.length;

        map.addSource(sid, { type: 'geojson', data: { type: 'Feature', properties: { ...sone, isSone: true }, geometry: sone.koordinater } });
        map.addLayer({ id: sid + '-fill', type: 'fill', source: sid, paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 } });
        map.addLayer({ 
          id: sid + '-line', type: 'line', source: sid, 
          paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.6 } 
        });
        
        map.addSource(sid + '-lbl', { type: 'geojson', data: { type: 'Feature', properties: { ...sone, isSone: true }, geometry: { type: 'Point', coordinates: [midLng, midLat] } } });
        map.addLayer({
          id: sid + '-lbl-layer', type: 'symbol', source: sid + '-lbl', maxzoom: 15.5,
          layout: { 
            'text-field': ['get', 'navn'], 'text-font': ['Open Sans Bold'], 
            'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 15], 'text-transform': 'uppercase' 
          },
          paint: { 'text-color': '#f59e0b', 'text-halo-color': '#000', 'text-halo-width': 2 }
        });
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point);
        const v = features.find(f => f.layer.id === 'venues-points');
        if (v) { setValgtSted(v.properties); setVisPanel(true); return; }
        const s = features.find(f => f.properties?.isSone);
        if (s) { setValgtSone(s.properties); setVisPanel(true); return; }
      });
      map.on('mouseenter', 'venues-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'venues-points', () => { map.getCanvas().style.cursor = ''; });
    });
  }

  return (
    <div style={{ background: '#0a0a0a', height: '100vh', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <nav style={{ position: 'fixed', top: 0, width: '100%', zIndex: 100, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <button onClick={() => router.push('/byer')} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#f59e0b', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>←</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setVisDropdown(!visDropdown)} style={{ background: 'rgba(38,38,38,0.9)', border: 'none', color: '#fff', padding: '8px 24px', borderRadius: 999, fontWeight: 900, fontSize: 16 }}>
            {by?.navn || 'Laster...'} ▼
          </button>
          {visDropdown && (
            <div style={{ position: 'absolute', top: '120%', left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', borderRadius: 16, border: '1px solid #333', minWidth: 180, overflow: 'hidden' }}>
              {alleByer.map(b => (
                <button key={b.id} onClick={() => { router.push('/by/' + b.id); setVisDropdown(false); }} style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'left', fontWeight: 700 }}>{b.navn}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#aaa', fontWeight: 800 }}>{by?.land?.toUpperCase()}</div>
      </nav>

      <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 40, background: 'rgba(10,10,10,0.8)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 2, borderBottom: '2px dashed #fff' }} />
        <span style={{ fontSize: 11, fontWeight: 700 }}>HER ER DET KULT</span>
      </div>

      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {!visPanel && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: 6, background: 'rgba(10,10,10,0.9)', padding: '6px', borderRadius: 14, border: '1px solid #333' }}>
          {['kveld', 'dag', 'kultur'].map(f => (
            <button key={f} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, background: 'transparent', color: '#fff' }}>{f.toUpperCase()}</button>
          ))}
          <button 
            onClick={() => {
              const s = !hoodMode;
              setHoodMode(s);
              if (mapRef.current) {
                if (mapRef.current.getLayer('hood-layer')) mapRef.current.setLayoutProperty('hood-layer', 'visibility', s ? 'visible' : 'none');
                // Loop gjennom alle lag og skjul hvite tags + gule bydelsnavn
                mapRef.current.getStyle().layers.forEach((l: any) => {
                  if (l.id === 'vibe-labels-layer' || l.id.includes('-lbl-layer')) {
                    mapRef.current.setLayoutProperty(l.id, 'visibility', s ? 'none' : 'visible');
                  }
                });
              }
            }}
            style={{ padding: '8px 14px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 11, background: hoodMode ? '#ff4444' : 'rgba(255,255,255,0.1)', color: '#fff', marginLeft: 10 }}
          >
            HOODS
          </button>
        </div>
      )}

      {visPanel && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#0e0e0e', borderRadius: '28px 28px 0 0', padding: '24px', maxHeight: '70vh' }}>
          <button onClick={() => {setVisPanel(false); setValgtSted(null); setValgtSone(null);}} style={{ position: 'absolute', top: 20, right: 20, color: '#fff', background: 'none', border: 'none', fontSize: 24 }}>×</button>
          {valgtSone && (
            <div>
              <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{valgtSone.navn}</h2>
              <p style={{ opacity: 0.8 }}>{valgtSone.beskrivelse}</p>
            </div>
          )}
          {valgtSted && (
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>{valgtSted.navn}</h2>
              <p style={{ fontStyle: 'italic', borderLeft: '3px solid #f59e0b', paddingLeft: 16 }}>{valgtSted.beskrivelse}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
