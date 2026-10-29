/**
 * `stale`, the two lines AGT-C18 Build 4 still owed (`src/methods/stale.ts`): what was learned and nobody has
 * confirmed in sixty days, and the skills that are behind what was learned since. Each is one
 * line `{ kind, said, count, clear }`, and `clear` names the real handle, so an agent starting work can make the call
 * with no model in the room.
 *
 * Through the real record on a real kernel in memory, with the agents add-on installed as any add-on is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration, Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { STALE_NAMED_MOST, UNCONFIRMED_DAYS, staleCount, type Stale, type StaleLine } from '../src/methods/stale.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { declarations, installAgentsPack } from '../../seed/src/index.ts';

/** Wednesday 14 October 2026, nine in the morning, on a record that keeps UTC. */
const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;
const TODAY = '2026-10-14';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to the projects and nothing else: what was learned and the skills are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };
const agent: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-1', client: 'claude-code', host: 'mac', repo: 'studio-repo' },
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock> };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/** The project list the add-on asks for, as the seed declares it, and no sample row. */
const THINGS: Declaration = declarations().find((d) => d.id === 'register.things') ?? assert.fail('the seed has no things');

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 90 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS] as never));
  value(await installAgentsPack(api.kernel));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h_t_claude', 'write', 'Claude Code', '2026-09-01T00:00:00.000Z')");
  return { api, sql, clock };
}

const BECAUSE = 'The last release went out with the wrong file and had to be pulled.';
const learned = async (r: Made, lesson: string, more: Record<string, unknown> = {}): Promise<Entry> =>
  value<Entry>(await r.api.create({ register: 'learnings', fields: { lesson, because: BECAUSE, kind: 'method', ...more } }, owner));
const skill = async (r: Made, name: string, more: Record<string, unknown> = {}): Promise<Entry> =>
  value<Entry>(await r.api.create({ register: 'skills', fields: { name, trigger: `When it is time to ${name}`, body: `# ${name}\n\nDo it carefully.`, ...more } }, owner));

const stale = async (r: Made, ctx: CallContext): Promise<Stale> => value<Stale>(await r.api.stale({}, ctx));
const kinds = (s: Stale): string[] => s.lines.map((l) => l.kind);
const line = (s: Stale, kind: string): StaleLine => {
  const found = s.lines.find((l) => l.kind === kind);
  assert.ok(found, `no ${kind} line in ${JSON.stringify(s.lines)}`);
  return found;
};

test('WHAT WAS LEARNED 61 DAYS AGO AND NEVER CONFIRMED IS ONE LINE, in its own words, with the call that confirms it', async () => {
  const r = await record();
  r.clock.set(NOW - 61 * DAY);
  const old = await learned(r, 'Export the variable font last, after every static cut is proofed.');
  r.clock.set(NOW);
  const name = `LN${String(old.seq)}`;

  for (const who of [owner, agent]) {
    const got = await stale(r, who);
    assert.deepEqual(kinds(got), ['learnings'], JSON.stringify(got.lines));
    const l = line(got, 'learnings');
    assert.deepEqual(Object.keys(l).sort(), ['clear', 'count', 'kind', 'said']);
    assert.equal(l.count, 1);
    assert.match(l.said, /Export the variable font last/u, 'said in its own first words');
    assert.ok(!l.said.includes(name), 'said by its words, never by its handle');
    assert.match(l.said, /61 days/u);
    assert.equal(l.clear, `update ${name} with confirmed_on ${TODAY}`);
    assert.equal(got.count, 1);
    assert.ok(!JSON.stringify(got).includes(old.id), 'never the row id');
    assert.doesNotMatch(JSON.stringify(got), /—/u, 'a long dash');
  }

  /* Made exactly sixty days ago is not yet past sixty. */
  assert.equal(UNCONFIRMED_DAYS, 60);

  /* A caller the list is closed to is told nothing of it. */
  assert.deepEqual(await stale(r, shut), { lines: [], count: 0 });

  /* Confirmed yesterday: nothing is stale. */
  value(await r.api.update({ register: 'learnings', seq: old.seq, version: old.version, patch: { confirmed_on: '2026-10-13' } } as never, owner));
  assert.deepEqual(await stale(r, owner), { lines: [], count: 0 });
  r.sql.close();
});

test('ONE CONFIRMED LONG AGO IS STALE AGAIN, one made yesterday is not, and one no longer held true is left alone', async () => {
  const r = await record();
  r.clock.set(NOW - 80 * DAY);
  const first = await learned(r, 'Proof on paper before the web, every single time.', { confirmed_on: '2026-08-01' });
  const gone = await learned(r, 'Kern by eye and never by the table of pairs.');
  value(await r.api.update({ register: 'learnings', seq: gone.seq, version: gone.version, patch: { state: 'reverted', why: 'The table of pairs was redrawn and is right now.' } } as never, owner));
  r.clock.set(NOW - 70 * DAY);
  const second = await learned(r, 'Name the masters before drawing a single glyph.');
  r.clock.set(NOW - DAY);
  await learned(r, 'Ship the specimen page with the release, not after.');
  r.clock.set(NOW);

  const l = line(await stale(r, owner), 'learnings');
  assert.equal(l.count, 2);
  assert.match(l.said, /^2 /u);
  assert.match(l.said, /Proof on paper before the web/u, 'the one that has waited longest is the one said');
  assert.match(l.said, /74 days/u, 'aged from the day it was last confirmed');
  assert.match(l.clear, /^update with confirmed_on 2026-10-14, once for each of /u);
  assert.ok(l.clear.includes(`LN${String(first.seq)} and LN${String(second.seq)}`), l.clear);
  assert.ok(!l.clear.includes(`LN${String(gone.seq)}`), 'a lesson taken back is nobody\'s to confirm');
  r.sql.close();
});

