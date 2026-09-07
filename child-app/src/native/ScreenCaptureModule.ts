/**
 * ScreenCaptureModule.ts
 *
 * TypeScript bridge for the Android MediaProjection-based screen capture.
 *
 * ⚠️  REQUIRES NATIVE KOTLIN MODULE — see:
 *     android/app/src/main/java/com/watchdogchild/ScreenCaptureModule.kt
 *
 * ⚠️  MediaProjection requires a user-consent dialog EACH SESSION.
 *     The foreground service must re-request permission after every reboot.
 *
 * Android permissions required (AndroidManifest.xml):
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
 */

import { NativeModules, Platform } from 'react-native';

const { WatchdogScreenCapture } = NativeModules;

export interface CaptureResult {
  /** Absolute local filesystem path to the saved JPEG */
  path: string;
  width: number;
  height: number;
  fileSizeBytes: number;
}

export interface CaptureOptions {
  /** JPEG quality, 0–100. Default: 60 */
  quality?: number;
  /** Downscale to this max width (preserves aspect ratio). Default: 720 */
  maxWidth?: number;
}

export interface ScreenCaptureModuleInterface {
  /**
   * Request MediaProjection permission from the user (shows system dialog).
   * Must be called from a foreground context before captureScreen().
   * Resolves true if granted, false if denied.
   */
  requestProjectionPermission(): Promise<boolean>;

  /**
   * Capture the current screen content.
   * Requires projection permission to have been granted this session.
   * Saves to app cache dir and returns the file path + dimensions.
   */
  captureScreen(options?: CaptureOptions): Promise<CaptureResult>;

  /**
   * Release the MediaProjection token (stops background capture rights).
   */
  releaseProjection(): Promise<void>;
}

const stub: ScreenCaptureModuleInterface = {
  requestProjectionPermission: async () => false,
  captureScreen: async () => {
    throw new Error('ScreenCaptureModule not available on this platform');
  },
  releaseProjection: async () => {},
};

export const ScreenCaptureModule: ScreenCaptureModuleInterface =
  Platform.OS === 'android' && WatchdogScreenCapture
    ? (WatchdogScreenCapture as ScreenCaptureModuleInterface)
    : stub;
