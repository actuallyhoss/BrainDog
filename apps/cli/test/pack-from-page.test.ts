/**
 * `braindog pack new <id> --from-page <file.dog>`: a page a person pulled becomes an add-on that a record reads, with
 * nothing of theirs left in its bytes, and a page that reads nothing is refused with its sentence.
 *
 * INVENTED NAMES, inline: the author, the payee and the key label are made up here and searched for in the file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalise } from '@braindog/declare';
import { dogText, type PageBody } from '@braindog/dog';

import { NOTE_WORDS, packFromPage } from '../src/pack-from-page.ts';
import type { AgentIo } from '../src/skills.ts';

const AUTHOR = 'Marisol Quenby';
const PAYEE = 'Brackenfield Tiles';
const KEY_LABEL = 'brackenfield-bank-live';

/** A page over one list, with a figure, a note the author typed and a filter naming a payee. */
const PAGE = {
  page: 'bills_desk',
  title: 'Bills desk',
  requires: ['register.bills'],
  blocks: [
    { kind: 'note', body: `Kept by ${AUTHOR} for the shop.` },
    { kind: 'stat', cells: [{ metric: 'bills-due', label: 'Due' }] },
    {
      kind: 'table',
      heading: 'Open',
      source: 'register.bills',
      where: `payee is ${PAYEE}, state is open`,
      columns: [{ field: 'what' }, { field: 'due' }],
      empty: 'Nothing is open.',
    },
  ],
} as unknown as PageBody;

/** The record's own declarations the page reads, as the record holds them: a list, a figure, a rule and its script. */
const HELD = [
  {
    id: 'register.bills',
    kind: 'register',
    body: JSON.stringify({
      register: 'bills',
      name: 'Bills',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'payee', type: 'text' },
        { id: 'state', type: 'enum', values: ['open', 'paid'], default: 'open' },
        { id: 'due', type: 'day' },
      ],
    }),
  },
  {
    id: 'metric.bills-due',
    kind: 'metric',
    body: { metric: 'bills-due', name: 'Bills due', source: 'register.bills', where: 'state is open', value: { count: 'id' }, format: 'int', target: { lte: 3 }, window: 'all' },
  },
  { id: 'rule.paid-tag', kind: 'rule', body: { rule: 'paid-tag', name: 'Tag what is paid', register: 'bills', when: `state is paid, payee is ${PAYEE}`, then: [{ tag: 'settled' }] } },
  { id: 'rule.fetch-rates', kind: 'rule', body: { rule: 'fetch-rates', on: { every: '1d' }, steps: [{ script: { id: 'rates', as: 'got' } }] } },
  {
    id: 'script.rates',
    kind: 'script',
    body: {
      script: 'rates',
      title: 'Fetch rates',
      runs: { rule: true },
      egress: ['https://rates.example.org'],
      keys: [KEY_LABEL],
      reads: ['bills'],
      writes: ['bills'],
      source: `export default async function run(ctx) { ctx.log('${KEY_LABEL}'); }`,
    },
  },
  /* NOT READ BY THE PAGE NOR WORKING ON ITS LIST, so it stays behind. */
  { id: 'register.garden', kind: 'register', body: { register: 'garden', name: 'Garden', title: 'plant', fields: [{ id: 'plant', type: 'text' }] } },
];

test('a page with a list, a figure and an automation becomes an add-on file a record reads', async () => {
  const made = await packFromPage('bills-kit', dogText(PAGE), { held: HELD });
  assert.ok(made.ok, JSON.stringify(made));
  const { file, lines } = made.value;
  const back = await normalise(file, { kind: 'local' });
  assert.ok(back.ok, JSON.stringify(back));
  const kinds = (file.declarations as Record<string, unknown>[]).map((d) => Object.keys(d)[0]);
  assert.deepEqual(kinds, ['register', 'metric', 'script', 'rule', 'rule', 'page']);
  assert.ok(!JSON.stringify(file).includes('garden'), 'a list the page does not read stays behind');
  /* EACH THING TAKEN IS SAID, by its name. */
  for (const said of ['Took the list Bills', 'Took the figure Bills due', 'Took the automation Tag what is paid', 'Took the script Fetch rates'])
    assert.ok(lines.some((l) => l.startsWith(said)), `${said} in ${lines.join(' | ')}`);
});

