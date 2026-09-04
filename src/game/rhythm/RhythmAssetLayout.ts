export const RHYTHM_HIGHWAY_TEXTURE_KEY = 'rhythm-highway-figma';
export const RHYTHM_DECK_TEXTURE_KEY = 'rhythm-deck-left';

export const RHYTHM_VISUAL_ASSETS = [
  {
    key: RHYTHM_HIGHWAY_TEXTURE_KEY,
    url: 'assets/level_3/Rhythm Highway (unchanged).svg',
    type: 'svg',
  },
  { key: RHYTHM_DECK_TEXTURE_KEY, url: 'assets/level_3/Deck L.svg', type: 'svg' },
] as const;

export const RHYTHM_HIGHWAY_WIDTH = 960;
export const RHYTHM_HIGHWAY_HEIGHT = 720;
export const RHYTHM_HIGHWAY_LOCAL_CENTER_X = RHYTHM_HIGHWAY_WIDTH / 2;

export const RHYTHM_DECK_WIDTH = 340;
export const RHYTHM_DECK_HEIGHT = 196;
export const RHYTHM_DECK_CENTER_OFFSET_X = 310;
export const RHYTHM_DECK_TOP_Y = 564;
export const RHYTHM_DECK_PLATTER_OFFSET_X = 3.375;
export const RHYTHM_DECK_PLATTER_OFFSET_Y = 105.53;

export const RHYTHM_MIXER_WIDTH = 176;
export const RHYTHM_MIXER_HEIGHT = 210;
export const RHYTHM_MIXER_TOP_Y = 620;

export interface RhythmAssetLayout {
  highwayX: number;
  highwayY: number;
  leftDeckX: number;
  rightDeckX: number;
  deckY: number;
  mixerX: number;
  mixerY: number;
}

export function getRhythmAssetLayout(centerX: number): RhythmAssetLayout {
  return {
    highwayX: centerX,
    highwayY: 0,
    leftDeckX: centerX - RHYTHM_DECK_CENTER_OFFSET_X,
    rightDeckX: centerX + RHYTHM_DECK_CENTER_OFFSET_X,
    deckY: RHYTHM_DECK_TOP_Y,
    mixerX: centerX,
    mixerY: RHYTHM_MIXER_TOP_Y,
  };
}
