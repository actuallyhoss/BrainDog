/**
 * Agent notes: two short notes a day, at 08:00 and 17:00 in the record's own time zone, of what agents ask the person,
 * what their runs did, by agent, and the steps runs left earlier that nobody took. In the app, and a push with no
 * content to a phone its owner already turned on; never by mail.
 *
 * AN ADD-ON A PERSON INSTALLS, NOT A PART OF AGENTS. An Agents update lands on a record quietly when nothing is lost, so
 * digests declared there would start writing notes on every record that holds Agents without anybody pressing.
 *
 * EVERY SECTION IS LEFT OUT WHEN IT HAS NOTHING, so a day with nothing to say sends nothing. The three sections read the
 * record's computed sources (`governance.open`, `activity`, `handoffs.open`), which a digest reads once the kernel's
 * digest sources are in the tree. Until then the tests that need them say why they wait.
 *
 * This file drives the record's own schedule on a fixed clock, as `packs/standup` does. Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { agentsPackDocument, firstPartyDocument } from '../../packages/seed/src/index.ts';
import { carryingOf, render } from '../../packages/kernel/src/digest.ts';

/* WEDNESDAY 14 OCTOBER 2026 AT SEVEN IN THE MORNING IN LONDON, an hour ahead of UTC in October: the morning note is
   armed for 08:00 there today and the evening one for 17:00. */
const NOW = Date.UTC(2026, 9, 14, 6);
const MORNING = '2026-10-14T07:00:00.000Z';
const EVENING = '2026-10-14T16:00:00.000Z';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/* WHETHER A DIGEST CAN READ A COMPUTED SOURCE YET. `DIGEST_SOURCES` comes with the kernel's digest sources; the record
   hands a digest its blocks once the kernel exports it. */
const kernel = (await import('../../packages/kernel/src/index.ts')) as Record<string, unknown>;
const JOINED = 'DIGEST_SOURCES' in kernel;
const SOURCES_BUILT = JOINED || existsSync(new URL('../../packages/kernel/src/digest-sources.ts', import.meta.url));
const NOT_BUILT = 'a digest reads only metric. and register. sources until packages/kernel/src/digest-sources.ts is in the tree';
const NOT_JOINED = 'the record hands a digest no blocks until @braindog/kernel exports DIGEST_SOURCES';

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
type Section = { heading: string; source: string; where?: unknown; within?: string; omit_when_empty?: boolean };
type Decl = { digest: string; name: string; schedule: Record<string, unknown>; channels: string[]; sections: Section[]; prose?: unknown };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./agent-notes.pack.json', import.meta.url);
const file = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A record kept in London, with Agents and what it links to, and this add-on when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql; clock: Clock }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, delivers: ['notify.email', 'notify.push', 'notify.webhook'] });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE',
      slug: 'kiln',
      name: 'Kiln',
      tz: 'Europe/London',
      locale: 'en',
      owner: { id: 'p_1', email: 'mira@example.test', name: 'Mira' },
    }),
  );
  for (const id of ['portfolio', 'people']) await put(api, firstPartyDocument(id, { seeds: [] }));
  await put(api, agentsPackDocument());
  if (withPack) await put(api, file());
  return { api, sql, clock };
}

/** When the record armed a digest, or `undefined` when it armed none. */
const armed = (sql: NodeSql, key: string): string | undefined =>
  sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'digest' AND key = ?", key)?.due_at;

/** Move the clock just past the hour a digest was armed for, and let the record run what came due. */
async function fire(api: Api, sql: NodeSql, clock: Clock, key: string): Promise<void> {
  const at = armed(sql, key);
  assert.ok(at, `${key} is armed`);
  clock.set(Date.parse(at!) + 1000);
  await api.kernel.drain();
}

/** What a digest wrote in the app: its `note` events, by the digest's own actor. */
const notes = (sql: NodeSql, key: string): string[] =>
  sql.all<{ note: string }>('SELECT note FROM event WHERE actor = ? ORDER BY id', `digest:${key}`).map((r) => r.note);

const outbox = (sql: NodeSql): { kind: string; payload: string }[] => sql.all<{ kind: string; payload: string }>('SELECT kind, payload FROM outbox ORDER BY created, id');

const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is ready' }, { id: 'no', label: 'No', because: 'It is not' }] };

