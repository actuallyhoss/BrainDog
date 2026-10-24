/**
 * The month's cap, against asks that arrive together.
 *
 * WHY THIS FILE EXISTS. `read-meter.test.ts` sends its asks one after another, so each one's `call` row is written before
 * the next one checks the meter. A browser with two tabs, a script, or a Durable Object that lets a second request in while
 * the first awaits its `fetch` does not wait like that. A probe drove this package's own double with a model that answers after 20 ms, as a network model does, and sent ten
 * `read`s at `ask_cap: 2` through `Promise.all`: ten were answered, ten model calls were made, and `status()` read 10 of 2.
 * The check counted rows that are written after the model answers, so every ask in flight passed it against the same count.
 *
 * THE MODEL IS SLOW ON PURPOSE. `canned()` resolves at once, and an answer that arrives in the same microtask run as the
 * ask hides the window the fault lives in. The delay is what a real provider adds, and it is the whole of the repro.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { createSlash, type Inference } from '../src/index.ts';
import { PROMPTS } from '../src/prompts.ts';
import { canned, fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const PROPOSAL = JSON.stringify({
  text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
  body_kind: 'query',
  body: {},
  flagged: false,
});

const build = (record = fakeRecord()) => {
  const sql = openSqlite();
  const inference = canned();
  /* 20 ms, the probe's figure. The canned adapter still records every call, so `seen` is the count of model calls made. */
  const slow: Inference = {
    complete: async (call) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return inference.complete(call);
    },
  };
  const slash = createSlash({ sql, clock: fixedClock(NOW), inference: slow, record });
  const rows = () =>
    sql
      .all<{ kind: string; status: string; code: string | null }>('SELECT kind, status, code FROM slash_call ORDER BY rowid')
      .map((r) => ({ ...r }));
  return { sql, inference, slash, rows };
};

test('TEN READS SENT TOGETHER AT A CAP OF 2 make two model calls, and the other eight are SLASH_BUDGET_SPENT', async () => {
  const { sql, inference, slash, rows } = build();
  try {
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);
    for (let i = 0; i < 10; i++) inference.say(PREDICATE);

    const out = await Promise.all(Array.from({ length: 10 }, () => slash.read('what is still open', OWNER)));

    assert.equal(out.filter((o) => o.ok).length, 2, JSON.stringify(out.map(codeOf)));
    assert.equal(out.filter((o) => codeOf(o) === 'SLASH_BUDGET_SPENT').length, 8);
    assert.equal(inference.seen.length, 2, 'an ask past the cap still called the model');
    assert.equal(slash.status().asks.used, 2);
    /* SETTLED, NOT LEFT HELD. The two admitted asks end as ordinary `read · ok` rows, the same as a read sent alone. */
    assert.deepEqual(
      rows().filter((r) => r.status !== 'refused'),
      [
        { kind: 'read', status: 'ok', code: null },
        { kind: 'read', status: 'ok', code: null },
      ],
    );
    /* AND THE EIGHT TURNED AWAY ARE ROWS OF THEIR OWN (model-sign-49), never asks. */
    assert.equal(rows().filter((r) => r.status === 'refused' && r.code === 'SLASH_BUDGET_SPENT').length, 8);
  } finally {
    sql.close();
  }
});

