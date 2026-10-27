/**
 * The consent rule, obeyed: one switch for all background reading, asked before anything is held or leased.
 *
 * OFF, a background ask is refused in a sentence the record reads as "the rules speak", the ledger holds no row for it,
 * not even the turned-away one, and the model pass leases no job. ON, which is the default, the rows return. HIS OWN
 * PRESS IS NEVER HELD: an ask that spends `person` does not read the switch at all.
 *
 * AND WHAT IS NEVER SENT, whatever the switch says: a sealed field, a key, or a file's bytes (`neverSent`, `sendable`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { infer, mayThink, neverSent, PURPOSES, sendable, type Candidate, type InferLedger, type InferPurpose } from '../src/infer.ts';
import { serveModelJobs, type ModelJobMeter, type ModelJobsDeps } from '../src/model-jobs.ts';
import { slashRecordMeter } from '../src/slash-ask.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 9, 9, 0);
const BACKGROUND = (Object.keys(PURPOSES) as InferPurpose[]).filter((p) => PURPOSES[p].spends === 'background');
const HIS = (Object.keys(PURPOSES) as InferPurpose[]).filter((p) => PURPOSES[p].spends !== 'background');
/** A key as an issuer shapes one, built here so no credential sits in the file. */
const KEY = `sk-ant-${'aB3dE6gH9jK2mN5pQ8rS1tU4'}`;

test('READS OFF REFUSES EVERY BACKGROUND PURPOSE, in words that name the switch and say the rules do the work', async () => {
  assert.deepEqual(BACKGROUND, ['look', 'headline', 'compose', 'skill', 'understand', 'pattern', 'prose', 'embed']);
  for (const purpose of BACKGROUND) {
    const out = await mayThink(purpose, () => false);
    assert.equal(out.ok, false, purpose);
    if (out.ok || !('refusal' in out)) continue;
    assert.equal(out.refusal.code, 'FORBIDDEN');
    assert.equal(out.refusal.at, 'slash.reads');
    assert.match(out.refusal.fix, /switched off.*nothing was sent to a model.*rules/u);
    assert.doesNotMatch(out.refusal.fix, /—/u);
  }
});

test('ON IS THE DEFAULT, and a switch that cannot be read sends nothing', async () => {
  for (const purpose of BACKGROUND) {
    assert.equal((await mayThink(purpose)).ok, true, purpose);
    assert.equal((await mayThink(purpose, async () => true)).ok, true, purpose);
  }
  const unread = await mayThink('embed', () => {
    throw new Error('the prefs could not be read');
  });
  assert.equal(unread.ok, false);
  if (!unread.ok && 'refusal' in unread) assert.match(unread.refusal.fix, /could not be read.*nothing was sent to a model/u);
});

test("HIS OWN PRESS IS NEVER HELD: an ask that spends his allowance, or nobody's, does not read the switch", async () => {
  let read = 0;
  for (const purpose of HIS)
    assert.equal(
      (
        await mayThink(purpose, () => {
          read++;
          return false;
        })
      ).ok,
      true,
      purpose,
    );
  assert.equal(read, 0);
});

/* ── the router ───────────────────────────────────────────────────────────────────────────────── */

const FLASH: Candidate = { id: 'flash', model: 'glm-5.3-flash', tier: 'a', source: 'included' };
const EMBED: Candidate = { id: 'embed', model: 'embed-1', tier: 'a', source: 'included' };

function router(reads: () => boolean) {
  const held: string[] = [];
  const rows: unknown[] = [];
  const ledger: InferLedger = {
    reserve: (_kind, _tier, _model, charge) => (held.push(charge.purpose), `H${held.length}`),
    account: (row) => void rows.push(row),
    release: () => {},
    last: () => [],
  };
  let ran = 0;
  const ask = (purpose: InferPurpose) =>
    infer(
      purpose,
      { hold: 'read', kind: purpose === 'embed' ? 'embed' : 'read', run: async (c) => (ran++, { ok: true as const, value: { model: c.model, usage: { in: 4, out: 2 } } }) },
      { facts: { form: 'included', models: { flash: FLASH, embed: EMBED }, large: false, machine: false }, clock: fixedClock(T0), ledger, reads },
    );
  return { ask, held, rows, ran: () => ran };
}

