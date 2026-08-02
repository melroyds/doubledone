import { describe, expect, it } from 'vitest';

import { buildSceneRequest, dataUrl, FALLBACK_SCENE, imagePrompt, overDailyCap, parseImage, parseScene, parseSceneResponse, SCENE_CLAUDE_MODEL, SCRAPBOOK_DAILY_CAP, sceneMessages } from './scrapbook';

describe('sceneMessages', () => {
  it('lists the week and asks for one calm still-life that surfaces it', () => {
    const msgs = sceneMessages(['Booked the dentist', 'Did the laundry']);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/still-life/i);
    expect(msgs[0].content).toMatch(/no text/i);
    expect(msgs[1].content).toContain('Booked the dentist');
    expect(msgs[1].content).toContain('Did the laundry');
  });

  it('caps the list so a huge week cannot blow the prompt', () => {
    const many = Array.from({ length: 30 }, (_, i) => `task ${i}`);
    const user = sceneMessages(many)[1].content;
    expect(user).toContain('task 0');
    expect(user).not.toContain('task 20');
  });
});

describe('parseScene', () => {
  it('extracts the model response and strips surrounding quotes', () => {
    expect(parseScene({ response: '"a quiet field at dawn"' })).toBe('a quiet field at dawn');
  });
  it('falls back when the response is empty or malformed', () => {
    expect(parseScene({ response: '' })).toBe(FALLBACK_SCENE);
    expect(parseScene(null)).toBe(FALLBACK_SCENE);
    expect(parseScene({})).toBe(FALLBACK_SCENE);
  });
});

describe('imagePrompt', () => {
  it('renders the scene in the Dusk palette and forbids text', () => {
    const p = imagePrompt('a calm meadow');
    expect(p).toContain('a calm meadow');
    expect(p).toMatch(/mauve/);
    expect(p).toMatch(/no text/);
  });
});

describe('parseImage / dataUrl', () => {
  it('extracts a base64 image or null', () => {
    expect(parseImage({ image: 'BASE64' })).toBe('BASE64');
    expect(parseImage({ image: '' })).toBeNull();
    expect(parseImage(null)).toBeNull();
  });
  it('wraps base64 as a jpeg data url', () => {
    expect(dataUrl('BASE64')).toBe('data:image/jpeg;base64,BASE64');
  });
});

describe('overDailyCap (per-IP abuse backstop)', () => {
  it('allows usage below the ceiling and blocks at or above it', () => {
    expect(overDailyCap(0)).toBe(false);
    expect(overDailyCap(SCRAPBOOK_DAILY_CAP - 1)).toBe(false);
    expect(overDailyCap(SCRAPBOOK_DAILY_CAP)).toBe(true);
    expect(overDailyCap(SCRAPBOOK_DAILY_CAP + 50)).toBe(true);
  });

  it('stays far above any legitimate use (a premium user front-loading a week is 4, well under the cap)', () => {
    expect(overDailyCap(4)).toBe(false);
    expect(SCRAPBOOK_DAILY_CAP).toBeGreaterThanOrEqual(8);
  });
});

describe('the Claude scene writer (grounded, one object per item)', () => {
  it('builds a forced-tool Messages request carrying every title', () => {
    const { url, init } = buildSceneRequest(['Change the cat water', 'Pay electricity bill'], 'k-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('k-test');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(SCENE_CLAUDE_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_scene' });
    expect(body.messages[0].content).toContain('Change the cat water');
    expect(body.messages[0].content).toContain('Pay electricity bill');
    expect(body.system).toContain('one small, concrete, recognisable object for EACH finished item');
    expect(body.system).toContain('Never invent objects');
  });

  it('caps the titles at 14, like the fallback path', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Task ${i}`);
    const body = JSON.parse(buildSceneRequest(many, 'k').init.body);
    expect(body.messages[0].content).toContain('Task 13');
    expect(body.messages[0].content).not.toContain('Task 14');
  });

  it('pulls the scene from the tool_use block and clamps it', () => {
    const raw = { content: [{ type: 'tool_use', name: 'record_scene', input: { scene: '  "A cat bowl freshly filled beside a paid bill." ' } }] };
    expect(parseSceneResponse(raw)).toBe('"A cat bowl freshly filled beside a paid bill."');
    const long = { content: [{ type: 'tool_use', name: 'record_scene', input: { scene: 'x'.repeat(400) } }] };
    expect(parseSceneResponse(long).length).toBe(200);
  });

  it('returns empty for junk so the caller falls back to the Workers AI scene', () => {
    expect(parseSceneResponse(null)).toBe('');
    expect(parseSceneResponse({ content: [{ type: 'text', text: 'a scene' }] })).toBe('');
    expect(parseSceneResponse({ content: [{ type: 'tool_use', name: 'record_scene', input: { scene: 'x' } }] })).toBe('');
  });
});
