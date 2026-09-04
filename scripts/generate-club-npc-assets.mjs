import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repoRoot, 'assets-source/level_2/npcs');
const outputRoot = resolve(repoRoot, 'public/assets/generated/level2/npcs');

await rm(outputRoot, { recursive: true, force: true });

const groups = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const group of groups) {
  const sourceDirectory = resolve(sourceRoot, group);
  const files = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.png')).sort();
  for (const name of files) {
    const source = resolve(sourceDirectory, name);
    const target = resolve(outputRoot, group, name.replace(/\.png$/, '.webp'));
    await mkdir(dirname(target), { recursive: true });
    // Lossless WebP removes PNG/XMP overhead while preserving every alpha
    // pixel and the source canvas. Existing contentHeight/footGap calibration
    // therefore remains exact and no placement or editor bounds can move.
    const result = await sharp(source, { sequentialRead: true })
      .webp({ lossless: true, effort: 6 })
      .toFile(target);
    stdout.write(
      `[club-npcs] ${group}/${name}: ${result.width}x${result.height}, ${result.size} bytes\n`,
    );
  }
}
