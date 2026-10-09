/**
 * A record for the Tallybook tests: the kernel with the shipped lists, answering over HTTP as a host does, and a folder
 * holding the invented export (`export.json`) and its map (`sections.json`), so `braindog import --map` runs whole.
 *
 * `packs` ANSWERS NONE unless a test names some (`Settings`), so by default nothing on this record keeps a home currency
 * and the two-currency export is told so rather than asked. EVERY VALUE IS MADE UP.
 */

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../../../packages/kernel/test/sqlite.ts';
import type { AgentIo } from '../../../src/skills.ts';

export const ACTOR = 'p_1';
export const NOW = Date.UTC(2026, 8, 25, 9);

const here = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

type Call = (args: Record<string, unknown>) => Promise<unknown>;

/** The packs the host says this record has, by id: what each declares under `config:` and the values it holds. */
export type Settings = Record<string, { config: Record<string, unknown>; values: Record<string, unknown> }>;

async function serve(kernel: Kernel, settings: Settings): Promise<{ server: Server; base: string }> {
  const calls: Record<string, Call> = {
    schema: async (a) => {
      const decl = kernel.register(String(a.register));
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${String(a.register)}.` } };
    },
    list: async (a) =>
      kernel.list({ register: String(a.register), ...(a.limit === undefined ? {} : { limit: Number(a.limit) }), ...(typeof a.cursor === 'string' ? { cursor: a.cursor } : {}), includeDeleted: a.includeDeleted === true } as never),
    create: async (a) => kernel.create(String(a.register), a.fields as never, { actor: ACTOR }),
    update: async (a) => kernel.update(String(a.register), `${String(a.register)}#${String(a.seq)}`, a.patch as never, { actor: ACTOR, ...(typeof a.version === 'number' ? { version: a.version } : {}) }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async (a) => kernel.propose(a as never, ACTOR),
    handoff: async () => ({ ok: true, value: {} }),
    packs: async () => ({ ok: true, value: Object.keys(settings).map((id) => ({ id, version: '1.0.0', disabled_at: null })) }),
    packConfig: async (a) => {
      const got = settings[String(a.id)];
      return got ? { ok: true, value: { id: a.id, version: '1.0.0', ...got } } : { ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: `${String(a.id)} is not a pack this record has installed.` } };
    },
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//u, '');
    let text = '';
    req.on('data', (c: Buffer) => (text += c.toString('utf8')));
    req.on('end', () => {
      const args: Record<string, unknown> = text ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
      const call = calls[method];
      void (call ? call(args) : Promise.resolve({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: method } })).then((answer) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}` };
}

/** A fresh record, its host, and a folder holding `export.json` and `sections.json`, cleaned up after the test. */
export async function tallybook(t: { after: (fn: () => unknown) => void }, settings: Settings = {}): Promise<{ kernel: Kernel; io: AgentIo; out: string[]; said: string[]; dir: string }> {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const { server, base } = await serve(kernel, settings);
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  t.after(() => sql.close());
  const dir = mkdtempSync(join(tmpdir(), 'bd-tallybook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(here('export.json'), join(dir, 'export.json'));
  copyFileSync(here('sections.json'), join(dir, 'sections.json'));
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => said.push(l), headers: async () => ({}) };
  return { kernel, io, out, said, dir };
}

/** The rows of one list this import wrote, by what the report names them. */
export async function imported(kernel: Kernel, register: string, label: string): Promise<string[]> {
  const got = await kernel.list({ register, limit: 100 });
  assert.ok(got.ok);
  return got.value.rows.filter((r) => Array.isArray(r.fields.tags) && (r.fields.tags as string[]).some((x) => x.startsWith('tallybook:'))).map((r) => String(r.fields[label])).sort();
}
