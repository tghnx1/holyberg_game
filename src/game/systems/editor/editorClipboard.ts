/**
 * Unique-id generation for duplicated items, kept pure so the naming rule is
 * testable and identical for every scene that supports cloning.
 *
 * Pasting the same source repeatedly must never collide with an id already in
 * the scene, including ids produced by earlier pastes in the same session.
 */
export function uniqueEditorId(
  base: string,
  taken: ReadonlySet<string>,
  startingSuffix = 0,
): string {
  let candidate = `${base}-copy`;
  let suffix = startingSuffix;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-copy-${suffix}`;
  }
  return candidate;
}

/** Where a pasted copy lands relative to its original, in world px. */
export const PASTE_OFFSET = 40;
