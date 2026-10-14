/**
 * The operator's gift (LCH-A12 job 2, "operator comp plan", H.822): `POST /account/ops/plan` gives a record Cloud or
 * Cloud Plus with no card, and takes it back in one call.
 *
 * `{ record, plan: 'hosted' | 'plus', note? }` WRITES THE RECORD'S BILLING ROW AS `comp`, with no Stripe customer, no
 * subscription and no price, then sets the plan the Directory meters it under. A `comp` row is never answered by the
 * ladder's `due`, so a gift never lapses and is never charged; no Stripe event finds it, because it names no customer.
 * A record that pays through Stripe is refused: its plan is Stripe's to end first.
 *
 * `{ record, plan: null }` TAKES THE GIFT BACK, through the same rule a cancel goes through (`fitsFree` in
 * `billing.ts`): one person on the record and no other free record of its owner's, and it goes back to Free with no row
 * at all, as a record nobody paid for. When it does not fit, nothing changes and the answer says why in one sentence.
 * The plan moves first and the row goes last, so a call cut between the two leaves a gift that is still marked as one.
 *
 * IT MAILS NOBODY AND FILES NOTHING. A gift is the operator's word to the owner, said however he says it; the record
 * learns its new plan as any plan change reaches it (`Record$.planMoved`, inside `setPlan`).
 *
 * GUARDED AS `/account/ops/invite` IS: 404 with no `PROVISION_KEY`, 401 naming the header on a wrong key or none, the
 * key compared in constant time (`sameKey`), JSON only. The key is never logged and never answered.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, so every decision here runs in a test over fakes; `index.ts` mounts it.
 */

import { sameKey } from '@braindog/host/auth';
import { httpStatus } from '@braindog/host';
import type { AccountUsage } from '@braindog/record/directory';
import type { Refusal, Result } from '@braindog/ports';

import type { MeteredPlan } from './billing.ts';
import { op } from './oplog.ts';

/** The most of a body this door reads: a record's name, a plan and a short note. */
const BODY_MAX = 4_096;

/** The longest note kept on the log line. */
const NOTE_MAX = 200;

/** The plans a gift may be, by the Directory's names: Cloud is `hosted`. */
export const GIFT_PLANS = ['hosted', 'plus'] as const;
export type GiftPlan = (typeof GIFT_PLANS)[number];

/** The sentence a record that pays through Stripe is refused with. */
export const PAYS_FIX = 'This record pays for Cloud. End that plan first.';

/** A billing row as this door reads it: the Directory's `BillingRow`, of which it needs these. */
export type GiftRow = { record: string; person: string; customer: string; subscription: string | null; state: string };

/**
 * What this door asks of the Directory's billing group. `set` with `state: 'comp'` and an empty customer is the gift's
 * row (LCH-A12 job 1); `unbill` removes a `comp` row and nothing else.
 */
export type GiftCall =
  | { op: 'of'; record: string }
  | { op: 'set'; row: { record: string; person: string; customer: ''; subscription: null; price: null; period_end: null; state: 'comp' } }
  | { op: 'unbill'; record: string };

/** What each of those answers. */
export type GiftAnswers = { of: GiftRow | null; set: Result<unknown>; unbill: Result<unknown> };

/** What `index.ts` hands the door. Every one is a function, so a test builds it over fakes. */
export type OpsPlanDeps = {
  /** The record the operator named, by its name or its id, with who owns it; `null` when there is none open. */
  find: (name: string) => Promise<{ record: string; owner: string } | null>;
  /** The Directory's billing group. */
  billing: <C extends GiftCall>(call: C) => Promise<GiftAnswers[C['op']]>;
  /** The plan the Directory meters the record under, and the record's own word of it. `null` is set. */
  setPlan: (record: string, plan: MeteredPlan) => Promise<Refusal | null>;
  /** How many people are on the record, suspended ones left out, or `null` when it cannot say. */
  people: (record: string) => Promise<number | null>;
  /** The open records this person owns, from the Directory's usage ledger, with the plan each is on. */
  owned: (person: string) => Promise<Result<AccountUsage['records']>>;
};

export type OpsPlanEnv = { PROVISION_KEY?: string | undefined };

const json = (body: unknown, status: number, extra: [string, string][] = []): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: [['content-type', 'application/json; charset=utf-8'], ['cache-control', 'no-store'], ...extra],
  });

const refuse = (refusal: Refusal): Response => json({ ok: false, refusal }, httpStatus({ ok: false, refusal }));

const SHAPE = "/account/ops/plan takes { record, plan: 'hosted' | 'plus' | null, note? } as JSON.";

/**
 * `POST /account/ops/plan`: a gift given or taken back. Answers `{ record, plan, gift }`, the record as the operator
 * named it, the plan it is now metered under, and whether that is a gift.
 */
