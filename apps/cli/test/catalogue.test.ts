/**
 * The use-case SDK on this machine: `new` writes a file that checks, `publish` fills a catalogue folder and refuses a
 * version too small for its changes, `search` and `diff` send nothing, and `install --from` holds the file to its checksum
 * and only asks, against a stub record on node:http.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { usecase } from '../src/usecase.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-44ab'].join('.');
const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };

async function setup(t: { after: (fn: () => void | Promise<void>) => void }) {
  const seen: { method: string; args: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method, args: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'context') return res.end(JSON.stringify({ ok: true, value: CONTEXT }));
      if (method === 'propose') return res.end(JSON.stringify({ ok: true, value: { id: 'SG7' } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const dir = mkdtempSync(join(tmpdir(), 'braindog-sdk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_TOKEN: TOKEN };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { dir, io, out, said, seen };
}

test('new writes a starting file that checks, and never writes over one', async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['new', 'reading-club', '--author', 'Halden'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['check', 'reading-club-1.0.0.usecase.json'], h.io), 0, h.said.join('\n'));
  assert.ok(h.out.some((l) => /Reading club 1\.0\.0 reads as a use case: 1 lists, 1 pages/u.test(l)));
  assert.ok(h.out.some((l) => /Calls out to: nothing/u.test(l)));
  assert.equal(await usecase(['new', 'reading-club'], h.io), 1);
  assert.equal(await usecase(['new', 'Bad Id'], h.io), 1);
  assert.equal(h.seen.length, 0, 'new or check sent something');
});

test('publish fills a catalogue, refuses the same version and a bump too small, and search and diff read it', async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  const first = JSON.parse(readFileSync(join(h.dir, 'club-1.0.0.usecase.json'), 'utf8'));
  assert.equal(await usecase(['publish', 'club-1.0.0.usecase.json', '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['publish', 'club-1.0.0.usecase.json', '--to', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /same file.*\(ALREADY_KNOWN\)/u);

  /* 1.0.1 takes the page away: refused as a patch, published as 2.0.0. */
  const fewer = { ...first, version: '1.0.1', pack: { ...first.pack, declarations: first.pack.declarations.filter((d: { page?: string }) => d.page === undefined) } };
  writeFileSync(join(h.dir, 'club-1.0.1.usecase.json'), JSON.stringify(fewer));
  assert.equal(await usecase(['publish', 'club-1.0.1.usecase.json', '--to', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /Publish it as 2\.0\.0/u);
  writeFileSync(join(h.dir, 'club-2.0.0.usecase.json'), JSON.stringify({ ...fewer, version: '2.0.0' }));
  assert.equal(await usecase(['publish', 'club-2.0.0.usecase.json', '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.ok(h.out.some((l) => /Takes away: Club \(page\)/u.test(l)));

  const index = JSON.parse(readFileSync(join(h.dir, 'catalogue', 'index.json'), 'utf8'));
  assert.deepEqual(index.entries[0].versions.map((v: { version: string }) => v.version), ['2.0.0', '1.0.0']);
  assert.equal(index.entries[0].versions[0].bump, 'major');

  h.out.length = 0;
  assert.equal(await usecase(['search', 'club', '--from', 'catalogue'], h.io), 0);
  assert.match(h.out[0] ?? '', /^club {2}Club 2\.0\.0 by Halden/u);
  assert.ok(h.out.some((l) => /Unsigned: nothing says who published it/u.test(l)));
  h.out.length = 0;
  assert.equal(await usecase(['diff', 'club-1.0.0.usecase.json', 'club-2.0.0.usecase.json'], h.io), 0);
  assert.equal(h.out[0], '1.0.0 to 2.0.0 needs at least a major version.');
  assert.equal(h.seen.length, 0, 'publish, search or diff sent something');
});

test('install --from holds the file to its checksum, then only asks the owner', async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  assert.equal(await usecase(['publish', 'club-1.0.0.usecase.json', '--to', 'catalogue'], h.io), 0);
  assert.equal(await usecase(['install', 'club', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  const asked = h.seen.filter((s) => s.method !== 'context');
  assert.deepEqual(asked.map((s) => s.method), ['propose']);
  assert.equal(asked[0]?.args.body_kind, 'pack');
  assert.match(h.out.at(-1) ?? '', /Asked the owner: Install Club 1\.0\.0 from a catalogue\? Unsigned.* Nothing is installed until they accept it: .*\/decide\/SG7$/u);

  /* A file changed after it was published is refused, and nothing more is sent. */
  const path = join(h.dir, 'catalogue', 'usecases', 'club', '1.0.0.usecase.json');
  writeFileSync(path, readFileSync(path, 'utf8').replace('What Club is for', 'What Club is really for'));
  const before = h.seen.length;
  assert.equal(await usecase(['install', 'club', '--from', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /\(CHECKSUM_MISMATCH\)$/u);
  assert.equal(h.seen.length, before);
  assert.equal(await usecase(['install', 'nothing', '--from', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /It has: club\./u);
  assert.equal(await usecase(['install', 'club', '--version', '1.0.0'], h.io), 1);
});

test('key rotate lets a reader who trusted the old key trust the new one, and key revoke stops a version being asked for', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = await setup(t);
  const keys = join(h.dir, 'keys');
  assert.equal(await pack(['key', join(keys, 'old.json'), '--author', 'Halden'], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['key', join(keys, 'new.json'), '--author', 'Halden'], h.io), 0, h.said.join('\n'));
  const oldId = (JSON.parse(readFileSync(join(keys, 'old.json'), 'utf8')) as { key_id: string }).key_id;
  const newId = (JSON.parse(readFileSync(join(keys, 'new.json'), 'utf8')) as { key_id: string }).key_id;

  assert.equal(await pack(['new', 'bookshelf', '--author', 'Halden'], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['publish', 'bookshelf-1.0.0.pack.json', '--to', 'catalogue', '--sign', join(keys, 'old.json')], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.match(h.out.join('\n'), /has not seen a key for Halden before/u);

  const later = JSON.parse(readFileSync(join(h.dir, 'bookshelf-1.0.0.pack.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(h.dir, 'bookshelf-1.0.1.pack.json'), JSON.stringify({ ...later, version: '1.0.1', summary: `${String(later.summary)} Kept tidy.` }));
  assert.equal(await pack(['publish', 'bookshelf-1.0.1.pack.json', '--to', 'catalogue', '--sign', join(keys, 'new.json')], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /rotation/u);

  assert.equal(await pack(['key', 'rotate', join(keys, 'old.json'), join(keys, 'new.json'), '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  const index = readFileSync(join(h.dir, 'catalogue', 'index.json'), 'utf8');
  assert.match(index, /braindog-key-rotation-1/u);
  assert.doesNotMatch(index, /private_key/u);
  assert.equal(await pack(['publish', 'bookshelf-1.0.1.pack.json', '--to', 'catalogue', '--sign', join(keys, 'new.json')], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.match(h.out.join('\n'), new RegExp(`Signed by key ${newId}, which key ${oldId}, the one this machine has seen for Halden, named as its successor`, 'u'));
  assert.deepEqual(JSON.parse(readFileSync(join(h.dir, 'config', 'braindog', 'known-keys.json'), 'utf8')), { 'pack:bookshelf': [oldId, newId] });

  assert.equal(await pack(['key', 'revoke', join(keys, 'new.json'), '--to', 'catalogue'], h.io), 1);
  assert.equal(await pack(['key', 'revoke', join(keys, 'new.json'), '--to', 'catalogue', '--reason', 'Copied off a shared machine.'], h.io), 0, h.said.join('\n'));
  const asked = h.seen.filter((s) => s.method === 'propose').length;
  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 1);
  assert.equal(h.said.at(-1), `Bookshelf 1.0.1 is signed by key ${newId}, which its author revoked, so it is not trusted. Their reason: Copied off a shared machine. Nothing was sent.`);
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, asked);
  assert.equal(await pack(['search', '--from', 'catalogue'], h.io), 0);
  assert.match(h.out.at(-2) ?? '', /which its author revoked/u);
});

test('install refuses a version that arrives unsigned after signed ones, and search says it loudly', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = await setup(t);
  const keys = join(h.dir, 'keys');
  assert.equal(await pack(['key', join(keys, 'k.json'), '--author', 'Halden'], h.io), 0, h.said.join(' '));
  const keyId = (JSON.parse(readFileSync(join(keys, 'k.json'), 'utf8')) as { key_id: string }).key_id;
  assert.equal(await pack(['new', 'bookshelf', '--author', 'Halden'], h.io), 0, h.said.join(' '));
  assert.equal(await pack(['publish', 'bookshelf-1.0.0.pack.json', '--to', 'catalogue', '--sign', join(keys, 'k.json')], h.io), 0, h.said.join(' '));
  const later = JSON.parse(readFileSync(join(h.dir, 'bookshelf-1.0.0.pack.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(h.dir, 'bookshelf-1.0.1.pack.json'), JSON.stringify({ ...later, version: '1.0.1', summary: `${String(later.summary)} Kept tidy.` }));
  assert.equal(await pack(['publish', 'bookshelf-1.0.1.pack.json', '--to', 'catalogue', '--sign', join(keys, 'k.json')], h.io), 0, h.said.join(' '));

  /* Somebody edits the index: the latest version loses its signature, and the author is renamed. */
  const path = join(h.dir, 'catalogue', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as { entries: { author: string; versions: Record<string, unknown>[] }[] };
  delete index.entries[0]!.versions[0]!.signature;
  index.entries[0]!.author = 'Someone Else';
  writeFileSync(path, JSON.stringify(index));

  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', new RegExp(`Bookshelf 1\.0\.1 is unsigned, and earlier versions were signed by key ${keyId}.*Nothing was sent\.$`, 'u'));
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, 0);
  assert.equal(await pack(['search', '--from', 'catalogue'], h.io), 0);
  assert.ok(h.out.some((l) => /Unsigned, and earlier versions were signed by key/u.test(l)));
});