test("the author's name in a note, a payee in a filter and a key's label are gone from the file's bytes", async () => {
  const made = await packFromPage('bills-kit', dogText(PAGE), { held: HELD });
  assert.ok(made.ok, JSON.stringify(made));
  const bytes = JSON.stringify(made.value.file);
  for (const own of [AUTHOR, 'Quenby', PAYEE, 'Brackenfield', KEY_LABEL]) assert.ok(!bytes.includes(own), `${own} is in the file`);
  assert.ok(bytes.includes(NOTE_WORDS));
  /* THE PAYEE IS A SETTING HOLDING A STAND-IN, read by the page and the automation alike. */
  const config = made.value.file.config as Record<string, { default: string }>;
  assert.equal(config.payee?.default, 'example');
  assert.equal((bytes.match(/\{\{config:payee\}\}/gu) ?? []).length, 2);
  assert.ok(made.value.lines.some((l) => l.includes('called rates-key-1 now')));
});

test('a figure nobody passed is refused naming the field that names it', async () => {
  const made = await packFromPage('bills-kit', dogText(PAGE));
  assert.equal(made.ok, false);
  if (made.ok || !('refusal' in made)) return;
  assert.equal(made.refusal.code, 'METRIC_UNKNOWN');
  assert.equal(made.refusal.at, 'blocks.1.cells.0.metric');
  assert.match(made.refusal.fix, /names the figure Bills due/u);
});

/* ── the command ─────────────────────────────────────────────────────── */

function harness(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-from-page-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env: { XDG_CONFIG_HOME: join(dir, 'config') }, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { dir, io, out, said };
}

/** The same page with no figure, as a person pulled it: its list is made from what it shows. */
const PULLED = { ...PAGE, blocks: (PAGE.blocks as unknown[]).filter((b) => (b as { kind: string }).kind !== 'stat') } as unknown as PageBody;

test('pack new --from-page writes the add-on from the page, scrubbed, and its other files as pack new writes them', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = harness(t);
  writeFileSync(join(h.dir, 'bills_desk.dog'), dogText(PULLED));
  assert.equal(await pack(['new', 'bills-kit', '--from-page', 'bills_desk.dog', '--title', 'Bills kit', '--author', 'Tamsin Orrel'], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['new', 'bills-kit', '--out', 'blank', '--title', 'Bills kit', '--author', 'Tamsin Orrel'], h.io), 0, h.said.join('\n'));

  const text = readFileSync(join(h.dir, 'bills-kit', 'bills-kit.pack.json'), 'utf8');
  for (const own of [AUTHOR, PAYEE, 'Brackenfield']) assert.ok(!text.includes(own), `${own} is in the file`);
  const doc = JSON.parse(text) as Record<string, unknown>;
  assert.ok((await normalise(doc, { kind: 'local' })).ok);
  assert.equal(doc.title, 'Bills kit');
  assert.ok(h.out.some((l) => l.startsWith('Made the list Bills from what the page shows of it')), h.out.join('\n'));
  for (const other of ['bills-kit.test.json', 'README.md'])
    assert.equal(readFileSync(join(h.dir, 'bills-kit', other), 'utf8'), readFileSync(join(h.dir, 'blank', other), 'utf8'), other);
});

test('pack new --from-page refuses a page that names nothing, with its sentence, and writes nothing', async (t) => {
  const { pack } = await import('../src/catalogue.ts');
  const h = harness(t);
  writeFileSync(join(h.dir, 'empty.dog'), dogText({ page: 'empty', title: 'Empty', requires: [], blocks: [{ kind: 'note', body: 'Nothing here yet.' }] } as unknown as PageBody));
  assert.equal(await pack(['new', 'empty-kit', '--from-page', 'empty.dog'], h.io), 1);
  assert.match(h.said.join('\n'), /Empty reads no list and no figure, so a plugin made from it would hold nothing\. Give a block a source such as register\.<list>, then try again\./u);
  assert.throws(() => readFileSync(join(h.dir, 'empty-kit', 'empty-kit.pack.json')));
  assert.equal(await pack(['new', 'empty-kit', '--from-page', 'missing.dog'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /missing\.dog could not be read/u);
});
