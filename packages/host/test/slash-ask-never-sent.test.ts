/**
 * What is never sent, read before a background ask is held (`slash-ask.ts` `slashRecordMeter().background`).
 *
 * THE LOOK, THE HEADLINES AND A SKILL DRAFT HAND THE METER WHAT THEY ARE ABOUT TO SEND, and a sealed field, a key or a
 * file's bytes anywhere in it refuses the ask before the ledger: no held row, no turned-away row, no month spent, and
 * the refusal says which of the three and never the value. The switch does not decide it, and a spent month does not
 * answer first. A clean payload is held as it always was, and so is an ask that hands none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BACKGROUND_JOBS_MONTH } from '../src/model-jobs.ts';
import { slashRecordMeter, type SlashBackgroundAsk } from '../src/slash-ask.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 13, 9, 0);
/** A key as an issuer shapes one, built here so no credential sits in the file. */
const KEY = `sk-ant-${'aB3dE6gH9jK2mN5pQ8rS1tU4'}`;
const PICTURE = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'}`;

const CALL = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

function ledger(reads?: () => boolean) {
  const sql = openSqlite();
  sql.exec(CALL);
  let built = 0;
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: 0, cap: 20, resets: '2026-11-01T00:00:00.000Z', capped: true } }) };
  const meter = slashRecordMeter({
    sql,
    clock: fixedClock(T0),
    engine: async () => {
      built++;
      return engine;
    },
    model: 'glm-5.3-flash',
    ...(reads ? { reads } : {}),
  });
  const rows = () => sql.all<{ purpose: string; spends: string; code: string | null }>('SELECT purpose, spends, code FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { sql, meter, rows, built: () => built };
}

/** The three paths the record asks on its own, each with a payload shaped as that path's is. */
const PATHS: readonly { ask: SlashBackgroundAsk; clean: object }[] = [
  { ask: 'look', clean: { pages: [{ name: 'Money', line: 'Rent is due on Friday.', figures: [{ label: 'Owed', minor: 120000, currency: 'EGP' }] }] } },
  { ask: 'headline', clean: { page: 'Work', line: 'Two tasks are late.', titles: ['Send the invoice', 'Call the landlord'] } },
  { ask: 'skill', clean: { skill: 'Invoices', lessons: ['Say the due date in the first line.'] } },
];

