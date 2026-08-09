import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../constants';
import { claimLeaderboardScore, fetchLeaderboard } from '../leaderboard/api';
import {
  isValidInstagramUsername,
  normalizeInstagram,
  type LeaderboardEntry,
} from '../leaderboard/domain';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import { combineScores, getPerformanceGrade } from '../rhythm/ScoreSystem';
import type { RhythmResult } from '../rhythm/types';

const INSTAGRAM_STORAGE_KEY = 'holyberg-leaderboard-instagram';
const GAME_URL = 'https://tghnx1.github.io/holyberg_game/';

export class ResultScene extends Phaser.Scene {
  private result!: RhythmResult;
  private totalScore = 0;
  private leaderboardText!: Phaser.GameObjects.Text;
  private playerRowText!: Phaser.GameObjects.Text;
  private leaderboardStatus!: Phaser.GameObjects.Text;
  private claimButton!: Phaser.GameObjects.Text;
  private shareButton!: Phaser.GameObjects.Text;
  private modal?: HTMLDivElement;
  private claimed?: { instagram: string; bestScore: number; rank: number };
  private submitting = false;

  constructor() {
    super('ResultScene');
  }

  init(data: RhythmResult): void {
    this.result = data;
  }

  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#090611');
    for (let index = 0; index < 12; index += 1) {
      this.add.rectangle(
        100 + index * 100,
        650,
        65,
        180 + (index % 4) * 60,
        0x22112e,
      );
    }

    this.totalScore = combineScores(this.result.berlinScore, this.result.score);
    const grade = getPerformanceGrade(this.result.accuracy);
    this.add
      .text(DESIGN_WIDTH / 2, 68, 'SET COMPLETE', {
        fontFamily: 'Archivo Black',
        fontSize: '54px',
        color: '#ffdf57',
        stroke: '#55145e',
        strokeThickness: 9,
      })
      .setOrigin(0.5);
    this.add
      .text(280, 134, `YOUR SET RATING: ${grade}`, {
        fontFamily: 'Archivo Black',
        fontSize: '27px',
        color: '#ff9f43',
      })
      .setOrigin(0.5);
    this.add
      .text(
        92,
        188,
        `BERLIN SCORE       ${this.result.berlinScore}\nRHYTHM SCORE       ${this.result.score}\nTOTAL SCORE        ${this.totalScore}\n\nPERFECT            ${this.result.perfect}\nEXCELLENT          ${this.result.excellent}\nGOOD               ${this.result.good}\nMISS               ${this.result.miss}\nBAD TAPS           ${this.result.badTap}\nMAX COMBO          ${this.result.maxCombo}\nACCURACY           ${this.result.accuracy.toFixed(1)}%\nCROWD ENERGY       ${this.result.energy}%`,
        {
          fontFamily: 'Space Mono',
          fontSize: '18px',
          color: '#ffffff',
          lineSpacing: 4,
        },
      )
      .setOrigin(0, 0);

