/**
 * The forms a built dashboard draws (`loop/research-dynamic-layouts.md` §6, D5), each as fence rows both drawers read.
 *
 * WHAT WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN, against the tree wave one left: `isKind('inputs')` was false while
 * the kernel already answered an `inputs` block; ` ```steps path ` degraded as `"steps" takes no word after it`; and
 * `cardFault(['title', 'next'])` said `a column called "next"`, so a card the kernel had just answered `nexts` for
 * could not be written as a fence at all. The new modules are imported inside the tests that need them, so a run
 * against a tree without them fails test by test and says which form is missing, rather than failing to load.
 *
 * The Svelte drawers are compiled and rendered on the server here as `parity.test.ts` does, because a form that the
 * mirror draws one way and the app another is two forms.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { KINDS, isKind } from './kinds.ts';
import { parse, type Block, type Row, type Segment } from './parse.ts';
import { toHTML } from './html.ts';
import { cardFault, cardLayout } from './cards.ts';
import { queueFault, queuePlan } from './queue.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

type BlockProps = {
  block: Block;
  opts?: Record<string, unknown>;
  onact?: (row: Row, option: string) => void;
  oninput?: (row: Row, value: string) => void;
};
const { default: BlockView } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as { default: Component<BlockProps> };

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/**
 * The markup as a browser builds it, the same reduction `parity.test.ts` makes: no comments, no gaps between tags.
 *
 * AND A VOID ELEMENT'S SLASH GOES, which that one never needed: an option's picture is the first `<img>` either drawer
 * writes, and Svelte closes it `<img ... />` where the mirror writes `<img ...>`, two spellings a parser reads as one.
 */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s*\/>/gu, '>')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)].map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!)).sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const one = (src: string): Segment => {
  const segs = parse(src, { page: true });
  assert.equal(segs.length, 1, `${src} parsed to ${segs.length} segments`);
  return segs[0]!;
};
const drawn = (src: string): Block => {
  const seg = one(src);
  assert.equal(seg.type, 'block', seg.type === 'degraded' ? seg.fix : '');
  return seg as Block;
};
const fixOf = (src: string): string => {
  const seg = one(src);
  assert.equal(seg.type, 'degraded', `${src} drew, and it should have degraded`);
  return seg.type === 'degraded' ? seg.fix : '';
};

/* ── the closed list ──────────────────────────────────────────────────────── */

test('INPUTS IS A KIND, page-only, on the rows primitive, and every new form is a word its kind names', () => {
  assert.equal(isKind('inputs'), true);
  assert.equal(KINDS.inputs.pageOnly, true);
  assert.equal(KINDS.inputs.primitive, 'rows');
  assert.deepEqual(
    Object.fromEntries((['note', 'cards', 'steps', 'queue', 'progress'] as const).map((k) => [k, KINDS[k].forms ?? []])),
    { note: ['lead'], cards: ['lead'], steps: ['path'], queue: ['tiles'], progress: ['budget', 'range'] },
  );
  for (const src of ['```note lead\nThree of nine are done.\n```', '```steps path | The path\nCut | x | next\n```', '```progress range | Budget\nBox | £10 | £5 | £20\n```'])
    assert.equal(one(src).type, 'block', src);
});

/* ── cards: the next step, the reply, and the lead card ───────────────────── */

test('A CARD NAMES ITS NEXT STEP AND ITS REPLY as roles, one of each', () => {
  assert.equal(cardFault(['title', 'next']), null);
  assert.equal(cardFault(['title', 'reply', 'next']), null);
  assert.equal(cardFault(['title', 'next', 'next']), 'more than one next');
  const L = cardLayout(['title', 'ring: Done', 'next', 'reply: Second opinion']) as ReturnType<typeof cardLayout> & { next: number; reply: number };
  assert.deepEqual([L.next, L.reply], [2, 3]);
});

test('THE NEXT STEP IS SAID AS "Next: ...", the reply sits under the title, and a card with neither draws neither', () => {
  const html = toHTML([drawn('```cards lead | The parts\ntitle | ring: Done | next | reply\nBox | 1/3 | Box quote | Ask two printers\nSite | 3/3 |  | \n```')]);
  assert.match(html, /<p class="cards-next">Next: Box quote<\/p>/u);
  assert.match(html, /<\/div><p class="cards-reply">Ask two printers<\/p>/u, 'the reply is the line under the head');
  assert.equal(html.match(/cards-next/gu)?.length, 1, 'a card with every step done has no next line, rather than an empty one');
  assert.equal(html.match(/cards-reply/gu)?.length, 1);
  /* THE LEAD IS THE FIRST CARD AND NO OTHER, and it is an attribute so the host's grid decides what two tracks are. */
  assert.equal(html.match(/data-lead/gu)?.length, 1);
  assert.match(html, /<li class="cards-item" data-lead="">[^]*?Box/u);
  assert.doesNotMatch(toHTML([drawn('```cards\ntitle | next\nBox | Box quote\n```')]), /data-lead/u, 'no lead form, no lead card');
});

