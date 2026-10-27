/**
 * The plan answers each script's source, its size, and on an update the lines that changed ("source shown in
 * review", HD.361).
 *
 * WHAT A STRANGER INSTALLING A STRANGER'S ADD-ON READS BEFORE APPROVING. The plan said where a script calls and with
 * which key, and never what it runs, so the review had nothing to show but the header's line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOMAINS, PROJECTS } from '../../../fixtures/names.ts';
import { changedLines, normalise, plan, scriptSources, type Installed, type Pack } from '../src/index.ts';

const HOST = `https://api.${DOMAINS[0]}`;

const script = (name: string, source: string, title?: string) => ({
  script: name,
  ...(title === undefined ? {} : { title }),
  runs: { every: '1h' },
  egress: [HOST],
  keys: [],
  reads: [],
  writes: ['readings'],
  source,
});

const READINGS = { register: 'readings', name: 'Readings', title: 'at', fields: [{ id: 'at', type: 'text' }] };

const ONE = ['export default async function run(ctx) {', '  const r = await ctx.fetch("/rate");', '  return r;', '}'].join('\n');

const EMPTY: Installed = { format: 1, primitives: 1, record_version: 7, packs: [], declarations: [], rows: {} };

async function packOf(version: string, ...scripts: Record<string, unknown>[]): Promise<Pack> {
  const doc = {
    pack: 'rate-feed',
    version,
    summary: `A rate for ${PROJECTS[0]}, hourly.`,
    author: 'Example',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [READINGS, ...scripts],
    seeds: [],
  };
  const pack = await normalise(doc);
  assert.ok(pack.ok, JSON.stringify(pack));
  return pack.value as Pack;
}

/** A record holding `pack` as installed, each declaration's body as the record stores it. */
const holding = (pack: Pack): Installed => ({
  ...EMPTY,
  packs: [{ id: pack.manifest.pack, version: pack.manifest.version }],
  declarations: pack.declarations.map((d) => ({ id: d.id, version: 1, kind: d.kind, pack_id: pack.manifest.pack, body: JSON.stringify(d.body), checksum: 'x' })),
});

test('A NEW SCRIPT ANSWERS ITS SOURCE AND ITS BYTES, and no changed lines', async () => {
  const diff = await plan(await packOf('1.0.0', script('rate', ONE, 'Daily rate')), EMPTY);
  assert.deepEqual(diff.scripts, [{ script: 'rate', title: 'Daily rate', source: ONE, bytes: Buffer.byteLength(ONE), changed: null }]);
});

test('AN UPDATE ANSWERS ONLY THE LINES THAT CHANGED, and a script it leaves alone is not answered', async () => {
  const before = await packOf('1.0.0', script('rate', ONE), script('steady', 'export default () => 1;'));
  const edited = ONE.replace('/rate', '/rate?fresh=1') + '\n// kept hourly';
  const diff = await plan(await packOf('1.1.0', script('rate', edited), script('steady', 'export default () => 1;')), holding(before));
  assert.equal(diff.scripts.length, 1, 'the unchanged script is not asked about again');
  assert.equal(diff.scripts[0]!.title, 'rate', 'a script with no title is said by its name');
  assert.deepEqual(diff.scripts[0]!.changed, [
    { at: 2, was: '  const r = await ctx.fetch("/rate");', now: '  const r = await ctx.fetch("/rate?fresh=1");' },
    { at: 5, was: null, now: '// kept hourly' },
  ]);
});

test('TWO SCRIPTS IN ONE PACK ARE EACH ANSWERED, in the order the pack writes them', async () => {
  const diff = await plan(await packOf('1.0.0', script('rate', ONE), script('spread', 'export default () => 2;')), EMPTY);
  assert.deepEqual(
    diff.scripts.map((s) => [s.script, s.bytes, s.changed]),
    [
      ['rate', Buffer.byteLength(ONE), null],
      ['spread', Buffer.byteLength('export default () => 2;'), null],
    ],
  );
});

test('A PACK WITH NO SCRIPT ANSWERS NONE', async () => {
  const diff = await plan(await packOf('1.0.0'), EMPTY);
  assert.deepEqual(diff.scripts, []);
  assert.deepEqual(scriptSources([], { declarations: [] }), []);
});

test('A SOURCE PAST 64 KB IS KEPT WHOLE, its bytes saying how big, and multi-byte text counted in bytes', () => {
  const big = Array.from({ length: 5000 }, (_, i) => `// line ${i} é`).join('\n');
  const [s] = scriptSources([{ id: 'script.big', kind: 'script', body: script('big', big) }], { declarations: [] });
  assert.equal(s!.source, big);
  assert.equal(s!.bytes, Buffer.byteLength(big));
  assert.ok(s!.bytes > 64 * 1024 && s!.bytes > big.length);
});

test('THE LINE DIFF: a removal, an insertion between kept lines, and a change are each said where they stand', () => {
  assert.deepEqual(changedLines('a\nb\nc', 'a\nc'), [{ at: 2, was: 'b', now: null }]);
  assert.deepEqual(changedLines('a\nc', 'a\nb\nc'), [{ at: 2, was: null, now: 'b' }]);
  assert.deepEqual(changedLines('a\nb\nc\nd', 'a\nB\nc\nd'), [{ at: 2, was: 'b', now: 'B' }]);
  assert.deepEqual(changedLines('a\nb', 'a'), [{ at: 2, was: 'b', now: null }]);
  assert.deepEqual(changedLines('same', 'same'), []);
});
