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
};

export function CheckCircle({ done, size = control.check }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.check, { width: size, height: size }, done && styles.checkDone]}>
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
    tick: { color: t.colors.onDone, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', lineHeight: 17 * t.scale },
  });
