import { collectCharacterAssets } from '../../characters/characterAssets';
import type { CharacterAssetRef } from '../../characters/characterManifest';
import {
  characterForClubStorySlot,
  clubStorySlotForRoom,
  type ClubStoryCast,
} from './clubStory';

/**
 * The exact minimum artwork needed to place a room's stationary story actor.
 * Kept next to the room/casting data so Club's preload and runtime loader use
 * one source of truth instead of independently guessing which character is
 * visible in a room.
 */
export function getClubStoryActorIdleAssets(
  roomId: string,
  cast: ClubStoryCast,
): CharacterAssetRef[] {
  const slot = clubStorySlotForRoom(roomId);
  return slot
    ? collectCharacterAssets(characterForClubStorySlot(cast, slot), ['idle'])
    : [];
}
