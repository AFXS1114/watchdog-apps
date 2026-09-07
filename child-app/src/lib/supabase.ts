import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 2 },
  },
});

export type Database = {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string;
          child_user_id: string;
          parent_user_id: string;
          device_name: string;
          platform: 'android' | 'ios';
          pairing_code: string | null;
          paired_at: string | null;
          last_seen: string | null;
          push_token: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['devices']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['devices']['Insert']>;
      };
      app_usage_events: {
        Row: {
          id: string;
          device_id: string;
          package_name: string;
          app_label: string | null;
          app_icon_url: string | null;
          started_at: string;
          ended_at: string | null;
          duration_ms: number | null;
          uploaded_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['app_usage_events']['Row'],
          'duration_ms' | 'uploaded_at'
        >;
        Update: Partial<Database['public']['Tables']['app_usage_events']['Insert']>;
      };
      link_events: {
        Row: {
          id: string;
          device_id: string;
          url: string;
          page_title: string | null;
          source: 'accessibility' | 'custom_browser' | 'vpn' | null;
          context_app: string | null;
          captured_at: string;
          uploaded_at: string;
        };
        Insert: Omit<Database['public']['Tables']['link_events']['Row'], 'uploaded_at'>;
        Update: Partial<Database['public']['Tables']['link_events']['Insert']>;
      };
      screenshots: {
        Row: {
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
        };
        Insert: Omit<Database['public']['Tables']['screenshots']['Row'], 'uploaded_at'>;
        Update: Partial<Database['public']['Tables']['screenshots']['Insert']>;
      };
    };
  };
};
