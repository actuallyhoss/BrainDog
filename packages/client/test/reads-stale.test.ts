/**
 * What batch 85 added, through the client: the read `stale`, the number `context` carries of it, and the tidy's two
 * figures, `gone-stale` and `tidied-week`, read as any figure is.
 *
 * NOT A STAND-IN FETCH AND NOT A STAND-IN GUARD, as `reads-briefing.test.ts` is not: `serveApi` over a real record, so what
 * the client sends is what the host decodes, the caller is held by the record's own guards, and the numbers are what
 * the kernel's finders and the hourly sweep's own pass (`purge`) hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '@braindog/host';

import { createClient, type Stale } from '../src/index.ts';
import { createRecordApi, type CallContext, type Stale as RecordStale } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** The client's `Stale` is the record's own, held at compile time. */
const _same: Stale = null as unknown as RecordStale;
void _same;

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 14, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to Notes and nothing else. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };

const NOTES = { id: 'register.notes', kind: 'register' as const, body: { id: 'notes', name: 'Notes', title: 'subject', fields: [{ id: 'subject', type: 'text', required: true }] } as never };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Read = { value: number | null; met: boolean | null };

async function wired() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([NOTES]));
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
  return { sql, api, clock, sent, mine: clientFor(owner), theirs: clientFor(shut) };
}

test('`stale` IS ONE READ+ ROUTE THAT WRITES NOTHING, sent as a GET, and a fresh record says nothing is stale', async () => {
  assert.deepEqual(ROUTES.filter((r) => r.name === 'stale').map((r) => [r.group, r.writes]), [['READ+', false]]);
  const { sql, clock, sent, mine } = await wired();
  clock.set(NOW);
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  assert.deepEqual(value<Stale>(await mine.stale()), { lines: [], count: 0 });
  assert.deepEqual(sent, ['GET /api/stale']);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before, 'a read wrote to the log');
  sql.close();
});

test('A QUESTION THAT WAITED TWENTY DAYS IS ONE LINE WITH THE CALL THAT CLEARS IT, the figure counts it, and `context` carries the same number', async () => {
  const { sql, api, clock, mine, theirs } = await wired();
  /* ASKED BY THE RECORD'S OWN `propose`, twenty days before now, and never answered. */
  const asked = value<{ id: string }>(
    await api.propose({ question: 'Add a note called Ship?', body_kind: 'rowset', body: { register: 'notes', rows: [{ subject: 'Ship' }] } } as never, owner),
  );
  assert.ok(asked.id);
  clock.set(NOW);

  const told = value<Stale>(await mine.stale());
  const line = told.lines.find((l) => l.kind === 'questions');
  assert.ok(line, JSON.stringify(told));
  assert.equal(line.count, 1);
  assert.match(line.said, /^1 question has waited 20 days for an answer/u);
  assert.match(line.clear, /^decide with id SG\d+ and your answer$/u);
  assert.equal(told.count, told.lines.reduce((n, l) => n + l.count, 0));
  /* NAMES AND NO ID: nothing the record keeps a thing under leaves it. */
  assert.doesNotMatch(JSON.stringify(told), /[0-9A-HJKMNP-TV-Z]{26}/u);

  /* THE FIGURE, READ AS ANY FIGURE IS (`record.tidy` has a reader now): the finders count the question too. */
  const things = value<Read>(await mine.metric('gone-stale'));
  assert.ok((things.value ?? 0) >= 1, JSON.stringify(things));
  assert.equal(things.met, false, 'the target is none stale');

  /* AND THE START CARD'S NUMBER IS THE READ'S, never a second count beside it. */
  assert.equal(value<{ stale?: number }>(await mine.context()).stale, told.count);

  /* SOMEBODY HELD TO NOTES is told of the question, which is about Notes, and of nothing a finder counts across the
     other lists; and is refused the figure, which names the whole record. */
  assert.deepEqual(value<Stale>(await theirs.stale()).lines.map((l) => l.kind), ['questions']);
  const no = (await theirs.metric('gone-stale')) as { ok: boolean };
  assert.equal(no.ok, false);
  sql.close();
});

test('THE HOURLY SWEEP KEEPS THE LINES `tidied-week` READS: nothing cleared reads 0, through the record', async () => {
  const { sql, api, clock, mine } = await wired();
  clock.set(NOW);
  assert.equal(sql.one("SELECT 1 AS x FROM sqlite_master WHERE name = 'tidy_line'"), undefined, 'a record never swept holds no line');
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n;
  api.kernel.purge();
  assert.ok(sql.one<{ n: number }>('SELECT count(*) AS n FROM tidy_line')!.n >= 1, 'the sweep kept no line');
  /* THE SWEEP COUNTS AND ASKS NOTHING: no question is filed by the record's own pass. */
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n, before);
  const week = value<Read>(await mine.metric('tidied-week'));
  assert.equal(week.value, 0);
  assert.equal(week.met, null, 'a quiet week is never judged');
  sql.close();
});
