import { describe, expect, it } from 'vitest';

import { dataUrl, FALLBACK_SCENE, imagePrompt, parseImage, parseScene, sceneMessages } from './scrapbook';

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
