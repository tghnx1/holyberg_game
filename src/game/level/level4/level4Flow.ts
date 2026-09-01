import { characterRef, playerRef } from '../../characters/characterRef';
import { getPlayableCharacters } from '../../characters/characterRegistry';
import { getSelectedCharacter } from '../../characters/characterSelection';
import type { CharacterDefinition } from '../../characters/characterManifest';
import type { DialogueSceneCast } from '../../dialogue/dialogueCast';
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
  sceneCast: DialogueSceneCast;
}

export function chooseLevel4NpcCharacter(selected = getSelectedCharacter()): CharacterDefinition {
  const playable = getPlayableCharacters();
  const npc = playable.find((character) => character.id !== selected.id);
  if (!npc) {
    throw new Error(
      `Level 4 needs another playable character for the NPC, but only "${selected.id}" is available.`,
    );
  }
  return npc;
}

export function buildLevel4DialogueBundle(
  _player: CharacterDefinition,
  npc: CharacterDefinition,
): Level4DialogueBundle {
  return {
    script: {
      id: 'level4-toilet-intro',
      sceneId: 'toilet',
      defaultSpeaker: playerRef(),
      lines: [
        { text: 'привет, портал вот тут', speaker: characterRef(npc.id) },
        { text: 'окей давай показывай', speaker: playerRef() },
      ],
      nextScene: 'Level4Scene',
    },
    sceneCast: {
      seatedActor: playerRef(),
      arrivingActor: characterRef(npc.id),
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
