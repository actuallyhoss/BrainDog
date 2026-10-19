/**
 * A page composed on the owner's machine: only a kind whose one argument is the page is offered, a live run draws its
 * line with the machine by its name and the page by its title, an ended run draws none, a refusal is said in the record's
 * own sentence, and an add-on's kind is read from its own document for the version the record holds.
 *
 * Every name and every kind id here is invented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { JobKind, JobRow } from './jobs.ts';
import { installedRows, pageJobLine, pageKinds, readPageKinds, startPageJob, pageWords } from './page-jobs.ts';
import { kindsIn } from './jobs.ts';

const KIND = 'job.loom-desk';
const kind = (id: string, args: JobKind['args']): JobKind => ({ id, title: `Kind ${id}`, repo: null, args, writes: false });
const run = (over: Partial<JobRow>): JobRow =>
  ({
    id: 'j_1',
    kind: KIND,
    title: 'Compose a page',
    repo: null,
    args: { page: 'kilns' },
    about: null,
    status: 'queued',
    lost: false,
    cancel: false,
    runner: null,
    seq: 0,
    created_at: '2026-10-14T09:00:00.000Z',
    claimed_at: null,
    lease_until: null,
    expires: '2026-10-15T09:00:00.000Z',
    result: null,
    error: null,
    claude_session: null,
    ...over,
  }) as JobRow;
const names = new Map([['kilns', 'Kiln firings']]);

test('a kind is offered only when its one argument is the page', () => {
  const offered = pageKinds([
    kind(KIND, [{ id: 'page', label: 'Page', max: 64 }]),
    kind('job.notes', [{ id: 'topic', label: 'Topic', max: 40 }]),
    kind('job.two', [
      { id: 'page', label: 'Page', max: 64 },
      { id: 'tone', label: 'Tone', max: 20 },
    ]),
    kind('job.none', []),
  ]);
  assert.deepEqual(
    offered.map((k) => k.id),
    [KIND],
  );
});

test('no kind, no line', () => {
  assert.equal(pageJobLine([], KIND, names), null);
  assert.equal(pageJobLine([run({ kind: 'job.other', status: 'claimed', runner: 'Studio laptop' })], KIND, names), null);
});

test('a live run draws the line: the machine by its name, the page by its title', () => {
  const working = pageJobLine([run({ status: 'claimed', runner: 'Studio laptop', claimed_at: '2026-10-14T09:01:00.000Z' })], KIND, names);
  assert.deepEqual(working, { id: 'j_1', text: 'Working on Studio laptop: composing Kiln firings' });
  assert.doesNotMatch(working?.text ?? '', /j_1|kilns/u);

  /* WAITING FOR A MACHINE, AND A MACHINE THAT STOPPED ANSWERING, are both said as waiting: no machine is named. */
  assert.equal(pageJobLine([run({})], KIND, names)?.text, 'Waiting for your machine: composing Kiln firings');
  assert.equal(pageJobLine([run({ status: 'claimed', runner: 'Studio laptop', lost: true })], KIND, names)?.text, pageWords.waiting('Kiln firings'));

  /* A PAGE THE NAMES DO NOT HOLD is said as it was typed. */
  assert.equal(pageJobLine([run({ args: { page: 'glazes' } })], KIND, names)?.text, pageWords.waiting('glazes'));
});

test('the newest live run is the one drawn, and an ended run draws none', () => {
  for (const status of ['ok', 'cancelled', 'error', 'interrupted', 'limit'] as const) assert.equal(pageJobLine([run({ status })], KIND, names), null, status);
  const line = pageJobLine(
    [run({ id: 'j_3', status: 'ok' }), run({ id: 'j_2', status: 'claimed', runner: 'Back room' }), run({ id: 'j_1', status: 'queued' })],
    KIND,
    names,
  );
  assert.deepEqual(line, { id: 'j_2', text: 'Working on Back room: composing Kiln firings' });
});

