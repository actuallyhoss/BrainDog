/**
 * The two renderers, compared as trees: the Svelte drawers compiled and rendered on the server,
 * against `toHTML`, for every shape a `cards`, `section`, `feed`, `queue`, `capture` and `diff` block can take,
 * and the figures that keep their numbers in a fold.
 *
 * "EQUAL BY CONSTRUCTION" WAS A PROMISE AND NOTHING KEPT IT. The rest of this package asserts the
 * Svelte side by reading its source as text, because a `.svelte` file cannot be mounted under
 * `node --test`. It can be compiled, though: Node's module hooks hand each `.svelte` file to the
 * compiler on the way in, and `svelte/server` renders the result to a string. The hydration markers
 * and the whitespace between tags are the only differences a browser does not also see, so those
 * are what `tree` takes away before the two are held equal.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    /* A runes module (`rows-as-cards.svelte.ts`, which `Table` reads) is TypeScript the compiler does not
       strip, so the types come off first. */
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};
const { default: Markdown } = (await import(new URL('../svelte/Markdown.svelte', import.meta.url).href)) as {
  default: Component<{ segment: unknown; opts: Record<string, unknown> }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)]
        .map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!))
        .sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const SHAPES: Record<string, string> = {
  'agents working now':
    '```cards\nmark: Project | title: Doing | who: Agent | fact: Next | when: Seen\nKiln | Fix the invoice export | Claude | Ship the fix | 3m ago | warn\nSite | Rewrite pricing | Codex |  | 2h ago\n```',
  'a run gone quiet, dimmed and still saying everything':
    '```cards\ntitle: Doing | who: Agent | fact: Project | when: Seen | quiet\nAxis QA | Claude | Kiln | 3m ago | \nReconcile | Claude | Portage | 2h ago | quiet | warn\n```',
  'people, named by their faces': '```cards\nwho: Name | fact: Role | fact: Met at | when: Seen\nAmara Lee | Designer | Kiln kickoff | 2d ago\nthe assistant | Agent |  | \n```',
  'figures, trends, rings and a link':
    '```cards\ntitle | figure: Owed to you | trend: Weekly | ring: Done\n[Kiln](/r/things/1) | GBP 4,800.00 | 18 20 - 24 | 3/5\nSite |  | 7 | 60%\nMarsh | USD 12.00 | 1 2 3 | nearly\n```',
  'no cards at all': '```cards\ntitle | fact: Role\n```',
  'a section with a count': '```section | Working now\n | 3 | \n```',
  'a section that counts nothing': '```section | Working now\n | 0 | \n```',
  'a folded section with a glyph': '```section | Parked and retired\nthing | 4 | fold\n```',
  'a section that is only a heading': '```section | From everywhere\n```',
  'a feed with bursts, a mark and a tone':
    '```feed\nagent | Claude | 14 | saves on [Variable axis QA](/r/things/4) | 3h ago\nrule | Late fees | 2 | reminders sent | 5h ago\n' +
    'seen | 2d ago\nagent | Codex |  | opened Kiln | 3d ago | bad\nyou | You | 1 | decision on Pricing | 4d ago\n```',
  'a feed row with nobody named': '```feed\nagent |  | 2 | saves | now\n```',
  'a feed with nothing new': '```feed\nseen | 2d ago\n```',
  'what each agent did, with a folded rest and a tone':
    '```agents\nClaude | 3 | changed [Write the notes](/r/tickets/2) | 3h ago\nCodex | 1 | added Fix login | 5h ago | warn\nClaude | 9 |  | 1d ago\n```',
  'no agent has done anything': '```agents\n```',
  'a feed with no mark yet': '```feed\nseen | \n```',
  /* `working: true`'s dot, on each primitive that draws one. What the app writes is three characters at
     the head of one cell, and if the two renderers read them differently one of them prints a glyph
     nobody asked for. */
  'a todo with an agent working on one of its rows': '```todo\n[ ] ●︎ Draft the September issue | due Friday\n[x] Send the quote | done\n```',
  /* A TODO'S THIRD AND FOURTH CELLS ARE ONE LINE, and a row with them blank draws no line at all: the
     blank row is what a page writes for every two-column todo, so the two sides disagreeing about it
     would be a difference on every task the product shows. */
  'a todo whose rows carry a due day and who changed them':
    '```todo\n[ ] Check the export | blocked on the bank | due 24 Sep | Claude, 3h ago\n[x] Send the quote |  | due 20 Sep\n[ ] ●︎ Proof the italics | review |  | [Codex](/r/sessions/4)\n[ ] Book the printer | waiting |  | \n```',
  'a timeline whose newest row is being worked on': '```timeline\n3h ago | ●︎ Specimen page rebuild | Codex picked it up | warn\n2d ago | Variable axis QA | Claude finished\n```',
  'steps with one being worked on': '```steps\n●︎ Cut the masters | Codex | running\nProof the italics |  | waiting\n```',
  'a board with an agent on one card': '```board\nDoing | ●︎ Write the notes | Claude\nDone | Fix login | Codex\n```',
  /* THE `table` PRIMITIVE, WHICH HAD NO SHAPE HERE AT ALL until adding one showed the two renderers
     drawing genuinely different trees: a scroll region on one side and none on the other, a
     `rowgroup` on one side and none on the other, `data-align` and `data-truncate` on every cell of
     one and neither on the other, a missing mark on one and a blank on the other, and two spellings
     of the same `--cols` track list. They are drawn from one set of decisions now (`src/table.ts`),
     and the one difference that remains is named and asserted below. */
  'a comparison of two columns': '```comparison\nWhat | Then | Now\nRetainer | £3,000.00 | £4,000.00\nHours | 40 | 52\n```',
  'a comparison with money, a cell nobody filled and one the row does not have': '```comparison\nAccount | Balance | Note\nCurrent | GBP 12,400.00 | \nSavings | EGP 43,700.00\nCard | −£190.00 | over\n```',
  'a comparison whose cells hold what looks like a link': '```comparison\nThing | Who\n[Kiln](/r/things/1) | Claude\n```',
  'a comparison of one column and one row': '```comparison\nOnly\nRow\n```',
  'a comparison with nothing in it at all': '```comparison\n```',
  'a comparison with an agent working on one of its rows': '```comparison\nTask | Who\n●︎ Variable axis QA | Claude\nProof the italics | Codex\n```',
  'a queue of two questions, one recommended, with more waiting':
    '```queue\nq | s1 | Claude | 3h ago | Raise the retainer? | [Kiln](/r/things/1) has run over for two months.\n' +
    'opt | s1 | raise | Raise it to £4,000 | Covers the overrun | true\nopt | s1 | leave | Leave it | Nothing changes yet | \n' +
    'q | s2 | Late fees | 1d ago | Chase invoice 2026-049? | \nopt | s2 | accept | Chase it | It is 12 days late | \n' +
    'opt | s2 | reject | Leave it |  | \nmore | 4\n```',
  /* THE COUNT AS A DOOR AND THE COUNT AS WORDS are two trees, and only one of them was ever drawn. */
  'a queue whose count of what is left says where the rest are':
    '```queue\nq | s1 | Claude | 3h ago | Raise the retainer? | \nopt | s1 | raise | Raise it |  | true\n' +
    'opt | s1 | leave | Leave it |  | \nmore | 5 | /decide\n```',
  'a queue with nothing waiting': '```queue\n```',
  /* A CAPTURE WITH NO HOST, which is the only capture `toHTML` can draw: the list, as a door where it has
     an address and as words where it has none. The field is the Svelte drawer's alone, tested below. */
  'a capture with nowhere to write and a door to its list':
    '```capture | What needs doing?\ninto | tasks | Tasks | /r/tasks?f=state:is:backlog\nset | state | backlog\n```',
  'a capture with nowhere to write and no door': '```capture\ninto | tasks\n```',
  /* THE FOUR BANDS, all four in one shape, because the chip is drawn per card and a shape carrying
     one proves the branch and not the table. */
  'a queue ranked by what each question would cost to get wrong':
    '```queue\nq | s1 | Claude | 3h ago | Turn the Estate pack off? |  | undo\n' +
    'opt | s1 | accept | Turn it off |  | \n' +
    'q | s2 | Slash | 1d ago | Install Money? |  | shape\nopt | s2 | accept | Install it |  | \n' +
    'q | s3 | Codex | 2d ago | Add 12 tasks from the plan? |  | rows\nopt | s3 | accept | Add them |  | \n' +
    'q | s4 | Claude | 3d ago | Raise the retainer? |  | call\nopt | s4 | raise | Raise it |  | \n```',
  /* A QUESTION WITH NO BAND DRAWS NO CHIP, on both surfaces. A host building a `Block` by hand has
     none, and every queue written before the ranking existed is this shape. (A band that is spelled
     and unknown is a FAULT and degrades the block, so it cannot be a parity shape: it is asserted in
     `queue.test.ts`.) */
  'a queue whose question came with no band':
    '```queue\nq | s1 | Claude | now | Which? | \nopt | s1 | a | A |  | \n```',
  'a diff with a change in the middle':
    '```diff | Deploy, v3 to v4\n  When a deploy fails,\n- retry once.\n+ retry twice,\n+ then page the owner.\n  Log the run.\n```',
  'a diff that folds its long runs':
    '```diff\n' +
    [...Array.from({ length: 9 }, (_, i) => `  line ${i + 1}`), '- line 10', '+ line ten', ...Array.from({ length: 10 }, (_, i) => `  line ${i + 11}`)].join('\n') +
    '\n```',
  'a diff with no change': '```diff\n  same\n  again\n```',
  'a stat in several currencies, one amount too long for a tile': '```stat\nCash now | EGP 43,700.00 · £24,800.00 · USD 21,300.00 | In more than one currency\nUsers | 36\n```',
  'a lead stat with trends and a tone':
    '```stat lead | Money\nCash now | GBP 12,400.00 | in 2 accounts · as of 2 Sep | 18 20 - 24 | good\nComing in | GBP 4,800.00 | 5 invoices, 2 late\nGoing out | GBP 1,300.00 | 7 bills | 3 | warn\nEvery month | EGP 900.00 |  | 1 2 3 4\n```',
  'a split with a tone, a part with no number and a hole':
    '```split | Where it goes\nPayroll | GBP 6,000.00 | 4 people\nRent | GBP 3,000.00 |  | warn\nRefunds | −£40.00\nTools | pending\nUncategorised | GBP 900.00 | 12 rows | hole\n```',
  'a split that is all zero': '```split\nA | 0\nB | 0 | none yet\n```',
  'a bridge that does not add up': '```bridge | This month\nStart | £9,000\nComing in | +£2,000 | 5 invoices\nGoing out | −£1,600\nEnd of month | £9,000\n```',
  'a bridge that goes under zero': '```bridge\nStart | 100\nTax | -300 | due 5 Nov\nEnd | -200\n```',
  'a bridge with a row that has no number': '```bridge\nStart | 100\nSomething | soon\nEnd | 100\n```',
  'a bridge of one row': '```bridge\nStart | 100\n```',
  'a series with net, a gap, a partial and an ahead bucket':
    '```series net\nMonth | in: Money in | out: Money out | state\nApr 2026 | £4,800.00 | £2,300.00 | \nMay 2026 |  |  | \nSep 2026 | £1,000.00 | £900.00 | partial\nOct 2026 | £2,000.00 |  | ahead\n```',
  'a series with no numbers at all': '```series | In and out\nMonth | Sales\nApr | \n```',
  'lines with a comparison, a gap and money': '```lines\nDay | Revenue | was: Previous 30 days\n1 Sep | £4,000.00 | £3,600.00\n2 Sep |  | £3,650.00\n3 Sep | £4,200.00 | £3,900.00\n```',
  'progress toward goals, one reached and one with no target':
    '```progress | Savings\nHoliday | £1,200.00 | £3,000.00 | by 1 Mar 2027\nNew laptop | £900.00 | £900.00\nSomeday |  | \n```',
  'a progress budget with one over and a tone': '```progress budget\nGroceries | £212.40 | £300.00 | this month\nEating out | £140.00 | £120.00\nTransport | £10.00 | £100.00 |  | info\n```',
  'lines of one plain column with no numbers': '```lines | Users\nDay | Users\n1 Sep | \n```',
  'a series of two plain columns': '```series\nQuarter | Sales | out: Costs\nQ1 | 10 | 4\nQ2 | 12 | 5\n```',
  'a forecast with a past, stems, knobs and a crossing':
    '```forecast\nopening | 2026-09-17 | Cash now | £34,850.00\npast | 2026-09-14 |  | £30,120.00\npast | 2026-09-15 |  | £31,000.00\npast | 2026-09-16 |  | £32,000.00\nstep | 2026-09-20 | Invoice 2026-049: type licensing | £960.00\nstep | 2026-10-01 | Corporation tax | −£40,100.00\nstep | 2026-11-02 | Retainer | £9,000.00\nhorizon | 90 |  | \nknobs | horizon late spend leave |  | \n```',
  'a forecast that goes under soon, with a late mark':
    '```forecast\nopening | 2026-09-17 | Cash now | £1,000.00\nstep | 2026-09-27 | Rent | −£2,000.00\nhorizon | 90 |  | \nknobs | late |  | \nlate | 12 |  | \nunder | 30 |  | \n```',
  'a forecast that stays above zero, with no past': '```forecast\nopening | 2026-09-17 | Cash now | USD 1,000.00\nstep | 2026-09-18 | Rent | USD −100.00\nhorizon | 30 |  | \n```',
  'a forecast with no opening row': '```forecast\nstep | 2026-09-18 | Rent | −£100.00\n```',
  'sparklines of two lengths, one with a gap': '```sparkline\nCash | 18 20 x 24 | 24\n | 1 2 | 2\n```',
  'a split with an unnamed part': '```split\nRent | 300\n | 100\n```',
  /* A LEDGER NEWEST FIRST, its days said once over their rows (`timeline.ts`), and one whose days never repeat. */
  'a timeline grouped by day': '```timeline\n1 Oct | Tesco | GBP −42.10\n1 Oct | Salary | GBP 3,100.00 | good\n30 Sep | Rent | GBP −1,200.00\n```',
  'a timeline whose days do not repeat': '```timeline\n1 Oct | Tesco\n30 Sep | Rent\n```',
  /* A CARD'S TREND FILLED BY THE RECORD, said as an array with a gap in it, beside a figure. */
  'cards whose trend the record filled': '```cards\ntitle | figure: Done | trend: By week\nBake | 12 | [3,null,5,4]\nNook |2 | 1,,2\nQuiet | 0 | \n```',
  /* A STAT'S FIGURE IS A HEADLINE, with no `.00` (`headlineFigure`), in a currency with a symbol and one without. */
  'a stat whose figures are headlines': '```stat\nCash now | GBP 33,850.00 | in 3 accounts · GBP 1,200.00 out\nIn Cairo | EGP 412,300.00 | \nSpent | GBP 12.50 | \nCame in | +EGP 850.00 | \n```',
  'sparklines, with one point and none':'```sparkline | Weekly\nCash | 18 20 19 24 | GBP 24.00 | good\nLonely | 7 | 7\nNone |  | \n```',
};

