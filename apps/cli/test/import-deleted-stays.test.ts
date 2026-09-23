/**
 * A ROW HE DELETES IN BRAINDOG STAYS DELETED, WHATEVER THE NEXT NIGHT'S EXPORT STILL HOLDS (backlog IMP-1).
 *
 * MEASURED BEFORE THIS FILE, through `importCommand` on a node:http host serving the record through `serveApi`, as both
 * hosts do: the synthetic export imported once, task 101 and ledger row T1 deleted the way the app deletes a row
 * (`deleted_at` set), and the import run again. Both came back as new rows, `Tasks: 1 added` and `Ledger: 1 added`,
 * because `readAll` listed live rows only and a planned key that no live row holds is a row to create. the old tool stays
 * the one he works in all through the shadow week, so its export holds every row he has thrown away here, every night.
 *
 * THE HOST HERE IS THE RECORD BEHIND `serveApi`, NOT A STUB THAT CALLS THE RECORD'S METHODS, and that is the point of
 * the second half. `serveApi` decodes a GET's arguments by the route table, and an argument the table does not declare
 * arrives as text: `includeDeleted=true` reaches the kernel as the string "true", which is not `true`, so a GET asking
 * for deleted rows is answered with live rows and nothing says so (probed on 23 September). A stub that parsed the query
 * itself would pass against an importer whose deleted read never worked on either host.
 *
 * EVERY VALUE IS MADE UP.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { declarations, installAgentsPack } from '@braindog/seed';
import { useCase } from '@braindog/seed/usecases';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../../packages/record/src/index.ts';
import { handlersFor, serveApi } from '../../../packages/host/src/index.ts';
import { sessionOf, withSession } from '../../../packages/host/src/session.ts';
import { KEY_PREFIX } from '../src/legacy.ts';
import { importCommand } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';
import { syntheticExport } from './legacy-export.ts';

const NOW = Date.UTC(2026, 8, 15, 3, 20);
const CAIRO = () => 180;

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const TOKEN: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };

const TASK = `${KEY_PREFIX}task:101`;
const TXN = `${KEY_PREFIX}txn:t1`;

/** Every list the seed declares, Solo founder's two, and the agents pack, as `test/import-own-run.test.ts` opens one. */
async function recordApi() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const pack = useCase('founder')?.pack as { declarations: Record<string, unknown>[] } | undefined;
  assert.ok(pack, 'Solo founder is not in the catalogue');
  const founder = pack.declarations
    .filter((d) => typeof d.register === 'string')
    .map((d) => {
      const { register, ...rest } = d;
      const fields = rest.fields as { id: string }[];
      const held = fields.some((f) => f.id === 'tags') ? fields : [...fields, { id: 'tags', type: 'list', of: 'text' }];
      return { id: `register.${String(register)}`, kind: 'register' as const, body: { id: register, ...rest, fields: held } as never };
    });
  const put = await api.kernel.install([...declarations(), ...founder]);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const agents = await installAgentsPack(api.kernel);
  assert.ok(agents.ok, agents.ok ? '' : `the agents pack would not install: ${JSON.stringify(agents)}`);
  return { sql, api };
}

type Api = Awaited<ReturnType<typeof recordApi>>['api'];

