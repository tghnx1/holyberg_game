import { describe, expect, it } from 'vitest';
import {
  projectFrame,
  resolveCoverFrame,
  resolveGroundedProjection,
  type ArtFrame,
} from '../src/game/responsive/groundedCover';

const source = { width: 1600, height: 686 };
const DESIGN = { width: 1280, height: 720 };
const FLOOR_Y = 710;

function project(width: number, height: number, reference: ArtFrame): ArtFrame {
  return projectFrame(
    reference,
    resolveGroundedProjection({
      reference,
      viewport: { width, height },
      designFloorY: FLOOR_Y,
      liveFloorY: (height * FLOOR_Y) / DESIGN.height,
    }),
  );
}

describe('grounded cover art', () => {
  const reference = resolveCoverFrame(source, DESIGN.width, DESIGN.height);

  it('is an identity transform at the design size', () => {
    expect(
      resolveGroundedProjection({
        reference,
        viewport: DESIGN,
        designFloorY: FLOOR_Y,
        liveFloorY: FLOOR_Y,
      }),
    ).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it.each([
    [1280, 720],
    [1558, 720],
    [1836, 720],
    [2200, 720],
    [960, 720],
  ])('keeps the floor line and full coverage at %sx%s', (width, height) => {
    const projection = resolveGroundedProjection({
      reference,
      viewport: { width, height },
      designFloorY: FLOOR_Y,
      liveFloorY: (height * FLOOR_Y) / DESIGN.height,
    });
    const frame = project(width, height, reference);
    expect(projection.y + FLOOR_Y * projection.scale).toBeCloseTo(
      (height * FLOOR_Y) / DESIGN.height,
    );
    expect(frame.x - frame.width / 2).toBeLessThanOrEqual(1e-9);
    expect(frame.y - frame.height / 2).toBeLessThanOrEqual(1e-9);
    expect(frame.x + frame.width / 2).toBeGreaterThanOrEqual(width - 1e-9);
    expect(frame.y + frame.height / 2).toBeGreaterThanOrEqual(height - 1e-9);
  });

  it('crops a wider viewport off the top, not off the floor', () => {
    const desktop = project(1280, 720, reference);
    const phone = project(1836, 720, reference);
    expect(phone.y - phone.height / 2).toBeLessThan(desktop.y - desktop.height / 2);
    expect(phone.y + phone.height / 2 - 720).toBeLessThan(desktop.height * 0.05);
  });

  it('honours a minimum scale asked for by art sharing the transform', () => {
    const projection = resolveGroundedProjection({
      reference,
      viewport: { width: 1280, height: 720 },
      designFloorY: FLOOR_Y,
      liveFloorY: FLOOR_Y,
      minScale: 1.5,
    });
    expect(projection.scale).toBe(1.5);
    expect(projection.y + FLOOR_Y * projection.scale).toBeCloseTo(FLOOR_Y);
  });

  it('applies the authored shift and overscan to the reference composition', () => {
    const shifted = resolveCoverFrame(source, DESIGN.width, DESIGN.height, {
      shiftY: 20,
      overscan: 1.04,
    });
    expect(shifted.y).toBe(DESIGN.height / 2 + 20);
    expect(shifted.height).toBeGreaterThanOrEqual(DESIGN.height + 40);
  });
});
