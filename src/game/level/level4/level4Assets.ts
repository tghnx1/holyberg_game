export const LEVEL4_ASSET_KEYS = {
  holyworldBackground: 'level4-holyworld-background',
  toiletStrip: 'level4-toilet-strip',
  stallDoor: 'level4-stall-door',
} as const;

export interface Level4ImageAsset {
  key: string;
  url: string;
}

export function getLevel4AssetUrls(): Level4ImageAsset[] {
  return [
    {
      key: LEVEL4_ASSET_KEYS.holyworldBackground,
      url: 'assets/level_4/holyworld-background.png',
    },
    { key: LEVEL4_ASSET_KEYS.toiletStrip, url: 'assets/level_4/toilet-full.png' },
    { key: LEVEL4_ASSET_KEYS.stallDoor, url: 'assets/level_4/stall-door.png' },
  ];
}
