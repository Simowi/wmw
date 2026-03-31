import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vztqsaitgctlydqqqliz.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_LY9mfWU9WQ7jvKUR0dz2Xw_bIKcvr6x';
export const supabase = createClient(url, key);
