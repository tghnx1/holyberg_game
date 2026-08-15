import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdout } from 'node:process';
import {
  getGeneratedAssetUrl,
  getStreetGroundGeneratedAssetUrl,
  loadBerlinBackgroundManifest,
  loadBerlinStreetGroundManifest,
  repoRoot,
} from './berlin-background-assets.mjs';

const manifest = await loadBerlinBackgroundManifest();
const missing = [];
let verified = 0;

for (const asset of manifest.assets) {
  for (const profileName of Object.keys(manifest.profiles)) {
    const url = getGeneratedAssetUrl(asset.name, profileName);
    const outputPath = resolve(repoRoot, 'dist', url);

    try {
      const file = await stat(outputPath);
      if (!file.isFile() || file.size === 0) missing.push(url);
      else verified += 1;
    } catch {
      missing.push(url);
    }
  }
}

const streetGround = await loadBerlinStreetGroundManifest();
const streetGroundChunkCount = Math.ceil(streetGround.sourceWidth / streetGround.chunkWidth);
for (let index = 0; index < streetGroundChunkCount; index += 1) {
  const url = getStreetGroundGeneratedAssetUrl(streetGround, index);
  const outputPath = resolve(repoRoot, 'dist', url);

  try {
    const file = await stat(outputPath);
    if (!file.isFile() || file.size === 0) missing.push(url);
    else verified += 1;
  } catch {
    missing.push(url);
  }
}

if (missing.length > 0) {
  throw new Error(`Build is missing Berlin background variants:\n${missing.join('\n')}`);
}

stdout.write(`[background-assets] verified ${verified} generated URLs in dist\n`);
