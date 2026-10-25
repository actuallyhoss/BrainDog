/**
 * Standup: one digest every morning at nine about the work, with what moved since yesterday, what is blocked, and what
 * agents finished. Each is a list section that is left out when it has no rows, so a morning with none of the three
 * sends nothing at all.
 *
 * A DIGEST IS A DECLARATION, NOT A SCRIPT. The pack names the list and says which rows in a sentence for each section,
 * and the record assembles and queues it on the hour. This file drives the record's own schedule on a fixed clock: the
 * install arms the digest, the clock moves to the hour it was armed for, and the record's drain runs it.
 *
 * Every task here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

/* MONDAY 28 SEPTEMBER 2026 AT SIX IN THE MORNING, in a record kept in UTC: the digest is armed for 09:00 today. */
const NOW = Date.UTC(2026, 8, 28, 6);
const DAY = 86_400_000;
const DUE = '2026-09-28T09:00:00.000Z';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[] };
type Clock = ReturnType<typeof fixedClock>;

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./standup.pack.json', import.meta.url);
const file = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A record with an owner who has an address, Work and what it links to, and this pack when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql; clock: Clock }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, delivers: ['notify.email', 'notify.push', 'notify.webhook'] });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'studio',
      name: 'Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' },
    }),
  );
  for (const id of ['portfolio', 'people', 'work']) await put(api, firstPartyDocument(id, { seeds: [] }));
  if (withPack) await put(api, file());
  return { api, sql, clock };
}

const task = (api: Api, fields: Record<string, unknown>): string => said<{ id: string }>(api.kernel.create('tasks', fields as never, { actor: 'p_1' })).id;

/** Ten days ago: a task nobody has touched since, and one an agent finished then. Neither is news this morning. */
function lastWeek(api: Api, clock: Clock): void {
  clock.set(NOW - 10 * DAY);
  task(api, { what: 'Paint the fence', state: 'open' });
  task(api, { what: 'Label the archive boxes', state: 'done', agent: 'Filing agent', done_on: '2026-09-18' });
  clock.set(NOW);
}

/** When the record armed the digest, or `undefined` when it armed none. */
const armed = (sql: NodeSql): string | undefined => sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'digest' AND key = 'standup'")?.due_at;

/** Move the clock to the hour the digest was armed for, and let the record run what came due. */
async function nine(api: Api, sql: NodeSql, clock: Clock): Promise<void> {
  const at = armed(sql);
  assert.equal(at, DUE, 'the digest is armed for nine on the morning the record is on');
  clock.set(Date.parse(at!) + 1000);
  await api.kernel.drain();
}

const mails = (sql: NodeSql): { to: string[]; subject: string; text: string }[] =>
  sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.email' ORDER BY created, id").map((r) => JSON.parse(r.payload) as never);

/** The email's body cut at each `## ` heading, so a row can be held to the section it is under. */
const sectionsOf = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split('\n## ')
      .slice(1)
      .map((chunk) => {
        const [heading = '', ...rest] = chunk.split('\n');
        return [heading, rest.join('\n')];
      }),
  );

test('BEFORE THE PACK: Work arms no morning digest of its own', async () => {
  const { sql } = await record(false);
  assert.equal(armed(sql), undefined);
  sql.close();
});

test('THE FILE IS standup 1.0.0, on Work, one daily digest with no prose', () => {
  const doc = file() as { pack: string; version: string; requires: { packs: unknown }; declarations: Record<string, unknown>[] };
  assert.deepEqual([doc.pack, doc.version], ['standup', '1.0.1']);
  assert.deepEqual(doc.requires.packs, { work: '^1.0.0' });
  assert.deepEqual(
    doc.declarations.map((d) => [d.digest, d.schedule, d.prose]),
    [['standup', { at: '09:00' }, undefined]],
  );
});

test('AT NINE IT SAYS WHAT MOVED, WHAT IS BLOCKED AND WHAT AGENTS FINISHED, each task under one heading', async () => {
  const { api, sql, clock } = await record();
  lastWeek(api, clock);
  task(api, { what: 'Draft the brochure', state: 'doing', by: '2026-10-02' });
  task(api, { what: 'Check the proofs', state: 'review' });
  task(api, { what: 'Fix the kiln door', state: 'blocked' });
  task(api, { what: 'Sort the receipts', state: 'done', agent: 'Filing agent', done_on: '2026-09-28' });

  await nine(api, sql, clock);

  const sent = mails(sql);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.to, ['ada@example.test']);
  assert.equal(sent[0]!.subject, 'Standup');
  const parts = sectionsOf(sent[0]!.text);
  assert.deepEqual(Object.keys(parts), ['What moved', 'What is blocked', 'What agents finished']);
  assert.match(parts['What moved']!, /Draft the brochure/);
  assert.match(parts['What moved']!, /Check the proofs/);
  assert.doesNotMatch(parts['What moved']!, /Sort the receipts|Fix the kiln door|Paint the fence/, 'a task in What moved is one a person moved');
  assert.match(parts['What is blocked']!, /Fix the kiln door/);
  assert.match(parts['What agents finished']!, /Sort the receipts/);
  assert.doesNotMatch(parts['What agents finished']!, /Label the archive boxes/, 'a task finished ten days ago is not news this morning');
  sql.close();
});

test('A MORNING WITH NOTHING TO SAY SENDS NOTHING, and the next one is armed for tomorrow', async () => {
  const { api, sql, clock } = await record();
  lastWeek(api, clock);

  await nine(api, sql, clock);

  assert.deepEqual(mails(sql), []);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor = 'digest:standup'")!.n, 0, 'no note in the app either');
  assert.equal(armed(sql), '2026-09-29T09:00:00.000Z');
  sql.close();
});
