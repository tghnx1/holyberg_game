import { describe, expect, it } from 'vitest';
import { beginDjGesture, finishDjGesture, getHeldAction, getHoldProgress, HOLD_MIN_MS, updateDjGesture } from '../src/game/rhythm/DjGesture';
import { DJ_GAMEPLAY_TOP_Y, getDjMixLayout, mapPointToTapAction } from '../src/game/rhythm/DjMixLayout';
import { EXCELLENT_WINDOW_MS, GOOD_WINDOW_MS, MISS_WINDOW_MS, PERFECT_WINDOW_MS } from '../src/game/rhythm/constants';
import { judgeTiming } from '../src/game/rhythm/JudgementSystem';
import { TutorialProgress } from '../src/game/rhythm/TutorialProgress';

describe('DJ mix touch onboarding', () => {
  const centerX = 640;

  it('maps the full bottom gameplay area into forgiving left and right halves', () => {
    expect(mapPointToTapAction(0, DJ_GAMEPLAY_TOP_Y, centerX)).toBe('tapLeft');
    expect(mapPointToTapAction(centerX - 0.01, 719, centerX)).toBe('tapLeft');
    expect(mapPointToTapAction(centerX, 719, centerX)).toBe('tapRight');
    expect(mapPointToTapAction(1280, 720, centerX)).toBe('tapRight');
    expect(mapPointToTapAction(200, DJ_GAMEPLAY_TOP_Y - 1, centerX)).toBeNull();
  });

  it('keeps one compact strip symmetric around the live viewport center', () => {
    const narrow = getDjMixLayout(420);
    const wide = getDjMixLayout(800);
    expect(narrow.leftMarkerX + narrow.rightMarkerX).toBe(840);
    expect(wide.leftMarkerX + wide.rightMarkerX).toBe(1600);
    expect(wide.stripWidth).toBe(narrow.stripWidth);
    expect(wide.stripHeight).toBe(narrow.stripHeight);
    expect(narrow.gameplayTop / narrow.gameplayBottom).toBeGreaterThanOrEqual(0.75);
  });

  it('tracks two thumbs independently', () => {
    const leftThumb = beginDjGesture(200, 620, 1000);
    const rightThumb = beginDjGesture(1000, 620, 1000);
    expect(finishDjGesture(leftThumb, 205, 620, 1100, centerX)).toBe('tapLeft');
    expect(finishDjGesture(rightThumb, 995, 620, 1100, centerX)).toBe('tapRight');
  });

  it('recognizes taps without turning swipes into taps', () => {
    const tap = beginDjGesture(200, 600, 1000);
    expect(finishDjGesture(tap, 210, 603, 1120, centerX)).toBe('tapLeft');

    const swipe = beginDjGesture(300, 600, 1000);
    expect(updateDjGesture(swipe, 410, 608)).toBe('swipeRight');
    swipe.resolved = true;
    expect(finishDjGesture(swipe, 420, 608, 1180, centerX)).toBeNull();
  });

  it('recognizes either horizontal swipe and rejects vertical drags', () => {
    expect(updateDjGesture(beginDjGesture(400, 600, 0), 300, 605)).toBe('swipeLeft');
    expect(updateDjGesture(beginDjGesture(400, 600, 0), 500, 606)).toBe('swipeRight');
    expect(updateDjGesture(beginDjGesture(400, 600, 0), 430, 700)).toBeNull();
  });

  it('recognizes hold only after the full hold duration', () => {
    const hold = beginDjGesture(900, 600, 1000);
    expect(getHoldProgress(hold, 1000 + HOLD_MIN_MS / 2)).toBeCloseTo(0.5);
    expect(getHeldAction(hold, 1000 + HOLD_MIN_MS - 1)).toBeNull();
    expect(getHeldAction(hold, 1000 + HOLD_MIN_MS)).toBe('holdFx');
  });

  it('progresses through tap left, tap right, mix and FX only in order', () => {
    const tutorial = new TutorialProgress();
    expect(tutorial.hit('tapRight')).toBe(false);
    expect(tutorial.currentAction).toBe('tapLeft');
    expect(['tapLeft', 'tapRight', 'swipeRight', 'holdFx'].map((action) => tutorial.hit(action as 'tapLeft' | 'tapRight' | 'swipeRight' | 'holdFx'))).toEqual([true, true, true, true]);
    expect(tutorial.complete).toBe(true);
  });

  it('uses the existing promotional timing windows', () => {
    expect(PERFECT_WINDOW_MS).toBe(70);
    expect(EXCELLENT_WINDOW_MS).toBe(130);
    expect(GOOD_WINDOW_MS).toBe(230);
    expect(MISS_WINDOW_MS).toBe(300);
    expect(judgeTiming(70)).toBe('PERFECT');
    expect(judgeTiming(130)).toBe('EXCELLENT');
    expect(judgeTiming(230)).toBe('GOOD');
    expect(judgeTiming(300)).toBeNull();
  });
});
