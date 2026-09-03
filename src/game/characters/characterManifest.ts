/**
 * Turns a scanned `public/assets/players/<Name>/` directory into a typed
 * character definition.
 *
 * Deliberately free of Phaser, `fs` and any build tooling: it takes a plain
 * description of which files exist and returns plain data, so every rule here
 * is unit-testable in the Node test environment. The Vite plugin supplies the
 * directory listing and the measured foot gaps; the browser only ever sees the
 * output.
 *
 * What this file does NOT describe, on purpose:
 *
 *  - movement speed, jump velocity, gravity, collision boxes, knockback, or
 *    any other gameplay parameter. Those belong to the level systems, and are
 *    identical for every character within a mode. A character supplies
 *    artwork, never physics.
 *  - animation durations. Discovered characters may have different frame
 *    counts, so the gameplay systems hold one *cycle* duration per animation
 *    and divide it by however many frames a character actually has, keeping a
 *    4-frame and an 8-frame run the same tempo.
 */

/** Minimum frames an animation needs before it counts as present and usable. */
export const MIN_ANIMATION_FRAMES = {
  run: 2,
  jump: 2,
  crouch: 1,
  damage: 1,
  walk: 2,
  appear: 2,
} as const;

export interface CharacterAssetRef {
  /** Centrally derived, collision-safe Phaser texture key. */
  key: string;
  /** URL relative to the site root, matching the existing asset convention. */
  url: string;
  /**
   * Transparent padding below the drawn feet, in source pixels, so a frame
   * can be seated on the floor line. Measured from the artwork's alpha
   * bounding box unless the character overrides it.
   */
  footGap: number;
  /**
   * Half-width of the *drawn* artwork, measured from the frame's horizontal
   * centre in source pixels.
   *
   * Frames carry a lot of transparent side padding — Atmos's idle is a 195px
   * canvas around a 70px figure — so the canvas width is not where the
   * character visually ends. Anything that has to line a character up with a
   * wall, an edge or another body needs the drawn extent, and this is the
   * horizontal counterpart to `footGap`: alpha-derived at scan time, in the
   * same source-pixel space, so multiplying by the live visual scale gives
   * world pixels.
   *
   * Symmetric about the frame centre (the larger of the two sides) so it is
   * unaffected by `flipX`.
   */
  bodyHalfWidth: number;
  /**
   * Height of the *drawn* artwork, in source pixels — the vertical companion
   * to `bodyHalfWidth`, measured from the same alpha bounding box.
   *
   * A frame's canvas is taller than the figure on it, so anything that needs
   * to know how tall the character actually looks — a pickup area around the
   * body, say — must not use the canvas height.
   */
  bodyHeight: number;
}

export interface CharacterCapabilities {
  /** Complete enough to play the current campaign end to end. */
  playable: boolean;
  dialoguePortrait: boolean;
  /** Has the seated pose the metro dialogue scene needs. */
  metroActor: boolean;
  appearAnimation: boolean;
  walkAnimation: boolean;
}

export type CharacterGameplayPose = 'idle' | 'run' | 'jump' | 'crouch' | 'damage' | 'walk';

export interface CharacterPresentation {
  /**
   * Default gameplay scale for poses that do not need a finer override.
   * This is visual-only and multiplies the scene's canonical gameplay scale.
   */
  gameplayScale: number;
  /** Optional per-pose gameplay scale overrides, still visual-only. */
  gameplayPoseScales: Partial<Record<CharacterGameplayPose, number>>;
  /**
   * Multiplier applied to the dialogue portrait fit. `1` keeps the shared
   * portrait fit, higher values zoom the portrait in, lower values zoom it out.
   */
  dialogueScale: number;
}

export interface CharacterGameplayAssets {
  idle?: CharacterAssetRef;
  run: CharacterAssetRef[];
  /**
   * Every frame except the last is airborne; the last is the landing pose.
   * Character-independent, so a 3-frame and a 9-frame jump both work.
   */
  jump: CharacterAssetRef[];
  crouch: CharacterAssetRef[];
  damage: CharacterAssetRef[];
  walk: CharacterAssetRef[];
}

export interface CharacterDialogueAssets {
  portraitIdle?: CharacterAssetRef;
  portraitTalk?: CharacterAssetRef;
  metroSit?: CharacterAssetRef;
  appear: CharacterAssetRef[];
}

export interface CharacterDefinition {
  id: string;
  /** The folder name, verbatim, which is the only source of the display name. */
  name: string;
  rootUrl: string;
  capabilities: CharacterCapabilities;
  presentation: CharacterPresentation;
  gameplay: CharacterGameplayAssets;
  dialogue: CharacterDialogueAssets;
}

/**
 * The only thing a character may override, and only because it cannot be
 * derived: where a frame's feet sit. Alpha measurement pins the lowest drawn
 * pixel to the floor, which is correct for a standing pose but flattens the
 * bounce out of a run cycle, where the artist intends the figure to lift.
 *
 * Everything else — name, frame counts, paths, capabilities — comes from the
 * directory itself and must never appear here. Nor may gameplay stats: this
 * is visual alignment only.
 */
