/**
 * App.tsx — WatchdogChild entry point
 *
 * Manages app state machine:
 *   setup → permissions → monitoring active
 *
 * Also:
 *  - Wires AccessibilityModule event listeners → EventQueue
 *  - Starts AppUsagePoller + ScreenshotScheduler
 *  - Subscribes to NetInfo for opportunistic uploads
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  AppState,
  Platform,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SetupScreen from './src/screens/SetupScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import StatusScreen from './src/screens/StatusScreen';

import { initPoller, startPoller, stopPoller } from './src/services/AppUsagePoller';
import { initScheduler, startScheduler, stopScheduler } from './src/services/ScreenshotScheduler';
import { runUploadCycle } from './src/services/UploadService';
import { enqueue } from './src/services/EventQueue';
import { onAppSwitch, onUrlDetected } from './src/native/AccessibilityModule';
import { supabase } from './src/lib/supabase';

type AppFlow = 'loading' | 'setup' | 'permissions' | 'active';

const DEVICE_ID_KEY = '@watchdog_device_id';

export default function App() {
  const [flow, setFlow] = useState<AppFlow>('loading');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const netUnsubRef = useRef<(() => void) | null>(null);
  const appSwitchSubRef = useRef<any>(null);
  const urlSubRef = useRef<any>(null);

  // ── Restore persisted device ID on launch ──────────────────────────────

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setFlow('setup'); return; }

      const savedId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (savedId) {
        setDeviceId(savedId);
        setFlow('permissions');
      } else {
        setFlow('setup');
      }
    })();
  }, []);

  // ── Called when pairing completes ──────────────────────────────────────

  const handlePaired = useCallback(async (id: string) => {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    setDeviceId(id);
    setFlow('permissions');
  }, []);

  // ── Called when all permissions are granted ────────────────────────────

  const handlePermissionsReady = useCallback(async () => {
    setFlow('active');
  }, []);

  // ── Start monitoring when flow = active ───────────────────────────────

  useEffect(() => {
    if (flow !== 'active' || !deviceId) return;

    initPoller(deviceId);
    initScheduler(deviceId);

    // Wire Accessibility events → EventQueue (Android only)
    if (Platform.OS === 'android') {
      appSwitchSubRef.current = onAppSwitch(event => {
        enqueue('app_usage', {
          device_id: deviceId,
          package_name: event.packageName,
          app_label: event.appLabel,
          started_at: event.timestamp,
        });
      });

      urlSubRef.current = onUrlDetected(event => {
        enqueue('link', {
          device_id: deviceId,
          url: event.url,
          page_title: event.pageTitle,
          source: 'accessibility',
          context_app: event.contextApp,
          captured_at: event.timestamp,
        });
      });
    }

    startPoller();
    startScheduler();

    // Upload whenever connectivity is restored
    netUnsubRef.current = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        runUploadCycle().catch(console.warn);
      }
    });

    // Also upload when app comes to foreground
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        runUploadCycle().catch(console.warn);
        // Update last_seen timestamp
        supabase
          .from('devices')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', deviceId)
          .then(() => {});
      }
    });

    return () => {
      stopPoller();
      stopScheduler();
      netUnsubRef.current?.();
      appStateSub.remove();
      appSwitchSubRef.current?.remove();
      urlSubRef.current?.remove();
    };
  }, [flow, deviceId]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />
      {flow === 'loading' && null}
      {flow === 'setup' && <SetupScreen onPaired={handlePaired} />}
      {flow === 'permissions' && (
        <PermissionsScreen onAllGranted={handlePermissionsReady} />
      )}
      {flow === 'active' && <StatusScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1a' },
});
