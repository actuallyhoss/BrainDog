/**
 * An agent reads the whole inbox in one answer, and one arrival whole.
 *
 * WHAT WAS MEASURED BEFORE THIS. `inbox` answered one page of one choice of states with every body whole, so an agent
 * given the `inbox` reach read the waiting ones and had to ask five more times to learn what was skipped, filed,
 * proposed and archived, and a busy inbox of long mails passed the limit of the answer it was read in. A whole-record
 * token of the owner's without the reach was told "no token reaches it" on the day a token with the reach did. And the
 * questions a rule asked about an arrival were the owner's alone, so the agent that read the arrival could not read
 * what was asked about it.
 *
 * `digest: true` IS ALL SIX STATES AT ONCE: a count of each, the hundred newest of each, each body cut to 180
 * characters and marked `cut` only when it was longer. `id` is one arrival, whole. Neither changes who is let in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type InboxDigest, type InboxPage } from '../src/index.ts';
import type { InboxLine } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const STATES = ['untriaged', 'review', 'skipped', 'matched', 'proposed', 'ignored'] as const;
/** 250 arrivals over four states. Two states hold none, and still have to be counted and listed. */
const HELD = { untriaged: 130, review: 60, skipped: 40, matched: 20, proposed: 0, ignored: 0 } as const;
const NO_REACH = 'Reading the inbox needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.';

