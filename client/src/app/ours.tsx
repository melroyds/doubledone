import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { t } from '@/lib/locale';
import {
  createInvite,
  forgetPair,
  inviteToResume,
  joinPair,
  leavePair,
  loadMyPairs,
  type MyPair,
  renamePair,
  renameSelf,
  resumePair,
} from '@/lib/ours-api';
import { formatCode, isCodeComplete, looksLikeEmail, type PairFailure } from '@/lib/pairing';
import { loadTuckedPairs, tuckPair, untuckPair } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

// Ours: the pairing screen. Phase 2 of docs/ours-build-plan.md, so this is the door in and out of a
// shared list and nothing else yet; the list itself arrives in phase 3.
//
// The shape of the whole screen is ONE state at a time, decided by what the server says, because
// the alternative (everything on screen with things disabled) is exactly the wall of options this
// audience cannot read. In order: signed out · nothing yet · naming it · the code · waiting ·
// sharing · frozen. A local `flow` only ever picks between the states the server leaves open.
//
// Two laws from docs/shared-lists.md §4 are load-bearing in here and must survive every edit:
// no email address is ever rendered back to anyone, and nothing on this screen counts, compares or
// attributes anything to either person.

type Flow = 'idle' | 'create' | 'code' | 'join';

/**
 * How long the delete window stays open.
 *
 * It is NOT a countdown, and nothing on screen shows one. Deletion commits when the SCREEN CLOSES,
 * which is the honest version of the undo the Phase 3 audit asked for: an undo toast on an
 * unrecoverable delete would have been a lie, and a visible timer is a pressure device pointed at
 * exactly the audience least able to think under one. This constant only exists so a screen left
 * open all night does not hold the intent forever.
 */
const DELETE_WINDOW_MS = 30 * 60_000;

/**
 * The month a closed list closed, in the reader's own locale.
 *
 * Month and year, never a date and never a time. A to-the-minute stamp on the end of a relationship
 * is a thing to flinch at every time the archive is opened, and nothing here needs the precision.
 * `DateTimeFormat` is the Intl pair proven safe on Hermes; anything newer would need a feature
 * detect (see CLAUDE.md's Intl gotcha).
 */
function closedMonth(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(when);
  } catch {
    return String(when.getFullYear());
  }
}

// Every failure the seam can hand back, in the words this app is willing to say. 'signed-out' is
// deliberately absent: it is not an error line but a state, and it flips the whole screen to the
// sign-in explanation instead of shouting at someone whose session quietly expired.
const FAILURE_LINE: Record<Exclude<PairFailure, 'signed-out'>, string> = {
  'not-open': 'ours.errNotOpen',
  'already-paired': 'ours.errAlreadyPaired',
  'list-full': 'ours.errListFull',
  'bad-email': 'ours.errBadEmail',
  'own-email': 'ours.errOwnEmail',
  'invalid-code': 'ours.errInvalidCode',
  'rate-limited': 'ours.errRateLimited',
  'too-many-lists': 'ours.errTooManyLists',
  'not-yours': 'ours.errNotYours',
  // 'already-live' is deliberately absent: it is answered by refreshing, not by explaining.
  'already-live': 'ours.errUnknown',
  'partner-gone': 'ours.errPartnerGone',
  'bad-name': 'ours.errBadName',
  offline: 'ours.errOffline',
  unknown: 'ours.errUnknown',
};

// The presets answer "what is this list for", which is the question that makes two people agree on
// one thing before they start filling it. Labels resolve through t() at render (not module load),
// so a locale change is honoured, and the chosen WORD is what gets stored: a list named in the
// language its household speaks, rather than a key that renders differently on each phone.
const PRESETS = ['ours.presetShop', 'ours.presetHouse', 'ours.presetCare', 'ours.presetJustUs'] as const;

// How often the waiting screen looks again for the other person. Ten seconds is a person watching a
// kettle, not a poll: it only runs while this screen is focused AND nobody has joined yet.
const WAIT_POLL_MS = 10_000;

/** A ceiling on the whole waiting poll. The invite lives 24 hours, so past that the answer cannot
 *  change, and long before that a screen left open is a battery and somebody's row count. */
const WAIT_POLL_CEILING_MS = 30 * 60_000;