export async function opsPlan(request: Request, env: OpsPlanEnv, deps: OpsPlanDeps): Promise<Response> {
  const key = (env.PROVISION_KEY ?? '').trim();
  if (key === '') return refuse({ code: 'ROUTE_UNKNOWN', fix: 'This BrainDog has no operator key, so it has no operator doors.' });
  if (request.method !== 'POST')
    return json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: '/account/ops/plan is written with POST.' } }, 405, [['allow', 'POST']]);
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (bearer === '' || !(await sameKey(bearer, key)))
    return json({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This route takes the operator key.', at: 'authorization' } }, 401);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json'))
    return refuse({ code: 'BODY_MALFORMED', fix: SHAPE });
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, BODY_MAX));
  } catch {
    body = null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return refuse({ code: 'BODY_MALFORMED', fix: SHAPE });
  const said = body as Record<string, unknown>;
  const name = typeof said['record'] === 'string' ? said['record'].trim() : '';
  if (name === '') return refuse({ code: 'REQUIRED_MISSING', fix: 'Name the record the plan is for, by its name.', at: 'record' });
  const plan = said['plan'];
  if (plan !== null && !(GIFT_PLANS as readonly unknown[]).includes(plan))
    return refuse({ code: 'ENUM_VALUE_UNKNOWN', fix: "A gift is the plan 'hosted' (Cloud) or 'plus' (Cloud Plus), and null takes it back.", at: 'plan', allowed: [...GIFT_PLANS] });
  const note = typeof said['note'] === 'string' && said['note'].trim() !== '' ? said['note'].trim().slice(0, NOTE_MAX) : null;

  const found = await deps.find(name);
  if (found === null) return refuse({ code: 'OUT_OF_BOUNDS', fix: `There is no open record called ${name.slice(0, 64)}.`, at: 'record' });
  const row = await deps.billing({ op: 'of', record: found.record });
  const out = plan === null ? await takeBack(deps, found.record, row) : await give(deps, found, row, plan as GiftPlan);
  if (!out.ok) {
    op({ op: 'ops.plan', rec: found.record, ok: false, code: out.refusal.code });
    return refuse(out.refusal);
  }
  op({ op: 'ops.plan', rec: found.record, ok: true, plan: out.plan, gift: out.gift, ...(note !== null ? { note } : {}) });
  return json({ ok: true, value: { record: name, plan: out.plan, gift: out.gift } }, 200);
}

type Done = { ok: true; plan: MeteredPlan; gift: boolean } | { ok: false; refusal: Refusal };

const failed = (r: Result<unknown>): Refusal =>
  !r.ok && 'refusal' in r && r.refusal !== undefined ? r.refusal : { code: 'RECORD_UNAVAILABLE', fix: 'The Directory did not take the change. Try again in a minute.' };

/**
 * A gift given: the `comp` row first, then the plan. A row that names a subscription pays through Stripe and is
 * refused, a lapsed one too, since a gift is not the way out of a lapse; a row back on Free, or a gift already given,
 * is written over. A plan refused after the row is written leaves the gift marked, and the call asked again sets it.
 */
async function give(deps: OpsPlanDeps, found: { record: string; owner: string }, row: GiftRow | null, plan: GiftPlan): Promise<Done> {
  if (row?.state === 'lapsed')
    return { ok: false, refusal: { code: 'ALREADY_KNOWN', fix: 'This record lapsed on a paid plan, and a gift does not end a lapse. Paying again does.', at: 'record' } };
  if (row !== null && row.subscription !== null) return { ok: false, refusal: { code: 'ALREADY_KNOWN', fix: PAYS_FIX, at: 'record' } };
  const person = row?.person ?? found.owner;
  const written = await deps.billing({
    op: 'set',
    row: { record: found.record, person, customer: '', subscription: null, price: null, period_end: null, state: 'comp' },
  });
  if (!written.ok) return { ok: false, refusal: failed(written) };
  const refused = await deps.setPlan(found.record, plan);
  if (refused !== null) return { ok: false, refusal: refused };
  return { ok: true, plan, gift: true };
}

/**
 * A gift taken back: Free when the record fits it, as `fitsFree` in `billing.ts` reads it (one person on it, and no
 * other free record of its owner's), else refused with the reason. Only a `comp` row is taken back: a record with no
 * row has no gift, and one with a Stripe row is Stripe's.
 */
async function takeBack(deps: OpsPlanDeps, record: string, row: GiftRow | null): Promise<Done> {
  if (row === null || row.state !== 'comp') {
    if (row !== null && row.subscription !== null) return { ok: false, refusal: { code: 'ALREADY_KNOWN', fix: PAYS_FIX, at: 'record' } };
    return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'This record has no gift to take back.', at: 'record' } };
  }
  const people = await deps.people(record);
  if (people === null)
    return { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'Nobody could count the people on this record just now, so it keeps its gift. Try again in a minute.' } };
  if (people !== 1)
    return {
      ok: false,
      refusal: { code: 'OUT_OF_BOUNDS', fix: `Free is for one person and this record has ${String(people)}, so it keeps its gift until it has one.`, at: 'record' },
    };
  const owned = await deps.owned(row.person);
  if (!owned.ok) return { ok: false, refusal: failed(owned) };
  if (owned.value.some((r) => r.record !== record && !r.closed && r.plan === 'free'))
    return { ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Its owner already has a record on Free, so this one keeps its gift.', at: 'record' } };
  const refused = await deps.setPlan(record, 'free');
  if (refused !== null) return { ok: false, refusal: refused };
  /* `undefined` IS A DIRECTORY THAT KNOWS NO `unbill`; a refusal is its own, said as it said it. */
  const removed = await deps.billing({ op: 'unbill', record });
  if ((removed as Result<unknown> | undefined) === undefined)
    return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'The record is on Free, and this build cannot remove the gift from its billing yet. Ask again once it can.' } };
  if (!removed.ok) return { ok: false, refusal: failed(removed) };
  return { ok: true, plan: 'free', gift: false };
}
