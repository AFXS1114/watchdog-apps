/**
 * useScreenshots.ts
 *
 * Paginated hook for screenshot metadata + signed URL generation.
 * Signed URLs expire after 1 hour; the hook re-signs when navigating
 * back to a cached item.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase, Screenshot } from '../lib/supabase';

interface UseScreenshotsResult {
  screenshots: Screenshot[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const PAGE_SIZE = 20;
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

export function useScreenshots(deviceId: string | null): UseScreenshotsResult {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (!deviceId) return;
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from('screenshots')
      .select('*')
      .eq('device_id', deviceId)
      .order('captured_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const rows = data as Screenshot[];
    setHasMore(rows.length === PAGE_SIZE);

    // Generate signed URLs in batch
    const withUrls = await signUrls(rows);
    setLoading(false);
    setScreenshots(prev => replace ? withUrls : [...prev, ...withUrls]);
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    setPage(0);
    fetchPage(0, true);
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

  return { screenshots, loading, error, hasMore, loadMore, refresh };
}

async function signUrls(rows: Screenshot[]): Promise<Screenshot[]> {
  if (rows.length === 0) return [];

  // Group by bucket (always 'screenshots' but future-proof)
  const paths = rows.map(r => r.storage_path);
  const { data, error } = await supabase.storage
    .from('screenshots')
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) return rows;

  // Map signed URLs back to rows by path
  const urlMap = new Map<string, string>();
  data.forEach(item => {
    if (item.path && item.signedUrl) urlMap.set(item.path, item.signedUrl);
  });

  return rows.map(r => ({
    ...r,
    signedUrl: urlMap.get(r.storage_path) ?? undefined,
  }));
}
