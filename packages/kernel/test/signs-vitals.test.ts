/**
 * The four vitals of the record itself (and the newest rate's age beside them), each read red on a record planted to fail it, then green once the
 * plant is gone, with names and no ids in what a person reads.
 *
 * THE RECORDS ARE BUILT THROUGH THE KERNEL'S OWN VERBS: a list with an amount installed, rows created by a person. The
 * plants are written to the tables themselves, because each is what the kernel refuses to write today and what an
 * older build, a fallback or an import left behind: a line signed by nobody, a `system` change with nothing behind it,
 * an amount with a fraction or no currency, a file left behind the build's updates.
 *
 * Until `signs.ts` spreads `SIGNS_VITALS`, the readers are called as `readSigns` calls them; the last test reads them
 * through `VITAL_SIGNS` once they are wired, and is skipped until then.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, VITAL_SIGNS, type Declaration, type Kernel } from '../src/index.ts';
import { FORMAT_VERSION, KERNEL_MIGRATION } from '../src/migrate.ts';
import type { SignReading } from '../src/signs.ts';
import { amountFault, SIGNS_VITALS } from '../src/signs-vitals.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const HOUR = 3_600_000;
const at = (ms: number): string => new Date(ms).toISOString();

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
};

type Rec = { k: Kernel; sql: NodeSql };

async function record(...decls: Declaration[]): Promise<Rec> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  if (decls.length > 0) {
    const out = await k.install(decls);
    assert.ok(out.ok, fixOf(out));
  }
  return { k, sql };
}

/** A bill made by the owner, and its id. */
function bill(r: Rec, what: string, amount?: { amount: number; currency: string }): string {
  const made = r.k.create('bills', { what, ...(amount ? { amount } : {}) } as never, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  return made.value.id;
}

/** One sign, read as `readSigns` reads it, with no em dash and no id in what a person reads. */
function sign(sql: NodeSql, id: string, nowMs = NOW): SignReading {
  const s = SIGNS_VITALS.find((x) => x.sign === id);
  assert.ok(s?.read, `${id} is not on the list`);
  const got = s.read(sql, nowMs, 'UTC');
  for (const line of [got.said, ...(got.facts ?? [])]) {
    assert.ok(!/[—]/.test(line), `${id} wrote an em dash: ${line}`);
    assert.ok(!/[0-9A-HJKMNP-TV-Z]{26}|\b(?:register|entry)[.:]|\brow\b/.test(line), `${id} wrote an id or a word a person should not read: ${line}`);
  }
  return got;
}

/** A line of history as a build writes it: `n` is the tail of its id, so a test can name its batch. */
let n = 0;
function line(sql: NodeSql, e: { actor: string; kind: string; target?: string | null; note?: string; batch?: string; to?: unknown; ts?: string }): string {
  const id = `01K9VITALS000000000000${String(++n).padStart(4, '0')}`;
  sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
    id,
    e.ts ?? at(NOW - HOUR),
    e.actor,
    e.kind,
    e.target === undefined ? null : e.target,
    e.target ? 'entry' : null,
    e.to === undefined ? null : JSON.stringify(e.to),
    e.note ?? null,
    e.batch ?? null,
  );
  return id;
}

test('THE FOUR, in order, with names and no ids, read by the kernel', () => {
  assert.deepEqual(
    SIGNS_VITALS.map((s) => s.sign),
    ['writes-authored', 'format-current', 'amounts-whole', 'rate-age'],
  );
  for (const s of SIGNS_VITALS) {
    assert.ok(!/[a-z]+-[a-z]+/.test(s.name), `${s.sign}'s name is an id`);
    assert.equal(s.hand, 'kernel');
    assert.equal(typeof s.read, 'function');
  }
});

test('AN EMPTY RECORD READS NONE ON ALL FOUR, never green, as `signs-read` and `signs-daily` hold of every sign', async () => {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  for (const s of SIGNS_VITALS) {
    const got = sign(sql, s.sign);
    assert.equal(got.state, 'none', `${s.sign} read ${got.state} on an empty record: ${got.said}`);
    assert.equal(got.value, null);
  }
  sql.close();
});

/* ── writes-authored ───────────────────────────────────────────────────── */

test('WRITES AUTHORED: a record made, a list installed and bills written by a person is green, and nothing written reads none', async () => {
  const r = await record(BILLS);
  bill(r, 'Rent', { amount: 125_000, currency: 'GBP' });
  const green = sign(r.sql, 'writes-authored');
  assert.equal(green.state, 'green', green.said + (green.facts ?? []).join(' '));
  assert.equal(green.value, 0);
  assert.equal(green.said, 'Every write in the last 24 hours has an author.');
  /* A DAY LATER NOTHING IS IN THE WINDOW, which is nothing to judge by and not green. */
  const later = sign(r.sql, 'writes-authored', NOW + 48 * HOUR);
  assert.equal(later.state, 'none');
  assert.equal(later.value, null);
  r.sql.close();
});