/** `clean` with one thing that is never sent put where a job's fields are, three levels down. */
const DIRTY: readonly { at: 'sealed' | 'key' | 'bytes'; says: RegExp; put: (clean: object) => object }[] = [
  { at: 'sealed', says: /sealed field/u, put: (clean) => ({ ...clean, rows: [{ title: 'Bank', pin: { sealed: true, opened: false } }] }) },
  { at: 'sealed', says: /sealed field/u, put: (clean) => ({ ...clean, rows: [{ title: 'Safe', value: { ciphertext: 'b64', nonce: 'n' } }] }) },
  { at: 'key', says: /looks like a key/u, put: (clean) => ({ ...clean, rows: [{ title: 'Deploy', note: KEY }] }) },
  { at: 'key', says: /looks like a key/u, put: (clean) => ({ ...clean, rows: [{ [KEY]: 'filed as a name' }] }) },
  { at: 'bytes', says: /file's bytes/u, put: (clean) => ({ ...clean, rows: [{ title: 'Scan', body: `Here it is: ${PICTURE}` }] }) },
  { at: 'bytes', says: /file's bytes/u, put: (clean) => ({ ...clean, rows: [{ title: 'Scan', file: new Uint8Array([1, 2, 3]) }] }) },
];

test('A SEALED FIELD, A KEY OR A FILE IS REFUSED BEFORE THE LEDGER on the look, the headlines and a skill draft', async () => {
  for (const { ask, clean } of PATHS)
    for (const { at, says, put } of DIRTY) {
      const { meter, rows, built } = ledger();
      const held = await meter.background(ask, put(clean));
      assert.equal(held.ok, false, `${ask} held a payload with ${at} in it`);
      if (held.ok) continue;
      assert.equal(held.refusal.code, 'FORBIDDEN', `${ask} ${at}`);
      assert.match(held.refusal.fix, says, `${ask} ${at}`);
      assert.match(held.refusal.fix, /never sent to a model, so nothing was asked/u);
      assert.deepEqual(rows(), [], `${ask} left a row, held or turned away, for a payload with ${at} in it`);
      assert.equal(built(), 0, `${ask} reached the engine with ${at} in its payload`);
    }
});

test('THE REFUSAL SAYS WHICH AND NEVER WHAT: the key and the bytes are not quoted, and no em dash is written', async () => {
  const { meter } = ledger();
  for (const payload of [{ note: KEY }, { body: PICTURE }, { pin: { sealed: true, opened: true, value: 'hunter2-is-the-pin' } }]) {
    const held = await meter.background('look', payload);
    assert.equal(held.ok, false);
    if (held.ok) continue;
    const said = JSON.stringify(held.refusal);
    assert.ok(!said.includes(KEY) && !said.includes('iVBORw0KGgo') && !said.includes('hunter2'), 'the refusal quoted what it refused');
    assert.doesNotMatch(held.refusal.fix, /—/u);
  }
});

test('A CLEAN PAYLOAD IS HELD AS IT ALWAYS WAS, and so is an ask that hands none', async () => {
  const { meter, rows } = ledger();
  for (const { ask, clean } of PATHS) {
    const held = await meter.background(ask, clean);
    assert.ok(held.ok, `${ask} was refused a clean payload`);
    held.value.settle({ usage: { in: 300, out: 40 } });
  }
  const bare = await meter.background('headline');
  assert.ok(bare.ok, 'an ask with no payload was refused');
  bare.value.release();
  assert.deepEqual(rows(), [
    { purpose: 'look', spends: 'background', code: null },
    { purpose: 'headline', spends: 'background', code: null },
    { purpose: 'look', spends: 'background', code: null },
  ]);
});

test('THE SWITCH DOES NOT DECIDE IT: on or unhanded the payload is still read, and off the switch speaks first', async () => {
  for (const reads of [undefined, () => true]) {
    const { meter, rows } = ledger(reads);
    const held = await meter.background('headline', { line: KEY });
    assert.equal(held.ok, false);
    if (!held.ok) assert.match(held.refusal.fix, /looks like a key/u);
    assert.deepEqual(rows(), []);
  }
  const off = ledger(() => false);
  const held = await off.meter.background('headline', { line: KEY });
  assert.equal(held.ok, false);
  if (!held.ok) assert.match(held.refusal.fix, /switched off/u);
  assert.deepEqual(off.rows(), []);
});

test('A SPENT MONTH DOES NOT ANSWER FIRST: the payload is refused, and no turned-away row is left for it', async () => {
  const { sql, meter, rows } = ledger();
  const at = new Date(T0).toISOString();
  for (let i = 0; i < BACKGROUND_JOBS_MONTH; i++)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, question, purpose, spends)
       VALUES (?, ?, 'pattern', 'a', 'glm-5.3-flash', 1, 1, 0, 1, 'ok', 'x', 'look', 'background')`,
      `spent-${i}`,
      at,
    );
  const before = rows().length;
  const dirty = await meter.background('look', { rows: [{ pin: { sealed: true, opened: false } }] });
  assert.equal(dirty.ok, false);
  if (!dirty.ok) assert.equal(dirty.refusal.code, 'FORBIDDEN');
  assert.equal(rows().length, before, 'a payload that is never sent left a row');

  /* THE SAME MONTH, A CLEAN PAYLOAD: the cap speaks, and that ask does leave its turned-away row. */
  const clean = await meter.background('look', { pages: [] });
  assert.equal(clean.ok, false);
  if (!clean.ok) assert.equal(clean.refusal.code, 'SLASH_BUDGET_SPENT');
  assert.equal(rows().length, before + 1);
});
