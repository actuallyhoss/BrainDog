/**
 * The restore drill's door (LCH-C04 job 3): `restore-drill.mjs --report` posts its counts to `/account/ops/drill`, behind
 * the provision key as `/account/ops/restore-point` is; the Directory keeps the host's last drill, the operator's record
 * takes one note, and anyone signed in reads it at `GET /account/drill`.
 *
 * THROUGH THE WORKER AS IT SHIPS: `src/index.ts` bundled, a real Directory, real record objects (`cloud-harness.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drillNote, readDrill } from '../src/drill-door.ts';
import { cloud } from './cloud-harness.ts';

const OPERATOR = 'an-operator-key-for-these-tests-only-0123456789';
const OPS = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAK';
const AT = new Date(Date.now() - 60_000).toISOString();
/** The body the drill sends (`report` in `apps/cli/scripts/restore-drill.mjs`). */
const BODY = { at: AT, pass: true, copies: 2, rows: 4120, lists: 31, people: 3, records: 7 };

const post = (c: Awaited<ReturnType<typeof cloud>>, body: unknown, bearer = OPERATOR) =>
  c.ask('/account/ops/drill', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), bearer });

test('THE DRILL DOOR: 404 with no key, 401 with a wrong one or none', async () => {
  const off = await cloud({ PROVISION_KEY: '' });
  assert.equal((await post(off, BODY)).status, 404);
  const c = await cloud({ PROVISION_KEY: OPERATOR });
  assert.equal((await post(c, BODY, 'wrong')).status, 401);
  assert.equal((await c.ask('/account/ops/drill', { method: 'POST', body: JSON.stringify(BODY) })).status, 401);
  assert.equal((await c.ask('/account/ops/drill', { bearer: OPERATOR })).status, 405);
  assert.equal(c.directory.drill({ op: 'read' }), null, 'a refused report was kept');
});

test('A BAD BODY IS REFUSED in one sentence naming the field, and nothing is kept', async () => {
  const c = await cloud({ PROVISION_KEY: OPERATOR });
  const bad: [unknown, string][] = [
    ['not json', 'body'],
    [{ ...BODY, at: 'yesterday' }, 'at'],
    [{ ...BODY, pass: 'yes' }, 'pass'],
    [{ ...BODY, rows: -1 }, 'rows'],
    [{ ...BODY, lists: 1.5 }, 'lists'],
    [{ ...BODY, records: '7' }, 'records'],
    [{ ...BODY, record: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAK' }, 'record'],
    [{ ...BODY, copies: 0, records: null }, 'pass'],
    [{ ...BODY, at: new Date(Date.now() + 86_400_000).toISOString() }, 'at'],
  ];
  for (const [body, at] of bad) {
    const res = await post(c, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const out = (await res.json()) as { refusal: { code: string; fix: string; at: string } };
    assert.equal(out.refusal.code, 'BODY_MALFORMED');
    assert.equal(out.refusal.at, at, JSON.stringify(body));
    assert.match(out.refusal.fix, /^[A-Z].*\.$/, 'a refusal is one sentence');
    assert.ok(!out.refusal.fix.includes('—'), 'an em dash in a refusal');
  }
  assert.equal(c.directory.drill({ op: 'read' }), null, 'a refused report was kept');
});

test('READ AFTER WRITE: the host keeps the last drill, the ops record takes its note, and a signed-in person reads it', async () => {
  const c = await cloud({ PROVISION_KEY: OPERATOR, OPS_RECORD: OPS });
  await c.provision(OPS, 'ops', 'ada@example.test');
  const cookie = await c.signIn('ada@example.test');

  const none = await c.ask('/account/drill', { cookie });
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { ok: true, value: { at: null } });
  assert.equal((await c.ask('/account/drill')).status, 401, 'the drill was read with no session');

  const res = await post(c, { ...BODY, records: null });
  assert.equal(res.status, 200, await res.clone().text());
  const said = { at: AT, pass: true, records: 2 };
  assert.deepEqual(await res.json(), { ok: true, value: said });
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), { ok: true, value: said });

  const notes = c.storages.get(OPS)?.sql.exec("SELECT note FROM event WHERE kind = 'note'").toArray() as { note: string }[];
  assert.deepEqual(notes.map((n) => n.note), [`drill ${AT.slice(0, 10)} · pass · 2 records`]);

  /* A LATER, FAILED DRILL REPLACES IT: the host keeps the last, not a history. */
  const failed = await post(c, { ...BODY, pass: false });
  assert.equal(failed.status, 200);
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), { ok: true, value: { at: AT, pass: false, records: 2 } });
});

test('readDrill: counts only, records null when the Directory was not opened, and the note in the walk\'s form', () => {
  const read = readDrill({ ...BODY, records: undefined });
  assert.ok(read.ok);
  assert.equal(read.value.records, null);
  assert.equal(drillNote(read.value), `drill ${AT.slice(0, 10)} · pass · 2 records`);
  assert.equal(drillNote({ ...read.value, pass: false }), `drill ${AT.slice(0, 10)} · fail · 2 records`);
  /* THE DIRECTORY ALONE (`--directory`, no `--record`) is a drill that opened a copy, so it may pass with no record's. */
  const directoryOnly = readDrill({ at: AT, pass: true, copies: 0, rows: 0, lists: 0, people: 0, records: 7 });
  assert.ok(directoryOnly.ok, directoryOnly.ok ? '' : directoryOnly.fix);
  assert.equal(drillNote(directoryOnly.value), `drill ${AT.slice(0, 10)} · pass · 0 records`);
});
