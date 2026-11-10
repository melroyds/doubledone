import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The widget's code cannot run under node (its library is native), so the wiring that keeps it truthful is held
// in its source. Each of these failing would break nothing loudly: the widget would simply go on showing an old
// or wrongly ordered day, which is the exact failure the 2026-11-10 truth fixes exist to end.
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

/** The value of `const NAME = '...'` in a source file. */
function constant(src: string, name: string): string | undefined {
  return new RegExp(`const ${name} = '([^']+)'`).exec(src)?.[1];
}

describe('the headless widget reads the keys the app writes', () => {
  const handler = read('task-handler.tsx');
  const storage = read('../lib/storage.ts');

  it.each([
    ['TASKS_KEY', 'STORAGE_KEY'],
    ['CLOSED_KEY', 'CLOSED_KEY'],
    ['HOLD_KEY', 'HOLD_KEY'],
  ])('%s matches storage %s', (handlerName, storageName) => {
    const inHandler = constant(handler, handlerName);
    expect(inHandler).toBeTruthy();
    expect(inHandler).toBe(constant(storage, storageName));
  });

  it("passes the held task to the model, so the headless render keeps Today's order too", () => {
    expect(handler).toContain('parseHoldContract(rawHold)?.taskId ?? null');
  });
});

describe('the widget follows every saved change', () => {
  it('the root layout subscribes it to the storage change notice once, for the life of the app', () => {
    expect(read('../app/_layout.tsx')).toContain('useEffect(() => watchStorageForWidget(), [])');
  });

  it('the subscription refreshes from storage through one run at a time, with the held task', () => {
    const update = read('update.tsx');
    expect(update).toContain('coalesceRuns(refreshWidget)');
    expect(update).toContain('subscribeStorageChange(');
    expect(update).toContain("hold?.taskId ?? null");
  });
});
