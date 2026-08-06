import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import { combineScores, getPerformanceGrade } from '../rhythm/ScoreSystem';
import type { RhythmResult } from '../rhythm/types';

export class ResultScene extends Phaser.Scene {
  private result!: RhythmResult;
  constructor() { super('ResultScene'); }
  init(data: RhythmResult): void { this.result = data; }
  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#090611');
    for (let index = 0; index < 12; index += 1) this.add.rectangle(100 + index * 100, 650, 65, 180 + (index % 4) * 60, 0x22112e);
    const total = combineScores(this.result.berlinScore, this.result.score);
    const grade = getPerformanceGrade(this.result.accuracy);
    this.add.text(DESIGN_WIDTH / 2, 92, 'SET COMPLETE', { fontFamily: 'Archivo Black', fontSize: '62px', color: '#ffdf57', stroke: '#55145e', strokeThickness: 10 }).setOrigin(0.5);
    this.add.text(DESIGN_WIDTH / 2, 168, `YOUR SET RATING: ${grade}`, { fontFamily: 'Archivo Black', fontSize: '30px', color: '#ff9f43' }).setOrigin(0.5);
    this.add.text(DESIGN_WIDTH / 2, 405, `BERLIN SCORE       ${this.result.berlinScore}\nRHYTHM SCORE       ${this.result.score}\nTOTAL SCORE        ${total}\n\nPERFECT            ${this.result.perfect}\nEXCELLENT          ${this.result.excellent}\nGOOD               ${this.result.good}\nMISS               ${this.result.miss}\nBAD TAPS           ${this.result.badTap}\nMAX COMBO          ${this.result.maxCombo}\nACCURACY           ${this.result.accuracy.toFixed(1)}%\nCROWD ENERGY       ${this.result.energy}%`, { fontFamily: 'Space Mono', fontSize: '21px', color: '#ffffff', lineSpacing: 4 }).setOrigin(0.5);
    this.add.text(DESIGN_WIDTH / 2, DESIGN_HEIGHT - 55, 'SPACE / TAP — PLAY SET AGAIN     R — BERLIN RUN', { fontFamily: 'Space Mono', fontSize: '18px', color: '#ff9f43' }).setOrigin(0.5);
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('RhythmScene', { score: this.result.berlinScore }));
    this.input.keyboard?.once('keydown-R', () => this.scene.start('BerlinScene'));
    this.input.once('pointerdown', () => this.scene.start('RhythmScene', { score: this.result.berlinScore }));
  }
}
