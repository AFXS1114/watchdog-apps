/**
 * ScreenshotScheduler.ts
 *
 * Periodically captures a JPEG screenshot using the native MediaProjection
 * bridge (Android) and enqueues it for upload via the EventQueue.
 *
 * ⚠️  MediaProjection requires user consent via a system dialog.
 *     The permission token is acquired once per session (survives foreground
 *     service restart but NOT a full device reboot — user must confirm again).
 *
 * iOS: Not supported. ReplayKit cannot capture outside the app's own window.
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { enqueue } from './EventQueue';
import { ScreenCaptureModule } from '../native/ScreenCaptureModule';

const SCREENSHOT_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes
const SCREENSHOT_QUALITY = 60; // JPEG quality 0–100 (lower = smaller file)
const SCREENSHOT_MAX_WIDTH = 720; // Downscale to save bandwidth

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let currentDeviceId: string | null = null;
let currentContextApp: string | null = null;

/**
 * Update the currently-known foreground app (set by AppUsagePoller).
 */
export function setContextApp(packageName: string | null): void {
  currentContextApp = packageName;
}

/**
 * Initialise with device ID.
 */
export function initScheduler(deviceId: string): void {
  currentDeviceId = deviceId;
}

/**
 * Start the screenshot scheduler. Idempotent.
 * Requires MediaProjection token to have been obtained already.
 */
export function startScheduler(): void {
  if (schedulerTimer !== null) return;
  if (Platform.OS !== 'android') {
    console.log('[ScreenshotScheduler] Skipping — iOS not supported.');
    return;
  }
  schedulerTimer = setInterval(captureAndEnqueue, SCREENSHOT_INTERVAL_MS);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function captureAndEnqueue(): Promise<void> {
  if (!currentDeviceId) return;

  const capturedAt = new Date().toISOString();

  let localPath: string;
  let width: number;
  let height: number;
  let fileSize: number;

  try {
    // Native call: capture screen as JPEG, returns local file path + dimensions
    const result = await ScreenCaptureModule.captureScreen({
      quality: SCREENSHOT_QUALITY,
      maxWidth: SCREENSHOT_MAX_WIDTH,
    });
    localPath = result.path;
    width = result.width;
    height = result.height;
    fileSize = result.fileSizeBytes;
  } catch (err) {
    console.warn('[ScreenshotScheduler] captureScreen failed:', err);
    return;
  }

  // Derive storage path: device_id/YYYY/MM/DD/timestamp.jpg
  const date = capturedAt.substring(0, 10).replace(/-/g, '/');
  const filename = capturedAt.replace(/[:.]/g, '-') + '.jpg';
  const storagePath = `${currentDeviceId}/${date}/${filename}`;

  await enqueue(
    'screenshot',
    {
      device_id: currentDeviceId,
      storage_path: storagePath,
      storage_bucket: 'screenshots',
      width_px: width,
      height_px: height,
      file_size_bytes: fileSize,
      context_app: currentContextApp,
      captured_at: capturedAt,
    },
    localPath, // local file path for UploadService to read
  );

  console.log('[ScreenshotScheduler] Queued screenshot:', storagePath);
}
