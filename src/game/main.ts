import Phaser from 'phaser';
import '../style.css';
import { config } from './config';
import { installTraceErrorTrap } from './debugTrace';
import { installFullscreenLifecycle } from './responsive/FullscreenController';
import { setupFullscreenResize } from './responsive/FullscreenResize';

installTraceErrorTrap();

const game = new Phaser.Game(config);

// Handle for debugging from the browser console, e.g.
// __game.scene.getScene('BerlinScene'). Never exposed in a production build.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

setupFullscreenResize(game);
installFullscreenLifecycle(game);
