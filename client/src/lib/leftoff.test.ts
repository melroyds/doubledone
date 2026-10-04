import { describe, expect, it } from 'vitest';

import { combineTasks } from './combine';
import { buildExport } from './export';
import { formatWrittenOn } from './i18n';
import { cleanLeftOff, forSpeech, LEFT_OFF_MAX, newerLeftOff, newestLeftOff, normalizeLeftOffText } from './leftoff';
import { rowToTask, taskToRow } from './sync';
import { deserialize, rebaseOnLatest, serialize, type Task } from './tasks';
import { healStuckParents, resurfaceOpenParent, setLeftOff, settleCompletions } from './today';

const today = new Date(2026, 9, 4);
const mk = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, done: false, createdAt: 0, updatedAt: 0, ...over });

describe('normalizeLeftOffText', () => {
  it('makes one line: pasted breaks and tabs become single spaces, ends trimmed', () => {
    expect(normalizeLeftOffText('  Called,\nref 4471\r\n\tring back Thu  ')).toBe('Called, ref 4471 ring back Thu');
  });

  it('keeps the no-break space a French writer types before a colon', () => {
    expect(normalizeLeftOffText('Rappelé : lundi')).toBe('Rappelé : lundi');
  });

  it('caps at 280 without splitting a surrogate pair', () => {
    expect(normalizeLeftOffText('a'.repeat(400))).toHaveLength(LEFT_OFF_MAX);
    const emojiAtCap = 'a'.repeat(LEFT_OFF_MAX - 1) + '\u{1F600}';
    const out = normalizeLeftOffText(emojiAtCap);
    expect(out).toBe('a'.repeat(LEFT_OFF_MAX - 1));
  });
});

describe('cleanLeftOff (storage and sync never trust a line)', () => {
  it('keeps a well-formed line and drops anything else', () => {
    expect(cleanLeftOff({ text: 'ring back Thu', writtenOn: '2026-09-30' })).toEqual({ text: 'ring back Thu', writtenOn: '2026-09-30' });
    expect(cleanLeftOff({ text: '   ', writtenOn: '2026-09-30' })).toBeUndefined();
    expect(cleanLeftOff({ text: 'x', writtenOn: '30/09/2026' })).toBeUndefined();
    expect(cleanLeftOff({ text: 5, writtenOn: '2026-09-30' })).toBeUndefined();
    expect(cleanLeftOff('a string')).toBeUndefined();
    expect(cleanLeftOff(null)).toBeUndefined();
  });

  it('a malformed stored line is dropped on load, never crashing', () => {
    const raw = JSON.stringify([{ id: 'a', title: 'a', done: false, createdAt: 1, updatedAt: 1, leftOff: { text: 'x', writtenOn: 'soon' } }]);
    expect(deserialize(raw)[0]).not.toHaveProperty('leftOff');
    const good = [mk('a', { leftOff: { text: 'x', writtenOn: '2026-10-04' } })];
    expect(deserialize(serialize(good))[0].leftOff).toEqual({ text: 'x', writtenOn: '2026-10-04' });
  });
});

describe('newest wins, text never merged', () => {
  it('newerLeftOff: the later day wins, a same-day move wins its tie', () => {
    const a = { text: 'a', writtenOn: '2026-10-01' };
    const b = { text: 'b', writtenOn: '2026-10-03' };
    expect(newerLeftOff(a, b)).toBe(b);
    expect(newerLeftOff(b, a)).toBe(b);
    expect(newerLeftOff(a, { text: 'c', writtenOn: '2026-10-01' })?.text).toBe('c');
    expect(newerLeftOff(undefined, undefined)).toBeUndefined();
  });

  it('newestLeftOff: by day, then by the task\'s own updatedAt', () => {
    expect(
      newestLeftOff([
        { leftOff: { text: 'old', writtenOn: '2026-10-01' }, updatedAt: 99 },
        { leftOff: { text: 'new', writtenOn: '2026-10-03' }, updatedAt: 1 },
        { leftOff: null, updatedAt: 500 },
      ])?.text,
    ).toBe('new');
    expect(newestLeftOff([{ leftOff: { text: 'x', writtenOn: '2026-10-03' }, updatedAt: 1 }, { leftOff: { text: 'y', writtenOn: '2026-10-03' }, updatedAt: 2 }])?.text).toBe('y');
  });

  it('forSpeech drops one trailing full stop, so a template ending in ". date." never says ".."', () => {
    expect(forSpeech('ring back Thu.')).toBe('ring back Thu');
    expect(forSpeech('ring back Thu')).toBe('ring back Thu');
  });
});