export default function OursScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const session = useSession();

  const [loading, setLoading] = useState(true);
  const [pair, setPair] = useState<MyPair | null>(null);
  const [flow, setFlow] = useState<Flow>('idle');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PairFailure | null>(null);

  // The create form.
  const [name, setName] = useState('');
  const [ownName, setOwnName] = useState(false); // "name it yourself" chosen, so the field is open
  const [myLabel, setMyLabel] = useState('');
  const [theirEmail, setTheirEmail] = useState('');

  // The minted code. Memory only, and deliberately so: the server returns it exactly once and never
  // stores anything we could read back, so leaving this screen loses it and the way to another is a
  // fresh invite. That is the property that makes a code worth trusting.
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The join form.
  const [typedCode, setTypedCode] = useState('');

  // The two "someone is here now" beats, each with its own way out for the person who has just
  // realised this is not who they meant.
  const [joinedWith, setJoinedWith] = useState<string | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);

  // Renaming, so a typo made at the kitchen table is not permanent for the life of the list.
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // null until the first read lands, so an already-shared list opened fresh does not announce a
  // partner who joined days ago. Only a false→true flip is an arrival.
  const hadPartner = useRef<boolean | null>(null);
  // A read SUCCEEDED at least once. Without it a failed read left `pair` null and the screen
  // offered to start a list to someone who already has one, which then either contradicts itself
  // with "you already have a shared list" or, worse, re-mints and kills the code their person is
  // holding.
  const [loaded, setLoaded] = useState(false);
  // Newest-issued-wins. Seven call sites, two sequential queries inside loadMyPair, and no
  // sequencing: whichever reply landed LAST won, regardless of which snapshot was older. So the
  // waiting screen could announce an arrival, drop back to waiting, and announce it again, and a
  // rename's slow read landing after a Leave could restore a live pair and a live Leave button for
  // someone who had already left. The beat that flickered carries `leave`, which is permanent for
  // both people, and the likeliest response to a screen that looks broken is to tap the escape.
  const pass = useRef(0);
  // Closed lists. Readable forever, ranked behind the live one, and never in the way: `tucked` is
  // the local set you have put away, and it only hides them from the default view.
  const [archive, setArchive] = useState<MyPair[]>([]);
  const [tucked, setTucked] = useState<string[]>([]);
  const [showTucked, setShowTucked] = useState(false);
  // Reopening. The code is minted with no email re-ask, because the address is already on the
  // membership: making somebody retype their person's email to un-close a list they both kept is
  // asking them to prove a relationship the database already knows about.
  const [resumeFor, setResumeFor] = useState<string | null>(null);
  const [resumeCode, setResumeCode] = useState<string | null>(null);
  // Your own name on this list. `pair_members` has no update policy by design, which is what stops
  // either person editing the other's row, so this goes through a definer RPC scoped to auth.uid().
  const [selfEditing, setSelfEditing] = useState(false);
  const [selfText, setSelfText] = useState('');
  // The delete window: which list is pending deletion, and the timer that gives up on it. Nothing
  // has been told to anyone until the screen closes, and one tap keeps it.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Reported this session. Deliberately NOT persisted and never read back from the server: a
  // report that leaves a mark is a report the other person could notice.
  const [reported, setReported] = useState(false);
  const pendingRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const mine = ++pass.current; // bumped BEFORE the early return, so a session ending also invalidates
    if (!supabase || !session) {
      setPair(null);
      setLoading(false);
      return;
    }
    const res = await loadMyPairs(supabase, session.user.id);
    if (mine !== pass.current) return; // overtaken: a newer pass owns the screen
    if (res.ok) {
      // The frozen FALLBACK, which the archive work dropped and which this whole screen is written
      // against. `loadMyPair` (singular) has always returned `live ?? frozen[0]`; swapping to
      // `loadMyPairs` and taking only `.live` made `frozen` permanently false, so the entire "This
      // list is closed" state stopped rendering and took Reopen-together and Delete-for-good with
      // it. The person who had just been left got the intro screen offering to start a new list,
      // which is the exact reading that copy exists to prevent.
      const next = res.value.live ?? res.value.frozen[0] ?? null;
      // Whatever is being shown as the current list is not also listed underneath itself.
      setArchive(res.value.frozen.filter((p) => p.pairId !== next?.pairId));
      setTucked(await loadTuckedPairs());
      if (mine !== pass.current) return;
      // hasPartner, not the label. Fixing `waiting` and the sharing branch and leaving THIS one is
      // how a labelless member would have had their arrival announced weeks late: `has` would stay
      // false while `waiting` correctly flipped off, and the first time they set a name the app
      // would say "{name} joined." with a Leave prompt, deep into a shared list.
      const has = !!next?.hasPartner;
      if (has && hadPartner.current === false) setArrived(next?.partnerLabel ?? null);
      hadPartner.current = has;
      setPair(next);
      setLoaded(true);
    } else {
      // setFailure directly rather than report(): a READ can never return 'already-live' (only the
      // two resume RPCs raise it), so the refresh-instead-of-explain branch cannot apply here, and
      // depending on `report` would rebuild this callback on every render.
      setFailure(res.failure === 'signed-out' ? null : res.failure);
    }
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // `disabled_at` is the abuse kill switch and `is_pair_writable` treats it exactly like
  // `closed_at`, so a killed pair used to render as "Sharing with Sam" with an editable name, and a
  // rename then answered "This list is closed to changes" underneath a heading saying it was live.
  // The shipped frozen copy is literally true for a killed list, so this needs no new strings.
  const frozen = !!(pair?.closedAt || pair?.disabledAt);
  // Keyed on whether a second person is IN the list, not on whether they have a name. A member with
  // no label is legal in the column, and keying on the label rendered "waiting for someone to join"
  // over a list two people were actively using.
  const waiting = !!pair && !pair.hasPartner && !frozen;

  // #15: the poll had no focus gate, no app-state gate and no ceiling, so a tab left open made two
  // Supabase reads every ten seconds all night, long after the 24-hour invite TTL had made the
  // answer impossible. A lifetime ceiling and a foreground check, and a refresh on returning so
  // nobody is stranded on a stale screen.
  useEffect(() => {
    if (!waiting) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > WAIT_POLL_CEILING_MS) return;
      if (AppState.currentState !== 'active') return;
      void refresh();
    }, WAIT_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [waiting, refresh]);

  // A failed session is a state, not a scolding: fall through to the sign-in explanation. And
  // 'already-live' is not a failure the user needs told about: they asked to wake a list, and it
  // turns out their person already woke it, so the state they wanted is the state that exists. A
  // refresh shows it to them. Explaining an error would be pedantry at the warmest possible moment.
  function report(f: PairFailure) {
    if (f === 'already-live') {
      void refresh();
      return;
    }
    setFailure(f === 'signed-out' ? null : f);
  }

  async function submitCreate() {
    // Same guard as the join path and as `rename_self`: an empty label falls through to the
    // server's fallback and the OTHER person reads "Kept with me" forever.
    if (!myLabel.trim()) {
      setFailure('bad-name');
      return;
    }
    if (!supabase || busy) return;
    if (!looksLikeEmail(theirEmail)) {
      setFailure('bad-email');
      return;
    }
    setBusy(true);
    setFailure(null);
    // An untouched name travels as empty, which the seam turns into a null, which renders as the
    // app's own word in each reader's own language. Skipping the question is a first-class answer.
    const res = await createInvite(supabase, theirEmail, myLabel, name);
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    setCode(res.value.code);
    setCopied(false);
    setFlow('code');
    // Seeded from the RPC's OWN return, before the two-query refresh lands. Without this, `pair` is
    // still null for the round trip and body() falls through to the intro screen: someone who just
    // tapped "Get a code" is looking at "Start a shared list". If that refresh then fails, that is
    // the resting state, and the code is unrecoverable because the server returns it exactly once.
    setPair((prev) => prev ?? {
      pairId: res.value.pairId,
      name: name || null,
      myLabel: myLabel || null,
      partnerLabel: null,
      hasPartner: false, // a code has been minted and nobody has redeemed it yet
      closedAt: null,
      disabledAt: null,
    });
    setLoaded(true);
    // The moat's shape, not a funnel: an invite was offered. No address, no name, no id.
    track('ours.invited');
    void refresh();
  }

  async function submitJoin() {
    if (!supabase || busy) return;
    if (!isCodeComplete(typedCode)) {
      setFailure('invalid-code');
      return;
    }
    // The name is not optional, whatever the field's calm placeholder suggests: skipping it let the
    // server's fallback through, and the OTHER person then read "Kept with me" and "Sharing with
    // me" forever. `renameSelf` already refuses an empty label; both entry points must too.
    if (!myLabel.trim()) {
      setFailure('bad-name');
      return;
    }
    setBusy(true);
    setFailure(null);
    // ONE field for both kinds of code, and the person typing never learns there were two. A code
    // that opens a NEW list and a code that reopens a closed one look identical and are typed in
    // the same place, so the app tries the ordinary join and falls through to the reopen rather
    // than making somebody know which sort of invitation they were handed.
    let res = await joinPair(supabase, typedCode, myLabel);
    // The fall-through costs a SECOND attempt against the same hourly ceiling, so a mistyped code
    // used to spend two of ten and lock somebody out after five wrong guesses instead of ten. It is
    // now skipped entirely when the server has already said the account is being throttled, and
    // when there is no closed list of ours for a resume code to belong to.
    if (!res.ok && res.failure === 'invalid-code' && archive.length > 0) {
      res = await resumePair(supabase, typedCode);
    }
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    setTypedCode('');
    setFlow('idle');
    setJoinedWith(res.value.partnerLabel);
    // Same reason as the mint above: a successful join briefly read as nothing having happened.
    setPair({
      pairId: res.value.pairId,
      name: res.value.pairName,
      myLabel: myLabel || null,
      partnerLabel: res.value.partnerLabel,
      hasPartner: true, // you just joined THEIR list, so the other person is by definition in it
      closedAt: null,
      disabledAt: null,
    });
    setLoaded(true);
    hadPartner.current = true; // joining is not an arrival: I am the one who arrived
    track('ours.joined');
    void refresh();
  }

  async function share() {
    if (!code) return;
    const message = t('ours.shareMessage', { code: formatCode(code) });
    if (Platform.OS === 'web') {
      const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
      try {
        if (nav.share) {
          await nav.share({ text: message });
          return;
        }
        if (nav.clipboard) {
          await nav.clipboard.writeText(message);
          setCopied(true);
        }
      } catch {
        // Nothing to recover: the code is on screen and selectable, which was always the real path.
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      // Same. A closed share sheet is a person changing their mind, not a failure.
    }
  }

  async function leave() {
    if (!supabase || !pair || busy) return;
    setBusy(true);
    setFailure(null);
    // "Nobody has joined, so there is nothing to close. The code stops working." That is what the
    // hint promises, and `leave_pair` was quietly freezing it into the archive forever instead.
    // Deleting your own membership fires `prune_empty_pair`, which finds nobody left and disposes
    // of the pair and its cascade: no partner, no shared words, nothing to keep and nobody to keep
    // it from. With a partner it stays a freeze, which is the whole never-delete-their-words rule.
    const res = pair.hasPartner ? await leavePair(supabase, pair.pairId) : await forgetPair(supabase, pair.pairId);
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    setJoinedWith(null);
    setArrived(null);
    setCode(null);
    hadPartner.current = null;
    track('ours.left');
    void refresh();
  }

  /** Put a closed list away. Local, per person, and never destructive: it stops being in the way,
   *  it does not stop existing, and the toggle below brings the put-away ones back into view. */
  async function putAway(pairId: string) {
    await tuckPair(pairId);
    setTucked(await loadTuckedPairs());
  }

  async function bringBackOut(pairId: string) {
    await untuckPair(pairId);
    setTucked(await loadTuckedPairs());
  }

  /** Offer to reopen. Mints a code against a CLOSED list; the other person redeems it in the same
   *  one field they would use to join anything. Never unilateral: reopening is a handshake, exactly
   *  as pairing was, because the alternative is one person deciding a relationship is back on. */
  async function offerResume(pairId: string) {
    if (!supabase || busy) return;
    setBusy(true);
    setFailure(null);
    const res = await inviteToResume(supabase, pairId);
    setBusy(false);
    if (!res.ok) return report(res.failure);
    setResumeFor(pairId);
    setResumeCode(res.value.code);
    track('ours.resumeOffered');
  }

  /** Your own name, on this list. Not the other person's, which no policy allows and no screen offers. */
  async function saveSelf() {
    const label = selfText.trim();
    setSelfEditing(false);
    if (!supabase || !pair || !label || label === pair.myLabel) return;
    const res = await renameSelf(supabase, pair.pairId, label);
    if (!res.ok) return report(res.failure);
    void refresh();
  }

  /**
   * Delete for good, on a delay that is not a countdown.
   *
   * Asking commits NOTHING. The intent is held, one tap keeps the list, and the delete actually
   * runs when the screen closes. That is the honest version of the undo the Phase 3 audit asked
   * for: `forget_pair` cascades and cannot be reversed, so an undo toast over it would have been a
   * lie, and a visible timer over it would be a pressure device aimed at the audience least able to
   * think under one. Nothing has been told to anyone until you leave.
   */
  /**
   * Report this list. The requirement Apple 1.2 and Play both put on anything two people can write
   * into: a way to flag objectionable content, from inside the product, without leaving it.
   *
   * It reuses the existing `/feedback` route rather than growing a second reporting pipe, because a
   * second pipe is a second inbox to forget to read. What travels is a context tag and the PAIR ID,
   * and NOTHING ELSE: no task text, no email address, no name. The pair id is enough for Melroy to
   * find the list in Supabase and act, and it means the report itself cannot become a copy of the
   * thing being reported sitting in an inbox.
   *
   * Reporting does NOT tell the other person, ever, and the screen says so before you tap. Somebody
   * reporting a person they live with may be in a situation where being seen to report is the
   * danger, so the silence is the safety feature, not a courtesy.
   */
  async function report_(pairId: string) {
    if (busy || reported) return;
    setBusy(true);
    // Optimistic and one-way: the whole point is that this never argues with you. A failed send
    // still reads as sent, because the alternative is asking somebody in a bad moment to try again.
    setReported(true);
    try {
      const base = process.env.EXPO_PUBLIC_AI_URL ?? 'https://api.doubledone.app';
      await fetch(`${base}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `Report: shared list ${pairId}`, context: `ours-report/${Platform.OS}` }),
      });
      track('ours.reported');
    } catch {
      // Silence is the promise. There is no error state for this and there must not be one.
    }
    setBusy(false);
  }

  function askDelete(pairId: string) {
    setPendingDelete(pairId);
    setFailure(null);
  }

  function keepIt() {
    setPendingDelete(null);
  }

  async function commitDelete(pairId: string) {
    if (!supabase) return;
    const res = await forgetPair(supabase, pairId);
    if (!res.ok) return;
    if (pair?.pairId === pairId) {
      setPair(null);
      hadPartner.current = null;
      setFlow('idle');
    }
    track('ours.deleted');
  }

  // The ref shadows the state so the unmount cleanup below sees the LATEST answer rather than the
  // one captured when it was registered. Written in an effect, never during render.
  useEffect(() => {
    pendingRef.current = pendingDelete;
  }, [pendingDelete]);

  // The commit itself: when this screen goes away, with the intent still standing.
  useEffect(
    () => () => {
      const id = pendingRef.current;
      if (id) void commitDelete(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only, by design
    [],
  );

  // And a ceiling, so a screen left open all night does not hold the intent indefinitely.
  useEffect(() => {
    if (!pendingDelete) return;
    const timer = setTimeout(() => setPendingDelete(null), DELETE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [pendingDelete]);

  async function saveName() {
    if (!supabase || !pair || busy) return;
    setRenaming(false);
    if (renameText.trim() === (pair.name ?? '')) return;
    setBusy(true);
    const res = await renamePair(supabase, pair.pairId, renameText);
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    void refresh();
  }

  const listName = pair?.name?.trim() || t('ours.defaultName');
  const errorLine = failure ? t(FAILURE_LINE[failure as Exclude<PairFailure, 'signed-out'>]) : null;

  /** The reopen offer, and the code it mints. Same shape wherever a closed list is shown. */
  function renderReopen(target: MyPair) {
    if (resumeFor === target.pairId && resumeCode) {
      return (
        <View style={styles.beat}>
          <Text style={styles.code} selectable accessibilityLabel={formatCode(resumeCode).split('').join(' ')}>
            {formatCode(resumeCode)}
          </Text>
          <Text style={styles.hint}>{t('ours.resumeCodeBody')}</Text>
        </View>
      );
    }
    // Withheld when the other person is no longer on the list: there is nobody to reopen it WITH,
    // and offering would end in a refusal that reads as a bug rather than as a fact.
    if (!target.hasPartner) return null;
    return (
      <View style={styles.leaveBlock}>
        <Pressable
          onPress={() => void offerResume(target.pairId)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('ours.reopen')}
          hitSlop={6}
        >
          <Text style={styles.link}>{t('ours.reopen')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('ours.reopenHint')}</Text>
      </View>
    );
  }

  /** Delete for good, held open until the screen closes. "Keep it" is the only button, and there is
   *  no countdown, because a visible timer is a pressure device. */
  function renderDelete(target: MyPair) {
    if (pendingDelete === target.pairId) {
      return (
        <View style={styles.leaveBlock}>
          <Text style={styles.hint}>{t('ours.deletePending')}</Text>
          <View style={styles.actions}>
            <PrimaryButton label={t('ours.keepIt')} onPress={keepIt} accessibilityLabel={t('ours.keepIt')} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.leaveBlock}>
        <Pressable
          onPress={() => askDelete(target.pairId)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('ours.forget')}
          hitSlop={6}
        >
          <Text style={styles.quietAction}>{t('ours.forget')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('ours.forgetHint')}</Text>
      </View>
    );
  }

  /**
   * The archive: every closed list, readable forever.
   *
   * Purpose and closed-month only. No task counts, no "you two finished 214 things", nothing that
   * turns a relationship that ended into a scoreboard. Tapping one opens it in the room, read-only.
   */
  function renderArchive() {
    const shown = archive.filter((p) => showTucked || !tucked.includes(p.pairId));
    const hidden = archive.length - shown.length;
    if (archive.length === 0) return null;
    return (
      <View style={styles.archive}>
        <Text style={styles.archiveHeading}>{t('ours.archive')}</Text>
        {shown.map((closed) => (
          <View key={closed.pairId} style={styles.archiveRow}>
            <Pressable
              onPress={() => router.push(`/ours-list?pair=${closed.pairId}`)}
              accessibilityRole="button"
              accessibilityLabel={closed.name?.trim() || t('ours.defaultName')}
              hitSlop={6}
              style={styles.archiveMain}
            >
              <Text style={styles.archiveName}>{closed.name?.trim() || t('ours.defaultName')}</Text>
              {closed.closedAt ? <Text style={styles.archiveWhen}>{closedMonth(closed.closedAt)}</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => void (tucked.includes(closed.pairId) ? bringBackOut(closed.pairId) : putAway(closed.pairId))}
              accessibilityRole="button"
              accessibilityLabel={tucked.includes(closed.pairId) ? t('ours.bringBack') : t('ours.putAway')}
              hitSlop={8}
            >
              <Text style={styles.archiveAction}>{tucked.includes(closed.pairId) ? t('ours.bringBack') : t('ours.putAway')}</Text>
            </Pressable>
          </View>
        ))}
        {hidden > 0 && !showTucked ? (
          <Pressable onPress={() => setShowTucked(true)} accessibilityRole="button" accessibilityLabel={t('ours.showPutAway')} hitSlop={6}>
            <Text style={styles.link}>{t('ours.showPutAway')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function body() {
    // `loading` FIRST: rendering "Sharing needs an account" while the session is still hydrating
    // tells a signed-in person they are signed out, on the screen where that is most alarming.
    if (loading) return null;
    if (!session) {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.signedOutTitle')}</Text>
          <Text style={styles.lead}>{t('ours.signedOutBody')}</Text>
          <View style={styles.actions}>
            <PrimaryButton
              label={t('ours.signIn')}
              onPress={() => router.push('/sign-in')}
              accessibilityLabel={t('ours.signIn')}
            />
          </View>
        </View>
      );
    }

    // Frozen: someone left. Reads stay, writes stop, and the copy has to be literally true, because
    // a person reading this has just been left and will check.
    if (frozen && flow === 'idle') {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.frozenTitle')}</Text>
          <Text style={styles.lead}>{t('ours.frozenBody')}</Text>
          {/* The only irreversible action in the whole feature, and it cannot be undone once the RPC
              returns: there is no INSERT policy on pair_members and no rejoin path, so if the other
              person has also gone, the prune trigger hard-deletes and cascades the tasks. Someone
              bereaved could otherwise delete the last copy of their person's words with nothing
              beside the button. The hint says so, and names the way to keep something first. */}
          {/* Reopening comes FIRST, and it is the mauve one: on a screen somebody reaches after
              being left, the thing they most likely want is the way back, not the way out. */}
          {pair ? renderReopen(pair) : null}

          {/* Then, last and alone, the only irreversible action in the feature. It cannot be undone
              once the RPC returns: there is no INSERT policy on pair_members and no rejoin path, so
              if the other person has also gone, the prune trigger hard-deletes and cascades the
              tasks. Someone bereaved could otherwise delete the last copy of their person's words
              with nothing beside the button. Now nothing happens until this screen closes. */}
          {pair ? renderDelete(pair) : null}

          {/* A frozen list used to be a one-way door out of the entire feature: this branch returned
              before create, join and the idle state, and its only control was the irreversible
              delete, so the answer to "I want to share a list with someone new" was "first
              permanently destroy everything your ex, or your late partner, wrote". The database says
              the opposite everywhere: both pairing functions count LIVE pairs only, a frozen list
              costs no slot, and the schema's own read-back asserts that a person who leaves can pair
              again. The client was the only thing refusing. */}
          <View style={styles.actions}>
            <PrimaryButton label={t('ours.start')} onPress={() => setFlow('create')} accessibilityLabel={t('ours.start')} />
            <Pressable onPress={() => setFlow('join')} accessibilityRole="button" accessibilityLabel={t('ours.joinInstead')} hitSlop={6}>
              <Text style={styles.link}>{t('ours.joinInstead')}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // Sharing with someone.
    if (pair?.hasPartner && !frozen) {
      return (
        <View style={styles.block}>
          {renaming ? (
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              onBlur={saveName}
              onSubmitEditing={saveName}
              autoFocus
              maxLength={40}
              placeholder={t('ours.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              accessibilityLabel={t('ours.namePlaceholder')}
            />
          ) : (
            <Pressable
              onPress={() => {
                setRenameText(pair.name ?? '');
                setRenaming(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('ours.namePlaceholder')}
              hitSlop={6}
            >
              <Text style={styles.title}>{listName}</Text>
            </Pressable>
          )}
          {/* No fallback word. `ours.defaultName` is what the app calls an unnamed LIST, so using it
              here rendered "Sharing with Ours", and in German it is the wrong case as well. The
              header directly above already carries the list's name, so saying nothing is honest and
              costs no new string in five locales. */}
          {pair.partnerLabel ? (
            <Text style={styles.lead}>{t('ours.sharingWith', { name: pair.partnerLabel })}</Text>
          ) : null}

          {/* YOUR name, on this list. Never theirs: `pair_members` has no update policy precisely so
              neither person can edit the other's row, and this goes through a definer RPC scoped to
              auth.uid() rather than opening one. */}
          {selfEditing ? (
            <TextInput
              value={selfText}
              onChangeText={setSelfText}
              onBlur={() => void saveSelf()}
              onSubmitEditing={() => void saveSelf()}
              autoFocus
              maxLength={40}
              placeholder={t('ours.yourNamePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              accessibilityLabel={t('ours.yourName')}
            />
          ) : (
            <Pressable
              onPress={() => {
                setSelfText(pair.myLabel ?? '');
                setSelfEditing(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('ours.yourName')}
              hitSlop={6}
            >
              <Text style={styles.hint}>{t('ours.youAre', { name: pair.myLabel || t('ours.yourNamePlaceholder') })}</Text>
            </Pressable>
          )}

          {joinedWith ? (
            <View style={styles.beat}>
              <Text style={styles.beatText}>{t('ours.joined', { name: joinedWith })}</Text>
              <Pressable onPress={leave} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ours.notThem')} hitSlop={6}>
                <Text style={styles.beatAction}>{t('ours.notThem')}</Text>
              </Pressable>
            </View>
          ) : null}

          {arrived ? (
            <View style={styles.beat}>
              <Text style={styles.beatText}>{t('ours.partnerJoined', { name: arrived })}</Text>
              <Pressable onPress={leave} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ours.wasntWho')} hitSlop={6}>
                <Text style={styles.beatAction}>{t('ours.wasntWho')}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.leaveBlock}>
            <Pressable onPress={leave} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ours.leave')} hitSlop={6}>
              <Text style={styles.quietAction}>{t('ours.leave')}</Text>
            </Pressable>
            <Text style={styles.hint}>{t('ours.leaveHint')}</Text>
          </View>

          {/* One quiet row, last, and never a red button: the people most likely to need this are
              reporting somebody they live with. It says plainly that the other person is not told,
              because being seen to report can be the actual danger. */}
          <View style={styles.leaveBlock}>
            {reported ? (
              <Text style={styles.hint}>{t('ours.reportedBody')}</Text>
            ) : (
              <>
                <Pressable
                  onPress={() => void report_(pair.pairId)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t('ours.report')}
                  hitSlop={6}
                >
                  <Text style={styles.quietAction}>{t('ours.report')}</Text>
                </Pressable>
                <Text style={styles.hint}>{t('ours.reportHint')}</Text>
              </>
            )}
          </View>
        </View>
      );
    }

    // A live pair with nobody else in it: the code is either still in hand, or gone with the last
    // visit to this screen. Both are the same waiting, so they share a state.
    //
    // `flow !== 'create'` is what makes "Get a new code" work at all. Without it this branch
    // returned before the create form could ever render, so the button's only effect was to blank
    // the six characters the user could still have read aloud, while the copy actively told them to
    // press it. The server's deliberate re-mint path, which exists so a mistyped invitee address is
    // recoverable without the hard delete, was unreachable from the app.
    if (pair && !frozen && flow !== 'create') {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.codeTitle')}</Text>
          {flow === 'code' && code ? (
            <>
              <Text style={styles.code} selectable accessibilityLabel={formatCode(code).split('').join(' ')}>
                {formatCode(code)}
              </Text>
              <Text style={styles.lead}>{t('ours.codeBody')}</Text>
              <Text style={styles.hint}>{t('ours.codeHint')}</Text>
              <View style={styles.actions}>
                <PrimaryButton
                  label={copied ? t('ours.copied') : t('ours.share')}
                  onPress={share}
                  accessibilityLabel={t('ours.share')}
                />
              </View>
            </>
          ) : null}
          <Text style={styles.waiting}>{t('ours.waiting')}</Text>
          <Pressable
            onPress={() => {
              // Seed the label, or the re-mint's `update pair_members set label` silently rewrites
              // the creator's chosen name to the server's fallback, "me".
              setMyLabel((prev) => prev || pair.myLabel || '');
              setName((prev) => prev || pair.name || '');
              setFlow('create');
              setCode(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('ours.newCode')}
            hitSlop={6}
          >
            <Text style={styles.quietAction}>{t('ours.newCode')}</Text>
          </Pressable>

          {/* #14: someone who made a list to see what it was, and changed their mind, was met with
              "waiting" forever. The server has always had an exit; the screen never called it. Its
              own hint, because leaveHint says "it closes for both of you" and there is no both. */}
          <View style={styles.leaveBlock}>
            <Pressable onPress={leave} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ours.leave')} hitSlop={6}>
              <Text style={styles.quietAction}>{t('ours.leave')}</Text>
            </Pressable>
            <Text style={styles.hint}>{t('ours.leaveAloneHint')}</Text>
          </View>
        </View>
      );
    }

    if (flow === 'create') {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.whatFor')}</Text>
          <View style={styles.chips}>
            {PRESETS.map((key) => (
              <Chip
                key={key}
                label={t(key)}
                selected={!ownName && name === t(key)}
                onPress={() => {
                  setOwnName(false);
                  setName(t(key));
                }}
              />
            ))}
            <Chip
              label={t('ours.presetOwn')}
              selected={ownName}
              onPress={() => {
                setOwnName(true);
                setName('');
              }}
            />
          </View>
          {ownName ? (
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={40}
              placeholder={t('ours.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              accessibilityLabel={t('ours.namePlaceholder')}
            />
          ) : null}

          <Text style={styles.label}>{t('ours.yourName')}</Text>
          <TextInput
            value={myLabel}
            onChangeText={setMyLabel}
            maxLength={40}
            placeholder={t('ours.yourNamePlaceholder')}
            placeholderTextColor={theme.colors.inkFaint}
            style={styles.input}
            accessibilityLabel={t('ours.yourName')}
          />

          <Text style={styles.label}>{t('ours.theirEmail')}</Text>
          <TextInput
            value={theirEmail}
            onChangeText={(v) => {
              setTheirEmail(v);
              if (failure === 'bad-email' || failure === 'own-email') setFailure(null);
            }}
            placeholder={t('ours.theirEmailPlaceholder')}
            placeholderTextColor={theme.colors.inkFaint}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            accessibilityLabel={t('ours.theirEmail')}
          />
          <Text style={styles.hint}>{t('ours.theirEmailHint')}</Text>

          <View style={styles.actions}>
            <PrimaryButton label={t('ours.getCode')} onPress={submitCreate} loading={busy} accessibilityLabel={t('ours.getCode')} />
          </View>
        </View>
      );
    }

    if (flow === 'join') {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.enterCode')}</Text>
          <TextInput
            value={typedCode}
            onChangeText={(v) => {
              setTypedCode(v);
              if (failure === 'invalid-code') setFailure(null);
            }}
            placeholder={t('ours.codePlaceholder')}
            placeholderTextColor={theme.colors.inkFaint}
            style={[styles.input, styles.codeInput]}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            accessibilityLabel={t('ours.enterCode')}
          />
          <Text style={styles.hint}>{t('ours.codeHint')}</Text>

          <Text style={styles.label}>{t('ours.yourName')}</Text>
          <TextInput
            value={myLabel}
            onChangeText={setMyLabel}
            maxLength={40}
            placeholder={t('ours.yourNamePlaceholder')}
            placeholderTextColor={theme.colors.inkFaint}
            style={styles.input}
            accessibilityLabel={t('ours.yourName')}
          />

          <View style={styles.actions}>
            <PrimaryButton label={t('ours.join')} onPress={submitJoin} loading={busy} accessibilityLabel={t('ours.join')} />
          </View>
        </View>
      );
    }

    // Nothing yet: the one screen that has to explain what this is without selling it. Guarded on
    // `loaded`, so a failed read never renders as "you have no shared list" to somebody who has one.
    // Only this final return is guarded: an in-progress create or join form survives a blip.
    // Deliberately blank rather than a spinner or a "loading" word: on a failed read the error line
    // below already says what happened, in the seam's own calm wording, and a quiet screen for the
    // half-second of a good read is the house behaviour everywhere else.
    if (!loaded) return null;

    return (
      <View style={styles.block}>
        <Text style={styles.title}>{t('ours.defaultName')}</Text>
        <Text style={styles.lead}>{t('ours.lead')}</Text>
        <View style={styles.actions}>
          <PrimaryButton label={t('ours.start')} onPress={() => setFlow('create')} accessibilityLabel={t('ours.start')} />
          <Pressable
            onPress={() => setFlow('join')}
            accessibilityRole="button"
            accessibilityLabel={t('ours.joinInstead')}
            hitSlop={6}
          >
            <Text style={styles.link}>{t('ours.joinInstead')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.four }]}>
        <BackLink label={t('common.today')} />
        {body()}
        {/* Under whatever state is showing, so a closed list is reachable from all of them rather
            than only from the one that happened to have room for it. */}
        {session && loaded ? renderArchive() : null}
        {errorLine ? <Text style={styles.error}>{errorLine}</Text> : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: spacing.five,
      paddingBottom: spacing.six,
      maxWidth: layout.maxContentWidth,
      width: '100%',
      alignSelf: 'center',
    },
    block: { marginTop: spacing.five, gap: spacing.three },
    title: { ...t.type.title, color: t.colors.ink },
    lead: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 24 * t.scale },
    label: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', marginTop: spacing.three },
    hint: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 19 * t.scale },
    input: {
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.four,
      paddingVertical: spacing.three,
      fontSize: 16 * t.scale,
      fontFamily: fonts.body,
      color: t.colors.ink,
    },
    // The code is the one thing on this screen a person reads out loud across a room, so it is the
    // one thing allowed to be large.
    code: {
      color: t.colors.ink,
      fontSize: 40 * t.scale,
      fontFamily: fonts.sans,
      fontWeight: '700',
      letterSpacing: 4,
      textAlign: 'center',
      paddingVertical: spacing.three,
    },
    codeInput: { fontSize: 22 * t.scale, letterSpacing: 3, textAlign: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.two },
    actions: { gap: spacing.three, marginTop: spacing.four },
    link: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, textAlign: 'center' },
    waiting: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, marginTop: spacing.four },
    quietAction: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body },
    beat: {
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.md,
      padding: spacing.four,
      gap: spacing.two,
      marginTop: spacing.two,
    },
    beatText: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 23 * t.scale },
    beatAction: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
    leaveBlock: { marginTop: spacing.six, gap: spacing.one },
    // The archive. Quiet rows, purpose and closed-month only: no counts, nothing that turns a
  // relationship that ended into a scoreboard.
  archive: { marginTop: spacing.six, borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.four, gap: spacing.three },
  archiveHeading: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
  archiveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
  archiveMain: { flex: 1 },
  archiveName: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body },
  archiveWhen: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.half },
  archiveAction: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
  error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.four },
  });
