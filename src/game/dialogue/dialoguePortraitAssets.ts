/**
 * Texture keys and load specs for 2-frame talking dialogue portraits.
 *
 * Kept free of Phaser so `BootScene` (loading) and `speakerPortraits.ts`
 * (config) share one list instead of duplicating file paths. Separate from
 * `stationAssets.ts`: that file is the left-hand scene's own art, this is
 * the right-hand portrait panel's.
 */

export const ATMOS_DIALOG_IDLE_KEY = 'atmos-dialog-1';
export const ATMOS_DIALOG_TALK_KEY = 'atmos-dialog-2';
export const DISUS_DIALOG_IDLE_KEY = 'disus-dialog-1';
export const DISUS_DIALOG_TALK_KEY = 'disus-dialog-2';

export interface DialoguePortraitAsset {
  key: string;
  url: string;
}

export function getDialoguePortraitAssetUrls(): DialoguePortraitAsset[] {
  return [
    { key: ATMOS_DIALOG_IDLE_KEY, url: 'assets/players/Atmos/dialog_1.png' },
    { key: ATMOS_DIALOG_TALK_KEY, url: 'assets/players/Atmos/dialog_2.png' },
    { key: DISUS_DIALOG_IDLE_KEY, url: 'assets/players/Disus/dialog_1.png' },
    { key: DISUS_DIALOG_TALK_KEY, url: 'assets/players/Disus/dialog_2.png' },
  ];
}
