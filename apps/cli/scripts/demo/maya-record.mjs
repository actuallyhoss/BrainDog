/**
 * MAYA OKAFOR'S BRAINDOG, AS ROWS: the record the site draws (`apps/site/src/lib/demo/maya.ts`), made real enough to
 * sign in to. Pure: a day in, a plan out, nothing read or written. `demo-record.mjs` sends it to a host.
 *
 * NOBODY REAL. Every name is the site's invented founder and the people she works with, every address ends in
 * `.example`, and nothing here is a key.
 *
 * THE SITE'S FIGURES ARE THE RECORD'S FIGURES. The headline amounts are read from `maya.ts` (`CENTS`, `PROJECTS`,
 * `PEOPLE`), so the page a visitor reads and the record a reviewer opens say the same: $48,210 across two accounts,
 * Northbound's $3,200 invoice four days late, Dana's $1,800 due Friday, Tidepool at $8,420 a month with 214 customers.
 *
 * AND THE RECORD AGREES WITH ITSELF, which is what a reviewer notices first. The ledger is generated forward from an
 * opening balance chosen so each account ends on today's balance; every repeating line that fell due is a ledger line
 * that says so (`posted_for`); every invoice paid is a ledger line that settles it (`settles`); the weekly snapshots are
 * the ledger's own running cash, not a drawn curve; and each project's revenue is what its ledger lines brought in. So
 * Today's cash, Money's accounts, the Coming up list and a project's page are one set of rows read four ways.
 *
 * DATES ARE RELATIVE TO THE DAY IT IS MADE, so the record looks alive whenever it is seeded: the late invoice is four
 * days late on that day, the ledger runs three full months back, and what repeats is due next where it should be.
 *
 * MONEY IS WHOLE CENTS IN ONE CURRENCY, US dollars, as `{ amount, currency }`. A REF IS `{ $ref: '<key>' }`, the key of
 * another row of this plan, which the sender turns into that row's id once it is written. A row comes after every row
 * it points at.
 */

import { CENTS, FOUNDER, PEOPLE as SITE_PEOPLE, PROJECTS as SITE_PROJECTS } from '../../../site/src/lib/demo/maya.ts';