describe('setLeftOff (the write, like a rename)', () => {
  it('writes a new line with today\'s day and bumps updatedAt', () => {
    const next = setLeftOff([mk('a')], 'a', ' Called, ref 4471 ', '2026-10-04', 100);
    expect(next[0]).toMatchObject({ leftOff: { text: 'Called, ref 4471', writtenOn: '2026-10-04' }, updatedAt: 100 });
  });

  it('an unchanged line returns the SAME array: no write, no sync, no "Noted."', () => {
    const tasks = [mk('a', { leftOff: { text: 'x', writtenOn: '2026-09-30' } })];
    expect(setLeftOff(tasks, 'a', 'x  ', '2026-10-04', 100)).toBe(tasks);
  });

  it('a changed line moves its day; clearing deletes it', () => {
    const tasks = [mk('a', { leftOff: { text: 'x', writtenOn: '2026-09-30' } })];
    expect(setLeftOff(tasks, 'a', 'y', '2026-10-04', 100)[0].leftOff).toEqual({ text: 'y', writtenOn: '2026-10-04' });
    expect(setLeftOff(tasks, 'a', '   ', '2026-10-04', 100)[0]).not.toHaveProperty('leftOff');
  });

  it('never writes on a repeating task (it keeps any old line hidden and untouched) or a removed one', () => {
    const repeat = [mk('r', { recurrence: { kind: 'daily' }, leftOff: { text: 'old', writtenOn: '2026-09-01' } })];
    expect(setLeftOff(repeat, 'r', 'new', '2026-10-04', 100)).toBe(repeat);
    const gone = [mk('g', { deletedAt: 5 })];
    expect(setLeftOff(gone, 'g', 'x', '2026-10-04', 100)).toBe(gone);
  });
});

describe('tiny:move (a tiny step\'s line goes home with the real task)', () => {
  it('moves the spent pebble\'s line onto the real task as it comes back', () => {
    const tasks = [mk('real', { silentParent: true, openParent: true }), mk('peb', { parentId: 'real', done: true, leftOff: { text: 'paint is in the boot', writtenOn: '2026-10-04' } })];
    const back = resurfaceOpenParent(tasks, 'peb', 100);
    expect(back.tasks.find((t) => t.id === 'real')?.leftOff?.text).toBe('paint is in the boot');
  });

  it('keeps the real task\'s own line when it is newer', () => {
    const tasks = [
      mk('real', { silentParent: true, openParent: true, leftOff: { text: 'mine', writtenOn: '2026-10-05' } }),
      mk('peb', { parentId: 'real', done: true, leftOff: { text: 'older', writtenOn: '2026-10-04' } }),
    ];
    expect(resurfaceOpenParent(tasks, 'peb', 100).tasks.find((t) => t.id === 'real')?.leftOff?.text).toBe('mine');
  });

  it('an unknown-flag task coming back borrows its step\'s line; the step keeps its own', () => {
    const tasks = [mk('real', { silentParent: true }), mk('only', { parentId: 'real', done: true, leftOff: { text: 'x', writtenOn: '2026-10-04' } })];
    const r = settleCompletions(tasks, ['only'], today, 100);
    expect(r.tasks.find((t) => t.id === 'real')?.leftOff?.text).toBe('x');
    expect(r.tasks.find((t) => t.id === 'only')?.leftOff?.text).toBe('x');
  });

  it('the repair moves it too, when the pebble was finished elsewhere', () => {
    const tasks = [mk('real', { silentParent: true, openParent: true, updatedAt: 10 }), mk('peb', { parentId: 'real', done: true, completedAt: 40, updatedAt: 40, leftOff: { text: 'x', writtenOn: '2026-10-04' } })];
    expect(healStuckParents(tasks, 1_000_000).find((t) => t.id === 'real')?.leftOff?.text).toBe('x');
  });
});

describe('Combine keeps the newest line (decision 4)', () => {
  it('gives the umbrella the most recently written line, with its own day', () => {
    const tasks = [mk('a', { leftOff: { text: 'older', writtenOn: '2026-10-01' } }), mk('b', { leftOff: { text: 'newer', writtenOn: '2026-10-03' } })];
    expect(combineTasks(tasks, ['a', 'b'], 'U', 100, 'u').umbrella.leftOff).toEqual({ text: 'newer', writtenOn: '2026-10-03' });
  });

  it('counts a big task it tidies away, and sends a tiny step\'s line home instead', () => {
    const tasks = [
      mk('big', { silentParent: true, openParent: false, leftOff: { text: 'big line', writtenOn: '2026-10-03' } }),
      mk('s1', { parentId: 'big' }),
      mk('s2', { parentId: 'big' }),
      mk('real', { silentParent: true, openParent: true }),
      mk('peb', { parentId: 'real', leftOff: { text: 'tiny line', writtenOn: '2026-10-04' } }),
    ];
    // Two steps: a real breakdown, tidied away (one step would bring the big task back instead).
    const r = combineTasks(tasks, ['s1', 's2', 'peb'], 'U', 100, 'u');
    expect(r.umbrella.leftOff?.text).toBe('big line');
    expect(r.next.find((t) => t.id === 'real')?.leftOff?.text).toBe('tiny line');
  });

  it('no line on any combined task leaves the umbrella without one', () => {
    expect(combineTasks([mk('a'), mk('b')], ['a', 'b'], 'U', 100, 'u').umbrella).not.toHaveProperty('leftOff');
  });
});

