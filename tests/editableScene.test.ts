import { describe, expect, it } from 'vitest';
import { isEditableScene, toSavePayloads } from '../src/game/systems/editableSceneContract';

/**
 * The editor is offered to a scene because the scene *has* the interface, not
 * because its key appears on a list. These pin that contract: the day someone
 * adds Level 5, implementing `getEditableObjects` is the entire integration.
 */
describe('which scenes get the editor', () => {
  it('accepts any object implementing the interface, whatever its key', () => {
    expect(isEditableScene({ getEditableObjects: () => [] })).toBe(true);
    // No scene key is consulted at all, so an unknown future level qualifies.
    expect(isEditableScene({ scene: { key: 'Level9Scene' }, getEditableObjects: () => [] })).toBe(
      true,
    );
  });

  it('skips a scene that does not opt in', () => {
    expect(isEditableScene({})).toBe(false);
    expect(isEditableScene({ scene: { key: 'BerlinScene' } })).toBe(false);
    // Present but not callable is not an opt-in.
    expect(isEditableScene({ getEditableObjects: 'yes' })).toBe(false);
  });
});

describe('saving an editable scene', () => {
  const layout = { route: '/__scene-editor/save-layout', body: { S: {} } };
  const npcs = { route: '/__club-editor/save-npcs', body: { roomId: 'lounge' } };

  it('posts nothing when a scene has nothing to persist', () => {
    expect(toSavePayloads(undefined)).toEqual([]);
  });

  it('accepts a single payload', () => {
    expect(toSavePayloads(layout)).toEqual([layout]);
  });

  it('accepts several, so one scene can own more than one config', () => {
    // Level 2 saves its crowd *and* the player's visual placement in one press.
    expect(toSavePayloads([layout, npcs])).toEqual([layout, npcs]);
  });
});
