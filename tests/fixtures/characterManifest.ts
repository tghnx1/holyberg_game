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
const frames = (dir: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${dir}/${String(i + 1).padStart(2, '0')}.png`);

const scan = (folderName: string, files: string[]): ScannedCharacter => ({
  folderName,
  files,
  footGaps: Object.fromEntries(files.map((file) => [file, 0])),
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
  // Mirrors the real Atmos: playable, with a walk set nothing draws yet.
  scan('Atmos', [...playable({ run: 6, jump: 5, crouch: 3, damage: 4 }), ...frames('gameplay/walk', 5)]),
  // Mirrors the real Disus: NPC only, with an appear animation.
  scan('Disus', [
    'gameplay/idle.png',
    'dialogue/portrait/idle.png',
    'dialogue/portrait/talk.png',
    ...frames('dialogue/appear', 9),
  ]),
  // A second playable character with different frame counts.
  scan('Klaus', playable({ run: 4, jump: 2, crouch: 1, damage: 1 })),
  // Artwork-poor NPC: discoverable, but has no portraits, so casting it as a
  // speaker must fail rather than render nothing.
  scan('Mute', ['gameplay/idle.png']),
]);

export default CHARACTER_MANIFEST;
