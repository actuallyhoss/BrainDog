/**
 * `about` (`src/methods/about.ts`): what waits on the owner about a thing is a place it was seen. An open question whose
 * words name a project, by the whole-name rule a note's words are read by, is said "Waiting on you: <the question>" at
 * the time it was opened, for a caller who reads every list, and for nobody else.
 *
 * Through the real record: projects and notes are added, questions are opened and one is closed, and the read answers
 * each project's places in names, with nothing written to find them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const [LANTERN, COPPER] = [PROJECTS[0], PROJECTS[1]];

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  /* A LIST IS A PROJECTS LIST BY ITS SCOPES, as the kernel's about read finds one. */
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    search: ['name'],
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'subject',
    search: ['subject', 'body'],
    fields: [
      { id: 'subject', type: 'text', required: true },
      { id: 'body', type: 'text' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** A member who reads every list. */
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** A member whose grant reaches the projects and not the notes. */
const projectsOnly: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'read' }, registers: ['things'] };

type Seen = { at: string; where: string };
type Answer = { is: { name: string; seen: Seen[] } | null; candidates: unknown[] };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const ID = /[0-9A-HJKMNP-TV-Z]{26}/u;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const about = (api: Api, args: unknown, ctx: CallContext): Promise<Result<Answer>> =>
  (api as unknown as { about: (a: unknown, c: CallContext) => Promise<Result<Answer>> }).about(args, ctx);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, NOTES] as never));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  /* A QUESTION PUT TO THE OWNER, as an agent asks one: add a note, yes or no. */
  const ask = (question: string, subject: string) =>
    value<{ id: string }>(api.kernel.propose({ question, body_kind: 'rowset', body: { register: 'notes', rows: [{ subject }] } } as never, 'p_1')).id;
  return { api, sql, add, ask };
}

const places = (out: Answer): string[] => (out.is?.seen ?? []).map((s) => s.where);

test('AN OPEN QUESTION THAT NAMES THE PROJECT IS A PLACE IT WAS SEEN, said "Waiting on you"', async () => {
  const { api, sql, add, ask } = await record();
  const copper = add('things', { name: COPPER });
  add('things', { name: LANTERN });
  add('notes', { subject: 'Hosting', body: `${COPPER} moves hosts in the spring.` });
  ask(`Renew ${COPPER}'s domain for another year?`, 'Renew the domain');
  ask(`Write the ${LANTERN} launch note?`, 'Launch note');
  const out = value<Answer>(await about(api, { row: { register: 'things', seq: copper.seq } }, owner));
  assert.deepEqual(places(out).sort(), [`Notes: Hosting`, `Waiting on you: Renew ${COPPER}'s domain for another year?`]);
  const waiting = out.is!.seen.find((s) => s.where.startsWith('Waiting on you: '))!;
  assert.match(waiting.at, /^2026-10-14/u, 'the place is not dated when the question was opened');
  /* IN NAMES: no id, no handle, and not who opened it. */
  assert.doesNotMatch(JSON.stringify(out), ID);
  assert.doesNotMatch(JSON.stringify(out), /p_1/u);
  /* The same read by its name. */
  assert.deepEqual(places(value<Answer>(await about(api, { name: COPPER }, owner))).sort(), places(out).sort());
  sql.close();
});

test('A QUESTION THAT ONLY SHARES A WORD\'S START IS NOT A PLACE, and neither is a closed one', async () => {
  const { api, sql, add, ask } = await record();
  const copper = add('things', { name: COPPER });
  ask(`Order more ${COPPER}s for the shop?`, 'Order more');
  const closed = ask(`Move ${COPPER} to the new host?`, 'Move host');
  const open = value<Answer>(await about(api, { row: { register: 'things', seq: copper.seq } }, owner));
  assert.deepEqual(places(open), [`Waiting on you: Move ${COPPER} to the new host?`], 'only the whole name is a place while it is open');
  value(api.kernel.decide(closed, { resolved_as: 'wont-fix', reason: 'not now' } as never, 'p_1'));
  const out = value<Answer>(await about(api, { row: { register: 'things', seq: copper.seq } }, owner));
  assert.deepEqual(places(out), []);
  sql.close();
});

test('A MEMBER WHO DOES NOT READ EVERY LIST IS NOT ANSWERED IT; one who does is', async () => {
  const { api, sql, add, ask } = await record();
  const copper = add('things', { name: COPPER });
  ask(`Renew ${COPPER}'s domain for another year?`, 'Renew the domain');
  const row = { row: { register: 'things', seq: copper.seq } };
  assert.deepEqual(places(value<Answer>(await about(api, row, projectsOnly))), []);
  assert.deepEqual(places(value<Answer>(await about(api, row, reader))), [`Waiting on you: Renew ${COPPER}'s domain for another year?`]);
  sql.close();
});

test('A PROJECT WHOSE NAME TWO ROWS SHARE GETS NO QUESTION PLACE', async () => {
  const { api, sql, add, ask } = await record();
  const a = add('things', { name: LANTERN });
  add('things', { name: LANTERN });
  ask(`Renew ${LANTERN}'s domain for another year?`, 'Renew the domain');
  const out = value<Answer>(await about(api, { row: { register: 'things', seq: a.seq } }, owner));
  assert.equal(out.is?.name, LANTERN);
  assert.deepEqual(places(out), [], 'a question naming two rows was given to one of them');
  sql.close();
});

test('A READ: nothing is written or asked', async () => {
  const { api, sql, add, ask } = await record();
  const copper = add('things', { name: COPPER });
  ask(`Renew ${COPPER}'s domain for another year?`, 'Renew the domain');
  const count = () => ['event', 'suggestion', 'entity_mention', 'observation', 'entry'].map((t) => sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${t}`)!.n);
  const before = count();
  value<Answer>(await about(api, { row: { register: 'things', seq: copper.seq } }, owner));
  value<Answer>(await about(api, { name: COPPER }, reader));
  assert.deepEqual(count(), before);
  sql.close();
});
