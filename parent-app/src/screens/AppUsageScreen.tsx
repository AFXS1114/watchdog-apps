/**
 * AppUsageScreen.tsx
 *
 * Full app-usage timeline for the child device.
 * Shows per-app totals sorted by screen time + session list.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { format } from 'date-fns';
import { useAppUsage } from '../hooks/useAppUsage';

interface Props { deviceId: string }

function formatMs(ms: number): string {
  if (!ms) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

type ViewMode = 'totals' | 'timeline';

export default function AppUsageScreen({ deviceId }: Props) {
  const { events, totals, loading, refresh } = useAppUsage(deviceId);
  const [mode, setMode] = useState<ViewMode>('totals');

  const maxMs = totals[0]?.total_ms ?? 1;

  return (
    <View style={styles.container}>
      {/* Toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'totals' && styles.toggleActive]}
          onPress={() => setMode('totals')}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, mode === 'totals' && styles.toggleTextActive]}>
            By App
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode === 'timeline' && styles.toggleActive]}
          onPress={() => setMode('timeline')}
          accessibilityRole="button"
        >
          <Text style={[styles.toggleText, mode === 'timeline' && styles.toggleTextActive]}>
            Timeline
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'totals' ? (
        <FlatList
          data={totals}
          keyExtractor={item => item.package_name}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#6366f1" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{loading ? 'Loading…' : 'No app usage in the last 24h'}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const barPct = (item.total_ms / maxMs) * 100;
            return (
              <View style={styles.appCard}>
                <View style={styles.appCardLeft}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.appCardInfo}>
                    <Text style={styles.appName} numberOfLines={1}>
                      {item.app_label ?? item.package_name}
                    </Text>
                    <Text style={styles.appPkg} numberOfLines={1}>{item.package_name}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${barPct}%` }]} />
                    </View>
                  </View>
                </View>
                <View style={styles.appCardRight}>
                  <Text style={styles.appTime}>{formatMs(item.total_ms)}</Text>
                  <Text style={styles.sessions}>{item.session_count} sessions</Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#6366f1" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{loading ? 'Loading…' : 'No events'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.eventRow}>
              <View style={styles.eventDot} />
              <View style={styles.eventContent}>
                <Text style={styles.eventApp}>{item.app_label ?? item.package_name}</Text>
                <Text style={styles.eventTime}>
                  {format(new Date(item.started_at), 'HH:mm:ss')}
                  {item.ended_at ? ` → ${format(new Date(item.ended_at), 'HH:mm:ss')}` : ' (active)'}
                  {item.duration_ms ? `  ${formatMs(item.duration_ms)}` : ''}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080812' },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    margin: 16,
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  toggleActive: { backgroundColor: '#6366f1' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#6666aa' },
  toggleTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#444466', fontSize: 14 },
  appCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  appCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#6366f122',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: { fontSize: 12, fontWeight: '800', color: '#6366f1' },
  appCardInfo: { flex: 1 },
  appName: { fontSize: 14, fontWeight: '600', color: '#e0e0ff', marginBottom: 2 },
  appPkg: { fontSize: 11, color: '#444466', marginBottom: 6 },
  barTrack: { height: 3, backgroundColor: '#2a2a4a', borderRadius: 2 },
  barFill: { height: 3, backgroundColor: '#6366f1', borderRadius: 2 },
  appCardRight: { alignItems: 'flex-end', marginLeft: 12 },
  appTime: { fontSize: 16, fontWeight: '800', color: '#6366f1' },
  sessions: { fontSize: 11, color: '#444466', marginTop: 2 },
  eventRow: { flexDirection: 'row', marginBottom: 12 },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
    marginTop: 5,
    marginRight: 12,
  },
  eventContent: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#1a1a2e', paddingBottom: 10 },
  eventApp: { fontSize: 14, fontWeight: '600', color: '#e0e0ff' },
  eventTime: { fontSize: 12, color: '#6666aa', marginTop: 3 },
});
