/**
 * THE FIRST READ ON THE CLOUD: what `serveFirstRead` (`@braindog/host/first-read`) is handed at `/auth/signup/read`,
 * so a stranger's sentence at sign-up can be read by the included model before there is an account.
 *
 * OFF AS SHIPPED, AND ONLY THE OPERATOR SWITCHES IT ON. Each reading is a model call that costs money, and a stranger's
 * words reach a model only after the operator's yes, so the door is `on` only where `FIRST_READ_DAILY` is a whole number
 * above 0: that number is both the operator's yes and the day's ceiling across every stranger. Unset or 0, the door answers 501 and the page reads by rules.
 * Even on, it reads nothing without the included model (`includedInference`), a reader (`readSetup`, handed in), a bot
 * check keyed by both Turnstile keys (`turnstile.ts`) and a place to count in (`MeterStore`); any one missing is the same 501.
 *
 * THE COUNT IS THE DIRECTORY'S. Six readings a day for one address and the ceiling for all are counted by key and UTC
 * day over `MeterStore`, which the Cloud hands as the Directory's `firstReadHit`; `store: null` keeps the door off.
 *
 * WHAT IS ON OFFER IS THE CATALOGUE'S: the use cases bundled with the shell, read once from the static assets
 * and merged over the ones compiled in (`catalogueOffer`), so the landlord who types "I rent out six flats" can be read
 * into Landlord. Without the assets, or with a catalogue that does not read, the compiled list, said once in the log.
 */

import { CATALOGUE_INDEX, readCatalogue } from '@braindog/declare/catalogue';
import { firstReadCasesRead, firstReadTold, type FirstReadCase, type FirstReadDoor, type FirstReadEntry } from '@braindog/host/first-read';
import type { Result } from '@braindog/ports';
import { AGENTS_PACK } from '@braindog/seed/packs';
import { MODULE_ORDER, USE_CASES } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';
import type { Inference, SetupAnswer, SetupAsk, SetupOffer } from '@braindog/slash';

import { assetsReader, type Assets } from './catalogue.ts';
import { includedInference, type SlashEnv } from './slash.ts';
import { turnstileSecret, turnstileVerify } from './turnstile.ts';

/** The reader: one model call over what was said and what is on offer, with no record, no owner and no ledger. */
export type ReadSetup = (ask: SetupAsk, inference: Inference) => Promise<Result<SetupAnswer>>;

/**
 * One count by key for one UTC day: one more, answering whether the count is still `most` or under. The host keeps it;
 * a key is an address or the day's one key for everybody, and is never logged.
 */
export type MeterStore = { hit(key: string, day: string, most: number): Promise<boolean> };

export type FirstReadEnv = SlashEnv & {
  /** The day's ceiling of readings for all strangers, and the operator's yes to them. Unset or 0 is off. */
  FIRST_READ_DAILY?: string | undefined;
  TURNSTILE_SECRET?: string | undefined;
  TURNSTILE_SITE_KEY?: string | undefined;
  /** The static assets, holding the catalogue bundled with the shell (`/catalogue/index.json`); absent in a test. */
  ASSETS?: Assets | undefined;
};

export type FirstReadDeps = {
  /** The page's own origin, `https://` and the public host. */
  origin: string;
  readSetup: ReadSetup | null;
  store: MeterStore | null;
  /** How the bot check leaves the Worker: `fetch`, a fake in tests. */
  send?: ((input: string, init: RequestInit) => Promise<Response>) | undefined;
  /** Where the one line about the catalogue goes: `console.warn`, a list in tests. */
  log?: ((line: string) => void) | undefined;
};

/** Readings one address may have in a UTC day. */
export const FIRST_READ_PER_ADDRESS = 6;

/** `FIRST_READ_DAILY` as a whole number above 0, or 0 for off: unset, 0, a fraction, a sign or a word. */
export function dailyOf(value: string | undefined): number {
  const s = (value ?? '').trim();
  if (!/^\d{1,9}$/u.test(s)) return 0;
  return Number(s);
}

/** Six for one address, then the day's ceiling: the address first, so one address spends nobody else's readings. */
export function meterOver(store: MeterStore, daily: number): FirstReadDoor['meter'] {
  return {
    take: async (ip, day) => {
      if (!(await store.hit(`address:${ip}`, day, FIRST_READ_PER_ADDRESS))) return 'address';
      if (!(await store.hit('all', day, daily))) return 'day';
      return 'ok';
    },
  };
}

/**
 * The bot check over `TURNSTILE_SECRET`, or `null` where it is unset: `turnstile.ts`'s one verify call, with one change:
 * unset is `null` here and not a pass, because this door must not read behind an open one. The caller hands the secret
 * only while both keys are set (`turnstileSecret`), so a half-keyed host has this door off rather than refusing every
 * reading the page cannot earn an answer for.
 */
