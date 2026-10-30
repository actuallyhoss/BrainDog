/**
 * Whether the image holds a file that is somebody's secret: a backup, a key file, a record, an inbound mail token or a
 * `.env`. Each of these lives in the data volume or on the operator's machine, and one that reached an image layer is in
 * every copy of that image, wherever it is pushed or pulled.
 *
 * THE SAME LIST AS `.dockerignore`, read from the other end. The ignore file keeps these out of the build context; this
 * walks the tree the image runs from and stops if one got in anyway: a `.dockerignore` edited or lost, an image built
 * from another context, a file copied in by a later `RUN`. The Dockerfile runs it right after `COPY . .`, so the build
 * fails before anything is installed, and `main.ts` runs it at every start inside the image, so an image built before
 * the check refuses to serve.
 *
 * NEVER OUTSIDE THE IMAGE. A checkout on a developer's machine holds `.env` beside `docker-compose.yml` and test copies
 * of records, which are where they belong there. `BRAINDOG_IMAGE=1` is set by the Dockerfile and by nothing else.
 *
 *   node apps/selfhost/src/baked.ts      exits 1 with the files named, or 0
 */

import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { argv, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

/** The repository root the image runs from, `/app` in the image. */
export const APP_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Folders the walk never enters: installed packages and the app's generated build state hold nobody's data. */
const SKIP = new Set(['node_modules', '.git', '.svelte-kit', '.wrangler']);

/** Folder names that are a backup, whatever is in them. */
const BACKUP_DIR = /^(?:backups|braindog-backups|braindog-2\d{7}T\d{6}Z)$/u;

/** File names that are a secret by name. */
const NAMED = new Set(['inbound.token', 'kek', 'kek.prev', 'claim-link', '.env', '.dev.vars']);

/** Whether a file of this name is somebody's secret or data, as `.dockerignore` reads it. */
export function secretFile(name: string): boolean {
  if (NAMED.has(name) || name.startsWith('.env.')) return true;
  if (/\.sqlite(?:-[a-z]+)?$/u.test(name)) return true;
  return ['.brain', '.brainl', '.brainl.age', '.pem', '.key'].some((end) => name.endsWith(end));
}

/**
 * The secrets under `root`, as paths from it, at most `most` of them. `keep` names folders and files that are this
 * process's own data and are left alone even when they sit under `root` (a `BRAINDOG_DATA` set inside the app folder).
 */
export function bakedSecrets(root: string, keep: readonly string[] = [], most = 12): string[] {
  const kept = keep.map((p) => resolve(p));
  const isKept = (path: string): boolean => kept.some((k) => path === k || path.startsWith(`${k}${sep}`));
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= most) return;
      const path = join(dir, entry.name);
      if (isKept(path)) continue;
      if (entry.isDirectory()) {
        if (BACKUP_DIR.test(entry.name)) found.push(`${relative(root, path)}/`);
        else if (!SKIP.has(entry.name)) walk(path);
      } else if (secretFile(entry.name)) found.push(relative(root, path));
    }
  };
  walk(resolve(root));
  return found;
}

/** The sentence that stops a build or a start. It names the files and never reads one. */
export function bakedSaid(found: readonly string[]): string {
  return (
    `This image holds files that belong in the data volume or on your machine, never in an image: ${found.join(', ')}. ` +
    'They came in with the build folder. Delete this image (docker image rm braindog), move them out of the repository folder ' +
    '(a backup goes outside it, as apps/selfhost/README.md says under Backups), and build again. ' +
    'Anybody who pulled this image has them, so treat each key and token in them as seen and change it.'
  );
}

/* RUN AS A SCRIPT BY THE DOCKERFILE, over the tree it just copied. */
if (argv[1] !== undefined && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  const found = bakedSecrets(APP_ROOT);
  if (found.length > 0) {
    stderr.write(`${bakedSaid(found)}\n`);
    exit(1);
  }
}
