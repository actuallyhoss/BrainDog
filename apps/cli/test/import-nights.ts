/**
 * Several nights of `braindog import legacy` on one machine, into one record served over HTTP as both hosts serve it.
 *
 * SHARED BY `import-own-deletes.test.ts` AND `import-older-export.test.ts`, because both are about what one night
 * leaves for the next: the rows the import put in the bin, and the export an earlier night carried. Both of those live
 * in `~/.braindog/imports.jsonl` and in the record, so a test of either has to run the command itself, with one home
 * folder across the nights, against a record whose writes are signed the way a real host signs them. `applyPlan` over a
 * kernel door answers every write as `p_1`, the owner in the app, so it cannot tell the import's delete from his.
 *
 * THE RECORD IS BEHIND `serveApi`, for the reason `import-deleted-stays.test.ts` gives: a GET asking for deleted rows
 * is decoded by the route table there, and a stub that decoded it itself would pass an importer that never read one.
 *
 * EVERY VALUE IS MADE UP.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

import { declarations, holdingsDeclarations, installAgentsPack } from '@braindog/seed';
import { useCase } from '@braindog/seed/usecases';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../../packages/record/src/index.ts';
import { handlersFor, serveApi } from '../../../packages/host/src/index.ts';
import { sessionOf, withSession } from '../../../packages/host/src/session.ts';
import { importCommand } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';

export const CAIRO = () => 180;

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const TOKEN: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
/** The owner in the app, which is who deletes a row by hand. */
export const PERSON: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

export type Sql = ReturnType<typeof openSqlite>;

/** Every list the seed declares, Solo founder's two, the agents pack and the holdings list, over HTTP. */
export async function nights(t: TestContext, start: number) {
  const sql = openSqlite();
  t.after(() => sql.close());
  const clock = fixedClock(start);
  const api = await createRecordApi({ sql, clock });
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
  const put = await api.kernel.install([...declarations(), ...founder, ...holdingsDeclarations()]);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const agents = await installAgentsPack(api.kernel);
  assert.ok(agents.ok, agents.ok ? '' : `the agents pack would not install: ${JSON.stringify(agents)}`);

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
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const dir = mkdtempSync(join(tmpdir(), 'bd-import-nights-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let lines: string[] = [];
  const io: AgentIo = {
    env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never,
    cwd: dir,
    home: dir,
    out: (l) => lines.push(l),
    say: (l) => lines.push(l),
    headers: async () => ({ 'x-braindog-host': 'EXAMPLE-PC' }),
  };

  /**
   * One night: the export written to disk and imported, with the record's clock and the command's own both at `at`.
   * `args` is anything after the file, `--dry-run` for one.
   */
  const night = async (exp: Record<string, unknown>, at: number, args: string[] = []): Promise<{ code: number; lines: string[]; text: string }> => {
    clock.set(at);
    lines = [];
    writeFileSync(join(dir, 'export.json'), JSON.stringify(exp));
    const code = await importCommand(['legacy', 'export.json', ...args], io, undefined, () => new Date(at), CAIRO);
    return { code, lines, text: lines.join('\n') };
  };
  /** The morning read, `--since last`. */
  const morning = async (): Promise<string> => {
    lines = [];
    await importCommand(['legacy', '--since', 'last'], io, undefined, () => new Date(clock.now()), CAIRO);
    return lines.join('\n');
  };
  /** A row he deletes in the app, found by its import key. */
  const deleteByKey = async (register: string, key: string): Promise<void> => {
    const row = sql.all<{ seq: number; version: number }>(
      "SELECT e.seq, e.version FROM entry e, json_each(e.fields, '$.tags') t WHERE e.register = ? AND e.deleted_at IS NULL AND t.value = ?",
      register,
      key,
    )[0];
    assert.ok(row, `no live ${register} row holds ${key}`);
    const done = await api.update({ register, seq: row.seq, patch: { deleted_at: true }, version: row.version }, PERSON);
    assert.ok(done.ok, JSON.stringify(done));
  };
  /** A row he puts back from the bin in the app, by its id. */
  const restore = async (register: string, id: string): Promise<void> => {
    const row = sql.all<{ seq: number; version: number }>('SELECT seq, version FROM entry WHERE id = ?', id)[0];
    assert.ok(row, `no row ${id}`);
    const done = await api.update({ register, seq: row.seq, patch: { deleted_at: null }, version: row.version }, PERSON);
    assert.ok(done.ok, JSON.stringify(done));
  };
  return { sql, api, night, morning, deleteByKey, restore };
}

/** The live rows of one list, with the fields a test reads. */
export const liveRows = (sql: Sql, register: string): { id: string; fields: Record<string, unknown> }[] =>
  sql
    .all<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', register)
    .map((r) => ({ id: r.id, fields: JSON.parse(r.fields) as Record<string, unknown> }));
