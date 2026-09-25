/**
 * A value put in by a person on the Vault screen, and a value put in by `braindog keys put`, each against a Keys row
 * the the old tool import made, on a record that lives in a Durable Object.
 *
 * WHY THIS FILE EXISTS. `loop/research-switch-left.md` finding 4 and brief 45-B. The import carries 91 Keys rows and
 * not one value (`packs/legacy-import/adapter.ts`, the line that says so every run), so each of his 72 values goes in by
 * hand, once, and it is the only copy. A deposit finds its row by `credential` or by `label` within the caller's reach
 * (`keyFor` in `packages/record/src/index.ts`), and the importer sets `project` on a key whose the old tool scope names
 * one. Read and not measured, that meant a `keys put` under the wrong grant would make a second row of the same label
 * rather than seal onto the imported one. This file measures which path fills the imported row before he does it 72
 * times.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `test/import-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, and Solo
 * founder and Agents installed on Decide. `KEK` IS BOUND, to 32 random bytes made per run, because without it both key
 * doors answer `NOT_IN_THIS_BUILD` and a record provisioned before it is bound can never hold a sealed value.
 *
 * THE ROWS ARE THE IMPORTER'S OWN. `planLegacyTool` plans a small export (the fixture's, with its key list replaced), and
 * the Keys rows are created with the fields it planned and the tag it keys them by, the project ref resolved to the
 * project row as `applyPlan` resolves it. The person's deposit is the Replace sheet's own call (`routes/vault/+page.svelte`,
 * `saveKey`: the row's label and opens, `credential` set to the row id, and the value). The agent's is `keys` from
 * `apps/cli/src/keys.ts` itself, run against the Worker with a hosts file holding a vault grant that came through the
 * device flow and the owner's approval, so "what `keys put` does" is what the command does and not a body this file
 * assembled.
 *
 * `/auth/device` IS ASKED BY `dispatchFetch` AT THE PUBLIC NAME, because it starts nothing for a request that reached the
 * Worker by another (`packages/host/src/device.ts`), and a port picked by the system is another name. Everything else
 * goes to that port with plain `fetch`, as the two in-DO files do.
 *
 * ONE RECORD PER CASE, so a row one case made is never the row another case finds by label.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as `import-in-do` counts them: a 500 on a deposit is a value he typed and
 * lost, and it is the one answer no count of rows would show.
 *
 * A ROW IS SEALED WHEN ITS `value` NAMES A GRANT, and that is what the cases below read, because it is what the Keys list
 * and the Vault screen read. Opening the value again is a case of its own, the last, for the reason under "WHAT IT FOUND".
 *
 * RED FIRST, MEASURED ON 23 SEPTEMBER without touching the tree, over scratch bundles whose esbuild `onLoad` rewrites one
 * line of `packages/record/src/index.ts` before building. `VAULT_ROW_MUTANT` picks which:
 *   - `no-credential`: `depositGrant` finds its row by label alone, whatever row the person named. The same-label case
 *     for the person went red, sealing the first row of that label and not the one named. The brief's own first case
 *     STAYED GREEN, and that is worth knowing: with labels that differ, the label finds the same row the name does, so
 *     the person's case says nothing about the name until two rows share a label. That is why the same-label case is here.
 *   - `no-reach`: `keyFor` lets every grant reach every key. The `*` grant's measurement went red (it sealed onto the
 *     project's row instead of refusing), and so did the same-label case for a project grant, which then sealed the
 *     row of no project. The brief's third case stayed green under it, for the same reason as above.
 * So every case that describes what should hold is red under one of the two, and the measurement is red under one. The
 * third, `break-view`, puts back the `view` line the repair replaced, and the last case goes red under it.
 *
 * WHAT IT FOUND AT HEAD, AND WHAT IT MEANS FOR HIS 72 VALUES. Both paths fill the imported row when the grant reaches it,
 * and neither makes a duplicate on its own. A person naming the row on the Vault screen seals onto that row whatever its
 * project, which is the only path that reaches every row. `keys put` under a `*` grant, by the label of a row that has a
 * project, REFUSES, with "A new key says what it opens", because to that grant the row is not there and a new key needs
 * `opens`. Given `--opens` as well, the same command MAKES A THIRD ROW of the same label, with no project and no import
 * tag, and the imported row stays empty. So his path is the Vault screen's Replace, one row at a time; `keys put` fills an
 * imported row only under a grant for that row's own project (or `*` for a row with none), and never with `--opens`.
 * Nothing answered 500.
 *
 * AND NO VALUE SEALED ON THE WORKER OPENS AGAIN, which no test had seen because `test/vault-keys.test.ts` drives the
 * record over `node:sqlite`, where a BLOB comes back as a `Uint8Array`. In a Durable Object it comes back as an
 * `ArrayBuffer` (logged from a scratch bundle: the nonce and ciphertext arrive at the open as `ArrayBuffer`, 12 and 84
 * bytes, with the same additional data and nonce the seal used). `view` in `packages/host/src/sealing.ts` copies anything
 * whose `.buffer` is not an `ArrayBuffer` with `Uint8Array.from`, and `Uint8Array.from` of an `ArrayBuffer` is an EMPTY
 * array, so AES-GCM is handed a zero-byte nonce and the person, `keys exec` and (read, not measured) a scheduled action's
 * key all got `WRONG_KEY`. THE DEPOSIT WAS SOUND: the one-line repair in `view`, landed the same day, opens the very
 * bytes the old code sealed, so nothing deposited before it has to be deposited again.
 *
 * ABOUT FOUR SECONDS, 3.4 to 4.0 across four runs on 23 September: workerd starting once, and seven records set up.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';
import { isRef } from '../../cli/src/adapter.ts';
import { planLegacyTool, readLegacyTool, readSetup } from '../../../packs/legacy-import/test/harness.ts';
import { keys } from '../../cli/src/keys.ts';
import { syntheticExport, syntheticSetup } from '../../../packs/legacy-import/test/synthetic.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispatchFetch(url: string, init?: object): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

/** The day the plan is made against, as `import-in-do` pins it. */
const TODAY = '2026-09-17';
const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
/* NOT SECRETS. They guard a Worker that lives in this process for a few seconds. The root key is made per run. */
const PROVISION_KEY = 'vault-imported-row-operator-key-not-a-secret';
const SESSION_SECRET = 'vault-imported-row-session-secret-not-a-secret-0123456789';
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

