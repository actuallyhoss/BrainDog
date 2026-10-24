/**
 * `boot` stays under 30 KB on a record shaped like his (scope 2026-10-24 A8, H17: "boot bytes under 30 KB decoded"),
 * every open and every move of the record. He holds 27 projects, 23 services, 22 skills, people and organisations with
 * a page each, about 900 runs, and a day of writes in what is new. Measured on this fixture before the cut: about 68
 * KB, 30 KB of it what is new and 27 KB the pages of people, organisations, skills and the projects past the rail's five.
 * His record is never touched: the fixture is built here, the same shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { bootFilled, type Boot as ClientBoot } from '../../client/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** The most `boot` may weigh, decoded, on this record. */
const BOOT_MOST = 30 * 1024;

const NOTE =
  'Moved the deploy to the night window after the overload; the record answers 503 with Retry-After now and the client retries twice with jitter. Next: watch the logs for a day, then close the card. ';

async function hisShape() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAZ', slug: 'his-shape', name: 'His shape', tz: 'Africa/Cairo', locale: 'en', owner: { id: 'p_1' } });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const make = async (register: string, fields: Record<string, unknown>): Promise<number> => {
    const made = (await api.create({ register, fields }, owner)) as { ok: boolean; value?: { seq: number } };
    assert.ok(made.ok, JSON.stringify(made).slice(0, 300));
    return made.value!.seq;
  };
  for (let i = 1; i <= 23; i += 1) await make('things', { name: `Project ${i} of the portfolio`, lane: i % 3 === 0 ? 'earning' : 'building' });
  for (let i = 1; i <= 20; i += 1) await make('skills', { name: `skill-${i}-for-the-work`, trigger: `When a session needs to do part ${i} of the work`, body: NOTE, state: 'active' });
  for (let i = 1; i <= 34; i += 1) await make('people', { name: `Person ${i} Surname` });
  for (let i = 1; i <= 20; i += 1) await make('organisations', { name: `Organisation ${i} Holdings` });
  for (let i = 1; i <= 300; i += 1) await make('session', { doing: `Run ${i}: mending the gates and the deploy`, state: 'done' });
  /* A DAY OF WRITES, what is new on his Today: tasks made with notes, moved along and noted again. */
  for (let i = 1; i <= 25; i += 1) {
    const seq = await make('tasks', { what: `Card ${i}: finish the boot cut and prove it`, why: NOTE.repeat(3), agent: 'claude' });
    const moved = (await api.update({ register: 'tasks', seq, patch: { why: `${NOTE}${i}`, state: 'doing' }, version: 1 } as never, owner)) as { ok: boolean };
    assert.ok(moved.ok, JSON.stringify(moved).slice(0, 300));
  }
  return { sql, api };
}

test('BOOT ON A RECORD SHAPED LIKE HIS IS UNDER 30 KB, and lists no page of a person, an organisation or a skill', async () => {
  const { sql, api } = await hisShape();
  const out = (await api.boot(owner as never)) as { ok: boolean; value: Record<string, unknown> };
  assert.ok(out.ok, JSON.stringify(out).slice(0, 300));
  const v = out.value;
  const size = (x: unknown): number => JSON.stringify(x ?? null).length;
  const parts = Object.entries(v)
    .map(([k, x]) => [k, size(x)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k} ${(n / 1024).toFixed(1)} KB`)
    .join(', ');
  const pages = v.pages as { about: { register: string } | null }[];
  for (const list of ['people', 'organisations', 'skills', 'session'])
    assert.equal(pages.filter((p) => p.about?.register === list).length, 0, `boot still lists the pages of ${list}`);
  assert.ok((v.pagesByRow as string[]).includes('people'), JSON.stringify(v.pagesByRow));
  assert.ok(size(v) < BOOT_MOST, `boot is ${(size(v) / 1024).toFixed(1)} KB: ${parts}`);
  console.log(`boot ${(size(v) / 1024).toFixed(1)} KB on his shape: ${parts}`);
  sql.close();
});

test("THE RAIL'S PROJECTS ARE LISTED AND THE REST OPEN BY THE ROW", async () => {
  const { sql, api } = await hisShape();
  const v = ((await api.boot(owner as never)) as { value: { pages: { slug: string; nav: unknown; about: { register: string; seq: number | null } | null }[]; pagesByRow: string[] } }).value;
  const projects = v.pages.filter((p) => p.about?.register === 'things' && p.nav !== null);
  assert.equal(projects.length, 5, JSON.stringify(projects.map((p) => p.slug)));
  assert.ok(v.pagesByRow.includes('things'), JSON.stringify(v.pagesByRow));
  /* A PROJECT PAST THE RAIL OPENS BY ITS ROW, as the page the record resolves for it. */
  const every = api.kernel.pages().filter((p) => p.about?.register === 'things');
  const past = every.find((p) => !projects.some((q) => q.slug === p.slug))!;
  const read = (await api.page({ slug: `things#${past.about!.seq}` }, owner)) as { ok: boolean; value: { page: string } };
  assert.ok(read.ok, JSON.stringify(read).slice(0, 300));
  assert.equal(read.value.page, past.slug);
  /* AND A PERSON'S PAGE THE SAME WAY. */
  const someone = api.kernel.pages().find((p) => p.about?.register === 'people')!;
  const met = (await api.page({ slug: `people#${someone.about!.seq}` }, owner)) as { ok: boolean; value: { page: string } };
  assert.ok(met.ok, JSON.stringify(met).slice(0, 300));
  assert.equal(met.value.page, someone.slug);
  sql.close();
});

test("BOOT'S NEWS, FILLED BY THE CLIENT, IS whatsNew's LINE FOR LINE but for the long words and a new row's fields", async () => {
  const { sql, api } = await hisShape();
  const boot = (await api.boot(owner as never)) as { value: ClientBoot };
  const whole = (await api.whatsNew({} as never, owner)) as { value: { events: Record<string, unknown>[] } };
  const filled = bootFilled(boot.value).whatsNew!.events as unknown as Record<string, unknown>[];
  assert.equal(filled.length, whole.value.events.length);
  filled.forEach((line, i) => {
    const was = whole.value.events[i]!;
    for (const [k, x] of Object.entries(was)) {
      if (k === 'from' || k === 'to') continue;
      assert.deepEqual(line[k], x, `line ${i} ${k}`);
    }
    for (const k of ['from', 'to'] as const) {
      if (k === 'to' && was.kind === 'create' && was.register !== null) assert.equal(line.to, null, `line ${i} carried a new row's fields`);
      else if (typeof was[k] === 'string' && (was[k] as string).length > 80) assert.ok((was[k] as string).startsWith((line[k] as string).slice(0, -1)) && (line[k] as string).endsWith('…'), `line ${i} ${k}`);
      else assert.deepEqual(line[k], was[k], `line ${i} ${k}`);
    }
  });
  sql.close();
});
