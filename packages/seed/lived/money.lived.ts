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
  update(args: { register: string; seq: number; patch: Record<string, unknown> }, as: As): Promise<Said>;
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
  { figure: 'statement-oldest-days', want: '0: both balances were stated today', holds: is(0) },
  { figure: 'nights-missed-30d', want: 'nothing: the cash line has kept no night yet', holds: (v) => v === null },
];

/** The day `days` from the record's today, as `2026-09-03`. */
const dayFrom = (today: string, days: number): string => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The Egyptian account each record's later steps file against, kept by the step that adds it. */
const egpAccount = new WeakMap<Lived, string>();
const accountOf = (lived: Lived): string => {
  const id = egpAccount.get(lived);
  if (id === undefined) throw new Error('Money, lived, has no account in Egyptian pounds yet: add it first');
  return id;
};
/** A row the record kept, as its write answers it. */
type Kept = { id: string; seq: number; fields: Record<string, unknown> };

/**
 * A BALANCE'S AGE IS THE BANK'S LAST WORD, AND A ROW'S CURRENCY IS ITS ACCOUNT'S (REC-B03, REC-B04, money-core 3.16.0).
 * An account typed thirty days ago is named old; a bank message that prints its balance after a movement makes it
 * today's without touching the typed day. A Ledger amount written with no code takes the account's, and a row's code
 * never changes once kept.
 */
const AGES_AND_CURRENCY: Step[] = [
  {
    say: 'add an account in Egyptian pounds, last typed thirty days ago',
    act: async (lived) => {
      const fields = { name: 'Cairo account', kind: 'bank', liquid: true, balance: { amount: 1_000_000, currency: 'EGP' }, as_of: dayFrom(lived.today, -30) };
      egpAccount.set(lived, (said(await lived.api.create({ register: 'accounts', fields }, lived.as), 'add an account in Egyptian pounds') as Kept).id);
    },
    reads: [
      { figure: 'balances-stale', want: '1: the Cairo account was last confirmed a month ago', holds: is(1) },
      { figure: 'statement-oldest-days', want: '30: the oldest balance is a month old', holds: is(30) },
    ],
  },
  {
    say: 'file a bank message that prints the balance after a payment',
    act: async (lived) => {
      const fields = { on: lived.today, what: 'Card payment', direction: 'out', amount: { amount: 5_000, currency: 'EGP' }, balance_after: { amount: 995_000, currency: 'EGP' }, account: accountOf(lived), state: 'cleared' };
      said(await lived.api.create({ register: 'transactions', fields }, lived.as), 'file a bank message');
    },
    reads: [
      { figure: 'balances-stale', want: '0: the bank said the Cairo balance today', holds: is(0) },
      { figure: 'statement-oldest-days', want: '0: every balance was confirmed today', holds: is(0) },
    ],
  },
  {
    say: 'write a payment with an amount and no currency',
    act: async (lived) => {
      const fields = { on: lived.today, what: 'Groceries', direction: 'out', amount: { amount: 97_999 }, account: accountOf(lived), state: 'cleared' };
      const kept = said(await lived.api.create({ register: 'transactions', fields }, lived.as), 'write a payment with no currency') as Kept;
      const amount = kept.fields.amount as { currency?: string } | undefined;
      if (amount?.currency !== 'EGP') throw new Error(`Money, lived, kept a payment with no currency in ${amount?.currency ?? 'none'}, not the account's Egyptian pounds`);
    },
    reads: [{ figure: 'ledger-rows-7d', want: '2: the bank message and the payment', holds: is(2) }],
  },
  {
    say: "write a payment in dollars, then try to change it to Egyptian pounds",
    act: async (lived) => {
      const fields = { on: lived.today, what: 'Software', direction: 'out', amount: { amount: 2_000, currency: 'USD' }, account: accountOf(lived), state: 'cleared' };
      const kept = said(await lived.api.create({ register: 'transactions', fields }, lived.as), 'write a payment in dollars') as Kept;
      if ((kept.fields.amount as { currency?: string }).currency !== 'USD') throw new Error('Money, lived, did not keep a payment in dollars as written');
      const moved = await lived.api.update({ register: 'transactions', seq: kept.seq, patch: { amount: { amount: 2_000, currency: 'EGP' } } }, lived.as);
      if (moved.ok || moved.refusal?.code !== 'CURRENCY_FIXED') throw new Error(`Money, lived, let a payment change its currency (${moved.ok ? 'kept' : moved.refusal?.code})`);
    },
    reads: [{ figure: 'ledger-rows-7d', want: '3: the dollar payment is kept beside the other two', holds: is(3) }],
  },
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
  ...AGES_AND_CURRENCY,
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
