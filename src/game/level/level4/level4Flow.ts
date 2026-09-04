import { resolveCharacterRole, roleRef } from '../../characters/characterRef';
import type { CharacterDefinition } from '../../characters/characterManifest';
import type { DialogueScript } from '../../dialogue/types';
import type { RhythmResult } from '../../rhythm/types';

export interface Level4ResumePayload {
  introComplete: boolean;
  playerX: number;
  /**
   * World x the camera was centred on when the dialogue took over — a focus
   * point, not a `scrollX`. A scroll is a left edge, so handing one back
   * restored a different composition on any viewport that changed while the
   * conversation was on screen (a rotation, a resize, entering fullscreen),
   * and made the resumed frame depend on the window rather than the room.
   */
  cameraFocusX: number;
  npcId: string;
  rhythmResult: RhythmResult;
}

export interface Level4DialogueBundle {
  script: DialogueScript;
}

export function chooseLevel4NpcCharacter(selected?: CharacterDefinition): CharacterDefinition {
  void selected;
  return resolveCharacterRole('magician');
}

export function buildLevel4DialogueBundle(): Level4DialogueBundle {
  return {
    script: {
      id: 'level4-toilet-magician',
      sceneId: 'currentScene',
      title: 'THE PORTAL',
      defaultSpeaker: roleRef('magician'),
      lines: [
        {
          text: 'Never doubted you for a second. Almost home.',
          speaker: roleRef('magician'),
          speakerName: 'THE MAGICIAN',
        },
      ],
      nextScene: 'Level4Scene',
    },
  };
}

export function createEmptyRhythmResult(): RhythmResult {
  return {
    score: 0,
    rawScore: 0,
    maximumRawScore: 1,
    scorePenalty: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    ok: 0,
    miss: 0,
    badTap: 0,
    berlinScore: 0,
    accuracy: 0,
    success: true,
  };
}
