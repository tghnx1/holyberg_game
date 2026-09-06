import rawLayout from '../assets/dialogueStationLayout.json';

/**
 * Rest-pose config for the Dialogue 1 station objects, edited by the
 * generic SceneEditor and persisted here instead of hardcoded magic numbers
 * in StationSceneView.
 *
 * Every value is a ratio of the left dialogue panel's own current size, not
 * an absolute screen pixel, so the same file works at any viewport: `xRatio`/
 * `yRatio` are fractions of the panel width/height, and `heightRatio` is the
 * object's rendered height as a fraction of the panel height (its scale is
 * derived from that at load time). Each object's "rest pose" is its settled,
 * static appearance — for the train that's stationary-before-departure, for
 * the arriving actor that's its settled pose after appearing — and the animations derive
 * their own frame-by-frame offsets from that single pose, so editing it can't
 * desync them.
 */
export interface StationObjectLayout {
  xRatio: number;
  yRatio: number;
  heightRatio: number;
}

export interface DialogueStationLayoutConfig {
  background: StationObjectLayout;
  train: StationObjectLayout;
  foreground: StationObjectLayout;
  /** Slot names, not characters: whoever the cast seats and lands here. */
  seated: StationObjectLayout;
  arriving: StationObjectLayout;
}

export const DEFAULT_STATION_LAYOUT = rawLayout as DialogueStationLayoutConfig;

export type StationObjectKey = keyof DialogueStationLayoutConfig;

export interface StationPixelTransform {
  x: number;
  y: number;
  scale: number;
}

export interface StationLayoutSnapshotEntry {
  id: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

/** Ratio -> absolute pixels for the panel currently being laid out. */
export function resolveStationTransform(
  layout: StationObjectLayout,
  panelWidth: number,
  panelHeight: number,
  nativeHeight: number,
): StationPixelTransform {
  return {
    x: layout.xRatio * panelWidth,
    y: layout.yRatio * panelHeight,
    scale: nativeHeight > 0 ? (layout.heightRatio * panelHeight) / nativeHeight : 1,
  };
}

/** Absolute pixels -> ratio, so the editor can persist what it just set. */
export function toStationObjectLayout(
  transform: StationPixelTransform,
  panelWidth: number,
  panelHeight: number,
  nativeHeight: number,
): StationObjectLayout {
  return {
    xRatio: panelWidth > 0 ? transform.x / panelWidth : 0,
    yRatio: panelHeight > 0 ? transform.y / panelHeight : 0,
    heightRatio: panelHeight > 0 ? (nativeHeight * transform.scale) / panelHeight : 0,
  };
}

/**
 * Produces the persisted rest-pose layout from a SceneEditor snapshot.
 *
 * Animated stage objects may have a live transform that differs from the
 * authored one while their tween is running. Callers provide that object's
 * tracked rest transform so saving never bakes animation progress into the
 * next run's layout.
 */
export function buildStationLayoutFromSnapshot(
  layout: DialogueStationLayoutConfig,
  snapshot: readonly StationLayoutSnapshotEntry[],
  nativeHeights: Record<StationObjectKey, number>,
  panelWidth: number,
  panelHeight: number,
  restTransforms: Partial<Record<StationObjectKey, StationPixelTransform>> = {},
): DialogueStationLayoutConfig {
  const next: DialogueStationLayoutConfig = structuredClone(layout);
  for (const entry of snapshot) {
    const id = entry.id as StationObjectKey;
    if (!(id in nativeHeights)) continue;
    const transform = restTransforms[id] ?? {
      x: entry.x,
      y: entry.y,
      scale: entry.scaleY,
    };
    next[id] = toStationObjectLayout(
      transform,
      panelWidth,
      panelHeight,
      nativeHeights[id],
    );
  }
  return next;
}
