/**
 * `braindog page pull|push|check` against a stub record on node:http.
 *
 * PUSH'S REFUSAL IS THE REAL ONE, NOT A GUESS. `setDeclaration` is ADMIN
 * (`packages/host/src/index.ts`), and `packages/record/src/index.ts`'s `admin()` refuses a `token`
 * principal by name ("Open this from the app; a token cannot change what this record is") before
 * it looks at anything else. Every bearer this CLI holds is a token to the record, so the stub
 * answers exactly that sentence and the test asserts `push` shows it rather than swallowing it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dogText, parseDog, type PageBody } from '@braindog/dog';

import { page } from '../src/page.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-91cd'].join('.');

const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  people: [],
  faded: 0,
  project: null,
  registers: [],
  next: 'Start with the task in front of you, and call handoff with your next step before you stop.',
};

/** A stored page declaration's body, as `arrangement({ page })` answers it: every key it was written with. */
const BODY: PageBody = {
  page: 'invoicing',
  title: 'Invoicing',
  nav: { section: 'Money', order: 20 },
  requires: ['register.invoices'],
  blocks: [
    {
      kind: 'table',
      heading: 'Open',
      source: 'register.invoices',
      where: 'state is sent or part',
      columns: [
        { field: 'seq', label: '#', width: '4ch', align: 'end' },
        { field: 'client', label: 'Client', link: true },
      ],
      order: [{ field: 'due', dir: 'asc' }],
      limit: 50,
      empty: 'Nothing outstanding.',
    },
  ],
};

/** A template: one page per row of a list, so the page at `kiln` has no declaration of its own and this is its source. */
const PROJECT: PageBody = {
  page: 'project',
  title: '{{name}}',
  for: { register: 'things' },
  requires: ['register.things'],
  blocks: [{ kind: 'note', body: 'About {{name}}.' }],
};

/** What `arrangement({ page })` answers for a slug: the stored declaration, or the record's refusal. */
function arranged(slug: unknown): unknown {
  if (slug === 'invoicing') return { ok: true, value: { id: 'page.invoicing', version: 4, pack: null, body: BODY } };
  if (slug === 'kiln') return { ok: true, value: { id: 'page.project', version: 2, pack: 'portfolio', body: PROJECT } };
  return { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix: `There is no page declaration page.${String(slug)} that you can read. The pages are: invoicing.`, at: 'page' } };
}

type Seen = { method: string; args: Record<string, unknown> };

async function stub(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean } = {}) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      seen.push({ method, args });
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      if (method === 'arrangement') return answer(arranged(args.page));
      if (method === 'setDeclaration')
        return answer(
          opts.admin === false
            ? { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot change what this record is.', at: 'principal' } }
            : { ok: true, value: { id: 'page.invoicing', kind: 'page' } },
        );
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, opts: { admin?: boolean } = {}) {
  const h = await stub(t, opts);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-page-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: h.base, BRAINDOG_TOKEN: TOKEN };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { ...h, dir, env, io, out, said };
}

test('page pull: writes the stored declaration whole, the bytes dogText prints, and it reads back as the body', async (t) => {
  const h = await setup(t);
  assert.equal(await page(['pull', 'invoicing'], h.io), 0);
  const file = join(h.dir, 'invoicing.dog');
  const written = readFileSync(file, 'utf8');
  assert.equal(written, dogText(BODY));
  assert.deepEqual(h.out, [`invoicing written to ${file}.`]);
  /* LOSSLESS: a column's label, width and link are in the file, so pushing it back changes nothing. */
  const back = parseDog(written);
  if (!back.ok) assert.fail(back.fix);
  assert.deepEqual(back.value, BODY);
  assert.deepEqual(h.seen.find((s) => s.method === 'arrangement')?.args, { page: 'invoicing' });
});