export const CURRENCY = 'USD';
const usd = (cents) => ({ amount: Math.round(cents), currency: CURRENCY });
const ref = (key) => ({ $ref: key });
/** Cents as a person reads them: `$3,200`, `$64.20`. */
const dollars = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/* ── DAYS ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const MS_DAY = 86_400_000;
const toMs = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const plus = (day, n) => toDay(toMs(day) + n * MS_DAY);
const weekday = (day) => new Date(toMs(day)).getUTCDay();
/** The date of day `d` (clamped to the month's last day) in the month `m` (0-11) of `y`, rolling the year over. */
const dateIn = (y, m, d) => {
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDay(Date.UTC(year, month, Math.min(d, last)));
};
/** The next given weekday strictly after `day` (0 Sunday ... 6 Saturday). */
const nextWeekday = (day, wd) => {
  let d = plus(day, 1);
  while (weekday(d) !== wd) d = plus(d, 1);
  return d;
};
/** The given weekday on or before `day`. */
const lastWeekday = (day, wd) => {
  let d = day;
  while (weekday(d) !== wd) d = plus(d, -1);
  return d;
};
/* "SEP", NEVER THE "SEPT" en-GB WRITES (next-money, M42): every other screen says "27 Sep". */
const said = (day) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(toMs(day))).replace('Sept', 'Sep');
/** Today in a zone, as the record's own day. */
export const todayIn = (tz, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** A fixed stream of numbers in [0, 1), so the same day always makes the same record (mulberry32). */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/* ── THE PLAN ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Everything the record holds, made for `today` (`YYYY-MM-DD`, the record's own day).
 *
 * Answers `{ founder, rows, categories, agents, widgets, figures }`:
 *   - `rows`: `{ key, register, fields, label }` in write order;
 *   - `categories`: the categories it files under, by name, which the sender finds or makes first (`cat:<name>` keys);
 *   - `agents`: each agent's key label, run hints and what it does once connected (handoff, notes, learnings, asks);
 *   - `widgets`: the gallery widgets Today shows, by their gallery id, and the size each is drawn at;
 *   - `figures`: the headline figures as the rows add them up, for the sender to print and a person to check.
 */
export function mayaRecord(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`today is a day, YYYY-MM-DD, and was ${today}`);
  const rows = [];
  const add = (register, key, fields, label = fields.name ?? fields.what ?? key) => {
    if (rows.some((r) => r.key === key)) throw new Error(`the plan has two rows keyed ${key}`);
    rows.push({ register, key, fields, label: String(label) });
    return key;
  };
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const rand = stream(0x6d617961); // "maya"
  const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));

  /* ── projects ── */
  const P = SITE_PROJECTS;
  const friday = nextWeekday(today, 5);
  const monday = lastWeekday(plus(today, -1), 1);
  add('things', 'thing:tidepool', {
    name: P.tidepool.name,
    about: 'Webhook monitoring that small teams pay for monthly',
    kind: 'product',
    lane: 'building',
    health: 'on_track',
    revenue: usd(CENTS.tidepoolPayout),
    since: plus(today, -270),
    next: 'Ship webhook retries',
    agent: 'claude',
    hue: P.tidepool.hue,
    mark: P.tidepool.icon,
    repos: ['tidepool'],
    domains: ['tidepool.example'],
  });
  add('things', 'thing:ferment', {
    name: P.ferment.name,
    about: 'Small-batch kimchi and krauts, sold online and to local shops',
    kind: 'business',
    lane: 'earning',
    health: 'on_track',
    revenue: usd(431_500),
    since: plus(today, -640),
    next: 'Pack the Hart Street Grocer order',
    hue: P.ferment.hue,
    mark: P.ferment.icon,
    domains: ['fermentandco.example'],
  });
  add('things', 'thing:northbound', {
    name: P.northbound.name,
    about: 'Product design for Northbound Labs, on a monthly retainer',
    kind: 'client',
    lane: 'earning',
    health: 'at_risk',
    revenue: usd(CENTS.northboundInvoice),
    since: plus(today, -200),
    next: 'Move the next sprint a week',
    progress: 62,
    agent: 'chatgpt',
    hue: P.northbound.hue,
    mark: P.northbound.icon,
  });
  add('things', 'thing:pocketlab', {
    name: P.pocketlab.name,
    about: 'A pocket lab notebook app for science teachers, in private beta',
    kind: 'product',
    lane: 'building',
    health: 'on_track',
    since: plus(today, -120),
    next: 'Finish the onboarding screens',
    progress: 70,
    aim: plus(today, 45),
    agent: 'cursor',
    hue: P.pocketlab.hue,
    mark: P.pocketlab.icon,
    repos: ['pocketlab'],
  });

  /* ── organisations and people ── */
  const orgs = [
    ['org:northbound', 'Northbound Labs', 'client', 'northbound.example', ['thing:northbound'], 'Pays on 10 days, usually late by a week.'],
    ['org:kiln', 'Kiln & Crumb', 'client', 'kilnandcrumb.example', ['thing:ferment'], 'Bakery. Takes 12 cases a month.'],
    ['org:hart', 'Hart Street Grocer', 'client', 'hartstreet.example', ['thing:ferment'], 'Corner grocer. Orders every two weeks.'],
    ['org:pickle', 'The Pickle Room', 'client', 'pickleroom.example', ['thing:ferment'], 'Restaurant. The biggest wholesale order.'],
    ['org:lowtide', 'Lowtide Café', 'client', 'lowtide.example', ['thing:ferment'], 'Pays late, always pays.'],
    ['org:stripe', 'Stripe', 'vendor', 'stripe.example', ['thing:tidepool'], null],
    ['org:shopify', 'Shopify', 'vendor', 'shopify.example', ['thing:ferment'], null],
    ['org:aws', 'Amazon Web Services', 'vendor', 'aws.example', ['thing:tidepool', 'thing:pocketlab'], null],
    ['org:figma', 'Figma', 'vendor', 'figma.example', ['thing:tidepool', 'thing:pocketlab'], null],
    ['org:google', 'Google Workspace', 'vendor', 'google.example', [], null],
    ['org:jarco', 'Harbour Jar Co', 'vendor', 'harbourjar.example', ['thing:ferment'], 'Jars and lids, by the pallet.'],
    ['org:bank', 'First Harbor Bank', 'bank', 'firstharbor.example', [], null],
  ];
  for (const [key, name, kind, domain, projects, note] of orgs)
    add('organisations', key, { name, kind, domain, keys: [`domain:${domain}`], ...(projects.length ? { projects: projects.map(ref) } : {}), ...(note ? { note } : {}) });

  const S = SITE_PEOPLE;
  const people = [
    ['person:dana', S.dana.name, 'contractor', 'dana@reyesstudio.example', null, ['thing:tidepool', 'thing:pocketlab'], 'Designer. Does the icons and the marketing pages.', usd(9_000), plus(today, -3)],
    ['person:leo', S.leo.name, 'accountant', 'leo@brandtbooks.example', null, ['thing:ferment', 'thing:tidepool'], 'Keeps the books for Ferment & Co and Tidepool. Quarterly taxes.', usd(60_000), plus(today, -12)],
    ['person:sam', S.sam.name, 'client', 'sam@northbound.example', 'org:northbound', ['thing:northbound'], 'Head of product at Northbound. Signs off the sprints and the invoices.', null, plus(today, -5)],
    ['person:rosa', 'Rosa Lind', 'client', 'rosa@hartstreet.example', 'org:hart', ['thing:ferment'], 'Buys for Hart Street Grocer.', null, plus(today, -6)],
    ['person:kiran', 'Kiran Shah', 'client', 'kiran@kilnandcrumb.example', 'org:kiln', ['thing:ferment'], 'Owns Kiln & Crumb.', null, plus(today, -21)],
    ['person:ade', 'Adebayo Cole', 'collaborator', 'ade@pocketlab.example', null, ['thing:pocketlab'], 'Science teacher. Runs the Pocketlab beta in his school.', null, plus(today, -9)],
    ['person:june', 'June Park', 'other', 'june@park.example', null, [], 'Mentor. Coffee once a month.', null, plus(today, -96)],
  ];
  for (const [key, name, role, email, org, projects, note, rate, inTouch] of people)
    add('people', key, {
      name,
      role,
      email,
      keys: [`email:${email}`],
      ...(org ? { org: ref(org) } : {}),
      ...(projects.length ? { projects: projects.map(ref) } : {}),
      note,
      ...(rate ? { rate } : {}),
      in_touch: inTouch,
    });

  /* ── categories, found by name or made ── */
  const categories = [
    { name: 'Software sales', direction: 'in', icon: 'banknote', colour: 'sky' },
    { name: 'Sales', direction: 'in', icon: 'shopping-bag', colour: 'yellow' },
    { name: 'Client work', direction: 'in', icon: 'briefcase', colour: 'violet' },
    { name: 'Rent', direction: 'out', icon: 'house', colour: 'slate' },
    { name: 'Salaries', direction: 'out', icon: 'hand-coins', colour: 'blue' },
    { name: 'Contractors', direction: 'out', icon: 'briefcase', colour: 'pink' },
    { name: 'Software', direction: 'out', icon: 'repeat', colour: 'teal' },
    { name: 'Supplies', direction: 'out', icon: 'package', colour: 'lime' },
    { name: 'Marketing', direction: 'out', icon: 'ticket', colour: 'violet' },
    { name: 'Groceries', direction: 'out', icon: 'shopping-cart', colour: 'lime', budget: usd(60_000), budget_period: 'month' },
    { name: 'Eating out', direction: 'out', icon: 'utensils', colour: 'pink', budget: usd(20_000), budget_period: 'month' },
    { name: 'Coffee', direction: 'out', icon: 'coffee', colour: 'yellow', budget: usd(3_500), budget_period: 'week' },
    { name: 'Transport', direction: 'out', icon: 'car', colour: 'slate' },
    { name: 'Health', direction: 'out', icon: 'heart-pulse', colour: 'teal' },
    { name: 'Insurance', direction: 'out', icon: 'scale', colour: 'slate' },
    { name: 'Tax', direction: 'out', icon: 'landmark', colour: 'slate' },
  ];
  const cat = (name) => {
    if (!categories.some((c) => c.name === name)) throw new Error(`no category ${name} in the plan`);
    return ref(`cat:${name}`);
  };

  /* ── accounts: their balances today are the site's, and the ledger is walked back from them ── */
  const ACCOUNTS = {
    business: { key: 'acct:business', name: 'Business checking', kind: 'bank', last4: '4471', liquid: true, end: 4_138_000 },
    everyday: { key: 'acct:everyday', name: 'Everyday checking', kind: 'bank', last4: '0912', liquid: true, end: 683_000 },
    amex: { key: 'acct:amex', name: 'Amex', kind: 'card', last4: '1008', liquid: false, end: null },
  };
  if (ACCOUNTS.business.end + ACCOUNTS.everyday.end !== CENTS.cashAhead) throw new Error('the two accounts do not add up to the site’s cash ahead');

  /* ── the ledger, made forward from three months back ── */
  const start = dateIn(y, m - 3, 1);
  const lines = []; // { key, on, what, direction, cents, account, category, thing?, party?, payee, settles?, posted_for?, transfer? }
  const line = (l) => lines.push({ key: `tx:${lines.length + 1}`, ...l });

  /* WHAT REPEATS, each a `recurring` row and a ledger line on every day it fell due up to today. */
  const repeating = [
    { key: 'rec:rent', what: 'Rent', direction: 'out', cents: 210_000, day: 1, account: 'everyday', category: 'Rent', payee: 'HARBOR PROPERTY MGMT' },
    { key: 'rec:tidepool', what: 'Tidepool payout', direction: 'in', cents: CENTS.tidepoolPayout, day: 3, account: 'business', category: 'Software sales', thing: 'thing:tidepool', party: 'org:stripe', payee: 'STRIPE PAYOUT', past: [680_000, 724_000, 761_000, 795_000, CENTS.tidepoolPayout] },
    { key: 'rec:gym', what: 'Gym', direction: 'out', cents: 4_500, day: 3, account: 'everyday', category: 'Health', payee: 'HARBOR FITNESS' },
    { key: 'rec:insurance', what: 'Car insurance', direction: 'out', cents: 9_600, day: 12, account: 'everyday', category: 'Insurance', payee: 'BAYSIDE MUTUAL' },
    { key: 'rec:shopify', what: 'Shopify payout', direction: 'in', cents: CENTS.shopifyPayout, day: 15, account: 'business', category: 'Sales', thing: 'thing:ferment', party: 'org:shopify', payee: 'SHOPIFY PAYOUT', past: [196_000, 204_800, 219_300, 226_100, CENTS.shopifyPayout] },
    { key: 'rec:salaries', what: 'Salaries', direction: 'out', cents: CENTS.salaries, day: 20, account: 'business', category: 'Salaries', thing: 'thing:ferment', payee: 'GUSTO PAYROLL' },
    { key: 'rec:leo', what: 'Bookkeeping, Leo Brandt', direction: 'out', cents: 60_000, day: 20, account: 'business', category: 'Contractors', person: 'person:leo', payee: 'BRANDT BOOKS' },
    { key: 'rec:aws', what: 'AWS', direction: 'out', cents: CENTS.awsCard, day: 23, account: 'amex', category: 'Software', thing: 'thing:tidepool', party: 'org:aws', payee: 'AWS EMEA' },
    { key: 'rec:google', what: 'Google Workspace', direction: 'out', cents: CENTS.googleWorkspace, day: 24, account: 'amex', category: 'Software', party: 'org:google', payee: 'GOOGLE *WORKSPACE' },
    { key: 'rec:figma', what: 'Figma', direction: 'out', cents: CENTS.figmaBill, day: 25, account: 'amex', category: 'Software', thing: 'thing:pocketlab', party: 'org:figma', payee: 'FIGMA' },
    { key: 'rec:ads', what: 'Pocketlab ads', direction: 'out', cents: 140_000, day: 8, account: 'business', category: 'Marketing', thing: 'thing:pocketlab', payee: 'META ADS' },
    { key: 'rec:ios', what: 'iOS contractor, Pocketlab', direction: 'out', cents: 260_000, day: 5, account: 'business', category: 'Contractors', thing: 'thing:pocketlab', payee: 'NORTHWIND APPS LLC' },
    { key: 'rec:health', what: 'Health insurance', direction: 'out', cents: 48_000, day: 1, account: 'everyday', category: 'Insurance', payee: 'HARBOR HEALTH PLAN' },
  ];
  const occurrences = (r) => {
    const out = [];
    for (let k = -3; k <= 1; k += 1) {
      const d = dateIn(y, m + k, r.day);
      if (d >= start && d <= today) out.push(d);
    }
    return out;
  };
  for (const r of repeating) {
    const days = occurrences(r);
    r.paid = days;
    r.next = [0, 1, 2].map((k) => dateIn(y, m + k, r.day)).find((d) => d > today);
    /* A LINE THAT GROWS (a payout) ends on its newest amount once this month's is in, and one short of it before. */
    const end = r.past ? r.past.length - (dateIn(y, m, r.day) > today ? 1 : 0) : 0;
    const amountOf = (i) => (r.past ? r.past[Math.max(0, end - days.length + i)] : r.cents);
    days.forEach((d, i) => line({ on: d, what: r.what, direction: r.direction, cents: amountOf(i), account: r.account, category: r.category, thing: r.thing, party: r.party, payee: r.payee, posted_for: r.key }));
    r.last = days.at(-1) ?? null;
    r.lastCents = days.length > 0 ? amountOf(days.length - 1) : r.cents;
  }

  /* WHAT WAS BILLED: Northbound's retainer each month, wholesale orders, and Dana's invoices. Each paid one is settled
     by the ledger line that paid it; the open ones are what Today and Money say is owed. */
  const bills = [];
  const bill = (b) => (bills.push(b), b);
  const nbDue = plus(today, -4); // 1042: four days late, as the site says
  for (let i = 0; i < 4; i += 1) {
    const number = 1039 + i;
    const due = i === 3 ? nbDue : plus(nbDue, -30 * (3 - i));
    const paidOn = i === 3 ? null : plus(due, [6, 9, 7][i]);
    bill({
      key: `bill:nb-${number}`,
      what: `Northbound invoice ${number}`,
      party: 'person:sam',
      direction: 'owed_to_me',
      cents: CENTS.northboundInvoice,
      issued: plus(due, -10),
      due,
      paid: paidOn,
      thing: 'thing:northbound',
      category: 'client_work',
      account: 'business',
      ledgerCategory: 'Client work',
      org: 'org:northbound',
      payee: 'NORTHBOUND LABS',
      note: i === 3 ? `Sent to Sam Patel on ${said(plus(due, -10))}. Northbound usually pays in 9 days.` : null,
    });
  }
  const wholesale = [
    ['bill:kiln-1', 'Kiln & Crumb, 12 cases', 'person:kiran', 'org:kiln', 144_000, -58, 3],
    ['bill:pickle-1', 'The Pickle Room, 20 cases', null, 'org:pickle', 240_000, -33, 2],
    ['bill:lowtide-1', 'Lowtide Café, 6 cases', null, 'org:lowtide', 72_000, -24, 9],
    ['bill:kiln-2', 'Kiln & Crumb, 12 cases', 'person:kiran', 'org:kiln', 144_000, -27, 4],
    ['bill:hart-1', 'Hart Street Grocer, 8 cases', 'person:rosa', 'org:hart', 96_000, -18, 1],
  ];
  for (const [key, what, person, org, cents, dueIn, late] of wholesale) {
    const due = plus(today, dueIn);
    bill({ key, what, party: person, direction: 'owed_to_me', cents, issued: plus(due, -14), due, paid: plus(due, late), thing: 'thing:ferment', category: 'other', account: 'business', ledgerCategory: 'Sales', org, payee: org === 'org:kiln' ? 'KILN AND CRUMB LLC' : org === 'org:pickle' ? 'PICKLE ROOM HOSPITALITY' : org === 'org:lowtide' ? 'LOWTIDE CAFE' : 'HART STREET GROCER', note: late > 7 ? 'Paid nine days late.' : null });
  }
  bill({ key: 'bill:hart-2', what: 'Hart Street Grocer, 8 cases', party: 'person:rosa', direction: 'owed_to_me', cents: 96_000, issued: plus(friday, -14), due: friday, paid: null, thing: 'thing:ferment', category: 'other', account: 'business', ledgerCategory: 'Sales', org: 'org:hart', payee: 'HART STREET GROCER', note: 'Delivered with the order. Rosa pays on the day.' });
  for (let i = 0; i < 4; i += 1) {
    const month = dateIn(y, m - 3 + i, 1);
    const due = i === 3 ? friday : dateIn(y, m - 3 + i, 20);
    if (i < 3 && due < start) continue;
    bill({
      key: `bill:dana-${i + 1}`,
      what: i === 3 ? 'Invoice from Dana Reyes' : `Invoice from Dana Reyes, ${new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(toMs(month)))}`,
      party: 'person:dana',
      direction: 'owed_by_me',
      cents: i === 3 ? CENTS.danaInvoice : 180_000,
      issued: i === 3 ? monday : plus(due, -4),
      due,
      paid: i === 3 ? null : due,
      thing: i === 1 ? 'thing:pocketlab' : 'thing:tidepool',
      category: 'contractors',
      account: 'business',
      ledgerCategory: 'Contractors',
      payee: 'DANA REYES DESIGN',
      note: i === 3 ? `Tidepool icons. Arrived by email on ${said(monday)}.` : null,
    });
  }
  /* A quarter's estimated tax, set aside and paid, which is the one large line a reviewer will ask about. */
  const taxDay = dateIn(y, m - 1, 15) <= today ? dateIn(y, m - 1, 15) : dateIn(y, m - 2, 15);
  bill({ key: 'bill:tax-q3', what: 'Estimated tax, third quarter', party: 'person:leo', direction: 'owed_by_me', cents: 270_000, issued: plus(taxDay, -20), due: taxDay, paid: taxDay, account: 'business', ledgerCategory: 'Tax', category: 'tax', payee: 'IRS USATAXPYMT', note: 'Leo worked it out from the books.' });

  for (const b of bills)
    if (b.paid && b.paid <= today && b.paid >= start)
      line({ on: b.paid, what: b.what, direction: b.direction === 'owed_to_me' ? 'in' : 'out', cents: b.cents, account: b.account, category: b.ledgerCategory, thing: b.thing, party: b.org, payee: b.payee, settles: b.key });

  /* WHAT A PERSON SPENDS, day by day: groceries, eating out, coffee, fuel; and what the shop buys every two weeks. */
  for (let d = start; d <= today; d = plus(d, 1)) {
    const wd = weekday(d);
    if (wd === 6 || (wd === 3 && rand() < 0.5)) line({ on: d, what: 'Groceries', direction: 'out', cents: between(5_200, 13_800), account: 'amex', category: 'Groceries', payee: rand() < 0.6 ? 'GREENWAY MARKET' : 'TRADER JOES #118' });
    if ((wd === 5 || wd === 6) && rand() < 0.55) line({ on: d, what: 'Eating out', direction: 'out', cents: between(2_400, 7_800), account: 'amex', category: 'Eating out', payee: ['NOODLE BAR 9', 'LUPA TRATTORIA', 'THE FISH SHACK', 'TACO NORTE'][Math.floor(rand() * 4)] });
    if (wd >= 1 && wd <= 5 && rand() < 0.5) line({ on: d, what: 'Coffee', direction: 'out', cents: between(450, 720), account: 'everyday', category: 'Coffee', payee: rand() < 0.7 ? 'BLUE BOTTLE COFFEE' : 'HARBOR ROASTERS' });
    if (wd === 2 && rand() < 0.4) line({ on: d, what: 'Fuel', direction: 'out', cents: between(3_800, 6_200), account: 'everyday', category: 'Transport', payee: 'SHELL 0442' });
    if (wd === 4 && Math.floor((toMs(d) - toMs(start)) / MS_DAY / 7) % 2 === 0)
      line({ on: d, what: 'Jars, lids and produce', direction: 'out', cents: between(78_000, 132_000), account: 'business', category: 'Supplies', thing: 'thing:ferment', party: 'org:jarco', payee: 'HARBOUR JAR CO' });
  }

  /* THE CARD IS PAID OFF FROM EVERYDAY ON THE 28TH, whatever it ran up since the last payment. Two lines, one transfer. */
  let owing = 0;
  const sorted = () => lines.sort((a, b) => (a.on === b.on ? a.key.localeCompare(b.key, 'en', { numeric: true }) : a.on < b.on ? -1 : 1));
  sorted();
  const payoffs = [];
  for (let k = -3; k <= 0; k += 1) {
    const d = dateIn(y, m + k, 28);
    if (d >= start && d <= today) payoffs.push(d);
  }
  let walked = 0;
  for (const d of payoffs) {
    for (; walked < lines.length && lines[walked].on < d; walked += 1) if (lines[walked].account === 'amex') owing += lines[walked].direction === 'out' ? lines[walked].cents : -lines[walked].cents;
    if (owing <= 0) continue;
    line({ on: d, what: 'Amex payment', direction: 'out', cents: owing, account: 'everyday', category: null, payee: 'AMEX EPAYMENT', transfer: true });
    line({ on: d, what: 'Payment, thank you', direction: 'in', cents: owing, account: 'amex', category: null, payee: 'PAYMENT RECEIVED', transfer: true });
    owing = 0;
  }
  sorted();

  /* THE OPENING BALANCES, chosen so each bank account ends on the site's figure today. The card starts at what it owed. */
  const net = (account, upTo = '9999-12-31', after = '0000-00-00') =>
    lines.filter((l) => l.account === account && l.on <= upTo && l.on > after).reduce((s, l) => s + (l.direction === 'in' ? l.cents : -l.cents), 0);
  const opening = {
    business: ACCOUNTS.business.end - net('business'),
    everyday: ACCOUNTS.everyday.end - net('everyday'),
    amex: -between(90_000, 140_000),
  };
  /* The card's first payoff clears what it opened with too, so its opening is added to the first payment. */
  const firstPay = lines.find((l) => l.account === 'everyday' && l.transfer);
  const firstIn = lines.find((l) => l.account === 'amex' && l.transfer);
  if (firstPay && firstIn) {
    firstPay.cents += -opening.amex;
    firstIn.cents += -opening.amex;
    opening.everyday -= opening.amex; // the extra paid from Everyday was there at the start
  }
  ACCOUNTS.amex.end = opening.amex + net('amex');
  for (const [name, cents] of Object.entries(opening))
    if (name !== 'amex' && cents < 50_000) throw new Error(`${name} would open at ${cents} cents; the ledger does not fit the balances`);

  /* A CARD'S TO PAY IS AS OF TODAY (`to_pay_on` is "To pay as of", the day the figure was read, which `card-owed.js`
     reads lines from): a statement day ahead made Money say "$148.85 to pay on the card, as of 28 Nov" on 2 Nov. */
  for (const a of Object.values(ACCOUNTS))
    add('accounts', a.key, {
      name: a.name,
      kind: a.kind,
      balance: usd(a.end),
      as_of: today,
      liquid: a.liquid,
      last4: a.last4,
      state: 'open',
      ...(a.kind === 'card' ? { limit: usd(1_000_000), to_pay: usd(-a.end), to_pay_on: today } : {}),
    });

  /* FILING RULES: how the card lines are filed, which Money's rules page lists. */
  const rules = [
    ['rule:greenway', 'GREENWAY', 'Groceries'],
    ['rule:traderjoes', 'TRADER JOES', 'Groceries'],
    ['rule:bluebottle', 'BLUE BOTTLE', 'Coffee'],
    ['rule:roasters', 'HARBOR ROASTERS', 'Coffee'],
    ['rule:aws', 'AWS', 'Software'],
    ['rule:figma', 'FIGMA', 'Software'],
    ['rule:shell', 'SHELL', 'Transport'],
  ];
  for (const [key, match, category] of rules) add('filing_rules', key, { match, match_by: 'starts', reads: 'payee', direction: 'out', category: cat(category), state: 'on' }, `${match} to ${category}`);

  /* AN INSTALMENT PLAN: the Pocketlab laptop, twelve parts on the card, five paid. */
  add('plans', 'plan:laptop', { name: 'Laptop for Pocketlab', account: ref('acct:amex'), note: '12 monthly parts, no interest.', state: 'open' });
  const part = 20_825;
  for (let n = 1; n <= 12; n += 1) {
    const due = dateIn(y, m - 4 + n, 9);
    const paid = due <= today;
    add('installments', `inst:laptop-${n}`, {
      what: `Laptop for Pocketlab, ${n} of 12`,
      plan: 'Laptop for Pocketlab',
      plan_row: ref('plan:laptop'),
      number: n,
      parts: 12,
      direction: 'out',
      amount: usd(part),
      due,
      state: paid ? 'paid' : 'open',
      ...(paid ? { settled: due } : {}),
      left_after: usd(part * (12 - n)),
      account: ref('acct:amex'),
      category: cat('Software'),
      thing: ref('thing:pocketlab'),
    });
  }

  /* BILLS AND INVOICES */
  for (const b of bills)
    add('obligations', b.key, {
      what: b.what,
      ...(b.party ? { party: ref(b.party) } : {}),
      direction: b.direction,
      amount: usd(b.cents),
      due: b.due,
      state: b.paid && b.paid <= today ? 'paid' : 'open',
      ...(b.thing ? { thing: ref(b.thing) } : {}),
      account: ref(`acct:${b.account}`),
      category: b.category,
      ...(b.paid && b.paid <= today ? { settled: b.paid } : {}),
      ...(b.note ? { note: b.note } : {}),
    });

  /* WHAT REPEATS */
  for (const r of repeating)
    add('recurring', r.key, {
      what: r.what,
      direction: r.direction,
      amount: usd(r.cents),
      every: 'monthly',
      next_due: r.next,
      ...(r.last ? { last_paid: r.last, last_amount: usd(r.lastCents) } : {}),
      day_of_month: String(r.day),
      weekend: r.direction === 'out' ? 'before' : 'after',
      started: plus(start, -180),
      account: ref(`acct:${r.account}`),
      category: cat(r.category),
      ...(r.person ? { party: ref(r.person) } : {}),
      ...(r.thing ? { thing: ref(r.thing) } : {}),
      state: 'live',
    });

  /* THE LEDGER */
  for (const l of lines)
    add(
      'transactions',
      l.key,
      {
        what: l.what,
        on: l.on,
        direction: l.direction,
        amount: usd(l.cents),
        account: ref(`acct:${l.account}`),
        ...(l.category ? { category: cat(l.category) } : {}),
        ...(l.party ? { party: ref(l.party) } : {}),
        payee: l.payee,
        counterparty_text: l.payee,
        ...(l.thing ? { thing: ref(l.thing) } : {}),
        state: 'cleared',
        ...(l.transfer ? { transfer: true } : {}),
        ...(l.settles ? { settles: ref(l.settles) } : {}),
        ...(l.posted_for ? { posted_for: ref(l.posted_for) } : {}),
      },
      `${l.on} ${l.what}`,
    );

  /* SNAPSHOTS, WEEKLY, OF THE LEDGER'S OWN RUNNING CASH: cash in the two bank accounts at the end of each Sunday, what
     was owed each way on that day, and the difference. */
  const liquidOn = (d) => ACCOUNTS.business.end + ACCOUNTS.everyday.end - net('business', '9999-12-31', d) - net('everyday', '9999-12-31', d);
  const openOn = (d, direction) => bills.filter((b) => b.direction === direction && b.issued <= d && (!b.paid || b.paid > d)).reduce((s, b) => s + b.cents, 0);
  const cashSeries = [];
  for (let d = lastWeekday(plus(today, -1), 0), n = 0; n < 12 && d >= start; d = plus(d, -7), n += 1) cashSeries.unshift(d);
  for (const d of cashSeries) {
    const cash = liquidOn(d);
    const toMe = openOn(d, 'owed_to_me');
    const byMe = openOn(d, 'owed_by_me');
    add('snapshots', `snap:${d}`, { what: said(d), on: d, cash: usd(cash), owed_to_me: usd(toMe), owed_by_me: usd(byMe), net: usd(cash + toMe - byMe), taken: 'nightly' }, `snapshot ${d}`);
  }

  /* SERVICES PROJECTS RUN ON, with the GitHub key that renews in 12 days, as the site's Tidepool page says. */
  const services = [
    ['svc:stripe', 'Stripe', 'Stripe', 'saas', null, null, 'thing:tidepool', 'Payments for Tidepool.'],
    ['svc:vercel', 'Vercel', 'Vercel', 'hosting', plus(today, 40), usd(2_000), 'thing:tidepool', null],
    ['svc:github', 'GitHub', 'GitHub', 'saas', plus(today, 12), usd(4_000), 'thing:tidepool', 'The deploy key renews in 12 days.'],
    ['svc:aws', 'AWS', 'Amazon Web Services', 'hosting', dateIn(y, m + 1, 23), usd(CENTS.awsCard), 'thing:tidepool', null],
    ['svc:shopify', 'Shopify', 'Shopify', 'saas', dateIn(y, m + 1, 15), usd(3_900), 'thing:ferment', null],
    ['svc:domain', 'tidepool.example', 'Namecheap', 'domain', plus(today, 76), usd(1_400), 'thing:tidepool', null],
    ['svc:testflight', 'TestFlight', 'Apple', 'membership', plus(today, 133), usd(9_900), 'thing:pocketlab', 'The developer membership, yearly.'],
  ];
  for (const [key, name, provider, kind, renews, cost, thing, note] of services)
    add('services', key, { name, provider, kind, ...(renews ? { renews } : {}), ...(cost ? { cost } : {}), cycle: kind === 'domain' || kind === 'membership' ? 'yearly' : 'monthly', state: 'live', thing: ref(thing), ...(note ? { note } : {}) });

  /* STAGES: Pocketlab's road to launch. */
  [
    ['Private beta', true, -60],
    ['Onboarding screens', false, 10],
    ['Teacher accounts', false, 30],
    ['Public launch', false, 45],
  ].forEach(([name, done, aim], i) => add('stages', `stage:pocketlab-${i + 1}`, { name, thing: ref('thing:pocketlab'), done, order: i + 1, aim: plus(today, aim), ...(i === 3 ? { done_when: 'Teachers can sign up without an invite' } : {}) }));

  /* KEY NUMBERS AND THE NUMBERS UNDER THEM, the site's sparklines made into readings. */
  const kpis = [
    { key: 'kpi:tp-mrr', thing: 'thing:tidepool', name: 'Monthly revenue', unit: 'USD', kind: 'level', good: 'up', money: true, target_amount: usd(1_000_000), every: '1m', headline: true, points: [510_000, 540_000, 590_000, 630_000, 680_000, 720_000, 760_000, 795_000, CENTS.tidepoolPayout] },
    { key: 'kpi:tp-customers', thing: 'thing:tidepool', name: 'Customers', unit: 'customers', kind: 'count', good: 'up', every: '1m', points: [118, 131, 146, 158, 170, 181, 192, 205, 214] },
    { key: 'kpi:tp-churn', thing: 'thing:tidepool', name: 'Churn', unit: '%', kind: 'share', good: 'down', every: '1m', points: [2.6, 2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 2.1, 1.8] },
    { key: 'kpi:fe-orders', thing: 'thing:ferment', name: 'Orders a week', unit: 'orders', kind: 'flow', good: 'up', every: '1w', headline: true, points: [90, 96, 104, 99, 112, 118, 121, 128] },
    { key: 'kpi:nb-hours', thing: 'thing:northbound', name: 'Sprint hours', unit: 'hours', kind: 'progress', good: 'up', every: '1w', target: 40, headline: true, points: [6, 14, 21, 25] },
    { key: 'kpi:pl-beta', thing: 'thing:pocketlab', name: 'Beta users', unit: 'users', kind: 'count', good: 'up', every: '1w', target: 500, headline: true, points: [80, 120, 170, 220, 260, 310, 355, 412] },
  ];
  kpis.forEach((k, i) =>
    add('kpis', k.key, {
      name: k.name,
      thing: ref(k.thing),
      measures: k.name,
      source: 'numbers',
      measure: k.name,
      unit: k.unit,
      kind: k.kind,
      good: k.good,
      every: k.every,
      ...(k.target !== undefined ? { target: k.target } : {}),
      ...(k.target_amount ? { target_amount: k.target_amount } : {}),
      ...(k.headline ? { headline: true } : {}),
      order: i + 1,
      owner: 'maya',
      state: 'live',
    }),
  );
  for (const k of kpis) {
    const step = k.every === '1m' ? 30 : 7;
    k.points.forEach((v, i) => {
      const at = `${plus(today, -step * (k.points.length - 1 - i))}T12:00:00.000Z`;
      add('datapoints', `dp:${k.key.slice(4)}-${i + 1}`, { name: k.name, ...(k.money ? { amount: usd(v) } : { value: v }), unit: k.unit, thing: ref(k.thing), at, source: 'reported' }, `${k.name} ${at.slice(0, 10)}`);
    });
  }

  /* THREADS AND THEIR NEWS: where each project stands, said by whoever said it. */
  const tracks = [
    ['track:webhooks', 'Webhook retries', 'open', 'thing:tidepool', -18, 2],
    ['track:pricing', 'New pricing page', 'holding', 'thing:tidepool', -9, 12],
    ['track:onboarding', 'Onboarding', 'open', 'thing:pocketlab', -21, 10],
    ['track:wholesale', 'Wholesale', 'open', 'thing:ferment', -90, null],
    ['track:sprint', 'Sprint 14', 'open', 'thing:northbound', -10, 4],
  ];
  for (const [key, name, state, thing, opened, target] of tracks) add('tracks', key, { name, state, thing: ref(thing), opened: plus(today, opened), ...(target ? { target: plus(today, target) } : {}) });
  const updates = [
    ['upd:webhooks-1', 'track:webhooks', 'on_track', 'Claude', -6, 'The retry queue is in. Failed deliveries come back on 1, 5 and 30 minutes.'],
    ['upd:webhooks-2', 'track:webhooks', 'on_track', 'Claude', -1, 'Retries ship today. 18 tests pass, and the dashboard shows each retry.'],
    ['upd:pricing-1', 'track:pricing', 'at_risk', 'Maya', -2, "The pricing page waits on Dana's icons, due Friday."],
    ['upd:onboarding-1', 'track:onboarding', 'on_track', 'Cursor', -1, "Four of six screens done. The copy waits on Dana's icons."],
    ['upd:wholesale-1', 'track:wholesale', 'on_track', 'Maya', -4, 'Four shops now. Hart Street Grocer moved to every two weeks.'],
    ['upd:sprint-1', 'track:sprint', 'at_risk', 'ChatGPT', -3, 'Sam wants the next sprint a week later. Invoice 1042 is still unpaid.'],
  ];
  for (const [key, track, health, by, at, body] of updates) add('updates', key, { body, health, track: ref(track), by, at: `${plus(today, at)}T15:00:00.000Z` }, body);

  /* TO-DOS */
  const tasks = [
    ['task:retries', 'Ship webhook retries', 'doing', 'high', 'thing:tidepool', 'track:webhooks', 1, 'claude'],
    ['task:pricing', 'Put up the new pricing page', 'blocked', 'normal', 'thing:tidepool', 'track:pricing', 9, null, "Waits on Dana's icons."],
    ['task:github', 'Renew the GitHub deploy key', 'open', 'normal', 'thing:tidepool', null, 11, null],
    ['task:changelog', 'Write the monthly changelog', 'done', 'low', 'thing:tidepool', null, -2, 'claude'],
    ['task:onboarding', 'Finish the onboarding screens', 'doing', 'high', 'thing:pocketlab', 'track:onboarding', 9, 'cursor'],
    ['task:invite', 'Invite the next 100 beta teachers', 'open', 'normal', 'thing:pocketlab', null, 6, null],
    ['task:testflight', 'Fix the TestFlight build', 'done', 'normal', 'thing:pocketlab', null, -3, 'cursor'],
    ['task:hart', 'Pack the Hart Street Grocer order', 'open', 'high', 'thing:ferment', 'track:wholesale', Math.max(0, (toMs(friday) - toMs(today)) / MS_DAY - 1), null],
    ['task:jars', 'Reorder 500 jars', 'open', 'normal', 'thing:ferment', null, 5, null],
    ['task:labels', 'Label the new kimchi batch', 'done', 'low', 'thing:ferment', null, -1, null],
    ['task:sprint', 'Move the next sprint a week', 'open', 'high', 'thing:northbound', 'track:sprint', 2, 'chatgpt'],
    ['task:deck', 'Send the sprint review deck', 'done', 'normal', 'thing:northbound', 'track:sprint', -5, null],
    ['task:books', 'Send Leo the receipts for October', 'open', 'normal', null, null, 3, null],
  ];
  /* WHO THE WORK IS FOR, where it is for a client (leftovers 2 Nov, 12): a task's card says its client beside its
     project, and with none filed the demo never showed one. */
  const CLIENTS = { 'task:hart': 'org:hart', 'task:sprint': 'org:northbound', 'task:deck': 'org:northbound' };
  for (const [key, what, state, priority, thing, track, by, agent, why] of tasks)
    add('tasks', key, {
      what,
      state,
      priority,
      ...(thing ? { thing: ref(thing) } : {}),
      ...(CLIENTS[key] ? { client: ref(CLIENTS[key]) } : {}),
      ...(track ? { track: ref(track) } : {}),
      by: plus(today, by),
      ...(state === 'done' ? { done_on: plus(today, by) } : {}),
      ...(agent ? { agent } : {}),
      ...(why ? { why } : {}),
    });

  /* LEARNINGS SHE KEPT HERSELF. The agents add their own once they are connected (`agents` below). */
  const learnings = [
    ['learn:northbound-pay', 'Send Northbound invoices on the 1st, not the 15th.', 'Two invoices sent mid-month waited for the next payment run, and both were paid more than a week late.', 'rule', 'thing:northbound', 'invoicing'],
    ['learn:brine', 'Weigh the salt for each batch; never measure the brine by volume.', 'A batch made by the cup came out soft and 40 jars went back from The Pickle Room.', 'method', 'thing:ferment', 'fermenting'],
    ['learn:dana', "Book Dana's icon work two weeks before a page needs it.", 'The pricing page slipped a week twice because the icons were asked for in the same week.', 'rule', 'thing:tidepool', 'design'],
    ['learn:tax', 'Set aside 25% of every Tidepool payout for the quarterly tax.', 'Leo found the third quarter short by $700 after a month when nothing was set aside.', 'rule', 'thing:tidepool', 'tax'],
  ];
  for (const [key, lesson, because, kind, project, topic] of learnings) add('learnings', key, { lesson, because, kind, project: ref(project), topic, confirmed_on: plus(today, -7) }, lesson);

  /* ── the agents: connected after the rows, each with its own key, writing as itself ── */
  const agents = [
    {
      label: 'Claude',
      hints: { agent: 'claude', client: 'Claude Code', repo: 'tidepool', client_id: 'demo-claude-tidepool' },
      handoff: { doing: 'Shipping webhook retries', next: 'Ship webhook retries, then the retry dashboard', task: 'task:retries' },
      notes: [{ on: 'thing:tidepool', note: 'Shipped the retry queue. 18 tests pass.' }],
      learnings: [
        { lesson: 'Replay failed webhooks from the stored payload, never from Stripe again.', because: 'Asking Stripe for the event again hit the rate limit during the first retry storm and dropped 12 deliveries.', kind: 'method', topic: 'webhooks' },
      ],
      asks: [
        {
          cause: 'chase-northbound-1042',
          question: `Northbound's ${dollars(CENTS.northboundInvoice)} invoice is ${(toMs(today) - toMs(nbDue)) / MS_DAY} days late. Chase it?`,
          options: (bill) => [
            { id: 'chase', label: 'Chase it', because: 'A reminder in your words is drafted. Northbound usually pays in 9 days.', patches: [{ at: bill, patch: { chased: today, chase_draft: `Hi Sam, a quick note that invoice 1042 for ${dollars(CENTS.northboundInvoice)} was due on ${said(nbDue)}. Could you check where it is? Thanks, Maya` } }] },
            { id: 'later', label: 'Not now', because: 'Leave it a few more days.' },
          ],
          bill: 'bill:nb-1042',
        },
      ],
      widget: { gallery: 'spending', size: 'wide', question: 'You often ask what went out this month, so here it is at a glance.' },
    },
    {
      label: 'Cursor',
      hints: { agent: 'cursor', client: 'Cursor', repo: 'pocketlab', client_id: 'demo-cursor-pocketlab' },
      handoff: { doing: 'Building the onboarding screens', next: "Finish the last two onboarding screens once Dana's icons land", task: 'task:onboarding' },
      notes: [{ on: 'thing:pocketlab', note: "Onboarding copy waits on Dana's icons." }],
      learnings: [{ lesson: 'Build TestFlight uploads with the release scheme only.', because: 'A debug build went to the beta teachers and crashed on launch for everyone on an older phone.', kind: 'fact', topic: 'ios-release' }],
      asks: [],
    },
    {
      label: 'ChatGPT',
      hints: { agent: 'other', client: 'ChatGPT', client_id: 'demo-chatgpt-northbound' },
      handoff: { doing: 'Notes from the call with Sam', next: 'Move the next sprint a week, once Maya agrees', task: 'task:sprint', state: 'done' },
      notes: [{ on: 'thing:northbound', note: 'Call with Sam: Northbound wants the next sprint a week later.' }],
      learnings: [],
      asks: [
        {
          cause: 'pay-dana-friday',
          question: `Dana Reyes sent a ${dollars(CENTS.danaInvoice)} invoice, due ${said(friday)}. Pay it with the salaries?`,
          options: (bill) => [
            { id: 'plan', label: 'Plan it for Friday', because: 'Their invoice came in Monday. You paid the last three with the salaries.', patches: [{ at: bill, patch: { note: `Tidepool icons. Planned for ${said(friday)}, with the salaries.` } }] },
            { id: 'later', label: 'Not now', because: 'Decide closer to the day.' },
          ],
          bill: 'bill:dana-4',
        },
      ],
    },
  ];

  /* ── Today's widgets, from the gallery, in the order they are drawn ── */
  const widgets = [
    { gallery: 'cash-today', size: 'wide' },
    { gallery: 'owed-to-you', size: 'small' },
    { gallery: 'projects', size: 'wide' },
    { gallery: 'numbers', size: 'wide' },
    { gallery: 'coming-up', size: 'tall' },
    { gallery: 'next-up', size: 'tall' },
    { gallery: 'people-back', size: 'wide' },
  ];

  /* ── what the rows add up to, for a person to hold against the site ── */
  const open = (direction) => bills.filter((b) => b.direction === direction && !(b.paid && b.paid <= today));
  const sum = (xs) => xs.reduce((s, b) => s + b.cents, 0);
  const month = (offset) => dateIn(y, m + offset, 1).slice(0, 7);
  const earned = (thing, ym) => lines.filter((l) => l.thing === thing && l.direction === 'in' && l.on.startsWith(ym)).reduce((s, l) => s + l.cents, 0);
  /* WHAT GOES OUT A MONTH AFTER WHAT COMES IN, over the whole ledger, so it does not swing with where a month ends. */
  const span = (toMs(today) - toMs(start)) / MS_DAY + 1;
  const flow = (direction) => lines.filter((l) => !l.transfer && l.direction === direction).reduce((s, l) => s + l.cents, 0);
  const burn = Math.round(((flow('out') - flow('in')) / span) * (365 / 12));
  const figures = {
    cash: ACCOUNTS.business.end + ACCOUNTS.everyday.end,
    accounts: Object.fromEntries(Object.values(ACCOUNTS).map((a) => [a.name, a.end])),
    owedToYou: sum(open('owed_to_me')),
    late: open('owed_to_me').filter((b) => b.due < today).map((b) => ({ what: b.what, cents: b.cents, daysLate: (toMs(today) - toMs(b.due)) / MS_DAY })),
    youOwe: sum(open('owed_by_me')),
    burnPerMonth: burn,
    monthsOfCash: burn > 0 ? Math.round(((ACCOUNTS.business.end + ACCOUNTS.everyday.end) / burn) * 10) / 10 : null,
    tidepoolLastMonth: earned('thing:tidepool', month(-1)),
    ledgerLines: lines.length,
    from: start,
  };

  return { founder: { ...FOUNDER }, rows, categories, agents, widgets, figures, today };
}
