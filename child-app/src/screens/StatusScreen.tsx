/**
 * StatusScreen.tsx
 *
 * Shows the child app's monitoring status — useful for verifying the
 * service is alive and how many events are pending upload.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { getPendingCount } from '../services/EventQueue';
import { runUploadCycle } from '../services/UploadService';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { AccessibilityModule } from '../native/AccessibilityModule';

interface Status {
  pendingEvents: number;
  hasUsageStats: boolean;
  hasAccessibility: boolean;
  lastUpload: Date | null;
  uploading: boolean;
}

export default function StatusScreen() {
  const [status, setStatus] = useState<Status>({
    pendingEvents: 0,
    hasUsageStats: false,
    hasAccessibility: false,
    lastUpload: null,
    uploading: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const [pending, usage, acc] = await Promise.all([
      getPendingCount(),
      UsageStatsModule.hasUsageStatsPermission(),
      AccessibilityModule.isAccessibilityEnabled(),
    ]);
    setStatus(prev => ({
      ...prev,
      pendingEvents: pending,
      hasUsageStats: usage,
      hasAccessibility: acc,
    }));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleManualUpload = useCallback(async () => {
    setStatus(prev => ({ ...prev, uploading: true }));
    const result = await runUploadCycle();
    setStatus(prev => ({
      ...prev,
      uploading: false,
      lastUpload: new Date(),
      pendingEvents: Math.max(0, prev.pendingEvents - result.uploaded),
    }));
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const StatusRow = ({
    label,
    value,
    ok,
  }: {
    label: string;
    value: string;
    ok: boolean;
  }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}>
        <Text style={styles.pillText}>{value}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />}
    >
      <Text style={styles.title}>Monitoring Status</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Permissions</Text>
        <StatusRow
          label="Usage Access"
          value={status.hasUsageStats ? 'Granted' : 'Missing'}
          ok={status.hasUsageStats}
        />
        <StatusRow
          label="Accessibility Service"
          value={status.hasAccessibility ? 'Active' : 'Inactive'}
          ok={status.hasAccessibility}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upload Queue</Text>
        <StatusRow
          label="Pending events"
          value={status.pendingEvents.toString()}
          ok={status.pendingEvents === 0}
        />
        <StatusRow
          label="Last upload"
          value={status.lastUpload ? status.lastUpload.toLocaleTimeString() : 'Never'}
          ok={status.lastUpload !== null}
        />
        <TouchableOpacity
          style={[styles.button, status.uploading && styles.buttonDisabled]}
          onPress={handleManualUpload}
          disabled={status.uploading}
          accessibilityRole="button"
          accessibilityLabel="Upload now"
        >
          <Text style={styles.buttonText}>
            {status.uploading ? 'Uploading…' : 'Upload Now'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          🔒 Monitoring runs silently in the background.{'\n'}
          Data is uploaded when internet is available.{'\n'}
          Pull down to refresh this status view.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 20 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#6366f1', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  rowLabel: { fontSize: 14, color: '#ccc' },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  pillOk: { backgroundColor: '#22c55e22' },
  pillWarn: { backgroundColor: '#f59e0b22' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#e0e0ff' },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  infoText: { fontSize: 13, color: '#6666aa', lineHeight: 20 },
});
