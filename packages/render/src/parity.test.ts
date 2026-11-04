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
import { UNNAMED } from './inline.ts';
import { forecastFigure, forecastModel, forecastPerMonth, inCurrency, largest, spendRange } from './forecast.ts';
import { writeAmount } from './money.ts';
import { BRIDGE_MIXED } from './bridge.ts';

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

/**
 * A late part's pattern id as its place on the page (`lateId` in the mirror, `$props.id()` in the app: each side mints
 * its own). Every id must be one of a kind and every `url(#…)` must name a pattern drawn, or the two are not one tree.
 */
function lateIds(html: string): string {
  const ids = [...html.matchAll(/<(?:pattern|linearGradient) [^>]*id="([^"]+)"/gu)].map((m) => m[1]!);
  assert.equal(new Set(ids).size, ids.length, `a pattern id is used twice: ${ids.join(', ')}`);
  for (const [, ref] of html.matchAll(/url\(#([^)]+)\)/gu)) assert.ok(ids.includes(ref!), `url(#${ref}) names no pattern`);
  /* THE MIRROR'S PAINT NAMES THE LATE RED AFTER ITS PATTERN (`lateFill`), because its ids repeat across two calls; the
     app's `$props.id()` never repeats, so the two are one paint with or without it, and the tree is read without it. */
  return ids.reduce((h, id, i) => h.replaceAll(`"${id}"`, `"late${i}"`).replaceAll(`#${id})`, `#late${i})`), html).replaceAll(LATE_FALLBACK, '');
}

/** What `lateFill` in `html.ts` writes after a late part's `url(#…)`. */
const LATE_FALLBACK = ' var(--chart-late, currentColor)';

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
function tree(html: string): string {
  return lateIds(html)
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

/** A walk the record measured everyday spending for: the `spent` row with its months, and four weeks of shares. */
const EVERYDAY =
  '```forecast\nopening | 2026-10-14 | Cash now | EGP 200,000.00\nhome | EGP |  | \nspent | 3 | 2026-07..2026-09 | EGP 41,200.00\nstep | 2026-10-21 | Everyday spending | EGP −9,507.69\nstep | 2026-10-28 | Everyday spending | EGP −9,507.69\nstep | 2026-11-01 | Rent | EGP −20,000.00\nstep | 2026-11-04 | Everyday spending | EGP −9,507.69\nstep | 2026-11-11 | Everyday spending | EGP −9,507.69\nhorizon | 30 |  | \nknobs | spend |  | \n```';

const SHAPES: Record<string, string> = {
  'agents working now':
    '```cards\nmark: Project | title: Doing | who: Agent | fact: Next | when: Seen\nKiln | Fix the invoice export | Claude | Ship the fix | 3m ago | warn\nSite | Rewrite pricing | Codex |  | 2h ago\n```',
  'a run gone quiet, dimmed and still saying everything':
    '```cards\ntitle: Doing | who: Agent | fact: Project | when: Seen | quiet\nAxis QA | Claude | Kiln | 3m ago | \nReconcile | Claude | Portage | 2h ago | quiet | warn\n```',
  'people, named by their faces': '```cards\nwho: Name | fact: Role | fact: Met at | when: Seen\nAmara Lee | Designer | Kiln kickoff | 2d ago\nthe assistant | Agent |  | \n```',
  'figures, trends, rings and a link':
    '```cards\ntitle | figure: Owed to you | trend: Weekly | ring: Done\n[Kiln](/r/things/1) | GBP 4,800.00 | 18 20 - 24 | 3/5\nSite |  | 7 | 60%\nDriftwood | USD 12.00 | 1 2 3 | nearly\n```',
  'no cards at all': '```cards\ntitle | fact: Role\n```',
  'a section with a count': '```section | Working now\n | 3 | \n```',
  'a section that counts nothing': '```section | Working now\n | 0 | \n```',
  'a folded section with a glyph': '```section | Parked and retired\nthing | 4 | fold\n```',
  'a section that is only a heading': '```section | From everywhere\n```',
  'a folded section whose well takes a tone': '```section | Needs you\nalert | 2 | fold | danger\n```',
  'a section whose tone is a word the well does not know': '```section | Paid\ncheck | 4 |  | loud\n```',
  'a feed with bursts, a mark and a tone':
    '```feed\nagent | Claude | 14 | saves on [Variable axis QA](/r/things/4) | 3h ago\nrule | Late fees | 2 | reminders sent | 5h ago\n' +
    'seen | 2d ago\nagent | Codex |  | opened Kiln | 3d ago | bad\nyou | You | 1 | decision on Pricing | 4d ago\n```',
  'a feed row with nobody named': '```feed\nagent |  | 2 | saves | now\n```',
  'a rule line that worded itself, with no who': '```feed\nrule |  |  | Tallyard categorised | now\nyou | You |  | paid it | 1h ago\n```',
  'a feed with nothing new': '```feed\nseen | 2d ago\n```',
  'what each agent did, with a folded rest and a tone':
    '```agents\nClaude | 3 | changed [Write the notes](/r/tickets/2) | 3h ago\nCodex | 1 | added Fix login | 5h ago | warn\nClaude | 9 |  | 1d ago\n```',
  'no agent has done anything': '```agents\n```',
  'a feed with no mark yet': '```feed\nseen | \n```',
  /* `working: true`'s dot, on each primitive that draws one. What the app writes is three characters at
     the head of one cell, and if the two renderers read them differently one of them prints a glyph
     nobody asked for. */
  'a todo with an agent working on one of its rows': '```todo\n[ ] ●︎ Draft the September issue | due Friday\n[x] Send the quote | done\n```',
  /* A TITLE LONG ENOUGH TO BE A NAME AND A QUIET REST, with the working dot in front of it. */
  'a todo whose title runs on past its first clause':
    '```todo\n[ ] ●︎ Review the Kiln payout batch before Friday. Check the three refunds Stripe flagged, then write back to both creators | due Friday\n```',
  /* A TODO'S THIRD AND FOURTH CELLS ARE ONE LINE, and a row with them blank draws no line at all: the
     blank row is what a page writes for every two-column todo, so the two sides disagreeing about it
     would be a difference on every task the product shows. */
  'a todo whose rows carry a due day and who changed them':
    '```todo\n[ ] Check the export | blocked on the bank | due 24 Sep | Claude, 3h ago\n[x] Send the quote |  | due 20 Sep\n[ ] ●︎ Proof the italics | review |  | [Codex](/r/sessions/4)\n[ ] Book the printer | waiting |  | \n```',
  'a timeline whose newest row is being worked on': '```timeline\n3h ago | ●︎ Specimen page rebuild | Codex picked it up | warn\n2d ago | Variable axis QA | Claude finished\n```',
  'steps with one being worked on': '```steps\n●︎ Cut the masters | Codex | running\nProof the italics |  | waiting\n```',
  'a board with an agent on one card': '```board\nDoing | ●︎ Write the notes | Claude\nDone | Fix login | Codex\n```',
  /* A BOARD CARD'S THIRD AND FOURTH CELLS ARE ONE LINE, as a todo's are: both, either alone, a blank fourth
     as a page pads it, and a row of three. */
  'a board whose cards carry a due day and who holds them':
    '```board\nDoing | Write the notes | due 24 Sep | Claude\nDoing | Proof the italics |  | [Codex](/r/sessions/4)\nDone | Fix login | due 20 Sep | \nDone | Send the quote | Amara\nOpen | Book the printer |  | \n```',
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
  /* THE LEAD FORM: the first question whole, what it recommends, why, and what accepting it changes; the second the
     card it always was, its own `does` line left for when it leads. */
  'a queue led by its first question, with what accepting it changes':
    '```queue lead\nq | s1 | Slash | 3h ago | Install Money? | You track three accounts by hand. | shape\n' +
    'does | s1 | Adds a Money page\ndoes | s1 | Adds **3** accounts to your things\n' +
    'opt | s1 | accept | Install it |  | true\nopt | s1 | reject | Not now |  | \n' +
    'q | s2 | Claude | 1d ago | Raise the retainer? |  | call\ndoes | s2 | Changes one figure\nopt | s2 | raise | Raise it |  | \nmore | 2 | /decide\n```',
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
  'a split drawn as a donut, with category colours and a late part':
    '```split donut | Spent\nOuting | EGP 19,533.00 | 18 lines | pink\nGifts | EGP 18,413.00 | 5 lines | violet\nOwed | EGP 900.00 |  | bad\nUnfiled | EGP 200.00 | 3 lines | hole\n```',
  'a split that is all zero': '```split\nA | 0\nB | 0 | none yet\n```',
  'a split with a late part, striped': '```split | Owed\nPaid | 600\nOverdue | 300 | 3 invoices | bad\nDue soon | 100 |  | warn\n```',
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
  /* ONE READING IS A FIGURE, under its measure's name and under none. */
  'lines of one reading': '```lines | Aov, Oxbow.gg\nDay | Aov, Oxbow.gg | was: Previous 30 days\n27 Sep |  | \n28 Sep | £24.10 | \n```',
  'lines of one reading under no heading': '```lines\nDay | Signups\n28 Sep | 14\n```',
  'lines of one reading on the second of two lines': '```lines | Revenue and costs\nDay | Revenue | Costs\n1 Sep |  | \n2 Sep |  | £5\n```',
  /* TWELVE NOISY READINGS HOLD NO TREND, so the chart says so under it (`lines-trend.ts`). */
  'lines with no clear trend': '```lines | Visits\nDay | Visits\n1 Sep | 20\n2 Sep | 5\n3 Sep | 31\n4 Sep | 8\n5 Sep | 26\n6 Sep | 12\n7 Sep | 3\n8 Sep | 29\n9 Sep | 14\n10 Sep | 22\n11 Sep | 6\n12 Sep | 18\n```',
  'a series of two plain columns': '```series\nQuarter | Sales | out: Costs\nQ1 | 10 | 4\nQ2 | 12 | 5\n```',
  'a forecast with a past, stems, knobs and a crossing':
    '```forecast\nopening | 2026-09-17 | Cash now | £34,850.00\npast | 2026-09-14 |  | £30,120.00\npast | 2026-09-15 |  | £31,000.00\npast | 2026-09-16 |  | £32,000.00\nstep | 2026-09-20 | Invoice 2026-049: type licensing | £960.00\nstep | 2026-10-01 | Corporation tax | −£40,100.00\nstep | 2026-11-02 | Retainer | £9,000.00\nhorizon | 90 |  | \nknobs | horizon late spend leave |  | \n```',
  'a forecast whose plans drop the line, each part numbered':
    '```forecast\nopening | 2026-10-27 | Cash now | EGP 500,000.00\nstep | 2026-10-31 | Pay | EGP 120,000.00\nstep | 2027-01-05 | Car, part 4 of 12 | EGP −90,000.00\nof | Car |  | \nstep | 2027-01-13 | House, part 2 of 30 | EGP −300,000.00\nof | House |  | \nhorizon | 84 |  | \n```',
  'a forecast that goes under soon, with a late mark':
    '```forecast\nopening | 2026-09-17 | Cash now | £1,000.00\nstep | 2026-09-27 | Rent | −£2,000.00\nhorizon | 90 |  | \nknobs | late |  | \nlate | 12 |  | \nunder | 30 |  | \n```',
  'a forecast whose page headline says when it runs out':
    '```forecast\nopening | 2026-09-03 | Cash now | £1,000.00\nstep | 2026-10-30 | Rent | −£2,000.00\nhorizon | 90 |  | \nheadline | under |  | \n```',
  'a forecast that stays above zero, with no past': '```forecast\nopening | 2026-09-17 | Cash now | USD 1,000.00\nstep | 2026-09-18 | Rent | USD −100.00\nhorizon | 30 |  | \n```',
  /* EVERYDAY SPENDING AS THE RECORD WALKS IT, a week's share every seventh day beside what it measured: one line of
     Every movement in both renderers, never a row a week. */
  'a forecast that spends every day, measured over three months': EVERYDAY,
  'a forecast with no opening row': '```forecast\nstep | 2026-09-18 | Rent | −£100.00\n```',
  /* A WALK OF TWO YEARS THAT OPENS ON THREE MONTHS, as Money's Cash ahead is: a lease and a bonus move only past it. */
  'a forecast that walks past the length it opens on':
    '```forecast\nopening | 2026-09-17 | Cash now | £1,000.00\nstep | 2026-10-01 | Salary | £2,000.00\nstep | 2026-11-01 | Salary | £2,000.00\nstep | 2026-12-01 | Salary | £2,000.00\nstep | 2026-10-20 | Refund | £40.00\nstep | 2027-03-01 | Lease | −£900.00\nstep | 2027-04-01 | Lease | −£900.00\nstep | 2027-06-01 | Bonus | £5,000.00\nhorizon | 90 |  | \nreach | 730 |  | \nknobs | horizon count |  | \n```',
  'sparklines of two lengths, one with a gap': '```sparkline\nCash | 18 20 x 24 | 24\n | 1 2 | 2\n```',
  'a split with an unnamed part': '```split\nRent | 300\n | 100\n```',
  /* A LEDGER NEWEST FIRST, its days said once over their rows (`timeline.ts`), and one whose days never repeat. */
  'a timeline grouped by day': '```timeline\n1 Oct | Tesco | GBP −42.10\n1 Oct | Salary | GBP 3,100.00 | good\n30 Sep | Rent | GBP −1,200.00\n```',
  'a timeline whose days do not repeat': '```timeline\n1 Oct | Tesco\n30 Sep | Rent\n```',
  /* A CARD'S TREND FILLED BY THE RECORD, said as an array with a gap in it, beside a figure. Three known points draw
     the line (Oxbow, and Nook as `String()` says an array); two are not a chart and Twice keeps its figure alone. */
  'cards whose trend the record filled':
    '```cards\ntitle | figure: Done | trend: By week\nOxbow | 12 | [3,null,5,4]\nNook | 2 | 1,,2,2\nTwice | 3 | 1,,2\nQuiet | 0 | \n```',
  /* A TREND AND NO FIGURE COLUMN. A run too short to draw prints its newest number as the card's figure (Twice, Once,
     and Flat, whose one count among noughts is a single fact); Drawn keeps its line; a run with no number says nothing. */
  'cards with a trend and no figure':
    '```cards\ntitle | trend: By week\nDrawn | 1 2 3\nTwice | 1,,2\nOnce | 7\nFlat | 0 0 4\nGap | [null,5,null]\nQuiet | \nWords | soon\n```',
  /* A STAT'S FIGURE IS A HEADLINE, with no `.00` (`headlineFigure`), in a currency with a symbol and one without. */
  'a stat whose line is the walk ahead, today and its lowest point marked':
    '```stat\nCash now | EGP 500,000.00 | Lowest EGP 7,000 on Wed 13 Jan | @2026-10-27 5000 4990 4800 6200 70 4100 4000 3900\nComing in, 30 days | EGP 250,000.00 | \n```',
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

/* A LONG BLOCK OF CARDS (`most.ts`): the app's "Show all N" and the export's "and N more" are the one difference, pinned in `most.test.ts`. */
const noShowAll = (t: string): string => t.replace(/<button [^>]*class="cards-all"[^>]*>Show all \d+<\/button>/u, '').replace(/<p class="cards-more">and \d+ more<\/p>/u, '');

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = page(src);
    const svelte = tree(render(Block, { props: { block } }).body);
    const html = tree(toHTML([block]));
    assert.equal(noShowAll(noRovingStop(svelte)), noShowAll(noRovingStop(html)));
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

test('a forecast offers its knobs only where the host asks, closed behind one Adjust, and the rest of the tree is the same', () => {
  const block = page(SHAPES['a forecast with a past, stems, knobs and a crossing']!);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = render(Knobbed, { props: { block, opts: { scenario: true } } }).body;
  /* CLOSED AT EVERY WIDTH: the twenty-seven switches and six sliders stood open under the chart at 1440. Adjust is a
     disclosure that names the knobs it opens, and they are in the page, hidden, until it is pressed. */
  const adjust = /<button type="button" class="forecast-tool forecast-adjust" data-adjust="" aria-expanded="false" aria-controls="([^"]+)">Adjust<\/button>/u.exec(knobs);
  assert.ok(adjust, 'Adjust is a closed disclosure');
  const fold = new RegExp(`<div class="forecast-knobs" data-inline="" id="${adjust[1]}" hidden="">`, 'u');
  assert.match(knobs, fold, 'the knobs Adjust controls are hidden until it is pressed');
  assert.equal(knobs.match(/type="range"/gu)?.length ?? 0, knobs.split(fold)[1]!.match(/type="range"/gu)?.length ?? 0, 'every slider is inside the fold');
  const plain = render(Block, { props: { block } }).body;
  assert.doesNotMatch(plain, /type="range"|data-adjust/u);
});

test('EVERY MOVEMENT IS INSIDE ADJUST WHERE ADJUST IS DRAWN, and under the chart where it is not, as toHTML draws it', () => {
  const block = page(SHAPES['a forecast with a past, stems, knobs and a crossing']!);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = tree(render(Knobbed, { props: { block, opts: { scenario: true } } }).body);
  /* WHAT THE KNOBS' DIV HOLDS, to its own closing tag and not the first `</div>` inside it. */
  const from = knobs.indexOf('<div class="forecast-knobs"');
  assert.ok(from > -1, 'the knobs are drawn');
  let depth = 0;
  let to = from;
  for (const m of knobs.slice(from).matchAll(/<(\/?)div\b/gu)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      to = from + m.index;
      break;
    }
  }
  assert.equal(knobs.match(/Every movement/gu)?.length, 1, 'drawn once');
  assert.match(knobs.slice(from, to), /<details class="forecast-numbers">/u, 'and inside the fold Adjust opens');
  const plain = tree(render(Block, { props: { block } }).body);
  assert.match(plain, /<details class="forecast-numbers">/u);
  assert.doesNotMatch(plain, /forecast-knobs/u, 'with no Adjust it stays under the chart');
});

test('WHAT COUNTS OFFERS WHAT THE CHART SHOWS: every switch is a movement both renderers list under it, and nothing past it', () => {
  const block = page(SHAPES['a forecast that walks past the length it opens on']!);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = tree(render(Knobbed, { props: { block, opts: { scenario: true } } }).body);
  const html = tree(toHTML([block]));
  const chips = [...knobs.matchAll(/<span class="forecast-chip-label">([^<]*)<\/span><span class="forecast-chip-amount num">([^<]*)<\/span>/gu)].map((m) => [m[1], m[2]]);
  /* THREE SALARIES AND THE REFUND, the four movements of the three months on screen, and not two years of salary. */
  assert.deepEqual(chips, [['Salary', '£6,000'], ['Refund', '£40']]);
  const table = (t: string): string => /<table class="forecast-table">[\s\S]*?<\/table>/u.exec(t)?.[0] ?? '';
  assert.ok(table(html), 'toHTML draws the movements');
  assert.equal(table(knobs), table(html), 'the two renderers list the same movements under the chart');
  for (const [label] of chips) assert.ok(table(html).includes(`>${label}<`), `${label} is offered and not listed`);
  for (const past of ['Lease', 'Bonus']) {
    assert.ok(!table(html).includes(past), `${past} moves past the three months on screen`);
    assert.ok(!chips.some(([label]) => label === past), `${past} is offered over a chart that does not reach it`);
  }
});

test('EVERYDAY SPENDING IS ONE LINE IN BOTH RENDERERS, and the control moves what was measured from no change', () => {
  const block = page(EVERYDAY);
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const knobs = tree(render(Knobbed, { props: { block, opts: { scenario: true } } }).body);
  const html = tree(toHTML([block]));
  const table = (t: string): string => decode(/<table class="forecast-table">[\s\S]*?<\/table>/u.exec(t)?.[0] ?? '').replaceAll('\u00a0', ' ');
  /* `tree` writes an empty attribute bare. */
  const line = '<tr data-everyday><td colspan="4">Everyday spending, measured from Jul to Sep: EGP 41,200 a month</td></tr>';
  for (const [name, t] of [['toHTML', html], ['the Svelte drawer', knobs]] as const) {
    assert.equal(table(t).split(line).length, 2, `${name} says the line once`);
    assert.doesNotMatch(table(t), /<td>Everyday spending<\/td>/u, `${name} lists no row a week`);
    assert.match(table(t), /<td>Rent<\/td>/u, `${name} still lists the bill`);
  }
  assert.equal(table(knobs), table(html), 'the two renderers list the same movements');
  /* THE CONTROL IS THE SVELTE DRAWER'S ALONE, and is the range `spendRange` offers, opening on no change. */
  const model = forecastModel(EVERYDAY.split('\n').slice(1, -1).map((l) => l.split('|').map((c) => c.trim())))!;
  const range = spendRange(model);
  assert.equal(range.min, -range.max);
  assert.ok(knobs.includes(`<span class="forecast-knob-name">Spend more or less each month</span>`), 'named for what it moves');
  const slider = /<input class="forecast-range" type="range"[^>]*>/u.exec(knobs.split('Spend more or less each month')[1] ?? '')?.[0] ?? '';
  assert.match(slider, new RegExp(`min="${range.min}"`, 'u'));
  assert.match(slider, new RegExp(`max="${range.max}"`, 'u'));
  assert.match(slider, /value="0"/u, 'opening on no change');
  assert.ok(knobs.includes('>No change<'), 'and says so');
  assert.doesNotMatch(knobs, /Spending the record doesn&#39;t know|Spending the record doesn't know/u);
});

/** The cells of a forecast's table, in order: what moved and the balance after it. */
const tableFigures = (t: string): string[] =>
  [...(/<table class="forecast-table">[\s\S]*?<\/table>/u.exec(t)?.[0] ?? '').matchAll(/<td class="num">([^<]*)<\/td>/gu)].map((m) => decode(m[1]!)).filter(Boolean);

/** A walk as a host writes it, every amount in the stored form, on a record whose own currency is `home`. */
const walkIn = (currency: string, home: string): string =>
  `\`\`\`forecast\nopening | 2026-09-17 | Cash now | ${currency} 34,850.00\nstep | 2026-09-20 | Invoice | ${currency} 960.00\nstep | 2026-10-01 | Tax | ${currency} −40,100.00\nhorizon | 90 |  | \nhome | ${home} |  | \nknobs | spend count |  | \n\`\`\``;

test('A FORECAST WRITES EVERY AMOUNT WITH THE ONE WRITER: the table reads the same in both renderers, in the home currency and in another', () => {
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  for (const currency of ['EGP', 'USD']) {
    const block = page(walkIn(currency, 'EGP'));
    /* `tree` makes every run of space one plain space, the space that joins a code to its figure among them. */
    const said = (minor: number): string => writeAmount({ minor, currency }, 'EGP', 'exact')!.text.replaceAll('\u00a0', ' ');
    const html = tree(toHTML([block]));
    const svelte = tree(render(Block, { props: { block } }).body);
    const wanted = [said(3_485_000), said(96_000), said(3_581_000), said(-4_010_000), said(-429_000)];
    assert.deepEqual(tableFigures(html), wanted, `${currency}: toHTML writes what the writer writes`);
    assert.deepEqual(tableFigures(svelte), wanted, `${currency}: the Svelte drawer writes what the writer writes`);
    assert.equal(svelte, html, `${currency}: and the two are one tree`);
    /* THE CHIPS AND THE SLIDER ARE THE SVELTE DRAWER'S ALONE, and are the same writer's, a fraction of noughts dropped. */
    const knobs = tree(render(Knobbed, { props: { block, opts: { scenario: true } } }).body);
    const read = (minor: number): string => writeAmount({ minor, currency }, 'EGP', 'read')!.text.replaceAll('\u00a0', ' ');
    const chips = [...knobs.matchAll(/<span class="forecast-chip-amount num">([^<]*)<\/span>/gu)].map((m) => decode(m[1]!));
    assert.deepEqual(chips, [read(96_000), read(-4_010_000)], `${currency}: what counts`);
    assert.ok(knobs.includes(`>${forecastPerMonth(read(0))}<`), `${currency}: the spend slider at rest`);
  }
  /* AND ANOTHER CURRENCY IS SAID BY ITS OWN SIGN (AM15), whatever the rule's table says. */
  const usd = tableFigures(tree(toHTML([page(walkIn('USD', 'EGP'))])));
  assert.ok(usd.every((f) => f.includes('$') && !f.includes('USD')), 'a dollar on a pound record says it is a dollar by its sign');
  assert.ok(usd[3]!.startsWith('−'), 'and what goes out has a true minus in front');
});

test('A BRIDGE TOLD THE HOME IS ONE TREE IN BOTH DRAWERS: the one writer spells every step, and two currencies are never added', () => {
  const Homed = Block as unknown as Component<{ block: BlockSegment; opts: { home: string } }>;
  const one = page('```bridge | This month\nStart | EGP 9,000.00\nComing in | EGP 2,000.00 | 5 invoices\nGoing out | EGP −1,600.00\nEnd of month | EGP 9,400.00\n```');
  const two = page('```bridge | This month\nStart | EGP 9,000.00\nComing in | USD 200.00\nEnd of month | EGP 9,200.00\n```');
  for (const [name, block] of [['one currency', one], ['two currencies', two]] as const) {
    const html = tree(toHTML([block], { home: 'EGP' }));
    const svelte = tree(render(Homed, { props: { block, opts: { home: 'EGP' } } }).body);
    assert.equal(svelte, html, `${name}: the two drawers are one tree`);
  }
  const said = (minor: number, currency: string): string => writeAmount({ minor, currency }, 'EGP', 'exact')!.text.replaceAll('\u00a0', ' ');
  const homed = tree(toHTML([one], { home: 'EGP' }));
  assert.ok(decode(homed).includes(`>${said(900_000, 'EGP')}<`), `the string drawer writes a step as the writer does: ${homed}`);
  assert.match(homed, /class="bridge-chart"/u, 'steps in one currency are drawn');
  const mixed = tree(toHTML([two], { home: 'EGP' }));
  assert.doesNotMatch(mixed, /class="bridge-chart"/u, 'steps in two currencies are not added into bars');
  assert.ok(decode(mixed).includes(BRIDGE_MIXED), 'and the warn line says why');
  assert.ok(decode(mixed).includes(said(20_000, 'USD')), 'the dollar step is said by its own sign on a pound record');
});

test('a walk shown in another currency is written by the same writer, and the model holds a currency and numbers', () => {
  const rows = [
    ['opening', '2026-09-17', 'Cash now', 'EGP 48,500.00'],
    ['step', '2026-10-01', 'Rent', 'EGP −12,125.00'],
    ['home', 'EGP', '', ''],
    ['show', 'EGP to USD', '2026-09-16', '0.02'],
  ];
  const own = forecastModel(rows)!;
  assert.equal(own.currency, 'EGP');
  assert.equal(forecastFigure(own, own.opening), writeAmount({ minor: 4_850_000, currency: 'EGP' }, 'EGP', 'exact')!.text);
  const shown = inCurrency(own, own.shows[0]!);
  assert.equal(shown.currency, 'USD');
  assert.equal(shown.opening, 970);
  assert.equal(forecastFigure(shown, shown.opening), writeAmount({ minor: 97_000, currency: 'USD' }, 'EGP', 'exact')!.text);
  assert.equal(forecastFigure(shown, shown.steps[0]!.delta, 'read'), writeAmount({ minor: -24_250, currency: 'USD' }, 'EGP', 'read')!.text);
  assert.equal(largest(shown)[0]!.amount, writeAmount({ minor: -24_250, currency: 'USD' }, 'EGP', 'exact')!.text);
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
  /* THE FIELD SAYS ITS HEADING, so it is marked bare and the host draws it with no heading row over it. */
  assert.match(field, /<form class="capture" data-bare>/u);
  const { heading: _named, ...unnamed } = block;
  assert.match(tree(render(Writable, { props: { block: unnamed, oncapture: () => {} } }).body), /<form class="capture">/u, 'with no heading of its own, nothing is marked');
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
 * `/decide` or `/r/things/1`, and this package drew them exactly so. Under a host served from `/<slug>` (`/app/<slug>`, as
 * the Cloud was then) each of those is outside the record on screen: the web app shipped a `MutationObserver` over its `<main>` that rewrote every
 * root-path `href` after the renderer had drawn it, because the renderer had nowhere to be told.
 *
 * THIS STANDS IN FOR THAT HOST, and it is idempotent the way the app's `at()` is, because the renderer passes
 * the host's own answers (`link`, `cellHref`) through it too and some of those are rendered already.
 */
const under = (p: string): string => (p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/acme/') ? `/acme${p}` : p);
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
    ['/acme/decide', '/acme/r/tasks?f=state:is:backlog', '/acme/r/things/1', '/acme/r/things/4'],
  );

  /* PROSE, which is where a note's `[label](/r/x)` is, through both markdown drawers. */
  const [prose] = parse('See [the export](/r/tasks/3) first.');
  assert.equal(prose?.type, 'markdown');
  assert.deepEqual(hrefsOf(tree(render(Markdown, { props: { segment: prose, opts } }).body)), ['/acme/r/tasks/3']);
  assert.deepEqual(hrefsOf(tree(toHTML([prose!], opts))), ['/acme/r/tasks/3']);
});

test('A HOST WITH NO `href` GETS THE ADDRESS AS WRITTEN, which is every host but the web app', () => {
  const block = page(SHAPES['a queue whose count of what is left says where the rest are']!);
  assert.deepEqual(hrefsOf(tree(render(Block, { props: { block } }).body)), ['/decide']);
  assert.deepEqual(hrefsOf(tree(toHTML([block]))), ['/decide']);
});

test('A TILE\'S DOOR GOES THROUGH IT TOO, although only the Svelte drawer draws the tile as a door', () => {
  const block = page('```stat\nCash now | GBP 12,400.00\n```');
  const tile = tree(render(Hosted, { props: { block, opts: { href: under, cellHref: () => '/p/money' } } }).body);
  assert.deepEqual(hrefsOf(tile), ['/acme/p/money']);
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
  'lanes in a window of one day, one still going, one cut at the start, a link, a tone and now':
    '```lanes | Today\nwindow | 2026-10-07T08:00:00+02:00 | 2026-10-07T18:00:00+02:00 | 2026-10-07T11:30:00+02:00\n' +
    '[Kiln sync](/r/things/2) | 2026-10-07T09:00:00+02:00 | 2026-10-07T10:30:00+02:00\n●︎ Fix the export | 2026-10-07T10:00:00+02:00 |  | warn\n' +
    'Night run | 2026-10-07T05:00:00+02:00 | 2026-10-07T08:30:00+02:00 | bad\nShipped | 2026-10-07T16:00:00+02:00 | 2026-10-07T16:00:00+02:00 | good\n' +
    'Tomorrow | 2026-10-08T09:00:00+02:00 | 2026-10-08T10:00:00+02:00\nSomeday | soon\n```',
  'lanes with no window, over whole days': '```lanes\nDesign | 2026-09-01 | 2026-09-10\nBuild | 2026-09-08 | 2026-09-30 | info\n```',
  'lanes whose rows all fail to read': '```lanes\nSomeday | soon\n```',
  'lanes with nothing in them': '```lanes\n```',
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

test('a question in the `call` band draws no "Your call" chip on either surface, and the other three bands still do', () => {
  const block = page(SHAPES['a queue ranked by what each question would cost to get wrong']!);
  for (const drawn of [render(Block, { props: { block } }).body, toHTML([block])]) {
    const chips = [...drawn.matchAll(/class="queue-cost" data-cost="([^"]*)"/gu)].map((m) => m[1]);
    assert.deepEqual(chips, ['undo', 'shape', 'rows']);
    assert.doesNotMatch(drawn, /Your call/u);
    /* AFTER THE WAYS TO ANSWER, NOT ON THE BY-LINE, where it floated alone in a calm, empty band (visual review 4). */
    assert.doesNotMatch(tree(drawn), /<p class="queue-by">(?:(?!<\/p>).)*queue-cost/u);
    assert.match(tree(drawn), /<\/ul><span class="queue-cost" data-cost="undo">Hard to undo<\/span>/u);
  }
});

/** A host with art for two glyphs: the row's and the chevron a settings row ends in. */
const ICONS = { icon: (name: string) => (name === 'sun' ? 'M12 3v2' : name === 'chevron-right' ? 'M9 18l6-6-6-6' : null) };

test('the two renderers draw one tree: settings-style link rows, a well before the title and a chevron after an in-app path', () => {
  const block = page('```link | Settings\nLook | /settings/look | Theme and type | sun\nHelp | https://example.com/help | Read first | sun\nNo art | /settings/x |  | moon\nNot a glyph | /settings/y |  | nonsense\n```');
  const svelte = tree(render(Hosted, { props: { block, opts: ICONS } }).body);
  const html = tree(toHTML([block], ICONS));
  assert.equal(svelte, html);
  const items = [...html.matchAll(/<li class="item">(.*?)<\/li>/gu)].map((m) => m[1]!);
  assert.equal(items.length, 4);
  assert.match(items[0]!, /^<span aria-hidden="true" class="link-well"><svg[^>]*><path d="M12 3v2">/u, 'the well is the first thing in the row, hidden');
  assert.match(items[0]!, /<span aria-hidden="true" class="link-chevron"><svg[^>]*><path d="M9 18l6-6-6-6">.*<\/span>$/u, 'an in-app row ends in a chevron');
  assert.doesNotMatch(items[1]!, /link-chevron/u, 'a row that leaves this BrainDog has no chevron');
  assert.match(items[2]!, /^<span aria-hidden="true" class="link-well"><\/span>/u, 'a glyph with no art keeps an empty well, so the titles line up');
  assert.doesNotMatch(items[3]!, /link-well|nonsense/u, 'a name that is no glyph is not drawn, and not read out');
});

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
  assert.deepEqual([...grouped.matchAll(/<span class="item-day-name">([^<]*)<\/span>/gu)].map((m) => m[1]), ['1 Oct', '30 Sep']);
  /* A DAY OF TWO LINES IN ONE CURRENCY SAYS ITS NET at the heading's end, and a day of one line does not say it twice. */
  assert.deepEqual([...grouped.matchAll(/<span class="item-day-net">([^<]*)<\/span>/gu)].map((m) => m[1]), ['+GBP 3,057.90']);
  assert.match(grouped, /<ul class="list" data-kind="timeline" data-days="">/u);
  assert.equal((grouped.match(/<span class="item-marker num"><\/span>/gu) ?? []).length, 3, 'each row leaves its own date blank');
  const plain = toHTML([page(SHAPES['a timeline whose days do not repeat']!)]);
  assert.doesNotMatch(plain, /item-day|data-days/u);
  assert.match(plain, /<span class="item-marker num">1 Oct<\/span>/u);
});

test('A LEDGER ROW WEARS ITS CHIP AND THE LINE UNDER ITS TITLE, money in is marked, and both renderers draw one tree', () => {
  const opts = {
    now: Date.UTC(2026, 9, 27, 12),
    icon: (name: string) => (name === 'sun' ? 'M12 3v2' : null),
    approx: (figure: string) => (figure.includes('USD') ? '≈ EGP 51,744' : null),
  };
  const ledger = page(
    '```timeline\n26 Oct 2026 | Kerbside Deli | −EGP 291.36 | Eating out | Card | sun pink\n26 Oct 2026 | Pay | +USD 1,000.00 | Pay | Bank | moon\n25 Oct 2026 | 0110 InstaPay | −EGP 1,501.50 |  | Bank | ?\n```',
  );
  const html = tree(toHTML([ledger], opts));
  assert.equal(tree(render(Hosted, { props: { block: ledger, opts } }).body), html);
  const items = [...html.matchAll(/<li class="item"[^>]*>(.*?)<\/li>/gu)].map((m) => m[1]!);
  assert.equal(items.length, 3);
  assert.match(items[0]!, /^<span aria-hidden="true" class="item-chip" data-slot="pink"><svg[^>]*><path d="M12 3v2">/u, 'a glyph with art on its colour');
  assert.match(items[0]!, /<span class="item-under">Eating out · Card<\/span>/u, 'the two parts joined by a dot');
  assert.match(items[1]!, /^<span aria-hidden="true" class="item-chip" data-slot="[a-z]+">P<\/span>/u, 'a glyph with no art is the title\'s letter, on its category\'s colour');
  assert.match(items[1]!, /<span class="item-detail" data-sign="in">/u, 'money in is marked');
  assert.match(items[1]!, /<span class="item-approx num">≈ EGP 51,744<\/span>/u, 'the host restates another currency');
  assert.doesNotMatch(items[0]!, /item-approx/u, 'and not the home one');
  assert.match(items[2]!, /^<span aria-hidden="true" class="item-chip" data-unfiled title="No category yet\. Open the line to file it\.">\?<\/span>/u, 'a line nothing filed, with its hint');
  assert.match(items[2]!, /<span class="item-under">Bank<\/span>/u, 'no dot stands alone');
  assert.match(html, /<span class="item-day-name">Mon 26 Oct<\/span>/u);
  assert.doesNotMatch(html, /item-day-net/u, 'two currencies on one day are never one sum');

  /* A LIST OF WHAT IS COMING, EACH ON A DAY OF ITS OWN, says the day in the line under the title. */
  const coming = page('```timeline\n31 Oct 2026 | Pay | +USD 4,012.46 | in 4 days\n15 Nov 2026 | Premium | −USD 287.15 | in 19 days | | | bad\n```');
  const said = tree(toHTML([coming], opts));
  assert.equal(tree(render(Hosted, { props: { block: coming, opts } }).body), said);
  assert.match(said, /<span class="item-under">31 Oct · in 4 days<\/span>/u);
  assert.match(said, /data-intent="bad"/u, 'a tone past the six cells is still the row\'s tone');
});

test('A DAY THIS YEAR DROPS ITS YEAR AND AN AMOUNT OF NOTHING IS NOT SAID, on a timeline and on rows, in both renderers', () => {
  const opts = { now: Date.UTC(2026, 9, 2, 12) };
  const due = page('```timeline\n1 Jul 2026 | Legal review | −GBP 9,190.00\n1 Jul 2026 | Wildcard certificate | −GBP 0.00\n28 Dec 2025 | Old bill | −GBP 12.00\n```');
  const spec = page('```spec\nAiming for | 20 Sep 2026 | \nMoved | +GBP 0.00 | 1 Jul 2026\nBalance | GBP 0.00 | \n```');
  for (const block of [due, spec]) assert.equal(tree(render(Hosted, { props: { block, opts } }).body), tree(toHTML([block], opts)));
  const timeline = tree(toHTML([due], opts));
  assert.deepEqual([...timeline.matchAll(/<span class="item-day-name">([^<]*)<\/span>/gu)].map((m) => m[1]), ['Wed 1 Jul', 'Sun 28 Dec 2025'], 'with its weekday');
  assert.match(timeline, /Wildcard certificate<\/span><span class="item-detail"><\/span>/u, 'not −£0');
  const rows = tree(toHTML([spec], opts));
  assert.match(rows, /<span class="row-value num">20 Sep<\/span>/u);
  assert.match(rows, /<span class="row-value"><\/span><span class="row-note">1 Jul<\/span>/u, 'money that moved by nothing says nothing, not a dash');
  assert.match(rows, /<span class="row-value num">GBP 0\.00<\/span>/u, 'a balance of nothing is still said');
});

test('A CARD DRAWS A SMALL LINE FROM A TREND THE RECORD FILLED, named by its numbers, with the gap said as a gap', () => {
  const block = page(SHAPES['cards whose trend the record filled']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const names = [...drawn.matchAll(/<svg aria-label="([^"]*)" class="cards-trend"/gu)].map((m) => m[1]);
    assert.deepEqual(names, ['By week: 3, no value, 5, 4', 'By week: 1, no value, 2, 2'], 'two points are not a chart, and an empty trend draws no line');
  }
});

test('A RUN TOO SHORT TO DRAW PRINTS ITS NEWEST NUMBER where the card has no figure column, in both drawers', () => {
  const block = page(SHAPES['cards with a trend and no figure']!);
  const figures = (drawn: string) => [...drawn.matchAll(/<span class="cards-figure"><span class="cards-value num">([^<]*)<\/span><span class="cards-label">([^<]*)<\/span><\/span>/gu)].map((m) => `${m[1]} ${m[2]}`);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    assert.deepEqual(figures(drawn), ['2 By week', '7 By week', '4 By week', '5 By week'], 'the newest known value, under the trend\'s name');
    assert.equal([...drawn.matchAll(/class="cards-trend"/gu)].length, 1, 'and the run long enough is still the one line');
    assert.equal([...drawn.matchAll(/<div class="cards-body">/gu)].length, 5, 'a card with no number in its run has no body');
  }
  /* WITH A FIGURE COLUMN THE CARD KEEPS ITS FIGURE ALONE, as batch 60 left it: Twice says 3, never 2. */
  const beside = page(SHAPES['cards whose trend the record filled']!);
  for (const drawn of [toHTML([beside]), render(Block, { props: { block: beside } }).body].map(tree)) assert.deepEqual(figures(drawn), ['12 Done', '2 Done', '3 Done', '0 Done']);
});

test("A CARD WITH EDIT AND NO WRITER IS THE MIRROR'S TEXT: the box is drawn only where the host hands a writer", () => {
  const src = '```cards\ntitle: Name | reply\nOxbow | A kiln for hire\n```';
  const opts = { edits: [null, { field: 'about', max: 120 }] };
  assert.equal(tree(render(Block as Component<{ block: BlockSegment; opts?: unknown }>, { props: { block: page(src), opts } }).body), tree(toHTML([page(src)])));
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

test('SECONDARY LINES ARE MARKED CALM in both renderers: when a feed line happened, who asked a question', () => {
  for (const name of ['a feed with bursts, a mark and a tone', 'a queue of two questions, one recommended, with more waiting']) {
    const block = page(SHAPES[name]!);
    assert.match(toHTML([block]), /data-calm=""/u, name);
    assert.match(render(Block, { props: { block } }).body, /data-calm=""/u, name);
  }
});

test('BUT A TASK\'S LINE IS NEVER CALM (the verifier\'s H10): when it falls due and its project are what Work is read for', () => {
  const block = page(SHAPES['a todo whose rows carry a due day and who changed them']!);
  assert.doesNotMatch(toHTML([block]), /class="item-meta" data-calm/u);
  assert.doesNotMatch(render(Block, { props: { block } }).body, /class="item-meta" data-calm/u);
});

/* ── a task's two verbs, a queue's lead and bulk choice, and the filter strip ─────────────────────── */

const TASKS = '```todo\n[ ] Check the export | blocked on the bank | due 24 Sep | \n[x] Send the quote\n[ ] [Kiln](/r/things/1) launch\n```';
type Verbs = { block: BlockSegment; onopen?: (row: unknown) => void; onmenu?: (row: unknown, anchor: unknown) => void };

test('A TASK\'S TITLE OPENS IT AND ITS MORE CONTROL IS QUIET only where the host passes each, and neither touches the box', () => {
  const block = page(TASKS);
  const Verbed = Block as unknown as Component<Verbs>;
  const bare = tree(render(Block, { props: { block } }).body);
  assert.equal(bare, tree(toHTML([block])), 'with neither, the markup is the mirror\'s');
  assert.doesNotMatch(bare, /item-open|item-more|<button/u);

  const opened = tree(render(Verbed, { props: { block, onopen: () => {} } }).body);
  const titles = [...opened.matchAll(/<span class="item-title"><button class="item-open" tabindex="(?:0|-1)" type="button">([^<]*)<\/button><\/span>/gu)].map((m) => m[1]);
  assert.deepEqual(titles, ['Check the export', 'Send the quote', 'Kiln launch'], 'a link in a title is its words inside the button');
  assert.doesNotMatch(opened, /<button[^>]*><a /u, 'no link inside a button');
  assert.doesNotMatch(opened, /item-more/u);

  const menued = tree(render(Verbed, { props: { block, onmenu: () => {} } }).body);
  const more = [...menued.matchAll(/<button [^>]*class="item-more tap"[^>]*>/gu)].map((m) => m[0]);
  assert.equal(more.length, 3, 'one a task');
  for (const b of more) assert.ok(b.includes('data-calm') && b.includes('aria-haspopup="menu"'), b);
  /* A long list is one Tab stop and not two a task: the title and the menu ride the box's roving tabindex. */
  assert.deepEqual(more.map((b) => /tabindex="(-?\d)"/u.exec(b)?.[1]), ['0', '-1', '-1']);
  assert.equal((opened.match(/class="item-open" tabindex="0"/gu) ?? []).length, 1);
  assert.ok(more[0]!.includes('aria-label="More for Check the export"'), more[0]);
  assert.doesNotMatch(menued, /item-open/u);
  /* The row is the host of its menu, so a right-click on it opens the same one, and only with a menu to open. */
  assert.equal((menued.match(/<li class="item" data-menu-host data-row=/gu) ?? []).length, 3, 'a right-click on a task opens its menu');
  assert.doesNotMatch(bare, /data-menu-host/u);
  /* The rest of the row is the mirror's, the control and its host mark taken off. */
  assert.equal(menued.replace(/<button [^>]*class="item-more tap"[^>]*>.*?<\/button>/gu, '').replaceAll(' data-menu-host', ''), bare);
});

test('THE LEAD QUESTION IS DRAWN WHOLE in both renderers, and only the first: its recommendation, why and what it changes', () => {
  const block = page(SHAPES['a queue led by its first question, with what accepting it changes']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const cards = drawn.split('<article').slice(1);
    assert.equal(cards.length, 2);
    assert.match(cards[0]!, /class="queue-card queue-lead"/u);
    assert.match(cards[0]!, /<p class="queue-suggested">Recommended: Install it<\/p>/u);
    assert.match(cards[0]!, /<p class="queue-why">You track three accounts by hand\.<\/p>/u);
    assert.match(cards[0]!, /<ul aria-label="What it changes" class="queue-does"><li class="queue-does-line">Adds a Money page<\/li><li class="queue-does-line">Adds <strong>3<\/strong> accounts to your things<\/li><\/ul>/u);
    assert.match(cards[1]!, /^ class="queue-card"/u);
    assert.doesNotMatch(cards[1]!, /queue-does|queue-suggested/u, 'a card under the lead keeps its consequences for when it leads');
  }
});

test('ONLY THE FIRST CARD SAYS WHY UNDER EACH WAY, in both renderers: the rest are question and pills, their reasons folded', () => {
  const block = page(SHAPES['a queue of two questions, one recommended, with more waiting']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const cards = drawn.split('<article').slice(1);
    assert.match(cards[0]!, /<span class="queue-because" data-calm>Covers the overrun<\/span>/u);
    assert.match(cards[0]!, /class="queue-why"/u);
    assert.doesNotMatch(cards[0]!, /queue-reasons/u);
    assert.doesNotMatch(cards[1]!, /queue-because/u, 'no reason under a pill on a card nobody is on yet');
    assert.match(cards[1]!, /<details class="queue-ways queue-reasons"><summary class="queue-ways-toggle">Why\?<\/summary>/u);
    assert.match(cards[1]!, /<li class="queue-reason"><span class="queue-reason-label">Chase it<\/span> It is 12 days late<\/li>/u);
    assert.doesNotMatch(cards[1]!, /queue-reason-label">Leave it/u, 'an option with no reason has no line in the fold');
  }
});

test('A CARD GRID SAYS HOW MANY CARDS IT HOLDS, in both renderers, so it never takes more columns than cards', () => {
  const grid = (n: number) => page(`\`\`\`cards\ntitle\n${Array.from({ length: n }, (_, i) => `Card ${i + 1}`).join('\n')}\n\`\`\``);
  for (const [n, word] of [[1, '1'], [3, '3'], [4, 'many'], [9, 'many']] as const) {
    const block = grid(n);
    for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body]) assert.match(drawn, new RegExp(`<ul class="cards-grid" data-cards="${word}">`, 'u'), `${n} cards`);
  }
});

test('A RULE LINE THAT WORDED ITSELF DRAWS NO WHO, where a line from anyone else with no name still marks the hole', () => {
  const block = page(SHAPES['a rule line that worded itself, with no who']!);
  for (const drawn of [toHTML([block]), render(Block, { props: { block } }).body].map(tree)) {
    const rule = /<div class="feed-group" data-by="rule">.*?<\/div>/u.exec(drawn)?.[0] ?? '';
    assert.match(rule, /<span class="feed-what">Tallyard categorised<\/span>/u, rule);
    assert.doesNotMatch(rule, /feed-who/u);
  }
  const nobody = toHTML([page(SHAPES['a feed row with nobody named']!)]);
  assert.match(nobody, /<span class="feed-who">/u);
});

test('A QUESTION CARRIES A BOX FOR ONE ANSWER IN BULK only where the host takes one, named for the question', () => {
  const block = page(SHAPES['a queue of two questions, one recommended, with more waiting']!);
  type Select = { block: BlockSegment; onselect?: (row: unknown, on: boolean) => void; selected?: string[] };
  const Selectable = Block as unknown as Component<Select>;
  assert.doesNotMatch(render(Block, { props: { block } }).body, /queue-select|data-selected/u);
  const live = tree(render(Selectable, { props: { block, onselect: () => {}, selected: ['3'] } }).body);
  const boxes = [...live.matchAll(/<button [^>]*class="queue-select tap"[^>]*>/gu)].map((m) => m[0]);
  assert.equal(boxes.length, 2);
  for (const b of boxes) assert.ok(b.includes('role="checkbox"'), b);
  assert.ok(boxes[0]!.includes('aria-checked="false"') && boxes[0]!.includes('aria-label="Raise the retainer?"'), boxes[0]);
  assert.ok(boxes[1]!.includes('aria-checked="true"') && boxes[1]!.includes('aria-label="Chase invoice 2026-049?"'), boxes[1]);
  assert.equal((live.match(/data-selected/gu) ?? []).length, 1, 'the host\'s choice is the one marked');
});

const { default: Filters } = (await import(new URL('../svelte/Filters.svelte', import.meta.url).href)) as {
  default: Component<{ filters: unknown; chosen?: Record<string, string>; onfilter?: (field: string, value: string | null) => void }>;
};
const { filtersHTML } = await import('./html.ts');
const FILTERS = [
  { field: 'project', label: 'Project', values: ['Oxbow', 'Nook', 'Kiln', 'Site', 'Driftwood', 'Estate', 'Quiet'].map((label, i) => ({ value: String(i + 1), label, count: 9 - i })) },
  { field: 'whose', label: 'Whose', control: 'segmented' as const, values: [{ value: 'mine', label: 'Mine', count: 4 }, { value: 'agents', label: 'Agents', count: 2 }] },
  { field: 'empty', label: 'Nothing to choose', values: [{ value: 'x', label: 'Only', count: 1 }] },
];

test('THE FILTER STRIP IS ONE TREE IN BOTH RENDERERS read-only, and buttons and a select where the host can act', () => {
  for (const chosen of [{}, { project: '7' }, { whose: 'mine' }]) {
    const svelte = tree(render(Filters, { props: { filters: FILTERS, chosen } }).body);
    assert.equal(svelte, tree(filtersHTML(FILTERS, chosen)), JSON.stringify(chosen));
    assert.doesNotMatch(svelte, /<button|<select/u, 'read-only: nothing to press');
    /* A FIELD WITH ONE VALUE IS NOT DRAWN, BUT FOR WHILE ANOTHER CHOICE NARROWS THE PAGE (25dc205f2): the row holds its
       place so the page does not jump, and says the one value every line shown shares. */
    if (Object.keys(chosen).length === 0) assert.doesNotMatch(svelte, /Nothing to choose/u, 'a field with one value is not drawn');
    else assert.match(svelte, /aria-label="Nothing to choose"[^>]*>(?:(?!filters-group).)*All(?:(?!filters-group).)*Only/u, 'its row stays while the page is narrowed');
  }
  const read = tree(filtersHTML(FILTERS, { project: '7' }));
  assert.deepEqual([...read.matchAll(/<span class="filters-choice"( data-on)?>([^<]*)/gu)].slice(0, 7).map((m) => `${m[2]}${m[1] ? '*' : ''}`), ['All', 'Oxbow', 'Nook', 'Kiln', 'Site', 'Quiet*', 'All*'], 'the choice is drawn wherever it sits, and a field with none chosen is on All');
  assert.match(read, /<span class="filters-more">2 more<\/span>/u);

  const live = tree(render(Filters, { props: { filters: FILTERS, chosen: { whose: 'mine' }, onfilter: () => {} } }).body);
  const pressed = [...live.matchAll(/<button aria-pressed="(true|false)" class="filters-choice" type="button">([^<]*)/gu)].map((m) => `${m[2]}${m[1] === 'true' ? '*' : ''}`);
  assert.deepEqual(pressed, ['All*', 'Oxbow', 'Nook', 'Kiln', 'Site', 'Driftwood', 'All', 'Mine*', 'Agents', 'All*', 'Only'], 'the one-value row stays while Mine narrows the page');
  assert.match(live, /<select aria-label="Project" class="filters-more"><option value>2 more<\/option><option value="6">Estate<\/option><option value="7">Quiet<\/option><\/select>/u);
  assert.match(live, /aria-label="Project" class="filters-group" data-control="chips"/u, 'seven values are chips');
  assert.match(live, /aria-label="Whose" class="filters-group" data-control="segmented"/u);
  assert.equal(tree(render(Filters, { props: { filters: [] } }).body), '', 'nothing to narrow by draws nothing');
});

test("A PROJECT'S CHIP WEARS ITS DOT in both renderers, and a value with no hue wears none", () => {
  const dotted = [{ field: 'thing', label: 'Project', values: [{ value: '1', label: 'Kiln', count: 46, hue: 210 }, { value: '2', label: 'BrainDog', count: 1, hue: 30 }, { value: '', label: 'No project', count: 2 }] }];
  const svelte = tree(render(Filters, { props: { filters: dotted } }).body);
  assert.equal(svelte, tree(filtersHTML(dotted)));
  assert.equal((svelte.match(/class="filters-dot"/gu) ?? []).length, 2);
  assert.match(svelte, /style="--hue: 210"/u);
});

/* ── agents in their makers' marks, where the host draws them ──────────────── */

test('THE TWO RENDERERS DRAW ONE MARK FOR AN AGENT the host names, on a card, a card named for its agent, and a feed line', () => {
  const marks: Record<string, { d: string; rule: 'evenodd' | 'nonzero'; tone: string }> = {
    Claude: { d: 'M4 4h16v16H4z', rule: 'nonzero', tone: 'claude' },
    Codex: { d: 'M2 2h20v20H2z', rule: 'evenodd', tone: 'ink' },
  };
  const opts = { agentMark: (name: string) => marks[name] ?? null };
  const Marked = Block as unknown as Component<{ block: BlockSegment; opts: typeof opts }>;
  for (const src of [
    SHAPES['agents working now']!,
    '```cards\nwho: Agent | fact: Doing\nClaude | Fix the export\nJ. Okonkwo | Proofs\n```',
    SHAPES['a feed with bursts, a mark and a tone']!,
    /* A RUN'S LANE NAMES ITS AGENT (the fourth cell), drawn with its mark and its bar in the agent's hue. */
    '```lanes | Today\nwindow | 2026-10-07T00:00:00+02:00 | 2026-10-07T15:00:00+02:00 | 2026-10-07T15:00:00+02:00\nQA pass | 2026-10-07T10:00:00+02:00 |  | Claude | info\nCopy | 2026-10-07T11:00:00+02:00 | 2026-10-07T12:00:00+02:00 | Codex\n```',
  ]) {
    const block = page(src);
    const svelte = tree(render(Marked, { props: { block, opts } }).body);
    assert.match(svelte, /class="agent-mark"/u, src);
    assert.equal(svelte, tree(toHTML([block], opts)), src);
  }
});

test("AND A RUN THE HOST HANDS WEARS ITS MAKER'S MARK IN BOTH, undimmed, and a run of an agent with no mark keeps its glyph", () => {
  const marks: Record<string, { d: string; rule: 'evenodd' | 'nonzero'; tone: string }> = { 'claude-code': { d: 'M4 4h16v16H4z', rule: 'nonzero', tone: 'claude' } };
  const opts = {
    agentMark: (name: string) => marks[name] ?? null,
    icon: (name: string) => (name === 'session' ? 'M3 3h18' : null),
    runs: [
      { run: 'S7', agent: 'claude-code', live: 'quiet' as const },
      { run: 'S8', agent: 'night-shift', live: 'stopped' as const },
    ],
  };
  const Marked = Block as unknown as Component<{ block: BlockSegment; opts: typeof opts }>;
  const block = page('```cards\ntitle | who | when: Seen | quiet\nVariable axis QA | Claude | 3m ago | quiet\nReconcile | Night shift | 2h ago | quiet\n```');
  const svelte = tree(render(Marked, { props: { block, opts } }).body);
  assert.equal(svelte, tree(toHTML([block], opts)));
  assert.equal(svelte.match(/class="cards-run-agent"/gu)?.length, 1, 'the run with a mark did not wear it, or the other did');
  assert.doesNotMatch(svelte, /data-quiet/u, 'a run the host handed was dimmed');
});

/* ── a part with no value is not drawn ───────────────────────────── */

/**
 * Each part the rule reads, once with a part whose value is missing beside parts that hold one, as his project pages
 * hold them: a chip that is a name and a dash, "Keeping it alive: lanternfish.example" over a dash, a figure over a dash beside a
 * figure of nought, and a stone with no step. Zero is a value, so the nought stays.
 */
const PARTS: Record<string, { src: string; gone: string; kept: readonly string[] }> = {
  chip: { src: '```chips\ndot | — | status\ndot | 3 | open tasks\n```', gone: 'status', kept: ['3', 'open tasks'] },
  'spec row': { src: '```spec\nKeeping it alive: lanternfish.example | — | \nDomain | lanternfish.example | renews in May\n```', gone: 'Keeping it alive', kept: ['Domain', 'renews in May'] },
  'stat cell': { src: '```stat\nCosts a year | — | \nEarns a month | 0 | \nUsers | 41 | \n```', gone: 'Costs a year', kept: ['Earns a month', 'Users'] },
  step: { src: '```steps path\nSample the fit | maker | done\n— | quoted | \nPick a board |  | next\n```', gone: 'quoted', kept: ['Sample the fit', 'Pick a board'] },
};

/** The host's answer for every block: no `empty:` line, which is a write-up's and a block that is not the page's lead. */
const NO_LINE = { empty: () => null };
const Emptied = Block as unknown as Component<{ block: BlockSegment; opts: Record<string, unknown> }>;
const both = (block: BlockSegment, opts: Record<string, unknown>): [string, string] => [
  tree(render(Emptied, { props: { block, opts } }).body),
  tree(toHTML([block], opts)),
];

for (const [name, { src, gone, kept }] of Object.entries(PARTS)) {
  test(`A ${name.toUpperCase()} WITH NO VALUE IS NOT DRAWN in either renderer, and the ones that hold a value are`, () => {
    const [svelte, html] = both(page(src), NO_LINE);
    assert.equal(svelte, html);
    assert.ok(!html.includes(gone), `${gone} was drawn: ${html}`);
    assert.ok(!html.includes('—'), `a dash was drawn: ${html}`);
    for (const k of kept) assert.ok(html.includes(k), `${k} was not drawn: ${html}`);
  });

  test(`A ${name.toUpperCase()} WITH A VALUE IS DRAWN AS IT WAS, the same in both renderers, with no host at all`, () => {
    const present = page(src.replace('—', '12'));
    const [svelte, html] = both(present, {});
    assert.equal(svelte, html);
    assert.ok(html.includes(gone) && html.includes('12'), html);
  });

  test(`A ${name.toUpperCase()} KEEPS ITS DASH where the block says \`empty: keep\`, in both renderers`, () => {
    const [svelte, html] = both(page(src), { empty: () => 'keep' });
    assert.equal(svelte, html);
    assert.ok(html.includes(gone), html);
  });
}

/** Whether `svelte/Block.svelte` leaves out the figure of a block left with nothing, as `toHTML` does. */
const FRAMED = readFileSync(new URL('../svelte/Block.svelte', import.meta.url), 'utf8').includes('emptied(block, opts)');

/** A block every part of which has no value: each kind the rule reads, over dashes alone. */
const BARE: Record<string, string> = {
  chips: '```chips\ndot | — | status\ndot | — | lane\n```',
  spec: '```spec\nKeeping it alive: lanternfish.example | — | \n```',
  stat: '```stat\nCosts a year | — | \nEarns a month |  | \n```',
  path: '```steps path\n— | maker | \n```',
};

for (const [name, src] of Object.entries(BARE)) {
  test(`A ${name.toUpperCase()} LEFT WITH NOTHING SAYS ITS EMPTY LINE where it leads the page, one tree in both renderers`, () => {
    const [svelte, html] = both(page(src), { empty: () => 'Nothing measured yet.' });
    assert.equal(svelte, html);
    assert.match(html, /^<figure [^>]*>(<figcaption[^>]*>.*<\/figcaption>)?<p class="block-empty">Nothing measured yet\.<\/p><\/figure>$/u);
  });

  test(`A ${name.toUpperCase()} LEFT WITH NOTHING IS NOT DRAWN by the mirror where it does not lead, and draws no part in the app`, () => {
    const block = page(src);
    assert.equal(toHTML([block], NO_LINE), '');
    assert.equal(toHTML([block]), '', 'a write-up has no lead, so its bare block is not drawn either');
    const svelte = tree(render(Emptied, { props: { block, opts: NO_LINE } }).body);
    assert.doesNotMatch(svelte, /—|class="(?:pill|row|cell|item)"/u, `a part was drawn: ${svelte}`);
  });

  /* Waits on one line in `svelte/Block.svelte`: the figure is drawn only where `emptied(block, opts)` is not null.
     Until it is there the app draws the bare frame the mirror leaves out, and this is a to-do; once it is, a failure. */
  test(`A ${name.toUpperCase()} LEFT WITH NOTHING IS ONE TREE IN BOTH: nothing at all`, { todo: FRAMED ? false : 'svelte/Block.svelte skips the figure when emptied() is null' }, () => {
    const [svelte, html] = both(page(src), NO_LINE);
    assert.equal(svelte, html);
  });
}

/** Zero is a value: a part reading 0 beside a missing one is drawn, the same in both renderers. */
const NOUGHTS: Record<string, { src: string; gone: string; kept: string }> = {
  chip: { src: '```chips\ndot | 0 | open tasks\ndot | — | status\n```', gone: 'status', kept: 'open tasks' },
  'spec row': { src: '```spec\nUsers | 0 | \nKeeping it alive: lanternfish.example | — | \n```', gone: 'Keeping it alive', kept: 'Users' },
  'stat cell': { src: '```stat\nCosts a year | 0 | \nEarns a month | — | \n```', gone: 'Earns a month', kept: 'Costs a year' },
  step: { src: '```steps path\n0 | maker | done\n— | quoted | \n```', gone: 'quoted', kept: '>0<' },
};

for (const [name, { src, gone, kept }] of Object.entries(NOUGHTS)) {
  test(`A ${name.toUpperCase()} READING 0 IS DRAWN in both renderers, and the missing one beside it is not`, () => {
    const [svelte, html] = both(page(src), NO_LINE);
    assert.equal(svelte, html);
    assert.ok(html.includes(kept), `${kept} was not drawn: ${html}`);
    assert.ok(!html.includes(gone) && !html.includes('—'), html);
  });
}

/* ── a row's mark is a picture ───────────────────────────────────── */

test('A CARD\'S MARK THAT NAMES A PICTURE IS THE PICTURE IN BOTH RENDERERS, and never the first letter of its name', () => {
  const block = page('```cards\nmark: Icon | title: Project\ncake | Oxbow.gg\nKiln | Kiln\nclose | Lanternfish\n```');
  for (const opts of [{}, { icon: (name: string) => (name === 'gift' ? 'M4 20h16' : null) }]) {
    const [svelte, html] = both(block, opts);
    assert.equal(svelte, html);
    const marks = [...html.matchAll(/<span aria-hidden="true" class="cards-mark"( data-glyph="[^"]*")?>(.*?)<\/span>/gu)].map((m) => [m[1] ?? '', m[2]!.startsWith('<svg') ? 'svg' : m[2]]);
    assert.deepEqual(marks, [[' data-glyph="gift"', 'icon' in opts ? 'svg' : ''], ['', 'K'], ['', 'L']], html);
  }
});

/* ── what a page prints: a chip's figure is read, and a path that names nothing is not a hole ──── */

/** The record a page reads: `tasks.open` holds 7, `cash.due` names a figure with no value yet, and nothing else is named. */
const VALUES: Record<string, string | null> = { 'tasks.open': '7', 'cash.due': null };
const READS = { ...NO_LINE, resolve: (path: string) => (Object.hasOwn(VALUES, path) ? VALUES[path]! : UNNAMED) };

/** Whether `svelte/p/Proportional.svelte` draws a bar's rows through `drawnRows`, as `toHTML` does. */
const BARS_DRAWN = readFileSync(new URL('../svelte/p/Proportional.svelte', import.meta.url), 'utf8').includes('drawnRows');

const PRINTS: Record<string, { src: string; has: readonly string[]; not: readonly string[]; todo?: string | false }> = {
  'chip whose figure is a path': { src: '```chips\ndot | {{tasks.open}} | open tasks\n```', has: ['>7<', 'open tasks'], not: ['{{', 'tasks.open'] },
  'chip whose figure names nothing': { src: '```chips\ndot | {{tasks.late}} | late\ndot | {{tasks.open}} | open\n```', has: ['>7<', '>open<'], not: ['late', '{{'] },
  'chip whose figure has no value yet': { src: '```chips\ndot | {{cash.due}} | due\ndot | {{tasks.open}} | open\n```', has: ['>open<'], not: ['due', '—'] },
  'stat whose figure names nothing': { src: '```stat\nLate | {{tasks.late}} | \nOpen | {{tasks.open}} | \n```', has: ['Open', '>7<'], not: ['Late', 'tasks.late'] },
  'card whose figure names nothing': { src: '```cards\ntitle: Project | figure: Open\nOxbow.gg | {{tasks.late}}\n```', has: ['Oxbow.gg'], not: ['tasks.late', 'cards-figure'] },
  'sentence with a path that names nothing': { src: '```note\nOpen: {{tasks.open}}, late: {{tasks.late}}, due: {{cash.due}}.\n```', has: ['>7<', '<span class="unresolved">tasks.late</span>', 'class="hole"', '—'], not: ['{{'] },
  'bar whose figure names nothing': {
    src: '```bar\nOpen | {{tasks.open}} | \nLate | {{tasks.late}} | \n```',
    has: ['Open', '>7<'],
    not: ['Late', 'tasks.late'],
    todo: BARS_DRAWN ? false : 'svelte/p/Proportional.svelte draws a bar through drawnRows',
  },
};

for (const [name, { src, has, not, todo }] of Object.entries(PRINTS)) {
  test(`A ${name.toUpperCase()} PRINTS THE SAME IN BOTH RENDERERS, and never the author's braces`, { todo: todo ?? false }, () => {
    const [svelte, html] = both(page(src), READS);
    assert.equal(svelte, html);
    for (const h of has) assert.ok(html.includes(h), `${h} was not drawn: ${html}`);
    for (const n of not) assert.ok(!html.includes(n), `${n} was drawn: ${html}`);
  });
}

/* ── a declared block's actions ────────────────────────────────────────────── */

test('A BLOCK WITH ACTIONS AND NO HOST TO PRESS THEM draws one line of labels in both renderers, and no button', () => {
  const block: BlockSegment = {
    ...page('```stat\nCups today | 4\n```'),
    actions: [
      { verb: 'row.update', label: 'Brew' },
      { verb: 'row.delete', label: 'Toss', hard: true },
    ],
  };
  const svelte = tree(render(Block, { props: { block } }).body);
  const html = tree(toHTML([block]));
  assert.equal(svelte, html);
  assert.ok(html.includes('<p class="block-actions">Brew · Toss (hard to undo)</p>'), html);
  assert.doesNotMatch(html, /<button/u);
});

test("A TABLE WITH ROW ACTIONS AND NO HOST TO PRESS THEM says each row's actions once in the line of labels, never per row", () => {
  const block: BlockSegment = {
    ...page('```comparison\nTea | Leaf\nSencha | Green\nAssam | Black\n```'),
    row_actions: [
      { verb: 'row.tick', label: 'Steeped' },
      { verb: 'row.delete', label: 'Toss', hard: true },
    ],
  };
  /* The table's roving tab stop is Table.svelte's alone (`noRovingStop`, above); the rest is one tree. */
  const svelte = noRovingStop(tree(render(Block, { props: { block } }).body));
  const html = tree(toHTML([block]));
  assert.equal(svelte, html);
  assert.ok(html.endsWith('<p class="block-actions">Steeped · Toss (hard to undo)</p></figure>'), html);
  assert.doesNotMatch(html, /<button/u);
});

/* ── a calendar's strip of weeks ───────────────────────────────────────────── */

test('A CALENDAR STRIP OF TWO WEEKS, A THING TODAY AND ONE NEXT WEEK, draws one tree in both renderers', () => {
  /* A fence cannot carry `weeks`: the page read sets it on the parsed block, as it sets `actions`. */
  const block: BlockSegment = { ...page('```calendar\nPay the plumber | 2026-10-15\nBook the vet | 2026-10-20\n```'), weeks: 2 };
  const [svelte, html] = both(block, { now: Date.UTC(2026, 9, 15, 12) });
  assert.equal(svelte, html);
  assert.match(html, /calendar-strip/u);
  assert.match(html, /<span class="calendar-today">Today<\/span>/u);
});

/* ── a calendar's amount column ────────────────────────────────────────────── */

test('A CALENDAR ROW\'S AMOUNT, ITS THIRD CELL, draws one tree in both renderers, in the months and in the strip', () => {
  /* A fence takes two columns: a host hands the rows over a list with the third (`calendar` in the kernel). */
  const base = page('```calendar\nRent | 2026-10-15\n```');
  const rows = [
    { cells: ['Rent', '2026-10-15', '£1,875.00'] },
    { cells: ['Phone', '2026-10-15', '£42.50'] },
    { cells: ['Parking', '2026-10-20', ''] },
  ];
  for (const more of [{}, { weeks: 2 }]) {
    const block = { ...base, ...more, rows } as BlockSegment;
    const [svelte, html] = both(block, { now: Date.UTC(2026, 9, 15, 12) });
    assert.equal(svelte, html);
    /* THE GRID'S CELLS CARRY THEM TOO (a stylesheet hides them there), so each figure is said once or twice; none is empty. */
    const said = [...html.matchAll(/<span class="calendar-amount num">([^<]*)<\/span>/gu)].map((m) => m[1]);
    assert.deepEqual([...new Set(said)], ['£1,875.00', '£42.50']);
  }
});

test('THE HORIZON AND IF INCOME STOPPED ARE UP FRONT, outside Adjust, and only where the host asks and they can move the line', () => {
  const Knobbed = Block as unknown as Component<{ block: BlockSegment; opts: { scenario: boolean } }>;
  const block = page(SHAPES['a forecast that walks past the length it opens on']!);
  const knobs = tree(render(Knobbed, { props: { block, opts: { scenario: true } } }).body);
  const ask = knobs.slice(knobs.indexOf('<div class="forecast-ask">'), knobs.indexOf('<dl class="forecast-summary">'));
  assert.match(ask, /<div aria-label="Horizon" class="segmented forecast-segs" role="group">/u, 'the horizon is a segmented control up front');
  assert.match(ask, /<button aria-checked="false" class="forecast-chip forecast-income" role="switch" type="button">/u, 'and the income question a switch beside it');
  const fold = knobs.slice(knobs.indexOf('<div class="forecast-knobs"'));
  assert.doesNotMatch(fold, /aria-label="Horizon"/u, 'Adjust no longer holds the horizon');
  assert.ok(knobs.indexOf('forecast-ask') < knobs.indexOf('forecast-summary'), 'the questions come before the answer');
  /* A WALK WITH NOTHING COMING IN OFFERS NO INCOME TO STOP; and with no host asking, neither is drawn. */
  const rent = page('```forecast\nopening | 2026-09-17 | Cash now | £1,000.00\nstep | 2026-10-01 | Rent | −£100.00\nstep | 2026-11-01 | Rent | −£100.00\nhorizon | 90 |  | \nknobs | horizon count |  | \n```');
  assert.doesNotMatch(tree(render(Knobbed, { props: { block: rent, opts: { scenario: true } } }).body), /forecast-income/u);
  assert.doesNotMatch(tree(render(Block, { props: { block } }).body), /forecast-ask/u);
});
