/**
 * Warms video files into the browser's HTTP cache ahead of the scene that
 * needs them.
 *
 * Ownership is module-level on purpose. The whole point is to start a
 * download in one scene and still have it in flight in the next, so it cannot
 * belong to a Scene — a Scene's own state is torn down at SHUTDOWN, which is
 * exactly the moment the download must survive.
 *
 * Each element is detached (never added to a display list) and is never
 * played, so this only ever populates the cache: no second decoder runs
 * alongside whatever video is actually on screen. `muted` and `playsinline`
 * are set anyway, so nothing here can trip a mobile autoplay policy.
 */

const prefetched = new Map<string, HTMLVideoElement>();

/**
 * Starts (or joins) a background download of `url`. Calling it again for a
 * URL already being prefetched is a no-op, so a scene may call it freely on
 * every room change or restart without stacking up duplicate elements or
 * duplicate requests.
 */
export function prefetchVideo(url: string): void {
  if (typeof document === 'undefined' || prefetched.has(url)) return;
  const element = document.createElement('video');
  element.muted = true;
  element.defaultMuted = true;
  element.setAttribute('playsinline', 'playsinline');
  // `auto` is the hint that asks for the whole file rather than metadata.
  element.preload = 'auto';
  element.src = url;
  element.load();
  prefetched.set(url, element);
}

/**
 * Drops the detached element for `url`.
 *
 * Detaching the source aborts the request if it has not finished, so this
 * must only be called once the file is genuinely no longer needed from
 * *this* element — i.e. after the real player has taken the URL over and has
 * its own request running, or when leaving the level entirely. Releasing
 * while nothing else is fetching it would throw away an incomplete download
 * and force the next reader to start from cold.
 */
export function releasePrefetchedVideo(url: string): void {
  const element = prefetched.get(url);
  if (!element) return;
  prefetched.delete(url);
  element.removeAttribute('src');
  // Required after clearing src: it is what actually tears down the request
  // and lets the element be collected.
  element.load();
}

/** Test/debug helper: which URLs are currently held. */
export function getPrefetchedVideoUrls(): string[] {
  return [...prefetched.keys()];
}
