/**
 * AuthScreen.tsx — Parent app sign-in / sign-up
 *
 * On success, creates a 'parent' role profile if first login,
 * then navigates to the dashboard.
 */

import React, { useState } from 'react';
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
import { supabase } from '../lib/supabase';

interface Props {
  onAuthenticated: () => void;
}

export default function AuthScreen({ onAuthenticated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const uid = data.user?.id;
        if (uid) {
          await supabase.from('profiles').insert({ id: uid, role: 'parent' });
        }
      }
      onAuthenticated();
    } catch (err: any) {
      Alert.alert('Auth Error', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Logo / branding */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🛡️</Text>
          </View>
          <Text style={styles.appName}>WatchdogParent</Text>
          <Text style={styles.tagline}>Keep your child safe, in real time.</Text>
        </View>

        {/* Tab toggle */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'signin' && styles.tabActive]}
            onPress={() => setMode('signin')}
            accessibilityRole="tab"
            accessibilityLabel="Sign in tab"
          >
            <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => setMode('signup')}
            accessibilityRole="tab"
            accessibilityLabel="Create account tab"
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="parent@example.com"
          placeholderTextColor="#444466"
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
          placeholderTextColor="#444466"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password input"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={mode === 'signin' ? 'Sign in button' : 'Create account button'}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>
                {mode === 'signin' ? 'Sign In →' : 'Create Account →'}
              </Text>}
        </TouchableOpacity>

        <Text style={styles.fine}>
          Your data is end-to-end secured via Supabase Row Level Security.
          Only you can read your child's activity.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080812' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  brand: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366f122',
    borderWidth: 2,
    borderColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: '#6666aa', marginTop: 4 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6666aa' },
  tabTextActive: { color: '#fff' },
  label: { fontSize: 12, color: '#6666aa', marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  fine: { fontSize: 11, color: '#333355', marginTop: 24, textAlign: 'center', lineHeight: 17 },
});
