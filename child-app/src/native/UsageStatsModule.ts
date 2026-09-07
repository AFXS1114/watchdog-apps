/**
 * UsageStatsModule.ts
 *
 * TypeScript bridge for the Android UsageStatsModule native module.
 *
 * ⚠️  REQUIRES NATIVE KOTLIN MODULE — see:
 *     android/app/src/main/java/com/watchdogchild/UsageStatsModule.kt
 *
 * Android permissions required (AndroidManifest.xml):
 *   <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
 *                    tools:ignore="ProtectedPermissions" />
 *
 * The user must also manually go to:
 *   Settings → Apps → Special app access → Usage access → WatchdogChild → Enable
 */

import { NativeModules, Platform } from 'react-native';

const { WatchdogUsageStats } = NativeModules;

export interface UsageEvent {
  packageName: string;
  appLabel: string | null;
  eventType: 'ACTIVITY_RESUMED' | 'ACTIVITY_PAUSED' | 'ACTIVITY_STOPPED' | 'OTHER';
  /** ISO-8601 timestamp */
  timestamp: string;
}

export interface UsageStatsModuleInterface {
  /**
   * Query usage events from the last `windowMs` milliseconds.
   * Returns events sorted ascending by timestamp.
   *
   * ⚠️  Only works on Android API 21+.
   *     Returns [] on iOS or if permission is not granted.
   */
  queryRecentEvents(windowMs: number): Promise<UsageEvent[]>;

  /**
   * Check if PACKAGE_USAGE_STATS permission has been granted.
   */
  hasUsageStatsPermission(): Promise<boolean>;

  /**
   * Open system settings page for usage access.
   * Use to direct the user to grant permission.
   */
  openUsageAccessSettings(): Promise<void>;
}

const stub: UsageStatsModuleInterface = {
  queryRecentEvents: async () => [],
  hasUsageStatsPermission: async () => false,
  openUsageAccessSettings: async () => {},
};

export const UsageStatsModule: UsageStatsModuleInterface =
  Platform.OS === 'android' && WatchdogUsageStats
    ? (WatchdogUsageStats as UsageStatsModuleInterface)
    : stub;