/**
 * The one difference between the two trees, taken off both sides so the rest can be held equal.
 *
 * `Table.svelte` puts `tabindex="0"` on exactly one cell and `-1` on every other, and moves it with
 * the arrow keys. That pair is ONE PROMISE: there is a caret in this grid and the arrows move it.
 * A static page has no key handler to keep it, so the mirror carries the focusable scroll region,
 * which a keyboard can still reach and scroll, and no cell tab stop at all. The reasoning is in
 * `src/table.ts`.
 *
 * TAKEN OFF BOTH SIDES AND THEN PINNED DOWN SEPARATELY, so the exception cannot quietly grow: the
 * test below asserts that the Svelte side has exactly one tab stop among its cells and the mirror
 * has none, which is a thing this strip would otherwise hide.
 */
const noRovingStop = (t: string): string =>
  t.replace(/<span [^>]*>/gu, (tag) => (tag.includes('role="gridcell"') ? tag.replace(/ tabindex="(?:0|-1)"/u, '') : tag));

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = page(src);
    const svelte = tree(render(Block, { props: { block } }).body);
    const html = tree(toHTML([block]));
    assert.equal(noRovingStop(svelte), noRovingStop(html));
  });
}

test('the roving tab stop is the whole of the difference: one cell in the app, none in the mirror', () => {
  const block = page(SHAPES['a comparison of two columns']!);
  const svelte = tree(render(Block, { props: { block } }).body);
  const html = tree(toHTML([block]));
  const cells = (t: string) => [...t.matchAll(/<span [^>]*role="gridcell"[^>]*>/gu)].map((m) => m[0]);
  assert.equal(cells(svelte).length, 6, 'two rows of three columns');
  assert.equal(cells(svelte).filter((c) => c.includes('tabindex="0"')).length, 1, 'a composite widget has exactly one tab stop');
  assert.equal(cells(svelte).filter((c) => c.includes('tabindex="-1"')).length, 5);
  assert.equal(cells(html).filter((c) => c.includes('tabindex')).length, 0, 'a static mirror promises no caret it cannot move');

  /* AND THE REGION IS REACHABLE ON BOTH, which is what makes withholding the cell stop acceptable:
     a wide table can still be scrolled with a keyboard in the mirror. */
  const tag = (t: string, cls: string) => [...t.matchAll(/<div [^>]*>/gu)].map((m) => m[0]).find((d) => d.includes(`class="${cls}"`)) ?? '';
  for (const t of [svelte, html]) {
    assert.ok(tag(t, 'table-region').includes('role="group"') && tag(t, 'table-region').includes('tabindex="0"'), tag(t, 'table-region'));
    assert.ok(tag(t, 'table').includes('role="grid"') && tag(t, 'table').includes('tabindex="-1"'), tag(t, 'table'));
  }

  /* AND THE STRIP IS NOT A BLANKET. It takes the attribute off a gridcell and off nothing else, so
     a tab stop that appeared anywhere new would still break the comparison above. */
  assert.equal(noRovingStop('<span class="x" role="gridcell" tabindex="0">'), '<span class="x" role="gridcell">');
  assert.equal(noRovingStop('<span class="x" tabindex="0">'), '<span class="x" tabindex="0">');
});

