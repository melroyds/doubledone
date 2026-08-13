// CheckCircle.tsx — the round sage completion check, shared. A circular outline that, when
// done, fills sage with a white tick. TaskRow (its default + suggest rows) and BreakdownReview
// rendered this inline near-identically; extracted here so the one canonical look can't drift.
// The genuinely-different marks (chart's rounded-square select, routines' square box, welcome's
// hollow bullet, the multi-select dot) are deliberately NOT this and stay where they are.

import { StyleSheet, Text, View } from 'react-native';

import { border, control, fonts, radius, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

type Props = {
  done: boolean;
  size?: number;
  /**
   * This row cannot be ticked right now, so the control must LOOK like it cannot.
   *
   * TaskRow has always removed the handler for an inert row and suppressed its press animation, and
   * the circle went on rendering identically to a live one. So a repeat on its off day, or any row
   * on a closed list, offered a control that looked exactly as tappable as every other and did
   * nothing. Melroy, on a shared repeat: "the circle isn't faded. It looks clickable but actually
   * isn't."
   *
   * The rule was already written down three lines from the code that ignored it: "the control keeps
   * its place at lowered contrast; the line below says why. Never absent, never locked." Stated,
   * never implemented, which is the third time today.
   */
  dim?: boolean;
};

export function CheckCircle({ done, size = control.check, dim = false }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.check, { width: size, height: size }, done && styles.checkDone, dim && styles.dim]}>
      {done && <Text style={styles.tick}>✓</Text>}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    check: {
      width: control.check,
      height: control.check,
      borderRadius: radius.pill,
      borderWidth: border.thick,
      borderColor: t.colors.inkFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: { backgroundColor: t.colors.done, borderColor: t.colors.done },
    // The same 0.45 every other quiet-unavailable control in this app uses. Lowered contrast, not
    // removal: the row keeps its shape, so the list never reflows around what you cannot do.
    dim: { opacity: 0.45 },
    tick: { color: t.colors.onDone, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', lineHeight: 17 * t.scale },
  });