test('THE ROUTER ASKS FIRST: off, a background ask reaches no model and holds nothing; his own ask goes through', async () => {
  const off = router(() => false);
  const embed = await off.ask('embed');
  assert.equal(embed.out.ok, false);
  assert.equal(embed.candidate, null);
  assert.deepEqual(embed.tries, []);
  assert.equal(embed.whose, null, 'nobody has anything to fix: the switch is his');
  assert.equal(off.ran(), 0);
  assert.deepEqual([off.held, off.rows], [[], []]);
  const press = await off.ask('ask');
  assert.equal(press.out.ok, true);
  assert.deepEqual(off.held, ['ask']);

  const on = router(() => true);
  assert.equal((await on.ask('embed')).out.ok, true);
  assert.equal(on.rows.length, 1);
});

/* ── the record's own background asks ─────────────────────────────────────────────────────────── */

const CALL = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

function ledger(reads?: () => boolean) {
  const sql = openSqlite();
  sql.exec(CALL);
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: 0, cap: 20, resets: '2026-11-01T00:00:00.000Z', capped: true } }) };
  const meter = slashRecordMeter({ sql, clock: fixedClock(T0), engine: async () => engine, model: 'glm-5.3-flash', ...(reads ? { reads } : {}) });
  const rows = () => sql.all<{ purpose: string; spends: string }>('SELECT purpose, spends FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { meter, rows };
}

test('OFF, THE RULES SPEAK AND THE LEDGER HOLDS NO ROW: every background ask is refused before anything is written', async () => {
  let on = false;
  const { meter, rows } = ledger(() => on);
  for (const ask of ['skill', 'look', 'headline', 'understand'] as const) {
    const held = await meter.background(ask);
    assert.equal(held.ok, false, ask);
    if (!held.ok) assert.match(held.refusal.fix, /switched off.*rules/u);
  }
  assert.deepEqual(rows(), [], 'a refused background ask left a row, held or turned away');

  /* HIS OWN PRESS, WITH THE SWITCH STILL OFF. */
  const press = await meter.hold('draft');
  assert.ok(press.ok, 'his own press was held by the switch');
  press.value.settle({ usage: { in: 30, out: 4 } });
  assert.deepEqual(rows(), [{ purpose: 'ask', spends: 'person' }]);

  /* TURNED ON, THE ROWS RETURN. */
  on = true;
  const look = await meter.background('look');
  assert.ok(look.ok);
  look.value.settle({ usage: { in: 300, out: 40 } });
  assert.deepEqual(rows()[1], { purpose: 'look', spends: 'background' });
});

test('A HOST THAT HANDS NO SWITCH READS IT AS ON', async () => {
  const { meter, rows } = ledger();
  assert.ok((await meter.background('headline')).ok);
  assert.equal(rows().length, 1);
});

/* ── the model pass ───────────────────────────────────────────────────────────────────────────── */

const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };
type Job = { state: string; attempts: number };

/** A record with `digests` waiting on their prose and `texts` waiting on their vectors, and a model that answers. */
async function record(digests: unknown[], texts?: string[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => T0 } });
  let n = 0;
  const ids = digests.map((d) => enqueue(sql, () => `J${++n}`, T0, 'infer.prose', d));
  if (texts) ids.push(enqueue(sql, () => `J${++n}`, T0, 'infer.embed', { at: new Date(T0).toISOString(), ids: texts.map((_, i) => `R${i}`), texts }));
  const sent: unknown[] = [];
  const lines: string[] = [];
  let health = 0;
  const pass = (reads?: () => boolean) => {
    const deps: ModelJobsDeps = {
      inference: {
        draft: async () => assert.fail('no draft is queued'),
        prose: async (digest) => (sent.push(digest), { ok: true, value: { text: 'A quiet week.' } }),
        embed: async (batch) => (sent.push([...batch]), no('UNREACHABLE', 'The model did not answer.')),
      },
      meter: ROOM,
      now: () => T0,
      log: (line) => lines.push(line),
      health: async () => (health++, { health: { state: 'answering', last_ok: null, since: null } }),
      ...(reads ? { reads } : {}),
    };
    return serveModelJobs(api, deps);
  };
  const jobs = () => ids.map((id) => ({ ...sql.one<Job & { result: string | null }>('SELECT state, attempts FROM outbox WHERE id = ?', id) }));
  return { pass, jobs, sent, lines, health: () => health };
}

const WEEK = (i: number) => ({ digest: `weekly-${i}`, headline: 'Your week', text: 'Three tasks closed.', channels: ['mcp'] });

