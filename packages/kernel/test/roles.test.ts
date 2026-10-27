/**
 * The kernel reads rates and people by the role a list declares, `rates:` and `meets:`, and not by the list's name.
 *
 * WHAT WAS MEASURED BEFORE THIS FILE: a founder's rates under the list id `rates`, or under `fx` with its own field
 * names, converted nothing and the figure said `USD to EGP` was missing; `meet` into a list called `contacts` with
 * exactly the fields `people` has was `REGISTER_UNKNOWN`; and a `people` list without `projects`, which is what the
 * seed gives a record that holds no Projects, was `FIELD_UNKNOWN at projects` at the first agent's call. Every case
 * below was run against that code first and failed, and the failures are in the report that landed this file.
 *
 * THE NAMED LISTS STILL READ. A record installed before the seed declares either key has `fx` and `people` with no
 * key, so the fallback is held here too, beside `fx.test.ts` and `people.test.ts`, which stay as they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Declaration, type Entry, type Kernel, type Met, type Reading, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = '2026-09-17';

type Refused = { ok: false; refusal: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refused = (r: unknown): Refused['refusal'] => {
  const x = r as { ok: boolean; refusal?: Refused['refusal'] };
  assert.equal(x.ok, false, 'it went through');
  return x.refusal!;
};

const register = (id: string, fields: object[], more: Record<string, unknown> = {}): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: (fields[0] as { id: string }).id, ...more, fields } }) as never;

/* ── rates ───────────────────────────────────────────────────────────────── */

const ACCOUNTS = register('accounts', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
]);