/** A fake value, made per call, that no provider would ever issue. */
const fake = (): string => `bd_fake_vault_value_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex')}`;

/** The fixture's key with a project (`scope: lanternly`), as his export writes one. */
const SCOPED = { id: 'store-api', name: 'Store API token', kind: 'api-token', opens: 'The app store publishing API for Lanternly.', location: '.env.local', provider: 'Example Store', scope: 'lanternly', status: 'live', archived: 0 };
/** A key with no scope, which the importer files with no project. */
const UNSCOPED = { id: 'registrar', name: 'Domain registrar login', kind: 'password', opens: 'The registrar account every domain renews through.', location: 'password manager', provider: 'Example Registrar', status: 'live', archived: 0 };

const RECORD_SRC = /[\\/]packages[\\/]record[\\/]src[\\/]index\.ts$/;
const SEALING_SRC = /[\\/]packages[\\/]host[\\/]src[\\/]sealing\.ts$/;

/**
 * The scratch rewrites, each of one line, that `VAULT_ROW_MUTANT` builds the Worker with: the two the red was measured
 * with, and `break-view`, the `view` line before its repair, so the last case can still be watched going red.
 *
 * WRITTEN AS THE WHOLE LINE, so a reshuffle that moves or rewords it makes the build throw here and never quietly builds
 * the unmutated Worker under a mutant's name.
 */
const MUTANTS: Record<string, { file: RegExp; from: string; to: string }> = {
  'no-credential': {
    file: RECORD_SRC,
    from: "const row = named === '' ? keyFor({ label }, grant) : keyFor({ credential: named }, grant);",
    to: 'const row = keyFor({ label }, grant);',
  },
  'no-reach': { file: RECORD_SRC, from: "return grant.scope === '*' ? project === null : project === grant.scope;", to: 'return true;' },
  /* THE LINE BEFORE THE REPAIR, put back, so the last test can still be watched going red: `view` without its
     `ArrayBuffer` branch empties every BLOB the Durable Object hands back. */
  'break-view': {
    file: SEALING_SRC,
    from: '  bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : Uint8Array.from(bytes);',
    to: '  bytes.buffer instanceof ArrayBuffer ? (bytes as Bytes) : Uint8Array.from(bytes as Uint8Array);',
  },
};
const mutant = process.env.VAULT_ROW_MUTANT;

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
let scratch = '';
/** Every answer of 500 or more this file was given, with its path and body. */
const fives: string[] = [];
let asked = 0;

