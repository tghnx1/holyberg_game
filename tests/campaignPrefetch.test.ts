import { describe, expect, it } from 'vitest';
import { getCharacter } from '../src/game/characters/characterRegistry';
import {
  getCampaignAssetPackage,
  getClubAssetPackage,
  getNextCampaignStage,
  summarizeResourceCache,
} from '../src/game/systems/campaignPrefetch';

const selected = getCharacter('atmos');
const context = {
  selectedCharacter: selected,
  profile: 'mobile' as const,
  // The small unit-test manifest has fewer playable characters than the real
  // repository; package construction only needs valid character ids.
  clubStoryCast: { dj1Id: 'klaus', barkeeperId: 'disus', dj3Id: 'klaus' },
};

describe('campaign package selection', () => {
  it('selects only the next logical stage', () => {
    expect(getNextCampaignStage('Berlin')).toBe('Club');
    expect(getNextCampaignStage('Club')).toBe('Rhythm');
    expect(getNextCampaignStage('Rhythm')).toBe('Level4');
    expect(getNextCampaignStage('Level4')).toBe('Boss');
    expect(getNextCampaignStage('Boss')).toBe('Final');
    expect(getCampaignAssetPackage('Club', context).stage).toBe('Rhythm');
  });

  it('deduplicates every canonical package URL', () => {
    for (const stage of ['Berlin', 'Club', 'Rhythm', 'Level4', 'Boss'] as const) {
      const package_ = getCampaignAssetPackage(stage, context);
      const urls = [...package_.critical, ...package_.full].map((entry) => entry.url);
      expect(new Set(urls).size).toBe(urls.length);
    }
  });

  it('makes Club room 1 independently cold-loadable without full character packages', () => {
    const package_ = getClubAssetPackage(selected, context.clubStoryCast);
    const critical = package_.critical.map((entry) => entry.url);
    expect(critical).toContain('assets/level_2/animation_1.mp4');
    expect(critical).toContain('assets/level_2/room_1_poster.webp');
    expect(critical.some((url) => url.includes('/level2/npcs/') && url.endsWith('/01.webp'))).toBe(
      true,
    );
    expect(critical.some((url) => url.includes('/gameplay/walk/'))).toBe(true);
    expect(critical.some((url) => url.includes('/gameplay/jump/'))).toBe(false);
  });

  it('uses profile-specific Level4 and Boss variants', () => {
    const level4 = getCampaignAssetPackage('Rhythm', context);
    const boss = getCampaignAssetPackage('Level4', context);
    expect(level4.critical.some((entry) => entry.url.endsWith('.mobile.webp'))).toBe(true);
    expect(boss.critical.some((entry) => entry.url.includes('/generated/boss/'))).toBe(true);
  });
});

describe('cache diagnostics', () => {
  it('reports observed cache hits without counting unknown resources', () => {
    const stats = summarizeResourceCache(
      ['a.webp', 'b.webp', 'c.webp'],
      [
        { name: 'https://game.test/a.webp', transferSize: 0, decodedBodySize: 100 },
        { name: 'https://game.test/b.webp', transferSize: 200, decodedBodySize: 150 },
        { name: 'https://game.test/unrelated.webp', transferSize: 0, decodedBodySize: 50 },
      ],
      'https://game.test/',
    );
    expect(stats).toEqual({ hits: 1, observed: 2, expected: 3 });
  });
});