export interface CharacterOverrides {
  /** Keyed by path relative to the character folder, e.g. `gameplay/run/01.png`. */
  footGaps?: Record<string, number>;
  /** Optional visual presentation overrides, still never gameplay stats. */
  presentation?: {
    gameplayScale?: number;
    gameplayPoseScales?: Partial<Record<CharacterGameplayPose, number>>;
    dialogueScale?: number;
  };
}

/** One character directory as found on disk. */
export interface ScannedCharacter {
  folderName: string;
  /** Paths relative to the character folder, e.g. `gameplay/run/01.png`. */
  files: readonly string[];
  /** Alpha-derived padding below the feet, keyed by the same relative paths. */
  footGaps: Readonly<Record<string, number>>;
  /** Alpha-derived drawn half-width from the frame centre, same keys. */
  bodyHalfWidths: Readonly<Record<string, number>>;
  /** Alpha-derived drawn height, same keys. */
  bodyHeights: Readonly<Record<string, number>>;
  overrides?: CharacterOverrides;
}

export class CharacterManifestError extends Error {
  constructor(message: string) {
    super(`Invalid character assets: ${message}`);
    this.name = 'CharacterManifestError';
  }
}

function validateGameplayPoseScales(
  value: unknown,
  context: string,
): Partial<Record<CharacterGameplayPose, number>> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CharacterManifestError(`${context} gameplayPoseScales must be an object`);
  }
  const allowed = new Set<CharacterGameplayPose>(['idle', 'run', 'jump', 'crouch', 'damage', 'walk']);
  const out: Partial<Record<CharacterGameplayPose, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key as CharacterGameplayPose)) {
      throw new CharacterManifestError(
        `${context} gameplayPoseScales["${key}"] is unsupported; only idle, run, jump, crouch, damage and walk may be overridden`,
      );
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new CharacterManifestError(
        `${context} gameplayPoseScales["${key}"] must be a finite number`,
      );
    }
    out[key as CharacterGameplayPose] = raw;
  }
  return out;
}

/**
 * Folder name to a URL- and key-safe id: lowercase, runs of anything that is
 * not a letter or digit collapsed to a single dash, ends trimmed.
 *
 * `"Atmos"` -> `atmos`, `"DJ Example"` -> `dj-example`.
 */
