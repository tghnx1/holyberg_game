/**
 * Normalises how much of its canvas a dialogue portrait's subject fills.
 *
 * DialogueScene fits every portrait the same way — `computePortraitFitScale`
 * scales the *canvas* into the portrait panel — so two portraits on identically
 * sized canvases still render at wildly different sizes if one subject is drawn
 * small with transparent padding and the other is cropped tight to the edges.
 *
 * That is exactly what happened to Doctor Doms: its portrait was resized to
 * Atmos's 1024x575 canvas, but its head still filled 100% of that canvas where
 * Atmos fills 72% and Disus 66%, so it rendered about 1.4x too large with no
 * per-character override anywhere to blame.
 *
 * Rather than paper over it with a `dialogueScale` multiplier per character,
 * this re-pads the offending portrait so every subject occupies the same
 * fraction of its canvas and the one shared fit is correct for all of them.
 *
 * Idempotent: a portrait already within tolerance is left untouched, so this
 * can be re-run safely. Both frames of a pair get the *same* transform, derived
 * from the idle frame, so the mouth never shifts between them.
 *
 * Run with `npm run normalize:portraits`.
 */
import { readdir, stat } from 'node:fs/promises';
import { stdout } from 'node:process';
import path from 'node:path';
import sharp from 'sharp';

const PLAYERS_DIR = 'public/assets/players';
/** Subject height as a fraction of canvas height, matching Atmos and Disus. */
const TARGET_FILL = 0.72;
/** Only re-frame portraits well outside the established range. */
const MAX_FILL = 0.85;

/** Tight bounding box of everything meaningfully opaque. */
async function subjectBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1, canvas: info };
}

const characters = (await readdir(PLAYERS_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of characters) {
  const dir = path.join(PLAYERS_DIR, name, 'dialogue', 'portrait');
  const idle = path.join(dir, 'idle.png');
  if (!(await stat(idle).catch(() => null))) continue;

  const bounds = await subjectBounds(idle);
  if (!bounds) continue;
  const fill = bounds.height / bounds.canvas.height;
  if (fill <= MAX_FILL) {
    stdout.write(`[portraits] ${name}: subject fills ${(fill * 100).toFixed(0)}% — unchanged\n`);
    continue;
  }

  // One transform for the whole pair, measured from idle.
  const { width: canvasWidth, height: canvasHeight } = bounds.canvas;
  const factor = (TARGET_FILL * canvasHeight) / bounds.height;
  const scaledWidth = Math.round(bounds.width * factor);
  const scaledHeight = Math.round(bounds.height * factor);
  const left = Math.round((canvasWidth - scaledWidth) / 2);
  const top = Math.round((canvasHeight - scaledHeight) / 2);

  for (const frame of ['idle.png', 'talk.png']) {
    const file = path.join(dir, frame);
    if (!(await stat(file).catch(() => null))) continue;
    const subject = await sharp(file)
      .extract({ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height })
      .resize(scaledWidth, scaledHeight, { kernel: 'lanczos3' })
      .toBuffer();
    const output = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: subject, left, top }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    await sharp(output).toFile(file);
  }
  stdout.write(
    `[portraits] ${name}: subject filled ${(fill * 100).toFixed(0)}% -> ` +
      `${(TARGET_FILL * 100).toFixed(0)}% (${scaledWidth}x${scaledHeight} on ${canvasWidth}x${canvasHeight})\n`,
  );
}
