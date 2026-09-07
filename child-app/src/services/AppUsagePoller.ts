/**
 * AppUsagePoller.ts
 *
 * Polls the native UsageStatsModule every POLL_INTERVAL_MS to detect
 * foreground app changes. Emits app_usage events into the EventQueue.
 *
 * Android only — the native module is a no-op on iOS.
 * Requires PACKAGE_USAGE_STATS permission (user must grant in Settings).
 */

import { Platform } from 'react-native';
import { enqueue } from './EventQueue';
import { runUploadCycle } from './UploadService';
import { UsageStatsModule, type UsageEvent } from '../native/UsageStatsModule';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const UPLOAD_EVERY_N_POLLS = 4; // Upload roughly every 2 minutes

interface ActiveSession {
  package_name: string;
  app_label: string | null;
  started_at: string;
}

let pollerTimer: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;
let currentSession: ActiveSession | null = null;
let deviceId: string | null = null;

/**
 * Initialise the poller with the device's Supabase device_id.
 * Call once after pairing is complete.
 */
export function initPoller(supabaseDeviceId: string): void {
  deviceId = supabaseDeviceId;
}

/**
 * Start polling. Safe to call multiple times (idempotent).
 */
export function startPoller(): void {
  if (pollerTimer !== null) return;
  if (Platform.OS !== 'android') {
    console.log('[AppUsagePoller] Skipping — iOS does not support UsageStats.');
    return;
  }
  poll(); // Run immediately
  pollerTimer = setInterval(poll, POLL_INTERVAL_MS);
}

/**
 * Stop polling and close any open session.
 */
export async function stopPoller(): Promise<void> {
  if (pollerTimer !== null) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  if (currentSession && deviceId) {
    await closeSession(new Date().toISOString());
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  if (!deviceId) return;

  let events: UsageEvent[] = [];
  try {
    // Query events from the last POLL_INTERVAL_MS window
    events = await UsageStatsModule.queryRecentEvents(POLL_INTERVAL_MS + 5_000);
  } catch (err) {
    console.warn('[AppUsagePoller] queryRecentEvents failed:', err);
    return;
  }

  const now = new Date().toISOString();

  for (const event of events) {
    if (event.eventType === 'ACTIVITY_RESUMED') {
      // New foreground app
      if (currentSession) {
        // Close the previous session
        await closeSession(event.timestamp);
      }
      currentSession = {
        package_name: event.packageName,
        app_label: event.appLabel ?? null,
        started_at: event.timestamp,
      };
    } else if (
      event.eventType === 'ACTIVITY_PAUSED' &&
      currentSession?.package_name === event.packageName
    ) {
      await closeSession(event.timestamp);
    }
  }

  // Trigger upload every N polls
  pollCount++;
  if (pollCount % UPLOAD_EVERY_N_POLLS === 0) {
    runUploadCycle().catch(err =>
      console.warn('[AppUsagePoller] upload cycle error:', err),
    );
  }
}

async function closeSession(endedAt: string): Promise<void> {
  if (!currentSession || !deviceId) return;

  await enqueue('app_usage', {
    device_id: deviceId,
    package_name: currentSession.package_name,
    app_label: currentSession.app_label,
    started_at: currentSession.started_at,
    ended_at: endedAt,
  });

  currentSession = null;
}
