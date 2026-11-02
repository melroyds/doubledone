import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { picked } from './picked';

// react-native has no node build, so its Platform is a stub (vi.mock is hoisted above the import), and the stub
// can move, to check that the default follows Platform.OS.
const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));

afterEach(() => {
  platform.OS = 'ios';
});

const PHONES = ['ios', 'android'] as const;
const EVERYWHERE = ['web', ...PHONES] as const;

describe('picked', () => {
  it('says the pick with aria-pressed on the web, true and false, and never aria-selected', () => {
    expect(picked(true, 'web')).toEqual({ 'aria-pressed': true });
    // False is said too: without it the other options read as plain buttons, not toggles that are not pressed.
    expect(picked(false, 'web')).toEqual({ 'aria-pressed': false });
    expect(picked(true, 'web')).not.toHaveProperty('aria-selected');
    expect(picked(false, 'web')).not.toHaveProperty('aria-selected');
  });

  it('keeps aria-selected on iOS and Android, exactly as before, and never aria-pressed', () => {
    for (const os of PHONES) {
      expect(picked(true, os)).toEqual({ 'aria-selected': true });
      expect(picked(false, os)).toEqual({ 'aria-selected': false });
      expect(picked(true, os)).not.toHaveProperty('aria-pressed');
    }
  });

  it('follows Platform.OS when no platform is passed', () => {
    expect(picked(true)).toEqual({ 'aria-selected': true });
    platform.OS = 'android';
    expect(picked(false)).toEqual({ 'aria-selected': false });
    platform.OS = 'web';
    expect(picked(true)).toEqual({ 'aria-pressed': true });
  });

  it('merges with the state a control already says, in either order, and loses none of it', () => {
    // What the call sites carry beside the pick today (DatePicker's disabled day, the Speak button's busy state),
    // plus the object form React Native also reads. Spread before or after, every one of them survives.
    const own = {
      disabled: true,
      'aria-disabled': true,
      'aria-expanded': false,
      'aria-busy': false,
      'aria-checked': 'mixed',
      accessibilityState: { expanded: true, busy: true },
    };
    for (const os of EVERYWHERE) {
      const pick = os === 'web' ? 'aria-pressed' : 'aria-selected';
      expect({ ...own, ...picked(true, os) }).toEqual({ ...own, [pick]: true });
      expect({ ...picked(false, os), ...own }).toEqual({ ...own, [pick]: false });
    }
  });

  it('is one aria prop, never an accessibilityState object that would replace a control’s own', () => {
    for (const os of EVERYWHERE) {
      for (const on of [true, false]) {
        const props = picked(on, os);
        expect(Object.keys(props)).toHaveLength(1);
        expect(props).not.toHaveProperty('accessibilityState');
        expect(Object.keys(props)[0]).toMatch(/^aria-/);
      }
    }
  });
});

// The call sites, read from the source (the review of #33). A test of the helper alone passes even when a control
// stops calling it, and #33 came from exactly that: hand-written copies, each saying aria-selected on a role=button,
// which the phones announce and a web screen reader never does. TypeScript cannot help, because React Native's types
// accept aria-selected on every View and reject aria-pressed, so the wrong word compiles and the right one does not.
// So a pick is said through picked(), and the source is read for the spellings that go silent on the web:
//   - aria-selected by hand, on anything but a tab (a role=button that says it is heard as a plain button);
//   - accessibilitySelected, which react-native-web writes as aria-selected, the same silence;
//   - accessibilityState's selected, which react-native-web drops altogether.
// A new use fails here until it goes through picked() or joins the list with its reason, and a listed use that goes
// away fails too, so the list only holds what is really there.

const SRC = join(__dirname, '..');
// The helper itself says aria-selected for the phones, and its comments name every spelling.
const HELPER = 'lib/picked.ts';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return sources(path);
    if (!/\.tsx?$/.test(d.name) || /\.test\.ts$/.test(d.name)) return [];
    return [path];
  });
}

const FILES = sources(SRC)
  .map((path) => ({ file: relative(SRC, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }))
  .filter((f) => f.file !== HELPER);

/** Every line outside a comment that matches, as `file:line code`. */
function lines(pattern: RegExp): { file: string; where: string }[] {
  return FILES.flatMap(({ file, text }) =>
    text.split('\n').flatMap((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || !pattern.test(line)) return [];
      return [{ file, where: `${file}:${i + 1} ${code}` }];
    }),
  );
}

// Where aria-selected is the right word, and why. [file]: reason.
const SELECTED_IS_RIGHT: Record<string, string> = {
  'components/DayHeading.tsx': 'the Today · Ours words, role=tab in a tablist, where aria-selected is the ARIA state',
};

describe('the picked state at every call site (the 1 Nov bug sweep, #33)', () => {
  it('reads the source tree', () => {
    // A path change that left the scan reading nothing would pass everything below.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.some((f) => f.file === 'app/today.tsx')).toBe(true);
  });

  it('says a pick through picked(), never aria-selected by hand, except on a tab', () => {
    expect(lines(/aria-selected/).filter((s) => !(s.file in SELECTED_IS_RIGHT)).map((s) => s.where)).toEqual([]);
  });

  it('never spells a pick the way react-native-web drops or misreads it', () => {
    expect(lines(/accessibilitySelected/).map((s) => s.where)).toEqual([]);
    // Across lines too: an accessibilityState object can open on one line and name selected on the next.
    const objects = FILES.flatMap(({ file, text }) =>
      [...text.matchAll(/accessibilityState=\{\{([^}]*)\}\}/g)].filter((m) => /\bselected\b/.test(m[1])).map((m) => `${file}: ${m[0]}`),
    );
    expect(objects).toEqual([]);
  });

  it('keeps the shared chip and segment on picked(), the two that most of the app’s picks go through', () => {
    for (const file of ['components/Chip.tsx', 'components/Segmented.tsx']) {
      expect(FILES.find((f) => f.file === file)?.text ?? '').toMatch(/\{\.\.\.picked\(/);
    }
  });

  it('lists only what is really there', () => {
    const selected = new Set(lines(/aria-selected/).map((s) => s.file));
    expect(Object.keys(SELECTED_IS_RIGHT).filter((file) => !selected.has(file))).toEqual([]);
  });
});
