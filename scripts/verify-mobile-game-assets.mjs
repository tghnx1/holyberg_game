import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { stdout } from 'node:process';
import { getMobileGameAssets, outputPath, profiles, repoRoot } from './mobile-game-assets.mjs';

const missing = [];
let verified = 0;
for (const asset of await getMobileGameAssets()) {
  for (const profile of Object.keys(profiles)) {
    const publicPath = outputPath(asset, profile);
    const distPath = resolve(repoRoot, 'dist', relative(resolve(repoRoot, 'public'), publicPath));
    try {
      const file = await stat(distPath);
      if (!file.isFile() || file.size === 0) missing.push(publicPath);
      else verified += 1;
    } catch {
      missing.push(publicPath);
    }
  }
}

if (missing.length > 0) {
  throw new Error(`Build is missing mobile game assets:\n${missing.join('\n')}`);
}
stdout.write(`[mobile-assets] verified ${verified} generated URLs in dist\n`);