test('and the comparison is not vacuous: a tree that differs is told apart', () => {
  const a = tree(toHTML([page(SHAPES['a section with a count']!)]));
  const b = tree(toHTML([page(SHAPES['a section that counts nothing']!)]));
  assert.notEqual(a, b);
});

test('a forecast draws its knobs only where the host asks, and the rest of the tree is the same', () => {
  const block = page(SHAPES['a forecast with a past, stems, knobs and a crossing']!);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = render(Knobbed, { props: { block, opts: { scenario: true } } }).body;
  assert.match(knobs, /type="range"/u);
  assert.match(knobs, /role="switch"/u);
  assert.doesNotMatch(render(Block, { props: { block } }).body, /type="range"/u);
});

test('a capture draws its field only where the host can write, prompted by its heading, and no Add until there is text', () => {
  const block = page(SHAPES['a capture with nowhere to write and a door to its list']!);
  const Writable = Block as unknown as Component<{ block: BlockSegment; oncapture: (register: string, text: string, inherited: Record<string, string>) => void }>;
  const field = tree(render(Writable, { props: { block, oncapture: () => {} } }).body);
  const input = /<input [^>]*>/u.exec(field)?.[0] ?? '';
  for (const said of ['class="capture-input"', 'type="text"', 'placeholder="What needs doing?"', 'aria-label="What needs doing?"'])
    assert.ok(input.includes(said), `${said} is not on ${input || 'any input'}`);
  assert.doesNotMatch(field, /<button/u, 'an empty field has no Add beside it');
  assert.doesNotMatch(field, /disabled|capture-elsewhere|figcaption/u);
  const without = tree(render(Block, { props: { block } }).body);
  assert.doesNotMatch(without, /<input|<button|<form/u, 'with nowhere to write, nothing takes a key');
});

