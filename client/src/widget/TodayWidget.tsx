import { FlexWidget, type HexColor, TextWidget } from 'react-native-android-widget';

import { t } from '@/lib/i18n-active';
import { type WidgetModel } from '@/lib/widget-model';

// The Today widget's UI, in the constrained widget component model (not RN views). Colors
// are the raw Dusk hexes (a widget can't use the app's theme system); the task renders a
// light and a dark variant so the widget follows the device. The whole card taps to open
// the app. No bundled font yet, so it uses the system face; the colours carry the brand.
const hx = (c: string): HexColor => c as HexColor;

// The widget's palette, inlined as raw hex (keep in sync with constants/theme's Dusk palette).
// NOT imported from constants/theme on purpose: that module runs `import '@/global.css'` and
// Appearance.getColorScheme() at load, which is unsafe in the headless widget task's JS context
// and left the widget rendering blank on device. The widget needs only these four hues per scheme.
const WIDGET_COLORS = {
  light: { accent: '#946475', ink: '#2B2722', inkSoft: '#7A7066', bg: '#FAF6F1' }, // accent kept in sync with the deepened Dusk accent (the 'Today' header is accent-as-text, so it must clear AA)
  dark: { accent: '#C68BA0', ink: '#F2EBE0', inkSoft: '#8A7F73', bg: '#1B1917' },
} as const;

export function TodayWidget({ model, scheme }: { model: WidgetModel; scheme: 'light' | 'dark' }) {
  // react-native-android-widget renders this in its OWN hook-less reconciler, not React's. The React
  // Compiler (experiments.reactCompiler in app.json) otherwise injects a memoization hook into every
  // compiled component, and that hook throws "Invalid hook call" here and blanks the widget. This
  // opt-out is what lets the widget render at all. Proven on device 2026-07-25: the self-diagnosing
  // handler caught this exact error (the lowercase diagnosticWidget is not compiled, so it survived to
  // report it), which was almost certainly the original 2026-06 "blank widget" misread as a new-arch bug.
  'use no memo';
  const c = WIDGET_COLORS[scheme];

  const children = [
    <TextWidget key="h" text={t('common.today')} style={{ fontSize: 16, color: hx(c.accent), fontWeight: '700' }} />,
  ];

  if (model.state === 'tasks') {
    const lines = model.lines.map((line, i) => (
      <TextWidget
        key={`l${i}`}
        text={line}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 15, color: hx(c.ink), marginTop: i === 0 ? 10 : 6 }}
      />
    ));
    if (model.remaining > model.lines.length) {
      lines.push(
        <TextWidget
          key="more"
          text={t('widget.more', { count: model.remaining - model.lines.length })}
          style={{ fontSize: 13, color: hx(c.inkSoft), marginTop: 8 }}
        />,
      );
    }
    children.push(
      <FlexWidget key="b" style={{ flexDirection: 'column' }}>
        {lines}
      </FlexWidget>,
    );
  } else {
    // No flex:1 / centring here: the card is sized to its content now (see the wrapper below),
    // so there is no leftover height to centre a rested line within.
    children.push(
      <FlexWidget key="b" style={{ flexDirection: 'column' }}>
        <TextWidget text={model.message} style={{ fontSize: 16, color: hx(c.inkSoft), marginTop: 10 }} />
      </FlexWidget>,
    );
  }

  // Two layers, deliberately. The OUTER is transparent and fills whatever slot the launcher gives
  // the widget; the INNER is the visible card, full width but `wrap_content` TALL, so it hugs its
  // content instead of stretching. That fixes two things at once (2026-07-25, device-reported):
  //   1. The "tombstone": with a match_parent card the background drawable and the host's measured
  //      height disagreed, the bottom of the rounded rect fell outside the clip, and the card
  //      rendered rounded on top but sliced flat across the bottom. Sizing to content removes the
  //      mismatch, and the 2dp outer inset keeps the card's edges off the clip boundary either way,
  //      so all four corners land inside the visible area. Symmetric by construction.
  //   2. The empty void: three tasks in a tall slot used to leave a huge black field below them.
  //      The card is now as tall as what it has to say, and no taller.
  // clickAction sits on the CARD, not the outer, so only the visible card opens the app.
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 2 }}>
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          height: 'wrap_content',
          flexDirection: 'column',
          backgroundColor: hx(c.bg),
          borderRadius: 24,
          padding: 16,
        }}
      >
        {children}
      </FlexWidget>
    </FlexWidget>
  );
}
