import { GROUND_Y, WORLD_WIDTH } from '../../constants';
import { CROUCHING_BODY } from './playerPhysics';
import type { BerlinEntity, BerlinSection, GroundSegment } from './types';

export const BERLIN_SECTIONS: readonly BerlinSection[] = [
  { id: 'tutorial', label: 'APARTMENT', startX: 0, endX: 1600, artSlot: 'background.apartment' },
  { id: 'firstPit', label: 'BACK ALLEY GAP', startX: 1600, endX: 3200, artSlot: 'background.street' },
  { id: 'kiez', label: 'KIEZ STREET', startX: 3200, endX: 5000, artSlot: 'background.street' },
  { id: 'bridge', label: 'OBERBAUMBRÜCKE', startX: 5000, endX: 6800, artSlot: 'background.bridge' },
  { id: 'night', label: 'NIGHT BERLIN', startX: 6800, endX: 8500, artSlot: 'background.night' },
  { id: 'scaffold', label: 'SCAFFOLD ASCENT', startX: 8500, endX: 10300, artSlot: 'background.night' },
  { id: 'rooftops', label: 'ROOFTOPS', startX: 10300, endX: 12000, artSlot: 'background.club' },
  { id: 'finalPit', label: 'FINAL GAP', startX: 12000, endX: 13800, artSlot: 'background.club' },
  {
    id: 'finale',
    label: 'CLUB EXTERIOR',
    startX: 13800,
    endX: WORLD_WIDTH,
    artSlot: 'background.club',
  },
] as const;

export const CLUB_ENTRANCE_X = 15000;

/** One unbroken floor across the whole level: there are no pits to fall into. */
export const GROUND_SEGMENTS: readonly GroundSegment[] = [
  { id: 'ground-1', startX: 0, endX: WORLD_WIDTH },
] as const;

const platform = (id: string, x: number, width: number, topY: number): BerlinEntity => ({
  id,
  type: 'platform',
  label: id.toUpperCase(),
  x,
  y: topY + 12,
  width,
  height: 24,
  topY,
  artSlot: `platform.${id}`,
});

const movingPlatform = (
  id: string,
  x: number,
  width: number,
  topY: number,
  axis: 'horizontal' | 'vertical',
  movementDistance: number,
  durationMs: number,
  phaseMs: number,
  activationX?: number,
  reverseInitialDirection?: boolean,
): BerlinEntity => ({
  id,
  type: 'movingPlatform',
  label: id.toUpperCase(),
  x,
  y: topY + 12,
  width,
  height: 24,
  topY,
  axis,
  movementDistance,
  durationMs,
  phaseMs,
  activationX,
  reverseInitialDirection,
  artSlot: `platform.${id}`,
});

const groundObstacle = (
  id: string,
  x: number,
  label: string,
  artSlot: string,
  width = 84,
  height = 62,
): BerlinEntity => ({
  id,
  type: 'obstacle',
  action: 'jump',
  x,
  y: GROUND_Y - height / 2,
  width,
  height,
  label,
  artSlot,
  hitbox: {
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.9),
    offsetX: 0,
    offsetY: height / 2 - Math.round(height * 0.9) / 2,
  },
});

const duckObstacle = (
  id: string,
  x: number,
  label: string,
  artSlot: string,
  width: number,
  height: number,
  hitboxWidth: number,
  hitboxHeight: number,
  bottomClearance = 10,
): BerlinEntity => ({
  id,
  type: 'obstacle',
  action: 'duck',
  x,
  y: GROUND_Y - CROUCHING_BODY.height - bottomClearance - height / 2,
  width,
  height,
  label,
  artSlot,
  hitbox: {
    width: Math.round(hitboxWidth * 0.8),
    height: Math.round(hitboxHeight * 0.9),
    offsetX: 0,
    offsetY: height / 2 - Math.round(hitboxHeight * 0.9) / 2,
  },
});

const movingObstacle = (
  id: string,
  x: number,
  label: string,
  artSlot: string,
  width: number,
  height: number,
  hitboxWidth: number,
  hitboxHeight: number,
  distance: number,
  durationMs: number,
): BerlinEntity => ({
  id,
  type: 'obstacle',
  action: 'moving',
  label,
  x,
  y: GROUND_Y - height / 2,
  width,
  height,
  hitbox: {
    width: hitboxWidth,
    height: hitboxHeight,
    offsetX: 0,
    offsetY: height / 2 - hitboxHeight / 2,
  },
  movement: { distance, durationMs },
  artSlot,
});

