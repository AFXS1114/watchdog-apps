/**
 * App.tsx — WatchdogParent Entry Point
 *
 * Provides:
 *  - Authentication state handling (AuthScreen vs Dashboard/Tabs)
 *  - Device management & device selector
 *  - 6-digit pairing code claiming modal
 *  - Tab navigation (Dashboard, Usage, Screenshots, Links)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { supabase, Device } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AppUsageScreen from './src/screens/AppUsageScreen';
import ScreenshotsScreen from './src/screens/ScreenshotsScreen';
import LinksScreen from './src/screens/LinksScreen';

type Tab = 'dashboard' | 'usage' | 'screenshots' | 'links';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDevice] = useState<Device | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Modal states
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [deviceSelectorOpen, setDeviceSelectorOpen] = useState(false);

  // ── Auth session check ────────────────────────────────────────────────────

  const fetchDevices = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('parent_user_id', userId)
      .not('paired_at', 'is', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDevices(data as Device[]);
      if (data.length > 0) {
        // Keep currently selected device if valid, else pick first
        setActiveDevice(prev => {
          if (prev && data.some(d => d.id === prev.id)) {
            return data.find(d => d.id === prev.id) || data[0];
          }
          return data[0];
        });
      } else {
        setActiveDevice(null);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchDevices(s.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        if (s?.user) {
          fetchDevices(s.user.id);
        } else {
          setDevices([]);
          setActiveDevice(null);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [fetchDevices]);

  // ── Claim pairing code ───────────────────────────────────────────────────

  const handleClaimPairingCode = async () => {
    const code = pairingCodeInput.trim();
    if (!code || code.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-digit pairing code.');
      return;
    }
    if (!session?.user?.id) return;

    setPairingLoading(true);
    try {
      // Find unassigned device matching code
      const { data, error: findError } = await supabase
        .from('devices')
        .select('*')
        .eq('pairing_code', code)
        .is('paired_at', null)
        .single();

      if (findError || !data) {
        Alert.alert(
          'Pairing Failed',
          'Code not found or expired. Ensure the child app is showing the code screen.',
        );
        return;
      }

      // Claim device for current parent user
      const { error: updateError } = await supabase
        .from('devices')
        .update({
          parent_user_id: session.user.id,
          paired_at: new Date().toISOString(),
          pairing_code: null,
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      Alert.alert('Success!', `Successfully paired with ${data.device_name}`);
      setPairingCodeInput('');
      setPairingModalOpen(false);
      await fetchDevices(session.user.id);
    } catch (err: any) {
      Alert.alert('Pairing Error', err.message ?? 'Failed to pair device.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // ── Render loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <StatusBar barStyle="light-content" backgroundColor="#080812" />
        <ActivityIndicator size="large" color="#6366f1" />
      </SafeAreaView>
    );
  }

  // ── Render unauthenticated ────────────────────────────────────────────────

  if (!session) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#080812" />
        <AuthScreen onAuthenticated={() => {}} />
      </SafeAreaView>
    );
  }

  // ── Render main dashboard UI ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#080812" />

      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLogo}>🛡️ Watchdog</Text>

          {/* Device Selector Button */}
          {devices.length > 0 && (
            <TouchableOpacity
              style={styles.devicePickerBtn}
              onPress={() => setDeviceSelectorOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Select device"
            >
              <Text style={styles.devicePickerText} numberOfLines={1}>
                {activeDevice?.device_name ?? 'Select Device'} ▼
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.pairBtn}
            onPress={() => setPairingModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pair new device"
          >
            <Text style={styles.pairBtnText}>+ Pair</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main View Area */}
      <View style={styles.content}>
        {devices.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyEmoji}>📱</Text>
            </View>
            <Text style={styles.emptyTitle}>No Devices Paired</Text>
            <Text style={styles.emptyBody}>
              Open WatchdogChild on your child's phone, sign in to generate a 6-digit
              pairing code, then tap below to enter it.
            </Text>
            <TouchableOpacity
              style={styles.primaryPairBtn}
              onPress={() => setPairingModalOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryPairText}>Enter 6-Digit Code →</Text>
            </TouchableOpacity>
          </View>
        ) : activeDevice ? (
          <>
            {activeTab === 'dashboard' && (
              <DashboardScreen
                device={activeDevice}
                onNavigate={t => {
                  if (t === 'usage') setActiveTab('usage');
                  if (t === 'links') setActiveTab('links');
                  if (t === 'screenshots') setActiveTab('screenshots');
                }}
              />
            )}
            {activeTab === 'usage' && <AppUsageScreen deviceId={activeDevice.id} />}
            {activeTab === 'screenshots' && (
              <ScreenshotsScreen deviceId={activeDevice.id} />
            )}
            {activeTab === 'links' && <LinksScreen deviceId={activeDevice.id} />}
          </>
        ) : null}
      </View>

      {/* Bottom Tab Bar */}
      {devices.length > 0 && activeDevice && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'dashboard' && styles.tabItemActive]}
            onPress={() => setActiveTab('dashboard')}
            accessibilityRole="tab"
          >
            <Text style={styles.tabIcon}>📊</Text>
            <Text style={[styles.tabLabel, activeTab === 'dashboard' && styles.tabLabelActive]}>
              Overview
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'usage' && styles.tabItemActive]}
            onPress={() => setActiveTab('usage')}
            accessibilityRole="tab"
          >
            <Text style={styles.tabIcon}>⏳</Text>
            <Text style={[styles.tabLabel, activeTab === 'usage' && styles.tabLabelActive]}>
              Usage
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'screenshots' && styles.tabItemActive]}
            onPress={() => setActiveTab('screenshots')}
            accessibilityRole="tab"
          >
            <Text style={styles.tabIcon}>🖼️</Text>
            <Text style={[styles.tabLabel, activeTab === 'screenshots' && styles.tabLabelActive]}>
              Screenshots
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'links' && styles.tabItemActive]}
            onPress={() => setActiveTab('links')}
            accessibilityRole="tab"
          >
            <Text style={styles.tabIcon}>🌐</Text>
            <Text style={[styles.tabLabel, activeTab === 'links' && styles.tabLabelActive]}>
              Links
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pairing Modal */}
      <Modal visible={pairingModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pair Child Device</Text>
            <Text style={styles.modalSub}>
              Enter the 6-digit code displayed on the child app screen:
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="123456"
              placeholderTextColor="#444466"
              keyboardType="number-pad"
              maxLength={6}
              value={pairingCodeInput}
              onChangeText={setPairingCodeInput}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPairingModalOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitPairBtn, pairingLoading && styles.disabledBtn]}
                onPress={handleClaimPairingCode}
                disabled={pairingLoading}
                accessibilityRole="button"
              >
                {pairingLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitPairText}>Connect →</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Device Selector Modal */}
      <Modal visible={deviceSelectorOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDeviceSelectorOpen(false)}
        >
          <View style={styles.deviceListCard}>
            <Text style={styles.modalTitle}>Select Child Device</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {devices.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.deviceOptionRow,
                    activeDevice?.id === d.id && styles.deviceOptionSelected,
                  ]}
                  onPress={() => {
                    setActiveDevice(d);
                    setDeviceSelectorOpen(false);
                  }}
                >
                  <Text style={styles.deviceOptionName}>{d.device_name}</Text>
                  <Text style={styles.deviceOptionSub}>
                    {d.platform.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080812' },
  loadingRoot: { flex: 1, backgroundColor: '#080812', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#121224',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerLogo: { fontSize: 16, fontWeight: '800', color: '#fff' },
  devicePickerBtn: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    maxWidth: 140,
  },
  devicePickerText: { fontSize: 12, fontWeight: '600', color: '#6366f1' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairBtn: {
    backgroundColor: '#6366f122',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6366f166',
  },
  pairBtnText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  signOutBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  signOutText: { color: '#6666aa', fontSize: 12, fontWeight: '600' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#121224',
    borderTopWidth: 1,
    borderTopColor: '#2a2a4a',
    paddingVertical: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabItemActive: { opacity: 1 },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 11, color: '#6666aa', marginTop: 2, fontWeight: '500' },
  tabLabelActive: { color: '#6366f1', fontWeight: '700' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#8888aa', textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  primaryPairBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryPairText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#8888aa', marginBottom: 20, lineHeight: 18 },
  codeInput: {
    backgroundColor: '#080812',
    borderRadius: 12,
    paddingVertical: 16,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    color: '#6366f1',
    borderWidth: 1,
    borderColor: '#6366f166',
    marginBottom: 24,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  cancelText: { color: '#8888aa', fontWeight: '600', fontSize: 14 },
  submitPairBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  disabledBtn: { opacity: 0.5 },
  submitPairText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deviceListCard: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  deviceOptionRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#121224',
  },
  deviceOptionSelected: { borderColor: '#6366f1', borderWidth: 1 },
  deviceOptionName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deviceOptionSub: { color: '#6366f1', fontSize: 11, fontWeight: '700' },
});
