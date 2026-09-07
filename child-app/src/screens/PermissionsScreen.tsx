/**
 * PermissionsScreen.tsx
 *
 * Guides the parent/child through granting the three permissions needed
 * on Android before monitoring can begin:
 *   1. Usage Access (UsageStatsManager)
 *   2. Accessibility Service
 *   3. MediaProjection (screenshot — prompted at first capture)
 *   4. Battery optimisation exemption (OEM-specific)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { AccessibilityModule } from '../native/AccessibilityModule';
import { ScreenCaptureModule } from '../native/ScreenCaptureModule';

interface PermState {
  usageStats: boolean;
  accessibility: boolean;
  projection: boolean;
}

const STEPS = [
  {
    key: 'usageStats' as keyof PermState,
    title: 'Usage Access',
    description:
      'Allows detecting which apps are open. Go to Settings → Apps → Special app access → Usage access → Enable WatchdogChild.',
    buttonLabel: 'Open Usage Settings',
  },
  {
    key: 'accessibility' as keyof PermState,
    title: 'Accessibility Service',
    description:
      'Enables real-time app-switch detection and browser URL tracking. Go to Settings → Accessibility → WatchdogChild → Enable.',
    buttonLabel: 'Open Accessibility Settings',
  },
  {
    key: 'projection' as keyof PermState,
    title: 'Screen Capture (MediaProjection)',
    description:
      'Shows a one-time system dialog to allow screenshots. You will see this prompt again after a device reboot.',
    buttonLabel: 'Request Screen Capture',
  },
];

export default function PermissionsScreen({
  onAllGranted,
}: {
  onAllGranted: () => void;
}) {
  const [perms, setPerms] = useState<PermState>({
    usageStats: false,
    accessibility: false,
    projection: false,
  });

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPerms({ usageStats: false, accessibility: false, projection: false });
      return;
    }
    const [usage, acc] = await Promise.all([
      UsageStatsModule.hasUsageStatsPermission(),
      AccessibilityModule.isAccessibilityEnabled(),
    ]);
    setPerms(prev => ({ ...prev, usageStats: usage, accessibility: acc }));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (perms.usageStats && perms.accessibility && perms.projection) {
      onAllGranted();
    }
  }, [perms, onAllGranted]);

  const handleStep = async (key: keyof PermState) => {
    switch (key) {
      case 'usageStats':
        await UsageStatsModule.openUsageAccessSettings();
        break;
      case 'accessibility':
        await AccessibilityModule.openAccessibilitySettings();
        break;
      case 'projection': {
        const granted = await ScreenCaptureModule.requestProjectionPermission();
        setPerms(prev => ({ ...prev, projection: granted }));
        if (!granted) {
          Alert.alert('Permission Denied', 'Screen capture was not granted. Tap again to retry.');
        }
        break;
      }
    }
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>iOS Limitations</Text>
        <Text style={styles.body}>
          Due to iOS sandboxing, app usage monitoring and screen capture are{' '}
          <Text style={styles.bold}>not possible</Text> on iPhone without MDM
          enrollment.{'\n\n'}
          The child app on iOS can only track URLs visited inside the built-in
          browser. No additional permissions are required.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Setup Permissions</Text>
      <Text style={styles.subtitle}>
        Grant each permission to enable full monitoring.
      </Text>

      {STEPS.map(step => {
        const granted = perms[step.key];
        return (
          <View key={step.key} style={[styles.card, granted && styles.cardGranted]}>
            <View style={styles.cardHeader}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <View style={[styles.badge, granted ? styles.badgeOk : styles.badgePending]}>
                <Text style={styles.badgeText}>{granted ? '✓ Granted' : 'Needed'}</Text>
              </View>
            </View>
            <Text style={styles.description}>{step.description}</Text>
            {!granted && (
              <TouchableOpacity
                style={styles.button}
                onPress={() => handleStep(step.key)}
                accessibilityRole="button"
                accessibilityLabel={step.buttonLabel}
              >
                <Text style={styles.buttonText}>{step.buttonLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <View style={styles.card}>
        <Text style={styles.stepTitle}>Battery Optimisation</Text>
        <Text style={styles.description}>
          On Samsung, Xiaomi, and Huawei devices, add WatchdogChild to the
          "Auto-start" or "Protected apps" list to prevent the OS from killing
          the background service.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#8888aa', marginBottom: 24 },
  body: { fontSize: 15, color: '#ccc', lineHeight: 22, margin: 20 },
  bold: { fontWeight: '700', color: '#fff' },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardGranted: { borderColor: '#22c55e44', backgroundColor: '#0d1f12' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stepTitle: { fontSize: 16, fontWeight: '600', color: '#e0e0ff' },
  description: { fontSize: 13, color: '#9999bb', lineHeight: 19, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeOk: { backgroundColor: '#22c55e33' },
  badgePending: { backgroundColor: '#f59e0b33' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#e0e0ff' },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
