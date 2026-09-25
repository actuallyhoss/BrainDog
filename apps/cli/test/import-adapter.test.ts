/**
 * `braindog import <adapter> <export>` TAKES ANY ADAPTER, NOT ONE (`loop/research-legacy-parity.md` brief B2).
 *
 * The importer was one person's migration compiled into the command line: it took the one word naming his old record
 * and refused everything else, so another person's export had no door in at all, and the planner that read his
 * export's field names lived in `apps/cli`. `loop/DIRECTION.md` section 27 moves his record only once nothing in
 * `apps/` exists because he has it. So the command keeps the part that is anybody's (read every list, find each row by
 * its key, write what differs, remember the night) and takes the part that is one tool's from a file named on the line.
 *
 * RED FIRST, MEASURED ON 25 SEPTEMBER AGAINST `7140616f`: this file's adapter, twenty lines for an invented tool, was
 * refused with the command's usage, "braindog import takes legacy <export.json> ...", exit 1, and nothing was written.
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
  /* THE WRITE'S NOTE NAMES WHERE THE ROW CAME FROM IN THE ADAPTER'S OWN WORDS, and no other tool's. */
  assert.ok(!out.join('\n').includes('Sam'), out.join('\n'));

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

test('A PACK IS NAMED BY ITS ID, found in packs/ of the checkout the command runs from', async (t) => {
  const { io, said } = await setUp(t);
  /* THE DRAFT NEEDS NO HOST, so this reaches the adapter and stops short of writing: a pack id resolved from a folder
     that holds no packs/ of its own. The export is the tallybook one, and the answer is the the old tool adapter's own
     refusal of it, which only that adapter says. */
  assert.equal(await importCommand(['legacy-import', 'export.json', '--draft-setup'], io), 1);
  assert.deepEqual(said, ['The file is not a the old tool export: it has no db with projects in it. Export it again with packs/legacy-import/export.mjs.']);
});

/*
 * A CATALOGUE THAT TAKES THE CONNECTION AND NEVER ANSWERS COSTS ONE DEADLINE, NOT THE NIGHT.
 *
 * The offers used to be compiled in, so the import touched no address but the host's, and every request to the host
 * carries the budget. Resolving them in a catalogue added one more address, read with a bare `fetch`: no deadline, a
 * redirect followed anywhere, no cap on what came back, and plain http to any machine, where `pack install` reads the
 * same files through `readSource` with all four. Measured on 25 September before `addressCatalogue` read through it:
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
 * `braindog pack install` refuses both. Measured on 25 September before `packFrom` shared the install's checks: both
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
  assert.equal(await pack(['publish', 'bookshelf-1.0.0.pack.json', '--to', 'catalogue', '--sign', join(keys, 'k.json')], io), 0, said.join(' '));
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
  assert.equal(await pack(['publish', 'bookshelf-1.0.0.pack.json', '--to', 'catalogue', '--sign', join(keys, 'k.json')], io), 0, said.join(' '));
  const later = JSON.parse(readFileSync(join(io.cwd, 'bookshelf-1.0.0.pack.json'), 'utf8')) as Record<string, unknown>;
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
 * in any of them ended the command in a bare stack naming neither the adapter nor the file. Measured on 25 September
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
 * Runs have named their adapter since adapters were named on the line; the nights before that were the one importer's,
 * the the old tool one. `mine` took a night with no source as every adapter's, so the first morning read of any other
 * adapter was handed his nights as its own. Measured on 25 September before `unsourced`: the Tallybook read below said
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
