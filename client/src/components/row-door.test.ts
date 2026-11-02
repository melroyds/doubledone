import { afterEach, describe, expect, it, vi } from 'vitest';

import { rowDoor } from './row-door';

// react-native has no node build, so its Platform is a stub (vi.mock is hoisted above the import), and the stub
// can move, to check that the phones get nothing.
const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react-native', () => ({ Platform: platform }));

afterEach(() => {
  platform.OS = 'web';
});

type Door = {
  'aria-keyshortcuts'?: string;
  onKeyDown?: (e: unknown) => void;
  onKeyUp?: (e: unknown) => void;
  onBlur?: (e: unknown) => void;
  onContextMenu?: (e: unknown) => void;
};

// A stand-in for a DOM element: the fields the door reads.
function el(tagName: string, role: string | null = null) {
  return { tagName: tagName.toUpperCase(), isContentEditable: false, getAttribute: (name: string) => (name === 'role' ? role : null) };
}
// The row as RN-web draws it: a div with role=checkbox.
const ROW = el('div', 'checkbox');
// Another row, and Today's Done today line (a real <button>), for the presses that wander.
const OTHER_ROW = el('div', 'checkbox');
const DONE_LINE = el('button', 'button');

type KeyInit = Partial<{
  target: unknown;
  currentTarget: unknown;
  defaultPrevented: boolean;
  nativeEvent: { defaultPrevented?: boolean };
  repeat: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}>;

// A keydown (or a contextmenu) on the row, whose preventDefault records itself the way a real one does.
function key(k: string, init: KeyInit = {}) {
  const preventDefault = vi.fn();
  const e = { key: k, target: ROW as unknown, currentTarget: ROW as unknown, defaultPrevented: false, ...init, preventDefault };
  preventDefault.mockImplementation(() => {
    e.defaultPrevented = true;
  });
  return e;
}

function door(open?: () => void, tap?: () => void) {
  return rowDoor(open, tap) as Door;
}

// A Space that goes down and comes up on the row.
function press(d: Door, init: KeyInit = {}) {
  const down = key(' ', init);
  const up = key(' ', init);
  d.onKeyDown?.(down);
  d.onKeyUp?.(up);
  return { down, up };
}

// The door remembers the row a Space went down on, between renders. A Space coming up on anything a door is on
// forgets it, so no test leaves a row armed for the next. (The platform first: after hooks run last to first.)
afterEach(() => {
  platform.OS = 'web';
  door(undefined, undefined).onKeyUp?.(key(' ', { target: OTHER_ROW, currentTarget: OTHER_ROW }));
});

