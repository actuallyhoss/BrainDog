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
 * NOTHING HERE IS ANYBODY'S. The names and amounts are made up, and the steps are what any person does.
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
  /** A page as a reader opens it, `walk` the length a reader picked on a forecast's horizon, in days or `last`. */
  page(args: { slug: string; walk?: number | 'last' }, as: As): Promise<Said>;
};

/** Where a record is kept: what sign-up names it, and the zone its days are counted in. */
export type Place = { id: string; slug: string; name: string; tz: string; locale: string };

/**
 * A record to live in: its verbs, its owner, its today as `2026-09-03` in the place's own zone (as the record counts its
 * days, never the UTC date of its clock), the place it is signed up in (London when none is said), and the runner's own
 * sign-up when it has one, which reads the place off `lived` as `signUpHere` does.
 */
export type Lived = { api: LivedApi; as: As; today: string; place?: Place; signUp?: (lived: Lived) => Promise<void> };

/** A figure read after a step: its id, what it must say in words, and whether a value says it. */
export type FigureRead = { figure: string; want: string; holds: (value: number | null) => boolean };
/**
 * A walk read after a step: the repeating line it follows, by the name the record calls it, what it must say in words,
 * and whether the days it steps on say it, in order, as Money's Cash ahead walks them (`forecast.runway`).
 */
export type WalkRead = { walk: string; want: string; holds: (days: string[]) => boolean };
export type Read = FigureRead | WalkRead;
export type Step = { say: string; act: (lived: Lived) => Promise<void>; reads: Read[] };
/**
 * One read as it was heard: the step, the figure or the line walked, what it said, and whether that holds. A walk's
 * `days` are the days the line stepped on, and its `value` and `unit` are nothing.
 */
export type Heard = { step: string; figure: string; value: number | null; unit: string | null; days?: string[]; want: string; holds: boolean; refused?: string };

/** A verb's value, or a throw naming the step and the record's own words. */
const said = (r: Said, step: string): unknown => {
  if (r.ok) return r.value;
  throw new Error(`Money, lived, could not ${step}: ${r.refusal?.code ?? 'refused'}, ${r.refusal?.fix ?? ''}`);
};

/** The made-up person who signs up, and the record they make. */
const PERSON = 'p_lived_money';
export const OWNER: As = { principal: { kind: 'person', id: PERSON, level: 'owner' } };

/** The record the steps were first written for, in London. */
export const LONDON: Place = { id: 'rec_01J9MNYM1VEDMNEY0000000000', slug: 'money-lived', name: 'Money, lived', tz: 'Europe/London', locale: 'en-GB' };
/** A second record, in Cairo, whose week rests on Friday and Saturday (F62). */
export const CAIRO: Place = { id: 'rec_01J9MNYM1VEDMNEYCA1R000000', slug: 'money-lived-cairo', name: 'Money, lived in Cairo', tz: 'Africa/Cairo', locale: 'en-EG' };

/** Sign-up as it provisions a record, in this process: named, then BrainDog's modules with none of their example rows. */
export async function signUpHere(lived: Lived): Promise<void> {
  const place = lived.place ?? LONDON;
  said(await lived.api.createRecord({ ...place, owner: { id: PERSON } }), 'sign up');
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const plan = said(await lived.api.planPack({ doc, source: { kind: 'local' } }, lived.as), `plan the ${id} module`) as { diff: { planHash: string; approve?: string[] } };
    const approve = plan.diff.approve === undefined ? {} : { approve: plan.diff.approve };
    said(await lived.api.installPack({ doc, source: { kind: 'local' }, planHash: plan.diff.planHash, ...approve }, lived.as), `install the ${id} module`);
  }
}

const is = (n: number): FigureRead['holds'] => (v) => v === n;
const nothingYet: FigureRead['holds'] = (v) => v === null || v === 0;