export function normalizeCharacterId(folderName: string): string {
  return folderName
    .normalize('NFKD')
    // Strip combining marks so accented names fold to their base letters.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Sorts `01, 02, 10` numerically rather than lexicographically, so a tenth
 * frame does not land between the first and the second.
 */
export function sortFrameFiles(files: readonly string[]): string[] {
  const frameNumber = (path: string): number => {
    const match = /(\d+)\.[a-z0-9]+$/i.exec(path);
    return match ? Number.parseInt(match[1], 10) : Number.NaN;
  };
  return [...files].sort((a, b) => {
    const na = frameNumber(a);
    const nb = frameNumber(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    return na - nb;
  });
}

/** `character:atmos:gameplay:run:01` — derived here and nowhere else. */
export function characterTextureKey(id: string, relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.[a-z0-9]+$/i, '');
  return `character:${id}:${withoutExtension.split('/').join(':')}`;
}

function isUnder(path: string, directory: string): boolean {
  return path.startsWith(`${directory}/`);
}

export function buildCharacterDefinition(scanned: ScannedCharacter): CharacterDefinition {
  const id = normalizeCharacterId(scanned.folderName);
  if (!id) {
    throw new CharacterManifestError(
      `folder "${scanned.folderName}" has no letters or digits to build an id from`,
    );
  }

  const rootUrl = `assets/players/${scanned.folderName}`;
  const overrideGaps = scanned.overrides?.footGaps ?? {};
  for (const path of Object.keys(overrideGaps)) {
    if (!scanned.files.includes(path)) {
      throw new CharacterManifestError(
        `"${scanned.folderName}" overrides footGap for "${path}", which does not exist`,
      );
    }
  }

  const ref = (relativePath: string): CharacterAssetRef => ({
    key: characterTextureKey(id, relativePath),
    url: `${rootUrl}/${relativePath}`,
    footGap: overrideGaps[relativePath] ?? scanned.footGaps[relativePath] ?? 0,
    // Purely measured: unlike `footGap` there is no artistic intent to honour
    // here, so there is nothing for a character to override.
    bodyHalfWidth: scanned.bodyHalfWidths[relativePath] ?? 0,
    bodyHeight: scanned.bodyHeights[relativePath] ?? 0,
  });

  const single = (relativePath: string): CharacterAssetRef | undefined =>
    scanned.files.includes(relativePath) ? ref(relativePath) : undefined;

  const sequence = (directory: string): CharacterAssetRef[] =>
    sortFrameFiles(scanned.files.filter((file) => isUnder(file, directory))).map(ref);

  const gameplay: CharacterGameplayAssets = {
    idle: single('gameplay/idle.png'),
    run: sequence('gameplay/run'),
    jump: sequence('gameplay/jump'),
    crouch: sequence('gameplay/crouch'),
    damage: sequence('gameplay/damage'),
    walk: sequence('gameplay/walk'),
  };

  const dialogue: CharacterDialogueAssets = {
    portraitIdle: single('dialogue/portrait/idle.png'),
    portraitTalk: single('dialogue/portrait/talk.png'),
    metroSit: single('dialogue/poses/metro_sit.png'),
    appear: sequence('dialogue/appear'),
  };

  const has = (frames: CharacterAssetRef[], minimum: number): boolean =>
    frames.length >= minimum;

  const dialoguePortrait = Boolean(dialogue.portraitIdle && dialogue.portraitTalk);
  const presentationOverride = scanned.overrides?.presentation ?? {};
  const capabilities: CharacterCapabilities = {
    // Everything the current campaign needs of a player, and nothing more —
    // an incomplete character stays in the registry as an NPC rather than
    // being dropped.
    playable:
      Boolean(gameplay.idle) &&
      has(gameplay.run, MIN_ANIMATION_FRAMES.run) &&
      has(gameplay.jump, MIN_ANIMATION_FRAMES.jump) &&
      has(gameplay.crouch, MIN_ANIMATION_FRAMES.crouch) &&
      has(gameplay.damage, MIN_ANIMATION_FRAMES.damage) &&
      dialoguePortrait &&
      Boolean(dialogue.metroSit),
    dialoguePortrait,
    metroActor: Boolean(dialogue.metroSit),
    appearAnimation: has(dialogue.appear, MIN_ANIMATION_FRAMES.appear),
    walkAnimation: has(gameplay.walk, MIN_ANIMATION_FRAMES.walk),
  };

  return {
    id,
    name: scanned.folderName,
    rootUrl,
    capabilities,
    presentation: {
      gameplayScale: presentationOverride.gameplayScale ?? 0.8,
      gameplayPoseScales: validateGameplayPoseScales(
        presentationOverride.gameplayPoseScales,
        `"${scanned.folderName}"`,
      ),
      dialogueScale: presentationOverride.dialogueScale ?? 1,
    },
    gameplay,
    dialogue,
  };
}

export function resolveGameplayScale(
  character: CharacterDefinition,
  pose: CharacterGameplayPose,
): number {
  return character.presentation.gameplayPoseScales[pose] ?? character.presentation.gameplayScale;
}

export function resolveDialogueScale(character: CharacterDefinition): number {
  return character.presentation.dialogueScale;
}

/**
 * Builds every definition and rejects colliding ids loudly. Two folders that
 * normalize to the same slug would otherwise have one silently shadow the
 * other, which is exactly the kind of thing to fail a build over.
 *
 * Output is sorted by id so the generated module is byte-stable regardless of
 * the order the filesystem happened to return.
 */
export function buildCharacterManifest(
  scanned: readonly ScannedCharacter[],
): CharacterDefinition[] {
  const byId = new Map<string, string>();
  const definitions = scanned.map((entry) => {
    const definition = buildCharacterDefinition(entry);
    const existing = byId.get(definition.id);
    if (existing !== undefined) {
      throw new CharacterManifestError(
        `folders "${existing}" and "${entry.folderName}" both normalize to the id ` +
          `"${definition.id}"; rename one of them`,
      );
    }
    byId.set(definition.id, entry.folderName);
    return definition;
  });
  return definitions.sort((a, b) => a.id.localeCompare(b.id));
}

/** Characters complete enough to be offered in Character Select. */
export function getPlayableDefinitions(
  definitions: readonly CharacterDefinition[],
): CharacterDefinition[] {
  return definitions.filter((definition) => definition.capabilities.playable);
}

/**
 * Human-readable explanation of what a character is missing before it could
 * be playable. Empty when it already is.
 */
export function describePlayableGaps(definition: CharacterDefinition): string[] {
  const gaps: string[] = [];
  const { gameplay, dialogue } = definition;
  if (!gameplay.idle) gaps.push('gameplay/idle.png');
  for (const group of ['run', 'jump', 'crouch', 'damage'] as const) {
    const minimum = MIN_ANIMATION_FRAMES[group];
    if (gameplay[group].length < minimum) {
      gaps.push(`gameplay/${group}/ (${gameplay[group].length} of ${minimum}+ frames)`);
    }
  }
  if (!dialogue.portraitIdle) gaps.push('dialogue/portrait/idle.png');
  if (!dialogue.portraitTalk) gaps.push('dialogue/portrait/talk.png');
  if (!dialogue.metroSit) gaps.push('dialogue/poses/metro_sit.png');
  return gaps;
}
