/**
 * THE FIRST READ ON THE CLOUD: what `serveFirstRead` (`@braindog/host/first-read`) is handed at `/auth/signup/read`,
 * so a stranger's sentence at sign-up can be read by the included model before there is an account (USE-B05 job 3).
 *
 * OFF AS SHIPPED, AND ONLY HE SWITCHES IT ON. Each reading is a model call that costs money, and a stranger's words reach
 * a model only after his yes, so the door is `on` only where `FIRST_READ_DAILY` is a whole number above 0: that number is
 * both his yes and the day's ceiling across every stranger. Unset or 0, the door answers 501 and the page reads by rules.
 * Even on, it reads nothing without the included model (`includedInference`), a reader (`readSetup`, handed in), a bot
 * check keyed by `TURNSTILE_SECRET` and a place to count in (`MeterStore`); any one missing is the same 501.
 *
 * THE COUNT IS THE DIRECTORY'S, AND IT HAS NONE YET. Six readings a day for one address and the ceiling for all are
 * counted by key and UTC day over `MeterStore`. The Directory has no count by key and day (`dir_fail` is the sign-in
 * lockout's fifteen minutes), so the Cloud hands `store: null` until the owner adds one, and the door stays off.
 */

import type { FirstReadDoor } from '@braindog/host/first-read';
import type { Result } from '@braindog/ports';
import { AGENTS_PACK } from '@braindog/seed/packs';
import { MODULE_ORDER, USE_CASES } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';
import type { Inference, SetupAnswer, SetupAsk, SetupOffer } from '@braindog/slash';

import { includedInference, type SlashEnv } from './slash.ts';

/** The reader: one model call over what was said and what is on offer, with no record, no owner and no ledger. */
export type ReadSetup = (ask: SetupAsk, inference: Inference) => Promise<Result<SetupAnswer>>;

/**
 * One count by key for one UTC day: one more, answering whether the count is still `most` or under. The host keeps it;
 * a key is an address or the day's one key for everybody, and is never logged.
 */
export type MeterStore = { hit(key: string, day: string, most: number): Promise<boolean> };

export type FirstReadEnv = SlashEnv & {
  /** The day's ceiling of readings for all strangers, and his yes to them. Unset or 0 is off. */
  FIRST_READ_DAILY?: string | undefined;
  TURNSTILE_SECRET?: string | undefined;
};

export type FirstReadDeps = {
  /** The page's own origin, `https://` and the public host. */
  origin: string;
  readSetup: ReadSetup | null;
  store: MeterStore | null;
  /** How the bot check leaves the Worker: `fetch`, a fake in tests. */
  send?: ((input: string, init: RequestInit) => Promise<Response>) | undefined;
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

/** Where Turnstile's answer is checked, as `start` checks it (`index.ts` `turnstilePassed`). */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * The bot check over `TURNSTILE_SECRET`, or `null` where it is unset. A COPY OF `start`'s CALL, which `index.ts` keeps to
 * itself, with one change: unset is `null` here and not a pass, because this door must not read behind an open one.
 * It fails closed on a malformed answer, Cloudflare unreachable, or anything but `success: true`.
 */
export function turnstileCheck(secret: string | undefined, send: (input: string, init: RequestInit) => Promise<Response> = fetch): FirstReadDoor['botCheck'] {
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

/**
 * WHAT A STRANGER'S SENTENCE MAY BE READ INTO: every use case and module this build serves, as the first run's own screen
 * offers them (`setupOffer` in `apps/web/src/lib/start/propose.ts`). The agents' lists are offered by name only, since an
 * agent writes what goes in them and a person's sentence about themselves does not. Built once, as the build is fixed.
 */
export function firstReadOffer(): SetupOffer {
  built ??= {
    usecases: USE_CASES.map((u) => ({ id: u.usecase, title: u.title, summary: u.summary })),
    modules: MODULE_ORDER.map((id) => ({ id, name: moduleName(id), lists: id === AGENTS_PACK.manifest.id ? [] : listsOf(id) })),
  };
  return built;
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
    botCheck: turnstileCheck(env.TURNSTILE_SECRET, deps.send),
    meter: store === null ? { take: async () => 'day' } : meterOver(store, daily),
    offer: async () => firstReadOffer(),
    read: readerOver(deps.readSetup, includedInference(env)),
  };
}