test('THE FILE IS agent-notes 1.0.0, on Agents, two digests at 08:00 and 17:00 with no mail, no zone and no prose', () => {
  const doc = file() as { pack: string; version: string; requires: { packs: unknown }; declarations: Decl[] };
  assert.deepEqual([doc.pack, doc.version], ['agent-notes', '1.0.0']);
  assert.deepEqual(doc.requires.packs, { agents: '^1.0.0' });
  assert.deepEqual(
    doc.declarations.map((d) => [d.digest, d.schedule, d.channels, d.prose]),
    [
      ['agent-notes-morning', { at: '08:00' }, ['in-app', 'push'], undefined],
      ['agent-notes-evening', { at: '17:00' }, ['in-app', 'push'], undefined],
    ],
  );
  for (const d of doc.declarations) {
    assert.ok(!JSON.stringify(d).includes('email'), `${d.digest} names no mail`);
    assert.deepEqual(d.sections.map((s) => [s.heading, s.source]), [
      ['Needs you', 'governance.open'],
      ['Done by agents', 'activity'],
      ['Stuck', 'handoffs.open'],
    ]);
    assert.ok(d.sections.every((s) => s.omit_when_empty === true), `every section of ${d.digest} is left out when it has nothing`);
  }
  assert.deepEqual(doc.declarations.map((d) => d.sections[1]!.within), ['15h', '9h'], 'each note covers the hours since the one before');
});

test('BEFORE THE ADD-ON: Agents arms no note of its own', async () => {
  const { sql } = await record(false);
  assert.equal(armed(sql, 'agent-notes-morning'), undefined);
  assert.equal(armed(sql, 'agent-notes-evening'), undefined);
  sql.close();
});

test('INSTALLED THROUGH THE ADD-ON DOOR AS IT SHIPS, it arms the next 08:00 and 17:00 in the record\'s own zone', async () => {
  const { sql } = await record();
  assert.equal(armed(sql, 'agent-notes-morning'), MORNING);
  assert.equal(armed(sql, 'agent-notes-evening'), EVENING);
  sql.close();
});

test('A MORNING WITH NO AGENT SENDS NOTHING: no note in the app and nothing queued', { skip: SOURCES_BUILT ? false : NOT_BUILT }, async () => {
  const { api, sql, clock } = await record();
  const before = outbox(sql).length;
  await fire(api, sql, clock, 'agent-notes-morning');
  assert.deepEqual(notes(sql, 'agent-notes-morning'), []);
  assert.equal(outbox(sql).length, before, 'no push and no mail');
  assert.equal(armed(sql, 'agent-notes-morning'), '2026-10-15T07:00:00.000Z', 'and the next morning is armed');
  sql.close();
});

test('WITH A QUESTION A RUN ASKED AND THREE THINGS IT CHANGED, the morning note says both, short', { skip: JOINED ? false : NOT_JOINED }, async () => {
  const { api, sql, clock } = await record();
  const k = api.kernel as unknown as {
    create: (list: string, fields: unknown, ctx: unknown) => unknown;
    propose: (q: unknown, actor: string) => unknown;
  };
  clock.set(NOW - 2 * 3_600_000);
  said(k.create('session', { doing: 'Tidy the glaze notes', agent: 'claude', state: 'active' }, { actor: 'p_1' }));
  for (const name of ['Celadon glaze', 'Tenmoku glaze', 'Shino glaze']) said(k.create('things', { name, lane: 'building' }, { actor: 'S1' }));
  said(k.propose({ question: 'Retire the old kiln log?', body_kind: 'options', body: OPTIONS }, 'S1'));
  said(k.propose({ question: 'A rule asks about a bill', body_kind: 'options', body: OPTIONS }, 'rule:bills'));
  clock.set(NOW);

  await fire(api, sql, clock, 'agent-notes-morning');

  const written = notes(sql, 'agent-notes-morning');
  assert.equal(written.length, 1, 'one note in the app');
  assert.ok(!outbox(sql).some((r) => r.kind === 'notify.email'), 'never by mail');
  const today = said<{ digest: string; name: string; sections: Parameters<typeof render>[1] }[]>(await api.digestToday({ digest: 'agent-notes-morning' }, owner))[0]!;
  const text = render(today.name, carryingOf(today.sections));
  assert.match(text, /## Needs you/);
  assert.match(text, /## Done by agents/);
  assert.match(text, /Retire the old kiln log\?/);
  assert.doesNotMatch(text, /A rule asks about a bill/, 'a question a rule put is not an agent\'s');
  assert.ok(text.split(/\s+/u).filter(Boolean).length < 150, 'under 150 words');
  sql.close();
});
