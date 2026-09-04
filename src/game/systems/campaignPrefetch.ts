import { collectCharacterAssets } from '../characters/characterAssets';
import type { CharacterDefinition } from '../characters/characterManifest';
import { getSelectedCharacter } from '../characters/characterSelection';
import { resolveCharacterRole } from '../characters/characterRef';
import { getBossAssetUrls } from '../boss/bossAssets';
import { getCollectibleAnimationAssetUrls } from '../collectibles/collectibleAnimations';
import { getLevel4AssetUrls } from '../level/level4/level4Assets';
import { chooseLevel4NpcCharacter } from '../level/level4/level4Flow';
import { collectClubNpcFirstFrames, collectClubNpcFrames } from '../level/club/clubNpcAssets';
import { getRoomNpcGroups } from '../level/club/clubNpcPlacement';
import { CLUB_ROOMS } from '../level/club/clubRooms';
import {
  characterForClubStorySlot,
  resolveClubStoryCast,
  type ClubStoryCast,
  type ClubStorySlot,
} from '../level/club/clubStory';
import type { AssetQualityProfile } from '../responsive/AssetQuality';
import { RHYTHM_VISUAL_ASSETS } from '../rhythm/RhythmAssetLayout';
import { MAIN_RHYTHM_TRACK } from '../rhythm/TrackRegistry';
import {
  getPrefetchPolicy,
  prefetchAssets,
  type PrefetchAsset,
  type PrefetchPriority,
} from './videoPrefetch';

export type CampaignStage = 'Berlin' | 'Club' | 'Rhythm' | 'Level4' | 'Boss';

export interface CampaignPrefetchContext {
  selectedCharacter: CharacterDefinition;
  profile: AssetQualityProfile;
  clubStoryCast?: ClubStoryCast;
}

export interface CampaignAssetPackage {
  stage: Exclude<CampaignStage, 'Berlin'> | 'Final';
  critical: PrefetchAsset[];
  full: PrefetchAsset[];
}

export interface ResourceCacheStats {
  hits: number;
  observed: number;
  expected: number;
}

/** Resource Timing's transferSize=0 is the browser signal for a cache hit. */
export function summarizeResourceCache(
  urls: readonly string[],
  entries: readonly Pick<PerformanceResourceTiming, 'name' | 'transferSize' | 'decodedBodySize'>[],
  baseUrl = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI,
): ResourceCacheStats {
  const expected = new Set(urls.map((url) => new URL(url, baseUrl).href));
  const latest = new Map<
    string,
    Pick<PerformanceResourceTiming, 'transferSize' | 'decodedBodySize'>
  >();
  for (const entry of entries) if (expected.has(entry.name)) latest.set(entry.name, entry);
  return {
    hits: [...latest.values()].filter(
      (entry) => entry.transferSize === 0 && entry.decodedBodySize > 0,
    ).length,
    observed: latest.size,
    expected: expected.size,
  };
}

const NEXT_STAGE: Record<CampaignStage, CampaignAssetPackage['stage']> = {
  Berlin: 'Club',
  Club: 'Rhythm',
  Rhythm: 'Level4',
  Level4: 'Boss',
  Boss: 'Final',
};

export function getNextCampaignStage(stage: CampaignStage): CampaignAssetPackage['stage'] {
  return NEXT_STAGE[stage];
}

function asset(
  url: string,
  priority: PrefetchPriority,
  kind: PrefetchAsset['kind'] = 'image',
): PrefetchAsset {
  return { url, priority, kind };
}

function characterAssets(
  character: CharacterDefinition,
  groups: Parameters<typeof collectCharacterAssets>[1],
  priority: PrefetchPriority,
): PrefetchAsset[] {
  return collectCharacterAssets(character, groups).map((ref) => asset(ref.url, priority));
}

function unique(assets: readonly PrefetchAsset[]): PrefetchAsset[] {
  const seen = new Set<string>();
  return assets.filter((entry) => (seen.has(entry.url) ? false : (seen.add(entry.url), true)));
}

function roomNpcAssets(roomId: string, priority: PrefetchPriority): PrefetchAsset[] {
  return collectClubNpcFrames(getRoomNpcGroups(roomId)).map((frame) => asset(frame.url, priority));
}

function roomFirstFrameAssets(roomId: string, priority: PrefetchPriority): PrefetchAsset[] {
  return collectClubNpcFirstFrames(getRoomNpcGroups(roomId)).map((frame) =>
    asset(frame.url, priority),
  );
}

/** Canonical Berlin -> Level 2 package, derived from Club's own room/NPC/character manifests. */
export function getClubAssetPackage(
  selectedCharacter: CharacterDefinition,
  cast: ClubStoryCast = resolveClubStoryCast(selectedCharacter),
): CampaignAssetPackage {
  const story = (slot: ClubStorySlot) => characterForClubStorySlot(cast, slot);
  const first = CLUB_ROOMS[0];
  const critical = unique([
    asset(first.videoUrl, 'CRITICAL', 'video'),
    asset(first.posterUrl, 'CRITICAL'),
    ...roomFirstFrameAssets(first.id, 'CRITICAL'),
    ...characterAssets(selectedCharacter, ['walk'], 'CRITICAL'),
    ...characterAssets(story('dj1'), ['idle'], 'CRITICAL'),
  ]);

  const full: PrefetchAsset[] = [
    ...roomNpcAssets(first.id, 'HIGH'),
    asset(CLUB_ROOMS[1].videoUrl, 'HIGH', 'video'),
    asset(CLUB_ROOMS[1].posterUrl, 'HIGH'),
    ...roomNpcAssets(CLUB_ROOMS[1].id, 'HIGH'),
    ...characterAssets(story('barkeeper'), ['idle'], 'HIGH'),
  ];
  for (const room of CLUB_ROOMS.slice(2)) {
    full.push(
      asset(room.videoUrl, 'LOW', 'video'),
      asset(room.posterUrl, 'LOW'),
      ...roomNpcAssets(room.id, 'LOW'),
    );
  }
  full.push(...characterAssets(story('dj3'), ['idle'], 'LOW'));
  const criticalUrls = new Set(critical.map((entry) => entry.url));
  return {
    stage: 'Club',
    critical,
    full: unique(full).filter((entry) => !criticalUrls.has(entry.url)),
  };
}

