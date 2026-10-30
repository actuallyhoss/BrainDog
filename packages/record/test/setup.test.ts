/**
 * `setup`: a record set up in one call, by its owner.
 *
 * THE PRESS WAS A SCRIPT IN THE BROWSER, a dozen calls in a tab (`apps/web/src/routes/start/accept.ts`), and a closed
 * tab left the record part made: some add-ons, no entries and no person. Here the record does all of it in the one
 * call, so there is no tab to close between the parts.
 *
 * WHAT IS HELD: only the owner in a browser session reaches it; a body that is wrong writes nothing; a part that is
 * refused keeps the parts before it and is named in `failed` beside why; a record already set up refuses, unless
 * `again` is true, and then only what is missing is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type CallContext, type CatalogueEntry, type SetupAnswer } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };
const decider: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'decide' } };

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

const made = (pack: string, summary: string, more: Record<string, unknown>) => ({ pack, version: '1.0.0', summary, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} }, ...more });
const text = (id: string) => ({ id, type: 'text', required: true });

const PEOPLE = made('people', 'Who you work with.', {
  declarations: [
    {
      register: 'people',
      name: 'People',
      title: 'name',
      meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', self: 'self' },
      fields: [text('name'), { id: 'email', type: 'email', unique: true, index: true }, { id: 'met', type: 'list', of: 'text' }, { id: 'merged_into', type: 'ref', to: 'people' }, { id: 'self', type: 'bool' }, { id: 'note', type: 'text' }],
    },
  ],
});
const WORK = made('work', 'Tasks.', { declarations: [{ register: 'tasks', name: 'Tasks', title: 'what', fields: [text('what')] }] });
/** Clients, and invoices that point at one, with the currency the add-on keeps. */
const MONEY = made('money', 'Clients and invoices.', {
  config: { home_currency: { type: 'text', default: 'USD', label: 'Home currency' } },
  declarations: [
    { register: 'clients', name: 'Clients', title: 'name', fields: [text('name')] },
    { register: 'invoices', name: 'Invoices', title: 'what', fields: [text('what'), { id: 'party', type: 'ref', to: 'clients' }] },
  ],
});
const LEDGER = made('ledger', 'A ledger.', { declarations: [{ register: 'ledgers', name: 'Ledgers', title: 'what', fields: [text('what')] }] });
const NOTES = made('notes', 'Notes.', { declarations: [{ register: 'notes', name: 'Notes', title: 'what', fields: [text('what')] }] });

/** Six use cases over Work, each with a list of its own. */
const CASES = [
  ['study', 'Study', 'courses', 'Courses'],
  ['shop', 'Shop', 'orders', 'Orders'],
  ['studio', 'Studio', 'commissions', 'Commissions'],
  ['home', 'Home', 'chores', 'Chores'],
  ['club', 'Club', 'members', 'Members'],
  ['lab', 'Lab', 'samples', 'Samples'],
] as const;
const useCase = ([id, title, list, name]: (typeof CASES)[number]) => {
  const u = normaliseUseCase({
    usecase: id,
    version: '1.0.0',
    title,
    summary: `${name} and what is due.`,
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: [id],
    modules: ['work'],
    voice: { home: `${title} today` },
    labels: {},
    pack: made(`usecase-${id}`, `${name}.`, { declarations: [{ register: list, name, title: 'name', fields: [text('name')] }] }),
  });
  assert.ok(u.ok, JSON.stringify(u));
  return useCasePack(u.value)!;
};

