/**
 * The names one automation's read answers beside its body (`automation-names.ts`, `automations.ts`'s `automation`).
 *
 * MEASURED BEFORE THIS: the read of one automation answered its row, its body, its runs and `older`, and no name of
 * anything the body points at, so a card printed a list, a call or a figure by its id in words, and the editor's names
 * map knew only the lists the page had loaded itself. Now the body's every pick is named by the grammar's `from`, and
 * anything the caller cannot see, or that is gone, has no name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PEOPLE, COMPANIES } from '../../../fixtures/names.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { automation } from '../src/automations.ts';
import { automationNames, listsNamed, type NamesRead } from '../src/automation-names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const MARA = PEOPLE[1]!;
const TEO = PEOPLE[2]!;

/** A read over plain maps, as the record's would answer them: `null` for anything it does not hold. */
function reading(o: { lists?: Record<string, string>; fields?: Record<string, string>; people?: Record<string, string>; decls?: Record<string, string>; figures?: Record<string, string> }): NamesRead {
  return {
    listTitle: (id) => o.lists?.[id] ?? null,
    fieldTitle: (list, id) => o.fields?.[`${list}.${id}`] ?? null,
    personName: (id) => o.people?.[id] ?? null,
    declarationTitle: (id) => o.decls?.[id] ?? null,
    figureTitle: (id) => o.figures?.[id] ?? null,
  };
}

const EVERYTHING = reading({
  lists: { ledger: 'Ledger', clients: 'Clients' },
  fields: { 'clients.code': 'Client code', 'ledger.amount': 'Amount' },
  people: { p_mara: MARA.name },
  decls: { 'ingest.rates': 'Exchange rates', 'script.tidy': 'Tidy the ledger', 'job.weekly-notes': 'Weekly notes' },
  figures: { 'cash-now': 'Cash now' },
});

test('A RULE TOUCHING A LIST, A FIELD, A PERSON, A CALL, A SCRIPT AND A FIGURE ANSWERS ALL SIX NAMES', () => {
  /* THE WALK READS EVERY ARGUMENT THE GRAMMAR NAMES, whatever mix of them the lint would install, which is
     `checkAutomation`'s to say: a figure is only ever a trigger's, so this one rule holds the six at once. */
  const body = {
    rule: 'watch_cash',
    on: { metric: { id: 'cash-now', crosses: { lte: 0 } } },
    steps: [
      { link: { to: { register: 'clients', by: 'code', value: 'C-1' } } },
      { ask_person: { question: 'Top up?', options: ['yes', 'no'], to: 'p_mara', as: 'top_up' } },
      { call: { ingest: 'rates', as: 'rates' } },
      { script: { id: 'tidy' } },
    ],
  };
  assert.deepEqual(automationNames(body, EVERYTHING), {
    'metric.cash-now': 'Cash now',
    'register.clients': 'Clients',
    'clients.code': 'Client code',
    'person:p_mara': MARA.name,
    'ingest.rates': 'Exchange rates',
    'script.tidy': 'Tidy the ledger',
  });
});

test("A FIELD UNDER ITS STEP IS THE ROW'S, and a written rule names its list and the fields it listens to", () => {
  const body = { rule: 'stamp', on: { written: { register: 'ledger', fields: ['amount'] } }, steps: [{ set: { field: 'amount', to: '0' } }, { run_job: { kind: 'job.weekly-notes' } }] };
  assert.deepEqual(automationNames(body, EVERYTHING), { 'register.ledger': 'Ledger', 'ledger.amount': 'Amount', 'job.weekly-notes': 'Weekly notes' });
  /* A RULE FROM BEFORE `on:` names its list by `register`, and its `then` is walked as `steps` is. */
  assert.deepEqual(automationNames({ rule: 'old', register: 'ledger', on: 'create', then: [{ set: { field: 'amount', to: '1' } }] }, EVERYTHING), {
    'register.ledger': 'Ledger',
    'ledger.amount': 'Amount',
  });
});

