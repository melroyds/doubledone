import { describe, expect, it } from 'vitest';

import { formatEvent, TELEMETRY_PREFIX } from './telemetry';

describe('telemetry', () => {
  it('namespaces every event under the doubledone prefix', () => {
    expect(TELEMETRY_PREFIX).toBe('doubledone');
    expect(formatEvent({ name: 'task.added' })).toBe('[doubledone.task.added]');
  });

  it('appends props as compact JSON when present', () => {
    expect(formatEvent({ name: 'task.toggled', props: { done: true } })).toBe(
      '[doubledone.task.toggled] {"done":true}',
    );
  });

  it('omits the body for an empty props object', () => {
    expect(formatEvent({ name: 'day.cleared', props: {} })).toBe('[doubledone.day.cleared]');
  });

  it('serialises nested and multi-key props in order', () => {
    expect(formatEvent({ name: 'decomposition.offered', props: { steps: 3, source: 'elephant' } })).toBe(
      '[doubledone.decomposition.offered] {"steps":3,"source":"elephant"}',
    );
  });
});
