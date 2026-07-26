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
  onDefer?: () => void; // push-to-tomorrow; the held card no longer shows a standalone Tomorrow (folded into the Move-to picker's chip), but the prop stays for that wiring
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
  // Editing state (and the "More" disclosure) reset whenever the card closes (the adjust-during-render
  // pattern, not an effect, so a half-typed draft or an opened drawer never survives a reopen and the
  // React Compiler stays happy).
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [wasConfirming, setWasConfirming] = useState(confirming);
  if (wasConfirming !== confirming) {
    setWasConfirming(confirming);
    if (!confirming) {
      setEditingTitle(null);
      setMoreOpen(false);
    }
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
    // THE single-task surface, identical in both appearances: this task's own actions, in place,
    // from one hold. Nothing else on the screen moves, so there is no mode to leave. Design 1a
    // (2026-07-25): the stuck-helpers LEAD (Break it down as the tinted hero, then Make it tiny,
    // Move to, Mark as a lot), the rarer actions RECEDE behind a "More" disclosure, and the way out
    // sits under a hairline with Close in the easy thumb reach and Remove far from it. Fewer visible
    // labels (11 -> 4), same feature set. Each action is its own full-width row (label left, a quiet
    // sub-label or state right), never a tight equal-width column, so a long label or a large system
    // font can never clip (the old grid's bug).
    const canMoveTo = Boolean(onMoveTo && !recurring);
    const canUndoStep = Boolean(onRetreat && slices);
    // A task already split into steps does not need decomposing or shrinking again.
    const canBreakdown = Boolean(onBreakdown && !recurring && !slices);
    const canSteps = Boolean(onSteps && !recurring);
    const canTiny = Boolean(onMakeTiny && !recurring && !slices);
    const canPin = Boolean(onPin && !recurring);

    // The way out, shared by both variants: Close (safe, easy reach, bottom-left), Select more, then
    // Remove (far right, out of the reflex path). On a repeating task, Remove is "Skip today": the
    // series continues, so the label must say so.
    const terminalRow = (
      <View style={styles.terminalRow}>
        <Pressable onPress={onKeep} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={{ top: 12, bottom: 12 }}>
          <Text style={styles.close}>{t('common.close')}</Text>
        </Pressable>
        {onSelectMore && (
          <Pressable onPress={onSelectMore} accessibilityRole="button" accessibilityLabel={t('today.selectMoreA11y')} hitSlop={{ top: 12, bottom: 12 }}>
            <Text style={styles.selectMore}>{t('today.selectMore')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={recurring ? t('repeat.skipTodayA11y', { title }) : t('today.removeTaskLabel', { title })}
          hitSlop={{ top: 12, bottom: 12 }}
        >
          <Text style={styles.remove}>{recurring ? t('repeat.skipToday') : t('common.remove')}</Text>
        </Pressable>
      </View>
    );

    // A finished task: a deliberately minimal card. The honest correction (which day it happened) and
    // the way out, nothing to shape (a finished thing needs nothing shaped) and no "Done". A calm close.
    if (done) {
      return (
        <View style={[styles.row, styles.confirmRow, styles.confirmColumn]}>
          <View style={styles.doneTitleRow}>
            <Text style={styles.doneCheck} accessible={false} importantForAccessibility="no">✓</Text>
            <Text style={[styles.confirmTitle, styles.confirmTitleDone]} numberOfLines={2}>{title}</Text>
          </View>
          {onDoneOn && (
            <Pressable
              onPress={onDoneOn}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityLabel={t('today.doneOnA11y', { title })}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={styles.actionLabel}>{t('today.doneOn')}</Text>
            </Pressable>
          )}
          {terminalRow}
          <Text style={styles.doneIsDone}>{t('today.heldDoneIsDone')}</Text>
        </View>
      );
    }

    // An open task: the curated 1a card.
    const hasMore = canSteps || canUndoStep || canPin || Boolean(onNudge);
    const morePreview = [canSteps && t('today.steps'), canPin && t('today.pin'), onNudge && t('reminders.remindMe')]
      .filter(Boolean)
      .join(' · ');
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
          // already-full card. The faint underline is the whole affordance; onRename absent leaves it plain.
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

        {/* Lead actions: the helpers you reach for when stuck. Break it down is the tinted hero. */}
        {canBreakdown && (
          <Pressable
            onPress={onBreakdown}
            style={[styles.actionRow, styles.heroRow]}
            accessibilityRole="button"
            accessibilityLabel={t('breakdown.breakDownTaskLabel', { title })}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={[styles.actionLabel, styles.heroLabel]}>{t('breakdown.breakDown')}</Text>
            <Text style={[styles.actionSub, styles.heroSub]}>{t('breakdown.intoSmallSteps')}</Text>
          </Pressable>
        )}
        {canTiny && (
          <Pressable
            onPress={onMakeTiny}
            style={styles.actionRow}
            accessibilityRole="button"
            accessibilityLabel={t('today.makeTinyLabel', { title })}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.actionLabel}>{t('actions.makeItTiny')}</Text>
            <Text style={styles.actionSub}>{t('today.tinyHint')}</Text>
          </Pressable>
        )}
        {canMoveTo && (
          <Pressable
            onPress={onMoveTo}
            style={styles.actionRow}
            accessibilityRole="button"
            accessibilityLabel={t('today.moveSelectedA11y')}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.actionLabel}>{t('today.moveTo')}</Text>
          </Pressable>
        )}
        {onBig && (
          <Pressable
            onPress={onBig}
            style={[styles.actionRow, big && styles.actionRowActive]}
            accessibilityRole="button"
            accessibilityLabel={big ? t('today.unmarkBigOneA11y') : t('today.markBigOneA11y')}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={[styles.actionLabel, big && styles.actionLabelActive]}>{t('today.markAsALot')}</Text>
            <Text style={[styles.actionSub, big && styles.actionLabelActive]}>{big ? '✓' : t('today.weightHint')}</Text>
          </Pressable>
        )}

        {/* More: the rarer actions, folded away by default so the card reads as four calm helpers. */}
        {hasMore && (
          <>
            <Pressable
              onPress={() => setMoreOpen(!moreOpen)}
              style={styles.actionRow}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              accessibilityLabel={moreOpen ? t('today.moreCollapseA11y') : t('today.moreExpandA11y')}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <View style={styles.moreLead}>
                <Text style={styles.moreLabel}>{t('today.more')}</Text>
                {!moreOpen && (
                  <Text style={styles.actionSub} numberOfLines={1}>
                    {morePreview}
                  </Text>
                )}
              </View>
              <Text style={styles.moreCaret} accessible={false} importantForAccessibility="no">
                {moreOpen ? '▴' : '▾'}
              </Text>
            </Pressable>
            {moreOpen && (
              <>
                {canSteps && (
                  <Pressable
                    onPress={onSteps}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={slices ? t('today.changeStepsA11y') : t('today.splitStepsA11y')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.actionLabel}>{t('today.steps')}</Text>
                    {slices && <Text style={styles.actionSub}>{t('today.stepsOf', { done: slices.done, total: slices.total })}</Text>}
                  </Pressable>
                )}
                {canUndoStep && slices && (
                  <Pressable
                    onPress={onRetreat}
                    disabled={slices.done <= 0}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={t('today.stepBackLabel', { title })}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={[styles.actionLabel, slices.done <= 0 && styles.controlOff]}>{t('today.undoAStep')}</Text>
                  </Pressable>
                )}
                {canPin && (
                  <Pressable
                    onPress={onPin}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={pinned ? t('today.unpinA11y') : t('today.pinA11y')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    {/* Dimmed, not hidden, for a free user: a visible feature that costs a calm detour
                        is kinder than one that is simply absent. */}
                    <Text style={[styles.actionLabel, pinDim && styles.controlOff]}>{pinned ? t('today.unpin') : t('today.pin')}</Text>
                    <Text style={styles.actionSub}>{t('today.pinHint')}</Text>
                  </Pressable>
                )}
                {onNudge && (
                  <Pressable
                    onPress={onNudge}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={t('reminders.remindMeA11y')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.actionLabel}>{t('reminders.remindMe')}</Text>
                  </Pressable>
                )}
              </>
            )}
          </>
        )}

        {terminalRow}
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

const makeStyles = (t: Theme) => {
  // The hero (Break it down) fills in light, tints in dark, and drops its fill entirely in Quiet, so the
  // text colour on it follows: white on the light fill, accent on the dark tint / in Quiet. Computed once
  // so heroLabel and heroSub can't drift apart.
  const heroText = t.appearance === 'quiet' ? t.colors.accent : t.scheme === 'dark' ? t.colors.accent : t.colors.onAccent;
  return StyleSheet.create({
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
        : { backgroundColor: t.colors.surfaceCard, borderColor: t.colors.line },
    confirmColumn: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.half },
    // userSelect:'none' on every title-bearing Text so a tap-and-hold (the held-state gesture)
    // can never start an iOS text selection on the title, native or web (see MarqueeText).
    confirmTitle: { ...t.type.subheading, color: t.colors.ink, userSelect: 'none', paddingHorizontal: spacing.two, paddingBottom: spacing.one },
    // The tappable-title affordance: a faint dotted-feeling underline in soft ink, calm enough to
    // never shout, present enough that "this is editable" is discoverable.
    confirmTitleEditable: { textDecorationLine: 'underline', textDecorationColor: t.colors.inkFaint },
    confirmTitleInput: { paddingVertical: 0, borderBottomWidth: border.hair, borderColor: t.colors.accent },
    doneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, paddingHorizontal: spacing.two, paddingBottom: spacing.one },
    doneCheck: { color: t.colors.done, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    confirmTitleDone: { color: t.colors.inkFaint, textDecorationLine: 'line-through', paddingHorizontal: 0, paddingBottom: 0, flexShrink: 1 },
    doneIsDone: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body, fontStyle: 'italic', textAlign: 'center', paddingTop: spacing.two },
    // Every held-card action is a full-width row: label left, a quiet sub-label / state right. Content-sized
    // text at both ends (never a tight equal-width column), so a long label or a large font can't clip.
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.three,
      minHeight: 44,
      paddingVertical: spacing.one,
      paddingHorizontal: spacing.two,
    },
    actionLabel: { ...t.type.label, color: t.colors.ink },
    actionSub: { fontSize: 13 * t.scale, fontFamily: fonts.body, color: t.colors.inkSoft, textAlign: 'right' },
    // The hero: Break it down. Filled accent in light-standard (white label), a soft tint in dark-standard
    // (accent label), and no fill at all in Quiet (accent label, held by whitespace like every other quiet action).
    heroRow:
      t.appearance === 'quiet'
        ? {}
        : { backgroundColor: t.scheme === 'dark' ? t.colors.accentSoft : t.colors.accent, borderRadius: radius.sm },
    heroLabel: { color: heroText, fontWeight: '700' },
    heroSub: { color: heroText, opacity: 0.82 },
    // Mark-as-a-lot, active: the row tints and its text lifts to accent, the app quietly agreeing.
    actionRowActive: t.appearance === 'quiet' ? {} : { backgroundColor: t.colors.accentSoft, borderRadius: radius.sm },
    actionLabelActive: { color: t.colors.accent },
    // The More disclosure: the label plus a faint preview of what is inside, and a caret that flips.
    moreLead: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, flexShrink: 1 },
    moreLabel: { ...t.type.label, color: t.colors.accent },
    moreCaret: { color: t.colors.accent, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    // The revealed More items sit slightly indented, so they read as belonging under the disclosure.
    moreItem: { paddingLeft: spacing.four },
    controlOff: { color: t.colors.inkFaint },
    // The way out, under a hairline: Close (left, easy reach), Select more (middle), Remove (far right).
    terminalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.three,
      borderTopWidth: border.hair,
      borderColor: t.appearance === 'quiet' ? t.quiet.hairline : t.colors.line,
      paddingTop: spacing.three,
      paddingHorizontal: spacing.two,
      marginTop: spacing.one,
    },
    close: { ...t.type.label, color: t.colors.accent, fontWeight: '700' },
    selectMore: { ...t.type.label, color: t.colors.inkSoft },
    remove: { ...t.type.label, color: t.colors.danger },
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
};
