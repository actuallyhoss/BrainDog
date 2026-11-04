/**
 * Who filed each line, in view (`src/modules/money/figures/filing.ts`): Money's two figures over who MADE
 * the Ledger's entries, read through the kernel on a record that installed money-core the way a person does, with no
 * example rows, and a bank add-on's pattern beside it.
 *
 * Agents do the legwork in view: who wrote a row has always been in the history and no figure read
 * it. `filed-for-you-30d` counts what an agent, a bank add-on or a rule made in 30 days, and `filed-today` says today's
 * by who. An import files nothing for anybody: it copies what another tool already held.
 *
 * THE FIGURES ARE READ FROM `FILING_FIGURES`, NOT FROM `METRICS`: the group is declared in its own file and joins Money
 * with the version that spreads it into `figures/index.ts`.
 *
 * RED FIRST: with no `filing.ts` this file does not load, and with the kernel reading no `events.<list>` every reading
 * below is refused `SOURCE_UNKNOWN`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { FILING_FIGURES } from '../src/modules/money/figures/filing.ts';

const DAY = 86_400_000;
const OWNER = { actor: 'p_1' };
/** A bank add-on's pattern, as the door signs what it files. */
const DOOR = { actor: 'ingest:bank-card-used' };

/** An agent's run, as a client's token opens one: its writes are signed with the run, and the run says which agent. */
const run = (client_id: string): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', client: 'claude-code', repo: 'kiln' },
});

/** A rule somebody declared, a script, and the record's own mechanism, as each signs what it makes. */
const RULE = { actor: 'rule:repeat_rent' };
const SCRIPT = { actor: 'script:tidy-ledger@v2' };
const RECORD = { actor: 'system' };

/**
 * `braindog import`, as it signs: a run of its own, by no agent anybody named, under a client id that says import
 * (`apps/cli/src/import.ts`, the headers in `importCommand`).
 */
const IMPORT: WriteContext = {
  actor: 'agent:other',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id: 'braindog-import-0f3c', agent: 'other', client: 'braindog-cli' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/** One pattern of a bank add-on that files onto the Ledger. The add-on is invented: no real bank is named here. */
const PATTERN: Declaration = {
  id: 'ingest.bank-card-used',
  kind: 'ingest',
  body: { ingest: 'bank-card-used', channel: 'poll', url: 'https://api.example.test/v1/moves', every: '1h', grant: 'example read', extract: { what: { after: 'paid ' } }, writes: { register: 'transactions' } } as never,
};

type Ledger = { k: Kernel; file: (what: string, by: WriteContext, ago?: number) => Entry };

/**
 * A record holding money-core as the pack document says it, a person with a name, and the Harbour Bank add-on with one
 * pattern. `file` makes one cleared Ledger entry signed by whoever is named, `ago` whole days before now.
 */
async function ledger(): Promise<Ledger> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  value(await k.install([PATTERN]));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_1', 'mara@example.test', 'Mara')");
  sql.exec("INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('bank-harbour', '1.0.0', 'local', ?, '2026-09-01T00:00:00.000Z', 'x')", JSON.stringify({ name: 'Harbour Bank' }));
  sql.exec("UPDATE declaration SET pack_id = 'bank-harbour' WHERE id = 'ingest.bank-card-used'");

  const account = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-60) }, OWNER));
  let n = 0;
  const file = (what: string, by: WriteContext, ago = 0): Entry => {
    const fields = { what, on: day(-ago), direction: 'out', amount: { amount: 1000 + ++n * 137, currency: 'GBP' }, account: account.id };
    const make = () => k.create('transactions', fields, by);
    return value<Entry>(ago === 0 ? make() : k.backdate(NOW - ago * DAY, make));
  };
  return { k, file };
}

const read = (k: Kernel, id: string) => {
  const figure = FILING_FIGURES[id];
  assert.ok(figure, `Money declares no ${id}`);
  const got = k.metric(figure as never);
  assert.ok(got.ok, `${id}: ${sayOf(got)}`);
  return got.value;
};

/** The parts as a person is told them: who, and how many. */
const said = (groups: readonly { key: string; label?: string; value: number | null }[] | undefined) =>
  (groups ?? []).map((g) => [g.key, g.label, g.value]);

/**
 * A Ledger written by a person, an agent and a bank add-on's pattern, over six weeks. OLDEST FIRST: a history is written
 * in the order it happened, and the record holds no write behind an earlier one (`backdate`).
 */
function written({ file }: Ledger): void {
  file('Typed before the window', OWNER, 45);
  file('Card before the window', DOOR, 40);
  file('Card at the garage', DOOR, 20);
  file('Rent, typed by hand', OWNER, 10);
  file('Filed from another arrival', run('c2'), 5);
  file('Coffee, typed by hand', OWNER);
  file('Card at the grocer', DOOR);
  file('Card at the chemist', DOOR);
  file('Filed from an arrival', run('c1'));
}

