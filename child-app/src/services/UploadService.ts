/**
 * UploadService.ts
 *
 * Drains the EventQueue by uploading batched events to Supabase.
 * - Text events (app_usage, link) → PostgREST bulk insert
 * - Screenshots → Supabase Storage upload, then metadata insert
 *
 * Call `runUploadCycle()` whenever connectivity is confirmed.
 */

import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import { toByteArray } from 'base64-js';
import { supabase } from '../lib/supabase';
import {
  dequeueBatch,
  markSuccess,
  markFailed,
  purgeFailed,
  QueueEntry,
} from './EventQueue';

// ─── Types matching Supabase Insert shapes ───────────────────────────────────

type AppUsageInsert = {
  device_id: string;
  package_name: string;
  app_label?: string | null;
  started_at: string;
  ended_at?: string | null;
};

type LinkInsert = {
  device_id: string;
  url: string;
  page_title?: string | null;
  source?: 'accessibility' | 'custom_browser' | 'vpn';
  context_app?: string | null;
  captured_at: string;
};

type ScreenshotInsert = {
  device_id: string;
  storage_path: string;
  storage_bucket: string;
  width_px?: number | null;
  height_px?: number | null;
  file_size_bytes?: number | null;
  context_app?: string | null;
  captured_at: string;
};

// ─── Upload helpers ──────────────────────────────────────────────────────────

async function uploadAppUsageBatch(entries: QueueEntry[]): Promise<void> {
  const rows: AppUsageInsert[] = entries.map(e => JSON.parse(e.payload));
  const { error } = await supabase.from('app_usage_events').insert(rows);
  if (error) throw new Error(`app_usage insert failed: ${error.message}`);
}

async function uploadLinkBatch(entries: QueueEntry[]): Promise<void> {
  const rows: LinkInsert[] = entries.map(e => JSON.parse(e.payload));
  const { error } = await supabase.from('link_events').insert(rows);
  if (error) throw new Error(`link_events insert failed: ${error.message}`);
}

async function uploadScreenshot(entry: QueueEntry): Promise<void> {
  if (!entry.file_path) throw new Error('Screenshot entry missing file_path');

  const meta: ScreenshotInsert = JSON.parse(entry.payload);

  // Read file as base64 and convert to byte array for Supabase Storage
  const base64 = await RNFS.readFile(entry.file_path, 'base64');
  const byteArray = toByteArray(base64);

  // Upload to Supabase Storage
  const { error: storageError } = await supabase.storage
    .from('screenshots')
    .upload(meta.storage_path, byteArray.buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

  // Insert metadata row
  const { error: dbError } = await supabase.from('screenshots').insert([meta]);
  if (dbError) throw new Error(`Screenshot metadata insert failed: ${dbError.message}`);

  // Clean up local file after successful upload
  try {
    await RNFS.unlink(entry.file_path);
  } catch {
    // Non-fatal: file may already be gone
  }
}

// ─── Main upload cycle ───────────────────────────────────────────────────────

/**
 * Run one full upload cycle. Groups text events by type for batch insert,
 * uploads screenshots individually. Call when network is available.
 */
export async function runUploadCycle(): Promise<{ uploaded: number; failed: number }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    return { uploaded: 0, failed: 0 };
  }

  const entries = await dequeueBatch();
  if (entries.length === 0) return { uploaded: 0, failed: 0 };

  // Group by type
  const byType = entries.reduce<Record<string, QueueEntry[]>>((acc, e) => {
    (acc[e.event_type] ??= []).push(e);
    return acc;
  }, {});

  let uploaded = 0;
  let failed = 0;

  // ── App usage batch ──
  if (byType.app_usage?.length) {
    try {
      await uploadAppUsageBatch(byType.app_usage);
      for (const e of byType.app_usage) {
        await markSuccess(e.id);
        uploaded++;
      }
    } catch (err) {
      console.warn('[UploadService] app_usage batch failed:', err);
      for (const e of byType.app_usage) {
        await markFailed(e.id);
        failed++;
      }
    }
  }

  // ── Link batch ──
  if (byType.link?.length) {
    try {
      await uploadLinkBatch(byType.link);
      for (const e of byType.link) {
        await markSuccess(e.id);
        uploaded++;
      }
    } catch (err) {
      console.warn('[UploadService] link batch failed:', err);
      for (const e of byType.link) {
        await markFailed(e.id);
        failed++;
      }
    }
  }

  // ── Screenshots (individual, large files) ──
  if (byType.screenshot?.length) {
    for (const e of byType.screenshot) {
      try {
        await uploadScreenshot(e);
        await markSuccess(e.id);
        uploaded++;
      } catch (err) {
        console.warn('[UploadService] screenshot upload failed:', err);
        await markFailed(e.id);
        failed++;
      }
    }
  }

  // Purge permanently failed entries
  await purgeFailed();

  return { uploaded, failed };
}
