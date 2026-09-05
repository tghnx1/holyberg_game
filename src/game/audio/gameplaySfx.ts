import type { GameAudioId } from './gameAudioCatalog';

/** Maps a successful movement impulse — not an input press — to its cue. */
export function jumpSfxId(jumped: boolean, jumpsThisAirtime: number): GameAudioId | undefined {
  if (!jumped) return undefined;
  return jumpsThisAirtime >= 2 ? 'doubleJump' : 'jump';
}

export type BossSfxEvent = 'telegraphStarted' | 'attackActivated' | 'playerHit';

/** Boss director events are distinct, so charge, impact and damage never overlap by accident. */
export function bossSfxId(event: BossSfxEvent): GameAudioId {
  switch (event) {
    case 'telegraphStarted': return 'bossLightningCharge';
    case 'attackActivated': return 'bossLightningHit';
    case 'playerHit': return 'bossLightningDamage';
  }
}
