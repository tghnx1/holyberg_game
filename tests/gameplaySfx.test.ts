import { describe, expect, it } from 'vitest';
import { bossSfxId, jumpSfxId } from '../src/game/audio/gameplaySfx';

describe('gameplay SFX event mapping', () => {
  it('only plays jump effects for accepted physics impulses', () => {
    expect(jumpSfxId(false, 0)).toBeUndefined();
    expect(jumpSfxId(true, 1)).toBe('jump');
    expect(jumpSfxId(true, 2)).toBe('doubleJump');
  });

  it('keeps Boss charge, impact and actual damage as distinct event hooks', () => {
    expect(bossSfxId('telegraphStarted')).toBe('bossLightningCharge');
    expect(bossSfxId('attackActivated')).toBe('bossLightningHit');
    expect(bossSfxId('playerHit')).toBe('bossLightningDamage');
  });
});
