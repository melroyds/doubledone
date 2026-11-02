import { afterEach, describe, expect, it, vi } from 'vitest';

import { radioDoor } from './radio-door';

// react-native has no node build, so its Platform is a stub (vi.mock is hoisted above the import), and the stub
// can move, to check that the phones get nothing.
const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react-native', () => ({ Platform: platform }));

afterEach(() => {
  platform.OS = 'web';
});

type Door = { tabIndex?: number; onKeyDown?: (e: unknown) => void };

type FakeRadio = {
  tagName: string;
  getAttribute: (name: string) => string | null;
  focus: ReturnType<typeof vi.fn>;
  closest: (selector: string) => unknown;
};

// The group as RN-web draws Today's Energy pills: a role=radiogroup div holding three role=radio divs.
function group(count = 3, tagName = 'DIV') {
  const radios: FakeRadio[] = [];
  const box = { querySelectorAll: (selector: string) => (selector === '[role="radio"]' ? radios : []) };
  for (let i = 0; i < count; i++) {
    radios.push({
      tagName,
      getAttribute: (name: string) => (name === 'role' ? 'radio' : null),
      focus: vi.fn(),
      closest: (selector: string) => (selector === '[role="radiogroup"]' ? box : null),
    });
  }
  return radios;
}

type KeyInit = Partial<{ target: unknown; defaultPrevented: boolean; repeat: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }>;

// A keydown on a radio, whose preventDefault records itself the way a real one does.
function key(k: string, on: FakeRadio, init: KeyInit = {}) {
  const preventDefault = vi.fn();
  const e = { key: k, target: on as unknown, currentTarget: on as unknown, defaultPrevented: false, ...init, preventDefault };
  preventDefault.mockImplementation(() => {
    e.defaultPrevented = true;
  });
  return e;
}

// Three pills with `checked` chosen, each door built the way Today builds it.
function pills(checked: number) {
  const radios = group();
  const pick = vi.fn();
  const doors = radios.map((_, i) => radioDoor(i, radios.length, i === checked, pick) as Door);
  return { radios, pick, doors };
}

