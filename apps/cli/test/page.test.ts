/**
 * `braindog page pull|push|check` against a stub record on node:http.
 *
 * PUSH'S REFUSAL IS THE REAL ONE, NOT A GUESS. `setDeclaration` is ADMIN
 * (`packages/host/src/index.ts`), and `packages/record/src/index.ts`'s `admin()` refuses a `token`
 * principal by name ("Open this from the app; a token cannot change what this record is") before
 * it looks at anything else. Every bearer this CLI holds is a token to the record, so the stub
 * answers exactly that refusal, and `push` then asks on Decide instead: the stub keeps
 * the questions `propose` files and hands them back from `governance`, as the record does.
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

/** How the stub answers: `admin: false` is a token (the ADMIN gate refuses it), `named: false` a key handed a handle and no number. */
type Opts = { admin?: boolean; named?: boolean; propose?: unknown; polls?: unknown[] };

async function stub(t: { after: (fn: () => void | Promise<void>) => void }, opts: Opts = {}) {
  const seen: Seen[] = [];
  /* THE QUESTIONS WAITING ON DECIDE, as `governance` lists them: what `propose` filed, under the number it answered. */
  const open: { id: string; body_kind: unknown; body: unknown }[] = [];
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
            ? { ok: false, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot change what this BrainDog is.', at: 'principal' } }
            : { ok: true, value: { id: 'page.invoicing', kind: 'page' } },
        );
      /* ONE QUESTION BY ID, as `push --wait` reads it: the next of `polls` each time, the last one held. */
      if (method === 'governance' && args.id !== undefined) {
        const row = (opts.polls ?? []).length > 1 ? opts.polls?.shift() : opts.polls?.[0];
        return answer({ ok: true, value: row ?? null });
      }
      if (method === 'governance') return answer({ ok: true, value: open });
      if (method === 'propose') {
        if (opts.propose !== undefined) return answer(opts.propose);
        const id = `SG${String(open.length + 1)}`;
        open.push({ id, body_kind: args.body_kind, body: args.body });
        return answer({ ok: true, value: { id: opts.named === false ? 'q.01TESTTESTTESTTESTTESTTEST' : id } });
      }
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, opts: Opts = {}) {
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

test('page pull: --out names the file, and an unknown slug says so in words and names the pages pull takes', async (t) => {
  const h = await setup(t);
  const file = join(h.dir, 'renamed.dog');
  assert.equal(await page(['pull', 'invoicing', '--out', 'renamed.dog'], h.io), 0);
  assert.equal(readFileSync(file, 'utf8'), dogText(BODY));

  assert.equal(await page(['pull', 'nowhere'], h.io), 1);
  /* SAID FOR A PERSON, with what `pull` takes, from the record's sentence for an agent (`noPage`). */
  assert.deepEqual(h.said, ['There is no page nowhere here that you can read. braindog page pull takes one of: invoicing.']);
});

test('page pull: a page made from a template writes the template, and says so', async (t) => {
  const h = await setup(t);
  assert.equal(await page(['pull', 'kiln'], h.io), 0);
  const file = join(h.dir, 'project.dog');
  assert.equal(readFileSync(file, 'utf8'), dogText(PROJECT));
  assert.deepEqual(h.out, [`kiln is one of the pages project makes, one for each row, so project's source was written to ${file}.`]);
});

/** How many times the stub was asked one method. */
const calls = (h: { seen: Seen[] }, method: string): Seen[] => h.seen.filter((s) => s.method === method);

test('page push: an owner’s session applies a good file through setDeclaration exactly as parsed', async (t) => {
  const h = await setup(t, { admin: true });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.deepEqual(h.out, [`invoicing pushed to ${h.env.BRAINDOG_HOST}.`]);
  const sent = h.seen.find((s) => s.method === 'setDeclaration');
  assert.deepEqual(sent?.args.body, BODY);
  assert.equal(calls(h, 'propose').length, 0, 'what was applied is not asked about as well');
});

test('page push: a token is refused the ADMIN route, so the file is asked on Decide as one change', async (t) => {
  const h = await setup(t, { admin: false });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.deepEqual(h.out, ['invoicing asked as SG1. It waits on Decide.']);
  assert.deepEqual(h.said, [], 'the refusal that sent it to Decide is not shown as a failure');
  const asked = calls(h, 'propose');
  assert.equal(asked.length, 1);
  /* THE WHOLE DECLARATION, as `grammar pages` says a page is changed: `to` is what `install` takes. */
  assert.deepEqual(asked[0]?.args, {
    question: 'Use this version of the Invoicing page?',
    body_kind: 'change',
    body: { declaration_id: 'page.invoicing', to: { id: 'page.invoicing', kind: 'page', body: BODY } },
  });
});

test('page push: the same file pushed twice files one question', async (t) => {
  const h = await setup(t, { admin: false });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.equal(await page(['push', file], h.io), 0);
  assert.equal(calls(h, 'propose').length, 1);
  assert.deepEqual(h.out, ['invoicing asked as SG1. It waits on Decide.', 'invoicing is already waiting as SG1. It waits on Decide.']);

  /* A DIFFERENT BODY FOR THE SAME PAGE IS ANOTHER QUESTION: only the same change is the same ask. */
  writeFileSync(file, dogText({ ...BODY, title: 'Invoices' }));
  assert.equal(await page(['push', file], h.io), 0);
  assert.equal(calls(h, 'propose').length, 2);
  assert.equal(h.out.at(-1), 'invoicing asked as SG2. It waits on Decide.');
});

test('page push: the record’s own word that it was asked before is passed on', async (t) => {
  const h = await setup(t, { admin: false, propose: { ok: true, value: { id: 'SG9', joined: true, said: 'Already waiting as SG9.' } } });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.deepEqual(h.out, ['invoicing is already waiting as SG9. It waits on Decide.']);
});

test('page push: a key handed no number says only that it waits', async (t) => {
  const h = await setup(t, { admin: false, named: false });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 0);
  assert.deepEqual(h.out, ['invoicing asked. It waits on Decide.']);
  assert.doesNotMatch(h.out.join(' '), /q\.01TEST/);
});