test('THE BOX STILL TICKS ON A ROW THAT CARRIES A LINE UNDER ITS TITLE, and is still named for the task alone', () => {
  const block = page(SHAPES['a todo whose rows carry a due day and who changed them']!);
  const Tickable = Block as unknown as Component<{ block: BlockSegment; ontick: (row: unknown, done: boolean) => void }>;
  const drawn = tree(render(Tickable, { props: { block, ontick: () => {} } }).body);
  const boxes = [...drawn.matchAll(/<button [^>]*>/gu)].map((m) => m[0]);
  assert.equal(boxes.length, 4, 'one box a row');
  for (const box of boxes) assert.ok(box.includes('role="checkbox"') && box.includes('aria-checked='), box);
  /* The due day and who changed the row are not the task, and a box named "Check the export, due
     24 Sep, Claude, 3h ago" is a control named after its row's metadata. */
  assert.ok(boxes[0]!.includes('aria-label="Check the export"'), boxes[0]);
  assert.ok(boxes[2]!.includes('aria-label="Proof the italics"'), boxes[2]);
  assert.equal(boxes.filter((b) => b.includes('tabindex="0"')).length, 1, 'one tab stop across the list');
  assert.equal((drawn.match(/class="item-meta"/gu) ?? []).length, 3, 'three rows carry the line and the blank one does not');
});

