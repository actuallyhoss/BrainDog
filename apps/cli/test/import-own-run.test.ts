/**
 * The the old tool import writes as one run of its own, one a night, and never as the run of the folder it was started in
 * (`loop/research-shadow-week.md` §4 option A, brief 52-A, cases 1 and 2).
 *
 * MEASURED BEFORE THIS FILE, through `importCommand` on a node:http host over the record: from a folder with no git
 * repository (a scheduled task's default, `C:\Windows\system32`) the fixture opened a run per write, every one of them
 * left `active`; from a folder Claude Code is working in, the agent's own live run signed every write the import made.
 * The import sent `io.headers(to.key)`, which is the folder's position plus the run its session file names, and the
 * kernel's ladder adopts a run only on the same host and repository, so a host and a folder with no repository opened a
 * run on every write, and a spoken run in the headers was that run.
 *
 * AND DROPPING ONLY THE SESSION AND CLIENT HEADERS IS NOT ENOUGH, which is why the second case asserts the exit. The
 * shadow week's checker drove the import with the folder's repository, remote and folder kept beside a client id of its
 * own: one run, ended, the agent untouched, and exit 1, because a run found by its client id from a place it names is
 * placed in that place's project (`packages/kernel/src/index.ts`, `locateRun`), and the skill and the key that belong to
 * other projects were then refused `FORBIDDEN`. The import writes to every project at once, so it has no folder to be
 * placed by, and it sends none of the folder's identity but the machine's name.
 *
 * THE HOST HERE IS THE RECORD, NOT A STUB, AND THE HEADERS ARE READ THE WAY BOTH HOSTS READ THEM: `sessionOf` over each
 * request, laid onto one token as `braindog login` leaves it. Which run signs a write is the kernel's answer to those
 * headers, and a stub that answered each method without the ladder could not say it. EVERY VALUE IS MADE UP.
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
import { sessionOf, withSession } from '../../../packages/host/src/session.ts';
import { KEY_PREFIX } from '../src/legacy.ts';
import { importCommand } from '../src/import.ts';
import type { AgentIo } from '../src/skills.ts';
import { syntheticExport } from './legacy-export.ts';

/* 06:20 IN CAIRO ON THE DAY OF THE EXPORT, an hour after it was taken: the export's day and the run's are the same. */
const NOW = Date.UTC(2026, 8, 15, 3, 20);
const CAIRO = () => 180;

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const TOKEN: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } };

/** Every list the seed declares, Solo founder's two, and the agents pack, as `test/legacy-record.ts` opens a kernel. */
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

/**
 * The record on node:http, each request's session headers read by the hosts' own reader and laid onto the token.
 *
 * `packs` IS THE ONE METHOD THAT TAKES NO ARGUMENTS, so it is the one called with the context alone. A method named in
 * `refuse` is answered with a refusal and never reaches the record, which is how the third case refuses the handoff.
 */
async function host(t: TestContext, api: Api, refuse: string[] = []): Promise<string> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//u, '');
    const headers = new Headers(Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])));
    const ctx = withSession(TOKEN, sessionOf(headers));
    let text = '';
    req.on('data', (c: Buffer) => (text += c.toString('utf8')));
    req.on('end', () => {
      const args: Record<string, unknown> = text ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
      if (typeof args.limit === 'string') args.limit = Number(args.limit);
      /* THE HOST DECODES `includeDeleted` AS JSON (its `ROUTES` table), and this stub reads the address as text, so it does
         the same here; the import asks for deleted rows by GET since `client.list` names the argument. */
      if (typeof args.includeDeleted === 'string') args.includeDeleted = JSON.parse(args.includeDeleted) as unknown;
      const methods = api as unknown as Record<string, (a: unknown, c?: unknown) => Promise<unknown>>;
      const call = methods[method];
      const answer = refuse.includes(method)
        ? Promise.resolve({ ok: false, refusal: { code: 'FORBIDDEN', fix: `This test refuses ${method}.` } })
        : !call
          ? Promise.resolve({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: method } })
          : method === 'packs' ? call.call(api, ctx) : call.call(api, args, ctx);
      void answer.then((a) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(a));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** Runs the import once over `syntheticExport()` with the folder's headers `io.headers` answers, and its exit and report. */
async function importFrom(t: TestContext, base: string, folder: Record<string, string>): Promise<{ code: number; out: string[]; said: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-own-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(syntheticExport()));
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = {
    env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never,
    cwd: dir,
    home: dir,
    out: (l) => out.push(l),
    say: (l) => said.push(l),
    headers: async () => folder,
  };
  const code = await importCommand(['legacy', 'export.json'], io, undefined, () => new Date(NOW), CAIRO);
  return { code, out, said };
}

