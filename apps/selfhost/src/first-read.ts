/**
 * THE FIRST READ ON A SELF-HOST: what `serveFirstRead` (`@braindog/host/first-read`) is handed at `/auth/signup/read`,
 * the same door the Cloud mounts, over this host's own model and a count kept in memory.
 *
 * OFF AS SHIPPED, AS ON THE CLOUD. The door is `on` only where this host has a model (`SLASH_ENDPOINT`, read by
 * `slashFromEnv`) and `FIRST_READ_DAILY` is a whole number above 0, the operator's yes to a stranger's words reaching that
 * model and the day's ceiling across them. It reads nothing without a reader (`readSetup`, handed in) and a bot check
 * keyed by `TURNSTILE_SECRET`; any one missing is a 501, and the page reads by rules.
 *
 * THE COUNT IS IN MEMORY AND STARTS OVER WITH THE PROCESS, which can only give strangers more of a day than it should
 * after a restart, never fewer; a self-host is one process, so one count holds every request it serves.
 *
 * WHAT IS ON OFFER IS THE CATALOGUE THIS HOST SERVES: the use cases in the folder it answers `/catalogue/`
 * from, read once and merged over the ones compiled in (`catalogueOffer`). No folder, or an index that does not read,
 * is the compiled list, said once in the log.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CATALOGUE_INDEX, readCatalogue } from '@braindog/declare/catalogue';
import { firstReadCasesRead, firstReadTold, type FirstReadCase, type FirstReadDoor, type FirstReadEntry } from '@braindog/host/first-read';
import { endpointInference } from '@braindog/host/slash';
import type { Result } from '@braindog/ports';
import { AGENTS_PACK } from '@braindog/seed/packs';
import { MODULE_ORDER, USE_CASES } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';
import type { Inference, SetupAnswer, SetupAsk, SetupOffer } from '@braindog/slash';

import { catalogueFolder } from './catalogue.ts';
import type { SlashConfig } from './slash.ts';

/** The reader: one model call over what was said and what is on offer, with no record, no owner and no ledger. */
export type ReadSetup = (ask: SetupAsk, inference: Inference) => Promise<Result<SetupAnswer>>;

type Send = (input: string | URL, init: RequestInit) => Promise<Response>;

export type SelfhostFirstReadDeps = {
  /** The origin this host serves its pages on. */
  origin: string;
  /** This host's model, as `slashFromEnv` read it, or `undefined` where it has none. */
  slash: SlashConfig | undefined;
  readSetup: ReadSetup | null;
  /** How a call leaves this host, to the model and to the bot check: `fetch`, a fake in tests. */
  send?: Send | undefined;
  /**
   * The catalogue folder this host serves at `/catalogue/` (`catalogueFolder`), or `null` for none. Left out, it is
   * the one the environment names (`firstReadFolder`).
   */
  catalogue?: string | null | undefined;
  /** Where the one line about the catalogue goes: `console.warn`, a list in tests. */
  log?: ((line: string) => void) | undefined;
};

/** Readings one address may have in a UTC day. */
export const FIRST_READ_PER_ADDRESS = 18;

/** `FIRST_READ_DAILY` as a whole number above 0, or 0 for off: unset, 0, a fraction, a sign or a word. */
export function dailyOf(value: string | undefined): number {
  const s = (value ?? '').trim();
  return /^\d{1,9}$/u.test(s) ? Number(s) : 0;
}

/**
 * Six for one address, then the day's ceiling, counted in memory for the UTC day the door names. The first count of a new
 * day drops the old one, so the count never holds more than a day of addresses.
 */
export function memoryMeter(daily: number): FirstReadDoor['meter'] {
  let today = '';
  const counts = new Map<string, number>();
  const hit = (key: string, most: number): boolean => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, Math.min(n, most + 1));
    return n <= most;
  };
  return {
    take: async (ip, day) => {
      if (day !== today) {
        today = day;
        counts.clear();
      }
      if (!hit(`address:${ip}`, FIRST_READ_PER_ADDRESS)) return 'address';
      if (!hit('all', daily)) return 'day';
      return 'ok';
    },
  };
}

/** Where Turnstile's answer is checked, as the Cloud's `start` checks it. */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The bot check over `TURNSTILE_SECRET`, or `null` where it is unset. Fails closed on anything but `success: true`. */
export function turnstileCheck(secret: string | undefined, send: Send = fetch): FirstReadDoor['botCheck'] {
  const key = (secret ?? '').trim();
  if (key === '') return null;
  return async (answer, ip) => {
    if (answer === '' || answer.length > 2048) return false;
    const form = new FormData();
    form.append('secret', key);
    form.append('response', answer);
    if (ip !== '') form.append('remoteip', ip);
    try {
      const res = await send(SITEVERIFY, { method: 'POST', body: form });
      const verdict = (await res.json().catch(() => null)) as { success?: unknown } | null;
      return verdict?.success === true;
    } catch {
      return false;
    }
  };
}

/** The field types a typed sentence can fill, as the first run's own offer keeps them (`apps/web/src/lib/start/lists.ts`). */
const FILLABLE: ReadonlySet<string> = new Set(['text', 'email', 'url', 'enum', 'money', 'day', 'int', 'decimal', 'number', 'bool']);

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

