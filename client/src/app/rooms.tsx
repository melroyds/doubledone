// The Menu, as a contents page (the Today v3 handoff, 4a, Melroy's pick 2026-09-26): "The rest of the
// house". The Menu pill on Today used to open a sheet of seven equal rows whose hints said what each room
// IS ("Plan toward a goal"); nobody opens a room because of what it is, they open it because of a moment
// they are in. So each room now gets a picture and a for-when hint that names the moment, the Lookback
// (the payoff) gets the wide card, and Settings and Premium step down to the edges.
//
// A real route, not a sheet, so every room's own back returns HERE, as the handoff asks: each room is
// opened with `from: 'menu'`, which is what makes its back row say "‹ Menu" (the room-entry handoff).
// Repeating is a route now too (the Rise and Rooms handoff): it used to be a drawer on Today that this page
// had to hand back to Today to open. Ours is not a room at all any more: it lives behind Today's heading,
// so its card lands on that tab.
//
// What it must never become: no "new" dots or badges on rooms, no ordering by use, no coach marks, and
// the pictures never change by time or by use. The same rooms in the same place, always.
//
// The doors that are not rooms (the Menu doors handoff, 1c, 2026-09-30). A real user could not find
// Settings: a small grey word in the corner, while the pictures read as the whole menu and ended at a
// fold that looked like the end of the page. So Settings keeps its corner but becomes a SIGN (a gear and
// the word, in ink, never a pill, which would read as the Menu pill changing its word), and after the
// last room a quiet SHELF lists Settings again with what it is for, then Premium with its line visible
// for the first time. Nothing people learned moves; only weight changes. Premium stays below the fold
// on purpose: findable for someone looking, never pushed.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import chartArt from '../../assets/images/rooms/chart.webp';
import lookbackArt from '../../assets/images/rooms/lookback.webp';
import oursArt from '../../assets/images/rooms/ours.webp';
import repeatingArt from '../../assets/images/rooms/repeating.webp';
import routinesArt from '../../assets/images/rooms/routines.webp';
import { border, fonts, layout, PRESSED_OPACITY, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { spoken } from '@/lib/i18n';
import { t } from '@/lib/locale';
import { SELLS_HERE } from '@/lib/storefront';
import { usePremium } from '@/lib/premium-provider';
import { scaleFor } from '@/lib/settings';
import { isSyncConfigured } from '@/lib/supabase';
import { track } from '@/lib/telemetry';
import { useSettings, useTheme, useThemedStyles } from '@/lib/theme-provider';

/**
 * Where the Ours card goes. Today knows (it has the live pair and the build's gate) and passes it as a
 * plain word, never a pair id in a web URL: 'list' is a live shared list, 'room' is Ours' own pairing
 * screen, 'signin' is signed out (the card still shows, and says what it needs), 'none' draws no card.
 */
type OursDest = 'list' | 'room' | 'signin' | 'none';

type Room = { key: string; label: string; hint: string; art: number; onPress: () => void; premiumMark?: boolean };

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const { premium } = usePremium();
  const aiEnabled = useSettings().settings.aiEnabled;
  const { width, fontScale } = useWindowDimensions();
  // `from: 'ours'` when the Ours room's own Menu pill opened this page, so its Ours card goes BACK there
  // rather than stacking another copy of the room on top of this one.
  const params = useLocalSearchParams<{ ours?: string; from?: string }>();
  // A deep link (or a reload on web) arrives with no word from Today: fall back to what can be known here.
  const ours: OursDest =
    params.ours === 'list' || params.ours === 'room' || params.ours === 'signin' || params.ours === 'none'
      ? params.ours
      : !isSyncConfigured
        ? 'none'
        : session
          ? 'room'
          : 'signin';

  // Fade and rise on the way in; with reduced motion, a 90ms fade and nothing moves.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(enter, {
      toValue: 1,
      duration: theme.reduceMotion ? 90 : 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    a.start();
    return () => a.stop();
  }, [enter, theme.reduceMotion]);

  // The press guard: for its first 300ms the page takes no presses, so a double-tap on the Menu pill
  // (whose corner Settings now shares) cannot land on Settings during the fade. The same with reduced
  // motion, and nothing dims or looks disabled while it runs.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 300);
    return () => clearTimeout(id);
  }, []);

  function openSettings(door: 'sign' | 'shelf') {
    track('rooms.opened', { room: 'settings', door });
    router.push({ pathname: '/settings', params: { from: 'menu' } });
  }

  // To TODAY, whatever is between: this page can be opened from the Ours room too, where a plain back
  // landed on Ours under a link that said Today. dismissTo pops to the nearest Today, or replaces this page
  // with one when there is none (a reload on /rooms).
  function backToToday() {
    if (router.canGoBack()) router.dismissTo('/today');
    else router.replace('/today');
  }

  function go(room: string, path: '/lookback' | '/routines' | '/repeating' | '/chart' | '/ours') {
    return () => {
      track('rooms.opened', { room });
      router.push({ pathname: path, params: { from: 'menu' } });
    };
  }

  // The Ours card goes home rather than into a room: this page closes and Today's Ours tab takes its place
  // (the fade is the route's own). Opened FROM that tab, it simply goes back to it.
  function openOursTab() {
    track('rooms.opened', { room: 'ours' });
    if (params.from === 'ours') router.back();
    else router.replace('/ours-list');
  }

  const lookback: Room = { key: 'lookback', label: t('lookback.title'), hint: t('rooms.lookbackHint'), art: lookbackArt, onPress: go('lookback', '/lookback') };
  const grid: Room[] = [
    { key: 'routines', label: t('routines.title'), hint: t('rooms.routinesHint'), art: routinesArt, onPress: go('routines', '/routines') },
    { key: 'repeating', label: t('repeat.title'), hint: t('rooms.repeatingHint'), art: repeatingArt, onPress: go('repeating', '/repeating') },
    ...(ours === 'none'
      ? []
      : [
          {
            key: 'ours',
            label: t('ours.defaultName'),
            // Signed out, the card names its one requirement instead of hiding: a silently missing room
            // reads as "this app does not have that" (a real user, 2026-08-17).
            hint: ours === 'signin' ? t('rooms.oursNeedsSync') : t('rooms.oursHint'),
            art: oursArt,
            // A live list: its tab on Today. No list yet: the invite screen, as a room, band and ‹ Menu.
            onPress: ours === 'list' ? openOursTab : go('ours', '/ours'),
          },
        ]),
    // Chart a course is an AI room, so it is simply not here with AI off. Its honey ✦ says Premium to a
    // free user, never a lock, never the gradient pill (the loudest thing in the app on its calmest page).
    ...(aiEnabled ? [{ key: 'chart', label: t('actions.chartACourse'), hint: t('rooms.chartHint'), art: chartArt, onPress: go('chart', '/chart'), premiumMark: !premium }] : []),
  ];

  // Two columns, unless the text is large or the screen is narrow, where one column keeps every hint
  // whole. "Large" is the app's own largest size OR the phone's font scale taking the text there (RN Text
  // scales with both). An odd card out takes the full row rather than sitting alone beside a gap.
  const oneColumn = theme.scale * fontScale >= scaleFor('large') || width < 330;
  // The chevron top-aligns beside a label's first line once text is large, so a wrapped hint never runs under it.
  const largeText = theme.scale * fontScale >= scaleFor('large');

  // Premium's line names what Premium holds, so it is true in every state: it cannot pitch Premium to
  // someone who pays, say "expired" to someone who left, or flash free copy at a member while loading.
  // Billing news, dates and management live on the Premium page, never here. The one exception is a
  // member on a build that sells nothing (Android, Path C), who keeps their line word for word.
  const premiumHint = premium && !SELLS_HERE ? t('settings.premiumCardActiveSub') : aiEnabled ? t('rooms.premiumHintFreeAi') : t('rooms.premiumHintFreeNoAi');
  // 1.2 x the sign's 15pt label, so it grows with the text: the app's size AND the phone's own text size,
  // which RN Text follows by itself and an SVG does not.
  const gearSize = 18 * theme.scale * fontScale;

  // Spoken labels. Soft hyphens are for the eye, so none is spoken (lib/i18n spoken). Each shelf row is
  // named exactly like its door ("Settings", "Premium") with its line as the HINT, as the handoff asks: the
  // two Settings doors share one name because they are one door. react-native-web drops accessibilityHint,
  // so on the web the hint is wired with aria-describedby to the visible line instead.
  const say = spoken;
  const settingsSpoken = say(t('settings.title'));
  const describedBy = (id: string) => (Platform.OS === 'web' ? ({ 'aria-describedby': id } as object) : null);

  const card = (room: Room, wide: boolean) => (
    <Pressable
      key={room.key}
      onPress={room.onPress}
      accessibilityRole="button"
      accessibilityLabel={say(`${room.label}${room.premiumMark ? `. ${t('common.premium')}` : ''}. ${room.hint}`)}
      // While a finger is on it the whole card dims to 60%; no ripple, no scale, no haptic. It opens on lift.
      style={({ pressed }) => [wide ? styles.cardWide : styles.card, pressed && styles.pressedCard]}
    >
      <View style={[styles.art, wide ? styles.artWide : styles.artGrid]}>
        <Image source={room.art} style={styles.artFill} resizeMode="cover" accessible={false} accessibilityIgnoresInvertColors />
      </View>
      <View style={styles.cardText}>
        <Text style={wide ? styles.nameWide : styles.name} android_hyphenationFrequency="normal">
          {room.label}
          {room.premiumMark ? (
            <Text style={styles.premiumMark} accessible={false} importantForAccessibility="no">
              {'  '}✦
            </Text>
          ) : null}
        </Text>
        <Text style={wide ? styles.hintWide : styles.hint} android_hyphenationFrequency="normal">
          {room.hint}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen} pointerEvents={armed ? 'auto' : 'none'}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.five, paddingBottom: insets.bottom + spacing.six }]}>
        <Animated.View
          style={{
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [theme.reduceMotion ? 0 : 10, 0] }) }],
          }}
        >
          <View style={styles.topRow}>
            <Pressable onPress={backToToday} accessibilityRole="button" accessibilityLabel={t('rooms.backA11y')} hitSlop={8} style={({ pressed }) => [styles.topLink, pressed && styles.pressed]}>
              <Text style={styles.back}>‹ {t('common.today')}</Text>
            </Pressable>
            {/* The sign: a gear and the word, in ink. Never an outline, a fill or a pill, in any appearance. */}
            <Pressable
              onPress={() => openSettings('sign')}
              accessibilityRole="button"
              accessibilityLabel={settingsSpoken}
              hitSlop={8}
              style={({ pressed }) => [styles.sign, pressed && styles.pressed]}
            >
              {/* The gear is decoration: the word carries the meaning. Hidden from screen readers by a wrapping
                  View, because react-native-svg passes accessibility props straight to the web's <svg>. */}
              <View aria-hidden>
              <Svg width={gearSize} height={gearSize} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M10.21 4.82 L10.61 2.10 L13.39 2.10 L13.79 4.82 L15.81 5.66 L18.02 4.01 L19.99 5.98 L18.34 8.19 L19.18 10.21 L21.90 10.61 L21.90 13.39 L19.18 13.79 L18.34 15.81 L19.99 18.02 L18.02 19.99 L15.81 18.34 L13.79 19.18 L13.39 21.90 L10.61 21.90 L10.21 19.18 L8.19 18.34 L5.98 19.99 L4.01 18.02 L5.66 15.81 L4.82 13.79 L2.10 13.39 L2.10 10.61 L4.82 10.21 L5.66 8.19 L4.01 5.98 L5.98 4.01 L8.19 5.66 Z"
                  stroke={theme.colors.ink}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  fill="none"
                />
                <Circle cx={12} cy={12} r={3.1} stroke={theme.colors.ink} strokeWidth={2} fill="none" />
              </Svg>
              </View>
              <Text style={styles.signLabel} android_hyphenationFrequency="normal">
                {t('settings.title')}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('rooms.title')}
          </Text>
          <Text style={styles.lead}>{t('rooms.lead')}</Text>

          {card(lookback, true)}

          <View style={styles.grid}>
            {grid.map((room, i) => {
              const wide = oneColumn || (grid.length % 2 === 1 && i === grid.length - 1);
              return (
                <View key={room.key} style={wide ? styles.cellWide : styles.cell}>
                  {card(room, wide)}
                </View>
              );
            })}
          </View>

          {/* The shelf: straight after the last room, whatever the grid holds. Settings, then Premium, with 24
              of space that does nothing between them (no hairline, and no hitSlop, so the rows never reach
              into each other). Its neighbours never change: the last room above, the page's foot below. */}
          <View style={styles.shelf}>
            <Pressable
              onPress={() => openSettings('shelf')}
              accessibilityRole="button"
              accessibilityLabel={settingsSpoken}
              accessibilityHint={say(t('rooms.settingsHint'))}
              {...describedBy('menu-settings-hint')}
              style={({ pressed }) => [styles.shelfRow, pressed && styles.pressed]}
            >
              <View style={styles.shelfText}>
                <Text style={styles.shelfLabel} android_hyphenationFrequency="normal">
                  {t('settings.title')}
                </Text>
                <Text style={styles.shelfHint} nativeID="menu-settings-hint" android_hyphenationFrequency="normal">
                  {t('rooms.settingsHint')}
                </Text>
              </View>
              <Text style={[styles.chevron, largeText && styles.chevronTop]} accessible={false} importantForAccessibility="no">
                ›
              </Text>
            </Pressable>
            <View style={styles.shelfGap} />
            <Pressable
              onPress={() => {
                track('premium.menu_open');
                router.push({ pathname: '/premium', params: { from: 'menu' } });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.premium')}
              accessibilityHint={say(premiumHint)}
              {...describedBy('menu-premium-hint')}
              style={({ pressed }) => [styles.shelfRow, pressed && styles.pressed]}
            >
              <View style={styles.shelfText}>
                <Text style={styles.shelfLabel} android_hyphenationFrequency="normal">
                  {t('common.premium')}
                </Text>
                <Text style={styles.shelfHint} nativeID="menu-premium-hint" android_hyphenationFrequency="normal">
                  {premiumHint}
                </Text>
              </View>
              <Text style={[styles.chevron, largeText && styles.chevronTop]} accessible={false} importantForAccessibility="no">
                ›
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // Today is the one transparent screen (over its living background); every other page paints paper.
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { paddingHorizontal: spacing.five, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    // Wraps rather than truncating: when "‹ Today" and the sign do not fit on one line (German at the
    // stress size), the sign drops to its own line and stays right, held there by marginLeft auto.
    topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.four, rowGap: spacing.one },
    topLink: { minHeight: 44, justifyContent: 'center' },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    sign: { minHeight: 44, marginLeft: 'auto', paddingHorizontal: spacing.one, flexDirection: 'row', alignItems: 'center', gap: spacing.two },
    signLabel: { color: t.colors.ink, fontSize: 15 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    title: { color: t.colors.ink, fontSize: 32 * t.scale, lineHeight: 36 * t.scale, fontFamily: fonts.sans, fontWeight: '500', marginTop: spacing.two },
    lead: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 21 * t.scale, fontFamily: fonts.body, marginTop: 6, marginBottom: spacing.four },
    // The cards: one surface, one hairline, the picture inset with its own soft corners.
    cardWide: {
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: 18,
      padding: spacing.two,
      paddingBottom: 13,
      gap: spacing.two,
    },
    card: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: 16,
      padding: spacing.two,
      paddingBottom: spacing.three,
      gap: spacing.two,
    },
    art: { width: '100%', maxWidth: '100%', overflow: 'hidden', backgroundColor: t.colors.accentSoft },
    artWide: { aspectRatio: 2, borderRadius: 12 },
    artGrid: { aspectRatio: 4 / 3, borderRadius: 11 },
    artFill: { position: 'absolute', width: '100%', height: '100%' },
    cardText: { gap: 3, paddingHorizontal: spacing.one },
    nameWide: { color: t.colors.ink, fontSize: 20 * t.scale, lineHeight: 25 * t.scale, fontFamily: fonts.sans, fontWeight: '500' },
    name: { color: t.colors.ink, fontSize: 17 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.sans, fontWeight: '500' },
    hintWide: { color: t.colors.inkSoft, fontSize: 13 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body },
    hint: { color: t.colors.inkSoft, fontSize: 12.5 * t.scale, lineHeight: 17.5 * t.scale, fontFamily: fonts.body },
    premiumMark: { color: t.colors.accents[2], fontSize: 13 * t.scale, fontFamily: fonts.body },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    // Two per row: each cell is half the row less half the gap, so the pair fills it exactly.
    cell: { width: '47.5%', flexGrow: 1 },
    cellWide: { width: '100%' },
    // The shelf: one quiet surface with the room cards' radius, no border, no shadow; in Quiet, no surface
    // at all and the rows sit on paper. Never the gradient, never honey, on the calmest page.
    shelf:
      t.appearance === 'quiet'
        ? { marginTop: spacing.six }
        : { marginTop: spacing.six, backgroundColor: t.colors.surface, borderRadius: 18 },
    // 13 lines the row text up with the room cards' text (1 border + spacing.two + a 4 text inset).
    shelfRow: { minHeight: 56, paddingVertical: spacing.three, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: spacing.three },
    shelfText: { flex: 1, minWidth: 0 },
    shelfLabel: { color: t.colors.ink, fontSize: 15 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    shelfHint: { color: t.colors.inkSoft, fontSize: 14 * t.scale, lineHeight: 18 * t.scale, fontFamily: fonts.body, marginTop: 2 },
    shelfGap: { height: spacing.five },
    chevron: { color: t.colors.inkSoft, fontSize: 20 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body },
    chevronTop: { alignSelf: 'flex-start' },
    pressed: { opacity: PRESSED_OPACITY },
    pressedCard: { opacity: 0.6 },
  });
