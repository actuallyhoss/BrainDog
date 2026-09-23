/**
 * Nights of `braindog import legacy` into one record served over HTTP, with a hand on the wire between the two.
 *
 * `import-nights.ts` IS THE SAME SETUP WITH NOTHING BETWEEN THE COMMAND AND THE RECORD, and two things the import has
 * to survive happen exactly there. A host at an older commit decodes the same request differently: at `19d4c785`,
 * the build production answered on 23 September, `GET /api/list?includeDeleted=true` reached the kernel as the text
 * "true" and was answered with live rows alone, 200 (`loop/research-batch-fifty-five-audit.md` section 1). And a host
 * stops answering part way through a night, after a write has landed or before its answer has come back. `rewrite`
 * changes a request before the record reads it, and `cut` drops the connection before the record sees the request or
 * after it has answered, which is what the client reads as `UNREACHABLE` in both cases.
 *
 * `BRAINDOG_HOST_TREE` NAMES ANOTHER CHECKOUT TO SERVE THE RECORD FROM, so the same tests run against a real host
 * built at another commit rather than against `rewrite`'s imitation of one. The command and the seed are this tree's
 * in both cases, which is the skew the audit measured: a CLI copy newer or older than the Worker it talks to. Against
 * a checkout at `19d4c785` with `pnpm install --offline --frozen-lockfile` run in it, the record, the host and the
 * test clock are that checkout's.
 *
 * EVERY VALUE IS MADE UP.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';

import { declarations, holdingsDeclarations, installAgentsPack } from '@braindog/seed';
import { useCase } from '@braindog/seed/usecases';

import type { CallContext } from '../../../packages/record/src/index.ts';
import { importCommand } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';

type Record_ = typeof import('../../../packages/record/src/index.ts');
type Host = typeof import('../../../packages/host/src/index.ts');
type Session = typeof import('../../../packages/host/src/session.ts');
type Sqlite = typeof import('../../../packages/kernel/test/sqlite.ts');

const TREE = process.env.BRAINDOG_HOST_TREE ? resolve(process.env.BRAINDOG_HOST_TREE) : resolve(import.meta.dirname, '../../..');
const from = async <T>(path: string): Promise<T> => (await import(pathToFileURL(join(TREE, path)).href)) as T;
const { createRecordApi } = await from<Record_>('packages/record/src/index.ts');
const { handlersFor, serveApi } = await from<Host>('packages/host/src/index.ts');
const { sessionOf, withSession } = await from<Session>('packages/host/src/session.ts');
const { fixedClock, openSqlite } = await from<Sqlite>('packages/kernel/test/sqlite.ts');

/** Whether the record is served from another checkout, so a test can say which host it measured. */
export const OTHER_TREE = process.env.BRAINDOG_HOST_TREE !== undefined;

export const CAIRO = () => 180;

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const TOKEN: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };
/** The owner in the app, which is who deletes a row by hand. */
export const PERSON: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** One request as it reached the host: the verb, the address with its query, and the body a POST carried. */
export type Wire = { method: string; url: string; body: string };

export type Sql = ReturnType<Sqlite['openSqlite']>;

export async function gatedNights(t: TestContext, start: number) {
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
  const put = await api.kernel.install([...declarations(), ...founder, ...holdingsDeclarations()] as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const agents = await installAgentsPack(api.kernel as never);
  assert.ok(agents.ok, agents.ok ? '' : `the agents pack would not install: ${JSON.stringify(agents)}`);

  /** Changes a request before the record reads it. The identity unless a test sets one. */
  let rewrite: (w: Wire) => Wire = (w) => w;
  /** Drops the connection before the record sees a request, or after it has answered one. */
  let cut: (w: Wire) => 'no' | 'before' | 'after' = () => 'no';

  const handlers = handlersFor(api as never);
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const w = rewrite({ method: req.method ?? 'GET', url: req.url ?? '/', body: Buffer.concat(chunks).toString('utf8') });
      const when = cut(w);
      if (when === 'before') {
        res.socket?.destroy();
        return;
      }
      const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' && k !== 'content-length' ? [[k, v] as [string, string]] : [])));
      const request = new Request(`http://stub${w.url}`, { method: w.method, headers, ...(w.method === 'POST' ? { body: w.body } : {}) });
      void serveApi(request, handlers, withSession(TOKEN, sessionOf(headers)))
        .then(async (answer) => {
          const text = await answer.text();
          if (when === 'after') {
            res.socket?.destroy();
            return;
          }
          res.writeHead(answer.status, { 'content-type': 'application/json' });
          res.end(text);
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

  const dir = mkdtempSync(join(tmpdir(), 'bd-import-gated-'));
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

  /** One night: the export written to disk and imported, with the record's clock and the command's own both at `at`. */
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
  return {
    sql,
    api,
    clock,
    night,
    morning,
    deleteByKey,
    restore,
    /** Sets how requests are changed on their way in; `null` puts the wire back as it was. */
    rewrite: (f: ((w: Wire) => Wire) | null) => (rewrite = f ?? ((w) => w)),
    /** Sets which requests lose their connection; `null` answers every one again. */
    cut: (f: ((w: Wire) => 'no' | 'before' | 'after') | null) => (cut = f ?? (() => 'no')),
  };
}

/** How many live rows hold an import key. */
export const live = (sql: Sql, key: string): number =>
  sql.all<{ n: number }>("SELECT count(*) AS n FROM entry e, json_each(e.fields, '$.tags') t WHERE e.deleted_at IS NULL AND t.value = ?", key)[0]!.n;

/** The live rows of one list, with the fields a test reads. */
export const liveRows = (sql: Sql, register: string): { id: string; fields: Record<string, unknown> }[] =>
  sql
    .all<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', register)
    .map((r) => ({ id: r.id, fields: JSON.parse(r.fields) as Record<string, unknown> }));
