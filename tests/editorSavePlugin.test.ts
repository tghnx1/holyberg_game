import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildEditorSaveOutput,
  writeJsonAtomically,
  type EditorSaveTarget,
} from '../vite/editorSavePlugin';
import { validateSceneLayout } from '../src/game/systems/sceneLayoutSchema';

const sceneLayoutTarget: EditorSaveTarget<unknown> = {
  name: 'scene-layout-test',
  route: '/test',
  file: 'sceneLayout.json',
  validate: validateSceneLayout,
  merge: (existing, incoming) => ({
    ...(existing as Record<string, unknown>),
    ...(incoming as Record<string, unknown>),
  }),
};

describe('editor save persistence', () => {
  it('validates the complete merged result and preserves other scene slices', () => {
    const output = buildEditorSaveOutput(
      sceneLayoutTarget,
      { Level4Scene: { player: { xRatio: 0.25, scale: 1 } } },
      JSON.stringify({ BerlinScene: { player: { xRatio: 0.1, scale: 1 } } }),
    ) as Record<string, unknown>;

    expect(output).toEqual({
      BerlinScene: { player: { xRatio: 0.1, scale: 1 } },
      Level4Scene: { player: { xRatio: 0.25, scale: 1 } },
    });
    expect(() =>
      buildEditorSaveOutput(
        sceneLayoutTarget,
        { Level4Scene: {} },
        JSON.stringify({ BerlinScene: null }),
      ),
    ).toThrow(/BerlinScene/);
  });

  it('replaces a file atomically and leaves the old file on serialization failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'holyberg-editor-save-'));
    const file = join(directory, 'sceneLayout.json');
    try {
      await writeFile(file, '{"BerlinScene":{}}\n', 'utf8');
      await writeJsonAtomically(file, { Level4Scene: {} });
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ Level4Scene: {} });

      await expect(writeJsonAtomically(file, { invalid: BigInt(1) })).rejects.toThrow();
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ Level4Scene: {} });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
