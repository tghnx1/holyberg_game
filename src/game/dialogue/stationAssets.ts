/**
 * Texture keys and load specs for the metro station's own scenery.
 *
 * Character artwork is deliberately absent: the actors on the platform come
 * from the discovered character manifest and are loaded per dialogue by
 * DialogueScene, so no character path is hardcoded here.
 *
 * Kept free of Phaser so `BootScene` (loading) and `StationSceneView`
 * (drawing) share one list instead of duplicating file paths.
 */

export const DIALOGUE_STATION_TEXTURE_KEYS = {
  background: 'dialogue-metro-background',
  train: 'dialogue-metro-train',
  foreground: 'dialogue-metro-foreground',
} as const;

export interface StationImageAsset {
  key: string;
  url: string;
}

export function getDialogueStationAssetUrls(): StationImageAsset[] {
  return [
    { key: DIALOGUE_STATION_TEXTURE_KEYS.background, url: 'assets/dialogue_1/background_metro.png' },
    { key: DIALOGUE_STATION_TEXTURE_KEYS.train, url: 'assets/dialogue_1/train.png' },
    { key: DIALOGUE_STATION_TEXTURE_KEYS.foreground, url: 'assets/dialogue_1/first_plan_metro.png' },
  ];
}