test(`MORE THAN ${String(STALE_NAMED_MOST)} ARE COUNTED, and the sentence names ${String(STALE_NAMED_MOST)}`, async () => {
  const r = await record();
  r.clock.set(NOW - 65 * DAY);
  for (let i = 0; i < STALE_NAMED_MOST + 3; i++) await learned(r, `Lesson number ${String(i + 1)} about the release, kept long.`);
  r.clock.set(NOW);
  const l = line(await stale(r, owner), 'learnings');
  assert.equal(l.count, STALE_NAMED_MOST + 3);
  assert.equal((l.clear.match(/LN\d+/gu) ?? []).length, STALE_NAMED_MOST);
  assert.match(l.clear, /the other 3/u);
  r.sql.close();
});

test('A SKILL BEHIND TWO LEARNINGS IS ONE LINE, with the proposal that brings it up to them', async () => {
  const r = await record();
  r.clock.set(NOW - 2 * DAY);
  await skill(r, 'review');
  const deploy = await skill(r, 'deploy');
  const a = await learned(r, 'Run the smoke test against the preview first.', { topic: 'deploy' });
  const b = await learned(r, 'Purge the cache only after the new build answers.', { topic: 'Deploy ' });
  await learned(r, 'Nothing to do with any skill at all, only a note.', { topic: 'fonts' });
  r.clock.set(NOW);

  for (const who of [owner, agent]) {
    const got = await stale(r, who);
    assert.deepEqual(kinds(got), ['skills'], JSON.stringify(got.lines));
    const l = line(got, 'skills');
    assert.equal(l.said, 'The deploy skill does not take in 2 learnings yet');
    assert.equal(l.count, 1);
    assert.equal(l.clear, `propose a rowset on skills#${String(deploy.seq)} with body, rev 2 and because [LN${String(a.seq)}, LN${String(b.seq)}]`);
    assert.ok(!JSON.stringify(got).includes(deploy.id) && !JSON.stringify(got).includes(a.id), 'never a row id');
  }
  assert.deepEqual(await stale(r, shut), { lines: [], count: 0 }, 'a caller the skills are closed to is told nothing');

  /* The skill takes them in: it is behind nothing. */
  value(await r.api.update({ register: 'skills', seq: deploy.seq, version: deploy.version, patch: { because: [a.id, b.id] } } as never, owner));
  assert.deepEqual(await stale(r, owner), { lines: [], count: 0 });

  /* A third lesson after that: behind one, and the call says the two it holds are kept. */
  const c = await learned(r, 'Tag the release before the announcement goes out.', { topic: 'deploy' });
  const again = line(await stale(r, owner), 'skills');
  assert.equal(again.said, 'The deploy skill does not take in 1 learning yet');
  assert.equal(again.clear, `propose a rowset on skills#${String(deploy.seq)} with body, rev 2 and because [LN${String(c.seq)}], after the 2 it holds`);
  r.sql.close();
});

test('BOTH ARE IN THE ONE NUMBER, two skills are one line, and reading files no question', async () => {
  const r = await record();
  r.clock.set(NOW - 61 * DAY);
  const deploy = await skill(r, 'deploy');
  const review = await skill(r, 'review');
  const a = await learned(r, 'Run the smoke test against the preview first.', { topic: 'deploy' });
  const b = await learned(r, 'Read the diff from the bottom of the file up.', { topic: 'review' });
  r.clock.set(NOW);
  const count = (table: string): number => Number(r.sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);
  const before = [count('suggestion'), count('event'), count('entry')];

  const got = await stale(r, owner);
  assert.deepEqual(kinds(got), ['learnings', 'skills'], JSON.stringify(got.lines));
  assert.equal(line(got, 'learnings').count, 2);
  const s = line(got, 'skills');
  assert.equal(s.count, 2);
  assert.equal(s.said, '2 skills do not take in what was learned yet: deploy, 1 learning and review, 1 learning');
  assert.equal(
    s.clear,
    `propose a rowset on each: skills#${String(deploy.seq)} with body, rev 2 and because [LN${String(a.seq)}]; skills#${String(review.seq)} with body, rev 2 and because [LN${String(b.seq)}]`,
  );
  assert.equal(got.count, 4);
  assert.equal(staleCount(got.lines), 4);
  await stale(r, agent);

  assert.deepEqual([count('suggestion'), count('event'), count('entry')], before, 'nothing is written by asking');
  const open = r.api.kernel.openSuggestions();
  assert.deepEqual(open.ok ? open.value : null, [], 'and no question is filed');
  r.sql.close();
});

test('EVERY SKILL BEHIND IS COUNTED, not only the few a night drafts, and the first eight are named', async () => {
  const r = await record();
  r.clock.set(NOW - 10 * DAY);
  const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
  for (const name of names) {
    await skill(r, name);
    await learned(r, `A lesson that bears on ${name} and nothing else.`, { topic: name });
  }
  r.clock.set(NOW);
  const s = line(await stale(r, owner), 'skills');
  assert.equal(s.count, 10);
  assert.match(s.said, /^10 skills do not take in what was learned yet: alpha, 1 learning, .*hotel, 1 learning and 2 more$/u);
  assert.doesNotMatch(s.said, /india|juliet/u);
  assert.match(s.clear, /; then ask again for the other 2$/u);
  assert.equal(s.clear.split('; ').length, 9);
  r.sql.close();
});
