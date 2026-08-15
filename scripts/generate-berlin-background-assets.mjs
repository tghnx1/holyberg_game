import { mkdir, rm } from 'node:fs/promises';
import { stdout } from 'node:process';
import sharp from 'sharp';
import {
  generatedDirectory,
  getGeneratedPath,
  getSourcePath,
  getStreetGroundGeneratedPath,
  getStreetGroundSourcePath,
  loadBerlinBackgroundManifest,
  loadBerlinStreetGroundManifest,
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

const streetGround = await loadBerlinStreetGroundManifest();
const streetGroundSourcePath = getStreetGroundSourcePath(streetGround);
const sourceMetadata = await sharp(streetGroundSourcePath).metadata();
if (
  sourceMetadata.width !== streetGround.sourceWidth ||
  sourceMetadata.height !== streetGround.sourceHeight
) {
  throw new Error(
    `Berlin street-ground source changed: expected ${streetGround.sourceWidth}x${streetGround.sourceHeight}, ` +
      `received ${sourceMetadata.width}x${sourceMetadata.height}`,
  );
}

const cropHeight = streetGround.sourceHeight - streetGround.cropTop;
const chunkCount = Math.ceil(streetGround.sourceWidth / streetGround.chunkWidth);
for (let index = 0; index < chunkCount; index += 1) {
  const left = index * streetGround.chunkWidth;
  const width = Math.min(streetGround.chunkWidth, streetGround.sourceWidth - left);
  const outputPath = getStreetGroundGeneratedPath(streetGround, index);
  const result = await sharp(streetGroundSourcePath, { sequentialRead: true })
    .extract({ left, top: streetGround.cropTop, width, height: cropHeight })
    // High-quality WebP keeps the pixel-art edges crisp while making the five
    // cropped downloads substantially smaller than the untouched source.
    .webp({
      quality: 95,
      alphaQuality: 100,
      effort: WEBP_EFFORT,
      smartSubsample: true,
    })
    .toFile(outputPath);

  stdout.write(
    `[background-assets] ${streetGround.generatedNamePrefix}-${index}: ` +
      `${result.width}x${result.height}, ${result.size} bytes\n`,
  );
}
