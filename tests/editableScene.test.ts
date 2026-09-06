import { describe, expect, it } from 'vitest';
import {
  isEditableScene,
  mergeSavePayloadsByRoute,
  toSavePayloads,
} from '../src/game/systems/editableSceneContract';

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

/**
 * The dev save server handles one `/__scene-editor/save-layout` request as
 * read -> merge -> write, so two concurrent requests to it each read the file
 * before either has written, and whichever finishes last silently overwrites
 * the other's change with a copy that never saw it (see
 * editorSavePlugin.test.ts's own regression, which reproduces the loss with
 * the real server-side merge). Combining same-route payloads into one
 * request before `fetch` is ever called removes that race outright.
 */
describe('merging same-route payloads before they are ever POSTed', () => {
  const bossPresentation = {
    route: '/__scene-editor/save-layout',
    body: { BossScene: { boss: { xRatio: 0.5, scale: 1 } } },
  };
  const bossTelegraph = {
    route: '/__scene-editor/save-layout',
    body: { 'BossScene:telegraph:attack-00': { 'emerald-01': { xRatio: 0.1, scale: 1 } } },
  };
  const clubNpcs = { route: '/__club-editor/save-npcs', body: { roomId: 'lounge' } };

  it('regression: BossScene and BossScene:telegraph:attack-XX both persist in one merged request, whichever order they were built in', () => {
    const merged = mergeSavePayloadsByRoute([bossPresentation, bossTelegraph]);

    expect(merged).toHaveLength(1);
    expect(merged[0].route).toBe('/__scene-editor/save-layout');
    expect(merged[0].body).toEqual({
      ...bossPresentation.body,
      ...bossTelegraph.body,
    });

    // Order must not matter — this is what makes it safe regardless of
    // which of BossScene's buildEditorSave entries happens to come first.
    const reversed = mergeSavePayloadsByRoute([bossTelegraph, bossPresentation]);
    expect(reversed[0].body).toEqual(merged[0].body);
  });

  it('also merges DialogueScene\'s own scene-layout slice, sent alongside the boss\'s during the final dialogue', () => {
    const dialogueFraming = {
      route: '/__scene-editor/save-layout',
      body: { DialogueScene: { seam: { xRatio: 0.9 } } },
    };
    const merged = mergeSavePayloadsByRoute([bossPresentation, bossTelegraph, dialogueFraming]);

    expect(merged).toHaveLength(1);
    expect(merged[0].body).toEqual({
      ...bossPresentation.body,
      ...bossTelegraph.body,
      ...dialogueFraming.body,
    });
  });

  it('never combines payloads across different routes', () => {
    const merged = mergeSavePayloadsByRoute([bossPresentation, clubNpcs, bossTelegraph]);

    expect(merged).toHaveLength(2);
    expect(merged.find((p) => p.route === '/__club-editor/save-npcs')).toEqual(clubNpcs);
    expect(merged.find((p) => p.route === '/__scene-editor/save-layout')?.body).toEqual({
      ...bossPresentation.body,
      ...bossTelegraph.body,
    });
  });

  it('passes a single payload for a route through unchanged', () => {
    expect(mergeSavePayloadsByRoute([clubNpcs])).toEqual([clubNpcs]);
  });

  it('is a no-op on an empty list', () => {
    expect(mergeSavePayloadsByRoute([])).toEqual([]);
  });

  it('falls back to the later payload when a body is not a mergeable plain object', () => {
    const first = { route: '/__club-editor/save-npcs', body: { roomId: 'lounge' } };
    const second = { route: '/__club-editor/save-npcs', body: { roomId: 'corridor' } };
    expect(mergeSavePayloadsByRoute([first, second])).toEqual([second]);
  });
});
