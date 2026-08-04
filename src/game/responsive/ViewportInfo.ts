export interface ViewportInfo {
  logicalWidth: number;
  logicalHeight: number;
  physicalWidth: number;
  physicalHeight: number;
  aspectRatio: number;
  portrait: boolean;
  compactLandscape: boolean;
  touchOriented: boolean;
  safeMargin: number;
  hudScale: number;
  touchControlSize: number;
}
