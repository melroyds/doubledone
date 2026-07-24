import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, cardShadow, fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { formatNudgeTime } from '@/lib/nudge';
import { type Slices } from '@/lib/tasks';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { CheckCircle } from './CheckCircle';
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
  onMakeTiny?: () => void;
  onBig?: () => void; // held-state: mark / unmark this task "a lot"
  onPin?: () => void; // held-state: pin / unpin as the day's one priority (Today one-offs only)
  onSelectMore?: () => void; // held-state: the door into multi-select (Combine, bulk-move, bulk-complete)
  onNudge?: () => void; // held-state: set a reminder on this task (native only; the caller gates it)
  onRename?: (title: string) => void; // held-state: tap the card's title to edit it in place (trim/no-op rules live in lib/today renameTask)
  onSteps?: () => void; // held-state: open the "track in steps" editor (split or re-size)
  onMoveTo?: () => void; // held-state: move this one task to a day of its own
  onDoneOn?: () => void; // held-state, DONE tasks only: attribute the finish to the earlier day it happened
  pinDim?: boolean; // free user: Pin shows dimmed rather than absent, so the feature is discoverable, never a wall
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
// strike). Long-press to reveal this task's own actions in place (the held card
// below), which is the ONE single-task surface in both appearances. One-off
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
  onMakeTiny,
  onBig,
  onPin,
  onSelectMore,
  onNudge,
  onRename,
  onSteps,
  onMoveTo,
  onDoneOn,
  pinDim,
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
  // Inline title editing on the held card: tap the title, it becomes a field, enter or blur saves.
  // The draft starts from the RAW title (never the sliced "· n/N" suffix, which is render-only).
  // Editing state resets whenever the card closes (the adjust-during-render pattern, not an
  // effect, so a half-typed draft never survives a reopen and the React Compiler stays happy).
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [wasConfirming, setWasConfirming] = useState(confirming);
  if (wasConfirming !== confirming) {
    setWasConfirming(confirming);
    if (!confirming) setEditingTitle(null);
  }
  function saveTitle() {
    if (editingTitle != null && onRename) onRename(editingTitle);
    setEditingTitle(null);
  }
  // The default + suggest rows share an accessibility label that names the pin and the big mark, so a
  // screen reader hears "marked as a big task" as validation (suppressed in select mode, like the marks).
  // The repeat and reminder state are folded in too, so a recurring task or one with a nudge no longer
  // reads identically to a plain one (their decorative glyphs are then hidden from the reader, below).
  const rowLabel =
    (pinned ? t('today.rowLabelPinned', { title }) : title) +
    (big ? t('today.rowLabelBigSuffix') : '') +
    (recurring ? t('today.rowLabelRepeatingSuffix') : '') +
    (nudgeAt ? t('today.rowLabelReminderSuffix', { time: formatNudgeTime(nudgeAt) }) : '');

  // Multi-select mode: every row becomes a checkbox (tap to pick), and the calm
  // tap-to-complete / long-press menu are suspended until the user leaves select mode.
  if (selecting) {
    return (
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [styles.row, !recurring && styles.rowUnique, selected && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(selected) }}
        accessibilityLabel={t('today.selectRowLabel', { title })}
      >
        <View style={[styles.selectDot, selected && styles.selectDotOn]}>{selected && <Text style={styles.tick}>✓</Text>}</View>
        <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
        {recurring && <Text style={styles.repeatMark}>↻</Text>}
      </Pressable>
    );
  }
  if (confirming) {
    // THE single-task surface, identical in both appearances: this task's own actions, in
    // place, from one hold. Nothing else on the screen moves, so there is no mode to leave
    // and nothing to scroll back to. Multi-select is a deliberate door ("Select more"), not
    // what a hold does to you.
    //
    // Grouped by the question the user is actually asking, because eleven flat links is the
    // overwhelm the spine forbids: WHEN (not today?), SIZE (too big?), WEIGHT (does this
    // matter?), then the terminal pair under a hairline so a reflex tap never lands on
    // Remove. Never more than three to a line, and each line renders only if it holds
    // something. No line labels: the grouping is carried by the breaks alone (words there
    // would be the clutter they are meant to prevent).
    const canDefer = Boolean(onDefer && !recurring);
    const canMoveTo = Boolean(onMoveTo && !recurring);
    const canUndoStep = Boolean(onRetreat && slices);
    // A task already split into steps does not need decomposing again.
    const canBreakdown = Boolean(onBreakdown && !recurring && !slices);
    const canSteps = Boolean(onSteps && !recurring);
    const canTiny = Boolean(onMakeTiny && !recurring);
    const canPin = Boolean(onPin && !recurring);
    // "a lot" is a leaf mark and a recurring chore can absolutely be a lot (the bulk bar has
    // always allowed it), so this one carries no recurring guard.
    const whenLine = done ? Boolean(onDoneOn) : canDefer || canMoveTo || Boolean(onNudge);
    const sizeLine = !done && (canUndoStep || canBreakdown || canSteps || canTiny);
    const weightLine = !done && (canPin || Boolean(onBig));
    return (
      <View style={[styles.row, styles.confirmRow, styles.confirmColumn]}>
        {editingTitle != null && onRename ? (
          <TextInput
            value={editingTitle}
            onChangeText={setEditingTitle}
            onSubmitEditing={saveTitle}
            onBlur={saveTitle}
            autoFocus
            returnKeyType="done"
            style={[styles.confirmTitle, styles.confirmTitleInput]}
            accessibilityLabel={t('today.editTitleInputA11y')}
          />
        ) : (
          // The title is the edit control: tap the thing to change the thing, no extra button on an
          // already-full card. The faint underline is the whole affordance; onRename absent (no
          // handler wired) leaves it a plain title.
          <Pressable
            onPress={onRename ? () => setEditingTitle(title) : undefined}
            disabled={!onRename}
            accessibilityRole={onRename ? 'button' : undefined}
            accessibilityLabel={onRename ? t('today.editTitleA11y', { title }) : undefined}
            hitSlop={{ top: 8, bottom: 8 }}
          >
            <Text style={[styles.confirmTitle, onRename && styles.confirmTitleEditable]} numberOfLines={2}>
              {slices ? `${title}  ·  ${slices.done} / ${slices.total}` : title}
            </Text>
          </Pressable>
        )}
        {whenLine && (
          <View style={styles.confirmActions}>
            {/* A finished task is offered no Done (tapping the row is the one way to finish
                a thing), only the honest correction: which day it actually happened. */}
            {done && onDoneOn && (
              <Pressable onPress={onDoneOn} accessibilityRole="button" accessibilityLabel={t('today.doneOnA11y', { title })} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('today.doneOn')}</Text>
              </Pressable>
            )}
            {!done && canDefer && (
              <Pressable onPress={onDefer} accessibilityRole="button" accessibilityLabel={t('today.moveToTomorrowLabel', { title })} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('common.tomorrow')}</Text>
              </Pressable>
            )}
            {!done && canMoveTo && (
              <Pressable onPress={onMoveTo} accessibilityRole="button" accessibilityLabel={t('today.moveSelectedA11y')} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('today.moveTo')}</Text>
              </Pressable>
            )}
            {!done && onNudge && (
              <Pressable onPress={onNudge} accessibilityRole="button" accessibilityLabel={t('reminders.remindMeA11y')} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('reminders.remindMe')}</Text>
              </Pressable>
            )}
          </View>
        )}
        {sizeLine && (
          <View style={styles.confirmActions}>
            {canUndoStep && slices && (
              <Pressable
                onPress={onRetreat}
                disabled={slices.done <= 0}
                accessibilityRole="button"
                accessibilityLabel={t('today.stepBackLabel', { title })}
                hitSlop={{ top: 12, bottom: 12 }}
              >
                <Text style={[styles.keep, slices.done <= 0 && styles.controlOff]}>{t('today.undoAStep')}</Text>
              </Pressable>
            )}
            {canBreakdown && (
              <Pressable onPress={onBreakdown} accessibilityRole="button" accessibilityLabel={t('breakdown.breakDownTaskLabel', { title })} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('breakdown.breakDown')}</Text>
              </Pressable>
            )}
            {canSteps && (
              <Pressable onPress={onSteps} accessibilityRole="button" accessibilityLabel={slices ? t('today.changeStepsA11y') : t('today.splitStepsA11y')} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('today.steps')}</Text>
              </Pressable>
            )}
            {canTiny && (
              <Pressable onPress={onMakeTiny} accessibilityRole="button" accessibilityLabel={t('today.makeTinyLabel', { title })} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{t('actions.makeItTiny')}</Text>
              </Pressable>
            )}
          </View>
        )}
        {weightLine && (
          <View style={styles.confirmActions}>
            {canPin && (
              <Pressable onPress={onPin} accessibilityRole="button" accessibilityLabel={pinned ? t('today.unpinA11y') : t('today.pinA11y')} hitSlop={{ top: 12, bottom: 12 }}>
                {/* Dimmed, not hidden, for a free user: a visible feature that costs a calm
                    detour is kinder than one that is simply absent. */}
                <Text style={[styles.keep, pinDim && styles.controlOff]}>{pinned ? t('today.unpin') : t('today.pin')}</Text>
              </Pressable>
            )}
            {onBig && (
              <Pressable onPress={onBig} accessibilityRole="button" accessibilityLabel={big ? t('today.unmarkBigA11y') : t('today.markBigA11y')} hitSlop={{ top: 12, bottom: 12 }}>
                <Text style={styles.keep}>{big ? t('today.notALot') : t('today.markAsALot')}</Text>
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.terminalLine}>
          {/* A door, not a verb, so it reads faint and left. Leaving is always the safe act, so
              Close takes the accent and the thumb's corner. Remove + Close are ONE content-sized
              group pinned right by the group's own flex, NOT separated by a zero-width flex spacer:
              on dense Android a fractional spacer starved the middle label's box and hard-clipped
              its trailing glyph ("Remove" -> "Remov" on an S22, and worse for longer locales like
              fr "Retirer"). Content-sizing each label means no label's width is ever leftover-space. */}
          {onSelectMore && (
            <Pressable onPress={onSelectMore} accessibilityRole="button" accessibilityLabel={t('today.selectMoreA11y')} hitSlop={{ top: 12, bottom: 12 }}>
              <Text style={styles.keep}>{t('today.selectMore')}</Text>
            </Pressable>
          )}
          <View style={styles.terminalRight}>
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={recurring ? t('repeat.skipTodayA11y', { title }) : t('today.removeTaskLabel', { title })}
              hitSlop={{ top: 12, bottom: 12 }}
            >
              <Text style={styles.remove}>{t('common.remove')}</Text>
            </Pressable>
            <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{ top: 12, bottom: 12 }}>
              <Text style={styles.close}>{t('common.close')}</Text>
            </Pressable>
          </View>
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
        accessibilityLabel={
          complete
            ? t('today.sliceRowLabelComplete', { title, done: slices.done, total: slices.total })
            : t('today.sliceRowLabelInProgress', { title, done: slices.done, total: slices.total })
        }
      >
        <View style={styles.sliceTop}>
          <CheckCircle done={complete} />
          <MarqueeText text={title} style={[styles.text, complete && styles.textDone]} />
          <Text style={styles.sliceCount}>
            {slices.done} / {slices.total}
          </Text>
        </View>
        {theme.appearance !== 'quiet' && (
          <View style={styles.track}>
            <View style={{ flex: slices.done, backgroundColor: theme.colors.done }} />
            <View style={{ flex: rest }} />
          </View>
        )}
        {/* A quiet sighted cue for the hold-to-adjust gesture, restoring parity with the spoken hint the screen
            reader already gives. Without it a mis-tapped slice has no visible way back. Incomplete rows only. */}
        {!complete && <Text style={styles.sliceAdjustHint}>{t('today.holdToAdjust')}</Text>}
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
          <CheckCircle done={done} />
          {big ? <Text style={styles.bigMark} accessible={false} importantForAccessibility="no">{t('today.bigTag')}</Text> : null}
          <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
          {nudgeAt ? <Text style={styles.nudgeMark} accessible={false} importantForAccessibility="no">{formatNudgeTime(nudgeAt)}</Text> : null}
          {recurring && <Text style={styles.repeatMark} accessible={false} importantForAccessibility="no">↻</Text>}
          {pinned ? <Text style={styles.pinStar} accessible={false} importantForAccessibility="no">★</Text> : null}
        </Pressable>
        {onBreakdown && (
          <Pressable
            onPress={onBreakdown}
            accessibilityRole="button"
            accessibilityLabel={t('breakdown.breakDownTaskLabel', { title })}
            hitSlop={6}
            style={({ pressed }) => [styles.suggestHintBtn, pressed && styles.pressed]}
          >
            <Text style={styles.suggestHint}>{t('welcome.revealBreakdownHint')}</Text>
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
          {t('today.tinyStepEyebrow', { parent: tinyParent })}
        </Text>
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          delayLongPress={400}
          style={({ pressed }) => [styles.tinyMain, pressed && styles.pressed]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={t('today.tinyStepRowLabel', { title, parent: tinyParent })}
        >
          <CheckCircle done={done} />
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
      <CheckCircle done={done} />
      {big ? <Text style={styles.bigMark} accessible={false} importantForAccessibility="no">{t('today.bigTag')}</Text> : null}
      <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
      {nudgeAt ? <Text style={styles.nudgeMark} accessible={false} importantForAccessibility="no">{formatNudgeTime(nudgeAt)}</Text> : null}
      {recurring && <Text style={styles.repeatMark} accessible={false} importantForAccessibility="no">↻</Text>}
      {/* the pin star sits last, at the extreme right, so it stays the clear cue beside any other mark */}
      {pinned ? <Text style={styles.pinStar} accessible={false} importantForAccessibility="no">★</Text> : null}
    </Pressable>
  );
}

const makeStyles = (t: Theme) => StyleSheet.create({
  // Quiet strips the card to whitespace + a 5%-ink bottom hairline; standard keeps the soft floating card.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.four,
    ...(t.appearance === 'quiet'
      ? // Match standard's vertical padding so toggling appearance never reflows the list (the spec's
        // top principle "switching never moves anything" wins over its literal 12px, which did not match
        // the card height). Chrome removed, vertical rhythm kept; content sits near the margin (no card inset).
        { minHeight: 48, paddingVertical: spacing.four, paddingHorizontal: 2, borderBottomWidth: border.hair, borderColor: t.quiet.hairline }
      : {
          paddingVertical: spacing.four,
          paddingHorizontal: spacing.four,
          backgroundColor: t.colors.surfaceCard,
          borderRadius: radius.md,
          borderWidth: border.hair,
          borderColor: t.colors.line,
          // Soft elevation: rows float a hair above the living background (the redesign).
          boxShadow: cardShadow(t),
        }),
  },
  // One-off (unique): a thick periwinkle border in standard; in quiet, whitespace alone (no chrome).
  rowUnique: t.appearance === 'quiet' ? {} : { borderColor: t.colors.repeat, borderWidth: border.thick },
  // The day's one pinned priority: an accent border + tint in standard; in quiet, a faint tint + the star.
  rowPinned:
    t.appearance === 'quiet'
      ? { backgroundColor: t.colors.accentSoft }
      : { borderColor: t.colors.accent, borderWidth: border.thick, backgroundColor: t.colors.accentSoft },
  pinStar: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  // A quiet accent tag (never danger red): the app agreeing this task is a lot, sized small so it never scolds.
  // "a lot" tag: a soft accent pill in standard; plain accent text (no pill chrome) in quiet.
  bigMark: {
    color: t.colors.accent,
    fontSize: 11 * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: '700',
    letterSpacing: 0.3,
    ...(t.appearance === 'quiet'
      ? {}
      : { backgroundColor: t.colors.accentSoft, paddingHorizontal: spacing.two, paddingVertical: 1, borderRadius: radius.pill, overflow: 'hidden' }),
  },
  pressed: { opacity: PRESSED_OPACITY },
  // The held row: quiet gets the soft press wash (accentSoft tint) with a rounded bleed; standard keeps the accent tint.
  confirmRow:
    t.appearance === 'quiet'
      ? { backgroundColor: t.quiet.pressWash, borderRadius: radius.md, borderColor: 'transparent' }
      : { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accentSoft },
  confirmColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.three },
  // userSelect:'none' on every title-bearing Text so a tap-and-hold (the held-state gesture)
  // can never start an iOS text selection on the title, native or web (see MarqueeText).
  confirmTitle: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, userSelect: 'none' },
  // The tappable-title affordance: a faint dotted-feeling underline in soft ink, calm enough to
  // never shout, present enough that "this is editable" is discoverable.
  confirmTitleEditable: { textDecorationLine: 'underline', textDecorationColor: t.colors.inkFaint },
  confirmTitleInput: { paddingVertical: 0, borderBottomWidth: border.hair, borderColor: t.colors.accent },
  confirmActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.three },
  // The way out, held below a hairline and away from the rest, so a reflex tap after an
  // action can never land on Remove.
  terminalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.three,
    borderTopWidth: border.hair,
    borderColor: t.appearance === 'quiet' ? t.quiet.hairline : t.colors.line,
    paddingTop: spacing.two,
  },
  terminalRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.three },
  keep: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', paddingHorizontal: spacing.two },
  controlOff: { color: t.colors.inkFaint },
  close: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', paddingHorizontal: spacing.two },
  remove: { color: t.colors.danger, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', paddingHorizontal: spacing.two },
  rowSelected: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
  selectDot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: border.thick,
    borderColor: t.colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDotOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  tick: { color: t.colors.onAccent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', lineHeight: 17 * t.scale },
  text: { color: t.colors.ink, fontSize: 17 * t.scale, fontFamily: fonts.body, lineHeight: 23 * t.scale, userSelect: 'none' },
  textDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through' },
  repeatMark: { color: t.appearance === 'quiet' ? t.quiet.secondary : t.colors.repeat, fontSize: 18 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  nudgeMark: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  suggestColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  suggestMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  suggestHintBtn: { alignSelf: 'flex-start' },
  suggestHint: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  tinyColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  tinyMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  tinyEyebrow: { ...t.type.eyebrow, color: t.appearance === 'quiet' ? t.quiet.secondary : t.colors.repeat },
  sliceColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.two },
  sliceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.four },
  sliceCount: {
    color: t.appearance === 'quiet' ? t.quiet.nOfM : t.colors.repeat,
    fontSize: (t.appearance === 'quiet' ? 13 : 14) * t.scale,
    fontFamily: fonts.bodyBold,
    fontWeight: t.appearance === 'quiet' ? '600' : '700',
  },
  sliceAdjustHint: { color: t.colors.inkFaint, fontSize: 11 * t.scale, fontFamily: fonts.body, marginTop: spacing.half },
  track: {
    flexDirection: 'row',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.doneSoft,
    overflow: 'hidden',
  },
});
