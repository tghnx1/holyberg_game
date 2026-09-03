import { describe, expect, it } from 'vitest';
import {
  buildCharacterDefinition,
  buildCharacterManifest,
  characterTextureKey,
  CharacterManifestError,
  describePlayableGaps,
  getPlayableDefinitions,
  normalizeCharacterId,
  sortFrameFiles,
  type ScannedCharacter,
} from '../src/game/characters/characterManifest';

/** The full file set a playable character needs, with variable frame counts. */
function playableFiles(counts = { run: 6, jump: 5, crouch: 3, damage: 4 }): string[] {
  const frames = (dir: string, n: number): string[] =>
    Array.from({ length: n }, (_, i) => `gameplay/${dir}/${String(i + 1).padStart(2, '0')}.png`);
  return [
    'gameplay/idle.png',
    ...frames('run', counts.run),
    ...frames('jump', counts.jump),
    ...frames('crouch', counts.crouch),
    ...frames('damage', counts.damage),
    'dialogue/portrait/idle.png',
    'dialogue/portrait/talk.png',
    'dialogue/poses/metro_sit.png',
  ];
}

function scan(folderName: string, files: string[], extra: Partial<ScannedCharacter> = {}): ScannedCharacter {
  return {
    folderName,
    files,
    footGaps: Object.fromEntries(files.map((file) => [file, 0])),
    bodyHalfWidths: Object.fromEntries(files.map((file) => [file, 0])),
    bodyHeights: Object.fromEntries(files.map((file) => [file, 0])),
    ...extra,
  };
}

describe('character id normalization', () => {
  it('lowercases and slugifies the folder name', () => {
    expect(normalizeCharacterId('Atmos')).toBe('atmos');
    expect(normalizeCharacterId('Disus')).toBe('disus');
    expect(normalizeCharacterId('DJ Example')).toBe('dj-example');
  });

  it('collapses punctuation and trims stray separators', () => {
    expect(normalizeCharacterId('  Neon__Wolf!!  ')).toBe('neon-wolf');
    expect(normalizeCharacterId('K.L.A.U.S.')).toBe('k-l-a-u-s');
    expect(normalizeCharacterId('Zoë')).toBe('zoe');
  });

  it('rejects a folder with nothing to build an id from', () => {
    expect(() => buildCharacterDefinition(scan('!!!', ['gameplay/idle.png']))).toThrow(
      CharacterManifestError,
    );
  });
});

describe('frame ordering', () => {
  it('orders numerically, so 10 follows 09 rather than 01', () => {
    expect(sortFrameFiles(['a/10.png', 'a/02.png', 'a/01.png', 'a/09.png'])).toEqual([
      'a/01.png',
      'a/02.png',
      'a/09.png',
      'a/10.png',
    ]);
  });

  it('keeps that order in the built definition', () => {
    const files = ['gameplay/run/01.png', 'gameplay/run/10.png', 'gameplay/run/02.png'];
    const definition = buildCharacterDefinition(scan('Klaus', files));
    expect(definition.gameplay.run.map((frame) => frame.url)).toEqual([
      'assets/players/Klaus/gameplay/run/01.png',
      'assets/players/Klaus/gameplay/run/02.png',
      'assets/players/Klaus/gameplay/run/10.png',
    ]);
  });
});