test('page pull: --out names the file, and an unknown slug prints the record’s own sentence', async (t) => {
  const h = await setup(t);
  const file = join(h.dir, 'renamed.dog');
  assert.equal(await page(['pull', 'invoicing', '--out', 'renamed.dog'], h.io), 0);
  assert.equal(readFileSync(file, 'utf8'), dogText(BODY));

  assert.equal(await page(['pull', 'nowhere'], h.io), 1);
  assert.deepEqual(h.said, ['There is no page declaration page.nowhere that you can read. The pages are: invoicing.']);
});

test('page pull: a page made from a template writes the template, and says so', async (t) => {
  const h = await setup(t);
  assert.equal(await page(['pull', 'kiln'], h.io), 0);
  const file = join(h.dir, 'project.dog');
  assert.equal(readFileSync(file, 'utf8'), dogText(PROJECT));
  assert.deepEqual(h.out, [`kiln is one of the pages project makes, one for each row, so project's source was written to ${file}.`]);
});

test('page push: a good file is sent through setDeclaration exactly as parsed', async (t) => {
  const h = await setup(t, { admin: true });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.deepEqual(h.out, [`invoicing pushed to ${h.env.BRAINDOG_HOST}.`]);
  const sent = h.seen.find((s) => s.method === 'setDeclaration');
  assert.deepEqual(sent?.args.body, BODY);
});

test('page push: the record’s ADMIN gate refuses a token, and the sentence is shown rather than swallowed', async (t) => {
  const h = await setup(t, { admin: false });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 1);
  assert.deepEqual(h.said, ['Open this from the app; a token cannot change what this record is.']);
});

test('page push: a file the parser refuses is never sent', async (t) => {
  const h = await setup(t, { admin: true });
  const file = join(h.dir, 'broken.dog');
  writeFileSync(file, 'page: x\ntitle: X\nrequires: []\nblocks:\n  - kind: cards\n    authored: 3 rows');
  assert.equal(await page(['push', file], h.io), 1);
  assert.match(h.said[0] ?? '', /authored rows/);
  assert.match(h.said[0] ?? '', /line 6/);
  assert.equal(h.seen.some((s) => s.method === 'setDeclaration'), false, 'a file that cannot be a declaration is never sent');
});

test('page check: a well-formed file reads clean, offline, with nothing sent', async (t) => {
  const h = await setup(t);
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['check', file], h.io), 0);
  assert.deepEqual(h.out, ['invoicing reads as a page. Nothing was sent.']);
  assert.equal(h.seen.length, 0, 'check never opens a connection');
});

test('page check: a syntactically bad file gets the parser’s sentence', async (t) => {
  const h = await setup(t);
  const file = join(h.dir, 'broken.dog');
  writeFileSync(file, 'title: X\nrequires: []\nblocks:\n');
  assert.equal(await page(['check', file], h.io), 1);
  assert.match(h.said[0] ?? '', /page: <id>/);
});

test('page check: a syntactically valid file the kernel would still refuse gets the kernel’s own sentence', async (t) => {
  const h = await setup(t);
  const file = join(h.dir, 'bad-kind.dog');
  const bad: PageBody = { page: 'x', title: 'X', requires: ['register.things'], blocks: [{ kind: 'not-a-kind' }] };
  writeFileSync(file, dogText(bad));
  assert.equal(await page(['check', file], h.io), 1);
  /* THE KERNEL'S OWN WORDS, whatever they are today: it used to count the kinds in the sentence and now
     names what the build draws, and a test pinned to the old count was red about the wording rather than
     about the refusal. What matters here is that a file the parser accepts is still refused, by the kernel,
     naming the kind. */
  assert.match(h.said[0] ?? '', /kind "not-a-kind"/);
  assert.match(h.said[0] ?? '', /page\.x\.blocks\[0\]/);
});

test('page: a missing file or a wrong verb is exit 1 with a plain sentence', async (t) => {
  const h = await setup(t);
  assert.equal(await page(['check', join(h.dir, 'nope.dog')], h.io), 1);
  assert.deepEqual(h.said, [`${join(h.dir, 'nope.dog')} could not be read.`]);
  assert.equal(await page(['rename', 'x'], h.io), 1);
});
