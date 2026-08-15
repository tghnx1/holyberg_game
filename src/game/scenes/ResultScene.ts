import Phaser from 'phaser';
import { DESIGN_WIDTH } from '../constants';
import { claimLeaderboardScore, fetchLeaderboard } from '../leaderboard/api';
import {
  readStoredInstagram,
  saveStoredInstagram,
  shouldShowClaimUi,
  updateSavedScore,
} from '../leaderboard/claimFlow';
import {
  isValidInstagramUsername,
  normalizeInstagram,
  type LeaderboardEntry,
} from '../leaderboard/domain';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import { combineScores, getPerformanceGrade } from '../rhythm/ScoreSystem';
import type { RhythmResult } from '../rhythm/types';

const GAME_URL = 'https://tghnx1.github.io/holyberg_game/';

export class ResultScene extends Phaser.Scene {
  private result!: RhythmResult;
  private totalScore = 0;
  private leaderboardText!: Phaser.GameObjects.Text;
  private playerRowText!: Phaser.GameObjects.Text;
  private leaderboardStatus!: Phaser.GameObjects.Text;
  private instagramInput!: Phaser.GameObjects.Text;
  private claimButton!: Phaser.GameObjects.Text;
  private skipAction!: Phaser.GameObjects.Text;
  private shareButton!: Phaser.GameObjects.Text;
  private replayButton!: Phaser.GameObjects.Text;
  private restartAction!: Phaser.GameObjects.Text;
  private retryAction!: Phaser.GameObjects.Text;
  private modal?: HTMLDivElement;
  private modalPromise?: Promise<string | null>;
  private modalResolver?: (value: string | null) => void;
  private claimed?: { instagram: string; bestScore: number; rank: number };
  private playerRank?: number;
  private storedInstagram = '';
  private submitting = false;
  private skipped = false;

  constructor() {
    super('ResultScene');
  }

  init(data: RhythmResult): void {
    this.result = data;
    this.claimed = undefined;
    this.playerRank = undefined;
    this.storedInstagram = '';
    this.submitting = false;
    this.skipped = false;
  }

  create(): void {
    new OrientationController(this);
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor('#090611');
    for (let index = 0; index < 12; index += 1) {
      this.add.rectangle(100 + index * 100, 650, 65, 180 + (index % 4) * 60, 0x22112e);
    }

    this.totalScore = combineScores(this.result.berlinScore, this.result.score);
    this.storedInstagram = readStoredInstagram(window.localStorage);
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
        `BERLIN SCORE       ${this.result.berlinScore}\nRHYTHM SCORE       ${this.result.score}\nTOTAL SCORE        ${this.totalScore}\n\nPERFECT            ${this.result.perfect}\nGOOD               ${this.result.good}\nOK                 ${this.result.ok}\nMISS               ${this.result.miss}\nBAD TAPS           ${this.result.badTap}\nMAX COMBO          ${this.result.maxCombo}\nACCURACY           ${this.result.accuracy.toFixed(1)}%\nCROWD ENERGY       ${Math.round(this.result.energy)}%`,
        {
          fontFamily: 'Space Mono',
          fontSize: '18px',
          color: '#ffffff',
          lineSpacing: 4,
        },
      )
      .setOrigin(0, 0);

