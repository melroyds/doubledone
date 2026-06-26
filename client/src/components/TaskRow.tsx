import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { formatNudgeTime } from '@/lib/nudge';
import { type Slices } from '@/lib/tasks';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { MarqueeText } from './MarqueeText';

type Props = {
  title: string;
  done: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  confirming?: boolean;
  onRemove?: () => void;
  onKeep?: () => void;
  recurring?: boolean;
  slices?: Slices | null;
  onAdvance?: () => void;
  onRetreat?: () => void;
  onBreakdown?: () => void;
  onDefer?: () => void;
  onGoodEnough?: () => void;
  onMakeTiny?: () => void;
  suggestBreakdown?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  nudgeAt?: number | null;
  tinyParent?: string | null; // set when this row is a make-it-tiny pebble: the dreaded parent's title
  pinned?: boolean; // the day's one pinned priority (premium): a quiet accent star + tint; it floats to the top
  big?: boolean; // user-marked "a lot": a quiet accent tag beside the title (never a warning), honouring the weight
};

// A single row. Tap to complete (a soft sage check, gentle fade, never a shaming
// strike). Long-press to remove, behind a calm Keep / Remove confirm. One-off
// (unique) tasks get a solid coloured border; repeating tasks stay plain but carry
// the repeat mark. Same periwinkle accent either way.
//
// A sliced task (a thing done in parts) renders its own way: tap to advance one
// slice, a slim sage bar fills toward done, a quiet "n / N" count, and a small −
// to step back a mistaken tap. Finishing the last slice completes it exactly like
// any task (the caller stamps it), so the celebration is unchanged.
export function TaskRow({
  title,
  done,
  onToggle,
  onLongPress,
  confirming,
  onRemove,
  onKeep,
  recurring,
  slices,
  onAdvance,
  onRetreat,
  onBreakdown,
  onDefer,
  onGoodEnough,
  onMakeTiny,
  suggestBreakdown,
  selecting,
  selected,
  onSelect,
  nudgeAt,
  tinyParent,
  pinned,
  big,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // The default + suggest rows share an accessibility label that names the pin and the big mark, so a
  // screen reader hears "marked as a big task" as validation (suppressed in select mode, like the marks).
  const rowLabel = (pinned ? `${title}, pinned as today's one thing` : title) + (big ? ', marked as a big task' : '');

  // Multi-select mode: every row becomes a checkbox (tap to pick), and the calm
  // tap-to-complete / long-press menu are suspended until the user leaves select mode.
  if (selecting) {
    return (
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [styles.row, !recurring && styles.rowUnique, selected && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(selected) }}
        accessibilityLabel={`Select ${title}`}
      >
        <View style={[styles.selectDot, selected && styles.selectDotOn]}>{selected && <Text style={styles.tick}>✓</Text>}</View>
        <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
        {recurring && <Text style={styles.repeatMark}>↻</Text>}
      </Pressable>
    );
  }
  if (confirming) {
    // A sliced task's hold reveals its quiet controls: step a slice back (the only
    // place the "minus" lives now), or remove. The count updates live as you step.
    if (slices) {
      return (
        <View style={[styles.row, styles.confirmRow]}>
          <Text style={styles.confirmText} numberOfLines={1}>
            {`${title}  ·  ${slices.done} / ${slices.total}`}
          </Text>
          <Pressable
            onPress={onRetreat}
            disabled={slices.done <= 0}
            accessibilityRole="button"
            accessibilityLabel={`Step ${title} back one`}
          >
            <Text style={[styles.keep, slices.done <= 0 && styles.controlOff]}>Step back</Text>
          </Pressable>
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
          <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
      );
    }
    // Title over a row of actions, so the one-off case (Tomorrow / Break down /
    // Keep / Remove) fits without crushing the title on a narrow phone.
    return (
      <View style={[styles.row, styles.confirmRow, styles.confirmColumn]}>
        <Text style={styles.confirmTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.confirmActions}>
          {onGoodEnough && !recurring && !done && (
            <Pressable onPress={onGoodEnough} accessibilityRole="button" accessibilityLabel={`Mark ${title} good enough and done`}>
              <Text style={styles.goodEnough}>Good enough</Text>
            </Pressable>
          )}
          {onDefer && !recurring && (
            <Pressable onPress={onDefer} accessibilityRole="button" accessibilityLabel={`Move ${title} to tomorrow`}>
              <Text style={styles.keep}>Tomorrow</Text>
            </Pressable>
          )}
          {onMakeTiny && !recurring && (
            <Pressable onPress={onMakeTiny} accessibilityRole="button" accessibilityLabel={`Make ${title} tiny`}>
              <Text style={styles.keep}>Make it tiny</Text>
            </Pressable>
          )}
          {onBreakdown && !recurring && (
            <Pressable onPress={onBreakdown} accessibilityRole="button" accessibilityLabel={`Break down ${title}`}>
              <Text style={styles.keep}>Break down</Text>
            </Pressable>
          )}
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${title}`}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
          <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (slices) {
    const complete = slices.total > 0 && slices.done >= slices.total;
    const rest = Math.max(0, slices.total - slices.done);
    // Calm by default: tap to advance a slice, hold to reveal the step-back / remove
    // controls. No always-on minus cluttering the row.
    return (
      <Pressable
        onPress={onAdvance}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [styles.row, styles.rowUnique, styles.sliceColumn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ checked: complete }}
        accessibilityLabel={`${title}, ${slices.done} of ${slices.total} done${complete ? ', complete' : ', tap to advance, hold to adjust'}`}
      >
        <View style={styles.sliceTop}>
          <View style={[styles.check, complete && styles.checkDone]}>
            {complete && <Text style={styles.tick}>✓</Text>}
          </View>
          <MarqueeText text={title} style={[styles.text, complete && styles.textDone]} />
          <Text style={styles.sliceCount}>
            {slices.done} / {slices.total}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={{ flex: slices.done, backgroundColor: theme.colors.done }} />
          <View style={{ flex: rest }} />
        </View>
      </Pressable>
    );
  }

  // AI triage flagged this as too big to just do: same tappable row, with a calm,
  // one-tap "break it down?" prompt underneath. The container is a plain View so the
  // toggle and the prompt are siblings, never a Pressable nested in a Pressable.
  if (suggestBreakdown && !done) {
    return (
      <View style={[styles.row, !recurring && styles.rowUnique, pinned && styles.rowPinned, styles.suggestColumn]}>
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [styles.suggestMain, pressed && styles.pressed]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={rowLabel}
        >
          <View style={[styles.check, done && styles.checkDone]}>
            {done && <Text style={styles.tick}>✓</Text>}
          </View>
          {big ? <Text style={styles.bigMark}>Big</Text> : null}
          <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
          {nudgeAt ? <Text style={styles.nudgeMark}>{`🔔 ${formatNudgeTime(nudgeAt)}`}</Text> : null}
          {recurring && <Text style={styles.repeatMark}>↻</Text>}
          {pinned ? <Text style={styles.pinStar}>★</Text> : null}
        </Pressable>
        {onBreakdown && (
          <Pressable
            onPress={onBreakdown}
            accessibilityRole="button"
            accessibilityLabel={`Break down ${title}`}
            hitSlop={6}
            style={({ pressed }) => [styles.suggestHintBtn, pressed && styles.pressed]}
          >
            <Text style={styles.suggestHint}>Looks big, break it down?</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // A make-it-tiny pebble: an eyebrow keeps the dreaded real task visible above the
  // 2-minute step, so the link is never lost. Periwinkle, matching the one-off border.
  if (tinyParent && !done) {
    return (
      <View style={[styles.row, styles.rowUnique, styles.tinyColumn]}>
        <Text style={styles.tinyEyebrow} numberOfLines={1}>
          A tiny step toward · {tinyParent}
        </Text>
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [styles.tinyMain, pressed && styles.pressed]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`${title}, a tiny step toward ${tinyParent}`}
        >
          <View style={[styles.check, done && styles.checkDone]}>{done && <Text style={styles.tick}>✓</Text>}</View>
          <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [styles.row, !recurring && styles.rowUnique, pinned && styles.rowPinned, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={rowLabel}
    >
      <View style={[styles.check, done && styles.checkDone]}>
        {done && <Text style={styles.tick}>✓</Text>}
      </View>
      {big ? <Text style={styles.bigMark}>Big</Text> : null}
      <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
      {nudgeAt ? <Text style={styles.nudgeMark}>{`🔔 ${formatNudgeTime(nudgeAt)}`}</Text> : null}
      {recurring && <Text style={styles.repeatMark}>↻</Text>}
      {/* the pin star sits last, at the extreme right, so it stays the clear cue beside any other mark */}
      {pinned ? <Text style={styles.pinStar}>★</Text> : null}
    </Pressable>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.four,
    paddingVertical: spacing.four,
    paddingHorizontal: spacing.four,
    backgroundColor: t.colors.surfaceCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.line,
    // Soft elevation: rows float a hair above the living background (the redesign).
    boxShadow: t.scheme === 'dark' ? '0px 6px 18px -10px rgba(0,0,0,0.5)' : '0px 6px 18px -10px rgba(43,39,34,0.18)',
  },
  rowUnique: { borderColor: t.colors.repeat, borderWidth: 2 },
  // The day's one pinned priority: a calm accent border + faint tint, with the star beside the title.
  rowPinned: { borderColor: t.colors.accent, borderWidth: 2, backgroundColor: t.colors.accentSoft },
  pinStar: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  // A quiet accent tag (never danger red): the app agreeing this task is a lot, sized small so it never scolds.
  bigMark: {
    color: t.colors.accent,
    backgroundColor: t.colors.accentSoft,
    fontSize: 11 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: spacing.two,
    paddingVertical: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
  confirmRow: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accentSoft },
  confirmText: { flex: 1, color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
  confirmColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.three },
  confirmTitle: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body },
  confirmActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.three },
  keep: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', paddingHorizontal: spacing.two },
  goodEnough: { color: t.colors.done, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', paddingHorizontal: spacing.two },
  controlOff: { color: t.colors.inkFaint },
  close: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', paddingHorizontal: spacing.two },
  remove: { color: t.colors.danger, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', paddingHorizontal: spacing.two },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: t.colors.done, borderColor: t.colors.done },
  rowSelected: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  selectDot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDotOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  tick: { color: t.colors.onDone, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', lineHeight: 17 * t.scale },
  text: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 23 * t.scale },
  textDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  repeatMark: { color: t.colors.repeat, fontSize: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  nudgeMark: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  suggestColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  suggestMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  suggestHintBtn: { alignSelf: 'flex-start' },
  suggestHint: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  tinyColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  tinyMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  tinyEyebrow: { ...t.type.eyebrow, color: t.colors.repeat },
  sliceColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  sliceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  sliceCount: { color: t.colors.repeat, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.doneSoft,
    overflow: 'hidden',
  },
});
