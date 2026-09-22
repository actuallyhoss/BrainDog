/**
 * The the old tool import, run through the Worker as it ships, in workerd, and set beside the same import on a self-host.
 *
 * WHY THIS FILE EXISTS. The import is the switch (`loop/research-switch-matrix.md`, "What to build next" item 1), and
 * until this file it had only ever run against a self-host on Node: `tools/gates/import.mjs` rehearses it over HTTP into
 * `apps/selfhost`, and `apps/cli/test/import-at-scale.test.ts` drives the kernel over `node:sqlite`. The last fault that
 * mattered lived only in a Durable Object (`test/kernel-in-do.test.ts`: a raw `SAVEPOINT` that answered 500 on
 * workerd while every Node test was green), so a claim that the import works in the cloud is a claim nobody had
 * measured.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. `src/index.ts` is bundled by `wrangler`'s own esbuild with
 * `cloudflare:workers` left for workerd to answer, and Miniflare serves it with both Durable Objects on SQLite storage.
 * The record is made the way the operator makes one (`POST /auth/provision` behind `PROVISION_KEY`), the owner signs in
 * by spending the claim link it hands back, installs Solo founder and Agents on Decide, and mints an agent's bearer with
 * `createToken`. Then `importCommand` itself runs, with the fixture export on disk and `BRAINDOG_HOST` at the Worker's
 * port, so the client, the bearer path in `session.ts`, the router and the object's `fetch` are all on the path.
 *
 * AND THE SELF-HOST IS THE YARDSTICK, NOT A PLAN READ ON ITS OWN. The same export, setup and day go through the same
 * command into `apps/selfhost/src/server.ts`'s `start`, onboarded as `import.mjs` onboards it, and both records are
 * then read back through one client over HTTP. So "every register the self-host carries arrives the same" is a
 * comparison between two records, key by key and field by field, and a row the self-host refuses too is not charged
 * to the Worker.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, not just the ones the report prints. The client turns a 500 into a refusal
 * with the Worker's `INTERNAL` sentence, and a read that answered one would end the run as `PartlyRead` with nothing
 * written; neither is a line the report's "Refused by the record" block would hold, so the fetch the command uses is
 * wrapped and the statuses are kept.
 *
 * WHAT IT FOUND, ON 22 SEPTEMBER: NOTHING, AND THAT IS A MEASUREMENT RATHER THAN AN ABSENCE OF ONE. Both runs answered
 * 200 to every request, the first ended 0 with no refusal, all 44 keyed rows arrived with the self-host's fields, and
 * the second run added nothing. That it can see a Durable Object fault was checked the same day by putting the old one
 * back: with `attempt()` in `packages/kernel/src/tx.ts` made to rethrow the object's savepoint refusal instead of
 * handing over to `storage.transactionSync`, every test here went red on `decide`, answered `INTERNAL` with the Durable
 * Object's own sentence ("please use the state.storage.transaction() or state.storage.transactionSync() APIs"), while
 * the self-host half was untouched.
 *
 * SLOW BY THIS SUITE'S STANDARDS, four to seven seconds across four runs on 22 September: workerd starting once, and an import that is 79 requests on its first
 * run and 33 on its second, measured on 22 September against the fixture.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';
import { importCommand } from '../../cli/src/import.ts';
import { KEY_PREFIX, planLegacyTool, readLegacyTool, readSetup, type Plan } from '../../cli/src/legacy.ts';
import type { AgentIo } from '../../cli/src/skills.ts';
import { syntheticExport, syntheticSetup } from '../../cli/test/legacy-export.ts';
import { start } from '../../selfhost/src/server.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

/** The day the export was taken against, as `import.mjs` pins it: the planner reads today and uses it. */
const TODAY = '2026-09-17';
const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const OWNER = 'owner@example.test';
const SLUG = 'rehearsal';
/* NOT SECRETS. They guard a Worker and a self-host that live in this process for a few seconds. */
const PROVISION_KEY = 'import-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'import-in-do-session-secret-not-a-secret-0123456789';
const SELFHOST_TOKEN = 'import-in-do-selfhost-bearer-not-a-secret';
const PACKS = ['usecase-founder', 'agents'];

