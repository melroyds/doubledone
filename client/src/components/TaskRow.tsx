import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { border, cardShadow, fonts, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { formatNudgeTime } from '@/lib/nudge';
import { type Slices } from '@/lib/tasks';
import { useReducedMotion, useTheme, useThemedStyles } from '@/lib/theme-provider';

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
  plain?: boolean; // drop the one-off (periwinkle) border. On Today it separates one-offs from repeats; on a list that is almost ALL one-offs it lands on every row and separates nothing
  washed?: boolean; // changed since you last looked (the shared list): the row's OWN surface warms and its OWN border firms, never a second ring drawn around it
  note?: string; // a state worth SAYING as well as showing: rendered as a quiet second line AND folded into the spoken label, so it is never colour-only and never screen-reader-only
  inert?: string; // this row cannot be ticked, and this is why: the reason travels WITH the control, so a screen reader hears it and a tap is never silently dead
  removesWholeSeries?: boolean; // the caller's Remove tombstones the SERIES, so it must not borrow the "Skip today" label
  onRepeat?: () => void; // held-state, SHARED rows only: set this row's rhythm, through THE cadence sheet
  onBring?: () => void; // held-state, SHARED rows only: bring a copy of this to my own Today (the hero seat, where Break it down sits on a personal card)
  brought?: boolean; // that copy is already on my Today: the hero says so and goes inert, rather than quietly making a second one
  bringLabel?: string; // override for the bring hero's words. In the ROOM it is "Bring to my Today"; on Today itself that sentence is nonsense, and the same action there means "take this on"
  onShareToOurs?: () => void; // held-state, PERSONAL rows only: put a copy of this on the shared list (in the fold; only when a live list exists)
  origin?: string; // a faint suffix after the title, marking YOUR copy of a shared row ("· Ours"). Render-only: never part of the title, so renaming never eats it
  onDefer?: () => void; // push-to-tomorrow; the held card no longer shows a standalone Tomorrow (folded into the Move-to picker's chip), but the prop stays for that wiring
  onMakeTiny?: () => void;
  onBig?: () => void; // held-state: mark / unmark this task "a lot"
  onPin?: () => void; // held-state: pin / unpin as the day's one priority (Today one-offs only)
  onMoveUp?: () => void; // held-state: nudge this task one place UP in today's order (absent = already first, renders dimmed)
  onMoveDown?: () => void; // held-state: one place DOWN (absent = already last, renders dimmed)
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
  onBring,
  onRepeat,
  plain,
  washed,
  note,
  inert,
  removesWholeSeries,
  brought,
  bringLabel,
  onShareToOurs,
  origin,
  onMakeTiny,
  onBig,
  onPin,
  onMoveUp,
  onMoveDown,
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
  // The held card can open TALLER than the space beneath it: hold a low task and More +
  // Close land below the fold, which reads as "the card has a flat edge" (Melroy's
  // 2026-08-08 report; the flat line was the viewport, and the way out was off-screen).
  // On web, nudge the scroll just enough that the whole card is visible: block:'nearest'
  // is minimal and instant (no-op when it already fits, inherently reduce-motion-safe).
  // Native RN nodes have no scrollIntoView, so this no-ops there; the native pass
  // belongs to the held-card redesign.
  const cardRef = useRef<View>(null);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => {
      (cardRef.current as unknown as { scrollIntoView?: (opts?: unknown) => void } | null)?.scrollIntoView?.({ block: 'nearest' });
    }, 60); // after the card's layout settles
    return () => clearTimeout(id);
  }, [confirming]);
  // The open (design v2): the card rises in over 180ms with a 4px settle; the fold fades in
  // over 160ms. Reduce-motion is a DESIGNED state, not an absence: a single 90ms dissolve,
  // no translate. useState initializers for Animated values, Bloom's compiler-safe pattern.
  const reducedMotion = useReducedMotion();
  const [cardIn] = useState(() => new Animated.Value(0));
  const [foldFade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!confirming) {
      cardIn.setValue(0);
      return;
    }
    Animated.timing(cardIn, { toValue: 1, duration: reducedMotion ? 90 : 180, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [confirming, reducedMotion, cardIn]);
  useEffect(() => {
    if (!moreOpen) {
      foldFade.setValue(0);
      return;
    }
    Animated.timing(foldFade, { toValue: 1, duration: reducedMotion ? 90 : 160, useNativeDriver: false }).start();
  }, [moreOpen, reducedMotion, foldFade]);
  // Select mode's checkbox cross-fade (the congruency pass): the circle eases in with the mode.
  // The wash ARRIVES instantly and LEAVES over most of a second.
  //
  // Melroy, having watched it: "is there a way to make them disappear in a smooth gradient than just
  // simple switch off?" He is right, and it does not reopen the law. "Nothing animates because of
  // the other person" is about presence and pulsing triggered by your partner; the arrival is still
  // a plain state change, and the fade is the app letting go on its OWN timer, several seconds after
  // anybody did anything. For this audience the snap was the more attention-grabbing of the two.
  //
  // An overlay rather than an animated Pressable: opacity on an absolutely-positioned layer is the
  // one form that cannot disturb the row's touch handling or its style-as-function pressed state.
  const [washFade] = useState(() => new Animated.Value(washed ? 1 : 0));
  const [selFade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(selFade, { toValue: selecting ? 1 : 0, duration: reducedMotion ? 1 : 120, useNativeDriver: false }).start();
  }, [selecting, reducedMotion, selFade]);
  useEffect(() => {
    // On is immediate either way: the mark is information, and information should not creep in.
    // Off is 700ms, or instant for anybody who has asked for less motion.
    const animation = Animated.timing(washFade, {
      toValue: washed ? 1 : 0,
      duration: washed || reducedMotion ? 0 : 700,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [washed, reducedMotion, washFade]);
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
    (nudgeAt ? t('today.rowLabelReminderSuffix', { time: formatNudgeTime(nudgeAt) }) : '') +
    (origin ? t('ours.rowLabelOriginSuffix') : '') +
    (note ? `, ${note}` : '') +
    (inert ? `. ${inert}` : '');

  // Multi-select mode: every row becomes a checkbox (tap to pick), and the calm
  // tap-to-complete / long-press menu are suspended until the user leaves select mode.
  // The circles cross-fade in as the mode opens (the congruency pass); instant under
  // reduce-motion.
  if (selecting) {
    return (
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [styles.row, !recurring && styles.rowUnique, selected && styles.rowSelected, pressed && styles.pressed]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(selected) }}
        accessibilityLabel={t('today.selectRowLabel', { title })}
      >
        <Animated.View style={[styles.selectDot, selected && styles.selectDotOn, { opacity: selFade }]}>{selected && <Text style={styles.tick}>✓</Text>}</Animated.View>
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
    // A task already split into steps does not need decomposing or shrinking again.
    const canBreakdown = Boolean(onBreakdown && !recurring && !slices);
    const canSteps = Boolean(onSteps && !recurring);
    const canTiny = Boolean(onMakeTiny && !recurring && !slices);
    const canPin = Boolean(onPin && !recurring);

    // The way out, shared by both variants: Close (safe, easy reach, bottom-left), Select more, then
    // Remove (far right, out of the reflex path). On a repeating task, Remove is "Skip today": the
    // series continues, so the label must say so.
    //
    // Unless the caller's Remove actually ends the series, which is the case on the SHARED list: it
    // has no per-day skip, so borrowing the reassuring label there promised "just today" and then
    // deleted the whole repeat, for two people, unrecoverably. The label follows what the button
    // does, never the row's shape.
    const skips = recurring && !removesWholeSeries;
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
        {/* Only when there is something to remove. A closed list passes no handler, and the control
            used to render anyway: a live-looking Remove that did nothing at all. */}
        {onRemove && (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={skips ? t('repeat.skipTodayA11y', { title }) : recurring ? t('repeat.removeSeriesA11y', { title }) : t('today.removeTaskLabel', { title })}
          hitSlop={{ top: 12, bottom: 12 }}
        >
          <Text style={styles.remove}>{skips ? t('repeat.skipToday') : t('common.remove')}</Text>
        </Pressable>
        )}
      </View>
    );

    // A finished task: a deliberately minimal card. The honest correction (which day it happened) and
    // the way out, nothing to shape (a finished thing needs nothing shaped) and no "Done". A calm close.
    // The rise: shared by both card variants. Reduce-motion holds the geometry (dissolve only).
    const riseStyle = {
      opacity: cardIn,
      transform: [{ translateY: reducedMotion ? 0 : cardIn.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
    };

    if (done) {
      return (
        <Animated.View ref={cardRef} style={[styles.row, styles.confirmRow, styles.confirmColumn, riseStyle]}>
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
          {/* The inscription sits ABOVE the shelf (v2): the card's last word before its floor. */}
          <Text style={styles.doneIsDone}>{t('today.heldDoneIsDone')}</Text>
          {terminalRow}
        </Animated.View>
      );
    }

    // An open task: the v2 card ("Four species, four grammars"). The More preview names its
    // everyday contents; Pin deliberately stays out of it (premium recedes, never advertises).
    const hasMore = canSteps || canPin || Boolean(onNudge) || Boolean(onShareToOurs);
    const morePreview = [canSteps && t('today.steps'), onNudge && t('reminders.remindMe'), onShareToOurs && t('ours.shareTo')].filter(Boolean).join(' · ');
    const undoOff = !slices || slices.done <= 0;
    return (
      <Animated.View ref={cardRef} style={[styles.row, styles.confirmRow, styles.confirmColumn, riseStyle]}>
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

        {/* The shared card's hero, in the seat Break it down holds on a personal one: the only action
            that moves anything between the two lists, and the design's answer to "nothing crosses
            without a person choosing it". Inert once the copy exists, so a second tap cannot make a
            second copy of the same row. */}
        {onBring &&
          (brought ? (
            <View style={styles.actionRow}>
              <Text style={[styles.actionLabel, styles.broughtLabel]}>{t('ours.broughtAlready')}</Text>
            </View>
          ) : (
            <Pressable
              onPress={onBring}
              style={[styles.actionRow, styles.heroRow]}
              accessibilityRole="button"
              accessibilityLabel={bringLabel ?? t('ours.bring')}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text style={[styles.actionLabel, styles.heroLabel]}>{bringLabel ?? t('ours.bring')}</Text>
              {/* A REPEAT crosses as one dated copy and does not inherit the rhythm: the cadence
                  stays on the shared list, which is the only place it repeats. "a copy" was true
                  and vague; Melroy had to ask what happens, which means it was not saying it. */}
              <Text style={[styles.actionSub, styles.heroSub]}>{t(recurring ? 'ours.bringSubRepeat' : 'ours.bringSub')}</Text>
            </Pressable>
          ))}

        {onRepeat && (
          <Pressable
            onPress={onRepeat}
            style={styles.actionRow}
            accessibilityRole="button"
            accessibilityLabel={t('ours.repeat')}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.actionLabel}>{t('ours.repeat')}</Text>
            {recurring ? <Text style={styles.actionSub}>↻</Text> : null}
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
        {/* The rail (design v2): the reorder pair as ONE segmented, hairline-bordered control.
            Bordered = act-and-stay, the card's only such element (three places is three taps
            with the card held open, never three long-presses). An edge dims its cell in place;
            a pinned task rests the WHOLE rail (the pin holds the top by other means).

            "Always rendered" means always on a surface that HAS reordering. On the shared list and
            the From Ours strip neither handler is ever supplied, so the rail sat there permanently
            dead: two controls that can never do anything, on the screen briefed to be plainer than
            Today. Dim-in-place is for a control that is sometimes live; a control that is never live
            is just furniture. */}
        {(onMoveUp || onMoveDown) && (
        <View style={styles.rail}>
          <Pressable
            onPress={onMoveUp}
            disabled={!onMoveUp}
            style={styles.railCell}
            accessibilityRole="button"
            accessibilityState={{ disabled: !onMoveUp }}
            accessibilityLabel={onMoveUp ? t('today.moveUpA11y', { title }) : t('today.moveUpUnavailA11y')}
          >
            <Text style={[styles.railLabel, !onMoveUp && styles.railOff]}>{t('today.moveUp')}</Text>
          </Pressable>
          <View style={styles.railDivider} />
          <Pressable
            onPress={onMoveDown}
            disabled={!onMoveDown}
            style={styles.railCell}
            accessibilityRole="button"
            accessibilityState={{ disabled: !onMoveDown }}
            accessibilityLabel={onMoveDown ? t('today.moveDownA11y', { title }) : t('today.moveDownUnavailA11y')}
          >
            <Text style={[styles.railLabel, !onMoveDown && styles.railOff]}>{t('today.moveDown')}</Text>
          </Pressable>
        </View>
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
              <Animated.View style={{ opacity: foldFade }}>
                {/* The purified fold (v2): Steps, Undo a step, Remind me, and Pin LAST, so
                    premium recedes rather than advertises. Unavailable dims in place with an
                    honest reason, never disappears. */}
                {/* Sharing your own task onto the list. In the FOLD, never a lead action: it is
                    rare, it is deliberate, and it puts your words in front of another person. Only
                    rendered when a live list exists, which the caller decides. */}
                {onShareToOurs && (
                  <Pressable
                    onPress={onShareToOurs}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={t('ours.shareTo')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.actionLabel}>{t('ours.shareTo')}</Text>
                  </Pressable>
                )}
                {canSteps && (
                  <Pressable
                    onPress={onSteps}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={slices ? t('today.changeStepsA11y') : t('today.splitStepsA11y')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.actionLabel}>{t('today.steps')}</Text>
                    <Text style={styles.actionSub}>
                      {slices ? t('today.stepsOf', { done: slices.done, total: slices.total }) : t('today.stepsCountHint')}
                    </Text>
                  </Pressable>
                )}
                {canSteps && onRetreat && (
                  <Pressable
                    onPress={onRetreat}
                    disabled={undoOff}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: undoOff }}
                    accessibilityLabel={t('today.stepBackLabel', { title })}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={[styles.actionLabel, undoOff && styles.controlOff]}>{t('today.undoAStep')}</Text>
                    {undoOff && <Text style={[styles.actionSub, styles.controlOff]}>{t('today.noStepsYet')}</Text>}
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
                {canPin && (
                  <Pressable
                    onPress={onPin}
                    style={[styles.actionRow, styles.moreItem]}
                    accessibilityRole="button"
                    accessibilityLabel={pinned ? t('today.unpinA11y') : t('today.pinA11y')}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    {/* Dimmed, not hidden, for a free user; the honey ✦ is the premium mark
                        (never a lock: locks read as denial). Pinned reads as a settled state. */}
                    <View style={styles.pinLead}>
                      <Text style={[styles.actionLabel, pinned && styles.pinnedLabel, pinDim && styles.premiumDim]}>
                        {pinned ? t('today.pinnedTick') : t('today.pin')}
                      </Text>
                      {!pinned && (
                        <Text style={[styles.premiumStar, pinDim && styles.premiumDim]} accessible={false} importantForAccessibility="no">
                          ✦
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.actionSub, pinDim && styles.premiumDim]}>{t('today.pinHint')}</Text>
                  </Pressable>
                )}
              </Animated.View>
            )}
          </>
        )}

        {terminalRow}
      </Animated.View>
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
      onPress={inert ? undefined : onToggle}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.row,
        !recurring && !plain && styles.rowUnique,
        pinned && styles.rowPinned,
        pressed && !inert && styles.pressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled: Boolean(inert) }}
      accessibilityLabel={rowLabel}
    >
      <Animated.View pointerEvents="none" style={[styles.washLayer, { opacity: washFade }]} />
      <View style={styles.rowMain}>
        <CheckCircle done={done} />
        {big ? <Text style={styles.bigMark} accessible={false} importantForAccessibility="no">{t('today.bigTag')}</Text> : null}
        <MarqueeText text={title} style={[styles.text, done && styles.textDone]} />
        {/* Your copy is marked, the shared row is NOT. Any marker over there would be attribution
            through the side door: "somebody pulled this" is one inference from "somebody". */}
        {origin ? <Text style={styles.originMark} accessible={false} importantForAccessibility="no">{origin}</Text> : null}
        {nudgeAt ? <Text style={styles.nudgeMark} accessible={false} importantForAccessibility="no">{formatNudgeTime(nudgeAt)}</Text> : null}
        {recurring && <Text style={styles.repeatMark} accessible={false} importantForAccessibility="no">↻</Text>}
        {/* the pin star sits last, at the extreme right, so it stays the clear cue beside any other mark */}
        {pinned ? <Text style={styles.pinStar} accessible={false} importantForAccessibility="no">★</Text> : null}
      </View>
      {/* THE NOTE, and until now it has never been visible to anybody.
          The prop existed, two screens passed it, and the only thing that ever consumed it was the
          accessibility label, so the room's "changed since you looked" and the new "no longer on
          <list>" were spoken to screen readers and shown to nobody. Its own comment claimed "in
          WORDS as well as colour", which is the shape of the whole defect: a stated intention that
          nothing implemented. Melroy found it the only way it could be found, by looking.
          `accessible={false}` because the words are already inside the row's spoken label; rendering
          them again here would read the row's state out twice. */}
      {/* `inert` rides the same line as `note`, and for the same reason it was written: "the reason
          travels WITH the control, so a screen reader hears it and a tap is never silently dead".
          It reached only the spoken label, so on a closed list a sighted person tapped a row that
          did nothing and was told nothing, which is the exact failure the room's comment claims to
          have fixed. `note` wins when both are set: a wash is news, an inert reason is a standing
          condition you can also read from the row being closed. */}
      {note ?? inert ? (
        <Text style={styles.rowNote} accessible={false} importantForAccessibility="no">{note ?? inert}</Text>
      ) : null}
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
    // The row's CONTENT line. Everything that used to sit directly on `row` lives here now, so a
    // note can take a second line without every mark on the first one re-flowing around it.
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.four, alignSelf: 'stretch' },
    // Quiet, and in the body colour: this is a fact about the row, not an alarm about it.
    rowNote: {
      color: t.colors.inkFaint,
      fontSize: 13 * t.scale,
      fontFamily: fonts.body,
      marginTop: spacing.one,
      // Clear of the check circle, so it reads as belonging to the title rather than to the control.
      marginLeft: 24 + spacing.four,
    },
    row: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 0,
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
    // The done card's inscription: the serif voice (like Today's rotating line), above the shelf.
    doneIsDone: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', textAlign: 'center', paddingTop: spacing.two, paddingBottom: spacing.one },
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
    // The hero seat once the copy exists: a settled fact, in the quiet voice, not a dead button.
    broughtLabel: { color: t.colors.inkFaint },
    // The quiet wash, on the row's OWN surface. It was a wrapper with its own border, which drew a
    // second ring around the card and read as a rendering fault rather than a signal: Melroy's first
    // question on seeing it was "what does the outer boundary mean?", which is the whole verdict.
    washLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: radius.md,
      borderWidth: border.thin,
      borderColor: t.colors.accent,
      backgroundColor: t.colors.accentSoft,
    },
    // The faint "· Ours" on YOUR copy. Quiet enough to be a fact and not a badge.
    originMark: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginLeft: spacing.two },
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
    // The rail (v2): one segmented hairline-bordered control, the card's ONLY bordered element
    // because it is the only act-and-stay element. In Quiet the border goes (whitespace
    // separates the two labels), same heights, same targets.
    rail:
      t.appearance === 'quiet'
        ? { flexDirection: 'row', alignItems: 'stretch', minHeight: 44 }
        : { flexDirection: 'row', alignItems: 'stretch', minHeight: 44, borderWidth: border.hair, borderColor: t.colors.line, borderRadius: radius.sm, overflow: 'hidden' },
    railCell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.one },
    railDivider: t.appearance === 'quiet' ? { width: spacing.three } : { width: border.hair, backgroundColor: t.colors.line },
    railLabel: { ...t.type.label, color: t.colors.ink },
    // Dim in place, never remove: the card must not reshape under a hovering finger.
    railOff: { color: t.colors.inkFaint, opacity: 0.7 },
    // Pin, the fold's last resident: the honey ✦ (the inscription gold, accents[2], the closest
    // thing to honey every palette carries) marks premium without a lock.
    pinLead: { flexDirection: 'row', alignItems: 'center', gap: spacing.one },
    premiumStar: { color: t.colors.accents[2], fontSize: 12 * t.scale },
    premiumDim: { opacity: 0.6 },
    pinnedLabel: { color: t.colors.accent },
    // The shelf (v2): the card's floor. A quiet surface-tint band flush to the card's edges,
    // rounded into its bottom corners, holding Close (easy thumb), Select more, Remove (far).
    // Quiet keeps its chrome-free hairline instead of a band.
    terminalRow:
      t.appearance === 'quiet'
        ? {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.three,
            borderTopWidth: border.hair,
            borderColor: t.quiet.hairline,
            paddingTop: spacing.three,
            paddingHorizontal: spacing.two,
            marginTop: spacing.one,
            minHeight: 44,
          }
        : {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.three,
            minHeight: 52,
            marginTop: spacing.two,
            marginHorizontal: -spacing.four,
            marginBottom: -spacing.four,
            paddingHorizontal: spacing.four,
            borderTopWidth: border.hair,
            borderColor: t.colors.line,
            borderBottomLeftRadius: radius.md,
            borderBottomRightRadius: radius.md,
            backgroundColor: t.scheme === 'dark' ? 'rgba(0,0,0,0.16)' : 'rgba(43,39,34,0.035)',
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