/* ── steps path ───────────────────────────────────────────────────────────── */

test('A PATH MARKS ITS ROWS DONE, NEXT OR LATER, and a trailing count is the rest of it', async () => {
  const { pathFault, pathPlan } = await import('./path.ts');
  const rows = [['Sample the fit', 'maker', 'done'], ['Box quote', 'printer', 'next'], ['Pick a board', '', ''], ['more', '4']];
  assert.equal(pathFault(rows), null);
  const plan = pathPlan(rows.map((cells) => ({ cells })));
  assert.deepEqual(plan.stones.map((s) => s.mark), ['done', 'next', 'later']);
  assert.equal(plan.more, 4);

  assert.equal(pathFault([['A', '', 'doing']]), 'a mark "doing" where done, next or nothing goes');
  assert.equal(pathFault([['A', '', 'next'], ['B', '', 'next']]), 'two steps marked next');
  assert.equal(pathFault([['more', '4'], ['A', '', '']]), 'a step after the count of the rest');
  /* A STEP CALLED "more" IS A STEP. The count is two cells, and the app writes every stone as three. */
  assert.equal(pathPlan([{ cells: ['more', '4', ''] }]).stones.length, 1);
});

test('THE PATH IS DRAWN AS STONES IN ORDER, the next one said in words, and the count as "N more"', () => {
  const html = toHTML([drawn('```steps path | The path\nSample the fit | maker | done\nBox quote | printer | next\nPick a board |  | \nmore | 4\n```')]);
  assert.match(html, /<ol class="list" data-kind="steps" data-form="path">/u);
  assert.deepEqual([...html.matchAll(/data-mark="(\w+)"/gu)].map((m) => m[1]), ['done', 'next', 'later']);
  assert.match(html, /<span class="item-marker" role="img" aria-label="done">✓︎<\/span>/u);
  assert.match(html, /<span class="path-next">Next<\/span>/u);
  assert.match(html, /<p class="path-more">4 more<\/p>/u);
  assert.match(fixOf('```steps path\nA |  | doing\n```'), /A steps path has a mark "doing" where done, next or nothing goes/u);
  /* THE PLAIN FORM IS UNTOUCHED: its third cell is still a state, drawn as written. */
  assert.match(toHTML([drawn('```steps\nA | b | next\n```')]), /<span class="item-state">next<\/span>/u);
});

/* ── queue: an option's visual, and tiles ─────────────────────────────────── */

const QUEUE =
  '```queue tiles | Calls\nq | s1 | Claude | 2d ago | Which lining? | It sets the box | call\n' +
  'opt | s1 | navy | Navy | Reads as the logo | true | swatch:#1f3a5f,#c9a227\n' +
  'opt | s1 | sand | Sand |  |  | figure:EGP 1,200\n' +
  'opt | s1 | photo | As sampled |  |  | file:parts#2/photo\n```';

test('AN OPTION CARRIES WHAT IT IS in its seventh cell: colours, a figure, or a file the host resolves', () => {
  const block = drawn(QUEUE);
  const plan = queuePlan(block.rows) as ReturnType<typeof queuePlan> & { items: { options: { shows: unknown }[] }[] };
  assert.deepEqual(
    plan.items[0]!.options.map((o) => o.shows),
    [{ swatch: ['#1f3a5f', '#c9a227'] }, { figure: 'EGP 1,200' }, { file: { row: 'parts#2', field: 'photo' } }],
  );
  const html = toHTML([block], { file: (row: string, field: string) => `/files/${row}/${field}` } as never);
  assert.match(html, /<span class="queue-visual" data-shows="swatch" aria-hidden="true"><span class="queue-swatch" style="--swatch:#1f3a5f"><\/span><span class="queue-swatch" style="--swatch:#c9a227"><\/span><\/span>/u);
  assert.match(html, /<span class="queue-visual" data-shows="figure"><span class="queue-figure num">EGP 1,200<\/span><\/span>/u);
  assert.match(html, /<img class="queue-file" src="\/files\/parts#2\/photo" alt="">/u);
  /* A FILE THE HOST CANNOT PLACE IS NOT DRAWN, and neither is one it places on another host. */
  assert.doesNotMatch(toHTML([block]), /queue-file/u);
  assert.doesNotMatch(toHTML([block], { file: () => 'https://elsewhere.example/p.png' } as never), /queue-file/u);
});

