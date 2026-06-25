import { describe, expect, it } from 'vitest';

import { buildOcrRequest, OCR_MODEL, parseMediaType, parseOcrResponse } from './ocr';

const B64 = 'aGVsbG8='; // "hello" in base64, a stand-in for the image bytes

describe('buildOcrRequest', () => {
  it('targets the Anthropic Messages API with the OCR model and FORCES the record_tasks tool', () => {
    const { url, init } = buildOcrRequest(B64, 'image/jpeg', 'sk-test');
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(OCR_MODEL);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_tasks' });
    expect(body.tools[0].name).toBe('record_tasks');
    expect(init.headers['x-api-key']).toBe('sk-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('sends the image as a base64 block with the given media type, before the text', () => {
    const content = JSON.parse(buildOcrRequest(B64, 'image/png', 'k').init.body).messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: B64 } });
    expect(content[1].type).toBe('text');
  });

  it('threads the language through to the system prompt', () => {
    const en = JSON.parse(buildOcrRequest(B64, 'image/jpeg', 'k').init.body).system;
    const fr = JSON.parse(buildOcrRequest(B64, 'image/jpeg', 'k', 'fr').init.body).system;
    expect(fr).not.toBe(en);
  });
});

describe('parseOcrResponse', () => {
  const wrap = (tasks: unknown) => ({ content: [{ type: 'tool_use', name: 'record_tasks', input: { tasks } }] });

  it('returns the task titles from the tool_use block', () => {
    expect(parseOcrResponse(wrap(['Buy milk', 'Call the dentist']))).toEqual(['Buy milk', 'Call the dentist']);
  });

  it('trims, drops blanks and non-strings, and never throws on junk', () => {
    expect(parseOcrResponse(wrap(['  Pay rent  ', '', 3, null, 'Walk the dog']))).toEqual(['Pay rent', 'Walk the dog']);
    expect(parseOcrResponse(null)).toEqual([]);
    expect(parseOcrResponse({ content: 'nope' })).toEqual([]);
    expect(parseOcrResponse({ content: [{ type: 'text', text: 'hi' }] })).toEqual([]);
    expect(parseOcrResponse(wrap('not-an-array'))).toEqual([]);
  });

  it('caps the count so a pathological response cannot flood Today', () => {
    const many = Array.from({ length: 80 }, (_, i) => `task ${i}`);
    expect(parseOcrResponse(wrap(many))).toHaveLength(50);
  });
});

describe('parseMediaType', () => {
  it('passes the accepted types and defaults everything else to jpeg', () => {
    expect(parseMediaType('image/png')).toBe('image/png');
    expect(parseMediaType('image/webp')).toBe('image/webp');
    expect(parseMediaType('image/heic')).toBe('image/jpeg'); // unsupported -> safe default
    expect(parseMediaType(undefined)).toBe('image/jpeg');
    expect(parseMediaType(42)).toBe('image/jpeg');
  });
});