/** A host's catalogue. `moved` is what a test flips to have the catalogue change under a setup that is running. */
function catalogue(moved: { ledger: boolean } = { ledger: false }): CatalogueEntry[] {
  return [
    { id: 'people', kind: 'pack', title: 'People', summary: 'Who you work with.', modules: [], doc: () => PEOPLE },
    { id: 'work', kind: 'pack', title: 'Work', summary: 'Tasks.', modules: [], doc: () => WORK },
    /* MONEY'S OWN STEP AFTER IT INSTALLS is where the test moves the catalogue: after the plan was read, mid-apply. */
    { id: 'money', kind: 'pack', title: 'Money', summary: 'Clients and invoices.', modules: [], doc: () => MONEY, afterInstall: async () => void (moved.ledger = true) },
    { id: 'ledger', kind: 'pack', title: 'Ledger', summary: 'A ledger.', modules: [], doc: () => (moved.ledger ? { ...LEDGER, pack: 'ledger-two' } : LEDGER) },
    { id: 'notes', kind: 'pack', title: 'Notes', summary: 'Notes.', modules: [], doc: () => NOTES },
    ...CASES.map((c) => ({ id: `usecase-${c[0]}`, kind: 'usecase' as const, title: c[1], summary: `${c[3]} and what is due.`, modules: ['work'], doc: () => useCase(c) })),
  ];
}

async function record(entries: CatalogueEntry[] = catalogue()) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: entries });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-desk', name: 'The Desk', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'sam@example.com' } }).ok);
  const rows = (list: string) => sql.all<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', list).map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  const on = () => api.kernel.packStates().filter((s) => s.disabled_at === null).map((s) => s.id);
  return { api, sql, rows, on };
}

test('SIX USE CASES IN ONE CALL: the first speaks, the others go beside it, and the owner, their words and their entries land with them', async () => {
  const { api, sql, rows, on } = await record();
  const out = value<SetupAnswer>(
    await api.setup(
      {
        usecase: 'study',
        alongside: ['shop', 'studio', 'home', 'club', 'lab'],
        packs: { install: ['people', 'money'] },
        me: { name: 'Sam Reed', email: 'sam@example.com', note: 'I study and sell prints.' },
        names: { courses: 'Modules' },
        settings: [{ values: { home_currency: 'GBP' } }],
        voice: { home: 'My desk' },
        rows: [{ register: 'courses', fields: { name: 'Anatomy' } }, { register: 'orders', fields: { name: 'Two prints' } }],
      },
      owner,
    ),
  );
  assert.deepEqual(out.failed, []);
  assert.equal(out.skipped, undefined);
  assert.deepEqual([...on()].sort(), ['money', 'people', 'usecase-club', 'usecase-home', 'usecase-lab', 'usecase-shop', 'usecase-studio', 'usecase-study', 'work']);
  assert.equal(out.done.installed?.length, 9);
  /* Study speaks, in the voice and the words they gave, and none of the five beside it took that. */
  const now = value<{ voice: { pack: string; said: Record<string, string> } }>(await api.arrangement({}, owner));
  assert.equal(now.voice.pack, 'usecase-study');
  assert.equal(now.voice.said.home, 'My desk');
  const study = value<{ values: Record<string, unknown> }>(api.kernel.packConfig('usecase-study')).values;
  assert.equal(study.label_courses, 'Modules');
  assert.equal(value<{ values: Record<string, unknown> }>(api.kernel.packConfig('money')).values.home_currency, 'GBP');
  /* The owner is the one person in People, marked as them, and the entries are in. */
  assert.deepEqual(out.done.me, ['people#1']);
  assert.equal(rows('people').length, 1);
  assert.equal(rows('people')[0]?.self, true);
  assert.equal(rows('people')[0]?.note, 'I study and sell prints.');
  assert.deepEqual(out.done.rows, ['courses#1', 'orders#1']);
  assert.deepEqual(rows('orders'), [{ name: 'Two prints' }]);
  /* Signed by the owner: every add-on's install is theirs in the log. */
  const by = sql.all<{ actor: string }>("SELECT DISTINCT actor FROM event WHERE target LIKE 'entry:%'").map((r) => r.actor);
  assert.deepEqual(by, ['p_owner']);
  sql.close();
});

