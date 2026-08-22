import Phaser from 'phaser';

/**
 * Non-interactive Level 1 scenery art.
 *
 * Scenery is drawn into the world like any other level entity, but it joins
 * no physics group and gets no body at all (see LevelBuilder.createZone), so
 * none of it can ever be collided with or landed on.
 */

/** The artSlot doubles as the texture key, so `textureForSlot` resolves it directly. */
export const CLUB_ENTRANCE_ART_SLOT = 'scenery.clubEntrance';

/**
 * entrance.png is a 1774x887 canvas whose drawn facade occupies only the
 * right-hand 681x718 of it; the rest is transparent padding. Rendering the
 * padded canvas would make the entity's box — and so the editor's outline,
 * pick area and the culling width — mostly empty space. Registering the
 * drawn region as a named frame instead means the entity's box *is* the
 * building, and bottom/doorway alignment is measured against real pixels.
 */
export const CLUB_ENTRANCE_FRAME = 'facade';
const CLUB_ENTRANCE_CONTENT = { x: 1093, y: 0, width: 681, height: 718 };

/** Aspect ratio of the drawn facade, for authoring a width from a height. */
export const CLUB_ENTRANCE_ASPECT_RATIO =
  CLUB_ENTRANCE_CONTENT.width / CLUB_ENTRANCE_CONTENT.height;

/**
 * Where the doorway sits across the facade, as a fraction of its width,
 * measured from the lit door opening in the source art. The level config
 * positions the building so this lands on CLUB_ENTRANCE_X.
 */
export const CLUB_ENTRANCE_DOORWAY_RATIO = 0.33;

export interface SceneryAsset {
  key: string;
  url: string;
}

export function getSceneryAssetUrls(): SceneryAsset[] {
  return [{ key: CLUB_ENTRANCE_ART_SLOT, url: 'assets/level_1/entrance.png' }];
}

/** Idempotent: safe to call once per scene even though textures are game-global. */
export function createSceneryFrames(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CLUB_ENTRANCE_ART_SLOT)) return;
  const texture = scene.textures.get(CLUB_ENTRANCE_ART_SLOT);
  if (texture.has(CLUB_ENTRANCE_FRAME)) return;
  texture.add(
    CLUB_ENTRANCE_FRAME,
    0,
    CLUB_ENTRANCE_CONTENT.x,
    CLUB_ENTRANCE_CONTENT.y,
    CLUB_ENTRANCE_CONTENT.width,
    CLUB_ENTRANCE_CONTENT.height,
  );
}

const FRAME_BY_SLOT: Record<string, string> = {
  [CLUB_ENTRANCE_ART_SLOT]: CLUB_ENTRANCE_FRAME,
};

/** Named sub-frame for an artSlot, if that slot's texture has one registered. */
export function frameForSlot(scene: Phaser.Scene, slot: string): string | undefined {
  const frame = FRAME_BY_SLOT[slot];
  if (!frame || !scene.textures.exists(slot)) return undefined;
  return scene.textures.get(slot).has(frame) ? frame : undefined;
}
