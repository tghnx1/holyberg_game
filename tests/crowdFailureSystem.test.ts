import { describe, expect, it } from 'vitest';
import { CrowdFailureSystem } from '../src/game/rhythm/CrowdFailureSystem';

describe('crowd failure grace period', () => {
  it('fails only after crowd remains at zero for three seconds', () => {
    const failure = new CrowdFailureSystem();
    expect(failure.update(0, 10)).toBe(false);
    expect(failure.update(0, 12.999)).toBe(false);
    expect(failure.update(0, 13)).toBe(true);
  });

  it('cancels failure when crowd recovers above zero', () => {
    const failure = new CrowdFailureSystem();
    expect(failure.update(0, 10)).toBe(false);
    expect(failure.update(2, 12)).toBe(false);
    expect(failure.update(0, 20)).toBe(false);
    expect(failure.update(0, 22.999)).toBe(false);
    expect(failure.update(0, 23)).toBe(true);
  });

  it('can be reset for a fresh rhythm attempt', () => {
    const failure = new CrowdFailureSystem();
    failure.update(0, 1);
    failure.reset();
    expect(failure.update(0, 10)).toBe(false);
    expect(failure.update(0, 12)).toBe(false);
  });
});
