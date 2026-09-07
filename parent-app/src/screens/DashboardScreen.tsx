/**
 * DashboardScreen.tsx
 *
 * Overview card for the selected child device:
 *  - Online / last-seen status
 *  - Today's top 3 apps by screen time
 *  - Recent links (last 5)
 *  - Latest screenshot thumbnail
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase, Device } from '../lib/supabase';
import { useAppUsage } from '../hooks/useAppUsage';
import { useLinks } from '../hooks/useLinks';
import { useScreenshots } from '../hooks/useScreenshots';

interface Props {
  device: Device;
  onNavigate: (tab: 'usage' | 'links' | 'screenshots') => void;
}

function formatMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default function DashboardScreen({ device, onNavigate }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const { totals, loading: usageLoading, refresh: refreshUsage } = useAppUsage(device.id);
  const { links, loading: linksLoading, refresh: refreshLinks } = useLinks(device.id);
  const { screenshots, loading: ssLoading, refresh: refreshSS } = useScreenshots(device.id);

  const isOnline = device.last_seen
    ? Date.now() - new Date(device.last_seen).getTime() < 5 * 60_000
    : false;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshUsage(), refreshLinks(), refreshSS()]);
    setRefreshing(false);
  }, [refreshUsage, refreshLinks, refreshSS]);

  const latestSS = screenshots[0];
  const top3 = totals.slice(0, 3);
  const recentLinks = links.slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" />
      }
    >
      {/* Device header */}
      <View style={styles.deviceHeader}>
        <View>
          <Text style={styles.deviceName}>{device.device_name}</Text>
          <Text style={styles.deviceMeta}>
            {device.platform.toUpperCase()} ·{' '}
            {device.last_seen
              ? `Last seen ${formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })}`
              : 'Never seen'}
          </Text>
        </View>
        <View style={[styles.onlineBadge, isOnline ? styles.online : styles.offline]}>
          <Text style={styles.onlineText}>{isOnline ? '● Online' : '○ Offline'}</Text>
        </View>
      </View>

      {/* Latest screenshot */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Latest Screenshot</Text>
          <TouchableOpacity onPress={() => onNavigate('screenshots')} accessibilityRole="button">
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {latestSS?.signedUrl ? (
          <TouchableOpacity
            onPress={() => onNavigate('screenshots')}
            style={styles.screenshotCard}
            accessibilityRole="button"
            accessibilityLabel="View latest screenshot"
          >
            <Image
              source={{ uri: latestSS.signedUrl }}
              style={styles.screenshotThumb}
              resizeMode="cover"
            />
            <View style={styles.screenshotMeta}>
              <Text style={styles.ssApp}>{latestSS.context_app ?? 'Unknown app'}</Text>
              <Text style={styles.ssTime}>
                {format(new Date(latestSS.captured_at), 'MMM d, h:mm a')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {ssLoading ? 'Loading…' : 'No screenshots yet'}
            </Text>
          </View>
        )}
      </View>

      {/* Top apps */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Top Apps</Text>
          <TouchableOpacity onPress={() => onNavigate('usage')} accessibilityRole="button">
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {top3.length === 0 && !usageLoading && (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No app usage recorded today</Text></View>
        )}
        {top3.map((app, i) => {
          const maxMs = totals[0]?.total_ms ?? 1;
          const barWidth = (app.total_ms / maxMs) * 100;
          return (
            <View key={app.package_name} style={styles.appRow}>
              <View style={styles.appRank}><Text style={styles.rankNum}>{i + 1}</Text></View>
              <View style={styles.appInfo}>
                <Text style={styles.appLabel} numberOfLines={1}>
                  {app.app_label ?? app.package_name}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${barWidth}%` }]} />
                </View>
              </View>
              <Text style={styles.appTime}>{formatMs(app.total_ms)}</Text>
            </View>
          );
        })}
      </View>

      {/* Recent links */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Links</Text>
          <TouchableOpacity onPress={() => onNavigate('links')} accessibilityRole="button">
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>
        {recentLinks.length === 0 && !linksLoading && (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No links captured yet</Text></View>
        )}
        {recentLinks.map(link => (
          <View key={link.id} style={styles.linkRow}>
            <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
            <Text style={styles.linkTime}>
              {formatDistanceToNow(new Date(link.captured_at), { addSuffix: true })}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080812' },
  content: { padding: 16, paddingBottom: 40 },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  deviceName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  deviceMeta: { fontSize: 12, color: '#6666aa', marginTop: 3 },
  onlineBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  online: { backgroundColor: '#22c55e22' },
  offline: { backgroundColor: '#44444422' },
  onlineText: { fontSize: 12, fontWeight: '700', color: '#e0e0ff' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#e0e0ff' },
  seeAll: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  screenshotCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  screenshotThumb: { width: '100%', height: 180 },
  screenshotMeta: { padding: 12, flexDirection: 'row', justifyContent: 'space-between' },
  ssApp: { fontSize: 13, color: '#aaaacc', fontWeight: '500' },
  ssTime: { fontSize: 12, color: '#6666aa' },
  emptyCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  emptyText: { color: '#444466', fontSize: 14 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  appRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f122',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNum: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  appInfo: { flex: 1, marginRight: 12 },
  appLabel: { fontSize: 14, color: '#ddd', marginBottom: 6 },
  barTrack: { height: 4, backgroundColor: '#2a2a4a', borderRadius: 2 },
  barFill: { height: 4, backgroundColor: '#6366f1', borderRadius: 2 },
  appTime: { fontSize: 13, fontWeight: '700', color: '#6366f1', minWidth: 36, textAlign: 'right' },
  linkRow: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  linkUrl: { fontSize: 13, color: '#7ea6ff', marginBottom: 4 },
  linkTime: { fontSize: 11, color: '#444466' },
});
