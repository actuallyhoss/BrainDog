/**
 * `packsRemoved` (`src/methods/packs-removed.ts`, SHL-A12 job 3): what was taken out of a record and can still be put
 * back, on a fresh record with a made-up add-on of one list.
 *
 * Installed, three entries written, taken out: it is listed, newest first, with its list by name and the three entries
 * still there, and `back`. Installed again: nothing is listed, and the entries and the setting chosen before are back.
 * A token and a colleague are refused in the owner guard's sentence. A removal older than the window is not listed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal } from '@braindog/ports';

import { allows, createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type PacksRemovedAnswer } from '../src/methods/packs-removed.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const DAY = 86_400_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'owner' } as never };
const colleague: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };

type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** A made-up add-on: one list whose name is a setting, and nothing else. */
const DOC = {
  pack: 'tide-log',
  version: '1.2.0',
  summary: 'A made-up log of tides for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: { heading: { type: 'text', default: 'Tides', label: 'Heading' } },
  declarations: [{ register: 'tides', name: '{{config:heading}}', title: 'what', fields: [{ id: 'what', type: 'text' }] }],
};

/**
 * The record's own `admin`, as `index.ts` writes it: a token is told to open the app, and anybody below an owner is
 * refused by the ladder. Handed to the method file as the record hands it, so the refusal is the record's sentence.
 */
const admin = (ctx: CallContext, reads?: string): Refusal | null => {
  if (ctx.principal.kind === 'token')
    return {
      code: 'NEEDS_BROWSER_SESSION',
      fix: reads === undefined ? 'Open this from the app; a token cannot change what this record is.' : `Open this from the app; a token cannot ${reads}.`,
      at: 'principal',
    };
  return allows(ctx, 'owner');
};

async function record(catalogue?: readonly { id: string; title: string }[]) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const install = async () => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: DOC }, owner));
    return value(await api.installPack({ doc: DOC, planHash: planned.diff.planHash }, owner));
  };
  const deps = { kernel: api.kernel, sql, admin, no, clock, tail: async <T>(o: T) => o, ...(catalogue ? { catalogue } : {}) } as unknown as RecordDeps;
  const read = async (ctx: CallContext = owner, args: unknown = {}) => (await methods(deps).packsRemoved(args, ctx)) as Out;
  const removed = async () => value<PacksRemovedAnswer>(await read());
  const rows = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'tides' AND deleted_at IS NULL")!.n;
  const heading = () => JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.tides')!.body).name as string;
  return { sql, clock, api, install, read, removed, rows, heading };
}

test('TAKEN OUT, IT IS LISTED with its list by name and the three entries that stayed, and installed again it is not', async () => {
  const r = await record();
  await r.install();
  value(await r.api.setPackConfig({ id: 'tide-log', values: { heading: 'Harbour tides' } }, owner));
  await r.install();
  assert.equal(r.heading(), 'Harbour tides');
  for (const what of ['Spring tide', 'Neap tide', 'King tide']) value(r.api.kernel.create('tides', { what } as never, { actor: 'p_1' }));
  assert.deepEqual(await r.removed(), [], 'an add-on that is in is not removed');

  value(await r.api.uninstallPack({ id: 'tide-log' }, owner));
  r.clock.advance(2 * DAY);
  const out = await r.removed();
  assert.equal(out.length, 1);
  const [gone] = out;
  assert.equal(gone!.id, 'tide-log');
  assert.equal(gone!.title, 'Tide log', 'with no catalogue, the id is said as words');
  assert.equal(gone!.version, '1.2.0');
  assert.equal(gone!.removed_at, new Date(NOW).toISOString());
  assert.equal(gone!.back_until, new Date(NOW + 30 * DAY).toISOString());
  assert.deepEqual(gone!.stayed, [{ list: 'Harbour tides', rows: 3 }], 'the list by the name it had, with its entries');
  assert.equal(gone!.back, true);
  assert.equal(r.rows(), 3);

  await r.install();
  assert.deepEqual(await r.removed(), [], 'put back, it is no longer listed');
  assert.equal(r.rows(), 3, 'the entries are back in the list');
  assert.equal(r.heading(), 'Harbour tides', 'and the setting chosen before it went');
  r.sql.close();
});

test('THE CATALOGUE NAMES IT when the host knows it, and the newest removal comes first', async () => {
  const r = await record([{ id: 'tide-log', title: 'Tide Log' }]);
  await r.install();
  value(await r.api.uninstallPack({ id: 'tide-log' }, owner));
  r.clock.advance(DAY);
  /* A second removal, a day later, as the kernel keeps one: its own line in the same table. */
  r.sql.exec("INSERT INTO pack_removed (pack, version, removed_at) VALUES ('quay-book', '0.3.0', ?)", new Date(NOW + DAY).toISOString());
  const out = await r.removed();
  assert.deepEqual(out.map((p) => [p.id, p.title]), [['quay-book', 'Quay book'], ['tide-log', 'Tide Log']]);
  assert.deepEqual(out[0]!.stayed, [], 'an add-on that declared no list kept none');
  r.sql.close();
});

test('A TOKEN AND A COLLEAGUE ARE REFUSED in one sentence, and nothing is said about what was taken out', async () => {
  const r = await record();
  await r.install();
  value(await r.api.uninstallPack({ id: 'tide-log' }, owner));
  const byToken = await r.read(token);
  assert.equal(byToken.ok, false);
  assert.equal(byToken.refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(byToken.refusal?.fix, 'Open this from the app; a token cannot read what was taken out of this record.');
  assert.equal(byToken.value, undefined);
  const byColleague = await r.read(colleague);
  assert.equal(byColleague.ok, false);
  assert.equal(byColleague.refusal?.code, 'LEVEL_REQUIRED');
  assert.equal((await r.read(owner, { since: 'never' })).refusal?.code, 'FIELD_UNKNOWN', 'it takes nothing');
  r.sql.close();
});

test('A REMOVAL OLDER THAN THE WINDOW IS NOT LISTED, and its entries still stay', async () => {
  const r = await record();
  await r.install();
  value(r.api.kernel.create('tides', { what: 'Ebb' } as never, { actor: 'p_1' }));
  value(await r.api.uninstallPack({ id: 'tide-log' }, owner));
  r.clock.advance(30 * DAY);
  assert.equal((await r.removed()).length, 1, 'on the last day it can still be put back');
  r.clock.advance(1);
  assert.deepEqual(await r.removed(), [], 'past the window it is not offered');
  assert.equal(r.rows(), 1, 'the entries never go with the window');
  r.sql.close();
});