test('the press starts one run and answers its id; a refusal is said in its own sentence', async () => {
  const sent: unknown[] = [];
  const yes = await startPageJob({ createJob: async (a) => (sent.push(a), { ok: true, value: { id: 'j_9' } }) }, KIND, 'kilns');
  assert.deepEqual(yes, { ok: true, id: 'j_9' });
  assert.deepEqual(sent, [{ kind: KIND, args: { page: 'kilns' } }]);

  const fix = 'job.loom-desk is not a kind of job this record has approved. A kind is approved once, in Needs you.';
  const no = await startPageJob({ createJob: async () => ({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix } }) }, KIND, 'kilns');
  assert.deepEqual(no, { ok: false, fix });

  const down = await startPageJob({ createJob: async () => Promise.reject(new Error('offline')) }, KIND, 'kilns');
  assert.deepEqual(down, { ok: false, fix: pageWords.unreached });
});

test("an add-on's document gives its kinds as the change its install approved", () => {
  const doc = {
    pack: 'loom',
    declarations: [
      { job: 'loom-desk', title: 'Compose a page', prompt: 'Read %page%.', args: [{ id: 'page', label: 'Page', max: 64 }], tools: ['mcp__braindog__get'], turns: 5, permission: 'dontAsk' },
      { digest: 'loom-morning', name: 'Morning' },
    ],
  };
  const kinds = kindsIn(installedRows([doc, null, { declarations: 'nothing' }]));
  assert.deepEqual(kinds, [{ id: KIND, title: 'Compose a page', repo: null, args: [{ id: 'page', label: 'Page', max: 64 }], writes: false }]);
  assert.deepEqual(installedRows([]), []);
});

test('the kinds read: accepted in Needs you, and carried by an add-on this record holds on, fetched only when the catalogue lists it', async () => {
  const asked: string[] = [];
  const doc = { declarations: [{ job: 'loom-desk', title: 'Compose a page', prompt: '%page%', args: [{ id: 'page', label: 'Page', max: 64 }], tools: ['mcp__braindog__get'], turns: 5, permission: 'dontAsk' }] };
  const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const io = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith('index.json')) return reply({ entries: [{ kind: 'pack', id: 'loom' }] });
    if (url.endsWith('/packs/loom/1.0.0.pack.json')) return reply(doc);
    const method = typeof init?.body === 'string' ? (JSON.parse(init.body) as { method?: string }).method : undefined;
    const name = method ?? url.split('/').at(-1) ?? '';
    if (name.includes('packs'))
      return reply({ ok: true, value: [
        { id: 'loom', version: '1.0.0', disabled_at: null, registers: [] },
        { id: 'weave', version: '2.0.0', disabled_at: null, registers: [] },
        { id: 'spool', version: '1.0.0', disabled_at: '2026-10-01T00:00:00.000Z', registers: [] },
      ] });
    return reply({ ok: true, value: [] });
  }) as typeof fetch;
  const got = await readPageKinds('http://loom.test', [], io);
  assert.ok(got.ok);
  assert.deepEqual(got.ok ? got.value.map((k) => k.id) : [], [KIND]);
  assert.ok(asked.some((u) => u.endsWith('/packs/loom/1.0.0.pack.json')));
  assert.ok(!asked.some((u) => u.includes('/packs/weave/') || u.includes('/packs/spool/')), 'only an add-on the catalogue lists, and only one turned on');
});

test('Slash loads the press by import() for the owner only, the part draws only on a live record, and no file of the app spells the add-on', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const slash = read('../../routes/slash/+page.svelte');
  const part = read('../../routes/slash/PageJobs.svelte');
  const lib = read('./page-jobs.ts');
  assert.match(slash, /import\('\.\/PageJobs\.svelte'\)/u, 'fetched when Slash mounts, never in its first chunk');
  assert.doesNotMatch(slash, /^\s*import PageJobs\b/mu);
  /* SLASH ITSELF NEVER ASKS THE SHELL WHETHER IT IS LIVE (`no-sample-screens.test.ts`): the part does. */
  assert.match(slash, /page\.data\.me\?\.owner === true\)\s*void import\('\.\/PageJobs\.svelte'\)/u);
  assert.match(part, /page\.data\.live \|\| page\.data\.me\?\.owner !== true/u);
  assert.match(part, /at\(`\/jobs\/\$\{line\.id\}`\)/u, "the line links to the run's own view");
  for (const [name, text] of [['+page.svelte', slash], ['PageJobs.svelte', part], ['page-jobs.ts', lib]] as const)
    assert.doesNotMatch(text, /slash-desk|job\.slash/u, `${name} names the add-on`);
});
