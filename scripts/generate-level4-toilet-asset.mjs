/**
 * Regenerates the Level 4 toilet runtime texture from its authored source.
 *
 * `toilet-full.png` is authored as a 1532x175 pixel-art strip, but Level 4
 * draws it at roughly 2.6x so the room reads at human proportions next to a
 * Berlin-sized character. The renderer runs with `pixelArt: false` (bilinear),
 * so sampling that source above 1:1 visibly softens it.
 *
 * Upscaling 2x with a nearest-neighbour kernel bakes the hard pixel edges into
 * the texture, leaving the runtime to sample it at only ~1.28x. WebP then
 * stores the result in *less* space than the original PNG, so this is sharper
 * and a smaller download at the same time.
 *
 * 2x rather than 3x on purpose: 3x would be marginally crisper but costs
 * ~9.2MB of VRAM against 4.1MB, which is not a trade worth making on mobile.
 *
 * Idempotent and run on demand (`npm run generate:level4-toilet`) rather than
 * from prebuild, because the output is a committed canonical asset rather than
 * derived build output.
 */
import { stdout } from 'node:process';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';

const SOURCE = 'public/assets/level_4/toilet-full.png';
const OUTPUT = 'public/assets/level_4/toilet-full-2x.webp';
const UPSCALE = 2;

const source = sharp(SOURCE);
const { width, height } = await source.metadata();

await sharp(SOURCE)
  .resize(width * UPSCALE, height * UPSCALE, { kernel: 'nearest' })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(OUTPUT);

const { size } = await stat(OUTPUT);
stdout.write(
  `[level4-toilet] ${width}x${height} -> ${width * UPSCALE}x${height * UPSCALE}, ` +
    `${(size / 1024).toFixed(0)} kB, ${((width * UPSCALE * height * UPSCALE * 4) / 1048576).toFixed(1)} MB VRAM\n`,
);
