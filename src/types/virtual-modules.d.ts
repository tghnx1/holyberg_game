/** Supplied at build time by vite/characterManifestPlugin.ts, not a file on disk. */
declare module 'virtual:holyberg-characters' {
  import type { CharacterDefinition } from '../game/characters/characterManifest';
  export const CHARACTER_MANIFEST: CharacterDefinition[];
  export default CHARACTER_MANIFEST;
}