function listsOf(module: string): SetupOffer['modules'][number]['lists'] {
  const doc = moduleDocument(null, module, { today: '1970-01-01' });
  return (Array.isArray(doc?.declarations) ? (doc.declarations as unknown[]) : []).flatMap((d) => {
    if (!isMap(d) || typeof d.register !== 'string' || !Array.isArray(d.fields)) return [];
    const fields = (d.fields as unknown[]).flatMap((f) => (isMap(f) && typeof f.id === 'string' && typeof f.type === 'string' && FILLABLE.has(f.type) ? [f.id] : []));
    return [{ id: d.register, name: typeof d.name === 'string' ? d.name : d.register, fields }];
  });
}

let built: SetupOffer | null = null;

/** The use cases compiled into this build, with the words each is heard in and the modules it stands on. */
export const builtInCases = (): FirstReadCase[] =>
  USE_CASES.map((u) => ({ id: u.usecase, title: u.title, summary: u.summary, signals: [...u.signals], modules: [...u.modules] }));

/**
 * Every use case and module this build serves, as the first run's own screen offers them; the agents' lists by name only.
 * What is offered when no catalogue reads; each case told with the words it is heard in (`firstReadTold`).
 */
export function firstReadOffer(): SetupOffer {
  built ??= {
    usecases: builtInCases().map(firstReadTold),
    modules: MODULE_ORDER.map((id) => ({ id, name: moduleName(id), lists: id === AGENTS_PACK.manifest.id ? [] : listsOf(id) })),
  };
  return built;
}

/**
 * The folder this host serves its catalogue from, as the environment names it: `BRAINDOG_CATALOGUE`, else the bundled one
 * in `BRAINDOG_SHELL`, or `null`. Only what the environment says, never a guess at a build on disk, so a door built over
 * a given environment reads the same everywhere; the server hands the folder it serves (`deps.catalogue`) where it knows it.
 */
export function firstReadFolder(env: Record<string, string | undefined>): string | null {
  return catalogueFolder(env.BRAINDOG_CATALOGUE, env.BRAINDOG_SHELL) ?? null;
}

/** The folder's index entries, or null where it has no index or the index does not read (`readCatalogue`). */
const entriesIn = (dir: string) => async (): Promise<readonly FirstReadEntry[] | null> => {
  const index = readCatalogue(JSON.parse(await readFile(join(dir, CATALOGUE_INDEX), 'utf8')));
  return index.ok ? index.value.entries : null;
};

/**
 * WHAT A STRANGER'S SENTENCE MAY BE READ INTO: the use cases of the catalogue this host serves, merged over the
 * build's (`firstReadOfferFrom`), so a front the operator publishes into the folder is offered at sign-up with no code
 * change. The modules are the build's. No folder, or one whose index does not read, is the build's list and one log line.
 */
export async function catalogueOffer(dir: string | null, log: (line: string) => void = (line) => console.warn(line)): Promise<SetupOffer> {
  const { cases, said } = await firstReadCasesRead(dir === null ? null : entriesIn(dir), builtInCases());
  if (said !== null) log(said);
  return { usecases: cases.map(firstReadTold), modules: firstReadOffer().modules };
}

/**
 * This host's endpoint as the reader's model, on the operator's `SLASH_KEY` alone: a stranger has no key of their own and
 * opens no keychain, so no grant is read and none is signed.
 */
function modelOf(config: SlashConfig | undefined, send: Send): Inference | undefined {
  if (config === undefined) return undefined;
  const key = config.key;
  return endpointInference({
    url: config.url,
    model: config.model,
    key: async () => key ?? null,
    send: config.send ?? send,
    name: 'endpoint',
    ...(key === undefined ? {} : { keyName: "this host's SLASH_KEY" }),
  });
}

/** The self-host's door: off unless it has a model and the operator set the ceiling, and reading nothing without a check. */
export function selfhostFirstReadDoor(env: Record<string, string | undefined>, deps: SelfhostFirstReadDeps): FirstReadDoor {
  const daily = dailyOf(env.FIRST_READ_DAILY);
  const send = deps.send ?? fetch;
  const model = modelOf(deps.slash, send);
  const readSetup = deps.readSetup;
  /* READ LAZILY, ONCE, AND KEPT FOR THE PROCESS: the door is built once (`server.ts`), so the first sign-up reads it. */
  let offered: Promise<SetupOffer> | null = null;
  return {
    origin: deps.origin,
    on: daily > 0 && model !== undefined,
    botCheck: turnstileCheck(env.TURNSTILE_SECRET, send),
    meter: memoryMeter(daily),
    offer: () => (offered ??= catalogueOffer(deps.catalogue === undefined ? firstReadFolder(env) : deps.catalogue, deps.log)),
    read:
      readSetup === null || model === undefined
        ? null
        : async ({ said, offer, today, asked, quick }) => {
            const out = await readSetup({ said, offer: offer as SetupOffer, today, ...(asked === undefined ? {} : { asked }), ...(quick === true ? { quick } : {}) }, model);
            if (out.ok) return { ok: true, value: out.value };
            if (!('refusal' in out)) return { ok: false, refusal: { code: 'PROPOSAL_SCHEMA', fix: 'The reader answered something that is not a reading.' } };
            return { ok: false, refusal: { code: out.refusal.code, fix: out.refusal.fix } };
          },
  };
}