describe('texture keys', () => {
  it('derives a namespaced, collision-safe key from the path', () => {
    expect(characterTextureKey('atmos', 'gameplay/run/01.png')).toBe(
      'character:atmos:gameplay:run:01',
    );
    expect(characterTextureKey('disus', 'dialogue/portrait/idle.png')).toBe(
      'character:disus:dialogue:portrait:idle',
    );
  });

  it('cannot collide between two characters or two groups', () => {
    const a = buildCharacterDefinition(scan('Atmos', playableFiles()));
    const b = buildCharacterDefinition(scan('Klaus', playableFiles()));
    const keys = [...a.gameplay.run, ...b.gameplay.run, ...a.gameplay.jump].map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('capability detection', () => {
  it('marks a complete character playable', () => {
    const definition = buildCharacterDefinition(scan('Atmos', playableFiles()));
    expect(definition.capabilities.playable).toBe(true);
    expect(describePlayableGaps(definition)).toEqual([]);
  });

  it('works with frame counts other than the ones Atmos happens to have', () => {
    const definition = buildCharacterDefinition(
      scan('Klaus', playableFiles({ run: 4, jump: 2, crouch: 1, damage: 1 })),
    );
    expect(definition.capabilities.playable).toBe(true);
    expect(definition.gameplay.run).toHaveLength(4);
    expect(definition.gameplay.jump).toHaveLength(2);
  });

  it('keeps an NPC-only character in the registry rather than dropping it', () => {
    const definition = buildCharacterDefinition(
      scan('Disus', [
        'gameplay/idle.png',
        'dialogue/portrait/idle.png',
        'dialogue/portrait/talk.png',
        ...Array.from({ length: 9 }, (_, i) => `dialogue/appear/${String(i + 1).padStart(2, '0')}.png`),
      ]),
    );
    expect(definition.capabilities.playable).toBe(false);
    expect(definition.capabilities.dialoguePortrait).toBe(true);
    expect(definition.capabilities.appearAnimation).toBe(true);
    expect(definition.dialogue.appear).toHaveLength(9);
    expect(describePlayableGaps(definition)).toContain('dialogue/poses/metro_sit.png');
  });

  it('is not playable without the metro pose the campaign needs', () => {
    const files = playableFiles().filter((f) => f !== 'dialogue/poses/metro_sit.png');
    const definition = buildCharacterDefinition(scan('Klaus', files));
    expect(definition.capabilities.playable).toBe(false);
    expect(definition.capabilities.metroActor).toBe(false);
  });

  it('is not playable with a one-frame run', () => {
    const files = playableFiles({ run: 1, jump: 5, crouch: 3, damage: 4 });
    expect(buildCharacterDefinition(scan('Klaus', files)).capabilities.playable).toBe(false);
  });

  it('reports the optional walk and appear animations independently', () => {
    const definition = buildCharacterDefinition(
      scan('Klaus', [...playableFiles(), 'gameplay/walk/01.png', 'gameplay/walk/02.png']),
    );
    expect(definition.capabilities.walkAnimation).toBe(true);
    expect(definition.capabilities.appearAnimation).toBe(false);
  });
});

describe('foot gaps', () => {
  it('defaults to the measured alpha gap', () => {
    const files = playableFiles();
    const scanned: ScannedCharacter = {
      folderName: 'Klaus',
      files,
      footGaps: { ...Object.fromEntries(files.map((f) => [f, 0])), 'gameplay/run/02.png': 13 },
      bodyHalfWidths: Object.fromEntries(files.map((f) => [f, 0])),
      bodyHeights: Object.fromEntries(files.map((f) => [f, 0])),
    };
    const run = buildCharacterDefinition(scanned).gameplay.run;
    expect(run[1].footGap).toBe(13);
  });

  it('lets an override replace a measured gap, which is how a run bounce survives', () => {
    const files = playableFiles();
    const scanned: ScannedCharacter = {
      folderName: 'Atmos',
      files,
      footGaps: { ...Object.fromEntries(files.map((f) => [f, 0])), 'gameplay/run/02.png': 13 },
      bodyHalfWidths: Object.fromEntries(files.map((f) => [f, 0])),
      bodyHeights: Object.fromEntries(files.map((f) => [f, 0])),
      overrides: { footGaps: { 'gameplay/run/02.png': 4 } },
    };
    expect(buildCharacterDefinition(scanned).gameplay.run[1].footGap).toBe(4);
  });

  it('rejects an override for a file that does not exist', () => {
    expect(() =>
      buildCharacterDefinition(
        scan('Klaus', playableFiles(), { overrides: { footGaps: { 'gameplay/run/99.png': 4 } } }),
      ),
    ).toThrow(/does not exist/);
  });
});

describe('presentation overrides', () => {
  it('keeps visual scales in presentation, not gameplay data', () => {
    const definition = buildCharacterDefinition(
      scan('Doctor Doms', playableFiles(), {
        overrides: {
          presentation: {
            gameplayScale: 0.757,
            gameplayPoseScales: { crouch: 0.684, damage: 0.785 },
            dialogueScale: 1.857,
          },
        },
      }),
    );
    expect(definition.presentation.gameplayScale).toBe(0.757);
    expect(definition.presentation.gameplayPoseScales.crouch).toBe(0.684);
    expect(definition.presentation.gameplayPoseScales.damage).toBe(0.785);
    expect(definition.presentation.dialogueScale).toBe(1.857);
  });
});

describe('manifest assembly', () => {
  it('sorts by id so the generated module is stable', () => {
    const manifest = buildCharacterManifest([
      scan('Zoe', playableFiles()),
      scan('Atmos', playableFiles()),
      scan('Klaus', playableFiles()),
    ]);
    expect(manifest.map((c) => c.id)).toEqual(['atmos', 'klaus', 'zoe']);
  });

  it('keeps the folder name verbatim as the display name', () => {
    const [character] = buildCharacterManifest([scan('DJ Example', playableFiles())]);
    expect(character.name).toBe('DJ Example');
    expect(character.id).toBe('dj-example');
    expect(character.rootUrl).toBe('assets/players/DJ Example');
  });

  it('fails loudly when two folders collide on one id', () => {
    expect(() =>
      buildCharacterManifest([scan('DJ Example', playableFiles()), scan('dj-example', playableFiles())]),
    ).toThrow(/both normalize to the id "dj-example"/);
  });

  it('filters Character Select down to the playable ones', () => {
    const manifest = buildCharacterManifest([
      scan('Atmos', playableFiles()),
      scan('Disus', ['gameplay/idle.png', 'dialogue/portrait/idle.png', 'dialogue/portrait/talk.png']),
    ]);
    expect(manifest).toHaveLength(2);
    expect(getPlayableDefinitions(manifest).map((c) => c.id)).toEqual(['atmos']);
  });
});
