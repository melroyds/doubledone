// RoomsSheet.tsx — the "Rooms" navigation sheet (the "Dusk, evolved" redesign, slice 4).
// Today's header used to carry four links (Repeating, Routines, Lookback, Settings) beside
// the date, which wrapped on narrow phones. They collapse into one "Rooms" pill that opens
// this calm bottom sheet. A gentle fade, tap a room to go, tap the scrim to close. No new
// destinations, just a tidier door to the existing ones.

import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, PREMIUM_GRADIENT, radius, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  visible: boolean;
  onClose: () => void;
  onRepeating: () => void;
  onRoutines: () => void;
  onLookback: () => void;
  onChart: () => void;
  onSettings: () => void;
};

export function RoomsSheet({ visible, onClose, onRepeating, onRoutines, onLookback, onChart, onSettings }: Props) {
  const styles = useThemedStyles(makeStyles);
  // Close first, then navigate, so the sheet is already gone when the destination arrives.
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const rooms: { key: string; label: string; hint: string; onPress: () => void; premium?: boolean }[] = [
    { key: 'repeating', label: 'Repeating', hint: 'Tasks that come back', onPress: go(onRepeating) },
    { key: 'routines', label: 'Routines', hint: 'Gentle rituals, no streaks', onPress: go(onRoutines) },
    { key: 'lookback', label: 'Lookback', hint: 'Everything you finished', onPress: go(onLookback) },
    { key: 'chart', label: 'Chart a course', hint: 'Plan toward a goal', onPress: go(onChart), premium: true },
    { key: 'settings', label: 'Settings', hint: 'Comfort, access, your data', onPress: go(onSettings) },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close rooms">
        {/* Absorb taps on the sheet itself so only the scrim closes it. */}
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Rooms</Text>
          {rooms.map((r) => (
            <Pressable
              key={r.key}
              onPress={r.onPress}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              style={({ pressed }) => [styles.room, pressed && styles.roomPressed]}
            >
              <View style={styles.dot} />
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
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.five,
      paddingTop: spacing.five,
      paddingBottom: spacing.seven,
    },
    title: { fontFamily: fonts.sans, fontSize: 22 * t.scale, color: t.colors.ink, marginBottom: spacing.three },
    room: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, paddingVertical: spacing.three },
    roomPressed: { opacity: 0.6 },
    dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: t.colors.accent },
    roomText: { flex: 1 },
    roomLabel: { fontFamily: fonts.body, fontSize: 17 * t.scale, color: t.colors.ink },
    roomHint: { fontFamily: fonts.body, fontSize: 13 * t.scale, color: t.colors.inkSoft, marginTop: 2 },
    premiumTag: { borderRadius: radius.pill, overflow: 'hidden' },
    premiumTagGrad: { paddingHorizontal: spacing.three, paddingVertical: 3 },
    premiumTagText: { fontFamily: fonts.bodyBold, fontWeight: '700', fontSize: 11 * t.scale, color: '#FFFFFF', letterSpacing: 0.3 },
  });