export function getRhythmAssetPackage(): CampaignAssetPackage {
  return {
    stage: 'Rhythm',
    critical: unique([
      asset(MAIN_RHYTHM_TRACK.metadataUrl, 'CRITICAL', 'data'),
      asset(MAIN_RHYTHM_TRACK.midiUrl, 'CRITICAL', 'data'),
      asset(MAIN_RHYTHM_TRACK.audioUrl, 'CRITICAL', 'audio'),
      ...RHYTHM_VISUAL_ASSETS.map((entry) => asset(entry.url, 'CRITICAL')),
    ]),
    full: [],
  };
}

export function getLevel4AssetPackage(context: CampaignPrefetchContext): CampaignAssetPackage {
  const npc = chooseLevel4NpcCharacter(context.selectedCharacter);
  const critical = unique([
    ...getLevel4AssetUrls(context.profile).map((entry) => asset(entry.url, 'CRITICAL')),
    ...characterAssets(context.selectedCharacter, ['gameplay'], 'CRITICAL'),
    ...characterAssets(npc, ['idle'], 'CRITICAL'),
  ]);
  const criticalUrls = new Set(critical.map((entry) => entry.url));
  return {
    stage: 'Level4',
    critical,
    full: unique(characterAssets(npc, ['gameplay', 'appear'], 'HIGH')).filter(
      (entry) => !criticalUrls.has(entry.url),
    ),
  };
}

export function getBossAssetPackage(context: CampaignPrefetchContext): CampaignAssetPackage {
  const bossAssets = getBossAssetUrls(context.profile);
  const firstPoseFrames = new Set(
    bossAssets.filter((entry) => /-01$/.test(entry.key)).map((entry) => entry.url),
  );
  const critical = unique([
    ...getLevel4AssetUrls(context.profile)
      .filter((entry) => entry.key === 'level4-holyworld-background')
      .map((entry) => asset(entry.url, 'CRITICAL')),
    ...bossAssets
      .filter(
        (entry) => entry.key === 'boss-environment-platform' || firstPoseFrames.has(entry.url),
      )
      .map((entry) => asset(entry.url, 'CRITICAL')),
    ...characterAssets(context.selectedCharacter, ['gameplay'], 'CRITICAL'),
    ...getCollectibleAnimationAssetUrls().map((entry) => asset(entry.url, 'CRITICAL')),
  ]);
  const criticalUrls = new Set(critical.map((entry) => entry.url));
  return {
    stage: 'Boss',
    critical,
    full: unique(bossAssets.map((entry) => asset(entry.url, 'HIGH'))).filter(
      (entry) => !criticalUrls.has(entry.url),
    ),
  };
}

export function getFinalAssetPackage(selected: CharacterDefinition): CampaignAssetPackage {
  return {
    stage: 'Final',
    critical: unique([
      ...characterAssets(selected, ['portrait'], 'CRITICAL'),
      ...characterAssets(resolveCharacterRole('magician'), ['portrait'], 'CRITICAL'),
    ]),
    full: [],
  };
}

export function getCampaignAssetPackage(
  current: CampaignStage,
  context: CampaignPrefetchContext,
): CampaignAssetPackage {
  switch (current) {
    case 'Berlin':
      return getClubAssetPackage(context.selectedCharacter, context.clubStoryCast);
    case 'Club':
      return getRhythmAssetPackage();
    case 'Rhythm':
      return getLevel4AssetPackage(context);
    case 'Level4':
      return getBossAssetPackage(context);
    case 'Boss':
      return getFinalAssetPackage(context.selectedCharacter);
  }
}

function connectionInfo(): { saveData?: boolean; effectiveType?: string } | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
}

function scheduleIdle(callback: () => void): void {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 750 });
  } else {
    window.setTimeout(callback, 0);
  }
}

/** Starts only after the caller declares its current scene playable. */
export function prefetchNextLevel(
  current: CampaignStage,
  context: Omit<CampaignPrefetchContext, 'selectedCharacter'> & {
    selectedCharacter?: CharacterDefinition;
  },
): void {
  scheduleIdle(() => {
    const started = performance.now();
    const selectedCharacter = context.selectedCharacter ?? getSelectedCharacter();
    const package_ = getCampaignAssetPackage(current, { ...context, selectedCharacter });
    const policy = getPrefetchPolicy(connectionInfo());
    if (import.meta.env.DEV) {
      console.debug(`[PREFETCH] ${current} → ${package_.stage} started (${policy})`);
    }
    void prefetchAssets(package_.critical).then((summary) => {
      if (!import.meta.env.DEV) return;
      console.debug(
        `[PREFETCH] ${package_.stage} critical complete +${Math.round(performance.now() - started)}ms; ` +
          `warmed ${summary.files} files / ${summary.bytes} bytes; failed ${summary.failed}`,
      );
    });
    if (policy === 'critical-only') return;
    void prefetchAssets(package_.full).then((summary) => {
      if (!import.meta.env.DEV) return;
      console.debug(
        `[PREFETCH] ${package_.stage} full complete +${Math.round(performance.now() - started)}ms; ` +
          `warmed ${summary.files} files / ${summary.bytes} bytes; failed ${summary.failed}`,
      );
    });
  });
}
