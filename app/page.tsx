'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    supabase.from('byer').select('id').order('sort_order').limit(1)
      .then(({ data }) => {
        if (data?.[0]) router.replace('/by/' + data[0].id);
        else router.replace('/byer');
      });
  }, []);
  return (
    <div style={{ background: '#0a0a0a', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#b6a0ff', boxShadow: '0 0 20px rgba(182,160,255,0.8)' }} />
    </div>
  );
}
