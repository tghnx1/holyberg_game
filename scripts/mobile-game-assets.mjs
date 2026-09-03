import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const generatedRoot = resolve(repoRoot, 'public/assets/generated');

export const profiles = {
  mobile: { quality: 82, alphaQuality: 95 },
  medium: { quality: 88, alphaQuality: 100 },
};

async function pngFilesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await pngFilesBelow(path)));
    else if (entry.isFile() && entry.name.endsWith('.png')) files.push(path);
  }
  return files;
}

export async function getMobileGameAssets() {
  const bossRoot = resolve(repoRoot, 'public/assets/boss');
  const bossSources = await pngFilesBelow(bossRoot);
  const assets = bossSources.map((source) => {
    const relativeSource = relative(bossRoot, source);
    let mobileMaxDimension = 640;
    let mediumMaxDimension = 864;
    if (relativeSource.startsWith('effects/energy-sphere/')) {
      mobileMaxDimension = 512;
      mediumMaxDimension = 720;
    } else if (relativeSource.startsWith('effects/laser/')) {
      mobileMaxDimension = 1024;
      mediumMaxDimension = 1280;
    } else if (relativeSource === 'environment/platform.png') {
      mobileMaxDimension = 1280;
      mediumMaxDimension = 1672;
    }
    return {
      source,
      outputStem: resolve(generatedRoot, 'boss', relativeSource.replace(/\.png$/, '')),
      maxDimensions: { mobile: mobileMaxDimension, medium: mediumMaxDimension },
    };
  });

  assets.push({
    source: resolve(repoRoot, 'public/assets/level_4/holyworld-background.png'),
    outputStem: resolve(generatedRoot, 'level4/holyworld-background'),
    maxDimensions: { mobile: 1280, medium: 1672 },
  });
  return assets;
}

export function outputPath(asset, profile) {
  return `${asset.outputStem}.${profile}.webp`;
}