function tally(res: Response, what: string): Promise<Response> | Response {
  asked++;
  return res.status >= 500 ? res.clone().text().then((t) => (fives.push(`${String(res.status)} ${what}: ${t}`), res)) : res;
}

/** `fetch`, with every answer counted and each one of 500 or more kept. */
async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return tally(await fetch(input, init), String(input));
}

/** A Keys row as the owner reads it back: its id, and the fields that say where it is and whether it holds a value. */
type KeyRow = { id: string; label: string; project: string | null; value: string | null; tags: string[] };

type Held = {
  owner: Client;
  slug: string;
  /** The project row the import made for Lanternly. */
  project: string;
  /** The imported Keys rows, in the order they were created. */
  imported: KeyRow[];
  /** A vault grant for `scope`, through the device flow and the owner's approval. */
  grant(scope: string): Promise<string>;
  /** `braindog keys put`, run with `value` on standard input and this grant in the hosts file. */
  put(label: string, scope: string, bearer: string, value: string, opens?: string): Promise<{ exit: number; said: string[] }>;
  /** `braindog keys exec <label> -- run`, and the value the command would have been started with, if any. */
  exec(label: string, scope: string, bearer: string): Promise<{ exit: number; said: string[]; handed: string | undefined }>;
  rows(): Promise<KeyRow[]>;
};