test('ENTRIES WITH LINKS: an invoice points at the client the same call wrote, in a list the same call installed', async () => {
  const { api, sql, rows } = await record();
  const out = value<SetupAnswer>(
    await api.setup(
      {
        packs: { install: ['money'] },
        rows: [
          { register: 'clients', fields: { name: 'Fenwick' } },
          { register: 'invoices', fields: { what: 'Monthly retainer' }, links: { party: 0 } },
          { register: 'invoices', fields: { what: 'Logo' }, links: { party: 0 } },
        ],
      },
      owner,
    ),
  );
  assert.deepEqual(out.failed, []);
  assert.deepEqual(out.done, { installed: ['money'], rows: ['clients#1', 'invoices#1', 'invoices#2'] });
  /* A link is kept as the entry it points at. */
  const fenwick = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'clients'")?.id;
  assert.deepEqual(rows('invoices').map((r) => r.party), [fenwick, fenwick]);
  sql.close();
});

test('WITH PEOPLE OFF THE FIRST RUN STILL COMPLETES: the name is kept on the account, in no list, and People stays off', async () => {
  const { api, sql, rows, on } = await record();
  value(await api.setup({ packs: { install: ['people'] } }, owner));
  value(await api.disablePack({ id: 'people' }, owner));
  const out = value<SetupAnswer>(await api.setup({ again: true, usecase: 'study', me: { name: 'Layla Hassan', email: 'sam@example.com' }, rows: [{ register: 'courses', fields: { name: 'Anatomy' } }] }, owner));
  assert.deepEqual(out.failed, []);
  assert.deepEqual(out.done.me, ['account']);
  assert.equal(api.kernel.members().find((m) => m.person_id === 'p_owner')?.name, 'Layla Hassan');
  assert.equal(rows('people').length, 0);
  assert.ok(!on().includes('people'));
  assert.deepEqual(out.done.rows, ['courses#1']);
  sql.close();
});

