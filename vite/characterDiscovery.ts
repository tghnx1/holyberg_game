import { readFile, readdir, stat } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import sharp from 'sharp';
import {
  buildCharacterManifest,
  CharacterManifestError,
  describePlayableGaps,
  type CharacterDefinition,
  type CharacterOverrides,
  type CharacterGameplayPose,
  type ScannedCharacter,
} from '../src/game/characters/characterManifest';

export const PLAYERS_DIRECTORY = 'public/assets/players';
/** Optional, and only ever visual alignment. See CharacterOverrides. */
const OVERRIDE_FILENAME = 'character.json';

async function listFilesRecursively(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRecursively(root, full)));
    // Split on the platform separator, rejoin with '/', so the manifest is
    // identical whether it was generated on Windows or a POSIX machine.
    else if (entry.isFile()) files.push(relative(root, full).split(sep).join(posix.sep));
  }
  return files;
}

/**
 * Transparent padding below the lowest drawn pixel, in source pixels.
 *
 * This is the derived default for every frame: it seats the artwork on the
 * floor line without anyone measuring anything by hand. A character only needs
 * an override where the artist deliberately lifts the figure off that line —
 * a run cycle's bounce being the case that actually occurs.
 */
async function measureFootGap(file: string): Promise<number> {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let y = info.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) return info.height - 1 - y;
    }
  }
  // Fully transparent frame: nothing to seat, so no adjustment.
  return 0;
}

async function readOverrides(directory: string): Promise<CharacterOverrides | undefined> {
  try {
    const raw = await readFile(join(directory, OVERRIDE_FILENAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new CharacterManifestError(`${OVERRIDE_FILENAME} must contain an object`);
    }
    const record = parsed as Record<string, unknown>;
    // Rejected loudly rather than ignored: a stat or a name in here means
    // someone believed it would take effect.
    const allowed = new Set(['footGaps', 'presentation']);
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        throw new CharacterManifestError(
          `${directory}/${OVERRIDE_FILENAME} has unsupported field "${key}"; only ` +
            `footGaps and presentation may be overridden (names, frame counts, paths and capabilities ` +
            `come from the directory, and gameplay stats are never per-character)`,
        );
      }
    }
    const footGaps = record.footGaps;
    if (footGaps !== undefined) {
      if (typeof footGaps !== 'object' || footGaps === null || Array.isArray(footGaps)) {
        throw new CharacterManifestError(`${directory}/${OVERRIDE_FILENAME} footGaps must be an object`);
      }
      for (const [path, value] of Object.entries(footGaps)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new CharacterManifestError(
            `${directory}/${OVERRIDE_FILENAME} footGaps["${path}"] must be a finite number`,
          );
        }
      }
    }
    const presentation = record.presentation;
    if (presentation !== undefined) {
      if (typeof presentation !== 'object' || presentation === null || Array.isArray(presentation)) {
        throw new CharacterManifestError(`${directory}/${OVERRIDE_FILENAME} presentation must be an object`);
      }
      const presentationRecord = presentation as Record<string, unknown>;
      const allowedPresentation = new Set(['gameplayScale', 'gameplayPoseScales', 'dialogueScale']);
      for (const key of Object.keys(presentationRecord)) {
        if (!allowedPresentation.has(key)) {
          throw new CharacterManifestError(
            `${directory}/${OVERRIDE_FILENAME} presentation has unsupported field "${key}"; only gameplayScale, gameplayPoseScales and dialogueScale may be overridden`,
          );
        }
      }
      if (
        presentationRecord.gameplayScale !== undefined &&
        (typeof presentationRecord.gameplayScale !== 'number' ||
          !Number.isFinite(presentationRecord.gameplayScale))
      ) {
        throw new CharacterManifestError(
          `${directory}/${OVERRIDE_FILENAME} presentation.gameplayScale must be a finite number`,
        );
      }
      if (
        presentationRecord.dialogueScale !== undefined &&
        (typeof presentationRecord.dialogueScale !== 'number' ||
          !Number.isFinite(presentationRecord.dialogueScale))
      ) {
        throw new CharacterManifestError(
          `${directory}/${OVERRIDE_FILENAME} presentation.dialogueScale must be a finite number`,
        );
      }
      if (presentationRecord.gameplayPoseScales !== undefined) {
        if (
          typeof presentationRecord.gameplayPoseScales !== 'object' ||
          presentationRecord.gameplayPoseScales === null ||
          Array.isArray(presentationRecord.gameplayPoseScales)
        ) {
          throw new CharacterManifestError(
            `${directory}/${OVERRIDE_FILENAME} presentation.gameplayPoseScales must be an object`,
          );
        }
        const allowedPoses = new Set<CharacterGameplayPose>([
          'idle',
          'run',
          'jump',
          'crouch',
          'damage',
          'walk',
        ]);
        for (const [pose, value] of Object.entries(
          presentationRecord.gameplayPoseScales as Record<string, unknown>,
        )) {
          if (!allowedPoses.has(pose as CharacterGameplayPose)) {
            throw new CharacterManifestError(
              `${directory}/${OVERRIDE_FILENAME} presentation.gameplayPoseScales["${pose}"] is unsupported; only idle, run, jump, crouch, damage and walk may be overridden`,
            );
          }
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new CharacterManifestError(
              `${directory}/${OVERRIDE_FILENAME} presentation.gameplayPoseScales["${pose}"] must be a finite number`,
            );
          }
        }
      }
    }
    return record as CharacterOverrides;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export interface DiscoveryResult {
  definitions: CharacterDefinition[];
  /** Non-fatal notes worth printing, e.g. a character that cannot be played. */
  warnings: string[];
}

/** Scans `<root>/public/assets/players` and builds the manifest. */
export async function discoverCharacters(root: string): Promise<DiscoveryResult> {
  const playersRoot = join(root, PLAYERS_DIRECTORY);
  let entries;
  try {
    entries = await readdir(playersRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { definitions: [], warnings: [] };
    throw error;
  }

  const scanned: ScannedCharacter[] = [];
  // Sorted so the scan order — and therefore any error message — is stable.
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const folderName of folders) {
    const directory = join(playersRoot, folderName);
    const all = await listFilesRecursively(directory);
    const files = all.filter((file) => /\.png$/i.test(file));
    if (files.length === 0) {
      throw new CharacterManifestError(`"${folderName}" contains no PNG artwork`);
    }
    const footGaps: Record<string, number> = {};
    for (const file of files) {
      footGaps[file] = await measureFootGap(join(directory, file));
    }
    scanned.push({ folderName, files, footGaps, overrides: await readOverrides(directory) });
  }

  const definitions = buildCharacterManifest(scanned);
  const warnings = definitions
    .filter((definition) => !definition.capabilities.playable)
    .map((definition) => {
      const gaps = describePlayableGaps(definition).join(', ');
      return `"${definition.name}" is not playable (missing ${gaps}); it stays available as an NPC.`;
    });
  return { definitions, warnings };
}

/** Directories whose contents should invalidate the manifest during dev. */
export async function isInsidePlayersDirectory(root: string, file: string): Promise<boolean> {
  const playersRoot = join(root, PLAYERS_DIRECTORY);
  const relativePath = relative(playersRoot, file);
  if (relativePath.startsWith('..')) return false;
  try {
    await stat(playersRoot);
    return true;
  } catch {
    return false;
  }
}
