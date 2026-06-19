import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// Respect the user's reduced-motion preference (web media query or native a11y
// flag). A UI seam, like locale.ts: it touches platform APIs, so it is not unit
// tested. Motion in DoubleDone is always gentle and always optional, this is how
// every animated surface (the marquee, the close-the-day card) gates itself so
// autistic / motion-sensitive users are never shown movement they did not ask for.
export function useReducedMotion(): boolean {
  // Lazy initial read (web can answer synchronously); the effect then only
  // subscribes to changes, so no setState fires synchronously inside it.
  const [reduced, setReduced] = useState(getReducedMotionInitial);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
      if (!mq) return;
      const handler = (e: MediaQueryListEvent) => {
        if (mounted) setReduced(e.matches);
      };
      mq.addEventListener?.('change', handler);
      return () => {
        mounted = false;
        mq.removeEventListener?.('change', handler);
      };
    }
    // Native has no synchronous getter, so read it once (async) then subscribe.
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (mounted) setReduced(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function getReducedMotionInitial(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }
  return false;
}