describe('rowDoor: Space on a task row (the 1 Nov bug sweep, #37)', () => {
  it('ticks the row once, exactly as a tap does, when the key comes up, and keeps the page still', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    const down = key(' ');
    d.onKeyDown?.(down);
    expect(tap).not.toHaveBeenCalled(); // a native checkbox ticks on the way up, and so does a row
    expect(down.preventDefault).toHaveBeenCalledTimes(1);
    d.onKeyUp?.(key(' '));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('ticks a held Space once, when it is let go: never on and off, and the page never scrolls', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    d.onKeyDown?.(key(' '));
    const repeats = [key(' ', { repeat: true }), key(' ', { repeat: true }), key(' ', { repeat: true })];
    for (const e of repeats) d.onKeyDown?.(e);
    expect(tap).not.toHaveBeenCalled();
    for (const e of repeats) expect(e.preventDefault).toHaveBeenCalledTimes(1);
    d.onKeyUp?.(key(' '));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('ticks again on the next press, as two taps would', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    press(d);
    press(d);
    expect(tap).toHaveBeenCalledTimes(2);
  });

  it('never ticks a row whose Space came up somewhere else, and never later either', () => {
    // The review's case: the focus moves while Space is held, and the key comes up on Today's Done today line.
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    d.onKeyDown?.(key(' '));
    door(undefined, undefined).onKeyUp?.(key(' ', { target: OTHER_ROW, currentTarget: OTHER_ROW }));
    d.onKeyUp?.(key(' '));
    expect(tap).not.toHaveBeenCalled();
    // A row that never saw the key go down never ticks on its coming up.
    const other = vi.fn();
    d.onKeyDown?.(key(' '));
    door(vi.fn(), other).onKeyUp?.(key(' ', { target: OTHER_ROW, currentTarget: OTHER_ROW }));
    expect(other).not.toHaveBeenCalled();
    expect(tap).not.toHaveBeenCalled();
  });

  it('forgets the press when the row loses focus while the key is down', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    d.onKeyDown?.(key(' '));
    d.onBlur?.({ currentTarget: ROW });
    d.onKeyUp?.(key(' '));
    expect(tap).not.toHaveBeenCalled();
    // Another element's blur is not this row's.
    d.onKeyDown?.(key(' '));
    d.onBlur?.({ currentTarget: DONE_LINE });
    d.onKeyUp?.(key(' '));
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('never ticks on a Space that comes up with no press behind it, or on a key that is not Space', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    d.onKeyUp?.(key(' '));
    d.onKeyDown?.(key(' '));
    d.onKeyUp?.(key('Enter'));
    expect(tap).not.toHaveBeenCalled();
    d.onKeyUp?.(key(' ')); // the Space that went down still ticks when it comes up
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('runs the tap of the row as it renders now, so a render while the key is down loses nothing', () => {
    const before = vi.fn();
    const after = vi.fn();
    door(vi.fn(), before).onKeyDown?.(key(' '));
    door(vi.fn(), after).onKeyUp?.(key(' ')); // the same row, drawn again with a fresh handler
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('ignores Space on an inert row, as a tap does there: no tick, no page scroll, and its card door stays', () => {
    const open = vi.fn();
    const d = door(open, undefined); // TaskRow passes `inert ? undefined : onToggle`
    const { down } = press(d);
    expect(open).not.toHaveBeenCalled();
    expect(down.preventDefault).toHaveBeenCalledTimes(1); // the page stays still, as under any row
    d.onKeyDown?.(key('ContextMenu'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves a space typed into a field inside the row to the field', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    for (const field of [el('input'), el('textarea')]) {
      const { down } = press(d, { target: field });
      expect(down.preventDefault).not.toHaveBeenCalled();
    }
    expect(tap).not.toHaveBeenCalled();
  });

  it('leaves Space on a button inside the row to that button: a step’s title or its remove, in a review list', () => {
    const tap = vi.fn();
    const d = door(undefined, tap);
    const { down } = press(d, { target: el('button', 'button'), currentTarget: ROW });
    expect(down.preventDefault).not.toHaveBeenCalled(); // the button presses itself on Space
    expect(tap).not.toHaveBeenCalled();
  });

  it('leaves Space to a row that is a button, which presses itself, so a step never advances twice', () => {
    const advance = vi.fn();
    const d = door(vi.fn(), advance);
    const stepped = el('button', 'button'); // the stepped row: role=button, which RN-web draws as a <button>
    const { down } = press(d, { target: stepped, currentTarget: stepped });
    expect(advance).not.toHaveBeenCalled();
    expect(down.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Enter to the press responder, which already ticks the row on Enter', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    const enter = key('Enter');
    d.onKeyDown?.(enter);
    d.onKeyUp?.(key('Enter'));
    expect(tap).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Space with Ctrl, Alt or Meta, and a Space already answered, alone', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { defaultPrevented: true }]) {
      press(d, init);
    }
    expect(tap).not.toHaveBeenCalled();
  });

  it('picks the row in select mode, the one handler a tap runs there, with no card door', () => {
    const select = vi.fn();
    const d = door(undefined, select);
    expect(d['aria-keyshortcuts']).toBeUndefined();
    expect(d.onContextMenu).toBeUndefined();
    const menu = key('ContextMenu');
    d.onKeyDown?.(menu);
    expect(menu.preventDefault).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    press(d);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe('rowDoor: the card doors it always had (store 1.9, slice 2, K1)', () => {
  it('opens the card on the Menu key and Shift+F10, and never ticks the row', () => {
    const open = vi.fn();
    const tap = vi.fn();
    const d = door(open, tap);
    expect(d['aria-keyshortcuts']).toBe('Shift+F10');
    const menu = key('ContextMenu');
    d.onKeyDown?.(menu);
    d.onKeyDown?.(key('F10', { shiftKey: true }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(menu.preventDefault).toHaveBeenCalledTimes(1);
    expect(tap).not.toHaveBeenCalled();
  });

  it('opens the card on a right-click, unless the press responder already took it (a touch hold)', () => {
    const open = vi.fn();
    const d = door(open, vi.fn());
    const click = key('');
    d.onContextMenu?.(click);
    expect(open).toHaveBeenCalledTimes(1);
    expect(click.preventDefault).toHaveBeenCalledTimes(1);
    d.onContextMenu?.(key('', { defaultPrevented: true }));
    d.onContextMenu?.(key('', { nativeEvent: { defaultPrevented: true } }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('gives the phones nothing: they have their own doors (the hold, and the screen reader’s Options)', () => {
    for (const os of ['ios', 'android']) {
      platform.OS = os;
      expect(rowDoor(vi.fn(), vi.fn())).toEqual({});
      expect(rowDoor(undefined, vi.fn())).toEqual({});
    }
  });

  it('gives a row with nothing to open and nothing to tap no card door, and Space still moves nothing', () => {
    const d = door(undefined, undefined);
    expect(d['aria-keyshortcuts']).toBeUndefined();
    expect(d.onContextMenu).toBeUndefined();
    const { down } = press(d);
    expect(down.preventDefault).toHaveBeenCalledTimes(1);
    const enter = key('Enter');
    d.onKeyDown?.(enter);
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });
});