describe('sync carries the line (the left_off column)', () => {
  it('round-trips exactly, and a malformed remote value is dropped', () => {
    const t = mk('a', { leftOff: { text: 'x', writtenOn: '2026-10-04' }, openParent: false, parentTitle: 'P', combinedFrom: [{ id: 'c', title: 'C' }] });
    expect(rowToTask(taskToRow(t, 'u'))).toEqual(t);
    const row = { ...taskToRow(mk('b'), 'u'), left_off: { text: 7, writtenOn: 'x' } as never };
    expect(rowToTask(row)).not.toHaveProperty('leftOff');
  });

  it('emits null, never an absent key, for a task with no line (batch upsert would null the gap)', () => {
    expect(taskToRow(mk('a'), 'u')).toMatchObject({ left_off: null, open_parent: null, parent_title: null, combined_from: null });
  });

  it('the export carries the line', () => {
    const out = buildExport([mk('a', { leftOff: { text: 'x', writtenOn: '2026-10-04' } })], 0);
    expect(out.replace(/\s/g, '')).toContain('"leftOff":{"text":"x","writtenOn":"2026-10-04"}');
  });
});

describe('formatWrittenOn (always the calendar date, never relative)', () => {
  const now = new Date(2026, 9, 4);
  it('shows a short date and speaks a long one', () => {
    expect(formatWrittenOn('en-AU', '2026-09-30', 'short', now)).toMatch(/Wed.*30.*Sep/);
    expect(formatWrittenOn('en-AU', '2026-09-30', 'long', now)).toMatch(/Wednesday.*30.*September/);
    expect(formatWrittenOn('de-DE', '2026-09-30', 'short', now)).toMatch(/30/);
  });

  it('says today\'s DATE for a line written today, never "today"', () => {
    const shown = formatWrittenOn('en-AU', '2026-10-04', 'short', now);
    expect(shown).toMatch(/Sun.*4.*Oct/);
    expect(shown.toLowerCase()).not.toContain('today');
  });

  it('adds the year only for a line from another calendar year', () => {
    expect(formatWrittenOn('en-AU', '2025-09-30', 'short', now)).toMatch(/2025/);
    expect(formatWrittenOn('en-AU', '2026-09-30', 'short', now)).not.toMatch(/2026/);
  });

  it('returns nothing, never throwing, for a malformed date', () => {
    expect(formatWrittenOn('en-AU', 'soon', 'short', now)).toBe('');
    expect(formatWrittenOn('en-AU', '2026-02-31', 'short', now)).toBe('');
  });
});

describe('rebaseOnLatest (two writes in one tap never clobber)', () => {
  it('a line saved, then Remove from the stale list, keeps both the line and the removal', () => {
    const base = [mk('a'), mk('b')];
    const latest = setLeftOff(base, 'a', 'ring back Thu', '2026-10-04', 100); // the first write
    const next = base.map((t) => (t.id === 'a' ? { ...t, deletedAt: 200, updatedAt: 200 } : t)); // Remove, from the stale base
    const out = rebaseOnLatest(next, base, latest);
    expect(out.find((t) => t.id === 'a')).toMatchObject({ deletedAt: 200, leftOff: { text: 'ring back Thu' } });
  });

  it('a row the second write did not touch takes its latest version; a row the first added is kept', () => {
    const base = [mk('a'), mk('b')];
    const latest = [...setLeftOff(base, 'b', 'x', '2026-10-04', 100), mk('new')];
    const next = base.map((t) => (t.id === 'a' ? { ...t, title: 'renamed' } : t));
    const out = rebaseOnLatest(next, base, latest);
    expect(out.find((t) => t.id === 'b')?.leftOff?.text).toBe('x');
    expect(out.find((t) => t.id === 'a')?.title).toBe('renamed');
    expect(out.some((t) => t.id === 'new')).toBe(true);
  });

  it('a key the second write deleted stays deleted', () => {
    const base = [mk('a', { pinnedAt: 5 })];
    const latest = setLeftOff(base, 'a', 'x', '2026-10-04', 100);
    const { pinnedAt: _p, ...unpinned } = base[0];
    const out = rebaseOnLatest([unpinned as Task], base, latest);
    expect(out[0]).not.toHaveProperty('pinnedAt');
    expect(out[0].leftOff?.text).toBe('x');
  });

  it('nothing in between: returns next as it is', () => {
    const base = [mk('a')];
    const next = [mk('a', { title: 'z' })];
    expect(rebaseOnLatest(next, base, base)).toBe(next);
  });
});
