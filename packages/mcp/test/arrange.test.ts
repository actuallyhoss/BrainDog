/**
 * Arranging a BrainDog over MCP, from an agent's side, over a real record.
 *
 * READS ARE RESOURCES AND THE TOOL LIST STAYS AT FOURTEEN. How the record is arranged, one page's declaration and
 * the two grammars are fetched when wanted, and `propose` carries the three new bodies. What is held: each read is
 * listed and answers compactly, a page read as declared goes back as a change, and nothing a propose token files
 * changes the record until an owner accepts it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueEntry } from '@braindog/record';

import { TOOLS, tools } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't', scope: 'propose', person: 'p_1', level: 'owner' } };

const WORK = {
  pack: 'work',
  version: '1.0.0',
  summary: 'Tasks.',
  author: 'BrainDog',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [
    { register: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
    { page: 'work', title: 'Work', nav: { section: 'Work', order: 10 }, requires: ['register.tasks'], blocks: [{ kind: 'table', source: 'register.tasks', empty: 'Nothing yet.' }] },
  ],
};
const CATALOGUE: CatalogueEntry[] = [{ id: 'work', kind: 'pack', title: 'Work', summary: 'Tasks.', modules: [], doc: () => WORK }];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('THE ARRANGEMENT, A DECLARATION AND THE GRAMMARS ARE RESOURCES, and a pack and a layout go back through propose', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: CATALOGUE });
  const mcp = tools(api);
  assert.ok(
    !TOOLS.some((t) => t.name === 'arrangement'),
    'reading an arrangement became a tool',
  );

  const listed = (await mcp.resources(agent)).map((r) => r.uri);
  for (const uri of ['braindog:arrangement', 'braindog:grammar/page', 'braindog:grammar/proposals']) assert.ok(listed.includes(uri), uri);

  const before = value<{ offer: { id: string }[] }>(await mcp.read('braindog:arrangement', agent));
  assert.deepEqual(before.offer.map((o) => o.id), ['work']);
  assert.ok(JSON.stringify(before).length < 1000);

  /* A PACK, BY PROPOSAL. The token files it; the owner's press installs it. */
  const filed = value<{ id: string }>(await mcp.call('propose', { question: 'Add Work?', body_kind: 'pack', body: { install: 'work' } }, agent));
  assert.equal(api.kernel.packStates().length, 0);
  value(await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.deepEqual(api.kernel.packStates().map((p) => p.id), ['work']);

  /* A LAYOUT, READ AS DECLARED AND SENT BACK CHANGED. `declaration_id` is taken from `to`. */
  assert.ok((await mcp.resources(agent)).some((r) => r.uri === 'braindog:page/work'));
  const decl = value<{ id: string; body: { blocks: unknown[] } }>(await mcp.read('braindog:declaration/work', agent));
  const changed = { ...decl.body, blocks: [{ kind: 'note', span: 12, body: 'What is open.' }, ...decl.body.blocks] };
  const moved = value<{ id: string }>(
    await mcp.call('propose', { question: 'Put a note over the tasks?', body_kind: 'change', body: { to: { id: decl.id, kind: 'page', body: changed } } }, agent),
  );
  value(await api.decide({ id: moved.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.equal(value<{ body: { blocks: unknown[] } }>(await mcp.read('braindog:declaration/work', agent)).body.blocks.length, 2);

  const nowhere = await mcp.read('braindog:declaration/nowhere', agent);
  assert.ok(!nowhere.ok && 'refusal' in nowhere && /The pages are: work/.test(nowhere.refusal.fix));
  sql.close();
});

test('THE KINDS OF BLOCK ARE A RESOURCE, short and listed, and one kind whole is read by its name', async () => {
  const sql = openSqlite();
  const mcp = tools(await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: CATALOGUE }));
  assert.ok((await mcp.resources(agent)).some((r) => r.uri === 'braindog:grammar/kinds'));
  const short = value<{ kinds: Record<string, string>; reach_for: string[] }>(await mcp.read('braindog:grammar/kinds', agent));
  assert.match(short.kinds.spec ?? '', /^the block to reach for most: a name, a value, a note\./u);
  assert.equal(short.reach_for.length, 10);
  assert.ok(Buffer.byteLength(JSON.stringify(short)) <= 8192, 'the short form an agent reads in a turn passed 8 KB');
  assert.equal(value<{ kind: string }>(await mcp.read('braindog:grammar/kind/spec', agent)).kind, 'spec');
  const wrong = await mcp.read('braindog:grammar/kind/donut', agent);
  assert.ok(!wrong.ok && 'refusal' in wrong && /Read grammar kinds/u.test(wrong.refusal.fix));
  sql.close();
});

test('WHAT IS ON OFFER COMES TWELVE AT A TIME, with how many more and a word to search them by', async () => {
  const sql = openSqlite();
  const many: CatalogueEntry[] = Array.from({ length: 30 }, (_, i) => ({
    id: `pack-${String(i + 1).padStart(2, '0')}`,
    kind: 'pack' as const,
    title: `Pack ${i + 1}`,
    summary: i % 10 === 0 ? 'Payments and invoices.' : 'Tasks.',
    modules: [],
    doc: () => WORK,
  }));
  const mcp = tools(await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: many }));
  const first = value<{ offer: { id: string }[]; offer_more?: string; voice?: unknown }>(await mcp.read('braindog:arrangement', agent));
  assert.equal(first.offer.length, 12);
  assert.ok(first.voice, 'the rest of the arrangement is still read whole');
  assert.match(first.offer_more ?? '', /^18 more on offer: read braindog:arrangement\/offer\/2, or braindog:arrangement\/offer\/<word>/u);
  const third = value<{ offer: { id: string }[]; page: number; of: number; offer_more?: string }>(await mcp.read('braindog:arrangement/offer/3', agent));
  assert.deepEqual([third.offer.length, third.page, third.of, third.offer_more], [6, 3, 30, undefined]);
  const paying = value<{ offer: { id: string }[]; word: string }>(await mcp.read('braindog:arrangement/offer/payments', agent));
  assert.deepEqual(paying.offer.map((o) => o.id), ['pack-01', 'pack-11', 'pack-21']);
  assert.equal((await mcp.read('braindog:arrangement/offer/Pay!', agent)).ok, false);
  sql.close();
});