export const BERLIN_ENTITIES: readonly BerlinEntity[] = [
  // SECTION 1 — TUTORIAL — x 0–1600
  {
    id: 'usb',
    type: 'collectible',
    kind: 'usb',
    label: 'USB',
    x: 650,
    y: 538,
    width: 86,
    height: 62,
    score: 500,
    artSlot: 'collectible.usb',
  },
  groundObstacle('trash-bags', 1000, 'TRASH BAGS', 'obstacle.trash'),
  duckObstacle('low-sign', 1400, 'LOW SIGN', 'obstacle.lowSign', 150, 30, 164, 34),

  // SECTION 2 — FIRST PIT — x 1600–3200
  movingPlatform('early-moving-platform-1', 2050, 340, 490, 'vertical', 60, 2700, 0),
  movingPlatform('early-moving-platform-2', 2700, 320, 390, 'vertical', 60, 2700, 1350),

  // SECTION 3 — KIEZ STREET — x 3200–5000
  {
    id: 'headphones',
    type: 'collectible',
    kind: 'headphones',
    label: 'HEADPHONES',
    x: 3850,
    y: 490,
    width: 54,
    height: 54,
    score: 200,
    artSlot: 'collectible.headphones',
  },
  groundObstacle('scooter', 3450, 'SCOOTER', 'obstacle.scooter', 100, 55),
  movingObstacle('cyclist-1', 4250, 'CYCLIST', 'npc.cyclist', 105, 78, 96, 72, 80, 2600),
  groundObstacle('street-barrier', 4750, 'BARRIER', 'obstacle.barrier', 105, 68),

  // SECTION 4 — OBERBAUMBRÜCKE — x 5000–6800
  {
    id: 'poster',
    type: 'collectible',
    kind: 'poster',
    label: 'POSTER',
    x: 6550,
    y: 485,
    width: 50,
    height: 64,
    score: 150,
    artSlot: 'collectible.poster',
  },
  duckObstacle('bridge-cable', 5200, 'BRIDGE CABLE', 'obstacle.cable', 160, 25, 176, 32, 12),
  groundObstacle('bridge-crate', 5600, 'CRATE', 'obstacle.trash', 90, 60),
  movingObstacle('wanderer-1', 6150, 'NIGHT WANDERER', 'npc.wanderer', 70, 100, 61, 94, 70, 2800),

  // SECTION 5 — NIGHT BERLIN — x 6800–8500
  {
    id: 'night-bonus',
    type: 'collectible',
    kind: 'energy',
    label: 'NIGHT BONUS',
    x: 7600,
    y: 350,
    width: 48,
    height: 48,
    score: 250,
    artSlot: 'collectible.energy',
  },
  groundObstacle('puddle', 7050, 'PUDDLE', 'obstacle.puddle', 130, 38),
  platform('platform-1', 7100, 440, 470),
  duckObstacle('night-pipe', 8100, 'LOW PIPE', 'obstacle.pipe', 160, 30, 174, 34, 11),
  groundObstacle('taxi', 8400, 'TAXI', 'obstacle.taxi', 175, 82),

  // SECTION 6 — SCAFFOLD ASCENT — x 8500–10300
  groundObstacle('scaffold-barrier', 8750, 'BARRIER', 'obstacle.barrier', 115, 72),
  platform('platform-2', 9000, 360, 470),
  platform('platform-3', 9600, 320, 380),
  {
    id: 'artifact-1',
    type: 'collectible',
    kind: 'vinyl',
    label: 'ARTIFACT',
    x: 9850,
    y: 205,
    width: 48,
    height: 48,
    score: 400,
    artSlot: 'collectible.vinyl',
  },
  movingObstacle('cyclist-2', 10100, 'CYCLIST', 'npc.cyclist', 105, 78, 96, 72, 70, 2900),

  // SECTION 7 — ROOFTOPS — x 10300–12000
  duckObstacle('rooftop-cable', 10600, 'ROOFTOP CABLE', 'obstacle.cable', 160, 25, 176, 32, 12),
  platform('platform-4', 10700, 360, 470),
  groundObstacle('rooftop-crate', 11100, 'ROOFTOP CRATE', 'obstacle.trash', 100, 65),
  platform('platform-5', 11200, 320, 390),
  platform('platform-6', 11700, 280, 300),
  {
    id: 'artifact-2',
    type: 'collectible',
    kind: 'poster',
    label: 'ARTIFACT',
    x: 11800,
    y: 155,
    width: 48,
    height: 48,
    score: 500,
    artSlot: 'collectible.poster',
  },

  // SECTION 8 — FINAL MOVING PLATFORM PIT — x 12000–13800
  movingPlatform('final-moving-platform-1', 12150, 280, 450, 'horizontal', 110, 2300, 0, 11300, true),
  movingPlatform('final-moving-platform-2', 12550, 260, 300, 'horizontal', 140, 2100, 1050, 11300),
  movingPlatform('final-moving-platform-3', 12950, 280, 400, 'horizontal', 140, 2100, 1050, 11300),
  movingPlatform('final-moving-platform-4', 13350, 260, 350, 'horizontal', 140, 2100, 1050, 11300),
  movingPlatform('final-moving-platform-5', 13750, 280, 200, 'horizontal', 140, 2100, 1050, 11300),

  // SECTION 9 — CLUB FINALE — x 13800–15500
  groundObstacle('final-barrier', 14000, 'BARRIER', 'obstacle.barrier', 115, 72),
  duckObstacle('club-awning', 14400, 'CLUB AWNING', 'obstacle.lowSign', 160, 28, 174, 32, 10),
  movingObstacle('final-wanderer', 14800, 'NIGHT WANDERER', 'npc.wanderer', 70, 100, 61, 94, 60, 3000),
  {
    id: 'club-pass',
    type: 'collectible',
    kind: 'pass',
    label: 'CLUB PASS',
    x: 14700,
    y: 490,
    width: 48,
    height: 66,
    score: 250,
    artSlot: 'collectible.pass',
  },
] as const;

export function sectionIndexAtX(x: number): number {
  const index = BERLIN_SECTIONS.findIndex((section) => x >= section.startX && x < section.endX);
  return index < 0 ? BERLIN_SECTIONS.length - 1 : index;
}
