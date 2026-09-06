import { describe, expect, it } from 'vitest';
import {
  buildStationLayoutFromSnapshot,
  resolveStationTransform,
  toStationObjectLayout,
  type DialogueStationLayoutConfig,
} from '../src/game/dialogue/dialogueStationLayout';
import { validateDialogueStationLayout } from '../src/game/dialogue/dialogueStationLayoutSchema';

describe('station layout ratio conversion', () => {
  it('round-trips pixels -> ratio -> pixels for a given panel size', () => {
    const panelWidth = 717;
    const panelHeight = 424;
    const nativeHeight = 184;
    const original = { x: 172, y: 385, scale: 0.92 };

    const ratio = toStationObjectLayout(original, panelWidth, panelHeight, nativeHeight);
    const resolved = resolveStationTransform(ratio, panelWidth, panelHeight, nativeHeight);

    expect(resolved.x).toBeCloseTo(original.x, 5);
    expect(resolved.y).toBeCloseTo(original.y, 5);
    expect(resolved.scale).toBeCloseTo(original.scale, 5);
  });

  it('stays proportionally correct across a different panel size (responsive)', () => {
    const nativeHeight = 184;
    const ratio = toStationObjectLayout({ x: 172, y: 385, scale: 0.92 }, 717, 424, nativeHeight);

    const narrower = resolveStationTransform(ratio, 500, 424, nativeHeight);
    expect(narrower.x).toBeCloseTo(172 * (500 / 717), 5);
    // y/scale depend only on height, which is unchanged here.
    expect(narrower.y).toBeCloseTo(385, 5);
    expect(narrower.scale).toBeCloseTo(0.92, 5);

    const shorter = resolveStationTransform(ratio, 717, 300, nativeHeight);
    expect(shorter.y).toBeCloseTo(385 * (300 / 424), 5);
    expect(shorter.scale).toBeCloseTo(0.92 * (300 / 424), 5);
  });

  it('degrades to zero rather than dividing by zero for an empty panel', () => {
    const ratio = toStationObjectLayout({ x: 10, y: 10, scale: 1 }, 0, 0, 184);
    expect(ratio).toEqual({ xRatio: 0, yRatio: 0, heightRatio: 0 });
  });

  it('saves the train authored rest pose after its departure tween has moved the live sprite', () => {
    const panelWidth = 1280;
    const panelHeight = 720;
    const nativeHeight = 184;
    const restTrain = { x: 218, y: 864, scale: 5.625 };
    const layout: DialogueStationLayoutConfig = {
      background: { xRatio: 0, yRatio: 0, heightRatio: 1 },
      train: toStationObjectLayout(restTrain, panelWidth, panelHeight, nativeHeight),
      foreground: { xRatio: 0, yRatio: 0, heightRatio: 1 },
      seated: { xRatio: 0.5, yRatio: 0.75, heightRatio: 0.35 },
      arriving: { xRatio: 0.35, yRatio: 0.75, heightRatio: 0.5 },
    };

    // This is the live sprite after the unchanged departure tween finishes.
    const departedTrain = { id: 'train', x: 2000, y: 864, scaleX: 5.625, scaleY: 5.625 };
    const saved = buildStationLayoutFromSnapshot(
      layout,
      [departedTrain],
      { background: 887, train: nativeHeight, foreground: 887, seated: 184, arriving: 184 },
      panelWidth,
      panelHeight,
      { train: restTrain },
    );

    // A reload resolves the train back onto the visible platform rest pose,
    // rather than the departed tween position that happened to be on screen
    // when P-save was pressed.
    expect(resolveStationTransform(saved.train, panelWidth, panelHeight, nativeHeight)).toEqual(restTrain);
  });
});

describe('station layout validation', () => {
  const valid = {
    background: { xRatio: 0, yRatio: 0, heightRatio: 1 },
    train: { xRatio: 0.5, yRatio: 0.8, heightRatio: 0.5 },
    foreground: { xRatio: 0, yRatio: 0, heightRatio: 1 },
    seated: { xRatio: 0.24, yRatio: 0.9, heightRatio: 0.4 },
    arriving: { xRatio: 0.68, yRatio: 0.9, heightRatio: 0.4 },
  };

  it('accepts a complete, well-formed layout', () => {
    expect(validateDialogueStationLayout(valid)).toEqual(valid);
  });

  it('rejects a missing object entry', () => {
    const incomplete: Record<string, unknown> = { ...valid };
    delete incomplete.arriving;
    expect(() => validateDialogueStationLayout(incomplete)).toThrow(/arriving/);
  });

  it('rejects a non-numeric field', () => {
    const broken = { ...valid, train: { ...valid.train, xRatio: 'oops' } };
    expect(() => validateDialogueStationLayout(broken)).toThrow(/train/);
  });

  it('rejects a non-object payload', () => {
    expect(() => validateDialogueStationLayout(null)).toThrow();
    expect(() => validateDialogueStationLayout('nope')).toThrow();
  });
});
