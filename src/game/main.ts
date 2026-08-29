import Phaser from 'phaser';
import '../style.css';
import { config } from './config';
import { installFullscreenLifecycle } from './responsive/FullscreenController';
import { setupFullscreenResize } from './responsive/FullscreenResize';
import { setupViewportDebug } from './responsive/viewportDebug';
import { installPauseLifecycle } from './systems/pause/installPauseLifecycle';
import { installSceneEditors } from './systems/editableScene';

const game = new Phaser.Game(config);

// Handle for debugging from the browser console, e.g.
// __game.scene.getScene('BerlinScene'). Never exposed in a production build.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

setupFullscreenResize(game);
installFullscreenLifecycle(game);
installPauseLifecycle(game);
// Capability-based and dev-only: every scene implementing EditableScene gets
// the visual editor on E, with no list of scene keys to maintain.
installSceneEditors(game);

// Temporary, dev-only, and inert unless ?viewportDebug=1 is present.
if (import.meta.env.DEV) setupViewportDebug(game);
