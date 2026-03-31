'use client';
/// <reference types="geojson" />
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { MAP_STYLE } from '@/lib/maptiler';

interface By { id: string; navn: string; land: string; lat: number; lng: number; zoom: number; }
interface Sone { id: string; navn: string; type: string; hipness_score: number; koordinater: any; }
interface Sted { id: string; navn: string; type: string; beskrivelse: string; }

const ZONE_COLORS: Record<string, { fill: string; heat: string }> = {
  kjerne:   { fill: '#ff6b35', heat: '#ff4500' },
  emerging: { fill: '#f59e0b', heat: '#7e51ff' },
  randsone: { fill: '#4ecdc4', heat: '#2ecc71' },
};

export default function ByPage() {
  const { id } = useParams();
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [by, setBy] = useState<By | null>(null);
  const [steder, setSteder] = useState<Sted[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [visPanel, setVisPanel] = useState(false);
  const [valgtSted, setValgtSted] = useState<any>(null);
  const [aktiveFiltre, setAktiveFiltre] = useState<Set<string>>(new Set());
  const [alleByer, setAlleByer] = useState<By[]>([]);
  const [visDropdown, setVisDropdown] = useState(false);

  useEffect(() => {
    supabase.from('byer').select('*').order('sort_order').then(({ data }) => { if (data) setAlleByer(data); });
    supabase.from('byer').select('*').eq('id', id).single().then(({ data }) => { if (data) setBy(data); });
    supabase.from('steder').select('*').eq('by_id', id).then(({ data }) => { if (data) setSteder(data); });
    supabase.from('venues').select('*').eq('by_id', id).order('vibe_score', { ascending: false }).then(({ data }) => { if (data) setVenues(data); });
  }, [id]);

  useEffect(() => {
    if (!by || !mapContainer.current) return;
    initMap(by);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [by]);

  function getKategori(type: string): string {
    const kveld = ['bar', 'nightclub', 'music_venue', 'theatre'];
    const dag = ['cafe', 'restaurant', 'shop', 'vintage', 'music', 'books'];
    const kultur = ['arts_centre', 'theatre', 'books', 'art', 'cinema'];
    if (kveld.includes(type)) return 'kveld';
    if (kultur.includes(type)) return 'kultur';
    if (dag.includes(type)) return 'dag';
    return 'dag';
  }

  async function initMap(by: By) {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const maplibregl = (await import('maplibre-gl')).default;
    await import('maplibre-gl/dist/maplibre-gl.css');

    const map = new maplibregl.Map({
      container: mapContainer.current!,
      style: MAP_STYLE,
      center: [by.lng, by.lat],
      zoom: by.zoom || 13,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', async () => {
      // Hent venues fra Supabase
      const { data: venues } = await supabase
        .from('venues')
        .select('*')
        .eq('by_id', by.id);

      if (!venues?.length) return;

      // Beregn bounds fra venues
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      venues.forEach((v: any) => {
        if (v.lng < minLng) minLng = v.lng; if (v.lng > maxLng) maxLng = v.lng;
        if (v.lat < minLat) minLat = v.lat; if (v.lat > maxLat) maxLat = v.lat;
      });
      map.fitBounds(
        [[minLng - 0.005, minLat - 0.005], [maxLng + 0.005, maxLat + 0.005]],
        { padding: { top: 80, bottom: 280, left: 40, right: 40 }, duration: 1000, maxZoom: 15 }
      );

      // Bygg GeoJSON fra venues
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: venues.map((v: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
          properties: { vibe_score: v.vibe_score, type: v.type, navn: v.navn, kategori: getKategori(v.type) }
        }))
      };

      map.addSource('venues', { type: 'geojson', data: geojson });

      // Heatmap-lag – amber/gull gradient
      map.addLayer({
        id: 'heatmap',
        type: 'heatmap',
        source: 'venues',
        maxzoom: 17,
        paint: {
          // Vekt basert på vibe_score
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'vibe_score'], 0, 0, 1, 1],
          // Intensitet øker ved zoom
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 13, 2.0, 15, 4.0],
          // Elegant amber/gull gradient
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(0,0,0,0)',
            0.1,  'rgba(30,15,0,0.3)',
            0.25, 'rgba(80,35,0,0.5)',
            0.4,  'rgba(150,70,0,0.65)',
            0.6,  'rgba(210,110,0,0.78)',
            0.75, 'rgba(245,158,11,0.88)',
            0.9,  'rgba(255,180,30,0.95)',
            1.0,  'rgba(255,200,60,0.98)'
          ],
          // Radius tilpasses zoom
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 12, 35, 14, 55, 16, 80],
          // Fade ut heatmap ved høy zoom
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 16, 0.4],
        }
      });

      // Punkt-lag som vises ved høy zoom (gatenivå)
      map.addLayer({
        id: 'venues-points',
        type: 'circle',
        source: 'venues',
        minzoom: 14,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 14, 10, 17, 14],
          'circle-color': '#f59e0b',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.7, 14, 0.9],
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,230,120,0.6)',
          'circle-blur': 0.2,
        }
      });

      // Klikk på punkt viser stedpanel
      // Hent og render polygon-soner
      const { data: soner } = await supabase.from('soner').select('*').eq('by_id', by.id);
      if (soner?.length) {
        soner.forEach((sone: any) => {
          const farge = '#f59e0b';
          const sid = 'sone-' + sone.id;
          const coords = sone.koordinater.coordinates[0];
          const midLng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
          const midLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;

          map.addSource(sid, {
            type: 'geojson',
            data: { type: 'Feature', properties: { navn: sone.navn }, geometry: sone.koordinater }
          });

          // Fyllfarge basert på sonens egen farge
          map.addLayer({
            id: sid + '-fill', type: 'fill', source: sid,
            paint: { 'fill-color': farge, 'fill-opacity': 0.08 }
          });

          // Ytre glow
          map.addLayer({
            id: sid + '-glow', type: 'line', source: sid,
            paint: { 'line-color': farge, 'line-width': 10, 'line-opacity': 0.2, 'line-blur': 8 }
          });

          // Amber glow under
          map.addLayer({
            id: sid + '-line-glow', type: 'line', source: sid,
            paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-opacity': 0.3, 'line-blur': 4 }
          });
          // Hvit stiplet kant over
          map.addLayer({
            id: sid + '-line', type: 'line', source: sid,
            paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.85, 'line-dasharray': [4, 3] }
          });

          // Stedsnavn-label
          map.addSource(sid + '-lbl', {
            type: 'geojson',
            data: { type: 'Feature', properties: { navn: sone.navn }, geometry: { type: 'Point', coordinates: [midLng, midLat + 0.0012] } }
          });
          map.addLayer({
            id: sid + '-lbl-layer', type: 'symbol', source: sid + '-lbl',
            layout: {
              'text-field': ['get', 'navn'],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 13, 'text-letter-spacing': 0.12,
              'text-transform': 'uppercase', 'text-anchor': 'center',
            },
            paint: { 'text-color': farge, 'text-opacity': 0.95, 'text-halo-color': 'rgba(0,0,0,0.95)', 'text-halo-width': 2 }
          });

          // Tags under navnet
          if (sone.tags?.length) {
            const tagTekst = sone.tags.slice(0, 3).join('  ·  ');
            map.addSource(sid + '-tags', {
              type: 'geojson',
              data: { type: 'Feature', properties: { tags: tagTekst }, geometry: { type: 'Point', coordinates: [midLng, midLat - 0.0008] } }
            });
            map.addLayer({
              id: sid + '-tags-layer', type: 'symbol', source: sid + '-tags',
              layout: {
                'text-field': ['get', 'tags'],
                'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                'text-size': 10, 'text-letter-spacing': 0.05,
                'text-anchor': 'center',
              },
              paint: { 'text-color': farge, 'text-opacity': 0.75, 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 }
            });
          }


        });
      }

      map.on('click', 'venues-points', (e: any) => {
        if (e.features?.[0]) {
          const p = e.features[0].properties;
          setValgtSted(p);
          setVisPanel(true);
        }
      });
      // Heatmap-klikk: finn nærmeste venue
      // Flytende vibe-tags
      const { data: soneTags } = await supabase.from('sone_tags').select('*').eq('by_id', by.id);
      if (soneTags?.length) {
        soneTags.forEach((tag: any) => {
          const sourceId = 'vtag-' + tag.id;
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: { tekst: tag.tekst },
              geometry: { type: 'Point', coordinates: [tag.lng, tag.lat] }
            }
          });
          // Tag som hvit chip med mørk bakgrunn
          map.addLayer({
            id: sourceId + '-chip', type: 'symbol', source: sourceId,
            layout: {
              'text-field': ['concat', ' ', ['get', 'tekst'], ' '],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 10,
              'text-anchor': 'center',
              'text-letter-spacing': 0.08,
              'text-padding': 4,
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(10,10,10,0.88)',
              'text-halo-width': 9,
              'text-opacity': 0.95,
            }
          });
        });
      }

      map.on('click', (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['venues-points'] });
        if (features.length > 0) {
          setValgtSted(features[0].properties);
          setVisPanel(true);
          return;
        }
        // Hvis ingen punkt-treff, åpne liste
        const heatFeatures = map.queryRenderedFeatures(e.point, { layers: ['heatmap'] });
        if (heatFeatures.length > 0) {
          setValgtSted(null);
          setVisPanel(true);
        }
      });
      map.on('mouseenter', 'venues-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'venues-points', () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', 'heatmap', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'heatmap', () => { map.getCanvas().style.cursor = ''; });
    });
  }

  return (
    <div style={{ background: '#0a0a0a', height: '100vh', overflow: 'hidden', color: '#fff', position: 'relative' }}>
      {/* Header */}
      <nav style={{ position: 'fixed', top: 0, width: '100%', zIndex: 50, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
        <button onClick={() => router.push('/byer')} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#f59e0b', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setVisDropdown(!visDropdown)} style={{ background: 'rgba(38,38,38,0.9)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'Manrope', fontWeight: 900, fontSize: 18, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 6 }}>
            {by?.navn || '...'}
            <span style={{ fontSize: 12, opacity: 0.6 }}>{visDropdown ? '▲' : '▼'}</span>
          </button>
          {visDropdown && (
            <div style={{ position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(18,18,18,0.98)', backdropFilter: 'blur(20px)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', minWidth: 160, zIndex: 100 }}>
              {alleByer.map(b => (
                <button key={b.id} onClick={() => { router.push('/by/' + b.id); setVisDropdown(false); }} style={{ display: 'block', width: '100%', padding: '12px 20px', background: b.id === id ? 'rgba(245,158,11,0.15)' : 'transparent', border: 'none', color: b.id === id ? '#f59e0b' : '#fff', fontFamily: 'Manrope', fontWeight: 700, fontSize: 15, textAlign: 'left', cursor: 'pointer' }}>
                  {b.navn}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: 'rgba(38,38,38,0.8)', padding: '6px 14px', borderRadius: 9999, fontSize: 11, fontWeight: 600, color: '#adaaaa' }}>{by?.land}</div>
      </nav>

      {/* Kart */}
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      

      {/* Filter-knapper */}
      {!visPanel && (
        <div style={{ position: 'fixed', bottom: 105, left: '50%', transform: 'translateX(-50%)', zIndex: 25, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {[
            { id: 'kveld', label: '🌙 Kveld' },
            { id: 'dag', label: '☕ Dag' },
            { id: 'kultur', label: '🎨 Kultur' },
          ].map(f => (
            <button key={f.id}
              onClick={() => {
                setAktiveFiltre(prev => {
                  const ny = new Set(prev);
                  if (ny.has(f.id)) ny.delete(f.id);
                  else ny.add(f.id);
                  
                  if (mapRef.current) {
                    try {
                      if (ny.size === 0) {
                        mapRef.current.setFilter('heatmap', null);
                        mapRef.current.setFilter('venues-points', null);
                      } else {
                        const filter = ['in', ['get', 'kategori'], ['literal', Array.from(ny)]];
                        mapRef.current.setFilter('heatmap', filter);
                        mapRef.current.setFilter('venues-points', filter);
                      }
                    } catch(e) {}
                  }
                  return ny;
                });
              }}
              style={{
                padding: '8px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                fontFamily: 'Manrope', fontWeight: 700, fontSize: 13,
                background: aktiveFiltre.has(f.id) ? '#f59e0b' : 'rgba(20,20,20,0.9)',
                color: aktiveFiltre.has(f.id) ? '#0a0a0a' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(16px)',
                boxShadow: aktiveFiltre.has(f.id) ? '0 0 20px rgba(245,158,11,0.4)' : '0 2px 12px rgba(0,0,0,0.4)',
                transition: 'all 0.2s',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Stedpanel */}
      {visPanel && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, background: 'rgba(14,14,14,0.97)', backdropFilter: 'blur(24px)', borderRadius: '28px 28px 0 0', maxHeight: '60vh', overflowY: 'auto' }} className="scrollbar-hide">
          <div style={{ padding: '16px 0 0', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.15)' }} />
          </div>
          <div style={{ padding: '12px 24px 40px' }}>
            {valgtSted ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 24 }}>
                        {valgtSted.type === 'nightclub' || valgtSted.type === 'music_venue' ? '🎵' :
                         valgtSted.type === 'bar' ? '🍷' :
                         valgtSted.type === 'cafe' ? '☕' :
                         valgtSted.type === 'shop' ? '🛍️' :
                         valgtSted.type === 'restaurant' ? '🍽️' :
                         valgtSted.type === 'arts_centre' || valgtSted.type === 'theatre' ? '🎨' : '✨'}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#f59e0b', textTransform: 'uppercase', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 9999 }}>
                        {valgtSted.type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 28, letterSpacing: '-0.03em', marginBottom: 6 }}>{valgtSted.navn}</h2>
                    {valgtSted.adresse && <p style={{ fontSize: 13, color: '#adaaaa', marginBottom: 10 }}>📍 {valgtSted.adresse}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ height: 4, borderRadius: 9999, background: 'linear-gradient(to right, #f59e0b, rgba(245,158,11,0.15))', width: Math.round((valgtSted.vibe_score || 0) * 120) + 'px' }} />
                      <span style={{ fontSize: 11, color: '#adaaaa' }}>Vibe {Math.round((valgtSted.vibe_score || 0) * 10)}/10</span>
                    </div>
                  </div>
                  <button onClick={() => { setVisPanel(false); setValgtSted(null); }} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#adaaaa', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
                </div>
                <button onClick={() => setValgtSted(null)} style={{ fontSize: 12, color: '#adaaaa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  ← Alle steder i {by?.navn}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em' }}>Kule steder i {by?.navn}</h2>
                  <button onClick={() => setVisPanel(false)} style={{ background: 'rgba(38,38,38,0.8)', border: 'none', color: '#adaaaa', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {venues.map((v: any) => {
                    const ikon = v.type === 'nightclub' || v.type === 'music_venue' ? '🎵' :
                      v.type === 'bar' ? '🍷' : v.type === 'cafe' ? '☕' :
                      v.type === 'shop' ? '🛍️' : v.type === 'restaurant' ? '🍽️' :
                      v.type === 'arts_centre' || v.type === 'theatre' ? '🎨' : '✨';
                    return (
                      <div key={v.id} onClick={() => setValgtSted(v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          {ikon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.navn}</div>
                          <div style={{ fontSize: 11, color: '#adaaaa', marginTop: 1 }}>{v.adresse}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <div style={{ width: 32, height: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                            <div style={{ width: (v.vibe_score * 100) + '%', height: '100%', background: '#f59e0b', borderRadius: 9999 }} />
                          </div>
                          <span style={{ color: '#adaaaa', fontSize: 14 }}>›</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bunn-nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: visPanel ? 0 : 30, background: 'rgba(18,18,18,0.95)', backdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '14px 16px 32px', opacity: visPanel ? 0 : 1, transition: 'opacity 0.2s', pointerEvents: visPanel ? 'none' : 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 24px', borderRadius: 9999, background: 'linear-gradient(to bottom, rgba(245,158,11,0.2), rgba(245,158,11,0.08))', color: '#f59e0b', boxShadow: '0 0 15px rgba(245,158,11,0.25)' }}>
          <span style={{ fontSize: 20 }}>⊞</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em' }}>KART</span>
        </div>
        <div onClick={() => router.push('/byer')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 24px', borderRadius: 9999, color: 'rgba(173,170,170,0.5)', cursor: 'pointer' }}>
          <span style={{ fontSize: 20 }}>◎</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em' }}>BYER</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 24px', borderRadius: 9999, color: 'rgba(173,170,170,0.5)' }}>
          <span style={{ fontSize: 20 }}>◯</span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em' }}>PROFIL</span>
        </div>
      </nav>

    </div>
  );
}