test('ten pass 2s on one ask_id, sent together, make one model call and the other nine are refused, not billed', async () => {
  const { sql, inference, slash } = build();
  try {
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);
    inference.say(PREDICATE);
    const first = await slash.read('what is still open', OWNER);
    assert.ok(first.ok);
    inference.say(PROPOSAL);

    /* ONE REPLY, NOT TEN: only the first of the ten reserves `<ask_id>:propose` before the rest run their own
       synchronous prefix (no `await` sits between `propose`'s entry and that reserve), so the other nine find it
       there and are refused before any model is asked (`propose.ts`'s own check, off `call.ts`'s `reserve` id). */
    const out = await Promise.all(
      Array.from({ length: 10 }, () => slash.propose('what is still open', OWNER, undefined, first.value.ask_id)),
    );

    assert.equal(out.filter((o) => o.ok).length, 1, JSON.stringify(out.map(codeOf)));
    assert.equal(out.filter((o) => codeOf(o) === 'ALREADY_KNOWN').length, 9);
    assert.equal(inference.seen.length, 2);
    /* ONE QUESTION IS ONE ASK: the `read` above is the one this counts, and the admitted `propose` is its pass 2. */
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('TEN PROPOSES WITH NO ASK_ID SENT TOGETHER AT A CAP OF 2 make the two calls each of two of them makes', async () => {
  const sql = openSqlite();
  try {
    /* A REPLY BY SHAPE, NOT BY QUEUE ORDER. Two admitted proposes now run concurrently (only the drafting `read`
       counts against the cap, `asksUsed`), and their four model calls interleave across two `await`s each, so a
       FIFO queue answered call 1's proposal with call 2's draft as often as its own. `maxTokens` tells the two
       templates apart (`prompts.ts`'s `predicate` and `propose` ceilings) without caring which call reaches
       which first. */
    const seen: { maxTokens: number }[] = [];
    const inference: Inference = {
      complete: async (call) => {
        seen.push({ maxTokens: call.maxTokens });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { text: call.maxTokens === PROMPTS.predicate.maxTokens ? PREDICATE : PROPOSAL, usage: { in: 100, out: 20 } };
      },
    };
    const slash = createSlash({ sql, clock: fixedClock(NOW), inference, record: fakeRecord() });
    const rows = () =>
      sql
        .all<{ kind: string; status: string; code: string | null }>('SELECT kind, status, code FROM slash_call ORDER BY rowid')
        .map((r) => ({ ...r }));
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);

    const out = await Promise.all(Array.from({ length: 10 }, () => slash.propose('what is still open', OWNER)));

    assert.equal(out.filter((o) => o.ok).length, 2, JSON.stringify(out.map(codeOf)));
    assert.equal(out.filter((o) => codeOf(o) === 'SLASH_BUDGET_SPENT').length, 8, JSON.stringify(out.map(codeOf)));
    assert.equal(seen.length, 4, 'two admitted proposes each drafted once and proposed once');
    assert.equal(slash.status().asks.used, 2);
    const settled = rows();
    assert.equal(settled.filter((r) => r.kind === 'read' && r.status === 'ok').length, 2);
    assert.equal(settled.filter((r) => r.kind === 'propose' && r.status === 'ok').length, 2);
    /* AND THE EIGHT TURNED AWAY, EACH ITS OWN ROW UNDER `-` (model-sign-49). */
    assert.equal(settled.filter((r) => r.status === 'refused' && r.code === 'SLASH_BUDGET_SPENT').length, 8);
    assert.equal(settled.length, 12);
  } finally {
    sql.close();
  }
});

test('an ask that called no model gives its place back: the record refused the rows, and the next ask is answered', async () => {
  const record = fakeRecord();
  const project = record.project.bind(record);
  let refuseNext = false;
  /* THE ROWS ARE REFUSED ONCE, on pass 2, which is the one pass-2 path that reaches no model: the stored draft is
     re-projected, the record says no, and nothing was called. */
  record.project = (args, ctx) => {
    if (args.registers.length > 0 && refuseNext) {
      refuseNext = false;
      return Promise.resolve({ ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'Not yours.' } });
    }
    return project(args, ctx);
  };
  const { sql, inference, slash } = build(record);
  try {
    assert.ok(slash.configure({ ask_cap: 2 }, OWNER).ok);
    inference.say(PREDICATE);
    const first = await slash.read('what is still open', OWNER);
    assert.ok(first.ok);
    refuseNext = true;

    const refused = await slash.propose('what is still open', OWNER, undefined, first.value.ask_id);
    assert.equal(codeOf(refused), 'FORBIDDEN');
    assert.equal(slash.status().asks.used, 1, 'a pass 2 that called no model was billed');

    inference.say(PROPOSAL);
    const again = await slash.propose('what is still open', OWNER, undefined, first.value.ask_id);
    assert.equal(again.ok, true, JSON.stringify(again));
    /* STILL 1: the `read` above is the only row that ever counted, and a successful `propose` does not add a second
       (`asksUsed` no longer reads `kind = 'propose'`). */
    assert.equal(slash.status().asks.used, 1);
  } finally {
    sql.close();
  }
});

test('a provider that did not answer keeps its row and is not counted as one of his asks, and leaves no held row behind', async () => {
  const { sql, inference, slash, rows } = build();
  try {
    inference.say(new Error('502 from the gateway'));
    const out = await slash.read('what is open', OWNER);
    assert.equal(out.ok, true);
    /* HIS RULE: an ask the model never answered is not one of his. The row is kept, with what it cost, and spends none. */
    assert.equal(slash.status().asks.used, 0);
    assert.deepEqual(rows(), [{ kind: 'read', status: 'error', code: 'UNREACHABLE' }]);
  } finally {
    sql.close();
  }
});
