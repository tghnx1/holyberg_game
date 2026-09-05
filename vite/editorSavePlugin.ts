import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

/**
 * One dev-only save endpoint per editable config file, built from a table
 * rather than a hand-written plugin each time.
 *
 * Every editor in the game persists the same way — POST a JSON body, validate
 * it, write it to a checked-in config file — so the only things that actually
 * differ are the route, the target file, the validator and whether the result
 * replaces the file or merges into it. Registering an entry in
 * `EDITOR_SAVE_TARGETS` is all a new editable scene needs; there is no fourth
 * copy of this middleware to write.
 *
 * `apply: 'serve'` limits every one of them to `vite dev`, so they are absent
 * from `vite build` output and from `vite preview`, and the published game
 * stays a fully static bundle with no backend.
 */

/** Guards against a runaway or hostile body; the largest real config is ~25 kB. */
const MAX_BODY_BYTES = 2_000_000;

export interface EditorSaveTarget<T = unknown> {
  /** Log prefix, e.g. `level-editor`. */
  name: string;
  /** POST route the scene's save callback fetches. */
  route: string;
  /** Repository-relative file the validated payload is written to. */
  file: string;
  /** Throws with a human-readable reason if the body is not acceptable. */
  validate: (raw: unknown) => T;
  /**
   * Optional: merge the validated payload into the file's existing contents
   * instead of replacing it — used where one save only owns part of a file
   * (saving the club's lounge crowd must not wipe the corridor's).
   */
  merge?: (existing: unknown, incoming: T) => unknown;
  /** Extra detail for the success log and response. */
  describe?: (payload: T) => string;
}

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
 * Type-checks one row against its own payload type, then erases it so rows
 * with different payloads can share one array. The cast is the single place
 * that erasure happens; `validate` is still what proves the body's shape at
 * runtime, so nothing is trusted on the strength of the type alone.
 */
export function defineEditorSaveTarget<T>(target: EditorSaveTarget<T>): EditorSaveTarget<unknown> {
  return target as EditorSaveTarget<unknown>;
}

/**
 * Builds the complete file value before anything is written. A merged target
 * must validate both the incoming slice and every preserved sibling entry;
 * replacement targets still go through the same final validation path.
 */
export function buildEditorSaveOutput(
  target: EditorSaveTarget<unknown>,
  incoming: unknown,
  existingText?: string,
): unknown {
  const validatedIncoming = target.validate(incoming);
  const existing = target.merge
    ? JSON.parse(existingText ?? '{}') as unknown
    : undefined;
  const merged = target.merge ? target.merge(existing, validatedIncoming) : validatedIncoming;
  return target.validate(merged);
}

/** Writes JSON without ever truncating the currently valid file. */
export async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export function editorSavePlugin(targets: readonly EditorSaveTarget<unknown>[]): Plugin {
  return {
    name: 'holyberg-editor-save',
    apply: 'serve',
    configureServer(server) {
      for (const target of targets) {
        const file = resolve(server.config.root, target.file);

        server.middlewares.use(target.route, (request, response, next) => {
          if (request.method !== 'POST') return next();

          const send = (status: number, payload: Record<string, unknown>): void => {
            response.statusCode = status;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(payload));
          };

          void (async () => {
            try {
              const body = await readBody(request);
              const incoming = JSON.parse(body) as unknown;
              const existingText = target.merge ? await readFile(file, 'utf8') : undefined;
              const output = buildEditorSaveOutput(target, incoming, existingText);
              await writeJsonAtomically(file, output);
              const validated = target.validate(incoming);
              const detail = target.describe?.(validated) ?? '';
              server.config.logger.info(
                `[${target.name}] wrote ${detail ? `${detail} to ` : ''}${target.file}`,
              );
              send(200, { ok: true, file: target.file, detail });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              server.config.logger.error(`[${target.name}] save rejected: ${message}`);
              send(400, { ok: false, error: message });
            }
          })();
        });
      }
    },
  };
}
