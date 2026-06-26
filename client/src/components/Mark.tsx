// Mark.tsx — the small thin-line SVG icon set. One single-weight glyph family that tints via the
// `color` prop, so a UI mark adapts to light/dark and the Dusk palette for free. This is what
// replaced the raster emoji (the reminder bell, the Speak mic, the Scan camera): emoji rendered in
// fixed multicolour, ignored t.colors, never dark-mode-adapted, and the bell leaned toward the alarm
// cue the never-alarm brand forbids. Add a glyph by adding a case here; keep them single-weight,
// rounded, on a 24 grid (Feather/Lucide lineage, MIT). Used by BrainDump's Speak / Scan buttons.

import Svg, { Circle, Line, Path } from 'react-native-svg';

export type MarkName = 'mic' | 'camera';

type Props = {
  name: MarkName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Mark({ name, size = 18, color = '#2B2722', strokeWidth = 2 }: Props) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={true}>
      {name === 'mic' ? (
        <>
          <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" {...stroke} />
          <Path d="M19 10v2a7 7 0 0 1-14 0v-2" {...stroke} />
          <Line x1="12" y1="19" x2="12" y2="23" {...stroke} />
          <Line x1="8" y1="23" x2="16" y2="23" {...stroke} />
        </>
      ) : (
        <>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" {...stroke} />
          <Circle cx="12" cy="13" r="4" {...stroke} />
        </>
      )}
    </Svg>
  );
}
