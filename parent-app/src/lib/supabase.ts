import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

const SUPABASE_URL = env?.SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = env?.SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Shared row types ─────────────────────────────────────────────────────────

export interface Device {
  id: string;
  child_user_id: string;
  parent_user_id: string;
  device_name: string;
  platform: 'android' | 'ios';
  paired_at: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface AppUsageEvent {
  id: string;
  device_id: string;
  package_name: string;
  app_label: string | null;
  app_icon_url: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  uploaded_at: string;
}

export interface LinkEvent {
  id: string;
  device_id: string;
  url: string;
  page_title: string | null;
  source: 'accessibility' | 'custom_browser' | 'vpn' | null;
  context_app: string | null;
  captured_at: string;
  uploaded_at: string;
}

export interface Screenshot {
  id: string;
  device_id: string;
  storage_path: string;
  storage_bucket: string;
  width_px: number | null;
  height_px: number | null;
  file_size_bytes: number | null;
  context_app: string | null;
  captured_at: string;
  uploaded_at: string;
  /** Signed URL — populated client-side */
  signedUrl?: string;
}
