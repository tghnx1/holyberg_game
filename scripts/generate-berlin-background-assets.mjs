import { mkdir, rm } from 'node:fs/promises';
import { stdout } from 'node:process';
import sharp from 'sharp';
import {
  generatedDirectory,
  getGeneratedPath,
  getSourcePath,
  loadBerlinBackgroundManifest,
} from './berlin-background-assets.mjs';

const WEBP_EFFORT = 6;
const manifest = await loadBerlinBackgroundManifest();

// The directory is derived output. Rebuilding it removes stale variants when
// an asset or profile is removed from the authoritative JSON manifest.
await rm(generatedDirectory, { recursive: true, force: true });
await mkdir(generatedDirectory, { recursive: true });

for (const asset of manifest.assets) {
  const sourcePath = getSourcePath(asset);

  for (const [profileName, profile] of Object.entries(manifest.profiles)) {
    const outputPath = getGeneratedPath(asset.name, profileName);
    const result = await sharp(sourcePath, { sequentialRead: true })
      .resize({
        width: profile.maxDimension,
        height: profile.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .webp({
        quality: profile.quality,
        alphaQuality: profile.alphaQuality,
        effort: WEBP_EFFORT,
        smartSubsample: true,
      })
      .toFile(outputPath);

    stdout.write(
      `[background-assets] ${asset.name}.${profileName}: ${result.width}x${result.height}, ${result.size} bytes\n`,
    );
  }
}