test('a figure longer than a tile holds says its longest amount, as drawn, and a short one says nothing', async () => {
  const { figureChars } = await import('./format.ts');
  assert.equal(figureChars('GBP 12,400.00'), null, 'drawn as £12,400.00, which any tile holds');
  assert.equal(figureChars('36'), null);
  assert.equal(figureChars('EGP 43,700.00 · £24,800.00 · USD 21,300.00'), 13);
  assert.equal(figureChars(''), null);
  assert.equal(figureChars('E£43,700.00 EGP · £24,800.00'), 15, 'the no-break space before the dot still separates two amounts');
  /* A stat's figure is a headline (`headlineFigure`), so the length that has to fit is the one said without `.00`. */
  const html = toHTML([page('```stat\nCash now | EGP 1,243,700.00 · USD 1.00\nUsers | 36\n```')]);
  assert.match(html, /<span class="cell-figure num" data-fit="" style="--chars:13">/u);
  assert.match(html, /<span class="cell-figure num">36<\/span>/u);
});

/* ── the host's `href` ─────────────────────────────────────────────────────── */

/**
 * WHERE THE HOST LIVES IS THE HOST'S TO SAY, and the record's text does not know it. A queue's "N more", a
 * capture's list, a table row, a `[label](/r/x)` note and a `{{ref:}}` are all written record-relative, as
 * `/decide` or `/r/things/1`, and this package drew them exactly so. Under a host served from `/app/<slug>` each
 * of those is outside the app: the web app shipped a `MutationObserver` over its `<main>` that rewrote every
 * root-path `href` after the renderer had drawn it, because the renderer had nowhere to be told.
 *
 * THIS STANDS IN FOR THAT HOST, and it is idempotent the way the app's `at()` is, because the renderer passes
 * the host's own answers (`link`, `cellHref`) through it too and some of those are rendered already.
 */
