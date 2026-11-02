import { describe, expect, it } from 'vitest';

import { isOptionsKey, isSpaceKey, ownsSpace, rowSpace, rowSpaceUp } from './row-options';

describe('isOptionsKey (the keyboard twin of a long-press)', () => {
  it('opens on the Menu key, with or without Shift', () => {
    expect(isOptionsKey({ key: 'ContextMenu' })).toBe(true);
    expect(isOptionsKey({ key: 'ContextMenu', shiftKey: true })).toBe(true);
  });

  it('opens on Shift+F10, the Menu key of a laptop without one', () => {
    expect(isOptionsKey({ key: 'F10', shiftKey: true })).toBe(true);
  });

  it('leaves F10 alone without Shift, and with another modifier on top', () => {
    expect(isOptionsKey({ key: 'F10' })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, altKey: true })).toBe(false);
    expect(isOptionsKey({ key: 'F10', shiftKey: true, metaKey: true })).toBe(false);
  });

  it('never claims the keys a row already answers (Enter ticks it) or a missing key', () => {
    expect(isOptionsKey({ key: 'Enter' })).toBe(false);
    expect(isOptionsKey({ key: ' ' })).toBe(false);
    expect(isOptionsKey({ key: 'Escape' })).toBe(false);
    expect(isOptionsKey({})).toBe(false);
  });
});

// A stand-in for a DOM element: the three fields ownsSpace reads.
function el(tagName: string, role: string | null = null, isContentEditable = false) {
  return { tagName: tagName.toUpperCase(), isContentEditable, getAttribute: (name: string) => (name === 'role' ? role : null) };
}
// The row as RN-web draws it: a div with role=checkbox.
const ROW = el('div', 'checkbox');

describe('isSpaceKey', () => {
  it('is Space, and Spacebar from an older browser, and nothing else', () => {
    expect(isSpaceKey({ key: ' ' })).toBe(true);
    expect(isSpaceKey({ key: 'Spacebar' })).toBe(true);
    expect(isSpaceKey({ key: 'Enter' })).toBe(false);
    expect(isSpaceKey({ key: '  ' })).toBe(false);
    expect(isSpaceKey({})).toBe(false);
  });
});

describe('ownsSpace (an element that does its own thing with Space)', () => {
  it('is a text field, which types the space, whatever the case of its tag', () => {
    expect(ownsSpace(el('input'))).toBe(true);
    expect(ownsSpace(el('textarea'))).toBe(true);
    expect(ownsSpace(el('select'))).toBe(true);
    expect(ownsSpace({ tagName: 'input' })).toBe(true);
    expect(ownsSpace(el('div', null, true))).toBe(true);
  });

  it('is a button, which presses itself: a <button>, or a role=button the press responder presses', () => {
    expect(ownsSpace(el('button'))).toBe(true);
    expect(ownsSpace(el('button', 'button'))).toBe(true);
    expect(ownsSpace(el('div', 'button'))).toBe(true);
  });

  it('is not a checkbox row, a radio, a plain element or anything that is not an element', () => {
    expect(ownsSpace(ROW)).toBe(false);
    expect(ownsSpace(el('div', 'radio'))).toBe(false);
    expect(ownsSpace(el('div'))).toBe(false);
    expect(ownsSpace(el('span', 'presentation'))).toBe(false);
    expect(ownsSpace({})).toBe(false);
    expect(ownsSpace(null)).toBe(false);
    expect(ownsSpace(undefined)).toBe(false);
    expect(ownsSpace('button')).toBe(false);
    expect(ownsSpace({ tagName: 7, getAttribute: 'button' })).toBe(false);
  });
});

