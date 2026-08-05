import Phaser from 'phaser';
import '../style.css';
import { config } from './config';
import { setupFullscreenResize } from './responsive/FullscreenResize';

setupFullscreenResize(new Phaser.Game(config));
