import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, PRESSED_OPACITY, radius, spacing, type Theme } from '@/constants/theme';
import { useSessionState } from '@/lib/auth';
import { t } from '@/lib/locale';
import { BOOKING_URL, fetchMonthAnswer, meetsFloor, type MonthAnswer, retireOfferNow, sendNote, setLastNoteOutcome } from '@/lib/note';
import { usePremium } from '@/lib/premium-provider';
import { periodLabel } from '@/lib/premium-ui';
import { loadNoteDraft, saveGiftOffer, saveNoteDraft } from '@/lib/storage';
import { track } from '@/lib/telemetry';
import { useReducedMotion, useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

const NATIVE_DRIVER = Platform.OS !== 'web';
const SEND_CLEARANCE = 16; // Send's bottom stays at least this far above the keyboard's top

type Phase = 'form' | 'sending' | 'error' | 'given' | 'sent';

// "Write to us" (design_handoff_month_on_us §3, route /note). The one place a note to us is written, from Today's
// offer card and from Settings' Help row alike, so there is one keyboard answer and one saved draft. Every line on
// it follows a SUCCESSFUL eligibility read: until then, and if the read fails, it says only that notes are welcome,
// so a month is never promised that the server will not give. If the server gives one anyway, the thank-you is a
// pleasant surprise. The words are never lost: the draft is saved on every change, kept through Cancel and the
// sign-in trip, and cleared only by a send that landed.
export default function NoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const { session, known } = useSessionState();
  const { premium, refresh } = usePremium();
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const ai = useSettings().settings.aiEnabled;

  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<MonthAnswer | null>(null); // this screen's own read; null until it answers
  const [phase, setPhase] = useState<Phase>('form');
  const [givenUntil, setGivenUntil] = useState<number | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [fade] = useState(() => new Animated.Value(1)); // the repo's compiler-safe Animated pattern
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const sendRef = useRef<View>(null);
  const fieldRef = useRef<TextInput>(null);
  const draftLoaded = useRef(false);
  // Seen signed out on this visit: if a session then arrives, they came back from signing in, and a paying member
  // who was promised "a month once you sign in" is told plainly that they already have Premium.
  const [wasSignedOut, setWasSignedOut] = useState(false);
  if (known && !session && !wasSignedOut) setWasSignedOut(true);

  useEffect(() => {
    let active = true;
    void loadNoteDraft().then((d) => {
      if (!active) return;
      draftLoaded.current = true;
      setText((now) => (now ? now : d)); // a word typed before the draft loaded wins
    });
    return () => {
      active = false;
    };
  }, []);

  // Read eligibility on every focus and whenever the session changes (the sign-in trip comes back here), and
  // store a real answer for Today's next first paint.
  const uid = session?.user.id ?? null;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setAnswer(null);
      if (!known) return;
      // The provider reads the entitlement at launch and on refresh only, so after the sign-in trip it still holds
      // the signed-out answer: re-read it, or a paying member is never told they already have Premium.
      if (uid) refresh();
      void fetchMonthAnswer().then((a) => {
        if (!active) return;
        setAnswer(a);
        if (a === 'yes' || a === 'no') void saveGiftOffer({ canGet: a === 'yes', at: Date.now() });
      });
      return () => {
        active = false;
      };
    }, [known, uid, refresh]),
  );

  function changeText(next: string) {
    setText(next);
    if (phase === 'error') setPhase('form');
    if (draftLoaded.current) void saveNoteDraft(next);
  }

  // The keyboard safety net (iron rule 7). The layout keeps the field-to-Send block above the keyboard on its own;
  // when it cannot (signed out, German, Large text), scroll up just enough that Send's bottom clears the
  // keyboard's top by 16. No KeyboardAvoidingView and no resize, so it holds under Android edge-to-edge. While the
  // keyboard is up the content carries a spacer of its height, so the scroll has room to land.
  const nudgeAboveKeyboard = useCallback(
    (keyboardTop: number) => {
      const node = sendRef.current;
      if (!node) return;
      const apply = (sendBottom: number) => {
        const over = sendBottom + SEND_CLEARANCE - keyboardTop;
        if (over > 0) scrollRef.current?.scrollTo({ y: scrollY.current + over, animated: !reduced });
      };
      if (Platform.OS === 'web') {
        const el = node as unknown as HTMLElement;
        if (typeof el.getBoundingClientRect === 'function') apply(el.getBoundingClientRect().bottom);
      } else {
        node.measureInWindow((_x, y, _w, h) => apply(y + h));
      }
    },
    [reduced],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const onResize = () => {
        const field = fieldRef.current as unknown as HTMLElement | null;
        const focused = typeof document !== 'undefined' && field != null && document.activeElement === field;
        // iOS Safari keeps the layout viewport and shrinks the visual one; Chrome resizes the content instead.
        const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        setKbHeight(focused ? covered : 0);
        if (focused) setTimeout(() => nudgeAboveKeyboard(vv.offsetTop + vv.height), 0);
      };
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
      const top = e.endCoordinates.screenY;
      setTimeout(() => nudgeAboveKeyboard(top), Platform.OS === 'android' ? 80 : 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [nudgeAboveKeyboard]);

  const signedIn = Boolean(session);
  const offering = signedIn && !premium && answer === 'yes';
  const alreadyPremium = signedIn && premium && wasSignedOut;
  const trimmed = text.trim();
  const sendLive = trimmed.length > 0 && (!offering || meetsFloor(trimmed));
  const sending = phase === 'sending';

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace(fromSettings ? '/settings' : '/today');
  }

  function crossFade(next: Phase) {
    Animated.timing(fade, { toValue: 0, duration: reduced ? 45 : 80, useNativeDriver: NATIVE_DRIVER }).start(() => {
      setPhase(next);
      Animated.timing(fade, { toValue: 1, duration: reduced ? 45 : 80, useNativeDriver: NATIVE_DRIVER }).start();
    });
    // A throttled frame clock must never strand the reader on a blank screen.
    setTimeout(() => {
      setPhase(next);
      fade.setValue(1);
    }, 400);
  }

  async function send() {
    if (!sendLive || sending) return;
    setPhase('sending');
    Keyboard.dismiss();
    // Claude may read the note only if the screen said so above Send: the AI setting on AND a month on offer. A
    // read still in flight or failed showed "It comes straight to us.", and that has to be true.
    const res = await sendNote(trimmed, Platform.OS, ai && offering, !premium);
    if (!res.ok) {
      setPhase('error');
      track('feedback.error');
      return;
    }
    void saveNoteDraft('');
    retireOfferNow();
    track('feedback.sent', { from: fromSettings ? 'settings' : 'today' });
    if (res.givenUntil != null) {
      setGivenUntil(res.givenUntil);
      void saveGiftOffer({ canGet: false, at: Date.now() });
      refresh(); // Premium is live the moment the thank-you shows
      if (fromSettings && mounted.current) setLastNoteOutcome({ kind: 'given', until: res.givenUntil });
      crossFade('given');
    } else {
      if (fromSettings && mounted.current) setLastNoteOutcome({ kind: 'sent' });
      crossFade('sent');
    }
  }

  const backLabel = fromSettings ? t('settings.title') : t('common.today');
  const done = phase === 'given' || phase === 'sent';
  const date = periodLabel(givenUntil);

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <View style={styles.barInner}>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel={t('common.goBack')} hitSlop={8} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backText}>‹ {backLabel}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
      >
        <Text style={styles.title} accessibilityRole="header">
          {t('feedbackMonth.noteTitle')}
        </Text>
        <Animated.View style={{ opacity: fade }}>
          {done ? (
            <View style={styles.outcome}>
              <Text style={styles.outcomeHead}>{phase === 'given' ? t('feedbackMonth.outcomeThanks') : t('feedbackMonth.outcomeSent')}</Text>
              {phase === 'given' && date ? (
                <>
                  <Text style={styles.outcomeBody}>{t('feedbackMonth.outcomeGiven', { date })}</Text>
                  <Pressable
                    onPress={() => router.push('/premium')}
                    accessibilityRole="button"
                    accessibilityLabel={t('feedbackMonth.outcomeSeeIncluded')}
                    style={({ pressed }) => [styles.textBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.textBtnLabel}>{t('feedbackMonth.outcomeSeeIncluded')} ›</Text>
                  </Pressable>
                </>
              ) : null}
              <PrimaryButton
                label={fromSettings ? t('feedbackMonth.outcomeBackSettings') : t('feedbackMonth.outcomeBackToday')}
                onPress={leave}
                style={styles.outcomeBtn}
              />
              {BOOKING_URL ? (
                <View style={styles.call}>
                  <Text style={styles.callLine}>{t('feedbackMonth.outcomeCall')}</Text>
                  <Pressable
                    onPress={() => void Linking.openURL(BOOKING_URL as string)}
                    accessibilityRole="link"
                    accessibilityLabel={t('feedbackMonth.outcomeCallA11y')}
                    style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.callLink}>{t('feedbackMonth.outcomeCallLink')} ›</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.offer}>
                {!signedIn && known
                  ? t('feedbackMonth.noteSignedOut')
                  : offering
                    ? t('feedbackMonth.noteOffer')
                    : alreadyPremium
                      ? t('feedbackMonth.noteAlreadyPremium')
                      : t('feedbackMonth.noteWelcome')}
              </Text>
              {!signedIn && known ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/sign-in', params: { returnTo: '/note' } })}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel={t('feedbackMonth.noteSignInA11y')}
                  style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
                >
                  <Text style={styles.textBtnLabel}>{t('feedbackMonth.noteSignIn')} ›</Text>
                </Pressable>
              ) : null}
              <TextInput
                ref={fieldRef}
                value={text}
                onChangeText={changeText}
                editable={!sending}
                multiline
                scrollEnabled
                textAlignVertical="top"
                placeholder={t('feedbackMonth.notePlaceholder')}
                placeholderTextColor={theme.colors.inkSoft}
                accessibilityLabel={t('feedbackMonth.noteFieldA11y')}
                style={[styles.field, !signedIn && known ? styles.fieldAfterSignIn : null, sending && styles.fieldLocked]}
              />
              {phase === 'error' ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {t('feedbackMonth.noteError')}
                </Text>
              ) : offering ? (
                <Text style={styles.helper}>{t('feedbackMonth.noteFloor')}</Text>
              ) : null}
              <Text style={[styles.egress, phase !== 'error' && !offering ? styles.egressNoHelper : null]}>
                {offering && ai ? t('feedbackMonth.noteEgressClaude') : t('feedbackMonth.noteEgressStraight')}
              </Text>
              <View style={styles.actions}>
                <Pressable
                  onPress={leave}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  style={({ pressed }) => [styles.cancel, sending && styles.dim, pressed && styles.pressed]}
                >
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <View ref={sendRef} collapsable={false}>
                  <PrimaryButton
                    label={sending ? t('settings.feedbackSending') : t('common.send')}
                    onPress={send}
                    disabled={!sendLive || sending}
                    accessibilityLabel={sendLive || sending ? t('common.send') : t('feedbackMonth.noteSendDimmedA11y')}
                  />
                </View>
              </View>
            </>
          )}
        </Animated.View>
        {kbHeight > 0 ? <View style={{ height: kbHeight }} /> : null}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) => {
  const quiet = t.appearance === 'quiet';
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    bar: { backgroundColor: t.colors.bg },
    barInner: { height: 52, justifyContent: 'center', paddingHorizontal: spacing.five, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: spacing.three },
    backText: { color: t.colors.accentText, fontSize: 17 * t.scale, lineHeight: 23 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingTop: spacing.two, paddingBottom: spacing.six, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    title: { color: t.colors.ink, fontSize: 28 * t.scale, lineHeight: 34 * t.scale, fontFamily: fonts.sans, fontWeight: Platform.OS === 'web' ? '500' : '600' },
    offer: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    signIn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.one },
    textBtnLabel: { color: t.colors.accentText, fontSize: 16 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    field: {
      height: 96, // fixed: it scrolls inside and never grows, so Send never moves
      marginTop: spacing.three,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.md,
      padding: spacing.three,
      color: t.colors.ink,
      fontSize: 16 * t.scale,
      lineHeight: 22 * t.scale,
      fontFamily: fonts.body,
      backgroundColor: quiet ? 'transparent' : t.colors.surface,
    },
    fieldAfterSignIn: { marginTop: spacing.two },
    fieldLocked: { color: t.colors.inkSoft },
    helper: { color: t.colors.inkSoft, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    error: { color: t.colors.accentText, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    egress: { color: t.colors.inkSoft, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    egressNoHelper: { marginTop: spacing.two },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.five, marginTop: spacing.three },
    cancel: { minHeight: 44, justifyContent: 'center' },
    cancelText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    dim: { opacity: 0.5 },
    outcome: { marginTop: spacing.five },
    outcomeHead: { ...t.type.heading, color: t.colors.ink },
    outcomeBody: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    textBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    outcomeBtn: { marginTop: 20, alignSelf: 'flex-start' },
    call: { marginTop: spacing.six, borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.three },
    callLine: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.body },
    callBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    callLink: { color: t.colors.accentText, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    pressed: { opacity: PRESSED_OPACITY },
  });
};
