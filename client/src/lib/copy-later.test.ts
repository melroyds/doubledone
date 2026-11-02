import { describe, expect, it, vi } from 'vitest';

import { copyWhenReady } from './copy-later';

/** A ClipboardItem stand-in that remembers what it was given. */
class FakeItem {
  constructor(public items: Record<string, Promise<Blob>>) {}
}

describe('copyWhenReady (the web copy that starts inside the tap)', () => {
  it('starts the write at once with a promised item, before the text is ready, and copies it when it arrives', async () => {
    let release: (t: string) => void = () => undefined;
    const text = new Promise<string | null>((r) => (release = r));
    let written = '';
    const write = vi.fn(async (items: unknown[]) => {
      written = await (await (items[0] as FakeItem).items['text/plain']).text();
    });
    const done = copyWhenReady(text, { write, writeText: vi.fn() }, FakeItem as never);
    expect(write).toHaveBeenCalledTimes(1); // inside the tap, while the token is still on its way
    release('the-token');
    expect(await done).toBe(true);
    expect(written).toBe('the-token');
  });

  it('falls back to a plain write when the promised write is refused', async () => {
    const writeText = vi.fn(async () => undefined);
    const ok = await copyWhenReady(Promise.resolve('the-token'), { write: async () => Promise.reject(new Error('NotAllowedError')), writeText }, FakeItem as never);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('the-token');
  });

  it('writes plainly where there is no ClipboardItem', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyWhenReady(Promise.resolve('the-token'), { writeText }, undefined)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('the-token');
  });

  it('is false, never a throw, with no text, no clipboard, or a browser that says no', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyWhenReady(Promise.resolve(null), { write: async (items) => void (await (items[0] as FakeItem).items['text/plain']), writeText }, FakeItem as never)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(await copyWhenReady(Promise.resolve('the-token'), undefined, FakeItem as never)).toBe(false);
    expect(await copyWhenReady(Promise.resolve('the-token'), { writeText: async () => Promise.reject(new Error('no')) }, undefined)).toBe(false);
    expect(await copyWhenReady(Promise.reject(new Error('session')), { writeText }, undefined)).toBe(false);
  });
});
