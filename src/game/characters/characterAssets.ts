import type Phaser from 'phaser';
import type { CharacterAssetRef, CharacterDefinition } from './characterManifest';

/**
 * Demand-driven loading of character artwork.
 *
 * Callers ask for the groups a scene actually needs rather than "load this
 * character", so Character Select can show N characters without pulling every
 * run, jump, crouch and damage frame for all of them, and an NPC only ever
 * costs the frames its scene uses.
 *
 * Every texture key comes from the manifest. Scenes must not build keys from
 * strings — that is what made the old per-character constants impossible to
 * generalise.
 *
 * Loads artwork only. Nothing here knows or sets speed, physics or animation
 * tempo.
 */

export type CharacterAssetGroup =
  /** Full-body still for Character Select; one file. */
  | 'preview'
  /** Everything the platforming scenes draw: idle, run, jump, crouch, damage. */
  | 'gameplay'
  /** The two dialogue portrait frames. */
  | 'portrait'
  /** The seated pose the metro dialogue scene needs. */
  | 'metroPose'
  /** Optional NPC entrance animation. */
  | 'appear';

/**
 * `walk` is deliberately excluded from `gameplay`: the frames are discovered
 * and reported as a capability, but no scene draws them today (Club uses the
 * run cycle), so loading them would be pure waste.
 */
export function collectCharacterAssets(
  character: CharacterDefinition,
  groups: readonly CharacterAssetGroup[],
): CharacterAssetRef[] {
  const refs: CharacterAssetRef[] = [];
  const push = (ref?: CharacterAssetRef): void => {
    if (ref) refs.push(ref);
  };

  for (const group of groups) {
    switch (group) {
      case 'preview':
        push(character.gameplay.idle);
        break;
      case 'gameplay':
        push(character.gameplay.idle);
        refs.push(
          ...character.gameplay.run,
          ...character.gameplay.jump,
          ...character.gameplay.crouch,
          ...character.gameplay.damage,
        );
        break;
      case 'portrait':
        push(character.dialogue.portraitIdle);
        push(character.dialogue.portraitTalk);
        break;
      case 'metroPose':
        push(character.dialogue.metroSit);
        break;
      case 'appear':
        refs.push(...character.dialogue.appear);
        break;
    }
  }

  // Groups overlap — `preview` and `gameplay` share the idle frame — so a
  // caller asking for both must not queue it twice.
  const seen = new Set<string>();
  return refs.filter((ref) => (seen.has(ref.key) ? false : (seen.add(ref.key), true)));
}

/**
 * Narrows a set of refs to those not already in Phaser's texture manager.
 * Pure, so the idempotency rule is testable without a running game.
 */
export function selectMissingAssets(
  refs: readonly CharacterAssetRef[],
  isLoaded: (key: string) => boolean,
): CharacterAssetRef[] {
  return refs.filter((ref) => !isLoaded(ref.key));
}

/**
 * Queues whatever is missing onto the scene's loader and returns it.
 *
 * Safe to call repeatedly: a texture already in the manager is skipped, so a
 * retry, a scene restart, or two scenes wanting the same NPC cost nothing and
 * cannot produce duplicate keys. The caller starts the loader (or is inside
 * `preload`), which keeps this usable from both.
 */
export function queueCharacterAssets(
  scene: Phaser.Scene,
  character: CharacterDefinition,
  groups: readonly CharacterAssetGroup[],
): CharacterAssetRef[] {
  const missing = selectMissingAssets(collectCharacterAssets(character, groups), (key) =>
    scene.textures.exists(key),
  );
  for (const ref of missing) scene.load.image(ref.key, ref.url);
  return missing;
}

/** Full-body still only — what Character Select needs per character. */
export function queueCharacterPreview(
  scene: Phaser.Scene,
  character: CharacterDefinition,
): CharacterAssetRef[] {
  return queueCharacterAssets(scene, character, ['preview']);
}

/** Everything the selected player needs to run the platforming scenes. */
export function queueCharacterGameplay(
  scene: Phaser.Scene,
  character: CharacterDefinition,
): CharacterAssetRef[] {
  return queueCharacterAssets(scene, character, ['gameplay']);
}

/**
 * Dialogue presence: both portrait frames plus the metro pose. `appear` is
 * separate because only some roles in some scenes use it.
 */
export function queueCharacterDialogue(
  scene: Phaser.Scene,
  character: CharacterDefinition,
): CharacterAssetRef[] {
  return queueCharacterAssets(scene, character, ['portrait', 'metroPose']);
}

/**
 * Runs the loader and resolves once it is idle. Resolves immediately when
 * nothing was queued, so a warm cache costs no frame.
 */
export function loadQueuedAssets(scene: Phaser.Scene): Promise<void> {
  if (scene.load.list.size === 0 && !scene.load.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    scene.load.once('complete', () => resolve());
    scene.load.start();
  });
}