    this.createLeaderboardPanel();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeClaimModal());
    void this.loadLeaderboard();
  }

  private createLeaderboardPanel(): void {
    const showClaimUi = shouldShowClaimUi(this.storedInstagram);
    this.add.rectangle(902, 380, 620, 570, 0x120a1b, 0.94).setStrokeStyle(4, 0xff477e, 0.9);
    this.add
      .text(902, 116, 'LEADERBOARD', {
        fontFamily: 'Archivo Black',
        fontSize: '32px',
        color: '#ffdf57',
      })
      .setOrigin(0.5);
    this.leaderboardText = this.add.text(625, 154, 'LOADING TOP 10…', {
      fontFamily: 'Space Mono',
      fontSize: '17px',
      color: '#ffffff',
      lineSpacing: 5,
    });
    this.playerRowText = this.add.text(
      625,
      425,
      showClaimUi
        ? `—   CLAIM YOUR SPOT       ${this.totalScore}`
        : this.formatPlayerRow(undefined, this.storedInstagram, this.totalScore),
      {
        fontFamily: 'Space Mono',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ff9f43',
        backgroundColor: '#2b1238',
        padding: { x: 10, y: 8 },
      },
    );
    this.leaderboardStatus = this.add
      .text(902, 471, showClaimUi ? 'CALCULATING YOUR POSITION…' : 'UPDATING YOUR BEST SCORE…', {
        fontFamily: 'Space Mono',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5, 0);
    this.instagramInput = this.add
      .text(902, 523, '[@____________]', {
        fontFamily: 'Space Mono',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#090611',
        padding: { x: 18, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(showClaimUi);
    this.instagramInput.on('pointerdown', () => {
      void this.claimScore();
    });

    this.claimButton = this.createButton(902, 573, 'CLAIM YOUR SPOT', () => {
      void this.claimScore();
    }).setVisible(showClaimUi);
    this.skipAction = this.createTextAction(902, 619, 'Skip', () => this.skipClaim()).setVisible(
      showClaimUi,
    );

    this.shareButton = this.createButton(902, 533, 'SHARE YOUR SCORE', () => {
      void this.shareScore();
    }).setVisible(false);
    this.replayButton = this.createButton(902, 590, 'REPLAY THIS LEVEL', () => {
      this.scene.start('RhythmScene', { score: this.result.berlinScore });
    })
      .setFontSize(18)
      .setBackgroundColor('#ff477e')
      .setColor('#ffffff')
      .setPadding(20, 10)
      .setVisible(false);
    this.restartAction = this.createTextAction(902, 642, 'RESTART FULL GAME', () => {
      this.scene.start('BerlinScene');
    }).setVisible(!showClaimUi);
    this.retryAction = this.createTextAction(902, 511, 'RETRY SCORE UPDATE', () => {
      void this.updateStoredScore();
    }).setVisible(false);
    if (!showClaimUi) this.replayButton.setVisible(true);
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    action: () => void,
  ): Phaser.GameObjects.Text {
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

  private createTextAction(
    x: number,
    y: number,
    label: string,
    action: () => void,
  ): Phaser.GameObjects.Text {
    const actionText = this.add
      .text(x, y, label, {
        fontFamily: 'Space Mono',
        fontSize: '14px',
        color: '#ffb0bf',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    actionText.on('pointerdown', action);
    actionText.on('pointerover', () => actionText.setColor('#ffffff'));
    actionText.on('pointerout', () => actionText.setColor('#ffb0bf'));
    return actionText;
  }

  private async loadLeaderboard(): Promise<void> {
    if (this.storedInstagram) {
      await this.updateStoredScore();
      return;
    }

    try {
      const snapshot = await fetchLeaderboard(this.totalScore);
      if (!this.scene.isActive()) return;
      this.renderTop10(snapshot.top10);
      this.renderVirtualPlayerRow(snapshot.rank);
      void this.promptForClaimAndSubmit();
    } catch (error) {
      if (!this.scene.isActive()) return;
      console.warn('[Leaderboard] could not load', error);
      this.leaderboardText.setText('TOP 10 TEMPORARILY UNAVAILABLE');
      this.renderVirtualPlayerRow();
      if (!this.skipped) this.leaderboardStatus.setText('YOUR SCORE IS READY TO CLAIM');
      void this.promptForClaimAndSubmit();
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
    this.playerRank = rank;
    this.playerRowText.setText(
      `${rank === undefined ? '—' : String(rank).padStart(2)}  CLAIM YOUR SPOT       ${this.totalScore}`,
    );
    if (this.skipped) return;
    this.leaderboardStatus.setText(
      rank === undefined ? 'YOUR SCORE IS READY TO CLAIM' : `YOUR SCORE IS #${rank}`,
    );
    this.claimButton.setText(rank === undefined ? 'CLAIM YOUR SPOT' : `CLAIM YOUR #${rank} SPOT`);
  }

  private renderClaimedPlayerRow(instagram: string, bestScore: number, rank: number): void {
    this.playerRowText.setText(this.formatPlayerRow(rank, instagram, bestScore));
  }

  private formatPlayerRow(rank: number | undefined, instagram: string, score: number): string {
    return `${rank === undefined ? '—' : String(rank).padStart(2)}  @${instagram.slice(0, 18).padEnd(18)} ${String(score).padStart(6)}`;
  }

  private skipClaim(): void {
    if (this.submitting || this.claimed) return;
    this.skipped = true;
    this.claimButton.setVisible(false);
    this.instagramInput.setVisible(false);
    this.skipAction.setVisible(false);
    this.leaderboardStatus.setText('SCORE NOT CLAIMED');
    this.showReplayOptions(false);
  }

  private showReplayOptions(claimed: boolean): void {
    this.shareButton.setVisible(claimed);
    this.replayButton.setVisible(true);
    this.restartAction.setVisible(true);
  }

  private async updateStoredScore(): Promise<void> {
    if (!this.storedInstagram || this.submitting) return;

    if (import.meta.env.DEV) {
      console.debug('[Leaderboard][debug] auto-update start', {
        instagram: this.storedInstagram,
        totalScore: this.totalScore,
        source: 'stored-instagram',
      });
    }
    this.submitting = true;
    this.retryAction.setVisible(false);
    this.leaderboardStatus.setText('UPDATING YOUR BEST SCORE…');
    const update = await updateSavedScore(
      this.storedInstagram,
      this.totalScore,
      claimLeaderboardScore,
    );
    this.submitting = false;
    if (!this.scene.isActive()) return;

    if (update.status === 'success') {
      const response = update.snapshot;
      if (import.meta.env.DEV) {
        console.debug('[Leaderboard][debug] auto-update success', {
          instagram: response.instagram,
          bestScore: response.bestScore,
          rank: response.rank,
          top10Count: response.top10.length,
        });
      }
      this.claimed = response;
      this.renderTop10(response.top10);
      this.renderClaimedPlayerRow(response.instagram, response.bestScore, response.rank);
      this.leaderboardStatus.setText(`YOU'RE #${response.rank}`);
      this.showReplayOptions(true);
      return;
    }

    if (import.meta.env.DEV) {
      console.debug('[Leaderboard][debug] auto-update failed', {
        instagram: update.instagram,
        localScore: update.localScore,
        error: update.error,
      });
    }
    console.warn('[Leaderboard] automatic best-score update failed', update.error);
    this.leaderboardText.setText('TOP 10 TEMPORARILY UNAVAILABLE');
    this.playerRowText.setText(
      this.formatPlayerRow(undefined, update.instagram, update.localScore),
    );
    this.leaderboardStatus.setText("COULDN'T UPDATE YOUR BEST SCORE");
    this.retryAction.setVisible(true);
    this.showReplayOptions(false);
  }

  private async claimScore(): Promise<void> {
    if (this.submitting || this.claimed) return;
    await this.promptForClaimAndSubmit();
  }

  private openClaimModal(initialValue = ''): Promise<string | null> {
    if (this.modalPromise) return this.modalPromise;
    this.removeClaimModal();
    this.modalPromise = new Promise((resolve) => {
      this.modalResolver = resolve;
      const modal = document.createElement('div');
      modal.className = 'leaderboard-claim-overlay';
      const rankLabel = this.playerRank === undefined ? '' : ` #${this.playerRank}`;
      modal.innerHTML = `
        <form class="leaderboard-claim-dialog">
          <div class="leaderboard-claim-title">CLAIM YOUR${rankLabel} SPOT</div>
          <label for="holyberg-instagram">INSTAGRAM USERNAME</label>
          <input id="holyberg-instagram" name="instagram" maxlength="100" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="@holyberg_">
          <div class="leaderboard-claim-error" aria-live="polite"></div>
          <div class="leaderboard-claim-actions">
            <button type="button" data-action="cancel">CANCEL</button>
            <button type="submit">CLAIM SPOT</button>
          </div>
        </form>`;
      document.getElementById('game')?.appendChild(modal);
      this.modal = modal;
      const form = modal.querySelector('form');
      const input = modal.querySelector('input');
      const error = modal.querySelector<HTMLElement>('.leaderboard-claim-error');
      const finish = (value: string | null): void => {
        this.removeClaimModal();
        this.modalResolver?.(value);
        this.modalResolver = undefined;
        this.modalPromise = undefined;
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
    return this.modalPromise;
  }

  private removeClaimModal(): void {
    this.modal?.remove();
    this.modal = undefined;
  }

  private async promptForClaimAndSubmit(): Promise<void> {
    const instagram = await this.openClaimModal();
    if (!instagram || !this.scene.isActive()) return;

    if (import.meta.env.DEV) {
      console.debug('[Leaderboard][debug] manual claim submit', {
        instagram,
        totalScore: this.totalScore,
      });
    }
    this.submitting = true;
    this.claimButton.setText('SUBMITTING…').setAlpha(0.65);
    this.leaderboardStatus.setText('CHECKING PROFILE AND SAVING BEST SCORE…');
    try {
      const response = await claimLeaderboardScore(instagram, this.totalScore);
      if (!this.scene.isActive()) return;
      if (import.meta.env.DEV) {
        console.debug('[Leaderboard][debug] manual claim success', {
          instagram: response.instagram,
          bestScore: response.bestScore,
          rank: response.rank,
          top10Count: response.top10.length,
        });
      }
      this.claimed = response;
      if (!saveStoredInstagram(window.localStorage, response.instagram)) {
        console.warn('[Leaderboard] Instagram username could not be saved locally');
      }
      this.renderTop10(response.top10);
      this.renderClaimedPlayerRow(response.instagram, response.bestScore, response.rank);
      this.claimButton.setVisible(false);
      this.instagramInput.setVisible(false);
      this.skipAction.setVisible(false);
      this.leaderboardStatus.setText(`YOU'RE #${response.rank}`);
      this.showReplayOptions(true);
    } catch (error) {
      if (!this.scene.isActive()) return;
      if (import.meta.env.DEV) {
        console.debug('[Leaderboard][debug] manual claim failed', {
          instagram,
          error,
        });
      }
      const message = error instanceof Error ? error.message : 'Could not claim score';
      this.leaderboardStatus.setText(message.toUpperCase());
      this.claimButton
        .setText(
          this.playerRank === undefined ? 'CLAIM YOUR SPOT' : `CLAIM YOUR #${this.playerRank} SPOT`,
        )
        .setAlpha(1);
    } finally {
      this.submitting = false;
    }
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
