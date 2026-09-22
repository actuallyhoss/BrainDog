/**
 * The importer's "today" on a night east of UTC, the case `loop/research-batch-twenty-eight-audit.md` §6 measured.
 *
 * WHY THIS FILE WHEN `test/import-dry-run-coerce.test.ts` ALREADY PLANS ON THE LOCAL DAY. That test is the evening west
 * of UTC (22:30 at -03:00, the UTC date a day ahead) and reads one date. The audit's case is the other side: 02:30 on the
 * 22nd at +03:00 is 23:30Z on the 21st, so the UTC date is a day BEHIND, and it moves two answers at once. With `today`
 * taken as `toISOString().slice(0, 10)`, as it was, the date on the 21st landed as an open task and the question put off
 * until the 22nd was left out as still put off. Re-measured against HEAD at 0e8f3b96: that commit had already moved the
 * default onto `localClock`, so this file is the guard for the east side. It was seen red by putting the UTC line back:
 * the date's state came back `open`, and with that assertion taken out the run printed "Put off in the old tool until a
 * later day ... SG22 (until 2026-09-22)" and asked nothing.
 *
 * THE KERNEL ANSWERS, NOT A STUB, as in the file named above, because what the record holds after the run is the fact.
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { AgentIo } from '../src/skills.ts';
import { importCommand, type Door } from '../src/import.ts';

const ACTOR = 'p_1';

const exportOf = () => ({
  takenAt: '2026-09-21T23:00:00.000Z',
  rev: 3,
  db: {
    entities: [],
    events: [{ id: 'EV21', title: 'Renewal form due', kind: 'deadline', date: '2026-09-21' }],
    suggestions: [
      {
        id: 'SG22',
        question: 'Move the newsletter to Thursdays?',
        status: 'open',
        defer: { until: '2026-09-22' },
        options: [
          { key: 'A', title: 'Thursdays' },
          { key: 'B', title: 'Keep Mondays' },
        ],
      },
    ],
  },
});

function doorOf(kernel: Kernel): Door {
  return {
    schema: async (register) => {
      const decl = kernel.register(register);
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } };
    },
    list: async ({ register, limit, cursor }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) }),
    create: async ({ register, fields, note }) => kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) =>
      kernel.update(register, `${register}#${String(seq)}`, patch, { actor: ACTOR, ...(version === undefined ? {} : { version }), ...(note === undefined ? {} : { note }) }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
}

/** The kernel on node:http, answering the methods the importer calls the way the host does. */
async function host(kernel: Kernel): Promise<{ server: Server; base: string }> {
  const door = doorOf(kernel);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//u, '');
    let text = '';
    req.on('data', (c: Buffer) => (text += c.toString('utf8')));
    req.on('end', () => {
      const args: Record<string, unknown> = text ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
      if (typeof args.limit === 'string') args.limit = Number(args.limit);
      const call = method === 'schema' ? () => door.schema(String(args.register)) : (door as unknown as Record<string, (a: unknown) => Promise<unknown>>)[method];
      void (call ? call(args) : Promise.resolve({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: method } })).then((answer) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}` };
}

test('AT 02:30 ON THE 22ND AT +03:00 THE PLAN IS MADE ON THE 22ND: the date on the 21st is done, and the question put off until the 22nd is asked', async (t) => {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 21, 23, 30)));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const { server, base } = await host(kernel);
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  t.after(() => sql.close());
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-today-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(exportOf()));
  const out: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: () => {}, headers: async () => ({}) };

  const now = () => new Date('2026-09-21T23:30:00.000Z');
  const east = () => 180;
  assert.equal(await importCommand(['legacy', 'export.json'], io, undefined, now, east), 0, out.join(' | '));

  const tasks = await kernel.list({ register: 'tasks', limit: 50 });
  assert.ok(tasks.ok);
  const date = tasks.value.rows.find((r) => (r.fields as { what?: unknown }).what === 'Renewal form due');
  assert.equal((date?.fields as { state?: unknown } | undefined)?.state, 'done', 'the date on the 21st was filed as open, which is the UTC day');

  assert.deepEqual(out.filter((l) => /SG22 \(until/u.test(l)), [], `the question was left out as still put off: ${out.join(' | ')}`);
  assert.ok(out.includes('Decide: 1 asked, 0 asked before.'), `the question was not asked: ${out.join(' | ')}`);
});
