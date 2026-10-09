/**
 * An arrangement carries the whole list (REC-A06 job 5, steps 5 and 6, and F67): one proposal installs an add-on, changes
 * a setting of one already here, patches an entry and declares a daily feed, and the owner reads it as one question of
 * four parts. Each call out is listed by host and how often, each key it needs names the parts that need it, and an
 * accept that leaves one part unticked leaves one question open holding that part.
 *
 * The add-ons are made up: "Stripe" here is a pack of this test's own, polling a host that answers nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrangePartsOf } from '@braindog/kernel';

import type { Host, Installed } from '@braindog/declare';

import { arrangeUnion, arranger } from '../src/arrange.ts';
import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal!;
};
type Body = Record<string, unknown> & { parts?: { id: string; label: string }[]; needs?: { label: string; opens: string; scheduled: boolean; parts: string[] }[]; calls?: unknown[] };

const BOOKS = {
  pack: 'books',
  version: '1.0.0',
  summary: 'Accounts and the currency they are kept in.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: { currency: { type: 'text', default: 'EGP', label: 'Currency' } },
  declarations: [{ register: 'accounts', name: 'Accounts', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] }],
};
const STRIPE = {
  pack: 'stripe',
  version: '1.0.0',
  summary: 'Charges, read once a day.',
  author: 'Halden',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'charges', name: 'Charges', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'decimal' }] },
    { ingest: 'stripe_charges', channel: 'poll', url: 'https://api.stripe.com/v1/charges', every: '1d', grant: 'Stripe', map: { what: { value: 'Charge' }, amount: { path: 'amount', type: 'decimal' } }, writes: { register: 'charges' } },
  ],
};
/* THE DAILY FEED THE PROPOSAL DECLARES ITSELF, writing to a list already here. */
const FEED = {
  id: 'ingest.rates',
  kind: 'ingest',
  body: { ingest: 'rates', channel: 'poll', url: 'https://rates.example.org/latest', every: '1d', grant: 'Rates', map: { what: { value: 'Rate' }, note: { path: 'rate', type: 'text' } }, writes: { register: 'accounts' } },
};
const CATALOGUE: CatalogueEntry[] = [
  { id: 'books', kind: 'pack', title: 'Books', summary: BOOKS.summary, modules: [], doc: () => BOOKS },
  { id: 'stripe', kind: 'pack', title: 'Stripe', summary: STRIPE.summary, modules: [], doc: () => STRIPE },
];