/** What one import did, on one host. */
type Run = {
  exit: number;
  lines: string[];
  /** Every answer the command was given, by status, and each one of 500 or more with its path and body. */
  statuses: Map<number, number>;
  fives: string[];
  /** The report's own "Refused by the record" block, label to sentence. */
  refused: Map<string, string>;
};

/** A record read back: each imported row by its key, with the fields it holds, row ids swapped for keys. */
type Held = Map<string, { register: string; fields: unknown }>;

let mf: InstanceType<typeof Miniflare> | undefined;
let selfhost: Awaited<ReturnType<typeof start>> | undefined;
let scratch = '';
let plan: Plan;
const worker: { first?: Run; second?: Run; held?: Held } = {};
const home: { first?: Run; held?: Held } = {};

/** `importCommand`, with every response the command's fetch received counted. */
async function runImport(base: string, token: string): Promise<Run> {
  const lines: string[] = [];
  const statuses = new Map<number, number>();
  const fives: string[] = [];
  const io: AgentIo = {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: token, BRAINDOG_HOSTS: join(scratch, 'hosts.json') },
    cwd: scratch,
    home: scratch,
    out: (line) => void lines.push(line),
    say: (line) => void lines.push(line),
    headers: async () => ({}),
  };
  const real = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const res = await real(input, init);
    statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
    if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
    return res;
  };
  let exit: number;
  try {
    exit = await importCommand(['legacy', 'export.json', '--setup', 'setup.json'], io, TODAY);
  } finally {
    globalThis.fetch = real;
  }
  /* THE SAME PARSE `import.mjs` MAKES, because that block is the only place a refusal's sentence survives the command. */
  const refused = new Map<string, string>();
  const from = lines.indexOf('Refused by the record:');
  if (from >= 0)
    for (const line of lines.slice(from + 1)) {
      if (line === '') break;
      const parts = /^- (.+?) \((.+?)\): (.+)$/u.exec(line);
      if (parts) refused.set(parts[1]!, parts[3]!);
    }
  return { exit, lines, statuses, fives, refused };
}

/** Every row of every list the plan writes to, read back over HTTP through the one client both hosts are read by. */
async function readBack(client: Client, token: string): Promise<Held> {
  const rows: { register: string; id: string; key: string; fields: Record<string, unknown> }[] = [];
  for (const register of new Set(plan.rows.map((r) => r.register))) {
    let cursor: string | null = null;
    for (;;) {
      const got = await client.list({ register, limit: 500, ...(cursor === null ? {} : { cursor }) });
      assert.ok(got.ok, `${register} could not be read back: ${JSON.stringify(got)}`);
      for (const raw of got.value.rows) {
        const row = raw as { id: string; fields: Record<string, unknown> };
        const tags = Array.isArray(row.fields.tags) ? row.fields.tags : [];
        const key =
          register === 'session'
            ? typeof row.fields.client_id === 'string' && row.fields.client_id.startsWith(KEY_PREFIX)
              ? row.fields.client_id
              : null
            : ((tags.find((t) => typeof t === 'string' && t.startsWith(KEY_PREFIX)) as string | undefined) ?? null);
        if (key !== null) rows.push({ register, id: row.id, key, fields: row.fields });
      }
      cursor = got.value.cursor;
      if (cursor === null) break;
    }
  }
  /* A REFERENCE IS A ROW ID, AND THE TWO HOSTS MINT DIFFERENT ONES for the same row, so each id is read as the key of the
     row it names. The agent run's `token_id` is the same kind of name: each host minted its own bearer for the import, and
     the first run of this file failed on exactly that and nothing else. What is left to differ is what the import sent
     and what the record kept of it. */
  const keyOfId = new Map([...rows.map((r) => [r.id, r.key] as const), [token, 'the import token'] as const]);
  const swap = (v: unknown): unknown =>
    typeof v === 'string' ? (keyOfId.get(v) ?? v) : Array.isArray(v) ? v.map(swap) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
  return new Map(rows.map((r) => [r.key, { register: r.register, fields: swap(r.fields) }]));
}