describe('radioDoor: the Energy pills as one radio group on the web (the 1 Nov bug sweep, #37)', () => {
  it('makes the chosen pill the only tab stop: Tab lands on the choice and the next Tab leaves the group', () => {
    expect(pills(1).doors.map((d) => d.tabIndex)).toEqual([-1, 0, -1]);
    expect(pills(0).doors.map((d) => d.tabIndex)).toEqual([0, -1, -1]);
  });

  it('picks the focused pill on Space, keeps the page still, and leaves the focus where it is', () => {
    const { radios, pick, doors } = pills(1);
    const space = key(' ', radios[1]);
    doors[1].onKeyDown?.(space);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledWith(1);
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
    for (const r of radios) expect(r.focus).not.toHaveBeenCalled();
  });

  it('moves the choice and the focus together on the arrows, wrapping at either end', () => {
    const { radios, pick, doors } = pills(2);
    const right = key('ArrowRight', radios[2]);
    doors[2].onKeyDown?.(right);
    expect(pick).toHaveBeenLastCalledWith(0); // High wraps to Low
    expect(radios[0].focus).toHaveBeenCalledTimes(1);
    expect(right.preventDefault).toHaveBeenCalledTimes(1);

    doors[0].onKeyDown?.(key('ArrowLeft', radios[0]));
    expect(pick).toHaveBeenLastCalledWith(2); // Low wraps to High
    expect(radios[2].focus).toHaveBeenCalledTimes(1);

    doors[1].onKeyDown?.(key('ArrowDown', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(2);
    doors[1].onKeyDown?.(key('ArrowUp', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(0);
  });

  it('goes to the first on Home and the last on End', () => {
    const { radios, pick, doors } = pills(1);
    doors[1].onKeyDown?.(key('Home', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(0);
    expect(radios[0].focus).toHaveBeenCalledTimes(1);
    doors[1].onKeyDown?.(key('End', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(2);
    expect(radios[2].focus).toHaveBeenCalledTimes(1);
  });

  it('does not move the focus when the key lands where it already is', () => {
    const { radios, pick, doors } = pills(0);
    doors[0].onKeyDown?.(key('Home', radios[0]));
    expect(pick).toHaveBeenCalledWith(0);
    expect(radios[0].focus).not.toHaveBeenCalled();
  });

  it('leaves Enter to the press responder, which already picks the pill, so nothing is picked twice', () => {
    const { radios, pick, doors } = pills(1);
    const enter = key('Enter', radios[0]);
    doors[0].onKeyDown?.(enter);
    expect(pick).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves alone a key already answered, a key from inside the pill, and the browser’s own chords', () => {
    const { radios, pick, doors } = pills(1);
    doors[1].onKeyDown?.(key('ArrowRight', radios[1], { defaultPrevented: true }));
    doors[1].onKeyDown?.(key(' ', radios[1], { target: { tagName: 'INPUT', getAttribute: () => null } }));
    doors[1].onKeyDown?.(key('ArrowLeft', radios[1], { altKey: true }));
    doors[1].onKeyDown?.(key('Home', radios[1], { ctrlKey: true }));
    doors[1].onKeyDown?.(key('End', radios[1], { metaKey: true }));
    expect(pick).not.toHaveBeenCalled();
    for (const r of radios) expect(r.focus).not.toHaveBeenCalled();
  });

  it('picks once for a held Space, while its repeats keep the page still', () => {
    // The welcome's pick records the choice too, so a held Space must not record it thirty times a second.
    const { radios, pick, doors } = pills(1);
    doors[1].onKeyDown?.(key(' ', radios[1]));
    const repeats = [key(' ', radios[1], { repeat: true }), key(' ', radios[1], { repeat: true })];
    for (const e of repeats) doors[1].onKeyDown?.(e);
    expect(pick).toHaveBeenCalledTimes(1);
    for (const e of repeats) expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('keeps moving on a held arrow, as a radio group does', () => {
    const { radios, pick, doors } = pills(0);
    doors[0].onKeyDown?.(key('ArrowRight', radios[0], { repeat: true }));
    expect(pick).toHaveBeenLastCalledWith(1);
    expect(radios[1].focus).toHaveBeenCalledTimes(1);
  });

  it('serves a group of two, the welcome’s Keep and Tuck, the same way', () => {
    const radios = group(2);
    const pick = vi.fn();
    const doors = radios.map((_, i) => radioDoor(i, 2, i === 0, pick) as Door);
    expect(doors.map((d) => d.tabIndex)).toEqual([0, -1]);
    doors[0].onKeyDown?.(key('ArrowRight', radios[0]));
    expect(pick).toHaveBeenLastCalledWith(1);
    expect(radios[1].focus).toHaveBeenCalledTimes(1);
    doors[1].onKeyDown?.(key('ArrowRight', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(0); // Tuck wraps to Keep
    doors[1].onKeyDown?.(key(' ', radios[1]));
    expect(pick).toHaveBeenLastCalledWith(1);
  });

  it('leaves Space to a radio drawn as a button, which presses itself, so one Space never picks twice', () => {
    const radios = group(3, 'BUTTON');
    const pick = vi.fn();
    const door = radioDoor(1, 3, true, pick) as Door;
    const space = key(' ', radios[1]);
    door.onKeyDown?.(space);
    expect(pick).not.toHaveBeenCalled();
    expect(space.preventDefault).not.toHaveBeenCalled();
  });

  it('gives the phones nothing: their roles and announcements stay exactly as they were', () => {
    for (const os of ['ios', 'android']) {
      platform.OS = os;
      expect(radioDoor(0, 3, true, vi.fn())).toEqual({});
      expect(radioDoor(1, 3, false, vi.fn())).toEqual({});
    }
  });
});
