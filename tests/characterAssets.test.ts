import { describe, expect, it } from 'vitest';
import {
  collectCharacterAssets,
  selectMissingAssets,
  type CharacterAssetGroup,
} from '../src/game/characters/characterAssets';
import { getCharacter } from '../src/game/characters/characterRegistry';

const atmos = getCharacter('atmos');
const disus = getCharacter('disus');
const klaus = getCharacter('klaus');

const keys = (groups: CharacterAssetGroup[], character = atmos): string[] =>
  collectCharacterAssets(character, groups).map((ref) => ref.key);

describe('what each group loads', () => {
  it('idle is a single full-body still', () => {
    expect(keys(['idle'])).toEqual(['character:atmos:gameplay:idle']);
  });

  it('gameplay covers idle, run, jump, crouch, damage and walk', () => {
    const loaded = keys(['gameplay']);
    // 1 idle + 6 run + 5 jump + 3 crouch + 4 damage + 5 walk
    expect(loaded).toHaveLength(24);
    for (const group of ['run', 'jump', 'crouch', 'damage', 'walk']) {
      expect(loaded.some((key) => key.includes(`:gameplay:${group}:`))).toBe(true);
    }
  });

  it('gameplay loads the walk frames Level 2 and Level 4 draw', () => {
    expect(atmos.capabilities.walkAnimation).toBe(true);
    const walkKeys = keys(['gameplay']).filter((key) => key.includes(':walk:'));
    expect(walkKeys).toHaveLength(5);
    expect(walkKeys).toEqual(atmos.gameplay.walk.map((ref) => ref.key));
  });

  it('a character with no walk set still loads full gameplay via the run fallback', () => {
    // Klaus has no walk frames; characterLocomotion falls back to run for it.
    expect(klaus.gameplay.walk).toEqual([]);
    const loaded = keys(['gameplay'], klaus);
    expect(loaded.some((key) => key.includes(':walk:'))).toBe(false);
    // 1 idle + 4 run + 2 jump + 1 crouch + 1 damage, unaffected by the fix.
    expect(loaded).toHaveLength(9);
  });

  it('portrait is exactly the two dialogue frames', () => {
    expect(keys(['portrait'])).toEqual([
      'character:atmos:dialogue:portrait:idle',
      'character:atmos:dialogue:portrait:talk',
    ]);
  });

  it('metroPose is the seated pose alone', () => {
    expect(keys(['metroPose'])).toEqual(['character:atmos:dialogue:poses:metro_sit']);
  });

  it('appear is the NPC entrance, and empty for a character without one', () => {
    expect(keys(['appear'], disus)).toHaveLength(9);
    expect(keys(['appear'], atmos)).toEqual([]);
  });

  it('skips assets a character simply does not have', () => {
    // Disus has no run/jump/crouch/damage, so gameplay is just its idle.
    expect(keys(['gameplay'], disus)).toEqual(['character:disus:gameplay:idle']);
    expect(keys(['metroPose'], disus)).toEqual([]);
  });

  it('adapts to a character with different frame counts', () => {
    // 1 idle + 4 run + 2 jump + 1 crouch + 1 damage
    expect(keys(['gameplay'], klaus)).toHaveLength(9);
  });
});

describe('combining groups', () => {
  it('requesting gameplay twice does not duplicate the walk frames', () => {
    const refs = collectCharacterAssets(atmos, ['gameplay', 'gameplay']);
    const walkKeys = refs.map((ref) => ref.key).filter((key) => key.includes(':walk:'));
    expect(new Set(walkKeys).size).toBe(walkKeys.length);
    expect(walkKeys).toHaveLength(5);
  });

  it('never queues an overlapping asset twice', () => {
    const combined = keys(['idle', 'gameplay']);
    expect(new Set(combined).size).toBe(combined.length);
    // preview's idle is already inside gameplay, so it adds nothing.
    expect(combined).toHaveLength(keys(['gameplay']).length);
  });

  it('keeps a full dialogue request deduplicated', () => {
    const combined = keys(['portrait', 'metroPose', 'appear'], atmos);
    expect(new Set(combined).size).toBe(combined.length);
  });
});

describe('texture keys', () => {
  it('come from the manifest and are namespaced per character', () => {
    for (const ref of collectCharacterAssets(atmos, ['gameplay', 'portrait'])) {
      expect(ref.key.startsWith('character:atmos:')).toBe(true);
      expect(ref.url.startsWith('assets/players/Atmos/')).toBe(true);
    }
  });

  it('cannot collide between two characters loading the same groups', () => {
    const all = [
      ...collectCharacterAssets(atmos, ['gameplay']),
      ...collectCharacterAssets(klaus, ['gameplay']),
    ].map((ref) => ref.key);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('idempotency', () => {
  it('queues nothing when every texture is already present', () => {
    const refs = collectCharacterAssets(atmos, ['gameplay']);
    expect(selectMissingAssets(refs, () => true)).toEqual([]);
  });

  it('queues only what is actually missing', () => {
    const refs = collectCharacterAssets(atmos, ['gameplay']);
    const alreadyLoaded = new Set(refs.slice(0, 5).map((ref) => ref.key));
    const missing = selectMissingAssets(refs, (key) => alreadyLoaded.has(key));
    expect(missing).toHaveLength(refs.length - 5);
    expect(missing.some((ref) => alreadyLoaded.has(ref.key))).toBe(false);
  });

  it('a second request after a completed load queues nothing', () => {
    const loaded = new Set<string>();
    const first = selectMissingAssets(collectCharacterAssets(atmos, ['gameplay']), (k) =>
      loaded.has(k),
    );
    for (const ref of first) loaded.add(ref.key);
    const second = selectMissingAssets(collectCharacterAssets(atmos, ['gameplay']), (k) =>
      loaded.has(k),
    );
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it('sharing an NPC between two scenes costs the second nothing', () => {
    const loaded = new Set<string>();
    for (const ref of selectMissingAssets(collectCharacterAssets(disus, ['portrait']), () => false)) {
      loaded.add(ref.key);
    }
    const again = selectMissingAssets(collectCharacterAssets(disus, ['portrait', 'appear']), (k) =>
      loaded.has(k),
    );
    // Only the appear frames remain; the portraits are already there.
    expect(again).toHaveLength(9);
  });
});

describe('select-screen cost', () => {
  it('previewing every playable character is one file each, not their animations', () => {
    const previews = [atmos, klaus].flatMap((c) => collectCharacterAssets(c, ['idle']));
    expect(previews).toHaveLength(2);
    const fullGameplay = [atmos, klaus].flatMap((c) => collectCharacterAssets(c, ['gameplay']));
    expect(fullGameplay.length).toBeGreaterThan(previews.length * 5);
  });
});
