/**
 * Money, lived: the steps a person takes on a fresh record, each with the figures that must be read after it (REC-B01
 * build 5, and D2 of `loop/scope/area-record-b.md`).
 *
 * WHY A SCRIPT AND NOT ANOTHER TEST. Every gate read a record somebody wrote by hand, and his own stood still for ten
 * days while all of them stayed green. This is the other way round: a record made by signing up, then used one verb at a
 * time through the same doors an agent client uses, and read through them. Every later Money unit adds its steps here
 * (rates, balances' ages, filing, the forecast), so the list grows into the whole of Money as a person meets it.
 *
 * THE SHAPE A RUNNER RUNS. `liveMoney(lived)` takes the record's own verbs (`LivedApi`, the methods `createRecordApi` in
 * `packages/record` answers, which `openLived` in `tools/gates/lived.mjs` hands back as `api`), the owner to act as and
 * the record's today, runs each step, and returns every read as `Heard`, one line each with `quote`, for a note or a
 * report. A refused verb throws with the record's own words. A figure that is refused, such as one not declared yet, is
 * heard as refused and does not hold.
 *
 * SIGN-UP IS THE RUNNER'S. The proof area's runner signs up through the public door with a real agent client and passes
 * its own `signUp`. Without one, `signUpHere` does what sign-up provisions, in this process: the record named, then
 * BrainDog's modules installed as a person installs them, planned and approved, with none of their example rows. That is
 * what `lived.mjs` does in its first hour (`setUp`).
 *
 * NOTHING HERE IS ANYBODY'S. The names and amounts are made up, and the steps are what any person does (DIRECTION 27).
 */

import { FIRST_PARTY, firstPartyDocument } from '../src/packs-entry.ts';

/** What a verb of the record answers. */
export type Said = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
/** Who acts: the person who signed up, as the record's owner. */
export type As = { principal: { kind: 'person'; id: string; level: 'owner' } };

/** The record's verbs the steps use, as `createRecordApi` answers them and an agent client calls them. */
export type LivedApi = {
  createRecord(args: { id: string; slug: string; name: string; tz: string; locale: string; owner: { id: string } }): Promise<Said>;
  planPack(args: { doc: unknown; source: { kind: 'local' } }, as: As): Promise<Said>;
  installPack(args: { doc: unknown; source: { kind: 'local' }; planHash: string; approve?: readonly string[] }, as: As): Promise<Said>;
  setPackConfig(args: { id: string; values: Record<string, unknown> }, as: As): Promise<Said>;
  create(args: { register: string; fields: Record<string, unknown> }, as: As): Promise<Said>;
  metric(args: { metric: string }, as: As): Promise<Said>;
};

/** A record to live in: its verbs, its owner, its today as `2026-09-03`, and the runner's own sign-up when it has one. */
export type Lived = { api: LivedApi; as: As; today: string; signUp?: (lived: Lived) => Promise<void> };

/** A figure read after a step: its id, what it must say in words, and whether a value says it. */
export type Read = { figure: string; want: string; holds: (value: number | null) => boolean };
export type Step = { say: string; act: (lived: Lived) => Promise<void>; reads: Read[] };
/** One read as it was heard: the step, the figure, what it said, and whether that holds. */
export type Heard = { step: string; figure: string; value: number | null; unit: string | null; want: string; holds: boolean; refused?: string };

/** A verb's value, or a throw naming the step and the record's own words. */
const said = (r: Said, step: string): unknown => {
  if (r.ok) return r.value;
  throw new Error(`Money, lived, could not ${step}: ${r.refusal?.code ?? 'refused'}, ${r.refusal?.fix ?? ''}`);
};

/** The made-up person who signs up, and the record they make. */
const PERSON = 'p_lived_money';
export const OWNER: As = { principal: { kind: 'person', id: PERSON, level: 'owner' } };

