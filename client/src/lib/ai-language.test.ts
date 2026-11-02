import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chart a course, Reflect on this week and Scan sent no language until 2026-11-03, so a German, French, Spanish or
// Italian app got its answers in English. The Worker reads the language on all three routes (parseLanguage in
// server/src/index.ts) and hands it to the model; these hold the call sites to sending it.
const source = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe("the Premium AI features answer in the app's language", () => {
  it('Chart a course passes aiLanguage', () => {
    expect(source('../app/chart.tsx')).toMatch(/await chart\([^;]*,\s*aiLanguage\)/);
  });

  it('Reflect on this week passes aiLanguage', () => {
    expect(source('../app/lookback.tsx')).toMatch(/await lookbackSummary\(titles,\s*aiLanguage\)/);
  });

  it("Scan defaults its language to the app's own, so Today and Ours send it without passing it", () => {
    const scan = source('../components/CameraCapture.tsx');
    expect(scan).toMatch(/language = aiLanguage \}: Props/);
    expect(scan).toMatch(/await ocr\(out\.base64, 'image\/jpeg', language\)/);
  });
});
