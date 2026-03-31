'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MAP_STYLE } from '@/lib/maptiler';

interface By { id: string; navn: string; land: string; lat: number; lng: number; zoom: number; }
interface Sted { id: string; navn: string; type: string; beskrivelse: string; vibe_score: number; adresse: string; }

export default function ByPage() {
  const { id } = useParams();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [by, setBy] = useState<By | null>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [visPanel, setVisPanel] = useState(false);
  const [valgtSted, setValgtSted] = useState<any>(null);
  const [valgtSone, setValgtSone] = useState<any>(null);
  const [aktiveFiltre, setAktiveFiltre] = useState<Set<string>>(new Set());
  const [geoAktiv, setGeoAktiv] = useState(false);
  const userMarkerRef = useRef<any>(null);
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
    const kveld = ['bar', 'nightclub', 'pub', 'music_venue', 'theatre'];
    const dag = ['cafe', 'restaurant', 'shop', 'vintage', 'music', 'books'];
    const kultur = ['arts_centre', 'theatre', 'books', 'art', 'cinema'];
    if (kveld.includes(type)) return 'kveld';
    if (kultur.includes(type)) return 'kultur';
    return 'dag';
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
      const { data: venuesData } = await supabase.from('venues').select('*').eq('by_id', by.id);
      if (!venuesData) return;

      const geojson: any = {
        type: 'FeatureCollection',
        features: venuesData.map((v: any) => ({
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
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 13, 2.0, 15, 4.0],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(80,35,0,0.5)', 0.75, 'rgba(245,158,11,0.88)', 1, 'rgba(255,200,60,0.98)'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 12, 35, 14, 55, 16, 80],
          'heatmap-opacity': 0.8
        }
      });

      map.addLayer({
        id: 'venues-points', type: 'circle', source: 'venues', minzoom: 14,
        paint: { 'circle-radius': 10, 'circle-color': '#f59e0b', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
      });

      const { data: soner } = await supabase.from('soner').select('*').eq('by_id', by.id);
      soner?.forEach((sone: any) => {
        const sid = 'sone-' + sone.id;
        const coords = sone.koordinater.coordinates[0];
        const midLng = coords.reduce((s: any, c: any) => s + c[0], 0) / coords.length;
        const midLat = coords.reduce((s: any, c: any) => s + c[1], 0) / coords.length;

        map.addSource(sid, { type: 'geojson', data: { type: 'Feature', properties: { ...sone, isSone: true }, geometry: sone.koordinater } });
        map.addLayer({ id: sid + '-fill', type: 'fill', source: sid, paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 } });
        map.addLayer({ id: sid + '-line', type: 'line', source: sid, paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [4, 3] } });
        
        map.addSource(sid + '-lbl', { type: 'geojson', data: { type: 'Feature', properties: { navn: sone.navn }, geometry: { type: 'Point', coordinates: [midLng, midLat] } } });
        map.addLayer({
          id: sid + '-lbl-layer', type: 'symbol', source: sid + '-lbl',
          layout: { 'text-field': ['get', 'navn'], 'text-font': ['Open Sans Bold'], 'text-size': 13, 'text-transform': 'uppercase' },
          paint: { 'text-color': '#f59e0b', 'text-halo-color': '#000', 'text-halo-width': 2 }
        });
      });

      const { data: vTags } = await supabase.from('sone_tags').select('*').eq('by_id', by.id);
      vTags?.forEach((tag: any) => {
        const tid = 'vtag-' + tag.id;
        map.addSource(tid, { type: 'geojson', data: { type: 'Feature', properties: { tekst: tag.tekst }, geometry: { type: 'Point', coordinates: [tag.lng, tag.lat] } } });
        map.addLayer({ id: tid + '-chip', type: 'symbol', source: tid, minzoom: 13, layout: { 'text-field': ['get', 'tekst'], 'text-size': 10 }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 4 } });
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point);
        const venue = features.find(f => f.layer.id === 'venues-points');
        if (venue) { setValgtSted(venue.properties); setValgtSone(null); setVisPanel(true); return; }
        
        const sone = features.find(f => f.layer.id.endsWith('-fill'));
        if (sone) { setValgtSone(sone.properties); setValgtSted(null); setVisPanel(true); return; }

        if (features.find(f => f.layer.id === 'heatmap')) { setValgtSted(null); setValgtSone(null); setVisPanel(true); }
      });

      map.on('mouseenter', 'venues-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'venues-points', () => { map.getCanvas().style.cursor = ''; });
    });
  }

  return (
    <div style={{ background: '#0a0a0a', height: '100vh', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <nav style={{ position: 'fixed', top: 0, width: '100%', zIndex: 50, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <button onClick={() => router.push('/byer')} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#f59e0b', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>←</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setVisDropdown(!visDropdown)} style={{ background: 'rgba(38,38,38,0.9)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 9999, fontWeight: 900 }}>{by?.navn} ▼</button>
          {visDropdown && (
            <div style={{ position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', background: '#121212', borderRadius: 16, overflow: 'hidden', minWidth: 160 }}>
              {alleByer.map(b => (
                <button key={b.id} onClick={() => { router.push('/by/' + b.id); setVisDropdown(false); }} style={{ display: 'block', width: '100%', padding: '12px', background: 'none', border: 'none', color: '#fff', textAlign: 'left' }}>{b.navn}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: 'rgba(38,38,38,0.8)', padding: '6px 14px', borderRadius: 9999, fontSize: 11 }}>{by?.land}</div>
      </nav>

      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {visPanel && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: '#0e0e0e', borderRadius: '28px 28px 0 0', maxHeight: '60vh', overflowY: 'auto', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ width: 40, height: 4, background: '#333', borderRadius: 2 }} />
            <button onClick={() => { setVisPanel(false); setValgtSted(null); setValgtSone(null); }} style={{ color: '#aaa', background: 'none', border: 'none', fontSize: 24 }}>×</button>
          </div>

          {valgtSone ? (
            <div>
              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>NABOLAG</span>
              <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{valgtSone.navn}</h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.8 }}>{valgtSone.beskrivelse || "Et av byens mest spennende områder."}</p>
            </div>
          ) : valgtSted ? (
            <div>
              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>{valgtSted.type?.toUpperCase()}</span>
              <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>{valgtSted.navn}</h2>
              <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>📍 {valgtSted.adresse}</p>
              {valgtSted.beskrivelse && <p style={{ fontStyle: 'italic', borderLeft: '2px solid #f59e0b', paddingLeft: 12, marginBottom: 16 }}>"{valgtSted.beskrivelse}"</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ height: 4, background: '#f59e0b', width: (valgtSted.vibe_score * 100) + 'px' }} />
                <span style={{ fontSize: 11 }}>Vibe {Math.round(valgtSted.vibe_score * 10)}/10</span>
              </div>
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Kule steder i {by?.navn}</h2>
              {venues.map((v: any) => (
                <div key={v.id} onClick={() => setValgtSted(v)} style={{ padding: '12px 0', borderBottom: '1px solid #222', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700 }}>{v.navn}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{v.type} · {v.adresse}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