/** The record over HTTP through `serveApi` and `handlersFor`, which is what the Worker and the self-host both call. */
async function host(t: TestContext, api: Api): Promise<string> {
  const handlers = handlersFor(api as never);
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])));
      const request = new Request(`http://stub${req.url ?? '/'}`, { method: req.method ?? 'GET', headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
      void serveApi(request, handlers, withSession(TOKEN, sessionOf(headers)))
        .then(async (answer) => {
          res.writeHead(answer.status, { 'content-type': 'application/json' });
          res.end(await answer.text());
        })
        .catch((e: unknown) => {
          res.writeHead(500);
          res.end(String(e));
        });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** The synthetic export with one ledger row on the main account, because the fixture has none and IMP-1 names the ledger. */
function fixture(): Record<string, unknown> {
  const exp = syntheticExport();
  (exp.money as Record<string, unknown>).ledger = [{ id: 'T1', description: 'Coffee beans for the studio', day: '2026-09-10', amount_minor: -12000, account_id: 'main' }];
  return exp;
}

/** One folder for the whole test, so the runs `--since` reads are the nights this test ran. */
function machine(t: TestContext): { io: AgentIo; lines: () => string[]; clear: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-deleted-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(fixture()));
  let lines: string[] = [];
  const io: AgentIo = {
    env: { BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never,
    cwd: dir,
    home: dir,
    out: (l) => lines.push(l),
    say: (l) => lines.push(l),
    headers: async () => ({ 'x-braindog-host': 'EXAMPLE-PC' }),
  };
  return { io, lines: () => lines, clear: () => (lines = []) };
}

const live = (sql: ReturnType<typeof openSqlite>, key: string): number =>
  sql.all<{ n: number }>("SELECT count(*) AS n FROM entry e, json_each(e.fields, '$.tags') t WHERE e.deleted_at IS NULL AND t.value = ?", key)[0]!.n;

/** Deleted the way the app's Archive deletes a row: `deleted_at` set through the record's own update. */
async function deleteByKey(api: Api, sql: ReturnType<typeof openSqlite>, register: string, key: string): Promise<void> {
  const row = sql.all<{ seq: number; version: number }>(
    "SELECT e.seq, e.version FROM entry e, json_each(e.fields, '$.tags') t WHERE e.register = ? AND e.deleted_at IS NULL AND t.value = ?",
    register,
    key,
  )[0];
  assert.ok(row, `no live ${register} row holds ${key}`);
  const done = await api.update({ register, seq: row.seq, patch: { deleted_at: '2026-09-15T04:00:00.000Z' }, version: row.version }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
  assert.ok(done.ok, JSON.stringify(done));
}

test('A ROW HE DELETED IS NOT ADDED BACK BY THE NEXT IMPORT, a task or a ledger row, and the run says so once', async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api);
  const m = machine(t);
  const run = async (args: string[]) => {
    m.clear();
    const code = await importCommand(args, { ...m.io, env: { ...m.io.env, BRAINDOG_HOST: base } as never }, undefined, () => new Date(NOW), CAIRO);
    return { code, lines: m.lines() };
  };

  const first = await run(['legacy', 'export.json']);
  assert.equal(first.code, 0, first.lines.join('\n'));
  assert.equal(live(sql, TASK), 1, 'the first import did not write task 101');
  assert.equal(live(sql, TXN), 1, `the first import did not write ledger row T1:\n${first.lines.join('\n')}`);

  await deleteByKey(api, sql, 'tasks', TASK);
  await deleteByKey(api, sql, 'transactions', TXN);

  const second = await run(['legacy', 'export.json']);
  assert.equal(second.code, 0, second.lines.join('\n'));
  assert.equal(live(sql, TASK), 0, `task 101 came back after he deleted it:\n${second.lines.join('\n')}`);
  assert.equal(live(sql, TXN), 0, `ledger row T1 came back after he deleted it:\n${second.lines.join('\n')}`);
  const kept = second.lines.filter((l) => /deleted in this BrainDog/iu.test(l));
  assert.equal(kept.length, 1, `the run should say once what it left deleted, and said:\n${second.lines.join('\n')}`);
  assert.match(kept[0]!, /#101/u);
  assert.match(kept[0]!, /Coffee beans for the studio/u);

  /* THE MORNING READ SAYS IT THE FIRST NIGHT AND NOT EVERY NIGHT AFTER: the same two rows are in every export until
     the old tool closes, and a line repeated nightly is the line that hides the one that is new. */
  const morning = await run(['legacy', '--since', 'last']);
  assert.equal(morning.code, 0, morning.lines.join('\n'));
  assert.equal(morning.lines.filter((l) => /deleted in this BrainDog/iu.test(l)).length, 1, morning.lines.join('\n'));

  const third = await run(['legacy', 'export.json']);
  assert.equal(third.code, 0, third.lines.join('\n'));
  assert.equal(live(sql, TASK), 0);
  const after = await run(['legacy', '--since', 'last']);
  assert.equal(after.lines.filter((l) => /deleted in this BrainDog/iu.test(l)).length, 0, `the third night said the same deletion again:\n${after.lines.join('\n')}`);
});

/* THE ESTATE LINES SAY IT TOO, and they said "unchanged": a date, domain or service held back had no word of its own in
   that list, so the report called lanternly.example unchanged two lines from the one saying it was deleted. */
test('A DOMAIN HE DELETED IS NOT CALLED UNCHANGED IN THE LIST OF DATES, DOMAINS AND SERVICES', async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api);
  const m = machine(t);
  const run = async () => {
    m.clear();
    return importCommand(['legacy', 'export.json'], { ...m.io, env: { ...m.io.env, BRAINDOG_HOST: base } as never }, undefined, () => new Date(NOW), CAIRO);
  };
  assert.equal(await run(), 0, m.lines().join('\n'));
  await deleteByKey(api, sql, 'services', `${KEY_PREFIX}domain:lanternly.example`);
  assert.equal(await run(), 0, m.lines().join('\n'));
  const line = m.lines().find((l) => l.startsWith('- Domain: lanternly.example'));
  assert.ok(line, m.lines().join('\n'));
  assert.match(line, /deleted here, so not added again/u);
});

test('A ROW HE PUT BACK IS HIS AGAIN: a deleted copy beside a live one does not stop the live one being updated', async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api);
  const m = machine(t);
  const run = async () => {
    m.clear();
    return importCommand(['legacy', 'export.json'], { ...m.io, env: { ...m.io.env, BRAINDOG_HOST: base } as never }, undefined, () => new Date(NOW), CAIRO);
  };
  assert.equal(await run(), 0, m.lines().join('\n'));
  /* A DELETED COPY AND A LIVE ONE UNDER ONE KEY is what every record that ran the import before this fix now holds for
     each row he deleted: the deleted one, and the one the next night added back. */
  await deleteByKey(api, sql, 'tasks', TASK);
  const again = await api.kernel.create('tasks', { what: 'Write the annual plan copy', tags: [TASK] }, { actor: 'p_1' });
  assert.ok(again.ok, JSON.stringify(again));
  assert.equal(await run(), 0, m.lines().join('\n'));
  assert.equal(live(sql, TASK), 1, 'the live row was lost or doubled');
  assert.equal(m.lines().filter((l) => /deleted in this BrainDog/iu.test(l)).length, 0, `a row that is live was reported as deleted:\n${m.lines().join('\n')}`);
});
