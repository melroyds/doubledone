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
  onContextMenu?: (e: unknown) => void;
};

// A stand-in for a DOM element: the fields the door reads.
function el(tagName: string, role: string | null = null) {
  return { tagName: tagName.toUpperCase(), isContentEditable: false, getAttribute: (name: string) => (name === 'role' ? role : null) };
}
// The row as RN-web draws it: a div with role=checkbox.
const ROW = el('div', 'checkbox');

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

describe('rowDoor: Space on a task row (the 1 Nov bug sweep, #37)', () => {
  it('ticks the row once, exactly as a tap does, and keeps the page still', () => {
    const tap = vi.fn();
    const space = key(' ');
    door(vi.fn(), tap).onKeyDown?.(space);
    expect(tap).toHaveBeenCalledTimes(1);
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores a held Space after the first: one tick, never on and off, and the page still never scrolls', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    d.onKeyDown?.(key(' '));
    const repeats = [key(' ', { repeat: true }), key(' ', { repeat: true }), key(' ', { repeat: true })];
    for (const e of repeats) d.onKeyDown?.(e);
    expect(tap).toHaveBeenCalledTimes(1);
    for (const e of repeats) expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores Space on an inert row, as a tap does there: no tick, no page scroll, and its card door stays', () => {
    const open = vi.fn();
    const d = door(open, undefined); // TaskRow passes `inert ? undefined : onToggle`
    const space = key(' ');
    d.onKeyDown?.(space);
    expect(open).not.toHaveBeenCalled();
    expect(space.preventDefault).toHaveBeenCalledTimes(1); // the page stays still, as under any row
    d.onKeyDown?.(key('ContextMenu'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves a space typed into a field inside the row to the field', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    for (const field of [el('input'), el('textarea')]) {
      const typed = key(' ', { target: field });
      d.onKeyDown?.(typed);
      expect(typed.preventDefault).not.toHaveBeenCalled();
    }
    expect(tap).not.toHaveBeenCalled();
  });

  it('leaves Space to a row that is a button, which presses itself, so a step never advances twice', () => {
    const advance = vi.fn();
    const d = door(vi.fn(), advance);
    const stepped = el('button', 'button'); // the stepped row: role=button, which RN-web draws as a <button>
    const space = key(' ', { target: stepped, currentTarget: stepped });
    d.onKeyDown?.(space);
    expect(advance).not.toHaveBeenCalled();
    expect(space.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Enter to the press responder, which already ticks the row on Enter', () => {
    const tap = vi.fn();
    const enter = key('Enter');
    door(vi.fn(), tap).onKeyDown?.(enter);
    expect(tap).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Space with Ctrl, Alt or Meta, and a Space already answered, alone', () => {
    const tap = vi.fn();
    const d = door(vi.fn(), tap);
    for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { defaultPrevented: true }]) {
      d.onKeyDown?.(key(' ', init));
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
    d.onKeyDown?.(key(' '));
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
    const space = key(' ');
    d.onKeyDown?.(space);
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
    const enter = key('Enter');
    d.onKeyDown?.(enter);
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });
});
