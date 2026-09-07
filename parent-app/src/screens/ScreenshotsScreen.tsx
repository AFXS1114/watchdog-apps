/**
 * ScreenshotsScreen.tsx
 *
 * Masonry-style grid of screenshot thumbnails. Tapping opens a full-screen
 * lightbox viewer (react-native-image-viewing). Supports infinite scroll
 * and pull-to-refresh via the useScreenshots hook.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import ImageViewing from 'react-native-image-viewing';
import { format } from 'date-fns';
import { useScreenshots } from '../hooks/useScreenshots';
import type { Screenshot } from '../lib/supabase';

interface Props { deviceId: string }

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLS = 2;
const GAP = 10;
const THUMB_SIZE = (SCREEN_WIDTH - 32 - GAP) / COLS;

export default function ScreenshotsScreen({ deviceId }: Props) {
  const { screenshots, loading, error, hasMore, loadMore, refresh } = useScreenshots(deviceId);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  // Build image source array for the lightbox
  const imageUris = screenshots
    .filter(s => !!s.signedUrl)
    .map(s => ({ uri: s.signedUrl! }));

  const renderItem = ({ item, index }: { item: Screenshot; index: number }) => {
    const col = index % COLS;
    return (
      <TouchableOpacity
        style={[
          styles.thumb,
          { marginLeft: col === 0 ? 0 : GAP },
        ]}
        onPress={() => openViewer(index)}
        activeOpacity={0.85}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Screenshot from ${format(new Date(item.captured_at), 'MMM d, h:mm a')}`}
      >
        {item.signedUrl ? (
          <Image
            source={{ uri: item.signedUrl }}
            style={styles.thumbImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Text style={styles.thumbPlaceholderText}>⏳</Text>
          </View>
        )}
        <View style={styles.thumbOverlay}>
          <Text style={styles.thumbApp} numberOfLines={1}>
            {item.context_app?.split('.').pop() ?? '?'}
          </Text>
          <Text style={styles.thumbTime}>
            {format(new Date(item.captured_at), 'HH:mm')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!hasMore) return <View style={{ height: 20 }} />;
    return (
      <View style={styles.footer}>
        {loading
          ? <ActivityIndicator color="#6366f1" />
          : (
            <TouchableOpacity onPress={loadMore} accessibilityRole="button">
              <Text style={styles.loadMore}>Load more</Text>
            </TouchableOpacity>
          )}
      </View>
    );
  };

  // Group items into pairs for the 2-column layout
  const rows: Screenshot[][] = [];
  for (let i = 0; i < screenshots.length; i += COLS) {
    rows.push(screenshots.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        numColumns={1}
        refreshControl={
          <RefreshControl
            refreshing={loading && screenshots.length === 0}
            onRefresh={refresh}
            tintColor="#6366f1"
          />
        }
        ListHeaderComponent={
          <Text style={styles.header}>
            {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''}
          </Text>
        }
        ListEmptyComponent={
          !loading
            ? <View style={styles.empty}><Text style={styles.emptyText}>No screenshots yet</Text></View>
            : <View style={styles.empty}><ActivityIndicator color="#6366f1" /></View>
        }
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item: row, index: rowIndex }) => (
          <View style={styles.row}>
            {row.map((item, col) => renderItem({ item, index: rowIndex * COLS + col }))}
          </View>
        )}
      />

      {/* Full-screen lightbox */}
      <ImageViewing
        images={imageUris}
        imageIndex={viewerIndex}
        visible={viewerOpen}
        onRequestClose={() => setViewerOpen(false)}
        FooterComponent={({ imageIndex }) => {
          const ss = screenshots[imageIndex];
          if (!ss) return null;
          return (
            <View style={styles.viewerFooter}>
              <Text style={styles.viewerApp}>{ss.context_app ?? 'Unknown app'}</Text>
              <Text style={styles.viewerTime}>
                {format(new Date(ss.captured_at), 'EEEE, MMM d · h:mm:ss a')}
              </Text>
              {ss.file_size_bytes && (
                <Text style={styles.viewerSize}>
                  {(ss.file_size_bytes / 1024).toFixed(1)} KB · {ss.width_px}×{ss.height_px}
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080812' },
  list: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 13, color: '#444466', marginBottom: 14 },
  row: { flexDirection: 'row', marginBottom: GAP },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  thumbPlaceholderText: { fontSize: 24 },
  thumbOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  thumbApp: { fontSize: 11, color: '#ddd', fontWeight: '600' },
  thumbTime: { fontSize: 10, color: '#aaa', marginTop: 1 },
  footer: { paddingVertical: 20, alignItems: 'center' },
  loadMore: { color: '#6366f1', fontWeight: '600', fontSize: 14 },
  empty: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#444466', fontSize: 14 },
  errorBanner: { backgroundColor: '#ff000022', padding: 10, margin: 12, borderRadius: 8 },
  errorText: { color: '#ff6666', fontSize: 13 },
  viewerFooter: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
  },
  viewerApp: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  viewerTime: { fontSize: 13, color: '#aaa' },
  viewerSize: { fontSize: 11, color: '#666', marginTop: 4 },
});