test('WRITES AUTHORED: one write signed by nobody is red with its list named; the same write two days old is not judged', async () => {
  const r = await record(BILLS);
  const id = bill(r, 'Rent', { amount: 125_000, currency: 'GBP' });
  line(r.sql, { actor: '', kind: 'edit', target: `entry:${id}` });
  const red = sign(r.sql, 'writes-authored');
  assert.equal(red.state, 'red');
  assert.equal(red.value, 1);
  assert.equal(red.said, '1 write in the last 24 hours has no author: Bills.');
  assert.ok(red.facts?.includes('1 write to Bills signed by nobody.'), JSON.stringify(red.facts));
  r.sql.exec("UPDATE event SET ts = ? WHERE actor = ''", at(NOW - 48 * HOUR));
  assert.equal(sign(r.sql, 'writes-authored').state, 'green');
  /* A JAVASCRIPT NOTHING WRITTEN AS TEXT IS NO AUTHOR EITHER. */
  line(r.sql, { actor: 'undefined', kind: 'note', note: 'said by nobody' });
  const lost = sign(r.sql, 'writes-authored');
  assert.equal(lost.state, 'red');
  assert.ok(lost.facts?.includes('1 write to this BrainDog itself signed by nobody.'), JSON.stringify(lost.facts));
  r.sql.close();
});

test('WRITES AUTHORED: a change signed by BrainDog with nothing behind it is red; a sweep, a cause, the night and the kernel\'s own work are not', async () => {
  const r = await record(BILLS);
  const id = bill(r, 'Rent', { amount: 125_000, currency: 'GBP' });
  /* WHAT STANDS BEHIND ONE: the sweep's sentence, a person's write in the same batch, the night's own row, housekeeping. */
  line(r.sql, { actor: 'system', kind: 'state', target: `entry:${id}`, note: 'Closed by the hourly sweep.' });
  const cause = line(r.sql, { actor: 'p_1', kind: 'edit', target: `entry:${id}` });
  line(r.sql, { actor: 'system', kind: 'edit', target: `entry:${id}`, batch: cause });
  line(r.sql, { actor: 'system', kind: 'create', target: `entry:${id}`, to: { what: 'The night', taken: 'nightly' } });
  line(r.sql, { actor: 'system', kind: 'purge', target: null, note: 'sections' });
  line(r.sql, { actor: 'system', kind: 'resolve', target: null });
  assert.equal(sign(r.sql, 'writes-authored').state, 'green', 'what stands behind each is read');
  /* A WRITE OF TWO FIELDS IS ONE WRITE: its second line carries the first line's id as its batch. */
  const first = line(r.sql, { actor: 'system', kind: 'edit', target: `entry:${id}` });
  line(r.sql, { actor: 'system', kind: 'edit', target: `entry:${id}`, batch: first });
  const red = sign(r.sql, 'writes-authored');
  assert.equal(red.state, 'red');
  assert.equal(red.value, 1, 'one write, however many fields');
  assert.ok(red.facts?.includes('1 write to Bills signed by BrainDog with no schedule, script or plugin behind it.'), JSON.stringify(red.facts));
  r.sql.close();
});

/* ── format-current ────────────────────────────────────────────────────── */

test('FORMAT CURRENT: a record that opened is green; one left two updates behind, or a file saying another format, is red', async () => {
  const r = await record();
  const green = sign(r.sql, 'format-current');
  assert.equal(green.state, 'green');
  assert.equal(green.value, 0);
  assert.equal(green.said, `This BrainDog is in format ${FORMAT_VERSION} with all ${KERNEL_MIGRATION} updates in.`);
  /* A FILE LEFT BEHIND, as one written by an older build reads before it is opened. */
  r.sql.exec('DELETE FROM migration WHERE version > ?', KERNEL_MIGRATION - 2);
  const behind = sign(r.sql, 'format-current');
  assert.equal(behind.state, 'red');
  assert.equal(behind.value, 2);
  assert.equal(behind.said, 'This BrainDog is 2 updates behind this build.');
  r.sql.close();

  const s = await record();
  s.sql.exec("UPDATE dog_meta SET value = '0' WHERE key = 'format'");
  const old = sign(s.sql, 'format-current');
  assert.equal(old.state, 'red');
  assert.equal(old.value, 1);
  assert.equal(old.said, `Its file says format 0 where this build reads format ${FORMAT_VERSION}.`);
  s.sql.exec("DELETE FROM dog_meta WHERE key = 'format'");
  assert.equal(sign(s.sql, 'format-current').said, 'Its file does not say its format.');
  s.sql.exec("INSERT INTO dog_meta (key, value) VALUES ('format', ?)", String(FORMAT_VERSION));
  s.sql.exec('UPDATE record SET format_ver = 0');
  const own = sign(s.sql, 'format-current');
  assert.equal(own.state, 'red', 'the record\'s own word is read too');
  assert.equal(own.value, 1);
  s.sql.exec('UPDATE record SET format_ver = ?', FORMAT_VERSION);
  /* AND A FILE FROM A NEWER BUILD, which `applyMigrations` refuses to open, reads red here too. */
  s.sql.exec("INSERT INTO migration (version, applied_at, checksum) VALUES (?, ?, 'x')", KERNEL_MIGRATION + 1, at(NOW));
  const newer = sign(s.sql, 'format-current');
  assert.equal(newer.state, 'red');
  assert.equal(newer.said, 'This BrainDog was written by a newer build, 1 update ahead of this one.');
  s.sql.close();
});

