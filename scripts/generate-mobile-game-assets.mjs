import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdout } from 'node:process';
import sharp from 'sharp';
import {
  generatedRoot,
  getMobileGameAssets,
  outputPath,
  profiles,
  repoRoot,
} from './mobile-game-assets.mjs';

await rm(resolve(generatedRoot, 'boss'), { recursive: true, force: true });
await rm(resolve(generatedRoot, 'level4'), { recursive: true, force: true });

for (const asset of await getMobileGameAssets()) {
  for (const [profileName, profile] of Object.entries(profiles)) {
    const target = outputPath(asset, profileName);
    await mkdir(dirname(target), { recursive: true });
    const result = await sharp(asset.source, { sequentialRead: true })
      .resize({
        width: asset.maxDimensions[profileName],
        height: asset.maxDimensions[profileName],
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({
        quality: profile.quality,
        alphaQuality: profile.alphaQuality,
        effort: 6,
        smartSubsample: true,
      })
      .toFile(target);
    stdout.write(
      `[mobile-assets] ${profileName} ${target.slice(repoRoot.length + 1)}: ` +
        `${result.width}x${result.height}, ${result.size} bytes\n`,
    );
  }
}
