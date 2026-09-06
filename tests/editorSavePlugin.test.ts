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

  it(
    'regression: two concurrent same-route saves race and the last writer can lose the ' +
      "first's slice using a stale read — which is exactly why the client now merges " +
      'same-route payloads into one request before ever calling this (see ' +
      'mergeSavePayloadsByRoute in editableSceneContract.ts) rather than sending both',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'holyberg-editor-save-race-'));
      const file = join(directory, 'sceneLayout.json');
      try {
        await writeFile(file, '{}\n', 'utf8');

        // Both "requests" read the file before either has written — the
        // server handles one HTTP request at a time, but two POSTs in
        // flight together both see this same pre-save copy.
        const staleExistingText = await readFile(file, 'utf8');

        const bossOutput = buildEditorSaveOutput(
          sceneLayoutTarget,
          { BossScene: { boss: { xRatio: 0.5, scale: 1 } } },
          staleExistingText,
        );
        await writeJsonAtomically(file, bossOutput);

        const telegraphOutput = buildEditorSaveOutput(
          sceneLayoutTarget,
          { 'BossScene:telegraph:attack-00': { 'emerald-01': { xRatio: 0.1, scale: 1 } } },
          staleExistingText,
        );
        await writeJsonAtomically(file, telegraphOutput);

        // The second write's own merge only ever saw the stale copy, so it
        // silently drops the first request's BossScene slice.
        expect(JSON.parse(await readFile(file, 'utf8'))).not.toHaveProperty('BossScene');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it(
    'regression: one save containing BossScene and BossScene:telegraph:attack-XX persists ' +
      'both slices when combined into a single request first',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'holyberg-editor-save-merged-'));
      const file = join(directory, 'sceneLayout.json');
      try {
        await writeFile(file, '{}\n', 'utf8');
        const existingText = await readFile(file, 'utf8');

        // What mergeSavePayloadsByRoute produces client-side before the P
        // save fetch is ever sent: one combined body for the one route.
        const combined = {
          BossScene: { boss: { xRatio: 0.5, scale: 1 } },
          'BossScene:telegraph:attack-00': { 'emerald-01': { xRatio: 0.1, scale: 1 } },
        };
        const output = buildEditorSaveOutput(sceneLayoutTarget, combined, existingText);
        await writeJsonAtomically(file, output);

        const written = JSON.parse(await readFile(file, 'utf8'));
        expect(written).toHaveProperty('BossScene');
        expect(written).toHaveProperty('BossScene:telegraph:attack-00');
        expect(written).toEqual(combined);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

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
