// The Menu, as a contents page (the Today v3 handoff, 4a, Melroy's pick 2026-09-26): "The rest of the
// house". The Menu pill on Today used to open a sheet of seven equal rows whose hints said what each room
// IS ("Plan toward a goal"); nobody opens a room because of what it is, they open it because of a moment
// they are in. So each room now gets a picture and a for-when hint that names the moment, the Lookback
// (the payoff) gets the wide card, and Settings and Premium step down to the edges.
//
// A real route, not a sheet, so every room's own back returns HERE, as the handoff asks: each room is
// opened with `from: 'menu'`, which is what makes its back row say "‹ Menu" (the room-entry handoff). The
// one room that is not a route, Repeating (a drawer living on Today's own task state and write path), is
// handed back to Today through the inbound bridge, and Today brings you back here when the drawer closes.
// Ours is not a room at all any more: it lives behind Today's heading, so its card lands on that tab.
//
// What it must never become: no "new" dots or badges on rooms, no ordering by use, no coach marks, and
// the pictures never change by time or by use. The same rooms in the same place, always.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import chartArt from '../../assets/images/rooms/chart.webp';
import lookbackArt from '../../assets/images/rooms/lookback.webp';
import oursArt from '../../assets/images/rooms/ours.webp';
import repeatingArt from '../../assets/images/rooms/repeating.webp';
import routinesArt from '../../assets/images/rooms/routines.webp';
import { border, fonts, layout, PRESSED_OPACITY, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { setInbound } from '@/lib/inbound';
import { t } from '@/lib/locale';
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

  // To TODAY, whatever is between: this page can be opened from the Ours room too, where a plain back
  // landed on Ours under a link that said Today. dismissTo pops to the nearest Today, or replaces this page
  // with one when there is none (a reload on /rooms).
  function backToToday() {
    if (router.canGoBack()) router.dismissTo('/today');
    else router.replace('/today');
  }

  // Repeating lives on Today. Hand it over, then go to Today: the Today that comes on screen takes the
  // hand-off, opens its drawer, and brings you back here when you close it.
  function openRepeating() {
    track('rooms.opened', { room: 'repeating' });
    setInbound({ kind: 'repeating' });
    backToToday();
  }

  function go(room: string, path: '/lookback' | '/routines' | '/chart' | '/ours') {
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
    { key: 'repeating', label: t('repeat.title'), hint: t('rooms.repeatingHint'), art: repeatingArt, onPress: openRepeating },
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

  const card = (room: Room, wide: boolean) => (
    <Pressable
      key={room.key}
      onPress={room.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.label}${room.premiumMark ? `. ${t('common.premium')}` : ''}. ${room.hint}`}
      // While a finger is on it the whole card dims to 60%; no ripple, no scale, no haptic. It opens on lift.
      style={({ pressed }) => [wide ? styles.cardWide : styles.card, pressed && styles.pressedCard]}
    >
      <View style={[styles.art, wide ? styles.artWide : styles.artGrid]}>
        <Image source={room.art} style={styles.artFill} resizeMode="cover" accessible={false} accessibilityIgnoresInvertColors />
      </View>
      <View style={styles.cardText}>
        <Text style={wide ? styles.nameWide : styles.name}>
          {room.label}
          {room.premiumMark ? (
            <Text style={styles.premiumMark} accessible={false} importantForAccessibility="no">
              {'  '}✦
            </Text>
          ) : null}
        </Text>
        <Text style={wide ? styles.hintWide : styles.hint}>{room.hint}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.five, paddingBottom: insets.bottom + spacing.five }]}>
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
            <Pressable onPress={() => router.push({ pathname: '/settings', params: { from: 'menu' } })} accessibilityRole="button" accessibilityLabel={t('settings.title')} hitSlop={8} style={({ pressed }) => [styles.topLink, pressed && styles.pressed]}>
              <Text style={styles.settings}>{t('settings.title')}</Text>
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

          <Pressable
            onPress={() => {
              track('premium.menu_open');
              router.push({ pathname: '/premium', params: { from: 'menu' } });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${t('common.premium')}. ${premium ? t('rooms.premiumHintSubscribed') : aiEnabled ? t('rooms.premiumHintFreeAi') : t('rooms.premiumHintFreeNoAi')}`}
            hitSlop={6}
            style={({ pressed }) => [styles.premiumRow, pressed && styles.pressed]}
          >
            <Text style={styles.premium}>{t('common.premium')}</Text>
            <Text style={styles.premium} accessible={false} importantForAccessibility="no">
              ›
            </Text>
          </Pressable>
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
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topLink: { minHeight: 44, justifyContent: 'center' },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    settings: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
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
    // Premium, quiet at the foot: a hairline, the word and a chevron, never the gradient on the calmest page.
    premiumRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.three,
      paddingHorizontal: 2,
      borderTopWidth: border.hair,
      borderTopColor: t.colors.line,
    },
    premium: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    pressed: { opacity: PRESSED_OPACITY },
    pressedCard: { opacity: 0.6 },
  });
