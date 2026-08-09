import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { t } from '@/lib/locale';
import { createInvite, forgetPair, joinPair, leavePair, loadMyPair, type MyPair, renamePair } from '@/lib/ours-api';
import { formatCode, isCodeComplete, looksLikeEmail, type PairFailure } from '@/lib/pairing';
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

  const refresh = useCallback(async () => {
    if (!supabase || !session) {
      setPair(null);
      setLoading(false);
      return;
    }
    const res = await loadMyPair(supabase, session.user.id);
    if (res.ok) {
      const next = res.value;
      const has = !!next?.partnerLabel;
      if (has && hadPartner.current === false) setArrived(next?.partnerLabel ?? null);
      hadPartner.current = has;
      setPair(next);
    }
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const waiting = !!pair && !pair.partnerLabel && !pair.closedAt;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void refresh();
    }, WAIT_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  // A failed session is a state, not a scolding: fall through to the sign-in explanation.
  function report(f: PairFailure) {
    setFailure(f === 'signed-out' ? null : f);
  }

  async function submitCreate() {
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
    setBusy(true);
    setFailure(null);
    const res = await joinPair(supabase, typedCode, myLabel);
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    setTypedCode('');
    setFlow('idle');
    setJoinedWith(res.value.partnerLabel);
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
    const res = await leavePair(supabase, pair.pairId);
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

  async function forget() {
    if (!supabase || !pair || busy) return;
    setBusy(true);
    setFailure(null);
    const res = await forgetPair(supabase, pair.pairId);
    setBusy(false);
    if (!res.ok) {
      report(res.failure);
      return;
    }
    setPair(null);
    hadPartner.current = null;
    setFlow('idle');
    void refresh();
  }

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

  function body() {
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

    if (loading) return null;

    // Frozen: someone left. Reads stay, writes stop, and the copy has to be literally true, because
    // a person reading this has just been left and will check.
    if (pair?.closedAt) {
      return (
        <View style={styles.block}>
          <Text style={styles.title}>{t('ours.frozenTitle')}</Text>
          <Text style={styles.lead}>{t('ours.frozenBody')}</Text>
          <Pressable onPress={forget} disabled={busy} accessibilityRole="button" accessibilityLabel={t('ours.forget')} hitSlop={6}>
            <Text style={styles.quietAction}>{t('ours.forget')}</Text>
          </Pressable>
        </View>
      );
    }

    // Sharing with someone.
    if (pair?.partnerLabel) {
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
          <Text style={styles.lead}>{t('ours.sharingWith', { name: pair.partnerLabel })}</Text>

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
        </View>
      );
    }

    // A live pair with nobody else in it: the code is either still in hand, or gone with the last
    // visit to this screen. Both are the same waiting, so they share a state.
    if (pair) {
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
              setFlow('create');
              setCode(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('ours.newCode')}
            hitSlop={6}
          >
            <Text style={styles.quietAction}>{t('ours.newCode')}</Text>
          </Pressable>
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

    // Nothing yet: the one screen that has to explain what this is without selling it.
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
    error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.four },
  });
