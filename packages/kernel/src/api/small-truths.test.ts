/**
 * DEF-9's small truths (`loop/finish/defects.md`), one test each: a rule's `{{metric.x}}` is a figure and not a list,
 * a month-end repeat stays on the month's end, a digest names `push` only when a phone is subscribed, a Bearer or Basic
 * header is a key, `contains` over a secret is refused in the JSON form, the scan advice proposes no index for a list
 * at its ceiling, and `sealedOf` keeps its answer until the list's declaration changes.
 *
 * HERE AND NOT BESIDE EACH FILE, because the seven are one unit's and each is a few lines. Every key-shaped value is
 * built at run time, as `test/key-shapes.test.ts` builds its own, so no line of this file is itself a key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { operatorAllowed } from '@braindog/where';

import { expandRepeat, looksLikeCredential, openRecord, sendDigest, touches, type Assembled, type Declaration, type DigestDeps, type ReachResolve } from '../index.ts';
import { sealedOf } from '../rules.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 27, 12);
const DAY = 86_400_000;

const days = (ms: number[]): string[] => ms.map((at) => new Date(at).toISOString().slice(0, 10));

test("a rule's {{metric.x}} is the figure, placed through its metric, and never a list called metric", () => {
  const resolve: ReachResolve = {
    figure: (id) => [id === 'owed' ? { metric: 'owed', source: 'register.money', value: { count: 'what' } } : undefined],
    door: () => undefined,
    fields: () => new Set(),
  };
  const rule = (say: string) => ({ rule: 'says', on: { written: { register: 'inbox' } }, steps: [{ notify: { say } }] });
  const said = (say: string) => {
    const { lists, unknown } = touches('rule.says', rule(say), resolve);
    return { lists: [...lists].sort(), unknown: [...unknown].sort() };
  };
  assert.deepEqual(said('Owed: {{metric.owed}}'), { lists: ['inbox', 'money'], unknown: [] });
  /* A FIGURE NOTHING RESOLVES IS AN UNKNOWN FIGURE, which the record reads as something that may touch any list. */
  assert.deepEqual(said('Lost: {{metric.nowhere-count}}'), { lists: ['inbox'], unknown: ['nowhere-count'] });
  /* THE RUN'S OWN PATHS STILL NAME NOTHING. */
  assert.deepEqual(said('{{trigger.row.what}} {{vars.x}} {{each.0}}'), { lists: ['inbox'], unknown: [] });
});

test("a monthly repeat that began on a month's last day lands on every month's last day, and a yearly one keeps its anniversary", () => {
  const sept30 = Date.UTC(2026, 8, 30, 12);
  assert.deepEqual(days(expandRepeat(sept30, { freq: 'monthly' }, sept30, 120)).slice(0, 4), ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31']);
  const feb28 = Date.UTC(2027, 1, 28, 12);
  assert.deepEqual(days(expandRepeat(feb28, { freq: 'monthly' }, feb28, 70)).slice(0, 3), ['2027-02-28', '2027-03-31', '2027-04-30']);
  /* A WHOLE YEAR NEVER LEAVES FEBRUARY, and the anniversary of the 28th is the 28th, in a leap year too. */
  assert.deepEqual(days(expandRepeat(feb28, { freq: 'yearly' }, feb28, 400)), ['2027-02-28', '2028-02-28']);
  /* A DAY THAT IS NOT A MONTH END STEPS AS IT DID. */
  const sept15 = Date.UTC(2026, 8, 15, 12);
  assert.deepEqual(days(expandRepeat(sept15, { freq: 'monthly' }, sept15, 70)).slice(0, 3), ['2026-09-15', '2026-10-15', '2026-11-15']);
});

test('a digest names push in what went only when a phone is subscribed to ring', () => {
  const sent: Assembled = { digest: 'weekly', name: 'Weekly', text: 'Body', headline: 'One thing', channels: ['push', 'in-app'], sections: [] };
  const queued: string[] = [];
  /* `sendDigest` reads the four below and nothing else of its deps. */
  const deps = (phones: number): DigestDeps =>
    ({ owners: () => [], outbox: (kind: string) => void queued.push(kind), note: () => undefined, phones: () => phones }) as unknown as DigestDeps;
  assert.deepEqual(sendDigest(deps(0), sent), ['in-app']);
  assert.deepEqual(queued, [], 'a push was queued with no phone to ring');
  assert.deepEqual(sendDigest(deps(2), sent), ['push', 'in-app']);
  assert.deepEqual(queued, ['notify.push']);
});

test('a Bearer token and a Basic header are keys, and a bare 32-hex string and the prose around them are not', () => {
  const token = Array.from({ length: 32 }, (_, i) => 'aZ3kQ9mP'[i % 8]).join('');
  const hex = Array.from({ length: 32 }, (_, i) => '0123456789abcdef'[(i * 7) % 16]).join('');
  const header = ['Author', 'ization: '].join('');
  assert.equal(looksLikeCredential(`curl -H "${header}${['Bear', 'er'].join('')} ${token}" https://example.com`), true);
  assert.equal(looksLikeCredential(`${header}${['Bas', 'ic'].join('')} ${btoa(['ada', 'correct horse'].join(':'))}`), true);
  assert.equal(looksLikeCredential(`${header.toLowerCase()}basic ${btoa(['a', 'b'].join(':'))}`), true);
  assert.equal(looksLikeCredential('Use Authorization: Bearer <token> with the key from the vault.'), false);
  assert.equal(looksLikeCredential('Authorization: Basic auth is off for this door.'), false);
  assert.equal(looksLikeCredential(`The checksum is ${hex}.`), false);
});

test('the JSON form refuses contains, starts and ends over a secret, as the sentence does', async () => {
  for (const op of ['contains', 'starts', 'ends'] as const) {
    assert.equal(operatorAllowed(op, 'secret'), false, op);
    assert.equal(operatorAllowed(op, 'text'), true, op);
  }
  assert.equal(operatorAllowed('present', 'secret'), true);
  assert.equal(operatorAllowed('empty', 'secret'), true);

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const keys: Declaration = {
    id: 'register.keys',
    kind: 'register',
    body: { id: 'keys', name: 'Keys', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'token', type: 'secret' }] } as never,
  };
  const installed = await k.install([keys]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const out = k.list({ register: 'keys', where: { field: 'token', contains: 'a' } as never }) as unknown as { ok: boolean };
  assert.equal(out.ok, false, JSON.stringify(out));
  sql.close();
});