/* ── amounts-whole ─────────────────────────────────────────────────────── */

test('AMOUNTS WHOLE: no list with an amount, and no amount held, read none; whole amounts with a currency are green', async () => {
  const bare = await record();
  assert.equal(sign(bare.sql, 'amounts-whole').state, 'none');
  bare.sql.close();
  const r = await record(BILLS);
  bill(r, 'Nothing owed yet');
  const empty = sign(r.sql, 'amounts-whole');
  assert.equal(empty.state, 'none', 'an empty amount is not one held');
  bill(r, 'Rent', { amount: 125_000, currency: 'GBP' });
  bill(r, 'Fare', { amount: 300, currency: 'JPY' });
  const green = sign(r.sql, 'amounts-whole');
  assert.equal(green.state, 'green');
  assert.equal(green.value, 0);
  assert.equal(green.said, 'Every amount is whole, with its currency.');
  assert.deepEqual(green.facts, ['2 amounts held, 0 not whole or without a currency.']);
  r.sql.close();
});

test('AMOUNTS WHOLE: a fraction and a missing currency are each red with the bill named; a deleted one is not read', async () => {
  const r = await record(BILLS);
  const rent = bill(r, 'Rent', { amount: 125_000, currency: 'GBP' });
  const chair = bill(r, 'Office chair', { amount: 9_900, currency: 'EGP' });
  r.sql.exec("UPDATE entry SET fields = json_set(fields, '$.amount.amount', 1250.5) WHERE id = ?", rent);
  const one = sign(r.sql, 'amounts-whole');
  assert.equal(one.state, 'red');
  assert.equal(one.value, 1);
  assert.equal(one.said, '1 amount is not whole or has no currency, in Bills.');
  assert.ok(one.facts?.includes('Rent in Bills holds a fraction of its smallest unit.'), JSON.stringify(one.facts));
  r.sql.exec("UPDATE entry SET fields = json_remove(fields, '$.amount.currency') WHERE id = ?", chair);
  const two = sign(r.sql, 'amounts-whole');
  assert.equal(two.value, 2);
  assert.ok(two.facts?.includes('Office chair in Bills holds no currency.'), JSON.stringify(two.facts));
  assert.equal(two.said, '2 amounts are not whole or have no currency, in Bills.');
  r.sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', at(NOW), rent);
  assert.equal(sign(r.sql, 'amounts-whole').value, 1, 'a deleted bill is not read');
  r.sql.exec("UPDATE entry SET fields = json_set(fields, '$.amount', json('{\"amount\":9900,\"currency\":\"EGP\"}')) WHERE id = ?", chair);
  assert.equal(sign(r.sql, 'amounts-whole').state, 'green', 'mended, it reads green again');
  r.sql.close();
});

test('AMOUNT FAULT: what one stored amount is short of', () => {
  assert.equal(amountFault(undefined), null);
  assert.equal(amountFault(null), null);
  assert.equal(amountFault({ amount: 100, currency: 'GBP' }), null);
  assert.equal(amountFault({ amount: 0, currency: 'USD' }), null);
  assert.equal(amountFault({ amount: 100.25, currency: 'GBP' }), 'fraction');
  assert.equal(amountFault({ amount: '100', currency: 'GBP' }), 'number');
  assert.equal(amountFault({ currency: 'GBP' }), 'number');
  assert.equal(amountFault({ amount: Number.NaN, currency: 'GBP' }), 'number');
  assert.equal(amountFault(12.5), 'fraction');
  assert.equal(amountFault({ amount: 100 }), 'currency');
  assert.equal(amountFault({ amount: 100, currency: '' }), 'currency');
  assert.equal(amountFault({ amount: 100, currency: 'XYZ' }), 'currency');
  assert.equal(amountFault({ amount: 100, currency: 'gbp' }), 'currency');
  assert.equal(amountFault(100), 'currency');
});

/* ── wired ─────────────────────────────────────────────────────────────── */

const wired = SIGNS_VITALS.every((s) => VITAL_SIGNS.some((v) => v.sign === s.sign));

test('WIRED: the four are on the closed list, once each', { skip: wired ? false : 'signs.ts does not spread SIGNS_VITALS yet' }, () => {
  for (const s of SIGNS_VITALS) assert.equal(VITAL_SIGNS.filter((v) => v.sign === s.sign).length, 1, `${s.sign} is on the list once`);
});
