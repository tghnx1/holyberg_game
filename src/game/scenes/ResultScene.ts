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
  type ClaimedLeaderboardSnapshot,
  type LeaderboardEntry,
} from '../leaderboard/domain';
import { attachFullscreenExitControl } from '../responsive/FullscreenController';
import { OrientationController } from '../responsive/OrientationController';
import type { ViewportInfo } from '../responsive/ViewportInfo';
import { computeResultFit } from './resultLayout';
import { combineAllScores, getPerformanceGrade } from '../rhythm/ScoreSystem';
import type { RhythmResult } from '../rhythm/types';
import { releaseKeyboardCaptureWhileFocused } from '../systems/textInputKeyboardRelease';
import {
  UI_COLORS,
  UI_FONTS,
  uiBodyStyle,
  uiButtonStyle,
  uiHeadingStyle,
  uiTextActionStyle,
} from '../ui/theme';
import { responsiveFontSize } from '../ui/mobileTypography';
import { createBrandedScoreCard, shareScoreResult } from '../leaderboard/scoreShare';

export class ResultScene extends Phaser.Scene {
  /** Final results/leaderboard screen, not gameplay. */
  static readonly pausable = false;

  private result!: RhythmResult;
  private totalScore = 0;
  /**
   * Everything this scene draws lives in here, at the same local coordinates
   * it always had; `layoutUi` moves/scales only this one object to fit the
   * live viewport, so no individual element's position math had to change.
   */
  private root!: Phaser.GameObjects.Container;
  private leaderboardText!: Phaser.GameObjects.Text;
  private playerRowText!: Phaser.GameObjects.Text;
  private leaderboardStatus!: Phaser.GameObjects.Text;
  private instagramInput!: Phaser.GameObjects.Text;
  private claimButton!: Phaser.GameObjects.Text;
  private skipAction!: Phaser.GameObjects.Text;
  private shareButton!: Phaser.GameObjects.Text;
  private restartAction!: Phaser.GameObjects.Text;
  private retryAction!: Phaser.GameObjects.Text;
  private modal?: HTMLDivElement;
  private modalPromise?: Promise<string | null>;
  private modalResolver?: (value: string | null) => void;
  /** Restores Phaser's normal key capture; set while the claim modal's input exists. */
  private releaseInstagramInputCapture?: () => void;
  private claimed?: ClaimedLeaderboardSnapshot;
  private playerRank?: number;
  private storedInstagram = '';
  private submitting = false;
  private skipped = false;
  private responsiveTexts: Array<{
    text: Phaser.GameObjects.Text;
    desktopSize: number;
    kind: 'heading' | 'body' | 'button';
  }> = [];

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
    this.responsiveTexts = [];
  }

  create(): void {
    attachFullscreenExitControl(this);
    this.cameras.main.setBackgroundColor(UI_COLORS.background);
    this.root = this.add.container(0, 0);

    for (let index = 0; index < 12; index += 1) {
      this.root.add(
        this.add.rectangle(100 + index * 100, 650, 65, 180 + (index % 4) * 60, UI_COLORS.panelNumber),
      );
    }

    this.totalScore = combineAllScores(
      this.result.berlinScore,
      this.result.score,
      this.result.bossScore,
    );
    this.storedInstagram = readStoredInstagram(window.localStorage);
    const grade = getPerformanceGrade(this.result.accuracy);
    const title = this.add
      .text(DESIGN_WIDTH / 2, 68, 'SET COMPLETE', uiHeadingStyle('54px'))
      .setOrigin(0.5);
    this.trackText(title, 54, 'heading');
    this.root.add(title);
    const rating = this.add
      .text(280, 134, `YOUR SET RATING: ${grade}`, uiHeadingStyle('27px', { strokeThickness: 5 }))
      .setOrigin(0.5);
    this.trackText(rating, 27, 'heading');
    this.root.add(rating);
    const breakdown = this.add
      .text(92, 188, this.formatBreakdown(), uiBodyStyle('18px', { lineSpacing: 4 }))
      .setOrigin(0, 0);
    this.trackText(breakdown, 18, 'body');
    this.root.add(breakdown);

    this.createLeaderboardPanel();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeClaimModal());
    void this.loadLeaderboard();

    // Built after every child exists, mirroring LevelCompleteScene: the
    // controller runs one onLayout from its own constructor, so there has to
    // be something to lay out by then.
    new OrientationController(this, { onLayout: (viewport) => this.layoutUi(viewport) });
    this.layoutUi();
  }

  /**
   * Fits the whole `root` composition into the live camera, uniformly scaled
   * and centred, respecting the safe-area margin on every side. Re-run on
   * every resize/orientation/fullscreen change through OrientationController,
   * the same pattern LevelCompleteScene/ClubScene use.
   */
  private layoutUi(viewport?: ViewportInfo): void {
    const camera = this.cameras.main;
    const margin = viewport?.safeMargin ?? 24;
    const panelWidth = Math.max(1, camera.width - margin * 2);
    const panelHeight = Math.max(1, camera.height - margin * 2);
    const fit = computeResultFit(panelWidth, panelHeight);
    this.root.setScale(fit.scale).setPosition(margin + fit.offsetX, margin + fit.offsetY);
    for (const item of this.responsiveTexts) {
      item.text.setFontSize(responsiveFontSize(item.desktopSize, viewport, item.kind));
    }
    this.leaderboardText.setLineSpacing(viewport?.compactLandscape && viewport.touchOriented ? 0 : 5);
  }

  /**
   * Level 3 lines only appear once a boss fight has actually been played, so
   * the Level 1 + Level 2 result reads exactly as it did before.
   */
  private formatBreakdown(): string {
    const lines = [
      `BERLIN SCORE       ${this.result.berlinScore}`,
      `RHYTHM SCORE       ${this.result.score}`,
    ];
    if (this.result.bossScore !== undefined) {
      lines.push(`BOSS SCORE         ${this.result.bossScore}`);
    }
    lines.push(`TOTAL SCORE        ${this.totalScore}`, '');
    lines.push(
      `PERFECT            ${this.result.perfect}`,
      `GOOD               ${this.result.good}`,
      `OK                 ${this.result.ok}`,
      `MISS               ${this.result.miss}`,
      `BAD TAPS           ${this.result.badTap}`,
      `MAX COMBO          ${this.result.maxCombo}`,
      `ACCURACY           ${this.result.accuracy.toFixed(1)}%`,
    );
    if (this.result.bossScore !== undefined) {
      lines.push(
        '',
        `LASER HITS         ${this.result.bossHits ?? 0}`,
        `BOSS MAX COMBO     ${this.result.bossMaxCombo ?? 0}`,
        `EMERALDS           ${this.result.bossEmeralds ?? 0}`,
        `EMERALD SCORE      ${this.result.bossEmeraldScore ?? 0}`,
      );
    }
    return lines.join('\n');
  }

  private createLeaderboardPanel(): void {
    const showClaimUi = shouldShowClaimUi(this.storedInstagram);
    this.root.add(
      this.add
        .rectangle(902, 380, 620, 570, UI_COLORS.panelNumber, 0.94)
        .setStrokeStyle(2, UI_COLORS.accentNumber, 0.9),
    );
    const leaderboardTitle = this.add
      .text(902, 116, 'LEADERBOARD', uiHeadingStyle('32px'))
      .setOrigin(0.5);
    this.trackText(leaderboardTitle, 32, 'heading');
    this.root.add(leaderboardTitle);
    this.leaderboardText = this.add.text(625, 154, 'LOADING TOP 10…', uiBodyStyle('17px', { lineSpacing: 5 }));
    this.trackText(this.leaderboardText, 17, 'body');
    this.root.add(this.leaderboardText);
    this.playerRowText = this.add.text(
      625,
      425,
      showClaimUi
        ? `—   CLAIM YOUR SPOT       ${this.totalScore}`
        : this.formatPlayerRow(undefined, this.storedInstagram, this.totalScore),
      {
        fontFamily: UI_FONTS.body,
        fontSize: '18px',
        fontStyle: 'bold',
        color: UI_COLORS.accentBright,
        backgroundColor: UI_COLORS.panelRaised,
        padding: { x: 10, y: 8 },
      },
    );
    this.trackText(this.playerRowText, 18, 'body');
    this.root.add(this.playerRowText);
    this.leaderboardStatus = this.add
      .text(
        902,
        471,
        showClaimUi ? 'CALCULATING YOUR POSITION…' : 'UPDATING YOUR BEST SCORE…',
        uiBodyStyle('16px', { fontStyle: 'bold', align: 'center', wordWrap: { width: 540 } }),
      )
      .setOrigin(0.5, 0);
    this.trackText(this.leaderboardStatus, 16, 'body');
    this.root.add(this.leaderboardStatus);
    this.instagramInput = this.add
      .text(902, 523, '[@____________]', {
        fontFamily: UI_FONTS.body,
        fontSize: '18px',
        color: UI_COLORS.textPrimary,
        backgroundColor: UI_COLORS.background,
        padding: { x: 18, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setVisible(showClaimUi);
    this.trackText(this.instagramInput, 18, 'body');
    this.root.add(this.instagramInput);
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
    this.restartAction = this.createTextAction(902, 642, 'RESTART FULL GAME', () => {
      this.scene.start('BerlinScene');
    }).setVisible(!showClaimUi);
    this.retryAction = this.createTextAction(902, 511, 'RETRY SCORE UPDATE', () => {
      void this.updateStoredScore();
    }).setVisible(false);
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    action: () => void,
  ): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, uiButtonStyle('17px'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    button.on('pointerover', () => button.setScale(1.03));
    button.on('pointerout', () => button.setScale(1));
    this.root.add(button);
    this.trackText(button, 17, 'button');
    return button;
  }

  private createTextAction(
    x: number,
    y: number,
    label: string,
    action: () => void,
  ): Phaser.GameObjects.Text {
    const actionText = this.add
      .text(x, y, label, uiTextActionStyle('14px'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    actionText.on('pointerdown', action);
    actionText.on('pointerover', () => actionText.setColor(UI_COLORS.accentBright));
    actionText.on('pointerout', () => actionText.setColor(UI_COLORS.textSecondary));
    this.root.add(actionText);
    this.trackText(actionText, 14, 'body');
    return actionText;
  }

  private trackText(
    text: Phaser.GameObjects.Text,
    desktopSize: number,
    kind: 'heading' | 'body' | 'button',
  ): void {
    this.responsiveTexts.push({ text, desktopSize, kind });
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
        // While this input has focus, Phaser must not preventDefault() any
        // key it has captured for gameplay/editor shortcuts (A, D, S, E, C,
        // V, P, Space, ...) — that capture happens regardless of DOM focus,
        // and would otherwise silently drop those characters while typing a
        // handle. Restored on blur, and defensively in removeClaimModal too.
        this.releaseInstagramInputCapture = releaseKeyboardCaptureWhileFocused(
          this.input.keyboard,
          input,
        );
        input.focus();
        input.select();
      }
    });
    return this.modalPromise;
  }

  private removeClaimModal(): void {
    this.releaseInstagramInputCapture?.();
    this.releaseInstagramInputCapture = undefined;
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
    try {
      const result = await shareScoreResult(
        {
          rank: this.claimed.rank,
          score: this.claimed.bestScore,
          instagram: this.claimed.instagram,
          leaderboard: this.claimed.top10,
        },
        {
          navigator,
          createCardFile: createBrandedScoreCard,
          prompt: (message, value) => window.prompt(message, value),
        },
      );
      if (result === 'copied') {
        this.leaderboardStatus.setText('SHARE TEXT COPIED.');
      } else if (result === 'prompted') {
        this.leaderboardStatus.setText('COPY THE SCORE TEXT TO SHARE.');
      }
    } catch {
      this.leaderboardStatus.setText('SHARING IS UNAVAILABLE — COPY THE GAME URL.');
    }
  }
}
