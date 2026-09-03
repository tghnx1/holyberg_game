import {
  buildCharacterManifest,
  type CharacterDefinition,
  type ScannedCharacter,
} from '../../src/game/characters/characterManifest';

/**
 * Stands in for the build-time virtual module in the Node test environment
 * (see the `virtual:holyberg-characters` alias in vite.config.ts).
 *
 * Built through the real manifest builder rather than hand-written, so the
 * fixtures cannot drift from the shape production actually produces.
 */
/**
 * Source-pixel half-widths of the drawn body, per pose.
 *
 * Deliberately different per pose, in the proportions the real artwork has:
 * measured across every character in `public/assets/players`, a damage frame
 * is three to four times wider than the same character standing still, because
 * it throws its arms out. A fixture where every pose was the same width could
 * not tell a "widest pose" rule from a "resting pose" one, which is exactly
 * the distinction the arena bounds and the emerald pickup box now draw.
 */
export const FIXTURE_BODY_HALF_WIDTH = 40;
export const FIXTURE_RUN_BODY_HALF_WIDTH = 75;
export const FIXTURE_DAMAGE_BODY_HALF_WIDTH = 120;
/** Source-pixel height of the drawn body in every fixture frame. */
export const FIXTURE_BODY_HEIGHT = 170;

const bodyHalfWidthFor = (file: string): number => {
  if (file.startsWith('gameplay/run/')) return FIXTURE_RUN_BODY_HALF_WIDTH;
  if (file.startsWith('gameplay/damage/')) return FIXTURE_DAMAGE_BODY_HALF_WIDTH;
  return FIXTURE_BODY_HALF_WIDTH;
};

const frames = (dir: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${dir}/${String(i + 1).padStart(2, '0')}.png`);

const scan = (
  folderName: string,
  files: string[],
  extra: Partial<ScannedCharacter> = {},
): ScannedCharacter => ({
  folderName,
  files,
  footGaps: Object.fromEntries(files.map((file) => [file, 0])),
  // A drawn figure narrower than its padded canvas, as the real artwork is.
  bodyHalfWidths: Object.fromEntries(files.map((file) => [file, bodyHalfWidthFor(file)])),
  bodyHeights: Object.fromEntries(files.map((file) => [file, FIXTURE_BODY_HEIGHT])),
  ...extra,
});

const playable = (counts: { run: number; jump: number; crouch: number; damage: number }): string[] => [
  'gameplay/idle.png',
  ...frames('gameplay/run', counts.run),
  ...frames('gameplay/jump', counts.jump),
  ...frames('gameplay/crouch', counts.crouch),
  ...frames('gameplay/damage', counts.damage),
  'dialogue/portrait/idle.png',
  'dialogue/portrait/talk.png',
  'dialogue/poses/metro_sit.png',
];

export const CHARACTER_MANIFEST: CharacterDefinition[] = buildCharacterManifest([
  // Mirrors the real Atmos: playable, with a walk set the connective levels draw.
  scan('Atmos', [
    ...playable({ run: 6, jump: 5, crouch: 3, damage: 4 }),
    ...frames('gameplay/walk', 5),
  ]),
  // Mirrors the real Disus: NPC only, with an appear animation.
  scan('Disus', [
    'gameplay/idle.png',
    'dialogue/portrait/idle.png',
    'dialogue/portrait/talk.png',
    ...frames('dialogue/appear', 9),
  ]),
  // A second playable character with different frame counts.
  scan('Klaus', playable({ run: 4, jump: 2, crouch: 1, damage: 1 })),
  // Mirrors the real Doctor Doms: playable, and since its artwork was
  // normalised to Atmos's dimensions it carries no presentation overrides.
  scan('Doctor Doms', [
    ...playable({ run: 6, jump: 5, crouch: 3, damage: 4 }),
    ...frames('gameplay/walk', 5),
  ]),
  // Artwork-poor NPC: discoverable, but has no portraits, so casting it as a
  // speaker must fail rather than render nothing.
  scan('Mute', ['gameplay/idle.png']),
  // Has an entrance but no idle, so it can appear and then has nothing to
  // stand in — the case the arriving-actor contract exists to catch.
  scan('Drifter', [
    'dialogue/portrait/idle.png',
    'dialogue/portrait/talk.png',
    ...frames('dialogue/appear', 4),
  ]),
]);

export default CHARACTER_MANIFEST;
