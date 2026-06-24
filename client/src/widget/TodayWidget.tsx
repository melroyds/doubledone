import { FlexWidget, type HexColor, TextWidget } from 'react-native-android-widget';

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
  light: { accent: '#9B6A7D', ink: '#2B2722', inkSoft: '#7A7066', bg: '#FAF6F1' },
  dark: { accent: '#C68BA0', ink: '#F2EBE0', inkSoft: '#8A7F73', bg: '#1B1917' },
} as const;

export function TodayWidget({ model, scheme }: { model: WidgetModel; scheme: 'light' | 'dark' }) {
  const c = WIDGET_COLORS[scheme];

  const children = [
    <TextWidget key="h" text="Today" style={{ fontSize: 16, color: hx(c.accent), fontWeight: '700' }} />,
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
          text={`+${model.remaining - model.lines.length} more`}
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
    children.push(
      <FlexWidget key="b" style={{ flex: 1, justifyContent: 'center' }}>
        <TextWidget text={model.message} style={{ fontSize: 16, color: hx(c.inkSoft), marginTop: 10 }} />
      </FlexWidget>,
    );
  }

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hx(c.bg),
        borderRadius: 24,
        padding: 16,
      }}
    >
      {children}
    </FlexWidget>
  );
}
