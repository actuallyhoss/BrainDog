/**
 * The self-host: one Node process, one file, the same record.
 *
 * IT IS NOT A CUT-DOWN VERSION. `01-ARCHITECTURE` §4 makes the self-host the same code as the hosted
 * product with a different storage adapter underneath — the packages are identical, and everything
 * in this file is the two things a platform actually differs on: where the bytes live, and how a
 * request arrives. If a route ever appears here and not in the Worker, one of them is a different
 * product.
 *
 * THIS FILE IS ALLOWED TO KNOW IT IS NODE. That is the other side of the line the `stack` gate draws
 * across `packages/**`: the kernel may not ask which runtime it is in, and a host must.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { argv, env, exit } from 'node:process';

import { ROUTES, serveApi, type Handler } from '@braindog/host';
import { createRecordApi, type CallContext } from '@braindog/record';
import type { Param, Row, Sql } from '@braindog/ports';

/** The `Sql` port over `node:sqlite`. The one thing this file exists to supply. */
function openSqlite(path: string): Sql & { close(): void } {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  let depth = 0;
  return {
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/**
 * Who is asking.
 *
 * ONE USER, and the token is the whole of the check — `30-BLUEPRINT` §10's `BRAINDOG_TOKEN` row: a
 * self-host is one person's record on one machine, so there is no directory, no invitation and no
 * second level. What there IS is the same `CallContext` the hosted product builds, so every
 * permission check below this line is the same code.
 */
function contextFor(request: Request, token: string | undefined): CallContext | null {
  if (!token) return { principal: { kind: 'person', id: 'p_self', level: 'owner' } };
  const sent = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return sent === token ? { principal: { kind: 'person', id: 'p_self', level: 'owner' } } : null;
}

export async function start(options: { file: string; port: number; token?: string | undefined }) {
  const sql = openSqlite(options.file);
  const api = await createRecordApi({ sql, clock: { now: () => Date.now() } });

  const refused = api.kernel.refused();
  if (refused) {
    console.error(`${refused.code}: ${refused.fix}`);
    exit(1);
  }

  /* Every route in the shared table, and nothing else. A route here that is not there is a product
     that behaves differently depending on where a customer runs it. */
  const handlers: Record<string, Handler> = {
    boot: (_a, ctx) => api.boot(ctx as CallContext),
    version: (_a, ctx) => api.version(ctx as CallContext),
    schema: (a, ctx) => api.schema(a as never, ctx as CallContext),
    get: (a, ctx) => api.get(a as never, ctx as CallContext),
    list: (a, ctx) => api.list(a as never, ctx as CallContext),
    history: (a, ctx) => api.history(a as never, ctx as CallContext) as never,
    create: (a, ctx) => api.create(a as never, ctx as CallContext),
    update: (a, ctx) => api.update(a as never, ctx as CallContext),
  };
  for (const route of ROUTES)
    if (!handlers[route.name]) throw new TypeError(`${route.name} is in the route table and not wired here`);

  const server = createServer((req, res) => void answer(req, res, handlers, api, options.token));
  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  return { server, api, sql, close: () => new Promise<void>((r) => server.close(() => (sql.close(), r()))) };
}

async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: Record<string, Handler>,
  api: Awaited<ReturnType<typeof createRecordApi>>,
  token: string | undefined,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  const url = `http://localhost${req.url ?? '/'}`;
  const request = new Request(url, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  });

  const ctx = contextFor(request, token);
  const out = ctx
    ? await serveApi(request, handlers, ctx)
    : new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This record needs its token.' } }), {
        status: 401,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
  void api;
}

/* One file, one port, one token. Everything else is the record. */
if (argv[1]?.endsWith('server.ts')) {
  const file = argv[2] ?? env.BRAINDOG_FILE ?? 'record.sqlite';
  const port = Number(argv[3] ?? env.PORT ?? 8787);
  await start({ file, port, token: env.BRAINDOG_TOKEN });
  console.log(`braindog · ${file} · http://localhost:${port}/api/boot`);
}