test('the scan advice proposes no index for a list already at its ceiling, and says so', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const k = await openRecord(sql, clock);
  const indexed = Array.from({ length: 8 }, (_, i) => ({ id: `f${String(i + 1)}`, type: 'text', index: true }));
  const wide: Declaration = {
    id: 'register.wide',
    kind: 'register',
    body: { id: 'wide', name: 'Wide', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...indexed, { id: 'n', type: 'int' }] } as never,
  };
  const installed = await k.install([wide]);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* A RECORD THE GOVERNORS LET SPEAK: thirty rows over five days, three weeks old, as `observe.test.ts` makes one. */
  for (let i = 0; i < 30; i++) {
    clock.set(NOW - 20 * DAY + (i % 5) * DAY);
    assert.ok(k.create('wide', { what: `Row ${String(i)}`, n: i }, { actor: 'p_1' }).ok);
  }
  clock.set(NOW);
  sql.exec("INSERT INTO observation (kind, subject, day, n) VALUES ('query.scan', 'wide.n', ?, 200)", new Date(NOW).toISOString().slice(0, 10));

  const looked = k.analyse();
  assert.equal(looked.suspended, null, `the governors held the look: ${String(looked.suspended)}`);
  assert.equal(looked.candidate, null, `the look proposed ${JSON.stringify(looked.candidate)}`);
  const found = looked.found.find((f) => f.subject === 'wide.n');
  assert.match(found?.why ?? '', /ceiling, so no index is proposed/);
  assert.deepEqual(drafts(sql), []);
  sql.close();
});

const drafts = (sql: NodeSql): unknown[] => sql.all("SELECT payload FROM outbox WHERE kind = 'infer.draft'");

test("sealedOf answers each version of a list's declaration, and hands every caller its own set", async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const keys = (fields: Record<string, unknown>[]): Declaration => ({
    id: 'register.keys',
    kind: 'register',
    body: { id: 'keys', name: 'Keys', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
  });
  const first = await k.install([keys([{ id: 'pin', type: 'secret' }])]);
  assert.ok(first.ok, JSON.stringify(first));
  const asked = sealedOf(sql, 'keys');
  assert.deepEqual([...asked].sort(), ['pin']);
  asked.add('what');
  assert.deepEqual([...sealedOf(sql, 'keys')].sort(), ['pin'], "a caller's change reached the next caller");

  /* A NEW VERSION CLEARS IT. */
  const second = await k.install([keys([{ id: 'pin', type: 'secret' }, { id: 'code', type: 'secret' }])]);
  assert.ok(second.ok, JSON.stringify(second));
  assert.deepEqual([...sealedOf(sql, 'keys')].sort(), ['code', 'pin']);
  sql.close();
});
