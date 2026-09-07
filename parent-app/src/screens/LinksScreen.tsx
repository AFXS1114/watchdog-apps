/**
 * LinksScreen.tsx
 *
 * Paginated list of all captured URLs for the child device.
 * Supports infinite scroll and realtime new-link inserts.
 */

import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Linking,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { formatDistanceToNow, format } from 'date-fns';
import { useLinks } from '../hooks/useLinks';
import type { LinkEvent } from '../lib/supabase';

interface Props { deviceId: string }

const SOURCE_LABELS: Record<string, string> = {
  accessibility: 'Browser bar',
  custom_browser: 'In-app browser',
  vpn: 'VPN intercept',
};

function LinkItem({ item }: { item: LinkEvent }) {
  const handleOpen = () => {
    Linking.openURL(item.url).catch(() => {});
  };

  let hostname = item.url;
  try { hostname = new URL(item.url).hostname; } catch {}

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handleOpen}
      accessibilityRole="link"
      accessibilityLabel={`Open ${item.url}`}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <View style={styles.sourcePill}>
          <Text style={styles.sourceText}>
            {SOURCE_LABELS[item.source ?? ''] ?? item.source ?? 'Unknown'}
          </Text>
        </View>
        <Text style={styles.timeText}>
          {formatDistanceToNow(new Date(item.captured_at), { addSuffix: true })}
        </Text>
      </View>

      <Text style={styles.hostname} numberOfLines={1}>{hostname}</Text>
      <Text style={styles.fullUrl} numberOfLines={2}>{item.url}</Text>

      {item.page_title && (
        <Text style={styles.pageTitle} numberOfLines={1}>{item.page_title}</Text>
      )}

      {item.context_app && (
        <Text style={styles.contextApp}>via {item.context_app}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function LinksScreen({ deviceId }: Props) {
  const { links, loading, error, hasMore, loadMore, refresh } = useLinks(deviceId);

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        {loading
          ? <ActivityIndicator color="#6366f1" />
          : <TouchableOpacity onPress={loadMore} accessibilityRole="button">
              <Text style={styles.loadMoreText}>Load more</Text>
            </TouchableOpacity>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}
      <FlatList
        data={links}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <LinkItem item={item} />}
        ListEmptyComponent={
          !loading
            ? <View style={styles.empty}><Text style={styles.emptyText}>No links captured yet</Text></View>
            : null
        }
        ListHeaderComponent={
          <Text style={styles.header}>
            {links.length} URL{links.length !== 1 ? 's' : ''} captured
          </Text>
        }
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl refreshing={loading && links.length === 0} onRefresh={refresh} tintColor="#6366f1" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080812' },
  list: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 13, color: '#444466', marginBottom: 12 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sourcePill: {
    backgroundColor: '#6366f122',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  sourceText: { fontSize: 11, color: '#7ea6ff', fontWeight: '600' },
  timeText: { fontSize: 11, color: '#444466' },
  hostname: { fontSize: 15, fontWeight: '700', color: '#e0e0ff', marginBottom: 3 },
  fullUrl: { fontSize: 12, color: '#6666aa', lineHeight: 17, marginBottom: 4 },
  pageTitle: { fontSize: 12, color: '#aaaacc', fontStyle: 'italic', marginTop: 2 },
  contextApp: { fontSize: 11, color: '#333355', marginTop: 4 },
  footer: { paddingVertical: 20, alignItems: 'center' },
  loadMoreText: { color: '#6366f1', fontWeight: '600', fontSize: 14 },
  empty: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#444466', fontSize: 14 },
  errorBanner: { backgroundColor: '#ff000022', padding: 10, margin: 12, borderRadius: 8 },
  errorText: { color: '#ff6666', fontSize: 13 },
});