describe('rowSpace (what Space going down does on a task row, on the web)', () => {
  const on = { target: ROW, currentTarget: ROW };

  it('arms the focused row, whose tap runs when the key comes up, Shift or not', () => {
    expect(rowSpace({ key: ' ', ...on })).toBe('arm');
    expect(rowSpace({ key: 'Spacebar', ...on })).toBe('arm');
    expect(rowSpace({ key: ' ', shiftKey: true, ...on })).toBe('arm');
    expect(rowSpace({ key: ' ', repeat: false, ...on })).toBe('arm');
  });

  it('only swallows a held Space: the row is ticked once, never on and off, and the page stays still', () => {
    expect(rowSpace({ key: ' ', repeat: true, ...on })).toBe('swallow');
  });

  it('passes every other key on, Enter above all: the press responder ticks the row on Enter', () => {
    for (const key of ['Enter', 'a', 'Tab', 'Escape', 'F10', 'ContextMenu', 'ArrowDown']) {
      expect(rowSpace({ key, ...on })).toBe('pass');
    }
    expect(rowSpace({ ...on })).toBe('pass');
  });

  it('passes Space with Ctrl, Alt or Meta on, to the browser and the system', () => {
    expect(rowSpace({ key: ' ', ctrlKey: true, ...on })).toBe('pass');
    expect(rowSpace({ key: ' ', altKey: true, ...on })).toBe('pass');
    expect(rowSpace({ key: ' ', metaKey: true, ...on })).toBe('pass');
  });

  it('passes a Space somebody already answered', () => {
    expect(rowSpace({ key: ' ', defaultPrevented: true, ...on })).toBe('pass');
    expect(rowSpace({ key: ' ', nativeEvent: { defaultPrevented: true }, ...on })).toBe('pass');
  });

  it('passes Space on a row that is a button: it presses itself, so a step never advances twice', () => {
    const stepped = el('button', 'button');
    expect(rowSpace({ key: ' ', target: stepped, currentTarget: stepped })).toBe('pass');
    const roleButton = el('div', 'button');
    expect(rowSpace({ key: ' ', target: roleButton, currentTarget: roleButton })).toBe('pass');
  });

  it('passes a Space typed into something inside the row: a text field keeps its own', () => {
    expect(rowSpace({ key: ' ', target: el('input'), currentTarget: ROW })).toBe('pass');
    expect(rowSpace({ key: ' ', target: el('textarea'), currentTarget: ROW })).toBe('pass');
    expect(rowSpace({ key: ' ', target: el('div', null, true), currentTarget: ROW })).toBe('pass');
    expect(rowSpace({ key: ' ', target: el('span'), currentTarget: ROW })).toBe('pass');
    // A field with no row around it to compare against is still a field.
    expect(rowSpace({ key: ' ', target: el('input') })).toBe('pass');
  });

  it('decides from the target alone when the event names no current target', () => {
    expect(rowSpace({ key: ' ', target: ROW })).toBe('arm');
  });
});

describe('rowSpaceUp (what Space coming up does, given the row it went down on)', () => {
  const on = { target: ROW, currentTarget: ROW };
  // Today's Done today line, a real <button>, where the focus can land while the key is held.
  const LINE = el('button', 'button');

  it('taps the row the key went down on, when it comes up on that row', () => {
    expect(rowSpaceUp({ key: ' ', ...on }, ROW)).toBe('tap');
    expect(rowSpaceUp({ key: 'Spacebar', ...on }, ROW)).toBe('tap');
  });

  it('forgets a press that came up anywhere else, and taps nothing', () => {
    expect(rowSpaceUp({ key: ' ', target: LINE, currentTarget: LINE }, ROW)).toBe('disarm');
    expect(rowSpaceUp({ key: ' ', target: el('div', 'checkbox'), currentTarget: el('div', 'checkbox') }, ROW)).toBe('disarm');
    // On the armed row, but on something inside it: a field or a button the focus moved into.
    expect(rowSpaceUp({ key: ' ', target: el('input'), currentTarget: ROW }, ROW)).toBe('disarm');
    expect(rowSpaceUp({ key: ' ', target: ROW }, ROW)).toBe('disarm');
  });

  it('passes every other key, and a Space with no press behind it', () => {
    for (const key of ['Enter', 'a', 'Tab', 'Escape', 'ContextMenu']) {
      expect(rowSpaceUp({ key, ...on }, ROW)).toBe('pass');
    }
    expect(rowSpaceUp({ key: ' ', ...on }, null)).toBe('pass');
    expect(rowSpaceUp({ key: ' ', ...on }, undefined)).toBe('pass');
  });
});
