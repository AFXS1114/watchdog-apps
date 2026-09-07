/**
 * AccessibilityModule.ts
 *
 * TypeScript bridge for the Android AccessibilityWatchdog service.
 *
 * The Accessibility Service runs as a system service and emits events via
 * a React Native DeviceEventEmitter bridge when:
 *   - The foreground window/app changes
 *   - A URL is detected in an address bar node (Chrome, Firefox, etc.)
 *
 * ⚠️  REQUIRES NATIVE KOTLIN MODULE — see:
 *     android/app/src/main/java/com/watchdogchild/AccessibilityWatchdog.kt
 *
 * ⚠️  User must enable in:
 *     Settings → Accessibility → Installed apps → WatchdogChild → Enable
 *
 * ⚠️  URL scraping via Accessibility is fragile:
 *     - Chrome periodically changes the view hierarchy node IDs
 *     - Google Play may flag the app under "Device and Network Abuse" policy
 *       if it reads browser address bars — review distribution strategy
 */

import { NativeModules, DeviceEventEmitter, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';

const { WatchdogAccessibility } = NativeModules;

export interface AppSwitchEvent {
  packageName: string;
  appLabel: string | null;
  timestamp: string; // ISO-8601
}

export interface UrlDetectedEvent {
  url: string;
  pageTitle: string | null;
  contextApp: string; // package name of the browser
  timestamp: string; // ISO-8601
}

export interface AccessibilityModuleInterface {
  /** Returns true if the Accessibility Service is currently enabled */
  isAccessibilityEnabled(): Promise<boolean>;
  /** Opens the Accessibility settings page for the user to grant access */
  openAccessibilitySettings(): Promise<void>;
}

const stub: AccessibilityModuleInterface = {
  isAccessibilityEnabled: async () => false,
  openAccessibilitySettings: async () => {},
};

export const AccessibilityModule: AccessibilityModuleInterface =
  Platform.OS === 'android' && WatchdogAccessibility
    ? (WatchdogAccessibility as AccessibilityModuleInterface)
    : stub;

// ─── Event subscriptions ──────────────────────────────────────────────────────

/** Subscribe to foreground app-switch events emitted by the Accessibility Service */
export function onAppSwitch(
  handler: (event: AppSwitchEvent) => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener('WatchdogAppSwitch', handler);
}

/** Subscribe to URL-detected events scraped from browser address bars */
export function onUrlDetected(
  handler: (event: UrlDetectedEvent) => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener('WatchdogUrlDetected', handler);
}
