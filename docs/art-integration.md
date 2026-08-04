# Art integration

Gameplay uses stable art-slot keys rather than filenames. The complete registry is `ArtSlotRegistry.ts`, covering five backgrounds, player run/jump/fall/crouch/hurt states, all obstacles, collectibles, NPCs, and backstage finish art.

To replace a placeholder, preload an image, spritesheet, or atlas frame under the exact slot key (for example `obstacle.scooter` or `collectible.usb`). `PlaceholderFactory` checks Phaser's texture manager for that key and uses it when available; otherwise it keeps the procedural colored fallback. Keep the configured logical width, height, origin, and independent hitbox unchanged when replacing art.

Store production files under `public/assets/berlin/<category>/<name>.png` (or an equivalent atlas path) and preload them in `BootScene` with the registry key. Entity art uses a centered origin `(0.5, 0.5)` and is scaled to the configured logical `width × height`; background art should also use the section dimensions in the 1280×720 logical coordinate system. Do not bake screen density, safe-area offsets, or physics padding into source artwork.

Player animation slots are reserved as `player.run`, `player.jump`, `player.fall`, `player.crouch`, and `player.hurt`. Background section slots are `background.apartment`, `background.street`, `background.bridge`, `background.night`, and `background.club`.

Visible images are children of artwork containers. Physics zones are separate invisible Phaser objects built from the same config entry, so changing a texture or its visual treatment never changes collision behavior.
