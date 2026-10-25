import { type ReactNode, useLayoutEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { radius } from '@/constants/theme';
import { useReducedMotion, useTheme } from '@/lib/theme-provider';

type Props = {
  /** Where this row rests while another one is dragged past it (lib/drag-order shiftFor). */
  shift: number;
  /** This is the row being dragged: it follows the finger instead. */
  lifted: boolean;
  /** The dragged row's offset, owned by the screen and shared by every slot. */
  liftDy: Animated.Value;
  /** A drag is under way, so shifts glide. When none is, they snap: the new order is already laid out. */
  animate: boolean;
  onLayoutSlot: (y: number, h: number) => void;
  /** The slot's own element, so the screen can measure it at the moment a drag starts if no layout has arrived. */
  onNode?: (node: unknown) => void;
  grip?: ReactNode;
  children: ReactNode;
};

// One row of Today's list as a drag sees it (decision log 2026-10-25). It reports where the list laid it out, slides
// aside to open a gap while another row is carried past, and follows the finger when it is the one carried. All on
// the JS driver: the offsets change with every move and the layout reads them back. A shift that ends a drag (the
// order was written) snaps in a layout effect, before the frame paints, so the rows never flash at their old places.
export function DragSlot({ shift, lifted, liftDy, animate, onLayoutSlot, onNode, grip, children }: Props) {
  const reduced = useReducedMotion();
  const theme = useTheme();
  const [rest] = useState(() => new Animated.Value(0)); // the repo's compiler-safe Animated pattern
  useLayoutEffect(() => {
    if (!animate || reduced) {
      rest.setValue(shift);
      return;
    }
    const glide = Animated.timing(rest, { toValue: shift, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: false });
    glide.start();
    return () => glide.stop();
  }, [shift, animate, reduced, rest]);
  return (
    <Animated.View
      ref={onNode}
      onLayout={(e) => onLayoutSlot(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[
        { transform: lifted ? [{ translateY: liftDy }, { scale: reduced ? 1 : 1.02 }] : [{ translateY: rest }] },
        lifted && styles.lifted,
        // Quiet rows have no surface of their own, so a carried one would print over the row it passes. It takes the
        // page's own colour while it is carried, and gives it back on the drop.
        lifted && theme.appearance === 'quiet' && { backgroundColor: theme.colors.bg, borderRadius: radius.md },
      ]}
    >
      {children}
      {grip}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Carried above its neighbours, and a touch translucent so the gap it is heading for shows through.
  lifted: { zIndex: 10, elevation: 6, opacity: 0.94 },
});
