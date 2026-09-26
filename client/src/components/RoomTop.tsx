// Walking into a room (the room-entry handoff, 2026-09-26). Every room opened from the Menu's contents page
// gets the same top, in the same order: a back row that names where it goes, the room's picture as a band,
// the title in the serif, and the room's for-when hint as its subtitle, word for word the line on its card,
// so the card and the room say the same thing. Below that, the room is the room it always was.
//
// The back row stays put (it sits OUTSIDE the scroll); the band and the title scroll away with the page.
// The band is decorative: the same height at every text size, silent to a screen reader, the same image in
// dark. There is deliberately no image morph from the card, and no parallax: movement to track.

import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View } from 'react-native';

import { fonts, layout, PRESSED_OPACITY, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

/**
 * Where a room was opened from, read from the `from` route param. 'menu' is the contents page. 'back' is a
 * screen that is neither Menu nor Today and expects you back: the Ours list (its "Kept with" line opens the
 * pairing screen, `from=ours`) and the welcome (its "Change in Settings" link, `from=welcome`, whose flow
 * is built to go through Settings and come back). Anything else, or nothing, is Today: a reminder, the
 * rested screen, a link.
 */
export type RoomOrigin = 'menu' | 'back' | 'today';

export function useRoomOrigin(): RoomOrigin {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>();
  const f = Array.isArray(from) ? from[0] : from;
  return f === 'menu' ? 'menu' : f === 'ours' || f === 'welcome' ? 'back' : 'today';
}

/**
 * The back row. A back label names the place it returns to: "‹ Menu" from the contents page, "‹ Today" from
 * anywhere else (and the tap goes there, past anything in between). From the Ours list or the welcome it
 * is the plain "‹ Back", because neither is one of those words. At least 44pt tall, the accent, bold.
 */
export function RoomBackRow({ origin, bare = false }: { origin: RoomOrigin; bare?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const label = origin === 'menu' ? t('today.menu') : origin === 'back' ? t('common.back') : t('common.today');
  const a11y = origin === 'menu' ? t('rooms.backToMenuA11y') : origin === 'back' ? t('common.goBack') : t('rooms.backA11y');
  function go() {
    if (origin === 'today') {
      if (router.canGoBack()) router.dismissTo('/today');
      else router.replace('/today');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(origin === 'menu' ? '/rooms' : '/today');
  }
  return (
    // `bare` inside a page whose content is already inset (Premium), so the row does not inset twice.
    <View style={bare ? null : styles.backWrap}>
      <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={8} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={styles.backText}>‹ {label}</Text>
      </Pressable>
    </View>
  );
}

/** The room's picture, a hand-picked 3:1 crop, 104pt tall at every text size. Decorative. */
export function RoomBand({ art }: { art: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.band} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Image source={art} style={styles.bandImage} resizeMode="cover" accessible={false} accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * The band, the title and the for-when hint. The title is a heading, and on arrival it takes the screen
 * reader's focus ("Routines, heading"), after the screen has settled.
 */
export function RoomHead({ art, title, hint }: { art?: number; title: string; hint: string }) {
  const styles = useThemedStyles(makeStyles);
  const titleRef = useRef<Text>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const node = titleRef.current;
      if (!node) return;
      if (Platform.OS === 'web') {
        const el = node as unknown as HTMLElement;
        el.setAttribute?.('tabindex', '-1');
        el.focus?.({ preventScroll: true });
      } else {
        AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
      }
    }, 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <View>
      {art != null ? <RoomBand art={art} /> : null}
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

/**
 * How a room explains itself, in one voice. Routines' empty line, the Rhythms intro and Repeating's empty
 * line were all Atkinson but at two sizes and two inks, so they read as two people talking. Every room
 * explanation now uses this: Atkinson 15, line-height 1.55, soft ink. Spacing belongs to the caller.
 */
export function RoomIntro({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.intro, style]}>{children}</Text>;
}

/**
 * The arrival: the room fades in and rises 8pt over 180ms, the same as the contents page opening. Under
 * reduced motion, a 90ms fade and nothing moves. Returns the style for the scroll's content.
 */
export function useRoomEntrance() {
  const theme = useTheme();
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(enter, {
      toValue: 1,
      duration: theme.reduceMotion ? 90 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    a.start();
    return () => a.stop();
  }, [enter, theme.reduceMotion]);
  return {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [theme.reduceMotion ? 0 : 8, 0] }) }],
  };
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backWrap: { paddingHorizontal: spacing.five, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: spacing.three },
    backText: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    pressed: { opacity: PRESSED_OPACITY },
    // The band does NOT scale with text: it is a picture, and a taller picture at Large text would only push
    // the room further down the screen.
    band: { height: 104, borderRadius: 16, overflow: 'hidden', backgroundColor: t.colors.surface, marginTop: spacing.one },
    bandImage: { width: '100%', height: '100%' },
    title: { color: t.colors.ink, fontSize: 34 * t.scale, lineHeight: 37 * t.scale, fontFamily: fonts.sans, fontWeight: '400', marginTop: 18 },
    hint: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.body, marginTop: 6 },
    intro: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 15 * 1.55 * t.scale, fontFamily: fonts.body },
  });
