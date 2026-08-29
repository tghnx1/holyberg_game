import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/**
 * DialogueScene fits every portrait through one shared path: the *canvas* is
 * scaled into the portrait panel. That only produces a consistent result if
 * every subject occupies a comparable share of its own canvas.
 *
 * Regression: Doctor Doms' portrait was resized to Atmos's 1024x575 canvas but
 * left cropped tight to its edges, filling 100% of the canvas height against
 * Atmos's 72%. The shared fit then drew it roughly 1.4x too large in the Level 4
 * dialogue, with no per-character override anywhere to point at.
 *
 * `npm run normalize:portraits` re-pads any portrait that drifts out of range.
 */
const PLAYERS_DIR = 'public/assets/players';
const MIN_FILL = 0.6;
const MAX_FILL = 0.85;

async function subjectFill(file: string): Promise<number> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 16) continue;
      if (y < minY) minY = y;
      maxY = y;
      break; // One opaque pixel is enough to count this row.
    }
  }
  if (maxY < 0) return 0;
  return (maxY - minY + 1) / info.height;
}

const characters = (await readdir(PLAYERS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('dialogue portrait framing', () => {
  it('has portraits to check', () => {
    expect(characters.length).toBeGreaterThan(0);
  });

  for (const name of characters) {
    it(`draws ${name}'s subject at a comparable share of its canvas`, async () => {
      const file = path.join(PLAYERS_DIR, name, 'dialogue', 'portrait', 'idle.png');
      if (!(await stat(file).catch(() => null))) return;
      const fill = await subjectFill(file);
      expect(fill).toBeGreaterThanOrEqual(MIN_FILL);
      expect(fill).toBeLessThanOrEqual(MAX_FILL);
    });
  }
});