test('A REFUSAL IN THE THIRD ADD-ON KEEPS THE FIRST TWO AND SAYS SO, and the parts after it that can still land do', async () => {
  const { api, sql, rows, on } = await record(catalogue({ ledger: false }));
  const out = value<SetupAnswer>(
    await api.setup(
      {
        packs: { install: ['work', 'money', 'ledger', 'notes'] },
        rows: [
          { register: 'clients', fields: { name: 'Fenwick' } },
          { register: 'ledgers', fields: { what: 'Main' } },
          { register: 'ledgers', fields: { what: 'Second' } },
          { register: 'invoices', fields: { what: 'Retainer' }, links: { party: 0 } },
        ],
      },
      owner,
    ),
  );
  /* Work and Money are in, and so is Notes, which came after the one refused. */
  assert.deepEqual(out.done.installed, ['work', 'money', 'notes']);
  assert.deepEqual([...on()].sort(), ['money', 'notes', 'work']);
  /* The third is named by the words a person reads, with why, and so are the entries that had nowhere to go. */
  assert.equal(out.failed.length, 2);
  assert.equal(out.failed[0]?.part, 'install:ledger');
  assert.equal(out.failed[0]?.label, 'Add Ledger');
  assert.match(out.failed[0]!.why, /names its pack ledger-two/);
  assert.deepEqual(out.failed[1], { part: 'rows:ledgers', label: 'Additions to Ledgers', why: 'Ledgers is not here, so its 2 entries were not written.' });
  /* The rest of the entries are written, the invoice still pointing at its client. */
  assert.deepEqual(out.done.rows, ['clients#1', 'invoices#1']);
  assert.deepEqual(rows('invoices'), [{ what: 'Retainer', party: sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'clients'")?.id }]);
  sql.close();
});

test('ONLY THE OWNER, IN A BROWSER SESSION: a token of any scope and a member who may decide are refused, and nothing is written', async () => {
  const { api, sql, on } = await record();
  const token = refusal(await api.setup({ usecase: 'study' }, agent));
  assert.equal(token.code, 'NEEDS_BROWSER_SESSION');
  assert.match(token.fix, /a token cannot set this BrainDog up/);
  assert.equal(refusal(await api.setup({ usecase: 'study' }, decider)).code, 'LEVEL_REQUIRED');
  assert.equal(refusal(await api.setup(undefined, owner)).at, 'body');
  assert.deepEqual(on(), []);
  sql.close();
});

test('A BODY THAT IS WRONG WRITES NOTHING: it is read whole before the first add-on goes in', async () => {
  const { api, sql, on } = await record();
  const wrong = refusal(await api.setup({ usecase: 'study', rows: [{ register: 'courses', fields: { teacher: 'Dr Said' } }] }, owner));
  assert.equal(wrong.code, 'FIELD_UNKNOWN');
  assert.equal(wrong.at, 'body.rows[0].fields.teacher');
  assert.equal(refusal(await api.setup({ usecase: 'nosuch' }, owner)).code, 'DECLARATION_UNKNOWN');
  assert.equal(refusal(await api.setup({ usecase: 'study', again: 'yes' }, owner)).at, 'again');
  assert.equal(refusal(await api.setup({ usecase: 'study', key: 'a key with spaces' }, owner)).at, 'key');
  assert.deepEqual(on(), []);
  sql.close();
});

test('A RECORD ALREADY SET UP REFUSES, naming what it holds, and with again writes only what is missing', async () => {
  const { api, sql, rows, on } = await record();
  const body = { usecase: 'study', packs: { install: ['people'] }, me: { name: 'Sam Reed', email: 'sam@example.com' }, rows: [{ register: 'courses', fields: { name: 'Anatomy' } }], key: 'first-run' };
  value<SetupAnswer>(await api.setup(body, owner));
  const twice = refusal(await api.setup(body, owner));
  assert.equal(twice.code, 'TRANSITION_ILLEGAL');
  assert.match(twice.fix, /^This BrainDog is set up already: it holds /);
  assert.match(twice.fix, /Study/);
  assert.doesNotMatch(twice.fix, /usecase-study/);

  /* The page presses it once more by itself after a call that was cut off: nothing is installed or written twice. */
  const again = value<SetupAnswer>(await api.setup({ ...body, again: true, packs: { install: ['people', 'money'] } }, owner));
  assert.deepEqual(again.failed, []);
  assert.deepEqual(again.done.installed, ['money']);
  assert.deepEqual(again.done.me, ['people#1']);
  assert.equal(again.done.rows, undefined);
  assert.deepEqual(again.skipped, [{ part: 'rows', label: 'Your entries', why: 'These entries were written by an earlier press, so they were not written again.' }]);
  assert.equal(rows('people').length, 1);
  assert.equal(rows('courses').length, 1);
  assert.deepEqual([...on()].sort(), ['money', 'people', 'usecase-study', 'work']);

  /* A file's entries come in pieces, each under its own handle, and each piece is written. */
  const more = value<SetupAnswer>(await api.setup({ again: true, key: 'import-1', rows: [{ register: 'courses', fields: { name: 'Physiology' } }] }, owner));
  assert.deepEqual(more.done, { rows: ['courses#2'] });
  sql.close();
});

test('WHAT HAS NOWHERE TO GO IS SAID AND PASSED OVER: a currency with no add-on to keep it does not stop a first run', async () => {
  const { api, sql, on } = await record();
  const out = value<SetupAnswer>(await api.setup({ packs: { install: ['work'] }, settings: [{ values: { home_currency: 'EGP' } }], names: { tasks: 'Bakes' } }, owner));
  assert.deepEqual(out.failed, []);
  assert.deepEqual(out.done, { installed: ['work'] });
  assert.deepEqual(out.skipped?.map((s) => s.part), ['setting:home_currency', 'name:tasks']);
  assert.deepEqual(on(), ['work']);
  sql.close();
});