test("A BRANCH'S ARMS ARE WALKED, both of them, at any depth", () => {
  const body = {
    rule: 'branchy',
    on: { manual: true },
    steps: [
      {
        if: 'vars.a is 1',
        then: [{ if: 'vars.b is 2', then: [{ call: { ingest: 'rates' } }], else: [{ run: 'rates' }] }],
        else: [{ script: { id: 'tidy' } }, { ask_person: { question: 'Who?', options: ['me'], to: 'p_mara', as: 'who' } }],
      },
    ],
  };
  assert.deepEqual(automationNames(body, EVERYTHING), { 'ingest.rates': 'Exchange rates', 'script.tidy': 'Tidy the ledger', 'person:p_mara': MARA.name });
});

test('A BODY WITH NO NAMES ANSWERS {}, and a hole the run fills is no id', () => {
  assert.deepEqual(automationNames({ rule: 'hello', on: { manual: true }, steps: [{ note: 'hello' }, { wait: '1h' }] }, EVERYTHING), {});
  const holed = { rule: 'ask', on: { manual: true }, steps: [{ ask_person: { question: 'Ok?', options: ['ok'], to: '{{vars.who}}', as: 'ok' } }] };
  assert.deepEqual(automationNames(holed, EVERYTHING), {});
});

test('AN ID THE READ CANNOT NAME IS LEFT OUT, never guessed', () => {
  const body = { rule: 'gone', on: { written: { register: 'archive' } }, steps: [{ call: { ingest: 'nowhere' } }, { call: { ingest: 'rates' } }] };
  assert.deepEqual(automationNames(body, EVERYTHING), { 'ingest.rates': 'Exchange rates' });
  assert.deepEqual([...listsNamed(body)], ['archive']);
});

const LEDGER = {
  id: 'register.ledger',
  kind: 'register' as const,
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, label: 'What' },
      { id: 'note', type: 'text', label: 'Note' },
    ],
  } as never,
};
const STAMP = { id: 'rule.stamp', kind: 'rule' as const, body: { rule: 'stamp', register: 'ledger', on: 'create', then: [{ set: { field: 'note', to: 'seen' } }] } as never };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, JSON.stringify(r));
  return x.value;
};

async function opened() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([LEDGER, STAMP]));
  return { sql, api };
}

test('THE READ OF ONE AUTOMATION STILL ANSWERS AS BEFORE, plus names', async () => {
  const { api } = await opened();
  const listed = value<Record<string, unknown>[]>(await api.automations(undefined, owner)).find((r) => r.id === 'rule.stamp');
  const one = value<Record<string, unknown>>(await api.automations({ rule: 'stamp' }, owner));
  const { body, runs, older, names, ...row } = one;
  assert.deepEqual(row, listed, 'the row is the one the list answers');
  assert.equal((body as { register?: unknown }).register, 'ledger');
  assert.deepEqual(runs, []);
  assert.equal(older, null);
  assert.deepEqual(names, { 'register.ledger': 'Ledger', 'ledger.note': 'Note' });
});

/** A declaration written straight into the table, as an older build or a hand left it, so each kind's title is read. */
const declare = (sql: { exec(q: string, ...a: unknown[]): void }, id: string, kind: string, body: Record<string, unknown>): void =>
  sql.exec("INSERT INTO declaration (id, version, kind, body, checksum, created_at) VALUES (?, 1, ?, ?, 'x', ?)", id, kind, JSON.stringify(body), new Date(NOW).toISOString());

