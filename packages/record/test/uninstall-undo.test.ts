/**
 * Uninstalling an add-on and installing it again, on a real record.
 *
 * An uninstall keeps the rows, and now keeps what a second install could not put back: the settings somebody chose and
 * the pending schedules, each as it stood, for thirty days (`pack_removed`). Installing the pack again inside that
 * window fills its declarations with those settings, restores each schedule's state and due time, and plants no second
 * copy of the examples beside the first. Past the window it starts from the defaults, as a first install does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const DAY = 86_400_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const DOC = {
  pack: 'sample-ledger',
  version: '1.0.0',
  summary: 'A made-up ledger for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: { heading: { type: 'text', default: 'Sample invoices', label: 'Heading' } },
  declarations: [
    { register: 'samples', name: '{{config:heading}}', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'tags', type: 'list', of: 'text' }] },
    { digest: 'monday', name: 'Monday', schedule: { at: '08:00' }, channels: ['in-app'], sections: [{ heading: 'Samples', source: 'register.samples' }] },
  ],
  seeds: [
    { register: 'samples', fields: { what: 'Invoice 41' } },
    { register: 'samples', fields: { what: 'Invoice 42' } },
  ],
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const install = async () => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc: DOC }, owner));
    return value<{ seeds: number }>(await api.installPack({ doc: DOC, planHash: planned.diff.planHash }, owner));
  };
  const heading = () => JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.samples')!.body).name as string;
  const digest = () => sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'digest' AND key = 'monday'");
  const rows = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'samples' AND deleted_at IS NULL")!.n;
  return { sql, clock, api, install, heading, digest, rows };
}

test('INSTALLING AGAIN PUTS BACK THE SETTINGS AND THE SCHEDULE, and plants no second set of examples', async () => {
  const r = await record();
  assert.equal((await r.install()).seeds, 2);
  assert.equal(r.rows(), 2);

  /* A setting chosen and applied, and the digest paused and moved, as a person would leave them. */
  value(await r.api.setPackConfig({ id: 'sample-ledger', values: { heading: 'Kiln invoices' } }, owner));
  await r.install();
  assert.equal(r.heading(), 'Kiln invoices');
  r.sql.exec("UPDATE schedule SET state = 'paused', due_at = '2026-12-07T08:00:00.000Z' WHERE kind = 'digest' AND key = 'monday'");

  value(await r.api.uninstallPack({ id: 'sample-ledger' }, owner));
  assert.equal(r.digest(), undefined, 'the digest stayed armed for a pack that is gone');
  assert.equal(r.rows(), 2, 'the rows went with the pack');

  r.clock.advance(3 * DAY);
  assert.equal((await r.install()).seeds, 0);
  assert.equal(r.rows(), 2, 'installing again planted the examples beside the ones kept');
  assert.equal(r.heading(), 'Kiln invoices', 'the setting chosen before the uninstall was not put back');
  assert.deepEqual(value<{ values: Record<string, unknown> }>(await r.api.packConfig({ id: 'sample-ledger' }, owner)).values, { heading: 'Kiln invoices' });
  assert.deepEqual({ ...r.digest() }, { state: 'paused', due_at: '2026-12-07T08:00:00.000Z' }, 'the schedule came back as a fresh one');
  assert.equal(r.sql.one<{ n: number }>('SELECT count(*) AS n FROM pack_removed')!.n, 0, 'what was put back was kept to be put back again');
  r.sql.close();
});

test('PAST THIRTY DAYS AN INSTALL STARTS FROM THE DEFAULTS, and still plants no second set of examples', async () => {
  const r = await record();
  await r.install();
  value(await r.api.setPackConfig({ id: 'sample-ledger', values: { heading: 'Kiln invoices' } }, owner));
  await r.install();
  r.sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = 'digest' AND key = 'monday'");
  value(await r.api.uninstallPack({ id: 'sample-ledger' }, owner));

  r.clock.advance(31 * DAY);
  await r.install();
  assert.equal(r.heading(), 'Sample invoices');
  assert.equal(r.digest()?.state, 'pending');
  assert.equal(r.rows(), 2);
  r.sql.close();
});
