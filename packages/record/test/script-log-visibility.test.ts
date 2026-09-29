/**
 * Who reads what a script said while it ran.
 *
 * `keepLog` puts a run's `ctx.log` on its `pull` event, and that line is about a declaration, so `lineOf` showed it to
 * everybody who reads the record as a whole. Measured: a member at `write`, held to `append` on Money and refused
 * `list money`, reading "Salary: Omar 91000" off the run line in `recentHistory` and in `whatsNew`, while the row the
 * same run wrote showed its money field as `--redacted--`. The script reads as the owner approved it, so its log quotes
 * whatever the lists it touched hold, and none of the record's own redaction reaches free text.
 *
 * The run is made the real way: the schedule fires, the kernel's pass leases `script.run`, and a host's sandbox hands
 * back one write and one log line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const DAY = 86_400_000;
const SAID = 'read money: Salary: Omar 91000; wrote total EGP 91000.00';

const MONEY = {
  id: 'register.money',
  kind: 'register' as const,
  body: { id: 'money', name: 'Money', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'amount', type: 'int' }] } as never,
};
const SUMS = {
  id: 'register.sums',
  kind: 'register' as const,
  body: { id: 'sums', name: 'Sums', title: 'at', fields: [{ id: 'at', type: 'text', required: true }, { id: 'total', type: 'money' }] } as never,
};
const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const TALLY = {
  id: 'script.tally',
  kind: 'script' as const,
  body: { script: 'tally', runs: { every: '1d' }, egress: [], keys: [], reads: ['money'], writes: ['sums'], source: 'export default async function run(ctx) {}' } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** The measured member: the whole record at `write`, and Money held to `append`, which files and does not read. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, levels: { money: 'append' } };
/** A colleague at `write` with no list held lower: she reads Money, and she did not approve the script. */
const writer: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' } };
/** An owner whom another owner held to `append` on Money, which `members.ts` allows. */
const heldOwner: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'owner' }, levels: { money: 'append' } };
/** An owner held to `append` on Sums, the list the script WRITES and does not read. Without her, `keepLog` keeping only
 *  `reads` passed every test here; a log can quote what it is about to write, so the written list counts too. */
const sumsHeld: CallContext = { principal: { kind: 'person', id: 'p_6', level: 'owner' }, levels: { sums: 'append' } };
/** An owner held to `append` on a list the script neither reads nor writes. */
const diaryHeld: CallContext = { principal: { kind: 'person', id: 'p_5', level: 'owner' }, levels: { diary: 'append' } };
/** The owner's own agent key: it reads the record, and a token never administers a script (ADR-060). */
const key: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };

type Line = { kind: string; target: string | null; to: Record<string, unknown> | null; note: string | null };

async function ran() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const installed = await api.kernel.install([MONEY, SUMS, DIARY, TALLY]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(api.kernel.create('money', { name: 'Salary: Omar', amount: 91000 }, { actor: 'p_1' }).ok);
  clock.advance(2 * DAY);
  const answer = async () => ({
    writes: [{ op: 'create' as const, register: 'sums', fields: { at: 'today', total: { amount: 9_100_000, currency: 'EGP' } } }],
    log: SAID,
    usage: { fetches: 0, bytes: 0, wall_ms: 5, cpu_ms: 1 },
  });
  const run = await api.kernel.runActions(async () => assert.fail('a script sends no action request'), { script: answer });
  assert.equal(run.ran, 1, JSON.stringify(run));
  const history = async (ctx: CallContext): Promise<Line[]> => {
    const out = await api.recentHistory({}, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.events as unknown as Line[];
  };
  const runLine = async (ctx: CallContext): Promise<Line> => {
    const line = (await history(ctx)).find((e) => e.kind === 'pull' && e.target === 'declaration:script.tally');
    assert.ok(line, 'the reader is not shown that the script ran');
    return line;
  };
  return { sql, api, history, runLine };
}

test('A MEMBER HELD TO APPEND ON THE LIST THE SCRIPT READ SEES THAT IT RAN, AND NOT WHAT IT LOGGED', async () => {
  const { sql, api, history, runLine } = await ran();
  const listed = await api.list({ register: 'money' }, member);
  assert.equal(listed.ok, false, 'the member reads Money, so this case proves nothing');

  const line = await runLine(member);
  assert.equal(line.to?.outcome, 'ok', 'the run itself, its outcome and its counts, stays on her line');
  assert.equal(line.note, 'tally ran and wrote one row.');
  assert.equal(line.to?.log, '--redacted--', 'her run line carries the log, or drops it without saying one was kept');
  assert.ok(!JSON.stringify(await history(member)).includes('Omar'), 'recentHistory hands her the salary');

  const news = await api.whatsNew(undefined, member);
  assert.ok(news.ok, JSON.stringify(news));
  assert.ok(
    news.value.events.some((e) => e.target === 'declaration:script.tally'),
    'whatsNew no longer tells her the script ran',
  );
  assert.ok(!JSON.stringify(news).includes('Omar'), 'whatsNew hands her the salary');
  sql.close();
});

test('THE OWNER WHO APPROVED IT READS THE LOG VERBATIM, and the row it wrote is still redacted beside it', async () => {
  const { sql, history, runLine } = await ran();
  assert.equal((await runLine(owner)).to?.log, SAID);
  const wrote = (await history(owner)).find((e) => e.kind === 'create' && e.target !== null && e.to !== null && 'total' in e.to);
  assert.equal(wrote?.to?.total, '--redacted--', 'the ledger stopped redacting the money it wrote');
  assert.equal((await runLine(diaryHeld)).to?.log, SAID, 'an owner held lower on a list the script never touched lost the log');
  sql.close();
});

test('NOBODY ELSE READS IT: a colleague who reads Money, an owner held to append on Money or on Sums, and the owner\'s own key', async () => {
  const { sql, runLine } = await ran();
  for (const [who, ctx] of [
    ['a colleague at write', writer],
    ['an owner held to append on Money', heldOwner],
    ['an owner held to append on Sums, the list it wrote', sumsHeld],
    ["the owner's agent key", key],
  ] as const) {
    const line = await runLine(ctx);
    assert.equal(line.to?.log, '--redacted--', `${who} read the log`);
    assert.equal(line.to?.outcome, 'ok', `${who} lost the run itself`);
  }
  sql.close();
});

test('A RUN WRITTEN BEFORE ITS LISTS WERE KEPT ON IT GOES ONLY TO AN OWNER WHO READS EVERY LIST', async () => {
  const { sql, runLine } = await ran();
  /* AN EVENT FROM BEFORE THIS FILE carries `log` and not the lists its script touched, and the lists are asked about
     as every list rather than none. */
  sql.exec("UPDATE event SET to_v = json_remove(to_v, '$.lists') WHERE kind = 'pull' AND target = 'declaration:script.tally'");
  assert.equal((await runLine(owner)).to?.log, SAID);
  assert.equal((await runLine(diaryHeld)).to?.log, '--redacted--');
  assert.equal((await runLine(member)).to?.log, '--redacted--');
  sql.close();
});
