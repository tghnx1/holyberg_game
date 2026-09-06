import { getSceneAudioAssets } from '../../audio/gameAudioCatalog';
import type { ClubRuntimeAsset } from './ClubRuntimeAssetLoader';

export interface ClubOptionalAudioLoader {
  load(assets: readonly ClubRuntimeAsset[]): Promise<void>;
}

/**
 * Starts optional Club audio after the scene is usable.  This deliberately
 * does not return the loader promise: video/poster/player startup must never
 * wait for an MP3 download or decode. A later success can start music/SFX;
 * a failure is intentionally silent because audio is atmospheric.
 */
export function warmClubOptionalAudio(
  loader: ClubOptionalAudioLoader,
  onReady: () => void,
): void {
  const assets: ClubRuntimeAsset[] = getSceneAudioAssets('ClubScene').map((asset) => ({
    key: asset.key,
    url: asset.url,
    type: 'audio',
  }));
  void loader.load(assets).then(onReady, () => undefined);
}