/** The body of the nth arrival: every fifth is long, and one in each state is exactly 180 characters. */
const bodyOf = (n: number, k: number): string =>
  k === 0 ? `E${n} `.padEnd(180, 'x') : n % 5 === 0 ? `Long ${n}: ${'debit card purchase at a shop with a long name, '.repeat(8)}` : `Debit ${n}`;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const ids: Record<string, string[]> = {};
  const bodies = new Map<string, string>();
  let n = 0;
  for (const state of STATES) {
    ids[state] = [];
    for (let k = 0; k < HELD[state]; k++) {
      n += 1;
      const body = bodyOf(n, k);
      const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n}` }, body, sha256: `s${n}` });
      assert.ok(out.ok, JSON.stringify(out));
      sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', state, out.value.raw);
      ids[state]!.push(out.value.raw);
      bodies.set(out.value.raw, body);
    }
  }
  assert.equal(n, 250);
  return { sql, api, ids, bodies };
}

/** The owner's agent: a token for the whole record, minted by p_1, who is still the owner, with the `inbox` reach. */
const granted = (scope: 'read' | 'propose' | 'write' = 'read'): CallContext => ({
  principal: { kind: 'token', id: 't_inbox', scope, person: 'p_1', level: 'owner', reach: ['inbox'] },
});
/** The same token without the reach. */
const bare: CallContext = { principal: { kind: 'token', id: 't_bare', scope: 'write', person: 'p_1', level: 'owner' } };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type No = { code: string; fix: string; at?: string };
const refusal = (r: { ok: boolean }): No | null => (r.ok ? null : ((r as unknown as { refusal: No }).refusal ?? null));

test('THE DIGEST IS ALL SIX STATES IN ONE ANSWER: a count of each, the hundred newest of each, each body cut to 180', async () => {
  const { api, sql, ids, bodies } = await record();
  for (const ctx of [granted(), owner]) {
    const out = await api.inbox({ digest: true }, ctx);
    assert.ok(out.ok, JSON.stringify(refusal(out)));
    const digest: InboxDigest = out.value;
    assert.deepEqual(Object.keys(digest).sort(), ['counts', 'states'], 'a digest is counts and states, and nothing a page carries');
    assert.deepEqual(digest.counts, HELD, 'all six states are counted, the empty ones as zero');
    assert.deepEqual(Object.keys(digest.states), [...STATES], 'all six states are listed, the empty ones as nothing');
    for (const state of STATES) {
      const lines = digest.states[state];
      const newest = [...ids[state]!].reverse().slice(0, 100);
      assert.deepEqual(lines.map((l) => l.id), newest, `${state} is not its newest hundred, newest first`);
      assert.ok(lines.every((l) => l.state === state), `${state} holds an arrival of another state`);
      for (const line of lines) {
        const whole = bodies.get(line.id)!;
        assert.ok((line.body ?? '').length <= 180, `${line.subject} was sent ${line.body?.length} characters`);
        assert.equal(line.body, whole.slice(0, 180), `${line.subject} is not the start of what arrived`);
        assert.equal(line.cut, whole.length > 180 ? true : undefined, `${line.subject} (${whole.length} characters) is marked wrongly`);
        assert.equal(line.subject.startsWith('Text '), true);
        assert.equal(line.from, 'BANK');
      }
    }
    assert.equal(digest.states.untriaged.length, 100, 'a state of 130 sent more than a hundred');
    assert.ok(digest.states.untriaged.some((l) => l.cut === true) && digest.states.untriaged.some((l) => l.cut === undefined));
    assert.ok(JSON.stringify(digest).length < 80_000, `the digest of 250 arrivals is ${JSON.stringify(digest).length} characters`);
  }
  sql.close();
});

test('A BODY IS CUT BY CHARACTERS, never through the middle of one', async () => {
  const { api, sql } = await record();
  const body = `${'a'.repeat(179)}${'\u{1F4B7}'.repeat(4)}`;
  const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: 'Notes' }, body, sha256: 'emoji' });
  assert.ok(out.ok);
  const read = await api.inbox({ digest: true }, granted());
  assert.ok(read.ok);
  const line = read.value.states.untriaged[0]!;
  assert.equal(line.subject, 'Notes');
  assert.equal(line.body, `${'a'.repeat(179)}\u{1F4B7}`, 'the cut split a character in two');
  assert.equal(line.cut, true);
  sql.close();
});

test('ONE ARRIVAL IS READ WHOLE BY ITS ID, in any state, and an id that is no arrival is refused in a sentence', async () => {
  const { api, sql, ids, bodies } = await record();
  for (const state of ['untriaged', 'review', 'skipped', 'matched'] as const) {
    /* The fifth of each state is a long one, so `whole` is more than the digest sent. */
    const id = ids[state]!.find((x) => bodies.get(x)!.length > 180)!;
    for (const ctx of [granted(), owner]) {
      const out = await api.inbox({ id }, ctx);
      assert.ok(out.ok, JSON.stringify(refusal(out)));
      const line: InboxLine = out.value;
      assert.equal(line.id, id);
      assert.equal(line.state, state);
      assert.equal(line.body, bodies.get(id), 'one arrival was not sent whole');
      assert.equal('cut' in line, false, 'an arrival sent whole is not marked as cut');
      assert.equal('arrivals' in line, false, 'one arrival is the arrival, not a page of one');
    }
  }
  for (const id of ['in_nothing', 'obligations#1', '']) {
    const out = await api.inbox({ id }, granted());
    const no = refusal(out);
    assert.equal(out.ok, false, `"${id}" was read as an arrival`);
    assert.ok((no?.fix.length ?? 0) > 20 && /arrival/u.test(no?.fix ?? ''), `"${id}" was refused without a sentence: ${JSON.stringify(no)}`);
    assert.equal(no?.at, 'id');
  }
  assert.equal(refusal(await api.inbox({ id: 7 } as never, granted()))?.at, 'id', 'an id that is not text was read');
  /* AN ERASED ARRIVAL IS NO ARRIVAL ANYBODY READS: its bytes are gone on purpose, and so is its line. */
  const gone = ids.skipped![0]!;
  sql.exec("UPDATE inbox_raw SET state = 'erased', body = NULL WHERE id = ?", gone);
  assert.equal(refusal(await api.inbox({ id: gone }, owner))?.code, 'OUT_OF_BOUNDS');
  sql.close();
});

test('digest AND id EACH STAND ALONE: either with an argument of the paged read beside it is refused with the fix', async () => {
  const { api, sql, ids } = await record();
  const id = ids.untriaged![0]!;
  const digests: Record<string, unknown>[] = [
    { digest: true, state: 'skipped' },
    { digest: true, cursor: 40 },
    { digest: true, id },
    { digest: true, limit: 10 },
    { digest: true, repeats: true },
  ];
  for (const args of digests) {
    const beside = Object.keys(args).find((k) => k !== 'digest')!;
    const no = refusal(await api.inbox(args as never, granted()));
    assert.equal(no?.code, 'VALUE_MALFORMED', `digest with ${beside} was answered: ${JSON.stringify(no)}`);
    assert.equal(no?.at, beside);
    assert.match(no?.fix ?? '', new RegExp(`Leave out ${beside}`, 'u'), `the refusal of ${beside} does not say the fix`);
  }
  for (const args of [{ id, state: 'untriaged' }, { id, cursor: 3 }, { id, limit: 1 }, { id, repeats: true }] as Record<string, unknown>[]) {
    const beside = Object.keys(args).find((k) => k !== 'id')!;
    const no = refusal(await api.inbox(args as never, granted()));
    assert.equal(no?.code, 'VALUE_MALFORMED', `id with ${beside} was answered`);
    assert.equal(no?.at, beside);
    assert.match(no?.fix ?? '', new RegExp(`Leave out ${beside}`, 'u'));
  }
  for (const digest of ['true', 1, 'yes', null]) {
    const no = refusal(await api.inbox({ digest } as never, granted()));
    assert.equal(no?.at, 'digest', `digest: ${JSON.stringify(digest)} was read`);
  }
  /* `digest: false` IS THE PAGED READ, as leaving it out is. */
  const paged = await api.inbox({ digest: false, state: 'review', limit: 3 } as never, granted());
  assert.ok(paged.ok);
  assert.equal((paged.value as unknown as InboxPage).arrivals.length, 3);
  sql.close();
});

test('A TOKEN WITHOUT THE REACH IS TOLD HOW ITS OWNER GIVES IT ONE, and never that no token reaches the inbox', async () => {
  const { api, sql, ids } = await record();
  const cases: [string, CallContext][] = [
    ["the owner's token for the whole record", bare],
    ["the owner's read token", { principal: { kind: 'token', id: 't_r', scope: 'read', person: 'p_1', level: 'owner' } }],
    ['a token with an empty reach', { principal: { kind: 'token', id: 't_e', scope: 'write', person: 'p_1', level: 'owner', reach: [] } }],
    ["a writer's token", { principal: { kind: 'token', id: 't_w', scope: 'write', person: 'p_2', level: 'write' } }],
  ];
  for (const [who, ctx] of cases) {
    for (const args of [undefined, { state: 'all' }, { digest: true }, { id: ids.untriaged![0]! }, { digest: true, state: 'all' }]) {
      const no = refusal(await api.inbox(args as never, ctx));
      assert.equal(no?.code, 'FORBIDDEN', `${who} was answered ${JSON.stringify(no)}`);
      assert.equal(no?.fix, NO_REACH, `${who} asking ${JSON.stringify(args)}`);
      assert.doesNotMatch(no?.fix ?? '', /no token/u);
    }
  }
  /* A PERSON WHO IS NOT AN OWNER IS TOLD WHAT THEY WERE, since no token of theirs would help. */
  const writer = refusal(await api.inbox({ digest: true }, { principal: { kind: 'person', id: 'p_2', level: 'write' } }));
  assert.equal(writer?.code, 'FORBIDDEN');
  assert.notEqual(writer?.fix, NO_REACH);
  assert.doesNotMatch(writer?.fix ?? '', /no token/u);
  sql.close();
});

test('A TOKEN HELD TO ONE LIST IS REFUSED AS BEFORE, the digest and one arrival as a page', async () => {
  const { api, sql, ids } = await record();
  const held: CallContext = { ...granted(), registers: ['obligations'] };
  for (const args of [undefined, { digest: true }, { id: ids.untriaged![0]! }]) {
    const no = refusal(await api.inbox(args as never, held));
    assert.equal(no?.code, 'FORBIDDEN');
    assert.equal(no?.fix, 'The inbox belongs to all of this BrainDog, and this caller is held to part of it.');
  }
  sql.close();
});

/* THE QUESTIONS ABOUT ARRIVALS. A rule on an arrival that wrote no row fills its question from the arrival's own words,
   so the question is held as the inbox is (`ask-person-reach.test.ts`). It was held to an owner signed in, and the agent
   given the reach to settle the arrival could not read what was asked about it. It reads it now, and reading is all:
   an answer is a decision, and no token decides. */
test('A TOKEN WITH THE REACH READS THE OPEN QUESTIONS ABOUT ARRIVALS, and still cannot answer one', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const ARRIVED = {
    id: 'rule.arrived',
    kind: 'rule' as const,
    body: {
      rule: 'arrived',
      on: { arrival: { channel: 'webhook' } },
      steps: [{ ask_person: { question: 'Arrived: {{trigger.body}}', options: ['pay', 'hold'], as: 'answer', wait: '1d' } }],
    } as never,
  };
  assert.ok((await api.kernel.install([OBLIGATIONS, ARRIVED])).ok);
  const got = api.kernel.arrive({ channel: 'webhook', body: 'Payroll: Omar 91000', sha256: 'x1', verified: true } as never);
  assert.ok(got.ok, JSON.stringify(got));
  await api.kernel.drain();
  const asked = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE opened_by = 'rule:arrived' AND status = 'open'");
  assert.ok(asked, 'the rule asked nothing');
  const reads = async (ctx: CallContext) => ({
    governance: JSON.stringify(await api.governance({ status: 'open' }, ctx)).includes('Payroll: Omar 91000'),
    whatsNew: JSON.stringify(await api.whatsNew({}, ctx)).includes('Omar'),
  });

  for (const scope of ['read', 'propose', 'write'] as const)
    assert.deepEqual(await reads(granted(scope)), { governance: true, whatsNew: true }, `a ${scope} token with the reach could not read the question`);
  assert.deepEqual(await reads(owner), { governance: true, whatsNew: true }, 'the owner lost her own question');

  /* AND NOBODY ELSE DOES: the same token without the reach, one with it held to a list, and one whose person is no
     owner today are each refused the inbox and are not shown its words here. */
  const others: [string, CallContext][] = [
    ['a whole-record token without the reach', bare],
    ['a token with the reach held to one list', { ...granted(), registers: ['obligations'] }],
    ['a token with the reach whose person is a writer now', { principal: { kind: 'token', id: 't_inbox', scope: 'read', person: 'p_2', level: 'write', reach: ['inbox'] } }],
    ['a member who decides', { principal: { kind: 'person', id: 'p_m', level: 'decide' }, levels: { obligations: 'append' } }],
  ];
  for (const [who, ctx] of others) {
    assert.equal(refusal(await api.inbox({ digest: true }, ctx))?.code, 'FORBIDDEN', `${who} read the inbox`);
    assert.deepEqual(await reads(ctx), { governance: false, whatsNew: false }, `${who} read a question about an arrival`);
  }

  /* READING IS NOT ANSWERING. */
  for (const scope of ['read', 'propose', 'write'] as const) {
    const no = refusal(await api.decide({ id: asked.id, resolved_as: 'accepted', answer: 'pay', reason: 'It is the salary.' } as never, granted(scope)));
    assert.equal(no?.code, 'FORBIDDEN', `a ${scope} token with the reach answered a question: ${JSON.stringify(no)}`);
  }
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', asked.id)?.status, 'open');
  sql.close();
});

/** Where the ladder keeps a mark made before a token's run opened (`ladder.ts`). */
const marked = (sql: ReturnType<typeof openSqlite>, token: string): string | null => {
  const row = sql.one<{ value: string }>("SELECT value FROM pref WHERE person_id = 'ladder:untrusted' AND key = ?", `token:${token}`);
  return row ? ((JSON.parse(row.value) as { from?: string }).from ?? null) : null;
};

test('WHAT ARRIVED IS TEXT ANYBODY COULD HAVE WRITTEN: a digest and one arrival mark their reader untrusted, as a page does', async () => {
  for (const [how, args] of [['a page', undefined], ['a digest', { digest: true }], ['one arrival', 'one']] as const) {
    const { api, sql, ids } = await record();
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_inbox', 'p_1', 'h', 'read', 'Triage', '2026-10-01T00:00:00.000Z')");
    assert.equal(marked(sql, 't_inbox'), null);
    /* A REFUSED READ SHOWED NOTHING, so it marks nobody. */
    assert.equal((await api.inbox({ id: 'in_nothing' }, granted())).ok, false);
    assert.equal(marked(sql, 't_inbox'), null, 'a read that was refused marked its reader');
    const out = await api.inbox((args === 'one' ? { id: ids.review![0]! } : args) as never, granted());
    assert.ok(out.ok, JSON.stringify(refusal(out)));
    assert.equal(marked(sql, 't_inbox'), 'the inbox', `${how} did not mark its reader`);
    sql.close();
  }
  /* AN EMPTY DIGEST SHOWED NO TEXT FROM OUTSIDE, as an empty page shows none. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_inbox', 'p_1', 'h', 'read', 'Triage', '2026-10-01T00:00:00.000Z')");
  const empty = await api.inbox({ digest: true }, granted());
  assert.ok(empty.ok);
  assert.deepEqual(empty.value.counts, { untriaged: 0, review: 0, skipped: 0, matched: 0, proposed: 0, ignored: 0 });
  assert.equal(marked(sql, 't_inbox'), null);
  sql.close();
});