const under = (p: string): string => (p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/app/') ? `/app/acme${p}` : p);
const hrefsOf = (t: string): string[] => [...t.matchAll(/ href="([^"]*)"/gu)].map((m) => m[1]!);
const Hosted = Block as unknown as Component<{ block: BlockSegment; opts: Record<string, unknown> }>;

test('EVERY ADDRESS BOTH RENDERERS DRAW GOES THROUGH THE HOST\'S `href`, and the two trees still agree', () => {
  const opts = { href: under, link: (spoken: string) => `/r/${spoken.replace('#', '/')}` };
  const shapes = [
    SHAPES['a queue whose count of what is left says where the rest are']!,
    SHAPES['a capture with nowhere to write and a door to its list']!,
    SHAPES['figures, trends, rings and a link']!,
    '```feed\nagent | Claude | 2 | saves on {{ref:things#4}} | 3h ago\n```',
  ];
  const seen: string[] = [];
  for (const src of shapes) {
    const block = page(src);
    const svelte = tree(render(Hosted, { props: { block, opts } }).body);
    const html = tree(toHTML([block], opts));
    assert.equal(noRovingStop(svelte), noRovingStop(html), src);
    seen.push(...hrefsOf(svelte), ...hrefsOf(html));
  }
  assert.deepEqual(
    [...new Set(seen)].sort(),
    ['/app/acme/decide', '/app/acme/r/tasks?f=state:is:backlog', '/app/acme/r/things/1', '/app/acme/r/things/4'],
  );

  /* PROSE, which is where a note's `[label](/r/x)` is, through both markdown drawers. */
  const [prose] = parse('See [the export](/r/tasks/3) first.');
  assert.equal(prose?.type, 'markdown');
  assert.deepEqual(hrefsOf(tree(render(Markdown, { props: { segment: prose, opts } }).body)), ['/app/acme/r/tasks/3']);
  assert.deepEqual(hrefsOf(tree(toHTML([prose!], opts))), ['/app/acme/r/tasks/3']);
});

test('A HOST WITH NO `href` GETS THE ADDRESS AS WRITTEN, which is every host but the web app', () => {
  const block = page(SHAPES['a queue whose count of what is left says where the rest are']!);
  assert.deepEqual(hrefsOf(tree(render(Block, { props: { block } }).body)), ['/decide']);
  assert.deepEqual(hrefsOf(tree(toHTML([block]))), ['/decide']);
});

test('A TILE\'S DOOR GOES THROUGH IT TOO, although only the Svelte drawer draws the tile as a door', () => {
  const block = page('```stat\nCash now | GBP 12,400.00\n```');
  const tile = tree(render(Hosted, { props: { block, opts: { href: under, cellHref: () => '/p/money' } } }).body);
  assert.deepEqual(hrefsOf(tile), ['/app/acme/p/money']);
});

/* ── calendar, link, gallery and embed, the two card roles, a path's short view and a board's touch move ───────── */

/**
 * THE SHAPES THE FOUR NEWER KINDS AND THE TWO ROLES TAKE, drawn by both renderers with a host that serves files, so a
 * gallery's picture and a card's are in both trees. Every one of them is held to one tree after the two controls only
 * the Svelte drawer can draw are taken off, and the test after the loop pins those two down so the strip cannot grow.
 */
const DRAWN: Record<string, string> = {
  'a calendar over two months, a crowded day, a tone and a row with no day':
    '```calendar | Dates\nKiln launch | 2026-09-12\nPrinter call | 12 Sep 2026 | warn\n[Site](/r/things/2) | 2026-09-12\nQuote | 2026-09-12\nRenewal | 2026-10-03T09:00:00Z\nSomeday | soon\n```',
  'a calendar with no day that reads': '```calendar\nSomeday | soon\n```',
  'a calendar with nothing on it': '```calendar\n```',
  'links of every kind of address, and one with none': '```link | Useful\nThe spec | https://www.example.com/spec | read first\nWrite to us | mailto:hello@example.com\nThe plan | /p/plan\nNo address |  | later\n |  https://example.org\n```',
  'a gallery of a picture, a file that is not one, a file the host cannot serve and a caption alone':
    '```gallery\nThe glaze | file:parts#2/photo\nThe quote | quote.pdf\nNot served | file:parts#3/scan\nJust words | \n```',
  'a gallery with nothing in it': '```gallery\n```',
  'an embed of a video': '```embed\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ | The launch film | 16:9\n```',
  'an embed of a map, untitled and square': '```embed\nhttps://www.google.com/maps/embed?pb=!1m18 |  | 1:1\n```',
  'cards with a hue, one that is not a turn, and a picture': '```cards\ntitle | mark: Project | hue | picture\nKiln | Kiln | 120 | file:parts#2/photo\nSite | Site | 999 | \n```',
  'a path with a short view': '```steps path | The path\nshort | This week\nSample the fit | maker | done short\nBox quote | printer | next short\nPick a board |  | \nShip it |  | \nmore | 2\n```',
  'a path whose short view holds every stone': '```steps path\nshort | This week\nA |  | next short\nB |  | short\n```',
};

/** A host that serves the files of `parts#2` and nothing else, as a path of its own. */
const SERVES = { file: (row: string, field: string) => (row === 'parts#2' ? `/files/${row}/${field}` : null) };

/** The switch and the Load button, the two things only the Svelte drawer draws, taken off so the rest can be held equal. */
const noLocalControls = (t: string): string =>
  t
    .replace(/<div [^>]*class="path-switch"[^>]*>(?:<button [^>]*>[^<]*<\/button>)*<\/div>/u, '')
    .replace(/<button [^>]*class="embed-load"[^>]*>[^<]*<\/button>/u, '');

/**
 * SVELTE CLOSES A VOID TAG `<img ... />` WHERE THE MIRROR WRITES `<img ...>`, two spellings a parser reads as one
 * (`dynamic-forms.test.ts` says the same). `tree` sorts the attributes only of a tag that ends in a bare `>`, so a
 * gallery's picture and a card's would be compared unsorted on one side and sorted on the other.
 */
const unslashed = (h: string): string => h.replace(/\s*\/>/gu, '>');

for (const [name, src] of Object.entries(DRAWN)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = page(src);
    const svelte = tree(unslashed(render(Hosted, { props: { block, opts: SERVES } }).body));
    const html = tree(unslashed(toHTML([block], SERVES)));
    assert.equal(noLocalControls(svelte), noLocalControls(html));
  });
}

