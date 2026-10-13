/**
 * The restore drill's door (LCH-C04 job 3): `restore-drill.mjs --report` posts its counts to `/account/ops/drill`, behind
 * the provision key as `/account/ops/restore-point` is; the Directory keeps the host's last drill, the operator's record
 * takes one note, and anyone signed in reads it at `GET /account/drill`.
 *
 * THROUGH THE WORKER AS IT SHIPS: `src/index.ts` bundled, a real Directory, real record objects (`cloud-harness.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directoryOnly, drillAnswer, drillNote, olderDrill, readDrill } from '../src/drill-door.ts';
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
  const said = { at: AT, pass: true, record_copies: 2, directory_only: false };
  assert.deepEqual(await res.json(), { ok: true, value: said });
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), { ok: true, value: said });

  const notes = c.storages.get(OPS)?.sql.exec("SELECT note FROM event WHERE kind = 'note'").toArray() as { note: string }[];
  assert.deepEqual(notes.map((n) => n.note), [`drill ${AT.slice(0, 10)} · pass · 2 records`]);

  /* A LATER, FAILED DRILL REPLACES IT: the host keeps the last, not a history. */
  const failed = await post(c, { ...BODY, pass: false });
  assert.equal(failed.status, 200);
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), { ok: true, value: { at: AT, pass: false, record_copies: 2, directory_only: false } });
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
  assert.equal(drillNote(directoryOnly.value), `drill ${AT.slice(0, 10)} · pass · directory only`);
  /* AND A FAILED ONE SAYS SO TOO, never `0 records`: it opened the Directory's copy and no record's. */
  assert.equal(drillNote({ ...directoryOnly.value, pass: false }), `drill ${AT.slice(0, 10)} · fail · directory only`);
});

test('THE DIRECTORY ALONE is said in a field of its own, never left to a zero', async () => {
  const read = readDrill({ at: AT, pass: true, copies: 0, rows: 0, lists: 0, people: 0, records: 7 });
  assert.ok(read.ok);
  assert.equal(directoryOnly(read.value), true);
  assert.deepEqual(drillAnswer(read.value), { at: AT, pass: true, record_copies: 0, directory_only: true });
  /* A record's copy opened beside the Directory's is not the Directory alone, and neither is a failed drill that opened nothing. */
  assert.deepEqual(drillAnswer({ ...read.value, copies: 2 }), { at: AT, pass: true, record_copies: 2, directory_only: false });
  assert.deepEqual(drillAnswer({ ...read.value, pass: false, records: null }), { at: AT, pass: false, record_copies: 0, directory_only: false });
  assert.deepEqual(drillAnswer(null), { at: null });

  /* THROUGH THE DOOR: the post's answer and the signed-in read both carry it. */
  const c = await cloud({ PROVISION_KEY: OPERATOR });
  await c.provision(OPS, 'ops', 'ada@example.test');
  const cookie = await c.signIn('ada@example.test');
  const want = { ok: true, value: { at: AT, pass: true, record_copies: 0, directory_only: true } };
  assert.deepEqual(await (await post(c, { ...BODY, copies: 0 })).json(), want);
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), want);
});

test('olderDrill: a post older than the kept drill is ignored, and the same instant or a newer one is kept', () => {
  const kept = readDrill(BODY);
  assert.ok(kept.ok);
  const at = (ms: number) => ({ ...kept.value, at: new Date(Date.parse(AT) + ms).toISOString() });
  assert.equal(olderDrill(at(-86_400_000), kept.value), true, 'a drill from the day before replaced the kept one');
  assert.equal(olderDrill(at(-1), kept.value), true);
  assert.equal(olderDrill(at(0), kept.value), false, 'a drill run again at the same instant was ignored');
  assert.equal(olderDrill(at(1), kept.value), false, 'a newer drill was ignored');
  assert.equal(olderDrill(kept.value, null), false, 'the first drill was ignored');
  /* A kept drill whose date this build cannot read holds nothing back. */
  assert.equal(olderDrill(kept.value, { ...kept.value, at: 'yesterday' }), false);
  /* THE ZONE IS READ, NOT THE LETTERS: 09:00+02:00 is 07:00Z, older than 08:00Z though it sorts after it as text. */
  assert.equal(olderDrill({ ...kept.value, at: '2026-10-09T09:00:00+02:00' }, { ...kept.value, at: '2026-10-09T08:00:00Z' }), true);
});

test('THROUGH THE DOOR, AN OLDER DRILL IS IGNORED: the newest stays, the answer is the one kept, and no second note is written', async () => {
  const c = await cloud({ PROVISION_KEY: OPERATOR, OPS_RECORD: OPS });
  await c.provision(OPS, 'ops', 'ada@example.test');
  const cookie = await c.signIn('ada@example.test');
  const kept = { at: AT, pass: true, record_copies: 2, directory_only: false };
  assert.equal((await post(c, { ...BODY, records: null })).status, 200);

  const older = new Date(Date.parse(AT) - 24 * 3_600_000).toISOString();
  const late = await post(c, { ...BODY, at: older, pass: false, records: null });
  assert.equal(late.status, 200, await late.clone().text());
  assert.deepEqual(await late.json(), { ok: true, value: kept }, 'the door answered the older drill it was told, not the one it keeps');
  assert.deepEqual(await (await c.ask('/account/drill', { cookie })).json(), { ok: true, value: kept });

  const notes = c.storages.get(OPS)?.sql.exec("SELECT note FROM event WHERE kind = 'note'").toArray() as { note: string }[];
  assert.deepEqual(notes.map((n) => n.note), [`drill ${AT.slice(0, 10)} · pass · 2 records`], 'an ignored drill wrote a note');
});