let made = 0;
/** One record, provisioned, claimed, set up with Solo founder and Agents, and holding the import's rows for `creds`. */
async function record(creds: Record<string, unknown>[]): Promise<Held> {
  const slug = `vault-row-${String(++made)}`;
  const provisioned = await counted(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug, email: `${slug}@example.test`, name: 'Vault' }),
  });
  const out = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(out));
  const redeemed = await counted(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: out.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  const cookie = set.split(';')[0]!;
  const owner = createClient({
    base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return counted(input, { ...init, headers: sent });
    },
  });
  for (const pack of ['usecase-founder', 'agents']) {
    const filed = await owner.call<{ id: string }>('propose', { question: `Install ${pack}?`, body_kind: 'pack', body: { install: pack } });
    assert.ok(filed.ok, `${pack} could not be offered on the Worker: ${JSON.stringify(filed)}`);
    const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the vault case needs it' } });
    assert.ok(accepted.ok, `${pack} would not install on the Worker: ${JSON.stringify(accepted)}`);
  }

  /* THE PLAN THE COMMAND WOULD APPLY, with the export's key list replaced by this case's. */
  const exported = { ...syntheticExport(), credentials: creds };
  const read = readLegacyTool(JSON.stringify(exported));
  const setup = readSetup(JSON.stringify(syntheticSetup()));
  assert.ok(read.ok && setup.ok);
  const plan = planLegacyTool(read.value, TODAY, setup.value);
  const planned = plan.rows.filter((r) => r.register === 'credentials');
  assert.equal(planned.length, creds.length, `the plan kept ${String(planned.length)} of ${String(creds.length)} keys`);

  /* THE PROJECT ROW AS PLANNED, WITH THE IMPORT'S TAG, less the fields that point at other rows this file does not make:
     no deposit reads them. `applyPlan` resolves a `$ref` to the id of the row created under that key, and so does this. */
  const ids = new Map<string, string>();
  const lanternly = plan.rows.find((r) => r.register === 'things' && r.key.endsWith(':lanternly'));
  assert.ok(lanternly, 'the plan has no project row for lanternly');
  const pointsElsewhere = (v: unknown) => isRef(v) || (Array.isArray(v) && v.some(isRef));
  const own = Object.entries(lanternly.fields as Record<string, unknown>).filter(([, v]) => !pointsElsewhere(v));
  const project = await owner.create({ register: 'things', fields: { ...Object.fromEntries(own), tags: [lanternly.key] } });
  assert.ok(project.ok, JSON.stringify(project));
  ids.set(lanternly.key, (project.value as { id: string }).id);
  const order: string[] = [];
  for (const row of planned) {
    const fields = Object.fromEntries(
      Object.entries(row.fields as Record<string, unknown>).map(([k, v]) => [k, isRef(v) ? (ids.get(v.$ref) ?? assert.fail(`${row.key} names ${v.$ref}`)) : v]),
    );
    const created = await owner.create({ register: 'credentials', fields: { ...fields, tags: [row.key] } });
    assert.ok(created.ok, `${row.key} could not be created as the import creates it: ${JSON.stringify(created)}`);
    order.push((created.value as { id: string }).id);
  }

  const rows = async (): Promise<KeyRow[]> => {
    const got = await owner.list({ register: 'credentials', limit: 50 });
    assert.ok(got.ok, JSON.stringify(got));
    return got.value.rows.map((raw) => {
      const r = raw as { id: string; fields: Record<string, unknown> };
      return {
        id: r.id,
        label: String(r.fields.label),
        project: typeof r.fields.project === 'string' ? r.fields.project : null,
        value: typeof r.fields.value === 'string' ? r.fields.value : null,
        tags: Array.isArray(r.fields.tags) ? (r.fields.tags as string[]) : [],
      };
    });
  };
  /* IN THE ORDER THEY WERE MADE, which is the order a label lookup tries them in (`keyFor`, `ORDER BY seq`). The list
     answers newest first, and the first run of this file read the two rows the wrong way round because of it. */
  const listed = await rows();
  const imported = order.map((id) => listed.find((k) => k.id === id) ?? assert.fail(`${id} is not listed`));
  assert.equal(listed.length, creds.length);
  const hosts = join(scratch, `${slug}-hosts.json`);

  return {
    owner,
    slug,
    project: (project.value as { id: string }).id,
    imported,
    rows,
    grant: async (scope) => {
      /* AT THE PUBLIC NAME, as the header says, and with no `Origin`, as a CLI sends it. */
      const started = await tally(
        await mf!.dispatchFetch(`${ORIGIN}/auth/device`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, reach: 'vault', label: 'test-laptop · braindog-cli', scope }),
        }),
        '/auth/device',
      );
      const code = (await started.json()) as { ok: boolean; value?: { device_code: string; user_code: string } };
      assert.equal(started.status, 200, JSON.stringify(code));
      const approved = await owner.call('deviceApprove', { user_code: code.value!.user_code });
      assert.ok(approved.ok, `the owner could not approve the vault grant: ${JSON.stringify(approved)}`);
      const exchanged = await counted(`${base}/auth/device/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, device_code: code.value!.device_code }),
      });
      const taken = (await exchanged.json()) as { ok: boolean; value?: { bearer: string; reach: string } };
      assert.equal(exchanged.status, 200, JSON.stringify(taken));
      assert.equal(taken.value!.reach, 'vault');
      return taken.value!.bearer;
    },
    put: async (label, scope, bearer, value, opens) => {
      holding(scope, bearer);
      const said: string[] = [];
      const exit = await keys(['put', label, '--host', base, '--vault', scope, ...(opens === undefined ? [] : ['--opens', opens])], {
        file: hosts,
        env: {},
        stdin: () => `${value}\n`,
        say: (line) => void said.push(line),
        headers: async () => ({}),
        spawn: () => Promise.reject(new Error('put starts no command')),
        fetch: counted,
      });
      return { exit, said };
    },
    exec: async (label, scope, bearer) => {
      holding(scope, bearer);
      const said: string[] = [];
      let handed: string | undefined;
      /* THE SPAWNER IS THE ONE DOUBLE, and only so that nothing is started: what it is handed is what a real command's
         environment would hold. `linux` so the Windows PATH search is not what this case is about. */
      const exit = await keys(['exec', label, '--as', 'THE_KEY', '--host', base, '--vault', scope, '--', 'run'], {
        file: hosts,
        env: {},
        stdin: () => null,
        say: (line) => void said.push(line),
        headers: async () => ({}),
        spawn: async (_command, _args, vars) => ((handed = vars.THE_KEY), 0),
        platform: 'linux',
        fetch: counted,
      });
      return { exit, said, handed };
    },
  };

  /** THE HOSTS FILE `braindog login --vault` WRITES, with this one grant in it. */
  function holding(scope: string, bearer: string): void {
    writeFileSync(hosts, JSON.stringify({ hosts: { [base]: { vault: { [scope]: { value: bearer, expires: '2099-01-01T00:00:00.000Z' } } } } }));
  }
}

/**
 * Which rows hold a sealed value, by row id. A deposit points the row's `value` at the grant it bound (`g_...`), and
 * that is how the Keys list and the Vault screen tell a sealed key from an empty one.
 */
const sealed = (rows: KeyRow[]): Record<string, boolean> => Object.fromEntries(rows.map((k) => [k.id, /^g_/.test(k.value ?? '')]));

before(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'braindog-vault-imported-row-'));
  const rewrite = mutant === undefined ? undefined : MUTANTS[mutant];
  if (mutant !== undefined && rewrite === undefined) throw new Error(`VAULT_ROW_MUTANT names no mutant: ${mutant}`);
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
    plugins:
      rewrite === undefined
        ? []
        : [
            {
              name: 'vault-row-mutant',
              setup(b: { onLoad: Function }) {
                b.onLoad({ filter: rewrite.file }, (args: { path: string }) => {
                  const text = readFileSync(args.path, 'utf8');
                  if (text.split(rewrite.from).length !== 2) throw new Error(`the ${String(mutant)} line is not in ${args.path} exactly once`);
                  return { contents: text.replace(rewrite.from, rewrite.to), loader: 'ts' };
                });
              },
            },
          ],
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
      bindings: { PUBLIC_HOST: HOST, SESSION_SECRET, PROVISION_KEY, KEK, BRAINDOG_BUILD: '' },
    }),
  );
  base = (await mf.ready).origin;
});

after(async () => {
  await mf?.dispose();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

test('THE IMPORT MADE THE TWO ROWS THIS FILE IS ABOUT: one with a project and one with none, both tagged, neither sealed', async () => {
  /* OR EVERY CASE BELOW WOULD BE ABOUT ROWS THE IMPORT NEVER MAKES. */
  const r = await record([SCOPED, UNSCOPED]);
  assert.deepEqual(
    r.imported.map((k) => ({ label: k.label, project: k.project, value: k.value, tags: k.tags })),
    [
      { label: SCOPED.name, project: r.project, value: null, tags: ['legacy:credential:store-api'] },
      { label: UNSCOPED.name, project: null, value: null, tags: ['legacy:credential:registrar'] },
    ],
  );
});

test("THE PERSON'S DEPOSIT NAMING THE ROW SEALS ONTO THAT ROW, and Keys still holds two rows", async () => {
  const r = await record([SCOPED, UNSCOPED]);
  const [scoped, unscoped] = r.imported;
  /* THE REPLACE SHEET'S OWN BODY, `saveKey` in `routes/vault/+page.svelte`. */
  const put = await r.owner.putKey({ label: scoped!.label, opens: SCOPED.opens, credential: scoped!.id, value: fake() });
  assert.ok(put.ok, JSON.stringify(put));
  assert.deepEqual({ version: put.value.version, rotated: put.value.rotated }, { version: 1, rotated: false });
  const after = await r.rows();
  assert.equal(after.length, 2, JSON.stringify(after));
  assert.deepEqual(sealed(after), { [scoped!.id]: true, [unscoped!.id]: false });
});

test('WHEN TWO ROWS SHARE A LABEL, THE PERSON SEALS THE ONE NAMED and not the first of that label', async () => {
  /* WHAT THE NAME IS FOR, and the only case the name decides: with labels that differ, the label finds the same row. */
  const r = await record([UNSCOPED, { ...SCOPED, name: UNSCOPED.name }]);
  const [first, second] = r.imported;
  assert.equal(first!.label, second!.label);
  const put = await r.owner.putKey({ label: second!.label, opens: SCOPED.opens, credential: second!.id, value: fake() });
  assert.ok(put.ok, JSON.stringify(put));
  const after = await r.rows();
  assert.equal(after.length, 2);
  assert.deepEqual(sealed(after), { [first!.id]: false, [second!.id]: true }, 'the first row of that label was sealed instead');
});

test('KEYS PUT UNDER A * GRANT, BY THE LABEL OF A ROW WITH A PROJECT: refused without --opens, and a THIRD ROW with it', async () => {
  /* A MEASUREMENT, PINNED AS IT ANSWERED ON 23 SEPTEMBER. The row is out of a `*` grant's reach, so to that grant there
     is no row of that label, and a deposit with no row is a new key, which needs `opens`. */
  const r = await record([SCOPED, UNSCOPED]);
  const [scoped, unscoped] = r.imported;
  const bearer = await r.grant('*');
  const refused = await r.put(SCOPED.name, '*', bearer, fake());
  assert.deepEqual(refused, { exit: 1, said: ['A new key says what it opens, such as a host or an account.'] });
  assert.equal((await r.rows()).length, 2, 'the refusal wrote a row');

  const third = await r.put(SCOPED.name, '*', bearer, fake(), SCOPED.opens);
  assert.equal(third.exit, 0, third.said.join('\n'));
  assert.match(third.said[0] ?? '', /^deposited credentials#3 on .* · version 1$/u);
  const after = await r.rows();
  const added = after.filter((k) => k.id !== scoped!.id && k.id !== unscoped!.id);
  assert.deepEqual(
    added.map((k) => ({ label: k.label, project: k.project, tags: k.tags })),
    [{ label: SCOPED.name, project: null, tags: [] }],
    'a third row of the same label, with no project and no import tag',
  );
  assert.deepEqual(sealed(after), { [scoped!.id]: false, [unscoped!.id]: false, [added[0]!.id]: true }, 'the imported row was filled after all');
});

test("KEYS PUT UNDER THE PROJECT'S OWN GRANT, BY THE LABEL OF ITS ROW, SEALS ONTO THAT ROW", async () => {
  const r = await record([SCOPED, UNSCOPED]);
  const [scoped, unscoped] = r.imported;
  const bearer = await r.grant(r.project);
  const put = await r.put(SCOPED.name, r.project, bearer, fake());
  assert.equal(put.exit, 0, put.said.join('\n'));
  assert.match(put.said[0] ?? '', /^deposited credentials#1 on .* · version 1$/u);
  const after = await r.rows();
  assert.equal(after.length, 2, JSON.stringify(after));
  assert.deepEqual(sealed(after), { [scoped!.id]: true, [unscoped!.id]: false });
});

test("WHEN TWO ROWS SHARE A LABEL, THE PROJECT'S GRANT SEALS ITS OWN, and not the row of no project before it", async () => {
  const r = await record([UNSCOPED, { ...SCOPED, name: UNSCOPED.name }]);
  const [first, second] = r.imported;
  const bearer = await r.grant(r.project);
  const put = await r.put(second!.label, r.project, bearer, fake());
  assert.equal(put.exit, 0, put.said.join('\n'));
  const after = await r.rows();
  assert.equal(after.length, 2);
  assert.deepEqual(sealed(after), { [first!.id]: false, [second!.id]: true }, 'the row of no project was sealed instead');
});

test(
  /* RED UNTIL 23 SEPTEMBER: both reads answered WRONG_KEY "The sealed value did not open under this host key store."
     The Durable Object's SQLite hands a BLOB back as an ArrayBuffer, and `view` in packages/host/src/sealing.ts copied
     anything whose `.buffer` is not an ArrayBuffer with Uint8Array.from, which makes an ArrayBuffer an EMPTY array, so
     the nonce was zero bytes long and every decrypt failed. VAULT_ROW_MUTANT=break-view puts that line back. */
  'A VALUE SEALED ON THE WORKER OPENS AGAIN, for the person on the Vault screen and for keys exec',
  async () => {
    const r = await record([SCOPED, UNSCOPED]);
    const [scoped, unscoped] = r.imported;
    const bearer = await r.grant(r.project);
    const byAgent = fake();
    assert.equal((await r.put(SCOPED.name, r.project, bearer, byAgent)).exit, 0);
    const byPerson = fake();
    assert.ok((await r.owner.putKey({ label: unscoped!.label, opens: UNSCOPED.opens, credential: unscoped!.id, value: byPerson })).ok);

    const person = await r.owner.openKey({ credential: unscoped!.id });
    assert.deepEqual(person, { ok: true, value: { credential: 'credentials#2', label: UNSCOPED.name, value: byPerson } });
    const agent = await r.exec(SCOPED.name, r.project, bearer);
    assert.deepEqual(agent, { exit: 0, said: [], handed: byAgent });
    /* AND THE PERSON OPENS THE AGENT'S, since an owner reaches every key. */
    const across = await r.owner.openKey({ credential: scoped!.id });
    assert.equal(across.ok ? across.value.value : JSON.stringify(across), byAgent);
  },
);

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  /* AND IT WAS ASKED SOMETHING. Each record is about a dozen requests before its case deposits anything. */
  assert.ok(asked > 80, `${String(asked)} requests`);
  assert.deepEqual(fives, []);
});
