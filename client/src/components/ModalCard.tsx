import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { radius, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  animationType?: 'fade' | 'slide' | 'none';
  dismissLabel?: string;
  // The card lays out its own children (padding + gap) by default, matching the dominant
  // hand-rolled scaffold. A card that hosts its own ScrollView (which does the padding and
  // needs a viewport-relative cap) opts out of the padding and passes a maxHeight instead.
  scroll?: boolean;
  maxHeight?: ViewStyle['maxHeight'];
};

// The centred modal-card scaffold: a transparent Modal, a scrim backdrop that closes on tap,
// and a tap-absorbing centred card. This was rebuilt by hand across half a dozen files (the
// same Modal + backdrop Pressable + inner card Pressable, the inner one swallowing presses so
// only the scrim dismisses). One source of truth for that structure. The backdrop colour
// (t.colors.scrim) was already unified in a prior wave; this dedups the structure.
//
// The card keeps the dominant scaffold's look exactly: warm-paper (bg) surface, large radius,
// six-step padding and a three-step gap between children. A scroll-host card (a card whose
// child is a ScrollView) passes `scroll` to drop the padding (its ScrollView pads itself) and
// a `maxHeight` so it stays inside the viewport.
export function ModalCard({
  visible,
  onClose,
  children,
  maxWidth = 420,
  animationType = 'fade',
  dismissLabel = 'Dismiss',
  scroll = false,
  maxHeight,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal transparent visible={visible} animationType={animationType} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={dismissLabel}>
        <Pressable
          style={[scroll ? styles.cardScroll : styles.card, { maxWidth }, maxHeight != null ? { maxHeight } : null]}
          onPress={() => {}}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.five,
    },
    card: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      padding: spacing.six,
      width: '100%',
      gap: spacing.three,
      alignSelf: 'center',
    },
    // A card that hosts its own ScrollView: no padding (the ScrollView's contentContainer does it)
    // and no gap (the scroll content spaces itself), so the scaffold matches the Break-it-down cards.
    cardScroll: {
      backgroundColor: t.colors.bg,
      borderRadius: radius.lg,
      width: '100%',
      alignSelf: 'center',
    },
  });