async function everything() {
  const { sql, api } = await opened();
  declare(sql, 'ingest.rates', 'ingest', { ingest: 'rates', name: 'Exchange rates' });
  declare(sql, 'script.tidy', 'script', { script: 'tidy', title: 'Tidy the ledger', reads: ['ledger'], writes: [] });
  declare(sql, 'metric.cash-now', 'metric', { metric: 'cash-now', name: 'Cash now', source: 'register.ledger', value: { count: 'id' } });
  declare(sql, 'job.weekly-notes', 'job', { job: 'weekly-notes', title: 'Weekly notes' });
  declare(sql, 'register.contacts', 'register', { id: 'contacts', name: 'Contacts', meets: { name: 'full_name' }, fields: [{ id: 'full_name', type: 'text' }] });
  sql.exec('INSERT INTO person (id, email, name) VALUES (?, ?, ?)', 'p_mara', MARA.email, MARA.name);
  sql.exec("INSERT INTO entry (id, register, fields, created_at, updated_at) VALUES ('01TEO', 'contacts', ?, ?, ?)", JSON.stringify({ full_name: TEO.name }), new Date(NOW).toISOString(), new Date(NOW).toISOString());
  declare(sql, 'rule.all_of_it', 'rule', {
    rule: 'all_of_it',
    on: { metric: { id: 'cash-now', crosses: { lte: 0 } } },
    steps: [
      { create: { register: 'ledger', bound: 1, fields: { what: COMPANIES[0] } } },
      { link: { to: { register: 'ledger', by: 'what', value: 'x' } } },
      { if: 'vars.a is 1', then: [{ ask_person: { question: 'Ok?', options: ['ok'], to: 'p_mara', as: 'ok' } }], else: [{ ask_person: { question: 'Ok?', options: ['ok'], to: '01TEO', as: 'ok' } }] },
      { call: { ingest: 'rates' } },
      { script: { id: 'tidy' } },
      { run_job: { kind: 'job.weekly-notes' } },
      { call: { ingest: 'gone_away' } },
    ],
  });
  return { sql, api };
}

test("THE RECORD NAMES EACH KIND FROM ITS OWN TABLES, a person on the list playing People among them", async () => {
  const { sql } = await everything();
  assert.deepEqual(automation(sql, 'all_of_it', NOW, {}, () => true)?.names, {
    'metric.cash-now': 'Cash now',
    'register.ledger': 'Ledger',
    'ledger.what': 'What',
    'person:p_mara': MARA.name,
    'person:01TEO': TEO.name,
    'ingest.rates': 'Exchange rates',
    'script.tidy': 'Tidy the ledger',
    'job.weekly-notes': 'Weekly notes',
  });
});

test('A LIST THE CALLER CANNOT SEE GIVES NO NAME, nor its fields, a figure or a script that reads it', async () => {
  const { sql } = await everything();
  const names = automation(sql, 'all_of_it', NOW, {}, (list) => list !== 'ledger')?.names;
  assert.deepEqual(names, { 'person:p_mara': MARA.name, 'person:01TEO': TEO.name, 'ingest.rates': 'Exchange rates', 'job.weekly-notes': 'Weekly notes' });
  /* WITH NO SIGHT HANDED IN, the lists the body names are the sight: Contacts is not one, so its person is not named. */
  const held = automation(sql, 'all_of_it', NOW)?.names ?? {};
  assert.equal(held['register.ledger'], 'Ledger');
  assert.equal(held['person:01TEO'], undefined);
  assert.equal(held['ingest.gone_away'], undefined, 'a call that is gone is not named');
});

test("A FIGURE IS PLACED BY THE KERNEL'S WALK: a leg naming a list by a bare register key holds its name too", async () => {
  /* MEASURED: walked by `register.<id>` strings alone, this figure read as about Ledger only, and was named to a caller
     held from Contacts. A figure counting a figure nothing declares is placed nowhere, and is not named either. */
  const { sql } = await everything();
  declare(sql, 'metric.both', 'metric', { metric: 'both', name: 'Both lists', source: 'register.ledger', legs: [{ register: 'contacts', value: { count: 'id' } }] });
  declare(sql, 'metric.of-nothing', 'metric', { metric: 'of-nothing', name: 'Of nothing', source: 'metric.never-declared' });
  const rule = (figure: string) => ({ rule: `on_${figure}`, on: { metric: { id: figure, crosses: { lte: 0 } } }, steps: [{ note: 'seen' }] });
  declare(sql, 'rule.on_both', 'rule', rule('both'));
  declare(sql, 'rule.on_of-nothing', 'rule', rule('of-nothing'));
  assert.deepEqual(automation(sql, 'on_both', NOW, {}, () => true)?.names, { 'metric.both': 'Both lists' });
  assert.deepEqual(automation(sql, 'on_both', NOW, {}, (list) => list !== 'contacts')?.names, {});
  assert.deepEqual(automation(sql, 'on_of-nothing', NOW, {}, () => true)?.names, {});
});
