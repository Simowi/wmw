'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BY_BILDER, BY_VIBES, BY_LABELS } from '@/lib/bydata';

interface By { id: string; navn: string; land: string; lat: number; lng: number; }

export default function ByerPage() {
  const [byer, setByer] = useState<By[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.from('byer').select('*').order('sort_order').then(({ data }) => {
      if (data) setByer(data);
    });
  }, []);

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>
      {/* Header */}
      <nav style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 50,
        background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(20px)',
        padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: 22, color: '#f59e0b', letterSpacing: '-0.04em' }}>WMW</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fd8863', boxShadow: '0 0 8px rgba(253,136,99,0.7)', marginTop: 2 }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', color: '#adaaaa', textTransform: 'uppercase' }}>Glipp i Matrisen</div>
          <div style={{ fontSize: 9, color: 'rgba(173,170,170,0.4)', letterSpacing: '0.05em' }}>Where's My Williamsburg</div>
        </div>
      </nav>

      <main style={{ paddingTop: 72, paddingBottom: 110 }}>
        {/* Hero */}
        <div style={{ padding: '32px 20px 28px' }}>
          <h1 className="text-4xl font-bold mb-8 text-amber-500 font-manrope tracking-tighter uppercase">Hvor er det fett i ...</h1>
        </div>

        {/* By-kort */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {byer.map((by, i) => {
            const bilde = BY_BILDER[by.navn];
            return (
              <div key={by.id} onClick={() => router.push('/by/' + by.id)}
                style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', height: i === 0 ? 320 : 200, cursor: 'pointer' }}>
                {bilde ? (
                  <img src={bilde} alt={by.navn}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, filter: 'brightness(0.7) contrast(1.1)' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                  />
                ) : null}
                <div style={{ position: 'absolute', inset: 0, background: bilde ? 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)' : 'linear-gradient(135deg, #1a1a2e, #16213e)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: i === 0 ? 28 : 20 }}>
                  <span style={{ background: 'rgba(245,158,11,0.2)', backdropFilter: 'blur(8px)', color: '#c9b8ff', padding: '3px 12px', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', border: '1px solid rgba(245,158,11,0.2)', display: 'inline-block', marginBottom: 8, alignSelf: 'flex-start' }}>
                    {BY_LABELS[by.navn] || by.land.toUpperCase()}
                  </span>
                  <h2 style={{ fontFamily: 'Manrope', fontWeight: 900, fontSize: i === 0 ? 48 : 32, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>{by.navn}</h2>
                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.4, textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{BY_VIBES[by.navn]}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Bunn-nav */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(18,18,18,0.95)', backdropFilter: 'blur(24px)', borderRadius: '24px 24px 0 0', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '14px 16px 32px' }}>
        {[
          { label: 'KART', icon: '⊞', active: false, action: () => supabase.from('byer').select('id').order('sort_order').limit(1).then(({ data }) => data?.[0] && router.push('/by/' + data[0].id)) },
          { label: 'BYER', icon: '◎', active: true, action: () => {} },
          { label: 'PROFIL', icon: '◯', active: false, action: () => {} },
        ].map(item => (
          <div key={item.label} onClick={item.action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 24px', borderRadius: 9999, background: item.active ? 'linear-gradient(to bottom, rgba(245,158,11,0.2), rgba(245,158,11,0.08))' : 'transparent', color: item.active ? '#f59e0b' : 'rgba(173,170,170,0.5)', boxShadow: item.active ? '0 0 15px rgba(245,158,11,0.25)' : 'none', cursor: 'pointer' }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.15em', fontFamily: 'Inter' }}>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}