test('MONEY DECLARES WHO FILED ITS LEDGER, two counts of what was made that add no money', () => {
  assert.deepEqual(Object.keys(FILING_FIGURES), ['filed-for-you-30d', 'filed-today', 'rule-filed', 'filed-by-rule-30d', 'rules-filing-30d', 'filing-rule-filed', 'filing-rules', 'rules-filing']);
  for (const [id, figure] of Object.entries(FILING_FIGURES).filter(([, f]) => f.source === 'events.transactions')) {
    assert.equal(figure.metric, id);
    assert.equal(figure.source, 'events.transactions', `${id} reads who made the Ledger's entries`);
    assert.deepEqual(figure.value, { count: 'made' }, `${id} is a count, so no two currencies can meet in it`);
    assert.equal(figure.format, 'int');
    assert.equal(figure.pack, 'money-core', `${id} names its home: its source names no list the split reads`);
    assert.doesNotMatch(figure.name, /—|row|entity/u);
  }
  assert.equal(FILING_FIGURES['filed-for-you-30d']!.where, 'by is agent or door or rule', 'the three that do legwork, named, and nobody else');
  assert.equal(FILING_FIGURES['filed-for-you-30d']!.window, '30d');
  assert.equal(FILING_FIGURES['filed-today']!.where, undefined, 'today is everybody, said by who');
  assert.equal(FILING_FIGURES['filed-today']!.window, '1d');
});

test('FILED FOR YOU, 30 DAYS COUNTS WHAT THE AGENT AND THE BANK ADD-ON MADE, and nothing a person typed', async () => {
  const l = await ledger();
  written(l);

  const got = read(l.k, 'filed-for-you-30d');
  assert.equal(got.value, 5, 'two by the agent and three by the bank add-on; four typed or before the window are not in it');
  assert.equal(got.unit, null, 'a count of entries is in no currency');
  assert.deepEqual(said(got.groups), [
    ['door:bank-harbour', 'Harbour Bank', 3],
    ['agent:claude', 'Claude', 2],
  ]);
  assert.equal(got.met, true);
});

test('FILED TODAY SAYS WHO: the bank add-on, the agent and the person, each by name and never by a handle', async () => {
  const l = await ledger();
  written(l);

  const got = read(l.k, 'filed-today');
  assert.equal(got.value, 4);
  assert.deepEqual(said(got.groups), [
    ['door:bank-harbour', 'Harbour Bank', 2],
    ['agent:claude', 'Claude', 1],
    ['person:p_1', 'Mara', 1],
  ]);
  assert.doesNotMatch(JSON.stringify(said(got.groups).map((g) => g[1])), /p_1|S\d|ingest:|bank-card-used/u);
});

test('AN ENTRY COUNTS UNDER WHOEVER MADE IT, so a person who edits what the bank add-on filed has filed nothing', async () => {
  const l = await ledger();
  const filed = l.file('Card at the grocer', DOOR);
  value(l.k.update('transactions', filed.id, { what: 'Groceries' }, OWNER));

  assert.equal(read(l.k, 'filed-for-you-30d').value, 1);
  assert.deepEqual(said(read(l.k, 'filed-today').groups), [['door:bank-harbour', 'Harbour Bank', 1]]);
});

test('A LEDGER ONLY A PERSON KEEPS READS NOUGHT FILED FOR THEM, and is told so without being marked down', async () => {
  const l = await ledger();
  const empty = read(l.k, 'filed-for-you-30d');
  assert.deepEqual([empty.value, empty.groups], [0, []]);

  l.file('Coffee, typed by hand', OWNER);
  const typed = read(l.k, 'filed-for-you-30d');
  assert.equal(typed.value, 0);
  assert.notEqual(typed.met, false, 'typing your own Ledger misses no mark');
  assert.deepEqual(said(read(l.k, 'filed-today').groups), [['person:p_1', 'Mara', 1]]);
});

test('FILED FOR YOU IS AN AGENT, A BANK ADD-ON OR A RULE: a script and the record itself file nothing for anybody', async () => {
  const l = await ledger();
  l.file('Rent, from the repeating line', RULE, 3);
  l.file('Moved by the tidy script', SCRIPT, 2);
  l.file('Carried by the record', RECORD, 1);
  l.file('Card at the grocer', DOOR);
  l.file('Filed from an arrival', run('c1'));

  const got = read(l.k, 'filed-for-you-30d');
  assert.equal(got.value, 3, 'the rule, the bank add-on and the agent; the script and the record are not legwork done for a person');
  assert.deepEqual(
    said(got.groups).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ['agent:claude', 'Claude', 1],
      ['door:bank-harbour', 'Harbour Bank', 1],
      ['rule:repeat_rent', 'Repeat rent', 1],
    ],
  );
  assert.equal(got.held, 5, 'all five were made in the window, and two are kept out by who made them');
});

test('A RECORD BROUGHT IN FROM A FILE FILED NOTHING FOR ANYBODY: what the record signs itself is in no part', async () => {
  const l = await ledger();
  for (let i = 0; i < 6; i++) l.file(`Brought in, line ${i + 1}`, RECORD);
  l.file('Card at the grocer', DOOR);

  const got = read(l.k, 'filed-for-you-30d');
  assert.equal(got.value, 1, 'six lines copied in today are not six filed for you');
  assert.deepEqual(said(got.groups), [['door:bank-harbour', 'Harbour Bank', 1]]);
});

/**
 * `braindog import` writes over the API as a run of its own, so the history holds it as a run. The kernel sorts that run
 * apart (`packages/kernel/src/metrics.ts` `makerOf`: no agent named, and a client id that says import), as the maker
 * `import`, which `by is agent or door or rule` does not keep.
 */
test('AN IMPORT FILED NOTHING FOR ANYBODY: 200 lines copied from another tool are not legwork', async () => {
  const l = await ledger();
  for (let i = 0; i < 4; i++) l.file(`Imported, line ${i + 1}`, IMPORT);
  l.file('Filed from an arrival', run('c1'));

  const got = read(l.k, 'filed-for-you-30d');
  assert.equal(got.value, 1, 'the agent that filed an arrival, and none of what the import copied');
  assert.deepEqual(said(got.groups), [['agent:claude', 'Claude', 1]]);
});