/** The four fields money-core's `fx` has, under whichever list id and key the case asks for. */
const RATE_FIELDS = [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
];
const RATES_ROLE = { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' };

const CASH = {
  metric: 'cash-now',
  name: 'Cash now',
  source: 'register.accounts',
  value: { sum: 'balance' },
  format: 'money.EGP',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
} as const;

/** A founder holding EGP 52,000 and USD 3,400, home currency EGP, the lists given installed beside the accounts. */
async function founder(lists: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([ACCOUNTS, ...lists]));
  for (const row of [
    { name: 'CIB', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-10' },
    { name: 'Mercury', balance: { amount: 340_000, currency: 'USD' }, as_of: '2026-09-10' },
  ])
    value(k.create('accounts', row, { actor: 'p_1' }));
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  value(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  return { k, sql };
}

const cash = (k: Kernel): Pick<Reading, 'value' | 'unit'> & { missing: readonly string[] } => {
  const out = value<Reading>(k.metric(CASH as never));
  return { value: out.value, unit: out.unit, missing: out.fx?.missing ?? [] };
};

/** 52,000 pounds and 3,400 dollars at 48: 215,200.00 pounds. */
const CONVERTED = { value: 21_520_000, unit: 'EGP', missing: [] };

test('A LIST CALLED rates DECLARING rates: IS WHERE THE RATES ARE, and without the key it is one more list', async () => {
  const bare = await founder([register('rates', RATE_FIELDS)]);
  value(bare.k.create('rates', { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual(cash(bare.k).missing, ['USD to EGP'], 'rates in a list nobody declared as the rates were read');
  bare.sql.close();

  const { k, sql } = await founder([register('rates', RATE_FIELDS, { rates: RATES_ROLE })]);
  value(k.create('rates', { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual(cash(k), CONVERTED);
  sql.close();
});

test('fx WITH ITS OWN FIELD NAMES CONVERTS once rates: says which field plays which part', async () => {
  const fields = [
    { id: 'from', type: 'text', required: true },
    { id: 'to', type: 'enum', values: ['EGP', 'USD'], required: true },
    { id: 'price', type: 'int', required: true },
    { id: 'day', type: 'day', required: true },
  ];
  const { k, sql } = await founder([register('fx', fields, { rates: { currency: 'from', base: 'to', rate: 'price', as_of: 'day' } })]);
  value(k.create('fx', { from: 'USD', to: 'EGP', price: 48, day: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual(cash(k), CONVERTED);
  sql.close();
});

test('fx WITH NO KEY READS AS IT ALWAYS HAS, for a record on a money-core older than the key', async () => {
  const { k, sql } = await founder([register('fx', RATE_FIELDS)]);
  value(k.create('fx', { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual(cash(k), CONVERTED);
  sql.close();
});

test('A SECOND LIST DECLARING rates: IS REFUSED, and so is one beside an fx that holds rates without the key', async () => {
  const { k, sql } = await founder([register('rates', RATE_FIELDS, { rates: RATES_ROLE })]);
  const second = refused(await k.install([register('crypto_rates', RATE_FIELDS, { rates: RATES_ROLE })]));
  assert.equal(second.code, 'DECLARATION_INVALID');
  assert.equal(second.fix, 'register.rates already declares rates:, and one list holds the rates.');
  assert.equal(second.at, 'rates');
  sql.close();

  /* THE LEGACY fx COUNTS AS A HOLDER, or installing this pack would move every figure off yesterday's rates in silence. */
  const old = await founder([register('fx', RATE_FIELDS)]);
  value(old.k.create('fx', { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' }, { actor: 'p_1' }));
  const beside = refused(await old.k.install([register('crypto_rates', RATE_FIELDS, { rates: RATES_ROLE })]));
  assert.equal(beside.code, 'DECLARATION_INVALID');
  assert.match(beside.fix, /^register\.fx holds this record's rates and declares no rates:/);
  assert.deepEqual(cash(old.k), CONVERTED, 'the refused install moved the rates');
  /* And fx itself taking the key is the update that ends the fallback, not a second holder. */
  value(await old.k.install([register('fx', RATE_FIELDS, { rates: RATES_ROLE })]));
  assert.deepEqual(cash(old.k), CONVERTED);
  old.sql.close();
});

test('AN fx HOLDING SOMETHING ELSE BLOCKS NOTHING AND CONVERTS NOTHING', async () => {
  const sounds = register('fx', [
    { id: 'name', type: 'text', required: true },
    { id: 'file', type: 'url' },
  ]);
  const alone = await founder([sounds]);
  value(alone.k.create('fx', { name: 'Door slam', file: 'https://example.com/slam.wav' }, { actor: 'p_1' }));
  assert.deepEqual(cash(alone.k).missing, ['USD to EGP']);
  alone.sql.close();

  const { k, sql } = await founder([sounds]);
  value(await k.install([register('rates', RATE_FIELDS, { rates: RATES_ROLE })]));
  value(k.create('rates', { currency: 'USD', base: 'EGP', rate: 48, as_of: '2026-09-01' }, { actor: 'p_1' }));
  assert.deepEqual(cash(k), CONVERTED);
  sql.close();
});

test('A rates: THAT NAMES A WRONG FIELD IS REFUSED AT INSTALL, naming the part', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const cases: [Record<string, unknown>, string, RegExp][] = [
    [{ ...RATES_ROLE, rate: 'currency' }, 'currency', /rate/],
    [{ ...RATES_ROLE, as_of: 'nowhere' }, 'rates', /nowhere for its as_of/],
    [{ currency: 'currency', base: 'base', rate: 'rate' }, 'rates', /as_of/],
    [{ ...RATES_ROLE, source: 'currency' }, 'rates', /source/],
    /* ONE FIELD FOR TWO PARTS installed clean before this check, and every row then had its currency equal to its base,
       which `ratesFrom` skips: the list held rates and converted nothing, with no refusal anywhere. */
    [{ ...RATES_ROLE, base: 'currency' }, 'currency', /base.*currency|currency.*base/],
  ];
  for (const [role, at, says] of cases) {
    const out = refused(await k.install([register('rates', RATE_FIELDS, { rates: role })]));
    assert.equal(out.code === 'DECLARATION_INVALID' || out.code === 'FIELD_UNKNOWN', true, `${JSON.stringify(role)}: ${out.code}`);
    assert.equal(out.at, at, JSON.stringify(role));
    assert.match(out.fix, says, JSON.stringify(role));
  }
  sql.close();
});

/* ── people ──────────────────────────────────────────────────────────────── */

const PROJECTS = register('things', [
  { id: 'name', type: 'text', required: true },
  { id: 'repos', type: 'list', of: 'text' },
], { scopes: { repos: 'repos' } });

/** A list of people under another id and other field names, with every part `meet` writes. */
const CONTACTS_FIELDS = [
  { id: 'full_name', type: 'text', required: true },
  { id: 'mail', type: 'email', unique: true, index: true },
  { id: 'accounts', type: 'list', of: 'text' },
  { id: 'work', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
  { id: 'seen', type: 'list', of: 'text' },
  { id: 'folded_into', type: 'ref', to: 'contacts' },
];
const CONTACTS_ROLE = { name: 'full_name', email: 'mail', handles: 'accounts', projects: 'work', met: 'seen', merged_into: 'folded_into' };

/** The six fields as the seed's People names them. */
const PEOPLE_FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'email', type: 'email', unique: true, index: true },
  { id: 'handles', type: 'list', of: 'text' },
  { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
  { id: 'met', type: 'list', of: 'text' },
  { id: 'merged_into', type: 'ref', to: 'people' },
];

const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = {
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id: 'cc-1', host: 'h', repo: 'braindog' },
};

async function met(lists: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; project: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ...lists]));
  const project = value<Entry>(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, OWNER)).id;
  return { k, sql, project };
}

test('A LIST CALLED contacts DECLARING meets: IS WHO MEET WRITES, under its own field names', async () => {
  const { k, sql, project } = await met([register('contacts', CONTACTS_FIELDS, { meets: CONTACTS_ROLE })]);
  assert.deepEqual(k.meetsList(), { register: 'contacts', fields: CONTACTS_ROLE });

  const ada = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'Ada@Example.com', handle: 'github:ada', where: 'commit 4464966 in braindog' }, AGENT));
  /* The answer also carries the row, how it was matched and how sure (contract-17's meet); these four are the older ones. */
  const picked = ({ person, created, linked, merge }: Met) => ({ person, created, linked, merge });
  assert.deepEqual(picked(ada), { person: 'contacts#1', created: true, linked: true, merge: null });
  const row = k.get('contacts#1')!;
  assert.deepEqual(row.fields, {
    full_name: 'Ada Lovelace',
    mail: 'ada@example.com',
    accounts: ['github:ada'],
    work: [project],
    seen: [`${DAY} · commit 4464966 in braindog`],
  });

  /* Matched by the mapped email, then by the mapped handle. */
  assert.equal(value<Met>(k.meet({ email: 'ADA@example.com', where: 'commit 5a7b1c2 in braindog' }, AGENT)).created, false);
  assert.equal(value<Met>(k.meet({ handle: 'github:Ada', where: 'commit 6c8d2e3 in braindog' }, AGENT)).created, false);
  assert.equal(k.count('contacts'), 1);

  /* A shared name asks about the pair on this list, and the fold writes the mapped field. */
  const twin = value<Met>(k.meet({ name: 'ada lovelace', email: 'ada@work.example', where: 'commit 77aa001 in braindog' }, AGENT));
  assert.deepEqual(picked(twin), { person: 'contacts#2', created: true, linked: true, merge: 'SG1' });
  const body = k.governanceRow('suggestion', 'SG1')!.body as { register: string; rows: { at: string; patch: Record<string, unknown> }[] };
  assert.equal(body.register, 'contacts');
  /* The fold comes first in the rowset now, the kept row's patch after it. */
  assert.equal(body.rows[0]?.patch.folded_into, 'contacts#1');
  assert.equal(value<Met>(k.meet({ email: 'ada@work.example', where: 'commit 88bb002 in braindog' }, AGENT)).merge, null, 'the pair was asked about twice');
  sql.close();
});

test('A meets: LIST WITH NO projects RECORDS THE PERSON AND LINKS NOBODY, which is a student’s record', async () => {
  const fields = PEOPLE_FIELDS.filter((f) => f.id !== 'projects');
  const role = { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into' };
  const { k, sql } = await met([register('people', fields, { meets: role })]);
  const out = value<Met>(k.meet({ name: 'Grace Hopper', email: 'grace@example.com', where: 'commit 1da177e in braindog' }, AGENT));
  assert.deepEqual({ person: out.person, created: out.created, linked: out.linked, merge: out.merge }, { person: 'people#1', created: true, linked: false, merge: null });
  assert.equal(k.get('people#1')!.fields.projects, undefined);
  sql.close();
});

test('A meets: WITH NO handles REFUSES A HANDLE, because there is nowhere to keep one', async () => {
  const fields = PEOPLE_FIELDS.filter((f) => f.id !== 'handles');
  const { k, sql } = await met([register('people', fields, { meets: { name: 'name', email: 'email', projects: 'projects', met: 'met', merged_into: 'merged_into' } })]);
  const out = refused(k.meet({ name: 'Grace', handle: 'github:grace', where: 'x' }, AGENT));
  assert.equal(`${out.code} at ${out.at}`, 'FIELD_UNKNOWN at handle');
  assert.equal(k.count('people'), 0);
  /* A bare name is a mention and adds nobody (contract-17), so the person met here comes with an address. */
  assert.equal(value<Met>(k.meet({ name: 'Grace', email: 'grace@example.com', where: 'x' }, AGENT)).person, 'people#1');
  sql.close();
});

test('A meets: THAT NAMES A TEXT FIELD AS met IS REFUSED AT INSTALL, naming met', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const fields = [...PEOPLE_FIELDS.filter((f) => f.id !== 'met'), { id: 'met', type: 'text' }];
  const role = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into' };
  const out = refused(await k.install([PROJECTS, register('people', fields, { meets: role })]));
  assert.equal(out.code, 'DECLARATION_INVALID');
  assert.equal(out.at, 'met');
  assert.match(out.fix, /met/);
  assert.match(out.fix, /list of text/);

  /* And the rest of what meet relies on, each named where it fails. */
  const wrong: [Record<string, unknown>, object[], string][] = [
    [{ ...role, merged_into: 'name' }, PEOPLE_FIELDS, 'name'],
    [role, PEOPLE_FIELDS.map((f) => (f.id === 'merged_into' ? { ...f, to: 'things' } : f)), 'merged_into'],
    [role, PEOPLE_FIELDS.map((f) => (f.id === 'projects' ? { id: 'projects', type: 'list', of: 'ref', to: 'people' } : f)), 'projects'],
    [{ ...role, email: undefined }, PEOPLE_FIELDS, 'meets'],
    /* A LIST OF REFS IS NOT A LIST OF TEXT. Nothing drove the `of` half of the check before this row: with it removed,
       every other case here still passed. */
    [role, PEOPLE_FIELDS.map((f) => (f.id === 'handles' ? { id: 'handles', type: 'list', of: 'ref', to: 'things' } : f)), 'handles'],
    /* ONE FIELD FOR TWO PARTS, measured before this check: `met: 'handles'` installed clean, and the first meet with a
       handle wrote `handles: ['2026-09-17 · commit abc']`, the handle overwritten by the line saying where. */
    [{ ...role, met: 'handles' }, PEOPLE_FIELDS, 'handles'],
  ];
  for (const [r, f, at] of wrong) {
    const said = refused(await k.install([PROJECTS, register('people', f, { meets: JSON.parse(JSON.stringify(r)) })]));
    assert.equal(said.at, at, `${JSON.stringify(r)}: ${said.fix}`);
  }
  sql.close();
});

test('A SECOND meets: IS REFUSED, and so is one beside a people list that holds people without the key', async () => {
  const { k, sql } = await met([register('contacts', CONTACTS_FIELDS, { meets: CONTACTS_ROLE })]);
  const second = refused(
    await k.install([register('people', PEOPLE_FIELDS, { meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' } })]),
  );
  assert.equal(second.fix, 'register.contacts already declares meets:, and one list holds the people meet writes.');
  sql.close();

  const old = await met([register('people', PEOPLE_FIELDS)]);
  const beside = refused(await old.k.install([register('contacts', CONTACTS_FIELDS, { meets: CONTACTS_ROLE })]));
  assert.equal(beside.code, 'DECLARATION_INVALID');
  assert.match(beside.fix, /^register\.people holds this record's people and declares no meets:/);
  assert.equal(value<Met>(old.k.meet({ name: 'Ada', email: 'ada@example.com', where: 'x' }, OWNER)).person, 'people#1');
  old.sql.close();

  /* A people list without meet's fields is somebody's cast list, and blocks nothing. */
  const cast = await met([register('people', [{ id: 'name', type: 'text' }, { id: 'part', type: 'text' }])]);
  value(await cast.k.install([register('contacts', CONTACTS_FIELDS, { meets: CONTACTS_ROLE })]));
  assert.equal(value<Met>(cast.k.meet({ name: 'Ada', email: 'ada@example.com', where: 'x' }, OWNER)).person, 'contacts#1');
  cast.sql.close();
});

test('WITH NEITHER A meets: NOR A people LIST, meet refuses and says what would fix it', async () => {
  const { k, sql } = await met([register('contacts', CONTACTS_FIELDS)]);
  assert.equal(k.meetsList(), null);
  const out = refused(k.meet({ name: 'Ada', where: 'x' }, AGENT));
  assert.equal(`${out.code} at ${out.at}`, 'REGISTER_UNKNOWN at register');
  assert.equal(out.fix, 'No list declares meets:, so nobody can be met. Nothing was written.');
  assert.equal(k.count('contacts'), 0);
  sql.close();
});

test('A meets: THAT NAMES in_touch HAS THE DAY MOVED FORWARD BY EVERY MEET, and never back', async () => {
  /* People's Last in touch was only ever typed, so a record whose people came from agents read nobody in touch. */
  const fields = [...PEOPLE_FIELDS, { id: 'last', type: 'day' }];
  const role = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', in_touch: 'last' };
  const { k, sql } = await met([register('people', fields, { meets: role })]);
  assert.deepEqual(k.meetsList(), { register: 'people', fields: role });

  value(k.meet({ name: 'Ada', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, AGENT));
  assert.equal(k.get('people#1')!.fields.last, DAY, 'a new person was not stamped in touch today');

  value(k.create('people', { name: 'Grace', email: 'grace@example.com', last: '2026-08-01' }, OWNER));
  value(k.meet({ email: 'grace@example.com', where: 'commit 1 in braindog' }, AGENT));
  assert.equal(k.get('people#2')!.fields.last, DAY, 'an older day was left standing');

  value(k.create('people', { name: 'Alan', email: 'alan@example.com', last: '2026-12-01' }, OWNER));
  value(k.meet({ email: 'alan@example.com', where: 'commit 2 in braindog' }, AGENT));
  assert.equal(k.get('people#3')!.fields.last, '2026-12-01', 'a later day the person typed was moved back');
  sql.close();

  /* A field that is not a day cannot play it, and the install says so. */
  const sql2 = openSqlite();
  const k2 = await openRecord(sql2, fixedClock(NOW));
  const wrong = refused(await k2.install([PROJECTS, register('people', [...PEOPLE_FIELDS, { id: 'last', type: 'text' }], { meets: role })]));
  assert.match(wrong.fix, /in_touch/);
  sql2.close();
});

test('A MERGE OF TWO PEOPLE KEEPS THE LATER DAY IN TOUCH of the two', async () => {
  const fields = [...PEOPLE_FIELDS, { id: 'last', type: 'day' }];
  const role = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', in_touch: 'last' };
  const { k, sql } = await met([register('people', fields, { meets: role })]);
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com', last: '2026-06-01' }, OWNER));
  /* A COMMIT AND NOT A MAIL: a mail is text anybody could have written, and a stranger met in one who looks like Ada is
     only offered to her as an address (`people.ts`'s `offerArrival`), never asked about as a merge. */
  const twin = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  const body = k.governanceRow('suggestion', twin.merge!)!.body as { rows: { at: string; patch: Record<string, unknown> }[] };
  assert.equal(body.rows.find((r) => r.at === 'people#1')?.patch.last, DAY, 'the kept person lost the newer day');
  sql.close();
});

test('A people LIST WITH NO KEY PLAYS in_touch ONLY WHEN IT HAS THE DAY FIELD, so an older record is met as before', async () => {
  const { k, sql } = await met([register('people', [...PEOPLE_FIELDS, { id: 'in_touch', type: 'day' }])]);
  assert.equal(k.meetsList()?.fields.in_touch, 'in_touch');
  value(k.meet({ name: 'Ada', email: 'ada@example.com', where: 'x' }, AGENT));
  assert.equal(k.get('people#1')!.fields.in_touch, DAY);
  sql.close();
});

test('THE people LIST WITH NO KEY IS STILL MET, and a field it lacks is named without blaming a pack that never declared it', async () => {
  const { k, sql } = await met([register('people', PEOPLE_FIELDS)]);
  assert.deepEqual(k.meetsList(), {
    register: 'people',
    fields: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into' },
  });
  assert.equal(value<Met>(k.meet({ name: 'Ada', email: 'ada@example.com', where: 'x' }, AGENT)).linked, true);
  sql.close();

  const plain = await met([register('people', [{ id: 'name', type: 'text' }, { id: 'email', type: 'text' }])]);
  const out = refused(plain.k.meet({ name: 'Ada', where: 'x' }, AGENT));
  assert.equal(`${out.code} at ${out.at}`, 'FIELD_UNKNOWN at handles');
  assert.doesNotMatch(out.fix, /agents pack/);
  assert.match(out.fix, /meets:/);
  plain.sql.close();
});
