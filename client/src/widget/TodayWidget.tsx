import { FlexWidget, type HexColor, TextWidget } from 'react-native-android-widget';

import { Colors } from '@/constants/theme';
import { type WidgetModel } from '@/lib/widget-model';

// The Today widget's UI, in the constrained widget component model (not RN views). Colors
// are the raw Dusk hexes (a widget can't use the app's theme system); the task renders a
// light and a dark variant so the widget follows the device. The whole card taps to open
// the app. No bundled font yet, so it uses the system face; the colours carry the brand.
const hx = (c: string): HexColor => c as HexColor;

export function TodayWidget({ model, scheme }: { model: WidgetModel; scheme: 'light' | 'dark' }) {
  const c = Colors[scheme];

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