/** A client that speaks as the signed-in owner of the Worker's record: the cookie, and the origin a cookie write needs. */
const ownerClient = (base: string, cookie: string): Client =>
  createClient({
    base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return fetch(input, { ...init, headers: sent });
    },
  });

/** The Worker, onboarded the way the operator and the owner onboard it, and the import run into it twice. */
async function throughTheWorker(): Promise<void> {
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so the system picks one: a fixed port would collide with `wrangler dev` or a gate already listening. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      /* `wrangler.jsonc`'s own date and flags, because a different date is a different runtime. */
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Record$', useSQLite: true }, DIRECTORY: { className: 'Directory$', useSQLite: true } },
      queueProducers: { INGRESS: 'braindog-ingress' },
      bindings: { PUBLIC_HOST: HOST, SESSION_SECRET, PROVISION_KEY, PROVISION_WITHOUT_KEYS: 'yes', BRAINDOG_BUILD: '' },
    }),
  );
  const base = (await mf.ready).origin;

  /* THE OPERATOR'S RECORD, and the claim link it hands back, spent by the owner for a session. */
  const provisioned = await fetch(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug: SLUG, email: OWNER, name: 'Rehearsal' }),
  });
  const made = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(made));
  const claimToken = made.value!.claim.split('#claim=')[1];
  const redeemed = await fetch(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  const owner = ownerClient(base, set.split(';')[0]!);

  for (const pack of PACKS) {
    const filed = await owner.call<{ id: string }>('propose', { question: `Install ${pack}?`, body_kind: 'pack', body: { install: pack } });
    assert.ok(filed.ok, `${pack} could not be offered on the Worker: ${JSON.stringify(filed)}`);
    const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the rehearsal installs it' } });
    assert.ok(accepted.ok, `${pack} would not install on the Worker: ${JSON.stringify(accepted)}`);
  }
  const minted = await owner.call<{ id: string; bearer: string }>('createToken', { scope: 'write', label: 'import' });
  assert.ok(minted.ok, `the owner could not mint an agent's bearer on the Worker: ${JSON.stringify(minted)}`);
  const bearer = minted.value.bearer;

  worker.first = await runImport(base, bearer);
  worker.held = await readBack(createClient({ base, token: bearer }), minted.value.id);
  worker.second = await runImport(base, bearer);
}

/** The self-host, onboarded as `tools/gates/import.mjs` onboards it, and the import run into it once. */
async function throughTheSelfHost(): Promise<void> {
  selfhost = await start({ file: ':memory:', directory: ':memory:', port: 0, host: '127.0.0.1', pollMs: 0, token: SELFHOST_TOKEN });
  const person = selfhost.directory!.person$(OWNER, 'Owner');
  assert.ok(person.ok);
  const record = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
  assert.ok((await selfhost.api.createRecord({ id: record, slug: SLUG, name: 'Rehearsal', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: OWNER, name: 'Owner' } })).ok);
  assert.ok(selfhost.directory!.provision({ slug: SLUG, email: OWNER, record, plan: 'selfhost' }).ok);
  const ownerCtx = { principal: { kind: 'person', id: person.value.id, level: 'owner' } } as never;
  for (const pack of PACKS) {
    const filed = await selfhost.api.propose({ question: `Install ${pack}?`, body_kind: 'pack', body: { install: pack } }, ownerCtx);
    assert.ok(filed.ok, JSON.stringify(filed));
    assert.ok((await selfhost.api.decide({ id: (filed.value as { id: string }).id, decide: { option: 'accept', reason: 'the rehearsal installs it' } }, ownerCtx)).ok);
  }
  /* AN AGENT'S BEARER, MINTED AS ON THE WORKER, and not the server key: a run under the server key files its agent runs
     with no `token_id`, and the comparison below would be between two different callers rather than two hosts. */
  const minted = (await selfhost.api.createToken({ scope: 'write', label: 'import' }, { ...(ownerCtx as object), credentialed: true } as never)) as { ok: true; value: { id: string; bearer: string } };
  assert.ok(minted.ok, JSON.stringify(minted));
  const address = selfhost.server.address();
  const base = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
  home.first = await runImport(base, minted.value.bearer);
  home.held = await readBack(createClient({ base, token: minted.value.bearer }), minted.value.id);
}

