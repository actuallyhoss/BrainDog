/**
 * How the person in front of this host runs a command, for every sentence that names one.
 *
 * `braindog init` WAS NAMED EVERYWHERE, and it is there for nobody who reads these sentences: the image has no
 * `braindog`, and an installed command line has no self-host beside it to spawn. The README runs this file with node,
 * and inside the image the way in is `docker compose run`, which works whether or not the server is up (it is not,
 * when the sentence is the one that stopped it).
 */

import { isAbsolute, relative } from 'node:path';
import { cwd, env } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Whether this process runs in the self-host image: the Dockerfile sets `BRAINDOG_IMAGE=1`, and nothing else does. */
export const inImage = (): boolean => env.BRAINDOG_IMAGE === '1';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

/** The command line that runs `main.ts <words>` from where the person is: through Compose in the image, with node elsewhere. */
export function commandFor(words: string): string {
  if (inImage()) return imageCommand(words);
  const near = relative(cwd(), MAIN);
  return `node ${near === '' || near.startsWith('..') || isAbsolute(near) ? MAIN : near} ${words}`;
}

/**
 * IN THE IMAGE, EACH COMMAND AS THE README GIVES IT (AI25). `docker compose run` for all of them printed a backup that
 * wrote into a throwaway container, a restore and an import that could not see a folder on the machine, and a serve
 * with no published port. A backup runs in the server that is up; a restore or an import mounts the folder read-only and
 * runs as root, then hands `/data` back to the server's user; serving is Compose's own.
 */
function imageCommand(words: string): string {
  const node = 'node apps/selfhost/src/main.ts';
  const [verb = '', ...rest] = words.trim().split(/\s+/u);
  if (verb === '' || (verb === 'serve' && rest.length === 0)) return 'docker compose up -d';
  if (verb === '--help') return `docker compose exec braindog ${node} --help`;
  /* AN OPERATOR'S INVITATION IS MADE IN THE SERVER THAT IS UP, with its key file and its settings. */
  if (verb === 'invite') return `docker compose exec braindog ${node} ${words.trim()}`;
  /* A BACKUP INSIDE THE VOLUME, where the README takes it from with `docker compose cp`. */
  if (verb === 'backup') return `docker compose exec braindog ${node} backup ${rest[0] === '<folder>' || rest.length === 0 ? '/data/backups' : rest.join(' ')}`;
  if (verb === 'restore')
    return `docker compose run --rm --user root -v "$HOME/braindog-backups/braindog-<time>:/restore:ro" braindog sh -c '${node} restore /restore && chown -R node:node /data'`;
  const from = rest.indexOf('--from');
  if (verb === 'init' && from !== -1) {
    const named = rest.slice(0, from).join(' ') || '<record name>';
    const after = rest.slice(from + 2).join(' ');
    return `docker compose run --rm --user root -v "$HOME/Downloads:/import:ro" braindog sh -c '${node} init ${named} --from /import/<file>.brainl${after ? ` ${after}` : ''} && chown -R node:node /data'`;
  }
  return `docker compose run --rm braindog ${node} ${words.trim()}`;
}

/**
 * The server key, `BRAINDOG_SERVER_KEY`, with the name it had before, `BRAINDOG_TOKEN`, still read when the new one is
 * not set, and which of the two said it, for a sentence about it.
 *
 * TWO NAMES BECAUSE THE OLD ONE IS THE COMMAND LINE'S TOO. To `braindog` on the same machine `BRAINDOG_TOKEN` is the
 * sign-in it calls with, so a `.env` sourced into a shell, or one variable exported for both, made the CLI call as the
 * server key, and an agent run as the owner. An existing `.env` keeps working.
 */
export function serverKeyOf(e: Record<string, string | undefined>): { value: string | undefined; name: string } {
  if (e.BRAINDOG_SERVER_KEY !== undefined) return { value: e.BRAINDOG_SERVER_KEY, name: 'BRAINDOG_SERVER_KEY' };
  return { value: e.BRAINDOG_TOKEN, name: 'BRAINDOG_TOKEN' };
}

