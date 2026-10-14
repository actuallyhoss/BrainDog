/**
 * `braindog import <adapter> <export>` TAKES ANY ADAPTER, NOT ONE.
 *
 * The command keeps the part that is anybody's (read every list, find each row by its key, write what differs,
 * remember the night) and takes the part that is one tool's from a file named on the line, so another person's export
 * has a door in and no planner for one tool's field names lives in `apps/cli`.
 *
 * RED FIRST: before this, this file's adapter, twenty lines for an invented tool, was refused with the command's usage,
 * exit 1, and nothing was written.
 *
 * THE KERNEL ANSWERS, over HTTP as a host would, because what the record holds after the run is the fact.
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import type { AgentIo } from '../src/skills.ts';
import { importCommand } from '../src/import.ts';

const ACTOR = 'p_1';
const NOW = Date.UTC(2026, 8, 25, 9);

/** The fixture adapter, by its path, as a person names an adapter of their own. */
const ADAPTER = fileURLToPath(new URL('./fixtures/tallybook/adapter.ts', import.meta.url));

const EXPORT = {
  saved: '2026-09-24T20:00:00.000Z',
  items: [
    { id: 'a1', what: 'Renew the workshop lease', due: '2026-10-01' },
    { id: 'a2', what: 'Send the October invoices', due: '2026-10-03' },
  ],
};

type Call = (args: Record<string, unknown>) => Promise<unknown>;

/** The kernel on node:http, answering the methods the importer calls the way a host does. */
async function host(kernel: Kernel): Promise<{ server: Server; base: string }> {
  const calls: Record<string, Call> = {
    schema: async (a) => {
      const decl = kernel.register(String(a.register));
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${String(a.register)}.` } };
    },
    list: async (a) => kernel.list({ register: String(a.register), ...(a.limit === undefined ? {} : { limit: Number(a.limit) }), ...(typeof a.cursor === 'string' ? { cursor: a.cursor } : {}), includeDeleted: a.includeDeleted === true } as never),
    create: async (a) => kernel.create(String(a.register), a.fields as never, { actor: ACTOR }),
    update: async (a) => kernel.update(String(a.register), `${String(a.register)}#${String(a.seq)}`, a.patch as never, { actor: ACTOR, ...(typeof a.version === 'number' ? { version: a.version } : {}) }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async (a) => kernel.propose(a as never, ACTOR),
    handoff: async () => ({ ok: true, value: {} }),
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

async function setUp(t: { after: (fn: () => unknown) => void }) {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const { server, base } = await host(kernel);
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  t.after(() => sql.close());
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-adapter-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'export.json'), JSON.stringify(EXPORT));
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env: { BRAINDOG_HOST: base, BRAINDOG_HOSTS: join(dir, 'hosts.json') } as never, cwd: dir, home: dir, out: (l) => out.push(l), say: (l) => said.push(l), headers: async () => ({}) };
  return { kernel, io, out, said };
}

const whats = async (kernel: Kernel): Promise<string[]> => {
  const got = await kernel.list({ register: 'tasks', limit: 100 });
  assert.ok(got.ok);
  return got.value.rows.filter((r) => Array.isArray(r.fields.tags) && (r.fields.tags as string[]).some((x) => x.startsWith('tallybook:'))).map((r) => String(r.fields.what)).sort();
};

test('AN ADAPTER NAMED BY ITS PATH IS TAKEN, and its rows arrive under its own key, found again on the second run', async (t) => {
  const { kernel, io, out, said } = await setUp(t);
  const now = () => new Date(NOW);
  const utc = () => 0;

  const first = await importCommand([ADAPTER, 'export.json'], io, undefined, now, utc);
  assert.equal(first, 0, [...said, ...out].join(' | '));
  assert.deepEqual(await whats(kernel), ['Renew the workshop lease', 'Send the October invoices']);
  assert.ok(out.includes('Tasks: 2 added, 0 updated, 0 unchanged.'), out.join(' | '));

  out.length = 0;
  assert.equal(await importCommand([ADAPTER, 'export.json'], io, undefined, now, utc), 0, [...said, ...out].join(' | '));
  assert.ok(out.includes('Tasks: 0 added, 0 updated, 2 unchanged.'), out.join(' | '));
  assert.equal((await whats(kernel)).length, 2, 'the second run added a second copy');
});