/** A fresh founder's record with Books in and one account, Cash. */
async function founder() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: CATALOGUE });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const planned = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc: BOOKS } as never, owner));
  value(await api.installPack({ doc: BOOKS, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  /* THE TWO KEYS IT CALLS OUT WITH ARE IN THE VAULT, as accepting asks. */
  for (const [label, opens] of [['Stripe', 'api.stripe.com'], ['Rates', 'rates.example.org']] as const)
    assert.ok(api.kernel.bindGrant({ label, opens, kind: 'api_token', ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_1' } as never, 'p_owner').ok);
  const cash = api.kernel.create('accounts', { what: 'Cash' } as never, { actor: 'p_owner' });
  assert.ok(cash.ok);
  return { api, sql, at: api.kernel.nameOf(cash.value.id), version: cash.value.version };
}

/**
 * THE FOUR-PART QUESTION AS THE RECORD FILES IT. `propose` refuses entries in an arrangement from anybody but Slash
 * (record `index.ts`, "carries no rows"), so it is prepared here by the record's own arranger over the same record and
 * opened through the kernel; the owner's yes then goes through `decide` as it would from Decide.
 */
async function fileFour(api: Awaited<ReturnType<typeof founder>>['api'], at: string, version: number, without: readonly string[] = []) {
  const k = api.kernel;
  const host = (actor: string): Host => ({
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, fields as never, { actor, cascade: false }) as never,
    remember: (row) => k.rememberPack({ ...row, by: actor } as never),
    forget: (id) => k.forgetPack(id),
    claimed: (pack) => k.packClaims(pack),
  });
  const installed = (): Installed => ({
    format: 1,
    primitives: 1,
    record_version: k.version(),
    packs: k.packs(),
    declarations: k.declarations() as Installed['declarations'],
    rows: k.census(),
    config: k.packSettings(),
  });
  const a = arranger({ kernel: k, catalogue: CATALOGUE, installed, host });
  const asked: Record<string, unknown> = four(at, version);
  for (const key of without) delete asked[key];
  const body = value<Body>(await a.prepare('arrange', asked));
  return { id: value<{ id: string }>(k.propose({ question: 'Take card payments and keep the rate?', body_kind: 'arrange', body } as never, 'agent:claude')).id, a, body };
}

const four = (at: string, version: number) => ({
  why: ['They take card payments now and want the day’s rate beside each account.'],
  packs: { install: ['stripe'] },
  settings: [{ pack: 'books', values: { currency: 'USD' } }],
  rows: [{ register: 'accounts', at, version, patch: { note: 'Kept in dollars' } }],
  declarations: [FEED],
  /* WHAT A PROPOSER SAYS IT NEEDS AND CALLS IS NOT READ. */
  needs: [{ label: 'Anything', opens: 'collector.example.com', scheduled: false }],
  calls: [{ part: 'install:stripe', host: 'collector.example.com', every: '1m' }],
});

/** What a person reads: no em dash, no "row", no id of a record. */
const plain = (said: string) => {
  assert.doesNotMatch(said, /—/u);
  assert.doesNotMatch(said, /\brows?\b/iu);
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u);
};

const PARTS = ['install:stripe', 'setting:books', 'rows:accounts', 'declaration:ingest.rates'];

test('ONE PROPOSAL, FOUR PARTS: an install, a setting, a patch and a daily feed are one question, each call by host and how often', async () => {
  const { api, sql, at, version } = await founder();
  const filed = await fileFour(api, at, version);
  const body = value<{ body: Body }>(await api.governance({ id: filed.id }, owner)).body;

  assert.deepEqual(body.parts?.map((p) => p.id), PARTS);
  for (const p of body.parts ?? []) plain(p.label);
  /* THE KERNEL READS THE SAME FOUR, so the parts the owner unticks are the parts it takes. */
  assert.deepEqual(arrangePartsOf(body).map((p) => p.id).sort(), [...PARTS].sort());
  assert.deepEqual(body.needs, [
    { label: 'Stripe', opens: 'api.stripe.com', scheduled: true, parts: ['install:stripe'] },
    { label: 'Rates', opens: 'rates.example.org', scheduled: true, parts: ['declaration:ingest.rates'] },
  ]);
  assert.deepEqual(body.calls, [
    { part: 'install:stripe', host: 'api.stripe.com', every: '1d', per_day: null },
    { part: 'declaration:ingest.rates', host: 'rates.example.org', every: '1d', per_day: null },
  ]);
  assert.ok((body.approve as string[]).some((l) => l.startsWith('CALLS OUT rates.example.org · every 1d')), JSON.stringify(body.approve));

  /* THE OWNER'S ONE YES, AND ALL FOUR HAVE HAPPENED. */
  value(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.ok(api.kernel.packs().some((p) => p.id === 'stripe'));
  assert.equal(value<{ values: Record<string, unknown> }>(api.kernel.packConfig('books')).values.currency, 'USD');
  assert.equal(api.kernel.get(at)?.fields.note, 'Kept in dollars');
  assert.ok(api.kernel.declarations().some((d) => d.id === 'ingest.rates'));
  sql.close();
});

test('ONE PART UNTICKED LEAVES ONE QUESTION OPEN, holding that part, and the rest has happened', async () => {
  const { api, sql, at, version } = await founder();
  const filed = await fileFour(api, at, version);
  value(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'not the feed yet', parts: PARTS.slice(0, 3) } }, owner));

  const left = value<{ status: string; body: Body }>(await api.governance({ id: filed.id }, owner));
  assert.equal(left.status, 'open');
  assert.deepEqual(left.body.parts?.map((p) => p.id), ['declaration:ingest.rates']);
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'ingest.rates'), 'the feed went in without a yes');
  assert.ok(api.kernel.packs().some((p) => p.id === 'stripe'));
  assert.equal(api.kernel.get(at)?.fields.note, 'Kept in dollars');
  sql.close();
});

