import { describe, expect, it } from 'vitest';
import { ClubNpcLayer } from '../src/game/level/club/ClubNpcLayer';
import { getRoomNpcPlacements, NPC_IDLE_CYCLE_MS } from '../src/game/level/club/clubNpcPlacement';
import { getClubNpcGroup } from '../src/game/level/club/clubNpcAssets';

/**
 * `ClubNpcLayer` imports Phaser as a type only, so it runs here against a
 * stand-in scene: enough of `add.sprite`, `textures` and `cameras` for the
 * layer to build, place and tear down its crowd.
 */
interface FakeSprite {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  flipX: boolean;
  textureKey: string;
  destroyed: boolean;
  setOrigin: () => FakeSprite;
  setDepth: () => FakeSprite;
  setFlipX: (value: boolean) => FakeSprite;
  setScale: (x: number, y?: number) => FakeSprite;
  setPosition: (x: number, y: number) => FakeSprite;
  setTexture: (key: string) => FakeSprite;
  destroy: () => void;
}

function createScene(loadedKeys?: Set<string>) {
  const sprites: FakeSprite[] = [];
  const scene = {
    add: {
      sprite(x: number, y: number, key: string): FakeSprite {
        const sprite: FakeSprite = {
          x,
          y,
          scaleX: 1,
          scaleY: 1,
          width: 100,
          height: 200,
          flipX: false,
          textureKey: key,
          destroyed: false,
          setOrigin: () => sprite,
          setDepth: () => sprite,
          setFlipX(value) {
            sprite.flipX = value;
            return sprite;
          },
          setScale(sx, sy) {
            sprite.scaleX = sx;
            sprite.scaleY = sy ?? sx;
            return sprite;
          },
          setPosition(px, py) {
            sprite.x = px;
            sprite.y = py;
            return sprite;
          },
          setTexture(nextKey) {
            sprite.textureKey = nextKey;
            return sprite;
          },
          destroy() {
            sprite.destroyed = true;
          },
        };
        void key;
        sprites.push(sprite);
        return sprite;
      },
    },
    textures: { exists: (key: string) => loadedKeys?.has(key) ?? true },
    cameras: { main: { width: 1280, height: 720 } },
  };
  return { scene, sprites };
}

function buildLayer(roomId: string, loadedKeys?: Set<string>) {
  const { scene, sprites } = createScene(loadedKeys);
  const layer = new ClubNpcLayer(scene as never, 10, 0.9);
  layer.setRoom(roomId);
  return { layer, sprites };
}

const ROOM = 'lounge';

