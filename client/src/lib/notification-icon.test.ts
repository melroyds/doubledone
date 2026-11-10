import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

// DoubleDone's Android notification small icon (2026-11-10, with "Today in your notifications"). Android draws a small
// icon from its ALPHA alone, tinted, so a full-colour or opaque picture turns into a solid blob in the status bar. Until
// this, app.json named no icon and every DoubleDone notification fell back to the launcher icon. The expo-notifications
// config plugin makes the density drawables from this one file at build time, so the file and the plugin entry are what
// can be checked here: a white double tick on transparent, 96 by 96, and the mauve accent as its tint.

const CLIENT = join(__dirname, '../..');
const ICON = './assets/images/notification-icon.png';

type Plugin = string | [string, Record<string, unknown>];
const plugins: Plugin[] = JSON.parse(readFileSync(join(CLIENT, 'app.json'), 'utf8')).expo.plugins;
const entry = plugins.find((p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-notifications');

/** A minimal PNG reader for an 8-bit, non-interlaced truecolour-with-alpha file: the IHDR, and the pixels unfiltered. */
function readPng(buf: Buffer): { width: number; height: number; bitDepth: number; colorType: number; interlace: number; rgba: Uint8Array } {
  expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let at = 8;
  let ihdr: Buffer | null = null;
  const idat: Buffer[] = [];
  while (at < buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!ihdr) throw new Error('no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [bitDepth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? rgba[y * stride + x - bpp] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? rgba[(y - 1) * stride + x - bpp] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      rgba[y * stride + x] = (v + predicted) & 0xff;
    }
  }
  return { width, height, bitDepth, colorType, interlace, rgba };
}

describe('the notification small icon', () => {
  it('is set through the expo-notifications config plugin, with the icon and the mauve tint and nothing else', () => {
    expect(entry).toBeDefined();
    // Only these two: `mode` or `sounds` would change the iPhone build, and nothing here asks them to.
    expect(entry![1]).toEqual({ icon: ICON, color: '#946475' });
  });

  it('is a 96 by 96, 8-bit, truecolour-with-alpha PNG', () => {
    const file = join(CLIENT, ICON);
    expect(existsSync(file)).toBe(true);
    const png = readPng(readFileSync(file));
    expect({ width: png.width, height: png.height, bitDepth: png.bitDepth, colorType: png.colorType, interlace: png.interlace }).toEqual({
      width: 96,
      height: 96,
      bitDepth: 8,
      colorType: 6,
      interlace: 0,
    });
  });

  it('is white on transparent: a mark Android can tint, never a blob', () => {
    const { width, height, rgba } = readPng(readFileSync(join(CLIENT, ICON)));
    let coverage = 0;
    let solid = 0;
    for (let i = 0; i < width * height; i++) {
      const [r, g, b, a] = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]];
      if (a > 0) expect([r, g, b]).toEqual([255, 255, 255]);
      coverage += a / 255;
      if (a === 255) solid++;
    }
    // The corners are clear, the strokes are solid, and the mark covers a modest share of the square (two ticks,
    // not a filled shape): about 15% today.
    for (const [x, y] of [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]) {
      expect(rgba[(y * width + x) * 4 + 3]).toBe(0);
    }
    expect(solid).toBeGreaterThan(0);
    expect(coverage / (width * height)).toBeGreaterThan(0.05);
    expect(coverage / (width * height)).toBeLessThan(0.4);
  });

  // Material's status bar icon keeps its ink inside the 20dp live area of the 24dp square (px 8 to 87 of 96), so a
  // round template or a tight crop never clips it, and centres it there.
  it('keeps the mark inside the live area, centred', () => {
    const { width, height, rgba } = readPng(readFileSync(join(CLIENT, ICON)));
    let [minX, minY, maxX, maxY] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (rgba[(y * width + x) * 4 + 3] === 0) continue;
        [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
      }
    }
    expect(minX).toBeGreaterThanOrEqual(8);
    expect(minY).toBeGreaterThanOrEqual(8);
    expect(maxX).toBeLessThanOrEqual(87);
    expect(maxY).toBeLessThanOrEqual(87);
    expect(Math.abs((minX + maxX) / 2 - (width - 1) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs((minY + maxY) / 2 - (height - 1) / 2)).toBeLessThanOrEqual(1);
  });
});
