export type OrientationOverlayMode = 'game' | 'instagram' | 'rotate' | 'rotate-with-hint';

export interface OrientationOverlayInput {
  portrait: boolean;
  touchOriented: boolean;
  userAgent: string;
  portraitElapsedMs: number;
}

export function isInstagramInAppBrowser(userAgent: string): boolean {
  return /Instagram/i.test(userAgent);
}

export function getOrientationOverlayMode(input: OrientationOverlayInput): OrientationOverlayMode {
  if (!input.portrait || !input.touchOriented) return 'game';
  if (isInstagramInAppBrowser(input.userAgent)) return 'instagram';
  return input.portraitElapsedMs >= 3000 ? 'rotate-with-hint' : 'rotate';
}