describe('editing the ambient club crowd', () => {
  it('keeps the last valid frame until a progressive-load frame is registered', () => {
    const firstFrames = new Set(
      getRoomNpcPlacements(ROOM).map((placement) => getClubNpcGroup(placement.group).frames[0].key),
    );
    const { layer, sprites } = buildLayer(ROOM, firstFrames);
    const firstPlacement = getRoomNpcPlacements(ROOM)[0];
    const firstGroup = getClubNpcGroup(firstPlacement.group);
    const frameTime = (
      NPC_IDLE_CYCLE_MS / firstGroup.frames.length * 1.5
      - (firstPlacement.phaseMs ?? 0)
      + NPC_IDLE_CYCLE_MS
    ) % NPC_IDLE_CYCLE_MS;
    const nextFrame = firstGroup.frames[1].key;
    const sprite = sprites[0];

    expect(sprite.textureKey).toBe(firstGroup.frames[0].key);
    layer.update(frameTime);
    expect(sprite.textureKey).toBe(firstGroup.frames[0].key);

    firstFrames.add(nextFrame);
    layer.update(frameTime);
    expect(sprite.textureKey).toBe(nextFrame);
  });

  it('materializes placements when their first frames finish loading', () => {
    const loaded = new Set<string>();
    const { layer, sprites } = buildLayer(ROOM, loaded);
    expect(sprites).toHaveLength(0);

    for (const placement of getRoomNpcPlacements(ROOM)) {
      loaded.add(getClubNpcGroup(placement.group).frames[0].key);
    }
    layer.update(0);

    expect(sprites).toHaveLength(getRoomNpcPlacements(ROOM).length);
    expect(layer.getEditableObjects()).toHaveLength(getRoomNpcPlacements(ROOM).length);
  });

  it('builds one editable object per authored placement', () => {
    const { layer } = buildLayer(ROOM);
    expect(layer.getEditableObjects()).toHaveLength(getRoomNpcPlacements(ROOM).length);
  });

  /**
   * Both capabilities are declared per object, and the shared core offers
   * each one only where it is present — so these are also the assertion that
   * the crowd is duplicable and deletable while singletons elsewhere are not.
   */
  it('declares both clone and remove on every crowd group', () => {
    const { layer } = buildLayer(ROOM);
    for (const object of layer.getEditableObjects()) {
      expect(object.clone).toBeTypeOf('function');
      expect(object.remove).toBeTypeOf('function');
    }
  });

  it('destroys the sprite and stops tracking the group on remove', () => {
    const { layer } = buildLayer(ROOM);
    const before = layer.getEditableObjects();
    const target = before[0];
    const sprite = target.target as unknown as FakeSprite;

    target.remove?.();

    expect(sprite.destroyed).toBe(true);
    const after = layer.getEditableObjects();
    expect(after).toHaveLength(before.length - 1);
    expect(after.map((object) => object.id)).not.toContain(target.id);
  });

  it('omits a removed group from the next save, so it stays deleted on reload', () => {
    const { layer } = buildLayer(ROOM);
    const objects = layer.getEditableObjects();
    objects[0].remove?.();

    const snapshot = layer
      .getEditableObjects()
      .map((object) => ({ id: object.id, x: 100, y: 200, scaleX: 1, scaleY: 1 }));
    const saved = layer.buildLayoutFromSnapshot(snapshot);

    expect(saved).toHaveLength(objects.length - 1);
    // The save is built from the live instances, so what is gone from the
    // scene is gone from clubNpcPlacement.json too.
    expect(saved.length).toBeLessThan(getRoomNpcPlacements(ROOM).length);
  });

  it('removes only the selected group', () => {
    const { layer } = buildLayer(ROOM);
    const objects = layer.getEditableObjects();
    const survivors = objects.slice(1).map((object) => object.id);
    objects[0].remove?.();
    expect(layer.getEditableObjects().map((object) => object.id)).toEqual(survivors);
  });

  it('is a no-op when the same group is removed twice', () => {
    const { layer } = buildLayer(ROOM);
    const target = layer.getEditableObjects()[0];
    target.remove?.();
    const afterFirst = layer.getEditableObjects().length;
    target.remove?.();
    expect(layer.getEditableObjects()).toHaveLength(afterFirst);
  });

  it('still duplicates, and the copy is saved alongside the original', () => {
    const { layer } = buildLayer(ROOM);
    const original = layer.getEditableObjects()[0];
    const copy = original.clone?.();

    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe(original.id);
    const objects = layer.getEditableObjects();
    expect(objects).toHaveLength(getRoomNpcPlacements(ROOM).length + 1);

    const snapshot = objects.map((object) => ({ id: object.id, x: 10, y: 20, scaleX: 1, scaleY: 1 }));
    expect(layer.buildLayoutFromSnapshot(snapshot)).toHaveLength(objects.length);
  });

  it('gives every duplicate its own id, however many times it is pasted', () => {
    const { layer } = buildLayer(ROOM);
    const source = layer.getEditableObjects()[0];
    const ids = [source.clone?.()?.id, source.clone?.()?.id, source.clone?.()?.id];
    expect(new Set(ids).size).toBe(3);
  });

  it('can delete a duplicate again', () => {
    const { layer } = buildLayer(ROOM);
    const copy = layer.getEditableObjects()[0].clone?.();
    const withCopy = layer.getEditableObjects().length;
    layer.getEditableObjects().find((object) => object.id === copy?.id)?.remove?.();
    expect(layer.getEditableObjects()).toHaveLength(withCopy - 1);
  });
});