test('THE SWITCH AND THE LOAD BUTTON ARE THE WHOLE OF THE DIFFERENCE, each drawn once in the app and never in the mirror', () => {
  const path = page(DRAWN['a path with a short view']!);
  const app = tree(render(Block, { props: { block: path } }).body);
  const mirror = tree(toHTML([path]));
  const views = [...app.matchAll(/<button [^>]*class="path-view"[^>]*>([^<]*)<\/button>/gu)];
  assert.deepEqual(views.map((m) => m[1]), ['This week', 'Everything']);
  assert.ok(views[0]![0].includes('aria-pressed="true"'), 'the short view is the one drawn first');
  assert.ok(views[1]![0].includes('aria-pressed="false"'));
  assert.doesNotMatch(mirror, /path-switch|<button/u, 'a static mirror offers no switch it cannot turn');
  /* THE SHORT VIEW ON BOTH: its two stones, and a line for the two it left out, before the count of the rest. */
  for (const t of [app, mirror]) {
    assert.equal((t.match(/<li [^>]*data-short[^>]*>/gu) ?? []).length, 2, t);
    assert.match(t, /<p class="path-rest">2 more for when there's room<\/p><p class="path-more">2 more<\/p>/u);
  }

  const video = page(DRAWN['an embed of a video']!);
  const loads = tree(render(Block, { props: { block: video } }).body).match(/<button [^>]*class="embed-load"[^>]*>[^<]*<\/button>/gu) ?? [];
  assert.equal(loads.length, 1);
  assert.match(loads[0]!, />Load from YouTube</u);
  const drawn = tree(toHTML([video]));
  assert.doesNotMatch(drawn, /<button|<iframe/u, 'a facade in the mirror loads nothing and offers nothing to press');
  assert.match(drawn, /<a class="embed-open" href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ" rel="noreferrer">Open on YouTube<\/a>/u);
  assert.doesNotMatch(tree(render(Block, { props: { block: video } }).body), /<iframe/u, 'nothing is framed before a press');
});

test('A BOARD CARD CARRIES A "Move to" SELECT OF ITS LANES only where the host can move it, on its own lane', () => {
  const block = page('```board\nDoing | Write the notes | Claude\nDone | Fix login | Codex\nDoing | Proof | Amara\n```');
  const Movable = Block as unknown as Component<{ block: BlockSegment; onmove: (row: unknown, to: string) => void }>;
  const live = tree(render(Movable, { props: { block, onmove: () => {} } }).body);
  const selects = [...live.matchAll(/<select [^>]*>(.*?)<\/select>/gu)];
  assert.equal(selects.length, 3, 'one a card');
  for (const [whole] of selects) assert.ok(whole.includes('aria-label="Move to"') && whole.includes('class="board-move tap"'), whole);
  const chosen = selects.map(([, options]) => /<option [^>]*selected[^>]*value="([^"]*)"|<option [^>]*value="([^"]*)"[^>]*selected/u.exec(options ?? ''));
  assert.deepEqual(chosen.map((m) => m?.[1] ?? m?.[2]), ['Doing', 'Doing', 'Done'], 'each select opens on the lane its card is in');
  assert.equal(selects.filter(([whole]) => whole.includes('tabindex="0"')).length, 1, 'one tab stop across the board');
  assert.doesNotMatch(tree(render(Block, { props: { block } }).body), /<select/u, 'with nowhere to move to, nothing moves');
});

test('A STONE IS A TOGGLE NAMED FOR ITS STEP only where the host can write it, and a picture of one otherwise', () => {
  const block = page('```steps path\nSample the fit | maker | done\nBox quote | printer | next\nPick a board |  | \n```');
  const Pressable = Block as unknown as Component<{ block: BlockSegment; onpath: (row: unknown, done: boolean) => void }>;
  const live = tree(render(Pressable, { props: { block, onpath: () => {} } }).body);
  const stones = [...live.matchAll(/<button [^>]*>/gu)].map((m) => m[0]);
  assert.equal(stones.length, 3);
  assert.deepEqual(
    stones.map((s) => [/aria-label="([^"]*)"/u.exec(s)?.[1], /aria-checked="([^"]*)"/u.exec(s)?.[1]]),
    [['Sample the fit', 'true'], ['Box quote', 'false'], ['Pick a board', 'false']],
  );
  for (const s of stones) assert.ok(s.includes('role="checkbox"') && s.includes('tap'), s);
  assert.match(live, /<span class="path-next">Next<\/span>/u, 'the next stone still says so in a word');
  assert.doesNotMatch(tree(render(Block, { props: { block } }).body), /<button/u);
});

/* ── stat headlines, days, card trends and the row cursor ──────────────────── */

test('A STAT SAYS ITS FIGURE AS A HEADLINE in both renderers: £33,850 and EGP 412,300, and a fraction that is not zero stays', () => {
  const block = page(SHAPES['a stat whose figures are headlines']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const figures = [...drawn.matchAll(/<span class="cell-figure num"[^>]*>([\s\S]*?)<\/span>(?=<svg|<span class="cell-note")/gu)].map((m) =>
      m[1]!.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim(),
    );
    assert.deepEqual(figures, ['£33,850', 'EGP 412,300', '£12.50', '+EGP 850'], 'a sign written before a code stays in both');
    assert.match(drawn, /in 3 accounts · £1,200 out/u, 'the note under a figure is a headline too');
  }
});

test('A TIMELINE SAYS EACH DAY ONCE where days repeat, and leaves a timeline of distinct days as it was', () => {
  const grouped = toHTML([page(SHAPES['a timeline grouped by day']!)]);
  assert.deepEqual([...grouped.matchAll(/<li class="item-day num">([^<]*)<\/li>/gu)].map((m) => m[1]), ['1 Oct', '30 Sep']);
  assert.match(grouped, /<ul class="list" data-kind="timeline" data-days="">/u);
  assert.equal((grouped.match(/<span class="item-marker num"><\/span>/gu) ?? []).length, 3, 'each row leaves its own date blank');
  const plain = toHTML([page(SHAPES['a timeline whose days do not repeat']!)]);
  assert.doesNotMatch(plain, /item-day|data-days/u);
  assert.match(plain, /<span class="item-marker num">1 Oct<\/span>/u);
});

test('A CARD DRAWS A SMALL LINE FROM A TREND THE RECORD FILLED, named by its numbers, with the gap said as a gap', () => {
  const block = page(SHAPES['cards whose trend the record filled']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const names = [...drawn.matchAll(/<svg aria-label="([^"]*)" class="cards-trend"/gu)].map((m) => m[1]);
    assert.deepEqual(names, ['By week: 3, no value, 5, 4', 'By week: 1, no value, 2'], 'an empty trend draws no line');
  }
});

test('EVERY ROW CARRIES ITS KEY, and only the host\'s cursor marks one: the record\'s own key where it has one', () => {
  const block = page('```todo\n[ ] Check the export\n[ ] Send the quote\n```');
  block.rows[1] = { ...block.rows[1]!, ref: { register: 'tasks', seq: 12, version: 3 } };
  const bare = render(Block, { props: { block } }).body;
  assert.deepEqual([...bare.matchAll(/data-row="([^"]*)"/gu)].map((m) => m[1]), ['0', 'tasks#12']);
  assert.doesNotMatch(bare, /data-focused/u, 'with no cursor, nothing on the screen changes');
  const Walked = Block as unknown as Component<{ block: BlockSegment; cursor: string }>;
  const walked = render(Walked, { props: { block, cursor: 'tasks#12' } }).body;
  assert.match(walked, /<li class="item"[^>]*data-row="tasks#12"[^>]*data-focused=""/u);
  assert.equal((walked.match(/data-focused/gu) ?? []).length, 1);
});

test('A FEED LINE AND A QUEUE QUESTION CARRY THEIR KEYS TOO, and each option says the number key that answers it', () => {
  const queue = page(SHAPES['a queue of two questions, one recommended, with more waiting']!);
  const html = toHTML([queue]);
  assert.deepEqual([...html.matchAll(/<article [^>]*data-row="([^"]*)"/gu)].map((m) => m[1]), ['0', '3']);
  assert.deepEqual([...html.matchAll(/data-choice="(\d)"/gu)].map((m) => m[1]), ['1', '2', '1', '2']);
  const feed = toHTML([page(SHAPES['a feed with bursts, a mark and a tone']!)]);
  assert.deepEqual([...feed.matchAll(/<li class="feed-row"[^>]*data-row="([^"]*)"/gu)].map((m) => m[1]), ['0', '3', '1', '4'], 'grouped by who, each line keeping its own place');
});

test('THE KEY CAP IS DRAWN ON THE CURSOR\'S QUESTION ALONE, where the host can answer, and never in the mirror', () => {
  const block = page(SHAPES['a queue of two questions, one recommended, with more waiting']!);
  const Hosted = Block as unknown as Component<{ block: BlockSegment; cursor?: string; onact?: () => void }>;
  const keyed = render(Hosted, { props: { block, cursor: '3', onact: () => {} } }).body;
  const cards = keyed.split('<article').slice(1);
  assert.equal((cards[0]!.match(/class="queue-key"/gu) ?? []).length, 0);
  assert.deepEqual([...cards[1]!.matchAll(/<kbd class="queue-key" aria-hidden="true">(\d)<\/kbd>/gu)].map((m) => m[1]), ['1', '2']);
  assert.match(cards[1]!, /data-focused=""/u);
  assert.doesNotMatch(render(Hosted, { props: { block, cursor: '3' } }).body, /queue-key/u, 'no cap for a key that does nothing');
  assert.doesNotMatch(toHTML([block]), /queue-key/u);
});

test('SECONDARY LINES ARE MARKED CALM in both renderers: a task\'s due line, when a feed line happened, who asked a question', () => {
  for (const name of ['a todo whose rows carry a due day and who changed them', 'a feed with bursts, a mark and a tone', 'a queue of two questions, one recommended, with more waiting']) {
    const block = page(SHAPES[name]!);
    assert.match(toHTML([block]), /data-calm=""/u, name);
    assert.match(render(Block, { props: { block } }).body, /data-calm=""/u, name);
  }
});
