import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publicDirectory = resolve(repoRoot, 'public');
export const generatedBaseUrl = 'assets/backgrounds/generated';
export const generatedDirectory = resolve(publicDirectory, generatedBaseUrl);

const manifestPath = resolve(repoRoot, 'src/game/assets/berlinBackgroundAssets.json');
const SAFE_NAME = /^[a-z0-9-]+$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}

function validateManifest(value) {
  if (!isRecord(value) || !isRecord(value.profiles) || !Array.isArray(value.assets)) {
    throw new Error('Berlin background asset manifest has an invalid root shape');
  }

  const profileNames = Object.keys(value.profiles);
  if (profileNames.length === 0) throw new Error('Berlin background asset manifest has no profiles');

  for (const name of profileNames) {
    const profile = value.profiles[name];
    if (!SAFE_NAME.test(name) || !isRecord(profile)) throw new Error(`Invalid asset profile: ${name}`);
    assertPositiveInteger(profile.maxDimension, `${name}.maxDimension`);
    assertPositiveInteger(profile.quality, `${name}.quality`);
    assertPositiveInteger(profile.alphaQuality, `${name}.alphaQuality`);
    if (profile.quality > 100 || profile.alphaQuality > 100) {
      throw new Error(`${name} WebP quality values must be at most 100`);
    }
  }

  const assetNames = new Set();
  const textureKeys = new Set();
  for (const asset of value.assets) {
    if (!isRecord(asset) || !SAFE_NAME.test(asset.name)) throw new Error('Invalid asset name');
    if (typeof asset.textureKey !== 'string' || asset.textureKey.length === 0) {
      throw new Error(`${asset.name}.textureKey must be a non-empty string`);
    }
    if (typeof asset.source !== 'string' || asset.source.length === 0) {
      throw new Error(`${asset.name}.source must be a non-empty string`);
    }
    if (assetNames.has(asset.name)) throw new Error(`Duplicate asset name: ${asset.name}`);
    if (textureKeys.has(asset.textureKey)) throw new Error(`Duplicate texture key: ${asset.textureKey}`);
    assetNames.add(asset.name);
    textureKeys.add(asset.textureKey);

    const sourcePath = resolve(publicDirectory, asset.source);
    if (!sourcePath.startsWith(`${publicDirectory}${sep}`)) {
      throw new Error(`${asset.name}.source must stay inside public/`);
    }
  }

  return value;
}

export async function loadBerlinBackgroundManifest() {
  const contents = await readFile(manifestPath, 'utf8');
  return validateManifest(JSON.parse(contents));
}

export function getGeneratedAssetUrl(assetName, profileName) {
  return `${generatedBaseUrl}/${assetName}.${profileName}.webp`;
}

export function getSourcePath(asset) {
  return resolve(publicDirectory, asset.source);
}

export function getGeneratedPath(assetName, profileName) {
  return resolve(publicDirectory, getGeneratedAssetUrl(assetName, profileName));
}
