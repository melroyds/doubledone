import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

type Phase = 'email' | 'code' | 'done';

// Optional cloud sync sign-in. Passwordless: we email a 6-digit code and verify
// it. Calm and skippable, the app works fully without ever coming here. The live
// send/verify (which emails a real inbox) is Melroy's to exercise end to end.
export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goBack() {
    router.back();
  }

  // After a successful sign-in, hold the "Signed in" beat briefly, then return to
  // Today on its own. The button is there for anyone who would rather not wait.
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => router.back(), 1600);
    return () => clearTimeout(timer);
  }, [phase, router]);

  async function sendCode() {
    const addr = email.trim();
    if (!addr || busy) return;
    if (!supabase) {
      setError('Sync is not set up on this build.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      track('auth.code_sent');
      setPhase('code');
    } catch {
      // Never leak a raw provider error onto this anxiety-prone screen (the never-alarm spine): a calm fixed line only.
      setError('Could not send the code. Check the address and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const token = code.trim();
    if (!token || busy || !supabase) return;
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      });
      if (err) throw err;
      track('auth.signed_in');
      setPhase('done');
    } catch {
      setError('That code did not work. Check it, or send a new one.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.six }]}>
      <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8}>
        <Text style={styles.cancel}>Not now</Text>
      </Pressable>

      <Text style={styles.title}>Sync across devices</Text>
      <Text style={styles.sub}>
        Optional. Your tasks stay on this device until you sign in. We email a 6-digit code, no
        password to remember.
      </Text>

      {phase === 'email' && (
        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.inkFaint}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            accessibilityLabel="Email address"
          />
          <PrimaryButton
            label="Email me a code"
            onPress={sendCode}
            loading={busy}
            accessibilityLabel="Email me a code"
          />
        </View>
      )}

      {phase === 'code' && (
        <View style={styles.form}>
          <Text style={styles.sentTo}>We sent a code to {email.trim()}.</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            editable={!busy}
            placeholder="6-digit code"
            placeholderTextColor={theme.colors.inkFaint}
            style={styles.input}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            accessibilityLabel="Code from your email"
          />
          <PrimaryButton label="Sign in" onPress={verify} loading={busy} accessibilityLabel="Sign in" />
          <Pressable
            onPress={() => {
              setPhase('email');
              setCode('');
              setError(null);
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Use a different email"
          >
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.form}>
          <Text style={styles.success}>Signed in</Text>
          <Text style={styles.sub}>You&apos;re synced as {email.trim()}. Taking you back to today.</Text>
          <PrimaryButton label="Back to Today" onPress={goBack} accessibilityLabel="Back to Today" />
        </View>
      )}

      {error && phase !== 'done' && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: t.colors.bg,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.five,
  },
  cancel: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, marginBottom: spacing.six },
  title: {
    ...t.type.heading,
    color: t.colors.ink,
    letterSpacing: -0.5,
  },
  sub: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 23 * t.scale, marginTop: spacing.three },
  form: { gap: spacing.three, marginTop: spacing.six },
  sentTo: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body },
  success: { color: t.colors.done, fontSize: 26 * t.scale, fontWeight: '600', fontFamily: fonts.sans, letterSpacing: -0.3 },
  input: {
    backgroundColor: t.colors.surface,
    borderWidth: border.hair,
    borderColor: t.colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.four,
    paddingVertical: spacing.three,
    fontSize: 16 * t.scale,
    fontFamily: fonts.body,
    color: t.colors.ink,
  },
  link: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.two },
  error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.four },
});
