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
  if (inImage()) return `docker compose run --rm braindog node apps/selfhost/src/main.ts ${words}`;
  const near = relative(cwd(), MAIN);
  return `node ${near === '' || near.startsWith('..') || isAbsolute(near) ? MAIN : near} ${words}`;
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
