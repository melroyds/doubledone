// RoomsSheet.tsx — the "Rooms" navigation sheet (the "Dusk, evolved" redesign, slice 4).
// Today's header used to carry four links (Repeating, Routines, Lookback, Settings) beside
// the date, which wrapped on narrow phones. They collapse into one "Rooms" pill that opens
// this calm bottom sheet. A gentle fade, tap a room to go, tap the scrim to close. No new
// destinations, just a tidier door to the existing ones.

import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, layout, PREMIUM_GRADIENT, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { useSettings, useThemedStyles } from '@/lib/theme-provider';

type Props = {
  visible: boolean;
  onClose: () => void;
  onRepeating: () => void;
  onRoutines: () => void;
  onLookback: () => void;
  onChart: () => void;
  onPremium: () => void;
  onSettings: () => void;
  premium: boolean;
};

export function RoomsSheet({ visible, onClose, onRepeating, onRoutines, onLookback, onChart, onPremium, onSettings, premium }: Props) {
  const styles = useThemedStyles(makeStyles);
  const aiEnabled = useSettings().settings.aiEnabled; // hides the AI-only rooms (Chart a course) when AI is off
  // Close first, then navigate, so the sheet is already gone when the destination arrives.
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // A persistent door to the Premium offer (the audit gap: a willing buyer could only find it at the bottom of
  // Settings). A gradient dot marks it as the one special row; it routes to /premium, which itself shows the
  // offer to a free user and a manage view to a subscriber. Never a hard sell, just findable.
  const rooms: { key: string; label: string; hint: string; onPress: () => void; premium?: boolean; gradient?: boolean; ai?: boolean }[] = [
    { key: 'repeating', label: 'Repeating', hint: 'Tasks that come back', onPress: go(onRepeating) },
    { key: 'routines', label: 'Routines', hint: 'Gentle rituals, no streaks', onPress: go(onRoutines) },
    { key: 'lookback', label: 'Lookback', hint: 'Everything you finished', onPress: go(onLookback) },
    { key: 'chart', label: 'Chart a course', hint: 'Plan toward a goal', onPress: go(onChart), premium: true, ai: true },
    {
      key: 'premium',
      label: 'Premium',
      hint: premium ? 'Manage your subscription' : 'Keepsakes, more AI, your colour',
      onPress: go(onPremium),
      gradient: true,
    },
    { key: 'settings', label: 'Settings', hint: 'Comfort, access, your data', onPress: go(onSettings) },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* The scrim is a SIBLING of the sheet (an absolute-fill dismiss layer behind it), never its parent,
            so the room buttons are not <button>s nested inside the scrim <button> (invalid HTML on web). The
            sheet sits on top, so taps on it don't reach the scrim. */}
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Menu</Text>
          {rooms.filter((r) => aiEnabled || !r.ai).map((r) => (
            <Pressable
              key={r.key}
              onPress={r.onPress}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              style={({ pressed }) => [styles.room, pressed && styles.roomPressed]}
            >
              {r.gradient ? (
                <LinearGradient colors={PREMIUM_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dot} />
              ) : (
                <View style={styles.dot} />
              )}
              <View style={styles.roomText}>
                <Text style={styles.roomLabel}>{r.label}</Text>
                <Text style={styles.roomHint}>{r.hint}</Text>
              </View>
              {r.premium && (
                <View style={styles.premiumTag}>
                  <LinearGradient colors={PREMIUM_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premiumTagGrad}>
                    <Text style={styles.premiumTagText}>Premium</Text>
                  </LinearGradient>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
    sheet: {
      backgroundColor: t.colors.surface,
      // Cap the sheet to the app's canonical content width (560, like Today / Settings / Premium) and centre
      // it, so on a wide desktop the rows stop stretching edge-to-edge and the trailing "Premium" pill sits
      // beside "Chart a course" instead of being flung to the far edge. On a phone, 560 exceeds the viewport
      // so width:'100%' wins and the sheet stays full-bleed (the look that already reads well on mobile).
      width: '100%',
      maxWidth: layout.maxContentWidth,
      alignSelf: 'center',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.five,
      paddingTop: spacing.five,
      paddingBottom: spacing.seven,
    },
    title: { ...t.type.subheading, color: t.colors.ink, marginBottom: spacing.three },
    room: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, paddingVertical: spacing.three },
    roomPressed: { opacity: PRESSED_OPACITY },
    dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: t.colors.accent },
    roomText: { flex: 1 },
    roomLabel: { fontFamily: fonts.body, fontSize: 17 * t.scale, color: t.colors.ink },
    roomHint: { fontFamily: fonts.body, fontSize: 13 * t.scale, color: t.colors.inkSoft, marginTop: spacing.half },
    premiumTag: { borderRadius: radius.pill, overflow: 'hidden' },
    premiumTagGrad: { paddingHorizontal: spacing.three, paddingVertical: 3 },
    premiumTagText: { fontFamily: fonts.bodyBold, fontWeight: '700', fontSize: 11 * t.scale, color: '#FFFFFF', letterSpacing: 0.3 },
  });