test('THE MORNING READ NAMES THE ADAPTER, and says what moved in the words of the tool it came from', async (t) => {
  const { io, out, said } = await setUp(t);
  const now = () => new Date(NOW);
  assert.equal(await importCommand([ADAPTER, 'export.json'], io, undefined, now, () => 0), 0, [...said, ...out].join(' | '));
  out.length = 0;
  assert.equal(await importCommand([ADAPTER, '--since', 'last'], io, undefined, now, () => 0), 0, [...said, ...out].join(' | '));
  assert.ok(out.some((l) => /^- Created in Tasks: Renew the workshop lease, Send the October invoices\.$/u.test(l)), out.join(' | '));
});

test('AN ADAPTER THAT IS NOT ONE IS REFUSED BY NAME, before anything is read or sent', async (t) => {
  const { io, said } = await setUp(t);
  const dir = mkdtempSync(join(tmpdir(), 'bd-import-not-adapter-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'adapter.ts'), 'export default { source: "Nothing" };\n');
  assert.equal(await importCommand([join(dir, 'adapter.ts'), 'export.json'], io), 1);
  assert.ok(said.some((l) => /is not an import adapter/u.test(l)), said.join(' | '));
});

test('--MAP IS READ IN PLACE OF THE ADAPTER\'S OWN, so a person renames a list without touching the adapter', async (t) => {
  const { kernel, io, out, said } = await setUp(t);
  writeFileSync(join(io.cwd, 'map.json'), JSON.stringify({ targets: { order: ['tasks'], names: { tasks: 'Chores' }, providedBy: { tasks: 'Tasks' } } }));
  assert.equal(await importCommand([ADAPTER, 'export.json', '--map', 'map.json'], io, undefined, () => new Date(NOW), () => 0), 0, [...said, ...out].join(' | '));
  assert.ok(out.includes('Chores: 2 added, 0 updated, 0 unchanged.'), out.join(' | '));
  assert.equal((await whats(kernel)).length, 2);

  /* A MAP THAT LEAVES A LIST UNNAMED IS REFUSED BEFORE ANYTHING IS SENT, because every line of the report names a list. */
  writeFileSync(join(io.cwd, 'bad.json'), JSON.stringify({ targets: { order: ['tasks'], names: {}, providedBy: {} } }));
  said.length = 0;
  assert.equal(await importCommand([ADAPTER, 'export.json', '--map', 'bad.json'], io, undefined, () => new Date(NOW), () => 0), 1);
  assert.ok(said.some((l) => l.includes('tasks')), said.join(' | '));
});

test('A PACK IS NAMED BY ITS ID, found in packs/ of the folder the command runs from', async (t) => {
  const { kernel, io, out, said } = await setUp(t);
  /* THE FIXTURE ADAPTER, SAT AS A PACK SITS: `packs/<id>/adapter.ts` with its `map.json` beside it, named by the id
     alone, so the command resolves the folder and not a path. */
  const pack = join(io.cwd, 'packs', 'tallybook');
  mkdirSync(pack, { recursive: true });
  for (const name of ['adapter.ts', 'map.json']) writeFileSync(join(pack, name), readFileSync(fileURLToPath(new URL(`./fixtures/tallybook/${name}`, import.meta.url)), 'utf8'));
  assert.equal(await importCommand(['tallybook', 'export.json'], io, undefined, () => new Date(NOW), () => 0), 0, [...said, ...out].join(' | '));
  assert.deepEqual(await whats(kernel), ['Renew the workshop lease', 'Send the October invoices']);
});

/*
 * A CATALOGUE THAT TAKES THE CONNECTION AND NEVER ANSWERS COSTS ONE DEADLINE, NOT THE NIGHT.
 *
 * The offers used to be compiled in, so the import touched no address but the host's, and every request to the host
 * carries the budget. Resolving them in a catalogue added one more address, read with a bare `fetch`: no deadline, a
 * redirect followed anywhere, no cap on what came back, and plain http to any machine, where `pack install` reads the
 * same files through `readSource` with all four. Measured before `addressCatalogue` read through it:
 * this test ran out its ten seconds with the import still waiting on the first read of `index.json`.
 */
test('A CATALOGUE THAT NEVER ANSWERS IS GIVEN UP ON AT THE BUDGET, and the offer is said as not filed', { timeout: 10_000 }, async (t) => {
  const { io, out, said } = await setUp(t);
  const silent = createServer(() => undefined);
  await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
  t.after(
    () =>
      new Promise<void>((r) => {
        silent.closeAllConnections();
        silent.close(() => r());
      }),
  );
  const catalogue = `http://127.0.0.1:${String((silent.address() as AddressInfo).port)}/`;
  /* THE FIXTURE, OFFERING ONE PACK, so the import has something to look up. */
  writeFileSync(
    join(io.cwd, 'offering.ts'),
    `import base from ${JSON.stringify(new URL('./fixtures/tallybook/adapter.ts', import.meta.url).href)};\n` +
      `export default { ...base, offers: () => [{ install: 'holdings', name: 'Holdings', question: 'Install Holdings?', says: 'The holdings it kept' }] };\n`,
  );
  writeFileSync(join(io.cwd, 'map.json'), JSON.stringify({ targets: { order: ['tasks'], names: { tasks: 'Tasks' }, providedBy: { tasks: 'Tasks' } } }));
  (io.env as Record<string, string>).BRAINDOG_TIMEOUT_MS = '300';
  const code = await importCommand([join(io.cwd, 'offering.ts'), 'export.json', '--catalogue', catalogue], io, undefined, () => new Date(NOW), () => 0);
  assert.equal(code, 0, [...said, ...out].join(' | '));
  assert.ok([...said, ...out].some((l) => l.includes('The holdings it kept (the holdings pack) was not filed on Decide')), [...said, ...out].join(' | '));
});

/*
 * AN OFFER IS HELD TO WHAT `pack install` HOLDS A PACK TO, NOT ONLY ITS CHECKSUM.
 *
 * `packFrom` read the index, the checksum and the entry, and stopped there, so a version signed by a key its author had
 * revoked, or one whose signature was stripped after signed versions, was filed on Decide by the import where
 * `braindog pack install` refuses both. Measured before `packFrom` shared the install's checks: both
 * runs below filed the pack ("Packs: 1 filed on Decide"), and neither said why it should not have been.
 */
async function offering(io: AgentIo, id: string): Promise<string> {
  const file = join(io.cwd, 'offering.ts');
  writeFileSync(
    file,
    `import base from ${JSON.stringify(new URL('./fixtures/tallybook/adapter.ts', import.meta.url).href)};\n` +
      `export default { ...base, offers: () => [{ install: ${JSON.stringify(id)}, name: 'Bookshelf', question: 'Install Bookshelf?', says: 'The shelf it kept' }] };\n`,
  );
  writeFileSync(join(io.cwd, 'map.json'), JSON.stringify({ targets: { order: ['tasks'], names: { tasks: 'Tasks' }, providedBy: { tasks: 'Tasks' } } }));
  return file;
}

test('AN OFFER SIGNED BY A REVOKED KEY IS NOT FILED, as pack install refuses it', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const { io, out, said } = await setUp(t);
  const keys = join(io.cwd, 'keys');
  assert.equal(await pack(['key', join(keys, 'k.json'), '--author', 'Halden'], io), 0, said.join(' '));
  const keyId = (JSON.parse(readFileSync(join(keys, 'k.json'), 'utf8')) as { key_id: string }).key_id;
  assert.equal(await pack(['new', 'bookshelf', '--author', 'Halden'], io), 0, said.join(' '));
  assert.equal(await pack(['publish', 'bookshelf', '--to', 'catalogue', '--sign', join(keys, 'k.json')], io), 0, said.join(' '));
  assert.equal(await pack(['key', 'revoke', join(keys, 'k.json'), '--to', 'catalogue', '--reason', 'Copied off a shared machine.'], io), 0, said.join(' '));
  const adapter = await offering(io, 'bookshelf');
  out.length = 0;
  said.length = 0;
  const code = await importCommand([adapter, 'export.json', '--catalogue', 'catalogue'], io, undefined, () => new Date(NOW), () => 0);
  const all = [...said, ...out].join(' | ');
  assert.equal(code, 0, all);
  assert.ok(
    [...said, ...out].some((l) => l.includes(`The shelf it kept (the bookshelf pack) was not filed on Decide: Bookshelf 1.0.0 is signed by key ${keyId}, which its author revoked, so it is not trusted.`)),
    all,
  );
});

test('AN OFFER WHOSE SIGNATURE WAS STRIPPED AFTER SIGNED VERSIONS IS NOT FILED, as pack install refuses it', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const { io, out, said } = await setUp(t);
  const keys = join(io.cwd, 'keys');
  assert.equal(await pack(['key', join(keys, 'k.json'), '--author', 'Halden'], io), 0, said.join(' '));
  const keyId = (JSON.parse(readFileSync(join(keys, 'k.json'), 'utf8')) as { key_id: string }).key_id;
  assert.equal(await pack(['new', 'bookshelf', '--author', 'Halden'], io), 0, said.join(' '));
  assert.equal(await pack(['publish', 'bookshelf', '--to', 'catalogue', '--sign', join(keys, 'k.json')], io), 0, said.join(' '));
  const later = JSON.parse(readFileSync(join(io.cwd, 'bookshelf', 'bookshelf.pack.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(io.cwd, 'bookshelf-1.0.1.pack.json'), JSON.stringify({ ...later, version: '1.0.1', summary: `${String(later.summary)} Kept tidy.` }));
  assert.equal(await pack(['publish', 'bookshelf-1.0.1.pack.json', '--to', 'catalogue', '--sign', join(keys, 'k.json')], io), 0, said.join(' '));
  const path = join(io.cwd, 'catalogue', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as { entries: { versions: Record<string, unknown>[] }[] };
  delete index.entries[0]!.versions[0]!.signature;
  writeFileSync(path, JSON.stringify(index));
  const adapter = await offering(io, 'bookshelf');
  out.length = 0;
  said.length = 0;
  const code = await importCommand([adapter, 'export.json', '--catalogue', 'catalogue'], io, undefined, () => new Date(NOW), () => 0);
  const all = [...said, ...out].join(' | ');
  assert.equal(code, 0, all);
  assert.ok(
    [...said, ...out].some((l) => l.includes(`The shelf it kept (the bookshelf pack) was not filed on Decide: Bookshelf 1.0.1 is unsigned, and earlier versions were signed by key ${keyId}.`)),
    all,
  );
});

/*
 * WHAT AN ADAPTER THROWS IS SAID AS ITS REFUSAL, NAMING IT, AND NOTHING IS SENT.
 *
 * `plan` was wrapped and `read`, `readSetup`, `draftSetup`, `offers` and `settled` were not, so an adapter that threw
 * in any of them ended the command in a bare stack naming neither the adapter nor the file. Measured
 * before `ask` wrapped them: each case below rejected `importCommand` with the adapter's own error.
 */
test('AN ADAPTER THAT THROWS IS REFUSED BY NAME, whichever of its parts threw, and nothing is written', async (t) => {
  const cases: { part: string; args: string[]; says: RegExp }[] = [
    { part: 'read', args: [], says: /^The Tallybook adapter could not read export\.json: read broke$/u },
    { part: 'readSetup', args: ['--setup', 'setup.json'], says: /^The Tallybook adapter could not read setup\.json: readSetup broke$/u },
    { part: 'draftSetup', args: ['--draft-setup'], says: /^The Tallybook adapter could not draft a setup file from export\.json: draftSetup broke$/u },
    { part: 'offers', args: [], says: /^The Tallybook adapter could not say which packs export\.json offers: offers broke$/u },
    { part: 'settled', args: [], says: /^The Tallybook adapter could not say which questions export\.json has settled: settled broke$/u },
  ];
  for (const c of cases) {
    const { kernel, io, out, said } = await setUp(t);
    writeFileSync(join(io.cwd, 'setup.json'), '{}');
    writeFileSync(
      join(io.cwd, 'throwing.ts'),
      `import base from ${JSON.stringify(new URL('./fixtures/tallybook/adapter.ts', import.meta.url).href)};\n` +
        `export default { ...base, readSetup: () => ({ ok: true, value: {} }), draftSetup: () => ({}), ${c.part}: () => { throw new Error(${JSON.stringify(`${c.part} broke`)}); } };\n`,
    );
    writeFileSync(join(io.cwd, 'map.json'), JSON.stringify({ targets: { order: ['tasks'], names: { tasks: 'Tasks' }, providedBy: { tasks: 'Tasks' } } }));
    const code = await importCommand([join(io.cwd, 'throwing.ts'), 'export.json', ...c.args], io, undefined, () => new Date(NOW), () => 0);
    assert.equal(code, 1, `${c.part}: ${[...said, ...out].join(' | ')}`);
    assert.ok(said.some((l) => c.says.test(l)), `${c.part}: ${said.join(' | ')}`);
    assert.deepEqual(await whats(kernel), [], `${c.part}: something was written`);
  }
});

/*
 * A NIGHT REMEMBERED WITH NO SOURCE IS THE ADAPTER'S THAT SAYS `unsourced`, AND NO OTHER'S.
 *
 * Runs have named their adapter since adapters were named on the line; the nights before that were the one importer's
 * that came first. `mine` took a night with no source as every adapter's, so the first morning read of any other
 * adapter was handed that importer's nights as its own. Measured before `unsourced`: the Tallybook read below said
 * "Created in Tasks: A night before sources" and ended 0.
 */
test('A NIGHT WITH NO SOURCE IS READ ONLY BY THE ADAPTER THAT SAYS IT WROTE THOSE, not by every adapter', async (t) => {
  const { io, out, said } = await setUp(t);
  mkdirSync(join(io.home, '.braindog'), { recursive: true });
  const night = { at: '2026-09-20T01:00:00.000Z', host: 'rehearsal.example', file: 'export.json', taken: null, created: [{ register: 'tasks', label: 'A night before sources' }], updated: [], refused: [], skipped: [] };
  writeFileSync(join(io.home, '.braindog', 'imports.jsonl'), `${JSON.stringify(night)}\n`);
  writeFileSync(join(io.cwd, 'map.json'), JSON.stringify({ targets: { order: ['tasks'], names: { tasks: 'Tasks' }, providedBy: { tasks: 'Tasks' } } }));
  writeFileSync(
    join(io.cwd, 'older.ts'),
    `import base from ${JSON.stringify(new URL('./fixtures/tallybook/adapter.ts', import.meta.url).href)};\nexport default { ...base, source: 'Older', unsourced: true };\n`,
  );

  assert.equal(await importCommand([ADAPTER, '--since', 'last'], io, undefined, () => new Date(NOW), () => 0), 1, out.join(' | '));
  assert.deepEqual(said, ['No import run is remembered on this machine yet.']);
  assert.ok(!out.some((l) => l.includes('A night before sources')), out.join(' | '));

  said.length = 0;
  assert.equal(await importCommand([join(io.cwd, 'older.ts'), '--since', 'last'], io, undefined, () => new Date(NOW), () => 0), 0, said.join(' | '));
  assert.ok(out.includes('- Created in Tasks: A night before sources.'), out.join(' | '));
});

/*
 * AN ADD-ON'S ADAPTER BY ITS ID, FROM THE CATALOGUE, ASKED ABOUT ONCE.
 *
 * Before `adapter-fetch.ts`, an id was looked for only in a `packs/` folder of the working folder or the checkout, so
 * `braindog import ledgerline export.json` typed anywhere else said "neither a file nor a pack" and stopped. The
 * catalogue below is a folder `pack publish` filled, with the adapter beside the add-on and its checksum in the index.
 */

/** The fixture adapter as one plain module, its mapping inside it, as the catalogue carries one. */
const ADAPTER_MJS = (source = 'Tallybook'): string =>
  `const read = (text) => { const value = JSON.parse(text); return Array.isArray(value.items) ? { ok: true, value } : { ok: false, fix: 'A Tallybook export holds a list called items.' }; };\n` +
  `const plan = (exp, o) => ({ key: 'tallybook:', taken: typeof exp.saved === 'string' ? exp.saved : null, rev: null, rows: exp.items.map((item) => ({ register: 'tasks', key: 'tallybook:item:' + String(item.id), label: String(item.what), fields: { what: item.what, by: item.due ?? o.today } })), asks: [], polls: [], skipped: [], changed: [] });\n` +
  `export const map = { targets: { order: ['tasks'], names: { tasks: 'Tasks' }, providedBy: { tasks: 'Tasks' } } };\n` +
  `export default { source: ${JSON.stringify(source)}, key: 'tallybook:', read, plan };\n`;

const sha = async (text: string): Promise<string> => (await import('node:crypto')).createHash('sha256').update(text, 'utf8').digest('hex');

/** `ledgerline` published to `catalogue/`, signed when `key` is given, with `body` as its adapter. */
async function published(io: AgentIo, said: string[], body: string, key?: string): Promise<{ catalogue: string; index: string }> {
  const { pack } = await import('../src/catalogue.ts');
  if (!readFileSafe(join(io.cwd, 'ledgerline', 'ledgerline.pack.json'))) assert.equal(await pack(['new', 'ledgerline', '--author', 'Halden'], io), 0, said.join(' '));
  assert.equal(await pack(['publish', 'ledgerline', '--to', 'catalogue', ...(key ? ['--sign', key] : [])], io), 0, said.join(' '));
  return withAdapter(io, body, key);
}

const readFileSafe = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** The adapter put beside the add-on in the catalogue, and its checksum (and signature, by `key`) written into the index. */
async function withAdapter(io: AgentIo, body: string, key?: string): Promise<{ catalogue: string; index: string }> {
  const catalogue = join(io.cwd, 'catalogue');
  const index = join(catalogue, 'index.json');
  const doc = JSON.parse(readFileSync(index, 'utf8')) as { entries: { id: string; versions: Record<string, unknown>[] }[] };
  const version = doc.entries.find((e) => e.id === 'ledgerline')!.versions[0]!;
  const checksum = await sha(body);
  let signature: unknown;
  if (key) {
    const { readAuthorKey, signVersion } = await import('@braindog/declare/catalogue');
    const k = await readAuthorKey(JSON.parse(readFileSync(key, 'utf8')));
    assert.ok(k.ok);
    const s = await signVersion(k.value, 'adapter', 'ledgerline', String(version.version), checksum);
    assert.ok(s.ok);
    signature = s.value;
  }
  version.adapter = { checksum, ...(signature ? { signature } : {}) };
  writeFileSync(index, JSON.stringify(doc));
  mkdirSync(join(catalogue, 'packs', 'ledgerline'), { recursive: true });
  writeFileSync(join(catalogue, 'packs', 'ledgerline', `${String(version.version)}.adapter.mjs`), body);
  return { catalogue, index };
}

/** A folder catalogue that counts what is read from it. */
const counted = async (dir: string): Promise<{ read: Map<string, number>; catalogue: import('../src/adapter.ts').CatalogueRead }> => {
  const { folderCatalogue } = await import('../src/adapter.ts');
  const inner = folderCatalogue(dir);
  const read = new Map<string, number>();
  return { read, catalogue: { where: inner.where, read: async (p) => (read.set(p, (read.get(p) ?? 0) + 1), inner.read(p)) } };
};

test('AN ADAPTER FETCHED FROM THE CATALOGUE IS KEPT, and the next run uses the kept copy without fetching it again', async (t) => {
  const { fetchAdapter, keptAdapter } = await import('../src/adapter-fetch.ts');
  const { io, said } = await setUp(t);
  const { catalogue: dir } = await published(io, said, ADAPTER_MJS());
  const { read, catalogue } = await counted(dir);
  const first = await fetchAdapter('ledgerline', { home: io.home, catalogue });
  assert.ok(first.ok, first.ok ? '' : first.fix);
  assert.equal(first.value.file, keptAdapter(io.home, 'ledgerline', '1.0.0'));
  assert.equal(readFileSync(first.value.file, 'utf8'), ADAPTER_MJS());
  assert.equal(read.get('packs/ledgerline/1.0.0.adapter.mjs'), 1);
  const second = await fetchAdapter('ledgerline', { home: io.home, catalogue });
  assert.ok(second.ok);
  assert.equal(read.get('packs/ledgerline/1.0.0.adapter.mjs'), 1, 'the kept copy was fetched again');
});

test('AN ADAPTER WHOSE CHECKSUM DIFFERS IS REFUSED, and nothing is kept', async (t) => {
  const { fetchAdapter, keptAdapter } = await import('../src/adapter-fetch.ts');
  const { io, said } = await setUp(t);
  const { catalogue: dir } = await published(io, said, ADAPTER_MJS());
  writeFileSync(join(dir, 'packs', 'ledgerline', '1.0.0.adapter.mjs'), ADAPTER_MJS('Swapped'));
  const got = await fetchAdapter('ledgerline', { home: io.home, catalogue: (await counted(dir)).catalogue });
  assert.ok(!got.ok);
  assert.match(got.fix, /^The import adapter of Ledgerline 1\.0\.0 is not the one the catalogue published: its checksum differs\./u);
  assert.equal(readFileSafe(keptAdapter(io.home, 'ledgerline', '1.0.0')), null);
});

test('AN ADD-ON WITH NO ADAPTER, OR A SIGNED ONE WHOSE ADAPTER IS NOT SIGNED, IS REFUSED IN WORDS', async (t) => {
  const { fetchAdapter } = await import('../src/adapter-fetch.ts');
  const { pack } = await import('../src/catalogue.ts');
  const { io, said } = await setUp(t);
  const key = join(io.cwd, 'keys', 'k.json');
  assert.equal(await pack(['key', key, '--author', 'Halden'], io), 0, said.join(' '));
  const { catalogue: dir, index } = await published(io, said, ADAPTER_MJS(), key);
  const { catalogue } = await counted(dir);
  assert.ok((await fetchAdapter('ledgerline', { home: io.home, catalogue })).ok, 'a signed adapter by the same key is taken');
  const doc = JSON.parse(readFileSync(index, 'utf8')) as { entries: { versions: { adapter?: { signature?: unknown } }[] }[] };
  delete doc.entries[0]!.versions[0]!.adapter!.signature;
  writeFileSync(index, JSON.stringify(doc));
  const unsigned = await fetchAdapter('ledgerline', { home: io.home, catalogue });
  assert.ok(!unsigned.ok && /is signed and its import adapter is not/u.test(unsigned.fix));
  delete doc.entries[0]!.versions[0]!.adapter;
  writeFileSync(index, JSON.stringify(doc));
  const none = await fetchAdapter('ledgerline', { home: io.home, catalogue });
  assert.ok(!none.ok && none.fix === 'Ledgerline 1.0.0 has no import adapter in the catalogue, so it cannot read a file for the import.');
});

const QUESTION = 'Run the import adapter of Ledgerline 1.0.0? It is a program and runs on this machine.';

test('AN ID THE CHECKOUT DOES NOT HOLD IS FETCHED AND ASKED ABOUT: a no runs nothing, a yes runs it and is kept', async (t) => {
  const { io, out, said } = await setUp(t);
  await published(io, said, ADAPTER_MJS());
  const asked: string[] = [];
  const run = (answer: boolean) => importCommand(['ledgerline', 'export.json', '--catalogue', 'catalogue'], { ...io, ask: async (q) => (asked.push(q), answer) }, undefined, () => new Date(NOW), () => 0);

  said.length = 0;
  assert.equal(await run(false), 1, [...said, ...out].join(' | '));
  assert.deepEqual(asked, [QUESTION]);
  assert.ok(said.includes('The import adapter of Ledgerline 1.0.0 was not run, and nothing was read or sent.'), said.join(' | '));
  assert.equal(readFileSafe(join(io.home, '.braindog', 'adapters.json')), null, 'a no was kept');

  asked.length = 0;
  assert.equal(await run(true), 0, [...said, ...out].join(' | '));
  assert.deepEqual(asked, [QUESTION]);
  assert.ok(out.includes('Tasks: 2 added, 0 updated, 0 unchanged.'), out.join(' | '));

  /* THE SECOND RUN DOES NOT ASK: the yes is kept by the file's hash. */
  asked.length = 0;
  out.length = 0;
  assert.equal(await run(false), 0, [...said, ...out].join(' | '));
  assert.deepEqual(asked, []);
  assert.ok(out.includes('Tasks: 0 added, 0 updated, 2 unchanged.'), out.join(' | '));
});

test('A CHANGED ADAPTER ASKS AGAIN, because the yes was for the file it was', async (t) => {
  const { io, out, said } = await setUp(t);
  await published(io, said, ADAPTER_MJS());
  const asked: string[] = [];
  const run = () => importCommand(['ledgerline', 'export.json', '--catalogue', 'catalogue', '--dry-run'], { ...io, ask: async (q) => (asked.push(q), true) }, undefined, () => new Date(NOW), () => 0);
  assert.equal(await run(), 0, [...said, ...out].join(' | '));
  assert.equal(asked.length, 1);
  await withAdapter(io, ADAPTER_MJS('Tallybook, kept tidier'));
  assert.equal(await run(), 0, [...said, ...out].join(' | '));
  assert.equal(asked.length, 2, 'a changed adapter ran on the yes given to the one before');
});

test('WITH NO TERMINAL AND NO --yes NOTHING RUNS, and --yes is the yes a script gives', async (t) => {
  const { kernel, io, out, said } = await setUp(t);
  await published(io, said, ADAPTER_MJS());
  const line = ['ledgerline', 'export.json', '--catalogue', 'catalogue'];
  said.length = 0;
  assert.equal(await importCommand(line, { ...io, ask: null }, undefined, () => new Date(NOW), () => 0), 1);
  assert.ok(said.some((l) => l.startsWith('The import adapter of Ledgerline 1.0.0 is a program and nobody has said yes to running it here.') && l.includes('--yes')), said.join(' | '));
  assert.deepEqual(await whats(kernel), []);
  assert.equal(await importCommand([...line, '--yes'], { ...io, ask: null }, undefined, () => new Date(NOW), () => 0), 0, [...said, ...out].join(' | '));
  assert.deepEqual(await whats(kernel), ['Renew the workshop lease', 'Send the October invoices']);
});
