import { afterEach, describe, expect, it } from 'vitest';
import { getCharacter } from '../src/game/characters/characterRegistry';
import {
  getDialoguePresentation,
  portraitFillRatioForScale,
  resetDialoguePresentation,
  resolvePortraitScale,
  setPortraitFillRatio,
} from '../src/game/dialogue/dialoguePresentation';
import { validateDialoguePresentation } from '../src/game/dialogue/dialoguePresentationSchema';

const PANEL_W = 439;
const PANEL_H = 424;
const SRC_W = 1024;
const SRC_H = 575;

afterEach(() => resetDialoguePresentation());

describe('global dialogue head size', () => {
  it('is one setting shared by every character', () => {
    const atmos = getCharacter('atmos');
    const doms = getCharacter('doctor-doms');
    const before = {
      atmos: resolvePortraitScale(atmos, PANEL_W, PANEL_H, SRC_W, SRC_H),
      doms: resolvePortraitScale(doms, PANEL_W, PANEL_H, SRC_W, SRC_H),
    };

    setPortraitFillRatio(getDialoguePresentation().portraitFillRatio * 2);

    // Both move, by the same factor: the global knob never changes how two
    // characters relate to each other, only the size of every head at once.
    expect(resolvePortraitScale(atmos, PANEL_W, PANEL_H, SRC_W, SRC_H)).toBeCloseTo(
      before.atmos * 2,
      6,
    );
    expect(resolvePortraitScale(doms, PANEL_W, PANEL_H, SRC_W, SRC_H)).toBeCloseTo(
      before.doms * 2,
      6,
    );
  });

  it('applies the same fit to a character with no calibration of its own', () => {
    const atmos = getCharacter('atmos');
    // Atmos is the reference: its calibration is 1, so the global ratio alone
    // decides its head size.
    expect(atmos.presentation.dialogueScale).toBe(1);
    const expected =
      Math.min(PANEL_W / SRC_W, PANEL_H / SRC_H) * getDialoguePresentation().portraitFillRatio;
    expect(resolvePortraitScale(atmos, PANEL_W, PANEL_H, SRC_W, SRC_H)).toBeCloseTo(expected, 6);
  });

  it('scales a calibrated character relative to the same reference', () => {
    const doms = getCharacter('doctor-doms');
    const atmos = getCharacter('atmos');
    const ratio =
      resolvePortraitScale(doms, PANEL_W, PANEL_H, SRC_W, SRC_H) /
      resolvePortraitScale(atmos, PANEL_W, PANEL_H, SRC_W, SRC_H);
    expect(ratio).toBeCloseTo(doms.presentation.dialogueScale, 6);
  });

  it('round-trips a dragged scale back into the global ratio', () => {
    const doms = getCharacter('doctor-doms');
    const dragged = 0.9;
    const ratio = portraitFillRatioForScale(doms, dragged, PANEL_W, PANEL_H, SRC_W, SRC_H);
    setPortraitFillRatio(ratio);
    // Editing through a calibrated character still lands the *global* value,
    // so that character ends up exactly where it was dragged.
    expect(resolvePortraitScale(doms, PANEL_W, PANEL_H, SRC_W, SRC_H)).toBeCloseTo(dragged, 6);
  });

  it('ignores a nonsensical ratio rather than blanking every portrait', () => {
    const before = getDialoguePresentation().portraitFillRatio;
    setPortraitFillRatio(0);
    setPortraitFillRatio(Number.NaN);
    setPortraitFillRatio(-1);
    expect(getDialoguePresentation().portraitFillRatio).toBe(before);
  });
});

describe('persisted head size validation', () => {
  it('accepts a sane config', () => {
    expect(validateDialoguePresentation({ portraitFillRatio: 1.2 })).toEqual({
      portraitFillRatio: 1.2,
    });
  });

  it('rejects a missing, malformed or out-of-range ratio', () => {
    expect(() => validateDialoguePresentation(null)).toThrow(/presentation object/);
    expect(() => validateDialoguePresentation({})).toThrow(/portraitFillRatio/);
    expect(() => validateDialoguePresentation({ portraitFillRatio: 'big' })).toThrow(/finite/);
    expect(() => validateDialoguePresentation({ portraitFillRatio: 0 })).toThrow(/between/);
    expect(() => validateDialoguePresentation({ portraitFillRatio: 99 })).toThrow(/between/);
  });
});