/** Money's signs of life, as a fresh record with two accounts and no ledger must read them. */
const SIGNS_FRESH: FigureRead[] = [
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

/**
 * PAYDAYS IN CAIRO (F62, REC-B13, money-core 3.16.0): a repeating line's days of the month and its rule for a rest day,
 * walked on a record whose week rests on Friday and Saturday. "15, last" steps on the 15th and on each month's own last
 * day, so 31 October and 30 November; a line on the 30th stays on the 30th; and one set to the working day before
 * moves off Friday 30 October to Thursday 29, which on a week resting on Saturday and Sunday it would not.
 *
 * DATED IN THE AUTUMN OF 2026, because the days are the point: 30 October 2026 is a Friday. So the walk is lived from a
 * today before 15 October 2026, the seed's today (`NOW`, 3 September) among them, and a later today is refused by name.
 */
const AUTUMN = '2026-10-15';
const line = (lived: Lived, what: string, fields: Record<string, unknown>): Promise<Said> => {
  if (lived.today > AUTUMN) throw new Error(`Money, lived in Cairo, walks paydays from 15 October 2026 on, so it is lived on or before that day, and this record's today is ${lived.today}`);
  return lived.api.create({ register: 'recurring', fields: { what, amount: { amount: 1_500_000, currency: 'EGP' }, state: 'live', ...fields } }, lived.as);
};
/** Whether a walk's first days are these, in this order. */
const walks =
  (...want: string[]): WalkRead['holds'] =>
  (days) =>
    days.length >= want.length && want.every((d, i) => days[i] === d);

export const MONEY_LIVED_CAIRO: Step[] = [
  {
    say: 'sign up in Cairo',
    act: async (lived) => (lived.signUp ?? signUpHere)({ ...lived, place: lived.place ?? CAIRO }),
    reads: [{ figure: 'currencies-held', want: '0: no account is kept yet', holds: is(0) }],
  },
  {
    say: 'keep Egyptian pounds at home, and rest on Friday and Saturday',
    act: async (lived) =>
      void said(await lived.api.setPackConfig({ id: 'money-core', values: { home_currency: 'EGP', rest_days: ['Friday', 'Saturday'] } }, lived.as), 'set the home currency and the rest days'),
    reads: [{ figure: 'currencies-held', want: '0: a home currency is not an account', holds: is(0) }],
  },
  {
    say: 'add an account in Egyptian pounds',
    act: async (lived) =>
      void said(await lived.api.create({ register: 'accounts', fields: { name: 'Cairo account', kind: 'bank', liquid: true, balance: { amount: 9_000_000, currency: 'EGP' }, as_of: lived.today } }, lived.as), 'add an account in Egyptian pounds'),
    reads: [{ figure: 'currencies-held', want: '1: Egyptian pounds', holds: is(1) }],
  },
  {
    say: 'add a salary paid on the 15th and on the last day of the month',
    act: async (lived) => void said(await line(lived, 'Salary', { direction: 'in', every: 'twice_monthly', next_due: AUTUMN, day_of_month: '15, last' }), 'add a salary on the 15th and the last day'),
    reads: [{ walk: 'Salary', want: '15 and 31 October, then 15 and 30 November', holds: walks('2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30') }],
  },
  {
    say: 'add rent paid on the 30th',
    act: async (lived) => void said(await line(lived, 'Rent', { direction: 'out', every: 'monthly', next_due: '2026-10-30', day_of_month: '30' }), 'add rent on the 30th'),
    reads: [{ walk: 'Rent', want: '30 October, then 30 November', holds: walks('2026-10-30', '2026-11-30') }],
  },
  {
    say: 'add school fees on the 30th, paid the working day before a rest day',
    act: async (lived) =>
      void said(await line(lived, 'School fees', { direction: 'out', every: 'monthly', next_due: '2026-10-30', day_of_month: '30', weekend: 'before' }), 'add school fees on the 30th'),
    reads: [
      { walk: 'School fees', want: 'Thursday 29 October, since Friday 30 is a rest day, then Monday 30 November', holds: walks('2026-10-29', '2026-11-30') },
      { walk: 'Rent', want: 'still 30 October: rent keeps its day', holds: walks('2026-10-30') },
    ],
  },
];

/** How far a walk is read: Cash ahead's own opening length, which reaches past the end of November from the seed's today. */
const WALKED = 90;

/**
 * The days a line called `what` steps on, read off Money's page: of the blocks that walk `forecast.runway`, the one
 * that walked furthest. `null` when the page draws no walk, which a read hears as not holding.
 */
function walkedOn(page: unknown, what: string): string[] | null {
  type Walked = { source?: string; walk?: { steps?: readonly { day: string; label: string }[] } };
  const blocks = ((page as { blocks?: readonly Walked[] } | null)?.blocks ?? []).filter((b) => b.source === 'forecast.runway' && Array.isArray(b.walk?.steps));
  if (blocks.length === 0) return null;
  const furthest = blocks.reduce((a, b) => (b.walk!.steps!.length > a.walk!.steps!.length ? b : a));
  return furthest.walk!.steps!.filter((s) => s.label === what).map((s) => s.day);
}

/** Every step in order, and every figure and walk read after each, as heard. */
export async function liveMoney(lived: Lived, steps: Step[] = MONEY_LIVED): Promise<Heard[]> {
  const heard: Heard[] = [];
  for (const step of steps) {
    await step.act(lived);
    /* ONE PAGE A STEP, opened on its first walk read and read by the rest: the Forecast page, where Cash ahead is walked
       since money-core 3.29.0. Money's home draws no walk, and every walk read here was "Money drew no walk". */
    let page: Said | null = null;
    for (const read of step.reads) {
      if ('walk' in read) {
        page ??= await lived.api.page({ slug: 'money-forecast', walk: WALKED }, lived.as);
        const days = page.ok ? walkedOn(page.value, read.walk) : null;
        heard.push({
          step: step.say,
          figure: read.walk,
          value: null,
          unit: null,
          ...(days === null ? {} : { days }),
          want: read.want,
          holds: days !== null && read.holds(days),
          ...(page.ok ? (days === null ? { refused: 'Money drew no walk' } : {}) : { refused: `${page.refusal?.code ?? 'refused'}: ${page.refusal?.fix ?? ''}` }),
        });
        continue;
      }
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

/**
 * One line a read, to quote: `holds: after add an account in dollars, currencies-held read 2 (wanted 2: pounds and
 * dollars)`, or for a walk `holds: after add rent paid on the 30th, Rent walked 2026-10-30, 2026-11-30 (wanted ...)`.
 */
export const quote = (h: Heard): string => {
  const heardAs = h.refused
    ? `was refused, ${h.refused}`
    : h.days !== undefined
      ? `walked ${h.days.length > 0 ? h.days.slice(0, 6).join(', ') : 'on no day'}`
      : `read ${h.value ?? 'nothing'}${h.unit ? ` ${h.unit}` : ''}`;
  return `${h.holds ? 'holds' : 'FAILS'}: after ${h.step}, ${h.figure} ${heardAs} (wanted ${h.want})`;
};
