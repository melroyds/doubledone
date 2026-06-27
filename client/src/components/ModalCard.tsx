import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

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
      <View style={styles.root}>
        {/* The scrim is a SIBLING of the card (an absolute-fill dismiss layer BEHIND it), never its parent,
            so the card's interactive content is not a <button> nested inside the scrim <button> (invalid HTML
            and a hydration error on web). The card sits on top, so taps on it don't reach the scrim, no
            tap-absorbing inner Pressable needed. */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={dismissLabel} />
        <View style={[scroll ? styles.cardScroll : styles.card, { maxWidth }, maxHeight != null ? { maxHeight } : null]}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.five,
    },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.scrim },
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