export function turnstileCheck(secret: string | undefined, send: (input: string, init: RequestInit) => Promise<Response> = fetch): FirstReadDoor['botCheck'] {
  const key = (secret ?? '').trim();
  if (key === '') return null;
  return (answer, ip) => turnstileVerify(key, answer, ip, send);
}

/** The field types a typed sentence can fill, as the first run's own offer keeps them (`apps/web/src/lib/start/lists.ts`). */
const FILLABLE: ReadonlySet<string> = new Set(['text', 'email', 'url', 'enum', 'money', 'day', 'int', 'decimal', 'number', 'bool']);

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One module's lists, each with the fields a sentence can fill. */
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

/** The modules on offer, the same whatever the catalogue lists: the agents' lists by name only. */
const modulesOffer = (): SetupOffer['modules'] => firstReadOffer().modules;

/**
 * WHAT A STRANGER'S SENTENCE MAY BE READ INTO WHEN NO CATALOGUE READS: every use case and module this build serves, as
 * the first run's own screen offers them (`setupOffer` in `apps/web/src/lib/start/propose.ts`). The agents' lists are
 * offered by name only, since an agent writes what goes in them and a person's sentence about themselves does not.
 * Built once, as the build is fixed. Each case is told with the words it is heard in (`firstReadTold`).
 */
export function firstReadOffer(): SetupOffer {
  built ??= {
    usecases: builtInCases().map(firstReadTold),
    modules: MODULE_ORDER.map((id) => ({ id, name: moduleName(id), lists: id === AGENTS_PACK.manifest.id ? [] : listsOf(id) })),
  };
  return built;
}

/** The index's entries as read from the assets, or null where there is none or it does not read (`readCatalogue`). */
const entriesIn = (assets: Assets) => async (): Promise<readonly FirstReadEntry[] | null> => {
  const text = await assetsReader(assets)(CATALOGUE_INDEX);
  if (text === null) return null;
  const index = readCatalogue(JSON.parse(text));
  return index.ok ? index.value.entries : null;
};

/* One read per assets binding, kept for as long as this isolate lives; a test's stub is its own binding. */
const readOnce = new WeakMap<Assets, Promise<SetupOffer>>();
let bare: Promise<SetupOffer> | null = null;

/**
 * WHAT A STRANGER'S SENTENCE MAY BE READ INTO: the catalogue's use cases bundled with the shell, merged over the
 * build's (`firstReadOfferFrom`), so a front published as a file is offered at sign-up with no code change. Read lazily,
 * once, and kept. No assets, or a catalogue that does not read, is the build's list and one log line, never a 500.
 */
export function catalogueOffer(assets: Assets | undefined, log: (line: string) => void = (line) => console.warn(line)): Promise<SetupOffer> {
  const held = assets === undefined ? bare : readOnce.get(assets);
  if (held !== null && held !== undefined) return held;
  const built = builtInCases();
  const ids = new Set(built.map((c) => c.id));
  const reading = firstReadCasesRead(assets === undefined ? null : entriesIn(assets), built).then(({ cases, said }) => {
    if (said !== null) log(said);
    /* ONLY THE STARTERS THIS BUILD SHIPS (audit 31 Oct h, AH8, his call): the catalogue's other use cases are add-ons'
       fronts, and a stranger's sentence installs a starter and first-party modules, never Photographer for "clients".
       The catalogue's newer words for a built-in still stand. */
    return { usecases: cases.filter((c) => ids.has(c.id)).map(firstReadTold), modules: modulesOffer() };
  });
  if (assets === undefined) bare = reading;
  else readOnce.set(assets, reading);
  return reading;
}

/** The reader bound to one model, or `null` without either. A throw is the model not reached, with its real code kept. */
export function readerOver(readSetup: ReadSetup | null, model: Inference | undefined): FirstReadDoor['read'] {
  if (readSetup === null || model === undefined) return null;
  return async ({ said, offer, today }) => {
    const out = await readSetup({ said, offer: offer as SetupOffer, today }, model);
    if (out.ok) return { ok: true, value: out.value };
    /* A READING CHANGES NOTHING, so a conflict cannot come back; were one to, it is the model's answer not kept. */
    if (!('refusal' in out)) return { ok: false, refusal: { code: 'PROPOSAL_SCHEMA', fix: 'The reader answered something that is not a reading.' } };
    return { ok: false, refusal: { code: out.refusal.code, fix: out.refusal.fix } };
  };
}

/** The Cloud's door: off unless he set the ceiling, and reading nothing without a model, a reader, a check and a count. */
export function firstReadDoorOf(env: FirstReadEnv, deps: FirstReadDeps): FirstReadDoor {
  const daily = dailyOf(env.FIRST_READ_DAILY);
  const store = deps.store;
  return {
    origin: deps.origin,
    on: daily > 0 && store !== null,
    botCheck: turnstileCheck(turnstileSecret(env), deps.send),
    meter: store === null ? { take: async () => 'day' } : meterOver(store, daily),
    offer: () => catalogueOffer(env.ASSETS, deps.log),
    read: readerOver(deps.readSetup, includedInference(env)),
  };
}
