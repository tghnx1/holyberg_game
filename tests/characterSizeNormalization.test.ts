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

function playableScan(folderName: string, bodyHeight: number): ScannedCharacter {
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
    bodyHeights: Object.fromEntries(files.map((file) => [file, bodyHeight])),
  };
}

describe('playable character size normalization', () => {
  const [atmos, taller] = buildCharacterManifest([
    playableScan('Atmos', 100),
    playableScan('Taller Runner', 200),
  ]);

  it('keeps Atmos as factor 1 and preserves its current visible reference size', () => {
    for (const pose of poses) {
      expect(gameplayBodyHeightNormalizationFactor(atmos, atmos, pose)).toBe(1);
      expect(resolveGameplayScale(atmos, pose)).toBe(0.8);
    }
  });

  it('resolves a different measured bodyHeight to the same visible height for every gameplay pose', () => {
    for (const pose of poses) {
      const atmosVisible = representativeGameplayBodyHeight(atmos, pose) * resolveGameplayScale(atmos, pose);
      const tallerVisible = representativeGameplayBodyHeight(taller, pose) * resolveGameplayScale(taller, pose);
      expect(tallerVisible).toBeCloseTo(atmosVisible);
    }
  });

  it('applies one shared SceneEditor player scale equally to every playable identity', () => {
    const sharedScale = 1.35;
    for (const character of [atmos, taller]) {
      const baseVisible = representativeGameplayBodyHeight(character, 'run') * resolvePlayerPresentationScale(character, 'run', 1);
      const editedVisible = representativeGameplayBodyHeight(character, 'run') * resolvePlayerPresentationScale(character, 'run', sharedScale);
      expect(editedVisible / baseVisible).toBeCloseTo(sharedScale);
    }
  });

  it('normalizes every currently discovered playable character against Atmos', () => {
    const playable = getPlayableCharacters();
    const reference = playable.find((character) => character.id === 'atmos');
    expect(reference).toBeDefined();
    for (const character of playable) {
      for (const pose of poses) {
        const referenceHeight = representativeGameplayBodyHeight(reference!, pose);
        const characterHeight = representativeGameplayBodyHeight(character, pose);
        if (referenceHeight <= 0 || characterHeight <= 0) continue;
        expect(characterHeight * resolveGameplayScale(character, pose)).toBeCloseTo(
          referenceHeight * resolveGameplayScale(reference!, pose),
        );
      }
    }
  });
});
