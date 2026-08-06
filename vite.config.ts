import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { validateBerlinEntities } from './src/game/level/berlin/berlinLevelSchema';

const SAVE_ROUTE = '/__level-editor/save';
const LEVEL_FILE = 'src/game/level/berlin/berlinLevel.generated.json';
/** Guards against a runaway or hostile body; the real level is ~25 kB. */
const MAX_BODY_BYTES = 2_000_000;

function readBody(request: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) reject(new Error('payload too large'));
    });
    request.on('end', () => resolvePromise(body));
    request.on('error', reject);
  });
}

/**
 * Dev-only endpoint the layout editor posts to when you press P.
 *
 * `apply: 'serve'` limits it to `vite dev`, so it is absent from `vite build`
 * output and from `vite preview`, and the published game stays a fully static
 * bundle with no backend.
 */
function levelEditorSavePlugin(): Plugin {
  return {
    name: 'holyberg-level-editor-save',
    apply: 'serve',
    configureServer(server) {
      const target = resolve(server.config.root, LEVEL_FILE);

      server.middlewares.use(SAVE_ROUTE, (request, response, next) => {
        if (request.method !== 'POST') return next();

        const send = (status: number, payload: Record<string, unknown>): void => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(payload));
        };

        void (async () => {
          try {
            const body = await readBody(request);
            const entities = validateBerlinEntities(JSON.parse(body) as unknown);
            await writeFile(target, `${JSON.stringify(entities, null, 2)}\n`, 'utf8');
            server.config.logger.info(
              `[level-editor] wrote ${entities.length} entities to ${LEVEL_FILE}`,
            );
            send(200, { ok: true, entities: entities.length, file: LEVEL_FILE });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            server.config.logger.error(`[level-editor] save rejected: ${message}`);
            send(400, { ok: false, error: message });
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [levelEditorSavePlugin()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