test('A COLOUR FROM DATA IS DRAWN ONLY INSIDE ITS OPTION\'S BOX, and a visual that is not one of the three degrades', () => {
  const html = toHTML([drawn(QUEUE)]);
  /* Every hex in the output sits in a swatch, and every swatch in a visual. */
  const hexes = [...html.matchAll(/#[0-9a-fA-F]{6}/gu)].length;
  const boxed = [...html.matchAll(/<span class="queue-swatch" style="--swatch:#[0-9a-fA-F]{6}"><\/span>/gu)].length;
  assert.ok(boxed > 0);
  assert.equal(hexes, boxed, 'a hex outside a swatch');
  const visuals = [...html.matchAll(/<span class="queue-visual" data-shows="swatch" aria-hidden="true">((?:<span class="queue-swatch" style="[^"]*"><\/span>)+)<\/span>/gu)];
  assert.equal(visuals.reduce((n, m) => n + (m[1]!.match(/queue-swatch/gu)?.length ?? 0), 0), boxed, 'a swatch outside its option\'s visual');
  for (const bad of ['swatch:red', 'swatch:#1f3a5f;background:url(x)', 'swatch:', 'figure:', 'file:../../etc', 'colour:#1f3a5f'])
    assert.equal(queueFault([['q', 's1', 'a', 'b', 'c', 'd'], ['opt', 's1', 'k', 'K', '', '', bad]]), `a visual this build does not draw: "${bad}"`, bad);
  /* BUILT BY HAND, past the parser, the same cell is left out rather than written into a style. */
  const hand: Block = { type: 'block', kind: 'queue', raw: '', start: 0, end: 0, rows: [{ cells: ['q', 's1', 'a', '', 'Which?', ''] }, { cells: ['opt', 's1', 'k', 'K', '', '', 'swatch:#1f3a5f;background:url(x)'] }] };
  assert.doesNotMatch(toHTML([hand]), /queue-visual|style=/u);
});

test('TILES: one per question, the recommended option\'s visual on it, and every way to answer one press away', () => {
  const html = toHTML([drawn(QUEUE)]);
  assert.equal(html.match(/<article class="queue-card queue-tile"/gu)?.length, 1);
  assert.match(html, /<article class="queue-card queue-tile"[^>]*><span class="queue-visual" data-shows="swatch"/u, 'the visual leads the tile');
  assert.match(html, /<p class="queue-suggested">Recommended: Navy<\/p>/u);
  assert.match(html, /<details class="queue-ways"><summary class="queue-ways-toggle">3 ways to answer<\/summary><ul class="queue-options">/u);
  /* NOTHING IS PRE-CHOSEN, on a tile any more than on a card: the fold starts shut and no option is marked chosen. */
  assert.doesNotMatch(html, /<details[^>]* open/u);
  const plain = toHTML([drawn(QUEUE.replace('queue tiles', 'queue'))]);
  assert.doesNotMatch(plain, /queue-tile|queue-ways/u);
});

/* ── progress range ───────────────────────────────────────────────────────── */

test('A RANGE IS A BAND FROM LOW TO HIGH ON ONE SCALE, what was spent marked on it, and a total of the three', async () => {
  const { rangePlan } = (await import('./progress.ts')) as unknown as {
    rangePlan: (rows: { spent: string; low: string; high: string }[]) => {
      bars: { drawable: boolean; from: string; to: string; at: string | null; intent: string | undefined; range: string; spent: string }[];
      total: { spent: string; low: string; high: string };
    };
  };
  const plan = rangePlan([
    { spent: '£150.00', low: '£100.00', high: '£200.00' },
    { spent: '', low: '£300.00', high: '£400.00' },
    { spent: '£500.00', low: '£100.00', high: '£250.00' },
  ]);
  /* The scale is the largest figure on the block, 500 spent here, so the overspent mark stays on the track. */
  assert.deepEqual(plan.bars.map((b) => [b.from, b.to, b.at]), [['0.20', '0.40', '0.30'], ['0.60', '0.80', null], ['0.20', '0.50', '1.00']]);
  assert.deepEqual(plan.bars.map((b) => b.spent), ['£150.00 spent', 'Not spent', '£500.00 spent']);
  assert.deepEqual(plan.bars.map((b) => b.intent), [undefined, undefined, 'bad']);
  assert.equal(plan.bars[0]!.range, '£100.00 to £200.00');
  assert.deepEqual(plan.total, { spent: '£650.00', low: '£500.00', high: '£850.00' });
  /* POUNDS BESIDE DOLLARS ADD UP TO NOTHING, and the record refuses such a block, so a hand-built one says so. */
  assert.deepEqual(rangePlan([{ spent: '£1.00', low: '£1.00', high: '£2.00' }, { spent: 'USD 1.00', low: 'USD 1.00', high: 'USD 2.00' }]).total, { spent: '—', low: '—', high: '—' });
});

test('THE RANGE FORM DRAWS A BAND AND A MARK A ROW, and a total line under them', () => {
  const html = toHTML([drawn('```progress range | Budget\nBox | £150.00 | £100.00 | £200.00\nSite |  | £300.00 | £400.00\n```')]);
  assert.match(html, /<div class="prop progress" data-form="range">/u);
  assert.match(html, /<span class="progress-track" role="img" aria-label="Box: £150.00 spent, £100.00 to £200.00" style="--from:0.25;--to:0.50"><span class="progress-band"><\/span><span class="progress-at" style="--at:0.38"><\/span><\/span>/u);
  assert.match(html, /<span class="progress-value">Not spent<\/span>/u);
  assert.match(html, /<div class="progress-row" data-total=""><span class="progress-label">Total<\/span>/u);
  assert.match(html, /£150\.00 spent[^]*£400\.00 to £600\.00/u);
});

/* ── note lead ────────────────────────────────────────────────────────────── */

test('A LEAD NOTE IS A NOTE, marked as the screen\'s one sentence for the host to set', () => {
  const html = toHTML([drawn('```note lead\n3 of the 9 essential steps are done.\n```')]);
  assert.match(html, /<figure class="block block-panel" data-kind="note" data-form="lead" data-primitive="panel"><div class="panel measure"><p>3 of the 9 essential steps are done\.<\/p><\/div><\/figure>/u);
});

/* ── inputs ───────────────────────────────────────────────────────────────── */

const INPUTS = '```inputs | Price check\nprice | Price | money | EGP 1,200.00\nstage | Stage | enum:idea,sample,made | sample\nlaunched | Launched | bool | false\nopens | Opens | day | 2026-10-01\n```';

test('AN INPUTS ROW IS field, label, type and value, and a field it cannot type into degrades', async () => {
  const { inputsFault, inputsPlan } = await import('./inputs.ts');
  const block = drawn(INPUTS);
  const plan = inputsPlan(block.rows);
  assert.deepEqual(
    plan.fields.map((f) => [f.field, f.control.tag, f.control.type, f.control.inputmode ?? '', f.control.choices.join(',')]),
    [
      ['price', 'input', 'text', 'decimal', ''],
      ['stage', 'select', '', '', 'idea,sample,made'],
      ['launched', 'input', 'checkbox', '', ''],
      ['opens', 'input', 'date', '', ''],
    ],
  );
  assert.equal(inputsFault([['price', 'Price', 'ref', '']]), 'a field of a type nobody types into: "ref"');
  assert.equal(inputsFault([['Price!', 'Price', 'money', '']]), 'a field called "Price!", which is not a field id');
  assert.equal(inputsFault([['price', 'A', 'money', ''], ['price', 'B', 'money', '']]), 'the field "price" twice');
  assert.match(fixOf('```inputs\nprice | Price | ref | x\n```'), /An inputs block has a field of a type nobody types into/u);
  /* A WRITE-UP HAS NO ROW TO EDIT, so outside a page the kind degrades as every page-only kind does. */
  const [written] = parse('```inputs\nprice | Price | money | 1\n```');
  assert.equal(written?.type, 'degraded');
});

test('WITH NO HOST TO WRITE, INPUTS ARE A SPEC OF THE VALUES, so the mirror and the digest still read them', () => {
  const html = toHTML([drawn(INPUTS)]);
  assert.doesNotMatch(html, /<input|<select/u);
  assert.match(html, /<div class="rows" data-inputs=""><div class="row"><span class="row-label">Price<\/span><span class="row-value num">EGP 1,200\.00<\/span><span class="row-note"><\/span><\/div>/u);
});

test('WITH A HOST TO WRITE, EACH FIELD IS A LABELLED CONTROL of its type, and a value is a value, never markup', () => {
  const hostile = '<script>x</script>" onmouseover="y';
  const block = drawn(INPUTS.replace('EGP 1,200.00', hostile));
  /* Comments and the gaps between tags off, and the entities LEFT ON, because the escaping is what is being read. */
  const html = render(BlockView, { props: { block, oninput: () => {} } })
    .body.replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/>\s+</gu, '><');
  assert.match(html, /<label class="inputs-field"><span class="inputs-label">Price<\/span><input class="inputs-box" type="text" name="price" inputmode="decimal" autocomplete="off" value="&lt;script>x&lt;\/script>&quot; onmouseover=&quot;y"\s*\/?>/u);
  assert.match(html, /<select class="inputs-box" name="stage">/u);
  assert.match(html, /<option value="sample" selected(="")?>sample<\/option>/u);
  assert.match(html, /<input class="inputs-check" type="checkbox" name="launched"\s*\/?>/u);
  assert.match(html, /<input class="inputs-box" type="date" name="opens" autocomplete="off" value="2026-10-01"\s*\/?>/u);
  assert.doesNotMatch(html, /<script>/u);
  /* And with no callback the Svelte drawer draws the mirror's spec, control for control nothing. */
  assert.doesNotMatch(render(BlockView, { props: { block } }).body, /<input|<select/u);
});

/**
 * A SELECT WITH NOTHING SELECTED SHOWS ITS FIRST CHOICE, which is a value the record does not hold. Measured before this
 * was written: a blank `stage` and one of `retired`, a choice since taken off the list, both drew three options with
 * none selected, so the browser put "idea" in the box, and picking "idea" then fired no change, so the one value on
 * screen was the one value the person could not write.
 */
test('A CHOICE THE RECORD DOES NOT HOLD IS NEVER SHOWN AS THE ONE IT DOES, blank or off the list', () => {
  const selected = (value: string): string[] => {
    const block = drawn(`\`\`\`inputs\nstage | Stage | enum:idea,sample,made | ${value}\n\`\`\``);
    const html = render(BlockView, { props: { block, oninput: () => {} } }).body;
    return [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/gu)].filter((m) => /\bselected\b/u.test(m[1]!)).map((m) => m[2]!);
  };
  assert.deepEqual(selected('sample'), ['sample']);
  assert.deepEqual(selected(''), ['—'], 'a blank field shows the missing mark, not the first choice');
  assert.deepEqual(selected('retired'), ['retired'], 'a value off the list is shown as it stands');
});

/* ── the two drawers, one tree ────────────────────────────────────────────── */

const PARITY: Record<string, string> = {
  'cards with a lead, a next step and a reply': '```cards lead | The parts\ntitle | ring: Done | next | reply: Second opinion\nBox | 1/3 | Box quote | Ask two printers\nSite | 3/3 |  | \n```',
  'a path with its count': '```steps path | The path\nSample the fit | maker | done\nBox quote | printer | next\nPick a board |  | \nmore | 4\n```',
  'a path with nothing done': '```steps path\nA |  | next\nB |  | \n```',
  'queue tiles with every kind of visual': QUEUE,
  'a queue with visuals and no tiles': QUEUE.replace('queue tiles', 'queue'),
  'a range with a total': '```progress range | Budget\nBox | £150.00 | £100.00 | £200.00\nSite |  | £300.00 | £400.00\nPrint | £900.00 | £100.00 | £250.00 | warn\n```',
  'a lead note': '```note lead\n3 of the 9 essential steps are done.\n```',
  'inputs, read only': INPUTS,
};

for (const [name, src] of Object.entries(PARITY)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = drawn(src);
    const opts = { file: (row: string, field: string) => `/files/${row}/${field}` };
    assert.equal(tree(render(BlockView, { props: { block, opts } }).body), tree(toHTML([block], opts as never)));
  });
}

test('A TILE\'S WAYS TO ANSWER ARE BUTTONS WHERE THE HOST CAN ACT, and still nothing is chosen for the reader', () => {
  const html = render(BlockView, { props: { block: drawn(QUEUE), onact: () => {} } }).body;
  assert.equal(html.match(/<button type="button" class="queue-act"/gu)?.length, 3);
  assert.doesNotMatch(html, /aria-pressed|<details[^>]* open/u);
});