test('OFF, THE PASS LEASES NO JOB: each waits pending with its attempts kept, and no model is asked or tested', async () => {
  const r = await record([WEEK(1), WEEK(2)]);
  assert.equal(await r.pass(() => false), false);
  await r.pass(() => false);
  assert.deepEqual(r.jobs(), [{ state: 'pending', attempts: 0 }, { state: 'pending', attempts: 0 }]);
  assert.deepEqual(r.sent, []);
  assert.equal(r.health(), 0, "the engine's health was read for a pass that may not think");
  assert.equal(r.lines.length, 1, r.lines.join('\n'));
  assert.match(r.lines[0]!, /switched off.*wait/u);

  /* TURNED ON, THEY ARE SERVED. */
  await r.pass(() => true);
  assert.equal(r.sent.length, 2);
  assert.ok(r.jobs().every((j) => j.state !== 'pending'));

  /* A SWITCH THAT CANNOT BE READ LEASES NOTHING EITHER, and the line does not say he turned it off. */
  const u = await record([WEEK(1)]);
  await u.pass(() => {
    throw new Error('the prefs could not be read');
  });
  assert.deepEqual([u.jobs(), u.sent], [[{ state: 'pending', attempts: 0 }], []]);
  assert.match(u.lines[0]!, /could not be read.*wait/u);
});

test('NO SWITCH HANDED IS ON: the pass serves as it always did', async () => {
  const r = await record([WEEK(1)]);
  await r.pass();
  assert.equal(r.sent.length, 1);
});

/* ── what is never sent ───────────────────────────────────────────────────────────────────────── */

test('A SEALED FIELD, A KEY AND A FILE’S BYTES ARE NAMED WHEREVER THEY SIT, and plain work is let through', () => {
  assert.equal(neverSent({ title: 'Renew the lease', amount: 120000, currency: 'EGP', due: '2026-10-12' }), null);
  assert.equal(neverSent(['Call the bank', 'Three tasks closed.']), null);
  assert.equal(neverSent({ sealed: false, opened: 0, last_opened: null, last_by: null }), null, 'a field with nothing sealed in it');

  assert.equal(neverSent({ row: { token: { sealed: true, opened: 2, last_opened: null, last_by: null } } }), 'sealed');
  assert.equal(neverSent({ a: [{ ciphertext: 'AAAA' }] }), 'sealed');
  assert.equal(neverSent({ note: `the deploy key is ${KEY}` }), 'key');
  assert.equal(neverSent([`ok`, KEY]), 'key');
  assert.equal(neverSent({ file: new Uint8Array([1, 2, 3]) }), 'bytes');
  assert.equal(neverSent(new ArrayBuffer(4)), 'bytes');
  assert.equal(neverSent({ scan: `data:image/png;base64,${'iVBORw0KGgo'.repeat(8)}` }), 'bytes');
  assert.equal(neverSent({ body: `<p>The receipt</p><img src="data:image/png;base64,${'iVBORw0KGgo'.repeat(8)}">` }), 'bytes', 'a picture inside a body');
  assert.equal(neverSent({ note: 'The data: the base64, as agreed.' }), null, 'words about data are not bytes');
  assert.equal(neverSent({ [KEY]: 'the deploy key' }), 'key', "a key filed as a field's name");

  const out = sendable({ note: KEY });
  assert.equal(out.ok, false);
  if (!out.ok && 'refusal' in out) {
    assert.match(out.refusal.fix, /key.*never sent to a model/u);
    assert.ok(!out.refusal.fix.includes(KEY), 'the refusal quoted the key');
  }
  assert.equal(sendable('Three tasks closed.').ok, true);
});

test('THE PASS SENDS NONE OF THEM: a digest holding a key goes out as its figures, and a text holding one is not embedded', async () => {
  const r = await record([{ ...WEEK(1), text: `Rotate ${KEY} today.` }, WEEK(2)], ['Call the bank', `token ${KEY}`]);
  await r.pass();
  const wire = JSON.stringify(r.sent);
  assert.ok(!wire.includes(KEY), 'a key reached a model');
  assert.equal(r.sent.filter((s) => !Array.isArray(s)).length, 1, 'only the clean digest was asked about');
  const batch = r.sent.find((s): s is string[] => Array.isArray(s));
  assert.ok(batch, 'the batch was embedded');
  assert.equal(batch.length, 2, 'the vectors are matched to rows by position, so the batch keeps its length');
  assert.equal(batch[0], 'Call the bank');
  assert.ok(r.lines.some((l) => /key.*not sent/u.test(l)), r.lines.join('\n'));
  assert.ok(!r.lines.join('\n').includes(KEY), 'the log quoted the key');
});