type RunRow = { seq: number; state: string; client_id: string | null; doing: string | null; notes: string | null };
const runsOf = (sql: ReturnType<typeof openSqlite>): RunRow[] =>
  sql.all<RunRow>(
    "SELECT seq, state, json_extract(fields, '$.client_id') AS client_id, json_extract(fields, '$.doing') AS doing, json_extract(fields, '$.notes') AS notes FROM entry WHERE register = 'session' AND deleted_at IS NULL ORDER BY seq",
  );
/** The runs an import of the old tool's agent runs did not write: those carry their the old tool key in `client_id`. */
const ownRuns = (sql: ReturnType<typeof openSqlite>): RunRow[] => runsOf(sql).filter((r) => !(r.client_id ?? '').startsWith(KEY_PREFIX));

test('FROM A FOLDER WITH NO REPOSITORY the import opens exactly one run, ends it done, and names it by the export it carried', async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api);

  const got = await importFrom(t, base, { 'x-braindog-host': 'studio-pc', 'x-braindog-cwd': 'C:\\Windows\\system32' });
  assert.equal(got.code, 0, [...got.out, ...got.said].join(' | '));

  const own = ownRuns(sql);
  assert.equal(own.length, 1, `the import opened ${String(own.length)} runs of its own, in states ${[...new Set(own.map((r) => r.state))].join(', ')}`);
  const [run] = own;
  assert.equal(run!.state, 'done', 'the import left its run live');
  assert.match(run!.doing ?? '', /the old tool import/u);
  assert.match(run!.doing ?? '', /2026-09-15/u, 'the run does not name the export it carried');
  /* AND EVERY WRITE IT MADE IS THAT RUN'S, which is what one run a night means in the log. */
  const signers = sql.all<{ actor: string }>("SELECT DISTINCT actor FROM event WHERE actor GLOB 'S[0-9]*'").map((e) => e.actor);
  assert.deepEqual(signers, [`S${String(run!.seq)}`]);
});

test("FROM A FOLDER AN AGENT IS WORKING IN the agent's run signs nothing of the import, stays active with its own words, and the import ends 0", async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api);

  /* THE AGENT'S RUN, OPENED THE WAY ITS START HOOK OPENS IT: a handoff naming what it is doing, from its folder. */
  const folder = { host: 'studio-pc', repo: 'lanternly-app', remote: 'https://github.com/example/lanternly-app.git', cwd: 'C:\\Code\\lanternly-app' };
  const opened = await api.handoff({ doing: 'Wire the receipt check' }, withSession(TOKEN, { ...folder, client_id: 'claude-live' }));
  assert.ok(opened.ok, JSON.stringify(opened));
  const agent = runsOf(sql);
  assert.equal(agent.length, 1);
  assert.equal(agent[0]!.seq, 1, 'the agent run is not S1, so the headers below name the wrong run');
  const before = sql.all<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor = 'S1'")[0]!.n;

  const got = await importFrom(t, base, {
    'x-braindog-session': 'S1',
    'x-braindog-client': 'claude-live',
    'x-braindog-host': folder.host,
    'x-braindog-repo': folder.repo,
    'x-braindog-remote': folder.remote,
    'x-braindog-cwd': folder.cwd,
  });

  const signed = sql.all<{ n: number }>("SELECT count(*) AS n FROM event WHERE actor = 'S1'")[0]!.n - before;
  assert.equal(signed, 0, `the agent's run S1 signed ${String(signed)} of the import's events`);
  const s1 = runsOf(sql).find((r) => r.seq === 1)!;
  assert.equal(s1.state, 'active', 'the import ended the agent run');
  assert.equal(s1.doing, 'Wire the receipt check');
  assert.equal(got.code, 0, [...got.out, ...got.said].filter((l) => /FORBIDDEN|refused|Refused/u.test(l)).join(' | '));
  /* AND THE IMPORT'S OWN RUN IS THE ONE ENDED: S1 and it, and nothing else of the import's opened. */
  assert.deepEqual(ownRuns(sql).map((r) => r.state), ['active', 'done']);
});

test('A HANDOFF THE RECORD REFUSES is said in one line and changes nothing else: the rows are in, and the exit is about the rows', async (t) => {
  const { sql, api } = await recordApi();
  t.after(() => sql.close());
  const base = await host(t, api, ['handoff']);

  const got = await importFrom(t, base, { 'x-braindog-host': 'studio-pc' });
  assert.equal(got.code, 0, [...got.out, ...got.said].join(' | '));
  assert.deepEqual(got.said, ["The import's own run could not be ended (This test refuses handoff. (FORBIDDEN)), so it reads as live until the record sweeps it."]);
  /* THE ONE RUN IT OPENED IS STILL ONE, left live for the sweep, and not a second opened by the refused handoff. */
  assert.deepEqual(ownRuns(sql).map((r) => r.state), ['active']);
});
