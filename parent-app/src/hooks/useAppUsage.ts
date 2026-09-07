/**
 * useAppUsage.ts
 *
 * Realtime-subscribed hook for app usage events.
 * - Initial page load via REST
 * - New rows pushed via Supabase Realtime (Postgres LISTEN/NOTIFY)
 * - Derives per-app totals for the current day
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, AppUsageEvent } from '../lib/supabase';

interface AppTotals {
  package_name: string;
  app_label: string | null;
  total_ms: number;
  session_count: number;
}

interface UseAppUsageResult {
  events: AppUsageEvent[];
  totals: AppTotals[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAppUsage(deviceId: string | null): UseAppUsageResult {
  const [events, setEvents] = useState<AppUsageEvent[]>([]);
  const [totals, setTotals] = useState<AppTotals[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);

    // Fetch last 24h of events
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error: fetchErr } = await supabase
      .from('app_usage_events')
      .select('*')
      .eq('device_id', deviceId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(500);

    setLoading(false);
    if (fetchErr) { setError(fetchErr.message); return; }

    const rows = data as AppUsageEvent[];
    setEvents(rows);
    setTotals(deriveTotals(rows));
  }, [deviceId]);

  // Realtime subscription
  useEffect(() => {
    if (!deviceId) return;
    fetchEvents();

    // Subscribe to new inserts for this device
    const channel = supabase
      .channel(`app_usage:${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_usage_events',
          filter: `device_id=eq.${deviceId}`,
        },
        payload => {
          const newEvent = payload.new as AppUsageEvent;
          setEvents(prev => {
            const updated = [newEvent, ...prev].slice(0, 500);
            setTotals(deriveTotals(updated));
            return updated;
          });
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, fetchEvents]);

  return { events, totals, loading, error, refresh: fetchEvents };
}

function deriveTotals(events: AppUsageEvent[]): AppTotals[] {
  const map = new Map<string, AppTotals>();
  for (const e of events) {
    const existing = map.get(e.package_name) ?? {
      package_name: e.package_name,
      app_label: e.app_label,
      total_ms: 0,
      session_count: 0,
    };
    existing.total_ms += e.duration_ms ?? 0;
    existing.session_count += 1;
    map.set(e.package_name, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total_ms - a.total_ms);
}
