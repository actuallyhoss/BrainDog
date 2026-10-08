/**
 * The record's wiring, each line answering through `createRecordApi` as a host builds it (batches 37 to 39): what the
 * host hands in reaches the method that reads it, and what the kernel learned to say reaches the record's caller.
 *
 * `engineHealth` from the host reaches `engineHealth`; `host` from the build tells `faults` whether the owner reads the
 * raw error; the inbox carries each skipped arrival's `repeats` mark and pages through the repeats alone when asked; a
 * new row on a list that names an accent is given its hue once (batch 38, marks); `boot` names every currency up to the
 * rates preset's most and one more (batch 38, rates).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Build, type CallContext } from '../src/index.ts';
import { raiseFault } from '../../kernel/src/fault.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { CARD, NOW, record as bank, text, used } from '../../kernel/test/ingest-tail-kit.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const clock = { now: () => NOW } as never;

test('THE HOST\'S ENGINE READ REACHES engineHealth, and a host that wired none is answered null', async () => {
  const read = { health: { state: 'answering' }, said: { text: 'The model answered an hour ago.', whose: null } } as never;
  const wired = await createRecordApi({ sql: openSqlite(), clock, engineHealth: async () => read });
  const out = await wired.engineHealth({}, owner);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, read);

  const bare = await createRecordApi({ sql: openSqlite(), clock });
  const none = await bare.engineHealth({}, owner);
  assert.ok(none.ok);
  assert.equal(none.value, null);
});

test('THE BUILD\'S HOST REACHES faults: a self-host owner reads the raw error, the Cloud holds it back', async () => {
  const RAW = 'fetch failed: ECONNRESET at api.example.test';
  for (const [host, shown] of [['self-host', true], ['cloud', false]] as const) {
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock, build: { app: '2026-10-09+abc', slash: false, host } as Build });
    raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', RAW, NOW);
    const out = await api.faults({}, owner);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.faults[0]?.error, shown ? RAW : undefined, host);
    sql.close();
  }
});

test('THE INBOX CARRIES THE REPEATS MARK, and repeats: true pages past the rule skips to the second charge', async () => {
  const DECLINED = { when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' };
  const r = await bank(CARD({ dedupe: ['amount', 'account'], skip: [DECLINED] }));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const first = text(r.k, used('1234', 'Corner Shop', '120.00', '07/10/2026')).wrote[0]!;
  const again = text(r.k, used('1234', 'Corner Shop', '120.00', '08/10/2026'));
  assert.equal(again.state, 'skipped');
  const ruled = [1, 2, 3].map((n) => text(r.k, `${used('1234', 'Corner Shop', `${n}.00`, '09/10/2026')} It was declined.`).raw);

  const api = await createRecordApi({ sql: r.sql, clock });
  const skipped = await api.inbox({ state: 'skipped' }, owner);
  assert.ok(skipped.ok, JSON.stringify(skipped));
  assert.equal(skipped.value.arrivals.find((a) => a.id === again.raw)?.repeats, first);
  for (const id of ruled) assert.equal(skipped.value.arrivals.find((a) => a.id === id)?.repeats, undefined);

  /* A page of two holds only rule skips, and the repeats alone still find the second charge, with no state named. */
  const short = await api.inbox({ state: 'skipped', limit: 2 }, owner);
  assert.ok(short.ok && !short.value.arrivals.some((a) => a.id === again.raw));
  const only = await api.inbox({ repeats: true, limit: 2 }, owner);
  assert.ok(only.ok, JSON.stringify(only));
  assert.deepEqual(only.value.arrivals.map((a) => [a.id, a.repeats]), [[again.raw, first]]);

  const bad = await api.inbox({ repeats: 'yes' } as never, owner);
  assert.equal(bad.ok, false);
  r.sql.close();
});

const PROJECTS = {
  id: 'register.projects',
  kind: 'register' as const,
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    identity: { accent: 'hue' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'hue', type: 'int', min: 0, max: 359 },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

test('A NEW ROW ON A LIST WITH AN ACCENT IS GIVEN ITS HUE ONCE, far from the others; one sent, or null, stands', async () => {
  const { nextAccentHue } = await import('@braindog/theme');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([PROJECTS])).ok);
  const made = async (fields: Record<string, unknown>) => {
    const r = await api.create({ register: 'projects', fields } as never, owner);
    assert.ok(r.ok, JSON.stringify(r));
    return (r.value as { fields: Record<string, unknown> }).fields;
  };
  const kiln = await made({ name: 'Kiln' });
  assert.equal(kiln.hue, nextAccentHue([]));
  const sent = await made({ name: 'Portage', hue: 210 });
  assert.equal(sent.hue, 210);
  const none = await made({ name: 'Quiet', hue: null });
  assert.equal(none.hue ?? null, null);
  const third = await made({ name: 'Marrow' });
  assert.equal(third.hue, nextAccentHue([kiln.hue as number, 210]));
  assert.notEqual(third.hue, kiln.hue);
  sql.close();
});

test('boot NAMES EVERY CURRENCY THE MONEY IS IN, past two, so the rates preset can quote them all', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([PROJECTS])).ok);
  for (const [name, currency] of [['Kiln', 'EGP'], ['Portage', 'USD'], ['Marrow', 'GBP']] as const)
    assert.ok((await api.create({ register: 'projects', fields: { name, hue: 10, cost: { amount: 100, currency } } } as never, owner)).ok);
  const boot = await api.boot(owner);
  assert.ok(boot.ok, JSON.stringify(boot));
  assert.deepEqual([...(boot.value as { money: string[] }).money].sort(), ['EGP', 'GBP', 'USD']);
  assert.equal((boot.value as { currency: string | null }).currency, null, 'three currencies choose none');
  sql.close();
});
