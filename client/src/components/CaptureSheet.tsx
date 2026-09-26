// Capture, as it rests and as it rises (design_handoff_capture_pill, locked 2026-09-26).
//
// AT REST: one pill with a plus, floating over the list, centred, its bottom edge 34 above the screen's
// foot (or the home bar's inset, where that is larger). It never moves or hides with scroll: the same
// thing in the same place. The list keeps one row's worth of empty space at its end (`restingListPad`),
// so the pill always has a home to land in and never covers the last task. With words waiting in the
// panel, it widens and shows three dots after the plus.
//
// OPEN: the panel rises from the bottom over a light scrim, and nothing is focused, so the keyboard stays
// down. A screen reader lands on the heading. Only a tap on the field raises the keyboard, and the panel
// then rides up on top of it. Close, the scrim, Android's back and Escape all close it; the words stay.
//
// The panel's contents are BrainDump, which stays MOUNTED always (the capture iron rule: text is never
// lost). This file owns only the pill, the scrim, the rise and the keyboard.

import { useFocusEffect } from 'expo-router';
import { type ComponentProps, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, PixelRatio, Platform, Pressable, StyleSheet, useWindowDimensions, View, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { layout, rgba, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { hasSafariKeyboardAddressBar, SAFARI_KEYBOARD_ADDRESS_CLEAR } from '@/lib/safari-chrome';
import { useTheme, useThemedStyles } from '@/lib/theme-provider';

import { BrainDump, type BrainDumpHandle } from './BrainDump';

type BrainDumpProps = ComponentProps<typeof BrainDump>;

type Props = Omit<BrainDumpProps, 'onRequestClose' | 'onDraftChange' | 'onFocusChange'> & {
  /** Select mode, a closed day, an archived list: no pill, and the panel is shut. The words are kept. */
  hidden?: boolean;
  /** The panel opened or closed (the parent clears its just-added tint on close). Reported on a change. */
  onOpenChange?: (open: boolean) => void;
};

export type CaptureSheetHandle = {
  open: () => void;
  close: () => void;
  /** Words from a share, a shortcut or a scan: the panel opens and they land under any draft. `focus`
   *  raises the keyboard (a share or the Brain dump shortcut); a scan leaves it down. */
  seed: (text: string | null, focus?: boolean) => void;
  clear: () => void;
};

const PILL_H = 48;
const PILL_W = 96;
const PILL_W_WAITING = 124;
const PANEL_REST_MAX = 384;
const EASE_RISE = Easing.bezier(0.2, 0.8, 0.2, 1);

// `inert` takes a subtree out of the web's Tab order, clicks and accessibility tree in one attribute, which
// aria-hidden alone does not (a shut panel's buttons stayed reachable by Tab). react-native-web forwards it;
// React Native's own types do not know it, hence the cast, and native never sees it.
function webInert(on: boolean): object | null {
  return Platform.OS === 'web' ? ({ inert: on } as object) : null;
}

/** The pill's bottom edge, from the screen's foot. */
export function pillBottom(insetBottom: number): number {
  return Math.max(34, insetBottom);
}

/**
 * The list's bottom padding at rest: an 8 gap, the pill's 52 home slot, then the space above the home
 * bar. On a 34-inset phone that is 92. On a long day, scrolling to the end brings the last row up clear
 * of the pill, which lands in the same slot.
 */
export function restingListPad(insetBottom: number): number {
  return 8 + 52 + Math.max(insetBottom - 2, 32);
}

/** The panel's height at rest: about 384 on a 780 phone, never more than 55% of the window. */
export function restingPanelHeight(windowHeight: number): number {
  return Math.min(PANEL_REST_MAX, Math.round(windowHeight * 0.55));
}

export const CaptureSheet = forwardRef<CaptureSheetHandle, Props>(function CaptureSheet({ hidden = false, onOpenChange, ...composer }, ref) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = theme.reduceMotion;
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const dumpRef = useRef<BrainDumpHandle>(null);
  const pillRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const [kbH, setKbH] = useState(0);
  // The web keyboard, where the page does not resize for it (iOS Safari): up or not, for the foot padding.
  const [webKbUp, setWebKbUp] = useState(false);
  // Whether the field has focus. On an iPhone that IS the keyboard being up, which matters because Safari
  // may meet the keyboard by pushing the whole page up itself, and then the viewport sum below reads about
  // zero (Melroy's iPhone, 2026-09-27: the page's header had gone off the top and the clearance never came).
  const [fieldFocused, setFieldFocused] = useState(false);
  // iPhone Safari in a tab floats its address label over the page's foot while the keyboard is up, right
  // where When and Add sit, so the foot keeps clear of it (see lib/safari-chrome). Asked once.
  const [safariBar] = useState(
    () =>
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      typeof window !== 'undefined' &&
      hasSafariKeyboardAddressBar(
        navigator.userAgent,
        (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
      ),
  );
  // Android reports the keyboard's height WITHOUT the navigation bar, and this edge-to-edge screen runs
  // behind that bar, so the panel must also clear the bar's inset to sit on the keyboard. iOS's height
  // already includes the home-indicator strip. Read inside the keyboard listener, so kept in a ref.
  const navInset = Platform.OS === 'android' ? insets.bottom : 0;
  const navInsetRef = useRef(navInset);
  useEffect(() => {
    navInsetRef.current = navInset;
  }, [navInset]);

  const [rise] = useState(() => new Animated.Value(0)); // 0 = down, 1 = up
  const [pillFade] = useState(() => new Animated.Value(1));
  const [pillW] = useState(() => new Animated.Value(PILL_W));
  const [kbLift] = useState(() => new Animated.Value(0));

  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => {
    dumpRef.current?.stopListening(); // a closed panel never keeps a hot mic writing into it
    dumpRef.current?.blurField();
    Keyboard.dismiss();
    setOpen(false);
  }, []);

  useImperativeHandle(ref, () => ({
    open: openSheet,
    close: closeSheet,
    seed: (text, focus = true) => {
      // Hidden (select mode, a closed day): the words wait as a draft, and the pill shows its dots once it
      // is back. No rise and no focus, which would raise a keyboard over a field nobody can see, and would
      // latch the panel open to rise by itself later.
      if (hidden) {
        dumpRef.current?.seed(text, false);
        return;
      }
      setOpen(true);
      // After the panel has started to rise, so a focus that raises the keyboard lands on a field that is
      // on its way up rather than one still below the screen.
      setTimeout(() => dumpRef.current?.seed(text, focus), focus ? 60 : 0);
    },
    clear: () => dumpRef.current?.clear(),
  }));

  // A hidden sheet is a shut one (select mode, a closed day): the pill goes, the words stay.
  const shown = open && !hidden;

  // Reported on a CHANGE only (a parent's handler is a fresh function every render).
  const lastOpen = useRef(false);
  useEffect(() => {
    if (lastOpen.current === shown) return;
    lastOpen.current = shown;
    onOpenChange?.(shown);
  }, [shown, onOpenChange]);

  // The rise, the scrim and the pill, together. Reduced motion: no travel, a 90ms cross-fade.
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const anims = shown
      ? [
          Animated.timing(rise, { toValue: 1, duration: reduced ? 90 : 280, easing: reduced ? Easing.linear : EASE_RISE, useNativeDriver: native }),
          Animated.timing(pillFade, { toValue: 0, duration: reduced ? 90 : 120, easing: Easing.linear, useNativeDriver: false }),
        ]
      : [
          Animated.timing(rise, { toValue: 0, duration: reduced ? 90 : 200, easing: Easing.inOut(Easing.ease), useNativeDriver: native }),
          Animated.timing(pillFade, { toValue: 1, duration: reduced ? 90 : 120, delay: reduced ? 0 : 80, easing: Easing.linear, useNativeDriver: false }),
        ];
    const all = Animated.parallel(anims);
    all.start();
    return () => all.stop();
  }, [shown, reduced, rise, pillFade]);

  // On open, a screen reader lands on the heading (the keyboard stays down). On close, back to the pill.
  const wasShown = useRef(false);
  useEffect(() => {
    const was = wasShown.current;
    wasShown.current = shown;
    if (shown && !was) {
      const id = setTimeout(() => dumpRef.current?.focusHeading(), reduced ? 100 : 300);
      return () => clearTimeout(id);
    }
    if (!shown && was) {
      dumpRef.current?.stopListening(); // however it shut (Close, Sort, select mode), the mic goes with it
      const id = setTimeout(() => {
        const pill = pillRef.current;
        if (!pill) return;
        if (Platform.OS === 'web') (pill as unknown as HTMLElement).focus?.({ preventScroll: true });
        else AccessibilityInfo.sendAccessibilityEvent(pill, 'focus');
      }, reduced ? 100 : 220);
      return () => clearTimeout(id);
    }
  }, [shown, reduced]);

  // Words waiting: the pill widens (instantly under reduced motion) and grows its three dots.
  const waiting = draft && !shown;
  useEffect(() => {
    const to = waiting ? PILL_W_WAITING : PILL_W;
    if (reduced) {
      pillW.setValue(to);
      return;
    }
    const a = Animated.timing(pillW, { toValue: to, duration: 200, easing: Easing.inOut(Easing.ease), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [waiting, reduced, pillW]);

  // The keyboard. The panel's foot follows it with the keyboard's own timing on iOS, 250 elsewhere.
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Chrome resizes the page around the keyboard (interactive-widget, see inject-web-meta), so this
      // measures nothing there. iOS Safari ignores that and overlays the keyboard, so the panel is lifted
      // by the part of the page the keyboard covers: the layout viewport's foot to the visual viewport's.
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const onViewport = () => {
        // Safari may also meet the keyboard by scrolling the page itself (overflow:hidden does not stop a
        // scroll into view there), which carries the panel up with it, so that scroll is taken off the lift.
        const lift = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop - window.scrollY));
        setWebKbUp(lift > 0);
        Animated.timing(kbLift, { toValue: lift, duration: 250, easing: EASE_RISE, useNativeDriver: false }).start();
      };
      vv.addEventListener('resize', onViewport);
      vv.addEventListener('scroll', onViewport);
      window.addEventListener('scroll', onViewport);
      return () => {
        vv.removeEventListener('resize', onViewport);
        vv.removeEventListener('scroll', onViewport);
        window.removeEventListener('scroll', onViewport);
      };
    }
    const onShow = (e: KeyboardEvent) => {
      const h = e.endCoordinates?.height ?? 0;
      setKbH(h);
      Animated.timing(kbLift, { toValue: h + navInsetRef.current, duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 250, easing: EASE_RISE, useNativeDriver: false }).start();
    };
    const onHide = (e: KeyboardEvent) => {
      setKbH(0);
      Animated.timing(kbLift, { toValue: 0, duration: Platform.OS === 'ios' ? (e?.duration ?? 250) : 250, easing: EASE_RISE, useNativeDriver: false }).start();
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kbLift]);

  // Android's back and the web's Escape close the panel while it is open (the words stay). Only while this
  // screen is the one in front: a Today buried under Premium (Scan's gate) must not swallow Premium's back.
  // Escape listens on keyup on the window, because an open date picker, Scan or Break it down sheet (an
  // RN-web Modal) handles its own Escape on the document and stops it there, so one Escape closes only the
  // top layer.
  useFocusEffect(
    useCallback(() => {
      if (!shown) return;
      if (Platform.OS === 'android') {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
          closeSheet();
          return true;
        });
        return () => sub.remove();
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const onKey = (e: globalThis.KeyboardEvent) => {
          if (e.key === 'Escape') closeSheet();
        };
        window.addEventListener('keyup', onKey);
        return () => window.removeEventListener('keyup', onKey);
      }
    }, [shown, closeSheet]),
  );

  // Height: about half the phone at rest; with the keyboard up it sits on the keyboard, and the field
  // gives up its room first (never less than the fixed rows need), so the heading, the tools, When and
  // Add stay in view.
  // iPhone Safari in a tab, keyboard up (by the viewport OR by the field's focus): room for its address label.
  const safariPad = safariBar && (webKbUp || fieldFocused);
  const kbUp = kbH > 0 || webKbUp || safariPad;
  // The fixed rows grow with the app's text size and the phone's, and the field is the part that gives,
  // so the floor they need is scaled with the text rather than read off the design at 100%.
  const textScale = Math.max(1, PixelRatio.getFontScale() * theme.scale);
  const padBottom = kbUp ? 8 + (safariPad ? SAFARI_KEYBOARD_ADDRESS_CLEAR : 0) : Math.max(insets.bottom, 12);
  const minH = 8 + 56 + 6 * 4 + padBottom + (48 + 36 + 44 + 48) * textScale;
  // The web lift is not counted here: where the page does not resize, the window height already follows
  // the visual viewport on react-native-web, so subtracting it again would count the keyboard twice.
  const room = winH - (kbH > 0 ? kbH + navInset : 0) - insets.top - 24;
  const restH = restingPanelHeight(winH);
  const panelH = Math.max(Math.min(restH, room), Math.min(minH, room));
  const colW = Math.min(winW, layout.maxContentWidth);

  // Reduced motion: no travel, a cross-fade. The shut panel is still parked below the screen (it snaps into
  // place as the fade begins), so an invisible panel is never lying over the day taking clicks.
  const translateY = reduced
    ? rise.interpolate({ inputRange: [0, 0.01, 1], outputRange: [panelH + 16, 0, 0] })
    : rise.interpolate({ inputRange: [0, 1], outputRange: [panelH + 16, 0] });
  const panelOpacity = reduced ? rise : 1;

  const pillA11y = draft ? `${t('capture.openA11y')}. ${t('capture.draftA11y')}` : t('capture.openA11y');

  return (
    // A modal region while open: on iOS, accessibilityViewIsModal hides this view's SIBLINGS, which are the
    // screen's own content (the parent also hides its list from Android and the web while the panel is up).
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none" accessibilityViewIsModal={shown}>
      {/* The scrim: a light wash over the day, and a tap on it is Close. A pointer target only: the panel's
          own Close is the accessible way out, so the scrim is never in the Tab order or a screen reader's path. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.scrim, { opacity: rise }]}
        pointerEvents={shown ? 'auto' : 'none'}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        {...webInert(!shown)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} focusable={false} tabIndex={-1} accessible={false} />
      </Animated.View>

      {/* The pill: the one way in, the same place always. */}
      {!hidden && (
        <Animated.View
          style={[styles.pillWrap, { bottom: pillBottom(insets.bottom), opacity: pillFade }]}
          pointerEvents={shown ? 'none' : 'box-none'}
          accessibilityElementsHidden={shown}
          importantForAccessibility={shown ? 'no-hide-descendants' : 'auto'}
          {...webInert(shown)}
        >
          <Animated.View style={[styles.pillShadow, { width: pillW }]}>
            <Pressable
              ref={pillRef}
              onPress={openSheet}
              accessibilityRole="button"
              accessibilityLabel={pillA11y}
              accessibilityState={{ expanded: shown }}
              aria-expanded={shown}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20">
                <Path d="M10 2 V18 M2 10 H18" stroke={theme.colors.onAccent} strokeWidth={3.2} strokeLinecap="round" fill="none" />
              </Svg>
              {waiting && (
                <Svg width={22} height={6} viewBox="0 0 22 6">
                  <Circle cx={3} cy={3} r={2.4} fill={theme.colors.onAccent} />
                  <Circle cx={11} cy={3} r={2.4} fill={theme.colors.onAccent} />
                  <Circle cx={19} cy={3} r={2.4} fill={theme.colors.onAccent} />
                </Svg>
              )}
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* The panel: it sits on the keyboard when there is one (the outer layer lifts, JS-driven), and
          rises from below the screen (the inner layer, native-driven). */}
      {/* Lifted only while open: a keyboard raised by some other field on the page (a rename on the held
          card) must not drag the shut panel up behind it. */}
      <Animated.View style={[styles.panelLift, { bottom: shown ? kbLift : 0 }]} pointerEvents="box-none">
        <Animated.View
          style={[styles.panel, { width: colW, height: panelH, paddingBottom: padBottom, opacity: panelOpacity, transform: [{ translateY }] }]}
          pointerEvents={shown ? 'auto' : 'none'}
          accessibilityElementsHidden={!shown}
          importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
          aria-hidden={!shown}
          {...webInert(!shown)}
        >
          <BrainDump ref={dumpRef} {...composer} onRequestClose={closeSheet} onDraftChange={setDraft} onFocusChange={setFieldFocused} />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const makeStyles = (t: Theme) => {
  const dark = t.scheme === 'dark';
  return StyleSheet.create({
    // Web clips the layer so the panel parked below the screen can never be painted outside the app (it
    // showed under Chrome's sliding address bar). Native leaves it unclipped; the window does that job.
    layer: Platform.OS === 'web' ? { overflow: 'hidden' } : {},
    scrim: { backgroundColor: dark ? 'rgba(0,0,0,0.4)' : rgba(t.colors.ink, 0.16) },
    pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    // The shadow lives on its own layer so the pill's width can animate while the shadow follows it.
    pillShadow: {
      height: PILL_H,
      borderRadius: PILL_H / 2,
      // Web draws the handoff's two layers exactly; native keeps the shadow props (and Android its
      // elevation 6), and web never sees them, since react-native-web deprecates them.
      ...(Platform.OS === 'web'
        ? {
            boxShadow: dark
              ? '0 14px 30px -10px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.4)'
              : `0 14px 30px -12px ${rgba(t.colors.ink, 0.5)}, 0 2px 6px ${rgba(t.colors.ink, 0.12)}`,
          }
        : {
            shadowColor: dark ? '#000000' : t.colors.ink,
            shadowOpacity: dark ? 0.75 : 0.5,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 14 },
            elevation: 6,
          }),
    },
    pill: {
      flex: 1,
      borderRadius: PILL_H / 2,
      backgroundColor: t.colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    pillPressed: { opacity: 0.85 },
    panelLift: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    panel: {
      // Solid, not surfaceCard: that one is translucent so cards show the living background, and a panel
      // lying over the list let the rows and the hint show through it (Melroy's iPhone, 2026-09-27).
      backgroundColor: t.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.line,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 8,
      paddingHorizontal: 18,
      ...(Platform.OS === 'web'
        ? { boxShadow: dark ? '0 -18px 40px -20px rgba(0,0,0,0.7)' : `0 -18px 40px -20px ${rgba(t.colors.ink, 0.35)}` }
        : {
            shadowColor: dark ? '#000000' : t.colors.ink,
            shadowOpacity: dark ? 0.7 : 0.35,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -18 },
            elevation: 12,
          }),
    },
  });
};
