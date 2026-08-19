/**
 * Texture keys and load specs for the Dialogue 1 metro station scene.
 *
 * Kept free of Phaser so `BootScene` (loading) and `StationSceneView`
 * (drawing) share one list instead of duplicating file paths.
 */

export const DIALOGUE_STATION_TEXTURE_KEYS = {
  background: 'dialogue-metro-background',
  train: 'dialogue-metro-train',
  foreground: 'dialogue-metro-foreground',
} as const;

export const ATMOS_SIT_METRO_KEY = 'atmos-sit-metro';

export const DISUS_APPEAR_FRAME_KEYS = [
  'disus-appear-1',
  'disus-appear-2',
  'disus-appear-3',
  'disus-appear-4',
  'disus-appear-5',
  'disus-appear-6',
  'disus-appear-7',
  'disus-appear-8',
  'disus-appear-9',
] as const;

export const DISUS_STAY_KEY = 'disus-stay';

export interface StationImageAsset {
  key: string;
  url: string;
}

export function getDialogueStationAssetUrls(): StationImageAsset[] {
  return [
    { key: DIALOGUE_STATION_TEXTURE_KEYS.background, url: 'assets/dialogue_1/background_metro.png' },
    { key: DIALOGUE_STATION_TEXTURE_KEYS.train, url: 'assets/dialogue_1/train.png' },
    { key: DIALOGUE_STATION_TEXTURE_KEYS.foreground, url: 'assets/dialogue_1/first_plan_metro.png' },
    { key: ATMOS_SIT_METRO_KEY, url: 'assets/players/Atmos/sit_metro.png' },
    ...DISUS_APPEAR_FRAME_KEYS.map((key, index) => ({
      key,
      url: `assets/players/Disus/apiering ${index + 1}.png`,
    })),
    { key: DISUS_STAY_KEY, url: 'assets/players/Disus/stay.png' },
  ];
}
