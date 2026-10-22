/**
 * What batch 87 added, through the client: the read `learnings` (AGT-C14), what the record's agents learned and still
 * stands, in the order a session should read it.
 *
 * NOT A STAND-IN FETCH AND NOT A STAND-IN GUARD, as `reads-stale.test.ts` is not: `serveApi` over a real record, so what
 * the client sends is what the host decodes, the caller is held by the record's own guards, and the rows are the ones
 * the record's own `create` wrote into the list the agents add-on declares.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '@braindog/host';

import { createClient, type Learnings } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import type { Learnings as RecordLearnings } from '../../record/src/methods/learnings.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

/** The client's `Learnings` is the record's own, held at compile time, both ways. */
const _same: Learnings = null as unknown as RecordLearnings;
const _back: RecordLearnings = null as unknown as Learnings;
void _same;
void _back;

const DAY = 86_400_000;
/** Two hundred days after the seed was written, so nothing written below has faded and the seed's own have. */
const NOW = SEEDED + 200 * DAY;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to the tasks and nothing else. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['tasks'] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function wired() {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  /* THE LIST IS FOUND AS THE READ FINDS IT, by the day its rows are confirmed on, so no name is typed here. */
  const list = [...api.kernel.registers()].find(([, d]) => (d.fields as { id: string; type?: string }[]).some((f) => f.id === 'confirmed_on' && f.type === 'day'))?.[0];
  if (!list) assert.fail('the agents add-on declares no list whose rows fade');
  const handlers = handlersFor(api);
  const sent: string[] = [];
  const clientFor = (ctx: CallContext) =>
    createClient({
      base: 'https://x',
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const req = new Request(new URL(String(input)), init);
        sent.push(`${req.method} ${new URL(req.url).pathname}`);
        return serveApi(req, handlers, ctx);
      }) as typeof globalThis.fetch,
    });
  /** One learning written at an instant by the record's own `create`, applying everywhere. */
  const learn = async (at: number, lesson: string, kind: 'method' | 'fact'): Promise<void> => {
    clock.set(at);
    value(await api.create({ register: list, fields: { lesson, because: `It went wrong once, and this is the note of how: ${lesson}`, kind } }, owner));
    clock.set(NOW);
  };
  clock.set(NOW);
  return { sql, api, clock, sent, learn, mine: clientFor(owner), theirs: clientFor(shut) };
}

test('`learnings` IS ONE READ+ ROUTE THAT WRITES NOTHING, sent as a GET, and the client is handed the read\'s own answer', async () => {
  assert.deepEqual(ROUTES.filter((r) => r.name === 'learnings').map((r) => [r.group, r.writes]), [['READ+', false]]);
  const { sql, api, sent, learn, mine } = await wired();
  await learn(NOW - 9 * DAY, 'Money here is whole minor units.', 'fact');
  await learn(NOW - 8 * DAY, 'Attach what a proposal read.', 'method');
  await learn(NOW - 2 * DAY, 'Run the import twice to prove it holds.', 'method');

  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  const told = value<Learnings>(await mine.learnings());
  assert.deepEqual(sent, ['GET /api/learnings']);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before, 'a read wrote to the log');

  /* WHAT THE WIRE CARRIED IS WHAT THE RECORD ANSWERS, field for field. */
  assert.deepEqual(told, value<RecordLearnings>(await api.learnings({}, owner)));
  /* A METHOD BEFORE A FACT, AND THE NEWEST FIRST: the seed's own are two hundred days old and have faded. */
  assert.deepEqual(told.rows.map((row) => row.lesson), ['Run the import twice to prove it holds.', 'Attach what a proposal read.', 'Money here is whole minor units.']);
  assert.deepEqual(told.rows.map((row) => row.kind), ['method', 'method', 'fact']);
  assert.equal(told.truncated, false);
  assert.ok(told.faded >= 0);
  for (const row of told.rows) {
    assert.match(row.spoken, /^[A-Z]+\d+$/u);
    assert.equal(row.where, 'everywhere');
    assert.match(row.made, /^\d{4}-\d{2}-\d{2}$/u);
  }
  /* NAMES AND NO ID: nothing the record keeps a thing under leaves it. */
  assert.doesNotMatch(JSON.stringify(told), /[0-9A-HJKMNP-TV-Z]{26}/u);
  sql.close();
});

test('`learnings({ limit: 5 })` ANSWERS FIVE AND SAYS THERE WERE MORE, and a limit that is no count is refused at `limit`', async () => {
  const { sql, sent, learn, mine } = await wired();
  for (let i = 1; i <= 7; i += 1) await learn(NOW - i * DAY, `Lesson ${String(i)} of seven.`, 'method');

  const five = value<Learnings>(await mine.learnings({ limit: 5 }));
  assert.equal(five.rows.length, 5);
  assert.equal(five.truncated, true);
  assert.deepEqual(five.rows.map((row) => row.lesson), [1, 2, 3, 4, 5].map((i) => `Lesson ${String(i)} of seven.`));
  assert.deepEqual(sent, ['GET /api/learnings']);

  const all = value<Learnings>(await mine.learnings());
  assert.equal(all.rows.length, 7);
  assert.equal(all.truncated, false);

  const no = (await mine.learnings({ limit: 0 })) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(no.ok, false);
  assert.equal(no.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(no.refusal?.at, 'limit');
  sql.close();
});

test('A KEY HELD TO ONE OTHER LIST IS REFUSED, in a sentence that names the fix, and is handed no learning', async () => {
  const { sql, learn, theirs } = await wired();
  await learn(NOW - DAY, 'Attach what a proposal read.', 'method');
  const no = (await theirs.learnings()) as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
  assert.equal(no.ok, false);
  assert.equal(no.value, undefined);
  assert.ok(no.refusal?.code);
  assert.ok((no.refusal?.fix ?? '').length > 0);
  assert.doesNotMatch(JSON.stringify(no), /Attach what a proposal read/u);
  sql.close();
});