    this.createLeaderboardPanel();
    this.createReplayControls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeClaimModal());
    void this.loadLeaderboard();
  }

  private createLeaderboardPanel(): void {
    this.add
      .rectangle(902, 365, 620, 490, 0x120a1b, 0.94)
      .setStrokeStyle(4, 0xff477e, 0.9);
    this.add
      .text(902, 140, 'LEADERBOARD', {
        fontFamily: 'Archivo Black',
        fontSize: '32px',
        color: '#ffdf57',
      })
      .setOrigin(0.5);
    this.leaderboardText = this.add.text(625, 181, 'LOADING TOP 10…', {
      fontFamily: 'Space Mono',
      fontSize: '17px',
      color: '#ffffff',
      lineSpacing: 5,
    });
    this.playerRowText = this.add.text(625, 453, `—   CLAIM YOUR SCORE      ${this.totalScore}`, {
      fontFamily: 'Space Mono',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ff9f43',
      backgroundColor: '#2b1238',
      padding: { x: 10, y: 8 },
    });
    this.leaderboardStatus = this.add
      .text(902, 500, '', {
        fontFamily: 'Space Mono',
        fontSize: '14px',
        color: '#ffb0bf',
        align: 'center',
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5, 0);
    this.claimButton = this.createButton(902, 566, 'CLAIM YOUR SCORE', () => {
      void this.claimScore();
    });
    this.shareButton = this.createButton(902, 618, 'SHARE YOUR SCORE', () => {
      void this.shareScore();
    }).setVisible(false);
  }

  private createReplayControls(): void {
    const berlinRun = () => this.scene.start('BerlinScene');
    this.createButton(346, DESIGN_HEIGHT - 48, 'PLAY AGAIN — BERLIN RUN', berlinRun).setFontSize(
      15,
    );
    this.input.keyboard?.once('keydown-R', berlinRun);
  }

  private createButton(x: number, y: number, label: string, action: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        fontFamily: 'Space Mono',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#090611',
        backgroundColor: '#ffdf57',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    button.on('pointerover', () => button.setScale(1.03));
    button.on('pointerout', () => button.setScale(1));
    return button;
  }

  private async loadLeaderboard(): Promise<void> {
    try {
      const snapshot = await fetchLeaderboard(this.totalScore);
      if (!this.scene.isActive()) return;
      this.renderTop10(snapshot.top10);
      this.renderVirtualPlayerRow(snapshot.rank);
      this.leaderboardStatus.setText('');
    } catch (error) {
      if (!this.scene.isActive()) return;
      console.warn('[Leaderboard] could not load', error);
      this.leaderboardText.setText('TOP 10 TEMPORARILY UNAVAILABLE');
      this.renderVirtualPlayerRow();
      this.leaderboardStatus.setText('YOUR FINAL SCORE IS SAFE ON THIS SCREEN. TRY CLAIMING AGAIN.');
    }
  }

  private renderTop10(entries: readonly LeaderboardEntry[]): void {
    if (entries.length === 0) {
      this.leaderboardText.setText('NO CLAIMED SCORES YET\nBE THE FIRST.');
      return;
    }
    this.leaderboardText.setText(
      entries
        .map(
          (entry, index) =>
            `${String(index + 1).padStart(2)}  @${entry.instagram.slice(0, 18).padEnd(18)} ${String(entry.bestScore).padStart(6)}`,
        )
        .join('\n'),
    );
  }

  private renderVirtualPlayerRow(rank?: number): void {
    this.playerRowText.setText(
      `${rank === undefined ? '—' : String(rank).padStart(2)}  CLAIM YOUR SCORE      ${this.totalScore}`,
    );
  }

  private renderClaimedPlayerRow(instagram: string, bestScore: number, rank: number): void {
    this.playerRowText.setText(
      `${String(rank).padStart(2)}  @${instagram.slice(0, 18).padEnd(18)} ${String(bestScore).padStart(6)}`,
    );
  }

  private getStoredInstagram(): string {
    try {
      return window.localStorage.getItem(INSTAGRAM_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private saveInstagram(instagram: string): void {
    try {
      window.localStorage.setItem(INSTAGRAM_STORAGE_KEY, instagram);
    } catch {
      console.warn('[Leaderboard] Instagram username could not be saved locally');
    }
  }

  private async claimScore(): Promise<void> {
    if (this.submitting || this.claimed) return;
    const instagram = await this.showClaimModal(this.getStoredInstagram());
    if (!instagram || !this.scene.isActive()) return;

    this.submitting = true;
    this.claimButton.setText('SUBMITTING…').setAlpha(0.65);
    this.leaderboardStatus.setText('CHECKING PROFILE AND SAVING BEST SCORE…');
    try {
      const response = await claimLeaderboardScore(instagram, this.totalScore);
      if (!this.scene.isActive()) return;
      this.claimed = response;
      this.saveInstagram(response.instagram);
      this.renderTop10(response.top10);
      this.renderClaimedPlayerRow(response.instagram, response.bestScore, response.rank);
      this.claimButton.setVisible(false);
      this.shareButton.setVisible(true);
      this.leaderboardStatus.setText(
        response.bestScore > this.totalScore
          ? `YOUR EXISTING BEST SCORE ${response.bestScore} STILL COUNTS.`
          : 'SCORE CLAIMED.',
      );
    } catch (error) {
      if (!this.scene.isActive()) return;
      const message = error instanceof Error ? error.message : 'Could not claim score';
      this.leaderboardStatus.setText(message.toUpperCase());
      this.claimButton.setText('TRY CLAIM AGAIN').setAlpha(1);
    } finally {
      this.submitting = false;
    }
  }

  private showClaimModal(initialValue: string): Promise<string | null> {
    this.removeClaimModal();
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'leaderboard-claim-overlay';
      modal.innerHTML = `
        <form class="leaderboard-claim-dialog">
          <div class="leaderboard-claim-title">CLAIM YOUR SCORE</div>
          <label for="holyberg-instagram">INSTAGRAM USERNAME</label>
          <input id="holyberg-instagram" name="instagram" maxlength="100" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="@holyberg_">
          <div class="leaderboard-claim-error" aria-live="polite"></div>
          <div class="leaderboard-claim-actions">
            <button type="button" data-action="cancel">CANCEL</button>
            <button type="submit">CLAIM</button>
          </div>
        </form>`;
      document.getElementById('game')?.appendChild(modal);
      this.modal = modal;
      const form = modal.querySelector('form');
      const input = modal.querySelector('input');
      const error = modal.querySelector<HTMLElement>('.leaderboard-claim-error');
      const finish = (value: string | null): void => {
        this.removeClaimModal();
        resolve(value);
      };
      modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(null));
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const normalized = normalizeInstagram(input?.value ?? '');
        if (!isValidInstagramUsername(normalized)) {
          if (error) error.textContent = 'ENTER A VALID INSTAGRAM USERNAME';
          return;
        }
        finish(normalized);
      });
      if (input instanceof HTMLInputElement) {
        input.value = initialValue;
        input.focus();
        input.select();
      }
    });
  }

  private removeClaimModal(): void {
    this.modal?.remove();
    this.modal = undefined;
  }

  private async shareScore(): Promise<void> {
    if (!this.claimed) return;
    const text = `I ranked #${this.claimed.rank} with ${this.claimed.bestScore} points in Holyberg. Can you beat my score?`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Holyberg score', text, url: GAME_URL });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text} ${GAME_URL}`);
        this.leaderboardStatus.setText('SHARE TEXT COPIED.');
        return;
      }
      window.prompt('Copy your Holyberg score', `${text} ${GAME_URL}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.leaderboardStatus.setText('SHARING IS UNAVAILABLE — COPY THE GAME URL.');
    }
  }
}
