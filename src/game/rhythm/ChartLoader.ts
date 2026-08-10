import { RHYTHM_ACTIONS } from './types';
import type { ChartNote, RhythmAction, RhythmChart } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function filterChartNotes(value: unknown): ChartNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note): note is Record<string, unknown> => isRecord(note))
    .filter((note) => typeof note.timeMs === 'number' && Number.isFinite(note.timeMs) && note.timeMs >= 0)
    .map((note) => {
      const legacyActions: RhythmAction[] = ['tapLeft', 'tapRight', 'swipeLeft', 'swipeRight'];
      const action = typeof note.action === 'string' && RHYTHM_ACTIONS.includes(note.action as RhythmAction)
        ? note.action as RhythmAction
        : Number.isInteger(note.lane) && typeof note.lane === 'number' && note.lane >= 0 && note.lane <= 3
          ? legacyActions[note.lane]
          : undefined;
      return action ? { timeMs: note.timeMs as number, action } : null;
    })
    .filter((note): note is ChartNote => note !== null)
    .sort((a, b) => a.timeMs - b.timeMs);
}

export function parseChart(value: unknown): RhythmChart {
  if (!isRecord(value)) throw new Error('Chart must be an object');
  const title = typeof value.title === 'string' ? value.title : 'Untitled chart';
  const bpm = typeof value.bpm === 'number' && value.bpm > 0 ? value.bpm : 120;
  const offsetMs = typeof value.offsetMs === 'number' ? value.offsetMs : 0;
  const durationMs =
    typeof value.durationMs === 'number' && value.durationMs > 0 ? value.durationMs : 30000;
  const audioKey = typeof value.audioKey === 'string' ? value.audioKey : undefined;
  const notes = filterChartNotes(value.notes).filter((note) => note.timeMs <= durationMs);
  return { title, bpm, offsetMs, durationMs, audioKey, notes };
}

export async function loadChart(url: string): Promise<RhythmChart> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load chart: ${response.status}`);
  return parseChart(await response.json());
}
