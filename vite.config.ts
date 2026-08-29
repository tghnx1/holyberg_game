import { defineConfig } from 'vitest/config';
import { characterManifestPlugin } from './vite/characterManifestPlugin';
import { defineEditorSaveTarget, editorSavePlugin } from './vite/editorSavePlugin';
import { validateBerlinEntities } from './src/game/level/berlin/berlinLevelSchema';
import { validateDialogueStationLayout } from './src/game/dialogue/dialogueStationLayoutSchema';
import { validateDialoguePresentation } from './src/game/dialogue/dialoguePresentationSchema';
import { validateClubNpcSaveRequest } from './src/game/level/club/clubNpcPlacementSchema';
import { validateSceneLayout } from './src/game/systems/sceneLayoutSchema';

/**
 * Every editable config in the game, and how to validate a save into it.
 *
 * A new editable scene adds a row here and nothing else: the middleware,
 * body-size guard, logging and error handling are shared (see
 * `vite/editorSavePlugin.ts`).
 */
const EDITOR_SAVE_TARGETS = [
  defineEditorSaveTarget({
    name: 'level-editor',
    route: '/__level-editor/save',
    file: 'src/game/level/berlin/berlinLevel.generated.json',
    validate: validateBerlinEntities,
    describe: (entities) => `${entities.length} entities`,
  }),
  defineEditorSaveTarget({
    name: 'dialogue-station-editor',
    route: '/__dialogue-editor/save-station',
    file: 'src/game/assets/dialogueStationLayout.json',
    validate: validateDialogueStationLayout,
  }),
  defineEditorSaveTarget({
    name: 'dialogue-presentation-editor',
    route: '/__dialogue-editor/save-presentation',
    file: 'src/game/assets/dialoguePresentation.json',
    validate: validateDialoguePresentation,
    describe: (config) => `head size ${config.portraitFillRatio.toFixed(3)}`,
  }),
  defineEditorSaveTarget({
    name: 'club-npc-editor',
    route: '/__club-editor/save-npcs',
    file: 'src/game/assets/clubNpcPlacement.json',
    validate: validateClubNpcSaveRequest,
    // One save owns one room, so it merges rather than replacing the file.
    merge: (existing, incoming) => ({
      ...(existing as Record<string, unknown>),
      [incoming.roomId]: incoming.placements,
    }),
    describe: (request) => `${request.placements.length} placements for "${request.roomId}"`,
  }),
  defineEditorSaveTarget({
    name: 'scene-layout-editor',
    route: '/__scene-editor/save-layout',
    file: 'src/game/assets/sceneLayout.json',
    validate: validateSceneLayout,
    // Each scene owns its own key, so saving Level 4 cannot wipe Berlin's.
    merge: (existing, incoming) => ({
      ...(existing as Record<string, unknown>),
      ...incoming,
    }),
    describe: (layout) => `layout for ${Object.keys(layout).join(', ')}`,
  }),
];

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this repository at /holyberg_game/. Keep local
  // development at / so phone testing through the Vite dev server is unchanged.
  base: command === 'build' ? '/holyberg_game/' : '/',
  plugins: [characterManifestPlugin(), editorSavePlugin(EDITOR_SAVE_TARGETS)],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The virtual module only exists once the plugin runs; tests get a
    // fixture built through the same manifest builder.
    alias: { 'virtual:holyberg-characters': '/tests/fixtures/characterManifest.ts' },
  },
}));