/**
 * The interface to listen on, `BRAINDOG_LISTEN`, or the name it had before, `BRAINDOG_HOST`, only while that holds an
 * interface and not an address.
 *
 * TO THE COMMAND LINE `BRAINDOG_HOST` IS THE RECORD'S ADDRESS, such as `http://localhost:8080/home`, so one exported for
 * `braindog` reached this process as an interface to bind and failed it. An address with a scheme is never an interface,
 * so it is left to the command line it was set for.
 */
export function listenOf(e: Record<string, string | undefined>): string | undefined {
  if (e.BRAINDOG_LISTEN !== undefined && e.BRAINDOG_LISTEN.trim() !== '') return e.BRAINDOG_LISTEN.trim();
  const old = e.BRAINDOG_HOST?.trim();
  return old === undefined || old === '' || old.includes('://') ? undefined : old;
}

/**
 * The start's warning when a server key goes over plain http on every interface, or `null` when it does not.
 *
 * A KEY TURNS THE BIND WIDE, AND NOTHING TURNS TLS ON. With `BRAINDOG_SERVER_KEY` set and no certificate, the default
 * interface is every one (`::`) and the origin is `http:`, so the key, every bearer and the session cookie cross the
 * network in the clear to anybody on it, and `bd_s` at `localhost` is shared with every other port on the machine. It
 * is said at start rather than refused: a container behind its own proxy, or a machine alone on a trusted network, is
 * a real setup. An `https:` origin with no certificate here is a proxy in front, which is not this line's to judge.
 */
export function plainLine(o: { key: boolean; tls: boolean; listen: string | undefined; origin: string; image?: boolean; publish?: string | undefined }): string | null {
  if (!o.key || o.tls || !/^http:/iu.test(o.origin)) return null;
  const loop = (at: string): boolean => ['127.0.0.1', '::1', 'localhost'].includes(at.replace(/^\[|\]$/gu, '').toLowerCase());
  /* IN THE IMAGE THE BIND IS NOT THE OPERATOR'S TO NARROW (AI19): loopback inside a container is reachable from nowhere,
     and how far the port reaches is where Compose publishes it, `BRAINDOG_PUBLISH`, this machine alone unless set. */
  if (o.image === true) {
    const published = o.publish?.trim() ?? '';
    if (published === '' || loop(published)) return null;
    return `  plain http on your network (BRAINDOG_PUBLISH=${published}): the server key and the sign-in cookie cross it unencrypted to anybody on it. Set BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY, or put https in front and remove BRAINDOG_PUBLISH to keep the port on this machine.`;
  }
  if (loop(o.listen ?? '::')) return null;
  return '  plain http on every interface: the server key and the sign-in cookie cross the network unencrypted to anybody on it. Set BRAINDOG_TLS_CERT and BRAINDOG_TLS_KEY, serve it behind https on this machine, or set BRAINDOG_LISTEN=127.0.0.1.';
}

/**
 * The origin to serve at: `BRAINDOG_ORIGIN`, or, in the image, `http://localhost:<BRAINDOG_PORT>` when Compose publishes
 * the server on another port of the machine than the one it listens on inside. Undefined leaves `start` its own default,
 * `http://localhost:<port>`, and a certificate its names.
 *
 * READ FROM THE CODE: `docker-compose.yml` maps `${BRAINDOG_PORT}:8080`, and the origin stayed `http://localhost:8080`,
 * so the sign-in link and every passkey named a port nothing answered on, and a write from the page at the real port
 * carried an `Origin` this host refused. The `.env` that sets the port is the one the container reads.
 */
export function originOf(e: Record<string, string | undefined>, port: number, tls: boolean): string | undefined {
  if (e.BRAINDOG_ORIGIN !== undefined) return e.BRAINDOG_ORIGIN;
  /* `9090`, or `127.0.0.1:9090`, which Compose also takes there to publish on one interface: the port is the last part. */
  const published = /(?:^|:)(\d{1,5})$/u.exec(e.BRAINDOG_PORT?.trim() ?? '')?.[1];
  if (tls || e.BRAINDOG_IMAGE !== '1' || published === undefined || Number(published) === port) return undefined;
  return `http://localhost:${published}`;
}