test('A DECLARATION IS CHECKED AS A CHANGE IS, at filing: a page goes under pages, and a feed into a field its list lacks is refused there', async () => {
  const { api, sql, at, version } = await founder();
  /* FROM AN AGENT, THROUGH `propose`, three of the four: the patch waits on the record letting an agent's entries in. */
  const { rows: _rows, ...three } = four(at, version);
  const asked = value<{ id: string }>(await api.propose({ question: 'Take card payments?', body_kind: 'arrange', body: three } as never, agent));
  assert.deepEqual(value<{ body: Body }>(await api.governance({ id: asked.id }, owner)).body.parts?.map((p) => p.id), ['install:stripe', 'setting:books', 'declaration:ingest.rates']);
  const page = { ...three, declarations: [{ id: 'page.rates', kind: 'page', body: { page: 'rates', title: 'Rates', blocks: [] } }] };
  const one = refusal(await api.propose({ question: 'A page?', body_kind: 'arrange', body: page } as never, agent));
  assert.equal(one.at, 'body.declarations[0]');
  const nowhere = { ...three, declarations: [{ ...FEED, body: { ...FEED.body, map: { ...FEED.body.map, nosuch: { path: 'x', type: 'text' } } } }] };
  const two = refusal(await api.propose({ question: 'A feed?', body_kind: 'arrange', body: nowhere } as never, agent));
  assert.equal(two.code, 'FIELD_UNKNOWN');
  /* THE PART AT FAULT IS NAMED, by its place among the declarations sent. */
  assert.match(two.at ?? '', /^body\.declarations\[0\]: /u, two.at);
  sql.close();
});

test('TWO ARRANGEMENTS WITH ONE CAUSE ARE ONE (arrangeUnion): every part of both, each key once, needed by the parts of both', () => {
  const open = {
    why: ['Card payments.'],
    packs: { install: ['stripe'] },
    approve: ['CALLS OUT api.stripe.com · every 1d · grant "Stripe"', 'Keys reach all.'],
    needs: [{ label: 'Stripe', opens: 'api.stripe.com', scheduled: true, parts: ['install:stripe'] }],
    rows: [{ register: 'accounts', fields: { what: 'Card' } }],
    parts: [{ id: 'install:stripe', kind: 'install', label: 'Add Stripe', pack: 'stripe' }, { id: 'rows:accounts', kind: 'rows', label: 'Additions to Accounts', register: 'accounts' }],
  };
  const next = {
    why: ['Card payments.', 'The rate each day.'],
    packs: { install: ['stripe'] },
    approve: ['CALLS OUT api.stripe.com · every 1d · grant "Stripe"', 'CALLS OUT rates.example.org · every 1d · grant "Stripe"'],
    needs: [{ label: 'Stripe', opens: 'rates.example.org', scheduled: true, parts: ['declaration:ingest.rates'] }],
    rows: [{ register: 'accounts', fields: { what: 'Bank' } }, { register: 'accounts', fields: { what: 'Sub' }, links: { parent: 0 } }],
    declarations: [FEED],
    parts: [{ id: 'install:stripe', kind: 'install', label: 'Add Stripe', pack: 'stripe' }, { id: 'declaration:ingest.rates', kind: 'declaration', label: 'Add rates' }],
  };
  const both = arrangeUnion(open, next) as Body & { rows: { links?: Record<string, number> }[] };
  assert.deepEqual(both.why, ['Card payments.', 'The rate each day.']);
  assert.deepEqual(both.packs, { install: ['stripe'] });
  assert.deepEqual(both.parts?.map((p) => p.id), ['install:stripe', 'rows:accounts', 'declaration:ingest.rates']);
  assert.deepEqual(both.needs, [{ label: 'Stripe', opens: 'api.stripe.com', scheduled: true, parts: ['install:stripe', 'declaration:ingest.rates'] }]);
  assert.equal(both.rows.length, 3);
  assert.deepEqual(both.rows[2]?.links, { parent: 1 }, 'a link of the next one points past the open one');
  assert.equal((both.approve as string[]).length, 3);
});

