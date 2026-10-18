import { describe, expect, it, vi } from 'vitest';

import { hasStaticLanding, hideStaticLanding, showStaticLanding } from './landing-dom';

type Doc = NonNullable<Parameters<typeof showStaticLanding>[1]>;

// The smallest document the handoff touches: <html>'s classes and the landing's Begin links.
function fakeDoc(withLanding = true) {
  const classes = new Set<string>(['dd-app']);
  const handlers: ((e: never) => void)[] = [];
  const link = {
    addEventListener: (_: 'click', fn: (e: never) => void) => {
      handlers.push(fn);
    },
    removeEventListener: (_: 'click', fn: (e: never) => void) => {
      handlers.splice(handlers.indexOf(fn), 1);
    },
  };
  const doc = {
    documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } },
    getElementById: (id: string) => (withLanding && id === 'dd-landing' ? { querySelectorAll: () => [link, link] } : null),
  } as unknown as Doc;
  const click = (over: Record<string, unknown> = {}) => {
    const e = { button: 0, preventDefault: vi.fn(), ...over };
    for (const h of [...handlers]) h(e as never);
    return e;
  };
  return { doc, classes, handlers, click };
}

describe('the app taking over the static landing', () => {
  it('knows when a page load carries one', () => {
    expect(hasStaticLanding(fakeDoc().doc)).toBe(true);
    expect(hasStaticLanding(fakeDoc(false).doc)).toBe(false);
    expect(hasStaticLanding(null)).toBe(false);
  });

  it('shows it, turns Begin into a client-side navigation, and hands back on leave', () => {
    const f = fakeDoc();
    const onBegin = vi.fn();
    const undo = showStaticLanding(onBegin, f.doc);
    expect([...f.classes]).toEqual(['dd-landing']);
    const e = f.click();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onBegin).toHaveBeenCalledTimes(2); // both Begin links on the page
    undo();
    expect([...f.classes]).toEqual(['dd-app']);
    expect(f.handlers).toHaveLength(0);
  });

  it('leaves a new-tab or new-window click to the browser', () => {
    const f = fakeDoc();
    const onBegin = vi.fn();
    showStaticLanding(onBegin, f.doc);
    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const e = f.click(mod);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(onBegin).not.toHaveBeenCalled();
  });

  it('does nothing without a landing, or without a document (native)', () => {
    const f = fakeDoc(false);
    showStaticLanding(vi.fn(), f.doc)();
    expect([...f.classes]).toEqual(['dd-app']);
    expect(() => showStaticLanding(vi.fn(), null)()).not.toThrow();
    expect(() => hideStaticLanding(null)).not.toThrow();
  });

  it('hides it for a returning visitor', () => {
    const f = fakeDoc();
    f.classes.clear();
    f.classes.add('dd-landing');
    hideStaticLanding(f.doc);
    expect([...f.classes]).toEqual(['dd-app']);
  });
});
