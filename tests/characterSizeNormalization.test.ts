import { describe, expect, it } from 'vitest';
import {
  buildCharacterManifest,
  gameplayBodyHeightNormalizationFactor,
  representativeGameplayBodyHeight,
  resolveGameplayScale,
  type CharacterGameplayPose,
  type ScannedCharacter,
} from '../src/game/characters/characterManifest';
import { resolvePlayerPresentationScale } from '../src/game/systems/playerPresentation';
import { getPlayableCharacters } from '../src/game/characters/characterRegistry';

const poses: readonly CharacterGameplayPose[] = [
  'idle',
  'run',
  'walk',
  'jump',
  'crouch',
  'damage',
];

function playableScan(
  folderName: string,
  bodyHeight: number,
  poseHeights: Partial<Record<CharacterGameplayPose, number>> = {},
): ScannedCharacter {
  const files = [
    'gameplay/idle.png',
    ...['run', 'walk', 'jump', 'crouch', 'damage'].flatMap((pose) =>
      [1, 2].map((frame) => `gameplay/${pose}/${String(frame).padStart(2, '0')}.png`),
    ),
    'dialogue/portrait/idle.png',
    'dialogue/portrait/talk.png',
    'dialogue/poses/metro_sit.png',
  ];
  return {
    folderName,
    files,
    footGaps: Object.fromEntries(files.map((file) => [file, 0])),
    bodyHalfWidths: Object.fromEntries(files.map((file) => [file, 30])),
    bodyHeights: Object.fromEntries(files.map((file) => {
      const pose = file === 'gameplay/idle.png'
        ? 'idle'
        : poses.find((candidate) => file.includes(`gameplay/${candidate}/`));
      return [file, pose === undefined ? bodyHeight : (poseHeights[pose] ?? bodyHeight)];
    })),
  };
}

describe('playable character size normalization', () => {
  const [atmos, taller] = buildCharacterManifest([
    playableScan('Atmos', 100),
    playableScan('Taller Runner', 200),
  ]);

  it('keeps Atmos as factor 1 and preserves its current visible reference size', () => {
    for (const pose of poses) {
      expect(gameplayBodyHeightNormalizationFactor(atmos, atmos)).toBe(1);
      expect(resolveGameplayScale(atmos, pose)).toBe(0.8);
    }
  });

  it('resolves a different measured run bodyHeight to Atmos’s visible run height', () => {
    const atmosVisible = representativeGameplayBodyHeight(atmos, 'run') * resolveGameplayScale(atmos, 'run');
    const tallerVisible = representativeGameplayBodyHeight(taller, 'run') * resolveGameplayScale(taller, 'run');
    expect(tallerVisible).toBeCloseTo(atmosVisible);
  });

  it('uses the run factor for crouch instead of independently boosting short crouch artwork', () => {
    const [reference, crouchingCharacter] = buildCharacterManifest([
      playableScan('Atmos', 100, { crouch: 50 }),
      playableScan('Crouching Runner', 200, { crouch: 80 }),
    ]);

    expect(resolveGameplayScale(crouchingCharacter, 'run')).toBeCloseTo(0.4);
    expect(resolveGameplayScale(crouchingCharacter, 'crouch')).toBeCloseTo(0.4);
    expect(
      resolveGameplayScale(crouchingCharacter, 'crouch') / resolveGameplayScale(crouchingCharacter, 'run'),
    ).toBeCloseTo(1);
    expect(
      representativeGameplayBodyHeight(crouchingCharacter, 'crouch')
        * resolveGameplayScale(crouchingCharacter, 'crouch'),
    ).not.toBeCloseTo(
      representativeGameplayBodyHeight(reference, 'crouch') * resolveGameplayScale(reference, 'crouch'),
    );
  });

  it('keeps an authored crouch scale override relative to the normalized run scale', () => {
    const crouchingRunner = playableScan('Crouching Runner', 200, { crouch: 80 });
    crouchingRunner.overrides = {
      presentation: { gameplayPoseScales: { crouch: 0.6 } },
    };
    const [, character] = buildCharacterManifest([
      playableScan('Atmos', 100, { crouch: 50 }),
      crouchingRunner,
    ]);

    expect(resolveGameplayScale(character, 'run')).toBeCloseTo(0.4);
    expect(resolveGameplayScale(character, 'crouch')).toBeCloseTo(0.3);
    expect(
      resolveGameplayScale(character, 'crouch') / resolveGameplayScale(character, 'run'),
    ).toBeCloseTo(0.6 / 0.8);
  });

  it('applies one shared SceneEditor player scale equally to every playable identity', () => {
    const sharedScale = 1.35;
    for (const character of [atmos, taller]) {
      const baseVisible = representativeGameplayBodyHeight(character, 'run') * resolvePlayerPresentationScale(character, 'run', 1);
      const editedVisible = representativeGameplayBodyHeight(character, 'run') * resolvePlayerPresentationScale(character, 'run', sharedScale);
      expect(editedVisible / baseVisible).toBeCloseTo(sharedScale);
    }
  });

  it('normalizes every currently discovered playable character against Atmos by run height', () => {
    const playable = getPlayableCharacters();
    const reference = playable.find((character) => character.id === 'atmos');
    expect(reference).toBeDefined();
    for (const character of playable) {
      const referenceHeight = representativeGameplayBodyHeight(reference!, 'run');
      const characterHeight = representativeGameplayBodyHeight(character, 'run');
      if (referenceHeight <= 0 || characterHeight <= 0) continue;
      expect(characterHeight * resolveGameplayScale(character, 'run')).toBeCloseTo(
        referenceHeight * resolveGameplayScale(reference!, 'run'),
      );
    }
  });
});