/* WHAT A DECLARATION CALLS OUT IS ASKED ONCE, and only when it is new. */
const SETTING = [{ pack: 'books', values: { currency: 'USD' } }];

test('A FEED ALREADY IN, CHANGED WITHOUT CHANGING WHERE IT CALLS, asks nothing new and lands on the yes', async () => {
  const { api, sql } = await founder();
  assert.ok((await api.kernel.install([FEED as never], undefined, { actor: 'p_owner' })).ok);
  const moved = { ...FEED, body: { ...FEED.body, map: { ...FEED.body.map, note: { path: 'rate_now', type: 'text' } } } };
  const asked = value<{ id: string }>(await api.propose({ question: 'Read the rate from its new place?', body_kind: 'arrange', body: { why: ['The rate moved.'], settings: SETTING, declarations: [moved] } } as never, agent));
  const body = value<{ body: Body }>(await api.governance({ id: asked.id }, owner)).body;
  assert.equal(body.calls, undefined);
  assert.equal(body.needs, undefined);
  /* REFUSED AT THE YES BEFORE: the line it was never asked about counted as one it called out unshown. */
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const now = JSON.parse((api.kernel.declarations().find((d) => d.id === 'ingest.rates') as { body: string }).body) as { map: { note: { path: string } } };
  assert.equal(now.map.note.path, 'rate_now');
  sql.close();
});

test('A DIGEST THAT POSTS OUT IS ASKED ABOUT, as a change asks: its host and when, on the question and in its lines', async () => {
  const { api, sql } = await founder();
  const HOOK = {
    id: 'digest.weekly',
    kind: 'digest',
    body: { digest: 'weekly', schedule: { day: 'mon', at: '08:00' }, channels: ['webhook'], webhook: { url: 'https://collector.example.com/in' }, sections: [{ heading: 'Accounts', source: 'register.accounts', as: 'table', columns: [{ field: 'what' }] }] },
  };
  const asked = value<{ id: string }>(await api.propose({ question: 'Post the accounts each week?', body_kind: 'arrange', body: { why: ['A weekly post.'], settings: SETTING, declarations: [HOOK] } } as never, agent));
  const body = value<{ body: Body }>(await api.governance({ id: asked.id }, owner)).body;
  assert.ok((body.approve as string[]).some((l) => l.startsWith('CALLS OUT collector.example.com · weekly on mon at 08:00')), JSON.stringify(body.approve));
  assert.deepEqual(body.calls, [{ part: 'declaration:digest.weekly', host: 'collector.example.com', every: 'weekly on mon at 08:00', per_day: null }]);
  sql.close();
});

test('TWO PARTS TAKEN, THE LATER ONE FAILING: the earlier is taken back, nothing of the take stays, and the question stays open', async () => {
  const { api, sql, at, version } = await founder();
  const filed = await fileFour(api, at, version);
  /* THE FEED WILL NOT GO IN at the yes, after the add-on has: the host refuses it, as it would a vault that moved. */
  const k = api.kernel as { install: (...a: unknown[]) => Promise<unknown> };
  const real = k.install.bind(k);
  k.install = async (batch, ...rest) =>
    (batch as { id: string }[]).some((x) => x.id === 'ingest.rates') ? { ok: false, refusal: { code: 'PLAN_STALE', fix: 'Not now.' } } : real(batch, ...rest);
  const took = await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'the add-on and the feed', parts: ['install:stripe', 'declaration:ingest.rates'] } }, owner);
  k.install = real;
  const stopped = refusal(took);
  assert.doesNotMatch(stopped.fix, /Already applied, and kept/u, stopped.fix);
  assert.ok(!api.kernel.packs().some((p) => p.id === 'stripe'), 'the add-on stayed in without the feed');
  assert.ok(!api.kernel.declarations().some((d) => d.id === 'ingest.rates'));
  const left = value<{ status: string; body: Body }>(await api.governance({ id: filed.id }, owner));
  assert.equal(left.status, 'open');
  assert.deepEqual(left.body.parts?.map((p) => p.id).sort(), [...PARTS].sort(), 'the question lost a part it never took');
  sql.close();
});
