/**
 * useLinks.ts — Realtime hook for link/URL events
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, LinkEvent } from '../lib/supabase';

interface UseLinksResult {
  links: LinkEvent[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const PAGE_SIZE = 50;

export function useLinks(deviceId: string | null): UseLinksResult {
  const [links, setLinks] = useState<LinkEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from('link_events')
      .select('*')
      .eq('device_id', deviceId)
      .order('captured_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

    setLoading(false);
    if (fetchErr) { setError(fetchErr.message); return; }

    const rows = data as LinkEvent[];
    setHasMore(rows.length === PAGE_SIZE);
    setLinks(prev => replace ? rows : [...prev, ...rows]);
  }, [deviceId]);

  // Realtime new inserts
  useEffect(() => {
    if (!deviceId) return;
    setPage(0);
    fetchPage(0, true);

    const channel = supabase
      .channel(`links:${deviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'link_events',
          filter: `device_id=eq.${deviceId}`,
        },
        payload => {
          setLinks(prev => [payload.new as LinkEvent, ...prev]);
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [deviceId, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  }, [hasMore, loading, page, fetchPage]);

  const refresh = useCallback(() => {
    setPage(0);
    fetchPage(0, true);
  }, [fetchPage]);

  return { links, loading, error, hasMore, loadMore, refresh };
}
