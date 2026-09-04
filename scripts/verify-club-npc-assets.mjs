import { access, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repoRoot, 'assets-source/level_2/npcs');
const generatedRoot = resolve(repoRoot, 'public/assets/generated/level2/npcs');
const builtRoot = resolve(repoRoot, 'dist/assets/generated/level2/npcs');

async function pngFilesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await pngFilesBelow(path)));
    else if (entry.isFile() && entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

const sources = await pngFilesBelow(sourceRoot);
for (const source of sources) {
  const relativePath = relative(sourceRoot, source).replace(/\.png$/, '.webp');
  const generated = resolve(generatedRoot, relativePath);
  const built = resolve(builtRoot, relativePath);
  await access(generated);
  await access(built);
  const [sourceMetadata, generatedMetadata] = await Promise.all([
    sharp(source).metadata(),
    sharp(generated).metadata(),
  ]);
  if (
    sourceMetadata.width !== generatedMetadata.width ||
    sourceMetadata.height !== generatedMetadata.height ||
    sourceMetadata.hasAlpha !== generatedMetadata.hasAlpha
  ) {
    throw new Error(`Club NPC geometry/alpha changed for ${relativePath}`);
  }
}

stdout.write(`[club-npcs] verified ${sources.length} generated URLs in dist\n`);
