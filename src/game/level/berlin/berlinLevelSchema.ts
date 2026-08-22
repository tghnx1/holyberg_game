import type { BerlinEntity } from './types';

/**
 * Runtime validation for the authoritative level JSON.
 *
 * Deliberately dependency-free so both sides can use it: the app validates
 * `berlinLevel.generated.json` at import time, and the dev-only save endpoint
 * validates a request body before it is allowed to overwrite that file. A
 * malformed level should fail loudly at startup rather than producing a scene
 * with silently missing or misplaced objects.
 */

const ENTITY_TYPES = ['obstacle', 'collectible', 'platform', 'movingPlatform'] as const;
const OBSTACLE_ACTIONS = ['jump', 'duck', 'moving'] as const;
const COLLECTIBLE_KINDS = ['emerald'] as const;
const PLATFORM_AXES = ['horizontal', 'vertical'] as const;

export class LevelSchemaError extends Error {
  constructor(message: string) {
    super(`Invalid Berlin level data: ${message}`);
    this.name = 'LevelSchemaError';
  }
}

type Record_ = Record<string, unknown>;

function fail(where: string, message: string): never {
  throw new LevelSchemaError(`${where} ${message}`);
}

function requireNumber(record: Record_, key: string, where: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(where, `field "${key}" must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalNumber(record: Record_, key: string, where: string): void {
  if (record[key] === undefined) return;
  requireNumber(record, key, where);
}

function optionalBoolean(record: Record_, key: string, where: string): void {
  const value = record[key];
  if (value !== undefined && typeof value !== 'boolean') {
    fail(where, `field "${key}" must be a boolean, got ${JSON.stringify(value)}`);
  }
}

function requireString(record: Record_, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail(where, `field "${key}" must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireOneOf<T extends string>(
  record: Record_,
  key: string,
  allowed: readonly T[],
  where: string,
): T {
  const value = record[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(where, `field "${key}" must be one of ${allowed.join(' | ')}, got ${JSON.stringify(value)}`);
  }
  return value as T;
}

function requirePositive(record: Record_, key: string, where: string): void {
  if (requireNumber(record, key, where) <= 0) {
    fail(where, `field "${key}" must be greater than 0`);
  }
}

function requireHitbox(record: Record_, where: string): void {
  const hitbox = record.hitbox;
  if (typeof hitbox !== 'object' || hitbox === null) {
    fail(where, 'field "hitbox" must be an object');
  }
  const box = hitbox as Record_;
  requirePositive(box, 'width', `${where} hitbox`);
  requirePositive(box, 'height', `${where} hitbox`);
  requireNumber(box, 'offsetX', `${where} hitbox`);
  requireNumber(box, 'offsetY', `${where} hitbox`);
}

/**
 * Validates a decoded level payload. Returns the same data typed as entities,
 * or throws a LevelSchemaError naming the offending entry and field.
 */
export function validateBerlinEntities(data: unknown): BerlinEntity[] {
  if (!Array.isArray(data)) {
    throw new LevelSchemaError(`expected an array of entities, got ${typeof data}`);
  }
  // An empty level is always a mistake rather than an intent, and accepting
  // one would silently replace the real layout with nothing.
  if (data.length === 0) {
    throw new LevelSchemaError('the level is empty; refusing to replace the layout with no entities');
  }

  const seen = new Set<string>();

  data.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      fail(`entity[${index}]`, 'must be an object');
    }
    const entity = raw as Record_;
    const id = requireString(entity, 'id', `entity[${index}]`);
    const where = `entity[${index}] "${id}"`;

    if (seen.has(id)) fail(where, 'duplicate id');
    seen.add(id);

    const type = requireOneOf(entity, 'type', ENTITY_TYPES, where);
    requireString(entity, 'artSlot', where);
    requireString(entity, 'label', where);
    requireNumber(entity, 'x', where);
    requireNumber(entity, 'y', where);
    requirePositive(entity, 'width', where);
    requirePositive(entity, 'height', where);
    optionalBoolean(entity, 'editorSized', where);

    if (type === 'obstacle') {
      requireOneOf(entity, 'action', OBSTACLE_ACTIONS, where);
      requireHitbox(entity, where);
      if (entity.movement !== undefined) {
        const movement = entity.movement;
        if (typeof movement !== 'object' || movement === null) {
          fail(where, 'field "movement" must be an object');
        }
        requireNumber(movement as Record_, 'distance', `${where} movement`);
        requirePositive(movement as Record_, 'durationMs', `${where} movement`);
      }
      return;
    }

    if (type === 'collectible') {
      requireOneOf(entity, 'kind', COLLECTIBLE_KINDS, where);
      requireNumber(entity, 'score', where);
      return;
    }

    // platform and movingPlatform both land on their top edge.
    requireNumber(entity, 'topY', where);
    if (type === 'movingPlatform') {
      requireOneOf(entity, 'axis', PLATFORM_AXES, where);
      requirePositive(entity, 'movementDistance', where);
      requirePositive(entity, 'durationMs', where);
      requireNumber(entity, 'phaseMs', where);
      optionalNumber(entity, 'activationX', where);
    }
  });

  return data as BerlinEntity[];
}
