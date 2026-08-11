import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { debugLines, debugStamp, subscribeDebug } from '@/lib/debug-log';
import { useThemedStyles } from '@/lib/theme-provider';

// The on-screen log, rendered only when the URL says `?debug=1`. See lib/debug-log for why it
// exists: a phone will not show you a console, and every shared-list failure looks identical from
// the outside. Deliberately ugly, so nobody mistakes it for part of the app.
export function DebugPanel() {
  const styles = useThemedStyles(makeStyles);
  // The lines live in STATE, and that is not a style preference.
  //
  // The first version read `debugLines()` during render and forced a re-render with a counter. Under
  // the React Compiler that call looks pure and dependency-free, so it is memoised and hands back
  // its first value forever: empty. The panel sat reading "nothing logged yet" through highlights
  // that had provably fired. The diagnostic was defeated by a value read once and never re-read,
  // which is the exact shape of three other bugs found tonight.
  const [lines, setLines] = useState(debugLines);

  useEffect(() => subscribeDebug(() => setLines(debugLines())), []);
  if (lines.length === 0) return <Text style={styles.empty}>debug on · nothing logged yet</Text>;

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
      {lines.map((line) => (
        <Text key={`${line.at}-${line.tag}-${line.detail}`} style={styles.line} selectable>
          {debugStamp(line.at)} {line.tag} {line.detail}
        </Text>
      ))}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    panel: { maxHeight: 190, marginTop: spacing.five, borderRadius: radius.sm, backgroundColor: t.colors.surface },
    content: { padding: spacing.three },
    // Selectable, because the whole point is that it can be copied out and pasted to me.
    line: { color: t.colors.inkSoft, fontSize: 11 * t.scale, fontFamily: fonts.body, lineHeight: 16 * t.scale },
    empty: { color: t.colors.inkFaint, fontSize: 11 * t.scale, fontFamily: fonts.body, marginTop: spacing.five },
  });