test('page push: a change the record will not file is exit 1 with the record’s sentence', async (t) => {
  const fix = 'This page reads a list that is not there.';
  const h = await setup(t, { admin: false, propose: { ok: false, refusal: { code: 'REGISTER_UNRESOLVED', fix, at: 'body.to' } } });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file], h.io), 1);
  assert.deepEqual(h.said, [fix]);
  assert.deepEqual(h.out, []);
});

test('page push: a file the parser refuses is never sent', async (t) => {
  const h = await setup(t, { admin: true });
  const file = join(h.dir, 'broken.dog');
  writeFileSync(file, 'page: x\ntitle: X\nrequires: []\nblocks:\n  - kind: cards\n    authored: 3 rows');
  assert.equal(await page(['push', file], h.io), 1);
  assert.match(h.said[0] ?? '', /authored rows/);
  assert.match(h.said[0] ?? '', /line 6/);
  assert.equal(h.seen.some((s) => s.method === 'setDeclaration' || s.method === 'propose'), false, 'a file that cannot be a declaration is never sent');
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

/** A clock that waits no time: each sleep moves it on by what was asked, and is counted. */
function clock() {
  const c = { t: 0, slept: [] as number[] };
  return { c, clock: { now: () => c.t, sleep: async (ms: number) => void (c.slept.push(ms), (c.t += ms)) } };
}

const OPEN = { id: 'SG1', status: 'open', resolved_as: null };

test('page push --wait: a question accepted on the second read is Accepted, exit 0', async (t) => {
  const h = await setup(t, { admin: false, polls: [OPEN, { id: 'SG1', status: 'resolved', resolved_as: 'addressed' }] });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  const k = clock();
  assert.equal(await page(['push', file, '--wait'], h.io, k.clock), 0);
  assert.deepEqual(h.out, ['invoicing asked as SG1. It waits on Decide.', 'Accepted.']);
  const reads = calls(h, 'governance').filter((s) => s.args.id !== undefined);
  assert.equal(reads.length, 2);
  assert.equal(reads[0]?.args.id, 'SG1');
  assert.deepEqual(k.c.slept, [5_000], 'one turn of five seconds between the two reads');
  assert.doesNotMatch([...h.out, ...h.said].join(' '), /rec_01TEST|stub-bearer/, 'the key is never printed');
});

test('page push --wait: a declined question is Declined, exit 1', async (t) => {
  const h = await setup(t, { admin: false, polls: [{ id: 'SG1', status: 'resolved', resolved_as: 'wont-fix' }] });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  const k = clock();
  assert.equal(await page(['push', file, '--wait', '10m'], h.io, k.clock), 1);
  assert.equal(h.out.at(-1), 'Declined.');
  assert.deepEqual(k.c.slept, []);
});

test('page push --wait 10m: a question still open at the limit is Still waiting on Decide, exit 2', async (t) => {
  const h = await setup(t, { admin: false, polls: [OPEN] });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  const k = clock();
  assert.equal(await page(['push', '--wait', '10m', file], h.io, k.clock), 2);
  assert.equal(h.out.at(-1), 'Still waiting on Decide.');
  /* EVERY FIVE SECONDS FOR TEN MINUTES: 120 turns, 121 reads, and never past the limit. */
  assert.equal(k.c.slept.length, 120);
  assert.equal(k.c.t, 10 * 60_000);
  assert.equal(calls(h, 'governance').filter((s) => s.args.id !== undefined).length, 121);
});

test('page push --wait: more than 30 minutes is refused before anything is sent, and an owner’s apply waits on nothing', async (t) => {
  const h = await setup(t, { admin: false });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  assert.equal(await page(['push', file, '--wait', '2h'], h.io, clock().clock), 1);
  assert.deepEqual(h.said, ['--wait takes a duration of at most 30m, as in --wait 10m, or nothing for 30m.']);
  assert.equal(h.seen.length, 0);

  const o = await setup(t, { admin: true });
  const mine = join(o.dir, 'invoicing.dog');
  writeFileSync(mine, dogText(BODY));
  assert.equal(await page(['push', mine, '--wait'], o.io, clock().clock), 0);
  assert.deepEqual(o.out, [`invoicing pushed to ${o.env.BRAINDOG_HOST}.`]);
  assert.equal(calls(o, 'governance').length, 0);
});

test('page push --wait: a no the person gave before is said in the record’s words and exits 1, and without --wait 0', async (t) => {
  const said = 'This was declined on 2 October 2026. No reason was given. Nothing was filed. If something has changed, propose it again and say what in again.';
  const before = { ok: true, value: { id: 'SG4', answered: { said: 'No', reason: 'No reason was given.', at: '2026-10-02T09:00:00Z' }, said } };
  const h = await setup(t, { admin: false, propose: before });
  const file = join(h.dir, 'invoicing.dog');
  writeFileSync(file, dogText(BODY));
  const k = clock();
  assert.equal(await page(['push', file, '--wait'], h.io, k.clock), 1);
  assert.deepEqual(h.out, [said]);
  assert.deepEqual(k.c.slept, [], 'nothing to wait on');
  assert.equal(await page(['push', file], h.io), 0);
});