before(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'braindog-import-in-do-'));
  const exported = syntheticExport();
  const setup = syntheticSetup();
  writeFileSync(join(scratch, 'export.json'), JSON.stringify(exported));
  writeFileSync(join(scratch, 'setup.json'), JSON.stringify(setup));
  /* THE PLAN THROUGH THE COMMAND'S OWN TWO READERS, so it is the plan the command is about to apply. */
  const read = readLegacyTool(JSON.stringify(exported));
  const asked = readSetup(JSON.stringify(setup));
  assert.ok(read.ok && asked.ok);
  plan = planLegacyTool(read.value, TODAY, asked.value);
  /* A PLAN WITH NO ROWS WOULD MAKE EVERY ASSERTION BELOW TRUE, the way an empty list satisfies anything. */
  assert.ok(plan.rows.length > 20, `the fixture planned ${String(plan.rows.length)} rows`);
  await throughTheSelfHost();
  await throughTheWorker();
});

after(async () => {
  await mf?.dispose();
  await selfhost?.close();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

test('THE IMPORT THROUGH THE WORKER IS NEVER ANSWERED 500, on the first run or the second', () => {
  /* AND IT WAS ASKED SOMETHING: a run that stopped at its first read would have no 500 in it either. */
  const asked = (run: Run) => [...run.statuses.values()].reduce((a, b) => a + b, 0);
  assert.ok(asked(worker.first!) >= asked(home.first!) && asked(home.first!) > 50, `${String(asked(worker.first!))} requests`);
  assert.deepEqual(worker.first!.fives, []);
  assert.deepEqual(worker.second!.fives, []);
});

test('EVERY ROW THE PLAN HOLDS IS ON THE WORKER, and the run ends 0 with nothing refused', () => {
  assert.equal(worker.first!.exit, 0, worker.first!.lines.join('\n'));
  assert.deepEqual([...worker.first!.refused], []);
  assert.deepEqual(
    plan.rows.filter((row) => !worker.held!.has(row.key)).map((row) => `${row.label} (${row.register})`),
    [],
  );
});

test('THE WORKER REFUSES NOTHING THE SELF-HOST ACCEPTS, and says the same thing about what it refuses', () => {
  assert.deepEqual([...worker.first!.refused], [...home.first!.refused]);
  assert.equal(worker.first!.exit, home.first!.exit, worker.first!.lines.join('\n'));
});

test('THE REPORT A PERSON READS IS THE SAME REPORT on either host', () => {
  assert.deepEqual(worker.first!.lines, home.first!.lines);
});

test('EVERY REGISTER THE SELF-HOST CARRIES ARRIVES ON THE WORKER THE SAME, row by row and field by field', () => {
  const byRegister = (held: Held) => {
    const out: Record<string, number> = {};
    for (const { register } of held.values()) out[register] = (out[register] ?? 0) + 1;
    return out;
  };
  assert.deepEqual(byRegister(worker.held!), byRegister(home.held!));
  assert.ok(home.held!.size > 20, `the self-host holds ${String(home.held!.size)} imported rows, which is too few to compare`);
  for (const [key, row] of home.held!) assert.deepEqual(worker.held!.get(key), row, key);
});

test('RE-RUNNING THROUGH THE WORKER ADDS NOTHING, as the command promises', () => {
  const added = worker.second!.lines.filter((line) => /\b[1-9]\d* added\b/u.test(line));
  assert.deepEqual(added, [], worker.second!.lines.join('\n'));
  assert.equal(worker.second!.exit, worker.first!.exit);
});