/** Sign-up as it provisions a record, in this process: named, then BrainDog's modules with none of their example rows. */
export async function signUpHere(lived: Lived): Promise<void> {
  said(await lived.api.createRecord({ id: 'rec_01J9MNYM1VEDMNEY0000000000', slug: 'money-lived', name: 'Money, lived', tz: 'Europe/London', locale: 'en-GB', owner: { id: PERSON } }), 'sign up');
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const plan = said(await lived.api.planPack({ doc, source: { kind: 'local' } }, lived.as), `plan the ${id} module`) as { diff: { planHash: string; approve?: string[] } };
    const approve = plan.diff.approve === undefined ? {} : { approve: plan.diff.approve };
    said(await lived.api.installPack({ doc, source: { kind: 'local' }, planHash: plan.diff.planHash, ...approve }, lived.as), `install the ${id} module`);
  }
}

const is = (n: number): Read['holds'] => (v) => v === n;
const nothingYet: Read['holds'] = (v) => v === null || v === 0;

/** Money's signs of life, as a fresh record with two accounts and no ledger must read them. */
const SIGNS_FRESH: Read[] = [
  { figure: 'ledger-rows-7d', want: '0: nothing has been filed this week', holds: is(0) },
  { figure: 'ledger-newest-days', want: 'nothing: there is no row to be old', holds: (v) => v === null },
  { figure: 'uncategorised-share-30d', want: 'nothing or 0: there is no row to lack a category', holds: nothingYet },
  { figure: 'currencies-held', want: '2: the accounts are kept in pounds and dollars', holds: is(2) },
];

export const MONEY_LIVED: Step[] = [
  {
    say: 'sign up',
    act: async (lived) => (lived.signUp ?? signUpHere)(lived),
    reads: [
      { figure: 'currencies-held', want: '0: no account is kept yet', holds: is(0) },
      { figure: 'ledger-rows-7d', want: '0: nothing has been filed', holds: is(0) },
    ],
  },
  {
    say: 'set the home currency to pounds',
    act: async (lived) => void said(await lived.api.setPackConfig({ id: 'money-core', values: { home_currency: 'GBP' } }, lived.as), 'set the home currency'),
    reads: [{ figure: 'currencies-held', want: '0: a home currency is not an account', holds: is(0) }],
  },
  {
    say: 'add an account in pounds',
    act: async (lived) =>
      void said(await lived.api.create({ register: 'accounts', fields: { name: 'Everyday account', kind: 'bank', balance: { amount: 245_000, currency: 'GBP' }, as_of: lived.today } }, lived.as), 'add an account in pounds'),
    reads: [{ figure: 'currencies-held', want: '1: pounds', holds: is(1) }],
  },
  {
    say: 'add an account in dollars',
    act: async (lived) =>
      void said(await lived.api.create({ register: 'accounts', fields: { name: 'Dollar account', kind: 'bank', balance: { amount: 120_000, currency: 'USD' }, as_of: lived.today } }, lived.as), 'add an account in dollars'),
    reads: [{ figure: 'currencies-held', want: '2: pounds and dollars', holds: is(2) }],
  },
  { say: 'read the signs', act: async () => {}, reads: SIGNS_FRESH },
];

/** Every step in order, and every figure read after each, as heard. */
export async function liveMoney(lived: Lived, steps: Step[] = MONEY_LIVED): Promise<Heard[]> {
  const heard: Heard[] = [];
  for (const step of steps) {
    await step.act(lived);
    for (const read of step.reads) {
      const r = await lived.api.metric({ metric: read.figure }, lived.as);
      const v = r.ok ? (r.value as { value: number | null; unit: string | null }) : null;
      heard.push({
        step: step.say,
        figure: read.figure,
        value: v?.value ?? null,
        unit: v?.unit ?? null,
        want: read.want,
        holds: v !== null && read.holds(v.value),
        ...(r.ok ? {} : { refused: `${r.refusal?.code ?? 'refused'}: ${r.refusal?.fix ?? ''}` }),
      });
    }
  }
  return heard;
}

/** One line a read, to quote: `after add an account in dollars, currencies-held read 2 (wanted 2: pounds and dollars)`. */
export const quote = (h: Heard): string =>
  `${h.holds ? 'holds' : 'FAILS'}: after ${h.step}, ${h.figure} ${h.refused ? `was refused, ${h.refused}` : `read ${h.value ?? 'nothing'}${h.unit ? ` ${h.unit}` : ''}`} (wanted ${h.want})`;
