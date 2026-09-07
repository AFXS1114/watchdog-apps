/**
 * SetupScreen.tsx
 *
 * Handles device pairing: the child signs in (or creates an account),
 * generates a 6-digit pairing code, and waits for the parent to enter
 * it in the parent app. Once paired, navigates to PermissionsScreen.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { supabase } from '../lib/supabase';

interface Props {
  onPaired: (deviceId: string) => void;
}

type Step = 'auth' | 'pairing';

export default function SetupScreen({ onPaired }: Props) {
  const [step, setStep] = useState<Step>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Step 1: Authenticate the child account ──────────────────────────────

  const handleAuth = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      // Try sign-in first; fall back to sign-up
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error?.message?.toLowerCase().includes('invalid login')) {
        const signUp = await supabase.auth.signUp({ email, password });
        if (signUp.error) throw signUp.error;
        // Create profile
        const uid = signUp.data.user?.id;
        if (uid) {
          await supabase.from('profiles').insert({ id: uid, role: 'child' });
        }
      } else if (error) {
        throw error;
      }

      // Generate pairing code and register device
      await generatePairingCode();
      setStep('pairing');
    } catch (err: any) {
      Alert.alert('Auth Error', err.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }, [email, password]);

  // ── Step 2: Register device + generate pairing code ──────────────────────

  const generatePairingCode = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const deviceName = await DeviceInfo.getDeviceName();
    const platform = Platform.OS as 'android' | 'ios';

    // Upsert device row (child creates it; parent will claim it via pairing_code)
    const { data, error } = await supabase
      .from('devices')
      .insert({
        child_user_id: user.id,
        parent_user_id: user.id, // temporary — overwritten when parent claims
        device_name: deviceName,
        platform,
        pairing_code: code,
      })
      .select('id')
      .single();

    if (error) throw error;
    setPairingCode(code);
    setDeviceId(data.id);
  }, []);

  // ── Poll for parent claim ─────────────────────────────────────────────────

  const checkPaired = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('devices')
        .select('paired_at, parent_user_id, child_user_id')
        .eq('id', deviceId)
        .single();

      if (data?.paired_at) {
        onPaired(deviceId);
      } else {
        Alert.alert('Not Yet', 'The parent has not entered the pairing code yet.');
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, onPaired]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'auth') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>WatchdogChild</Text>
          <Text style={styles.subtitle}>Sign in to activate monitoring</Text>

          <Text style={styles.label}>Child account email</Text>
          <TextInput
            style={styles.input}
            placeholder="child@example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Email input"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password input"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Continue button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Continue →</Text>}
          </TouchableOpacity>

          <Text style={styles.hint}>
            New accounts are created automatically on first sign-in.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Pairing code display
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Pair With Parent</Text>
        <Text style={styles.subtitle}>
          Give this code to the parent to enter in the WatchdogParent app:
        </Text>

        <View style={styles.codeBox}>
          {pairingCode?.split('').map((digit, i) => (
            <View key={i} style={styles.digitBox}>
              <Text style={styles.digit}>{digit}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.hint}>
          Keep this screen open while the parent enters the code.
          The code is valid for this session only.
        </Text>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={checkPaired}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Check pairing status"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Check pairing status</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={generatePairingCode}
          accessibilityRole="button"
          accessibilityLabel="Generate new code"
        >
          <Text style={styles.linkText}>Generate new code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#8888aa', marginBottom: 32, lineHeight: 20 },
  label: { fontSize: 13, color: '#8888aa', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { fontSize: 12, color: '#555577', marginTop: 16, textAlign: 'center', lineHeight: 18 },
  codeBox: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 32,
  },
  digitBox: {
    width: 48,
    height: 60,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 28, fontWeight: '800', color: '#6366f1' },
  linkButton: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#6366f188', fontSize: 13 },
});
