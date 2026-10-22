/**
 * Who is connected, in three plain parts: the app ("Claude Code", "ChatGPT"), where it runs ("Studio", or the site it
 * came from) and how it came in (signed in, or a key somebody made), with how long it has gone unused (AGT-A06).
 *
 * PURE, SO `node --test` CAN IMPORT IT, for the reason `device.ts` gives.
 *
 * THE TOKEN'S `client` IS READ FIRST, because it is the one fact the door proved rather than one an app said of itself:
 * the kernel stamps it when the token is minted (`TokenClient` in `packages/kernel/src/token.ts`). A host older than
 * the stamp answers no `client`, and that token reads as it did before: a machine by its newest run, a key by its label.
 */

import { copy } from '../copy.ts';
import { reportKeyOf, type Connection } from './device.ts';
import { machineSaid } from './machine-name.ts';
import { AGENT_NAMES, APP_NAMES as RUN_APPS } from './names.ts';

/** How the app holding a token came to have it, as the kernel stamps it. Read off the wire, so checked here. */
export type SeenClient = { id: string; kind: 'cimd' | 'dcr' | 'device' | 'key'; host: string | null };

const KINDS: readonly SeenClient['kind'][] = ['cimd', 'dcr', 'device', 'key'];

/** A token's `client` as it came, or `null` for none, an older host's absent one included, and for anything misshapen. */
export function clientOf(raw: unknown): SeenClient | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as { id?: unknown; kind?: unknown; host?: unknown };
  if (typeof c.id !== 'string' || !KINDS.includes(c.kind as SeenClient['kind'])) return null;
  const host = typeof c.host === 'string' && c.host.trim() !== '' ? c.host.trim() : null;
  return { id: c.id, kind: c.kind as SeenClient['kind'], host };
}

/**
 * THE APPS A PERSON KNOWS BY NAME, by the host they sign in from or the word they call themselves: the run's own table
 * (`names.ts`, `claude-code` and the rest) and the sites and ids an app's sign-in carries. One missing from here is said
 * as its host, never as its id.
 */
export const APP_NAMES: Readonly<Record<string, string>> = {
  ...RUN_APPS,
  'claude.ai': 'Claude',
  'claude.com': 'Claude',
  'claude-desktop': 'Claude',
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'cursor.com': 'Cursor',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
};

const named = (key: string): string | null => (Object.hasOwn(APP_NAMES, key) ? (APP_NAMES[key] ?? null) : null);

/** A host as a person reads it: no port, no `www.`, lower case. */
const bareHost = (host: string): string => host.toLowerCase().replace(/:\d+$/u, '').replace(/^www\./u, '');

/** The app a host names, its own name or the site's it sits under (`app.cursor.com` is Cursor), or `null`. */
function hostApp(host: string): string | null {
  const labels = bareHost(host).split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const app = named(labels.slice(i).join('.'));
    if (app) return app;
  }
  return null;
}

/**
 * The app an id names in a word the table holds (`claude-code` in a metadata document's address), or `null`. The words
 * without a dot only, as whole words, so `codex` is never found inside some other name; the longest is tried first.
 */
function idApp(id: string): string | null {
  const said = id.toLowerCase();
  const words = Object.keys(APP_NAMES).filter((k) => !k.includes('.')).sort((a, b) => b.length - a.length);
  for (const word of words) {
    const at = said.indexOf(word);
    if (at < 0) continue;
    const before = said[at - 1];
    const after = said[at + word.length];
    if ((before === undefined || !/[a-z0-9]/u.test(before)) && (after === undefined || !/[a-z0-9]/u.test(after))) return named(word);
  }
  return null;
}

/** The app a run said it ran in (`claude-code 2.1.4`), else the kind of agent it is (`claude`), or `null`. */
function runApp(c: Connection): string | null {
  const client = c.run?.client?.trim().toLowerCase().split(/[\s/]/u)[0] ?? '';
  const agent = c.run?.agent ?? null;
  return (client && named(client)) || (agent !== null && Object.hasOwn(AGENT_NAMES, agent) ? (AGENT_NAMES[agent] ?? null) : null);
}

/**
 * The app a machine's stamp names: the agent word the command signed in for (`claude`), else, for `braindog`, the
 * command itself. Read whole and never searched, since the id is the command's own word and not an address.
 */
function deviceApp(id: string): string | null {
  const word = id.trim().toLowerCase();
  if (named(word)) return named(word);
  if (Object.hasOwn(AGENT_NAMES, word)) return AGENT_NAMES[word] ?? null;
  return word === 'braindog' ? copy.theCommand : null;
}

/** The three parts, and whole days since it was last used when that is more than a week. */
export type Parts = { app: string; where: string | null; how: 'signed in' | 'a key you made' | 'this machine'; idle: number | null };

/** More than this many days unused, and the row says so. */
export const IDLE_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * What a connection is, in three parts.
 *
 * A MACHINE IS WHAT RUNS ON IT, from the newest run its key opened, on the name the machine gave at sign-in, else the
 * host its run said. With no machine name the label it signed in with stands, as it did before. An app that signed in
 * at the address is the app its id or host names, else the name it registered, else its host. A key is its label.
 * `this machine` is an app that signed in from this computer's own loopback, so there is no site to name.
 */
export function partsOf(c: Connection, nowMs: number = Date.now()): Parts {
  const used = c.used === null ? Number.NaN : Date.parse(c.used);
  const days = Number.isNaN(used) ? 0 : Math.floor((nowMs - used) / DAY_MS);
  const idle = c.live && days > IDLE_DAYS ? days : null;
  const label = c.token?.label ?? null;
  const report = reportKeyOf(label);
  if (report) return { app: copy.reportKeyNamed(report.name), where: null, how: 'a key you made', idle };
  const client = clientOf(c.token?.client);
  if (c.machine || client?.kind === 'device') {
    const host = (client?.kind === 'device' ? client.host : null) ?? c.run?.host ?? null;
    const where = host === null ? null : machineSaid(host);
    const agent = runApp(c) ?? (client?.kind === 'device' ? deviceApp(client.id) : null);
    const app = where !== null && agent !== null ? agent : (c.machine?.label ?? label ?? agent ?? copy.unnamedMachine);
    return { app, where, how: 'signed in', idle };
  }
  if (client && (client.kind === 'cimd' || client.kind === 'dcr')) {
    const where = client.host === null ? null : bareHost(client.host);
    const app = idApp(client.id) ?? (where === null ? null : hostApp(where)) ?? label ?? where ?? copy.unnamedApp;
    return { app, where, how: where === null ? 'this machine' : 'signed in', idle };
  }
  return { app: label ?? copy.unnamedKey, where: null, how: 'a key you made', idle };
}

/**
 * The quieter line under a connection's name: where it runs and how it came in, as one sentence.
 *
 * A KEY SOMEBODY ELSE MADE IS "A KEY", because the facts beside it already say whose, and "a key you made" over a
 * colleague's name would be untrue.
 */
export function lineOf(c: Connection, parts: Parts = partsOf(c)): string {
  if (parts.how === 'a key you made') return typeof c.token?.person_name === 'string' ? copy.connectedKey : copy.connectedKeyYours;
  if (parts.how === 'this machine') return copy.connectedHere;
  if (parts.where === null) return copy.connectedSignedIn;
  return c.machine || clientOf(c.token?.client)?.kind === 'device' ? copy.connectedOn(parts.where) : copy.connectedFrom(parts.where);
}
