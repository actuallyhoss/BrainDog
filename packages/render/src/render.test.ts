import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { KINDS, PRIMITIVES, PRIMITIVES_VERSION, isKind } from './kinds.ts';
import { parse, splitRow } from './parse.ts';
import { toHTML, verbatimText } from './html.ts';
import { ariaSort, cardCells, cardPlan, chunkRows, moveCell, type Column, type TableRow } from '../svelte/types.ts';
import { lanes } from './board.ts';
import { ringDash, ringOf, trendOf, type AgentMark } from './cards.ts';
import { diffPlan, diffRows, lineDiff } from './diff.ts';
import { feedCased, feedCasedNodes } from './feed.ts';
import { inline, magnitudeOfCell, safeHref, text } from './inline.ts';
import { leadingCode, symbolFigure, symbolText, bytes, integer, money, pct, quantity, relative, since, stamp, day, formatTyped, magnitudeOf, MISSING, valueWord } from './format.ts';

const NOW = Date.UTC(2026, 8, 3, 12); // 2026-09-03

/* ── the closed sets ──────────────────────────────────────────────────────── */

/* THE TITLE SAID TWENTY-SIX WHILE THE ASSERTION SAID TWENTY-EIGHT, which is the drift a count in prose
   always has: the number below moves when a kind lands, and the words beside it do not. So the count
   lives in one place now, and the title says what the test is for rather than how many there are. */
test('every kind sits on a primitive that exists, and a new one is a deliberate edit here', () => {
  assert.equal(Object.keys(KINDS).length, 43);
  assert.equal(PRIMITIVES.length, 8);
  assert.equal(PRIMITIVES_VERSION, 1);
  for (const [kind, spec] of Object.entries(KINDS))
    assert.ok(PRIMITIVES.includes(spec.primitive), `${kind} names ${spec.primitive}, which is not a primitive`);
});

/* A RING AND A HEAT GRID ARE KINDS NOW, and until they were a fence naming either was refused as a word the
   dialect did not know: `DIALECT_KIND_UNKNOWN`, the author's rows echoed back in a `<pre>` (measured before
   `kinds.ts` held them). Both sit on primitives that already exist, so the version does not move. */
test('a ring fence and a heat fence answer their kind, on the primitives they draw with', () => {
  const [ring] = parse('```ring | Saved\nHoliday | 1200 | 3000\n```');
  assert.equal(ring?.type, 'block', ring?.type === 'degraded' ? ring.fix : '');
  assert.equal(ring?.type === 'block' && ring.kind, 'ring');
  const [heat] = parse('```heat | Done\n2026-09-14 | 3\n```');
  assert.equal(heat?.type === 'block' && heat.kind, 'heat');
  assert.equal(KINDS.ring.primitive, 'proportional');
  assert.equal(KINDS.heat.primitive, 'grid');
});

test('every primitive is reachable from at least one kind', () => {
  const used = new Set(Object.values(KINDS).map((k) => k.primitive));
  for (const p of PRIMITIVES) assert.ok(used.has(p), `${p} is a primitive nothing uses`);
});

/* ── the parser cannot fail ───────────────────────────────────────────────── */

test('the parser never throws and never returns nothing', () => {
  const nasty = [
    '',
    '```',
    '```stat',
    '```stat |',
    '~~~stat | x\na|b|c\n~~~',
    /* THE NUL IS AN ESCAPE, NOT A BYTE. A literal U+0000 in a source file makes git treat the whole
       file as binary, so `git show` rendered every change to this suite as `Bin 23059 -> 25251 bytes`
       — the tests for a new formatter shipped in a diff no reviewer and no grep-based gate could
       read. The fuzz corpus keeps the character; the file stays text. */
    '```' + '\u0000\uFFFF' + '```',
    '```stat | h\n'.repeat(50),
    'a'.repeat(10_000),
    '{{',
    '{{unclosed',
    '[link](javascript:alert(1))',
  ];
  for (const src of nasty) {
    const segs = parse(src);
    assert.ok(Array.isArray(segs));
    assert.doesNotThrow(() => toHTML(segs));
  }
});

test('a random byte string parses without throwing', () => {
  // The property 22 §10 asks for, at a size that keeps the suite under a second.
  for (let i = 0; i < 300; i++) {
    let s = '';
    const n = Math.floor(Math.random() * 200);
    for (let j = 0; j < n; j++) s += String.fromCharCode(Math.floor(Math.random() * 0x2200));
    assert.doesNotThrow(() => toHTML(parse(s)));
  }
});

/**
 * The documents the segmenting property is measured over: the shape the suite has always used, a
 * pair of fences with nothing but blanks between them, a run of whitespace with no document in it
 * at all, and the same thing written on Windows.
 */
const SEGMENTED = [
  'intro\n\n```stat | Head\na | 1 | note\n```\n\ntail\n',
  '```stat | A\nx | 1 | \n```\n   \n```stat | B\ny | 2 | \n```',
  '\t \n\n',
  'a\r\nb\r\n\r\n```spec | T\r\nRate | 1\r\n```\r\n',
  '```nope | x\nbody\n```\n\ntrailing with no newline',
];

/**
 * THIS TEST USED TO CHECK NOTHING, over a property that is false.
 *
 * It was called *"every byte of the source lands in exactly one segment"* and asserted that each
 * segment's end is at or after its start, which is true by construction, and that the next
 * segment starts at or after the last one ended, written `>=`, which permits a gap of any size.
 * on its own four-line fixture, two bytes landed in no segment at all and the test was green.
 *
 * The two bytes are line terminators, and the parser is right to leave them out: `[start, end)` is
 * the bytes the author typed and not the newline after them, which is what makes a spliced
 * replacement not have to put one back. So the guarantee in `parse`'s header was overstated rather
 * than the parser being wrong, and this asserts the three things that do hold, which are order,
 * no overlap, and no byte of substance dropped, over five documents instead of one.
 */
test('the segments are in order, never overlap, and drop nothing but whitespace', () => {
  for (const src of SEGMENTED) {
    const segs = parse(src);
    const covered = new Uint8Array(src.length);
    let previous = 0;
    for (const s of segs) {
      assert.ok(s.start >= 0 && s.end >= s.start && s.end <= src.length, `${s.type} is out of the source`);
      assert.ok(s.start >= previous, `${s.type} at ${s.start} starts before the segment above it ended`);
      previous = s.end;
      for (let i = s.start; i < s.end; i++) {
        assert.equal(covered[i], 0, `byte ${i} of ${JSON.stringify(src)} is in two segments`);
        covered[i] = 1;
      }
    }
    let dropped = '';
    for (let i = 0; i < src.length; i++) if (!covered[i]) dropped += src[i];
    // The whole of what is allowed to fall between two segments: the terminator that ended one,
    // and a blank run that is not a paragraph. Anything else is an author's text going missing.
    assert.match(dropped, /^\s*$/u, `${JSON.stringify(dropped)} was dropped from ${JSON.stringify(src)}`);
  }
});

test('and a fence spliced out of the source is exactly what the fence said it was', () => {
  // The half of the old sentence that is worth having: `[start, end)` addresses the bytes the
  // author typed, so an editor can put a replacement over them. `raw` is what a degraded sibling
  // shows, so the two disagreeing would put one fence on screen above another fence's words.
  for (const src of SEGMENTED)
    for (const s of parse(src))
      if (s.type !== 'markdown') assert.equal(src.slice(s.start, s.end), s.raw, `${s.type} does not splice back`);
});

/* ── line endings ───────────────────────────────────────────────────── */

/** The same document, written on each of the three machines that have ever written a text file. */
const DOC = ['intro', '', '```spec | Terms', 'Rate | GBP 90', '```', '', 'tail'];
const CR = String.fromCharCode(13);
const NEWLINE = String.fromCharCode(10);

test('A DOCUMENT WITH WINDOWS LINE ENDINGS IS THE SAME DOCUMENT', () => {
  // It was not. `.` in JavaScript matches anything except a line terminator, and CR is one, so the
  // fence pattern never matched a line ending CRLF: NO fence was recognised anywhere in the file and
  // the whole thing came back as a single run of prose with the source of every block inside it.
  const lf = parse(DOC.join('\n'));
  const crlf = parse(DOC.join(CR + '\n'));
  assert.deepEqual(crlf.map((s) => s.type), lf.map((s) => s.type));
  assert.deepEqual(crlf.map((s) => s.type), ['markdown', 'block', 'markdown']);
});

test('and a lone CR is a line ending too, because a paste is not a choice of line endings', () => {
  const seg = parse(DOC.join(CR));
  assert.deepEqual(seg.map((s) => s.type), ['markdown', 'block', 'markdown']);
});

test('a cell does not come back with a carriage return stuck to it', () => {
  const [, block] = parse(DOC.join(CR + '\n'));
  assert.ok(block && block.type === 'block');
  assert.deepEqual(block.rows[0]?.cells, ['Rate', 'GBP 90']);
  assert.equal(block.heading, 'Terms');
});

test('nor does a verbatim kind, which is the one that does not trim', () => {
  // `code` keeps its line exactly as typed, so a stripped terminator is the only thing between it
  // and a stray control character in the middle of every rendered line.
  const [seg] = parse(['```code | Shell', 'ls -l', 'echo hi', '```'].join(CR + '\n'));
  assert.ok(seg && seg.type === 'block');
  assert.deepEqual(seg.rows.map((r) => r.cells[0]), ['ls -l', 'echo hi']);
});

/* ── a tree is its indentation ────────────────────────────────────────────── */

/** Four lines and three levels, which is the smallest tree that can come out flat. */
const TREE = ['```tree | src', 'src', '  index.ts', '  lib', '    a.ts', '```'];

test('A TREE KEEPS ITS INDENTATION IN THE MIRROR, WHICH IS WHERE THE EXPORTS READ IT', () => {
  /* `parse` moves a `tree` line's indent off the cell and into `Row.depth`, on purpose.
     `Media.svelte` put it back and `toHTML` never read `depth` at all, so the same four lines drew
     nested in the app and flat in the exports, in the digest email and in every test that reads
     the mirror, which are the four consumers `html.ts`'s own header names. Media's header says what it
     costs: a code sample that loses its indentation is a code sample that is wrong. */
  const [seg] = parse(TREE.join(NEWLINE));
  assert.ok(seg && seg.type === 'block');
  assert.deepEqual(seg.rows.map((r) => r.depth), [0, 1, 1, 2], 'the parser did not record the levels');
  assert.equal(verbatimText(seg), 'src\n  index.ts\n  lib\n    a.ts');
  assert.match(toHTML([seg]), /<code>src\n {2}index\.ts\n {2}lib\n {4}a\.ts<\/code>/u);
});

test('and a kind that is verbatim but not indented is left exactly as it was', () => {
  // `code` carries no `indented`, so nothing is added to a line that already holds its own spaces.
  const [seg] = parse(['```code | py', 'def f():', '    return 1', '```'].join(NEWLINE));
  assert.ok(seg && seg.type === 'block');
  assert.equal(verbatimText(seg), 'def f():\n    return 1');
});

test('and a depth no parser would produce does not take the page down with it', () => {
  // `Row` is a public type and a renderer that throws takes the whole page: `String.repeat`
  // answers a negative or a non-finite count with a RangeError.
  const seg = { ...parse(TREE.join(NEWLINE))[0] } as Extract<ReturnType<typeof parse>[number], { type: 'block' }>;
  seg.rows = [{ cells: ['a'], depth: -3 }, { cells: ['b'], depth: Number.POSITIVE_INFINITY }, { cells: ['c'], depth: 1.9 }];
  assert.equal(verbatimText(seg), 'a\nb\n  c');
});

test('the offsets still address the source, terminators included', () => {
  // The terminator is taken off the TEXT and kept in the OFFSETS. If it were dropped from both, every
  // segment after the first line would be one byte adrift per line and an editor splicing
  // `[start, end)` would overwrite the wrong span.
  const src = DOC.join(CR + '\n');
  const segs = parse(src);
  for (const s of segs) {
    assert.ok(s.end >= s.start && s.end <= src.length);
    if (s.type !== 'markdown') assert.equal(src.slice(s.start, s.end), s.raw);
  }
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i]!.start >= segs[i - 1]!.end);
  const [, block] = segs;
  assert.ok(block && block.type === 'block');
  assert.ok(src.slice(block.start).startsWith('```spec'), 'the block does not start at its fence');
});

test('prose is normalised, so a carriage return cannot reach the HTML', () => {
  const html = toHTML(parse(DOC.join(CR + '\n')));
  assert.ok(!html.includes(CR), 'a carriage return survived into the output');
  assert.ok(html.includes('intro') && html.includes('tail'));
});

/* ── rows, tones and arity ────────────────────────────────────────────────── */

test('a row splits on pipes after unescaping', () => {
  assert.deepEqual(splitRow('a | b | c'), ['a', 'b', 'c']);
  assert.deepEqual(splitRow('a \\| b | c'), ['a | b', 'c']);
  assert.deepEqual(splitRow('a \\\\ b'), ['a \\ b']);
});

test('a tone is only read from a cell BEYOND the kind’s count', () => {
  const [block] = parse('```stat | H\nA | 1 | n | bad\nB | 2 | bad\n```');
  assert.equal(block?.type, 'block');
  if (block?.type !== 'block') return;
  assert.equal(block.rows[0]?.tone, 'bad');
  // `stat` takes three cells, so the third `bad` is the note cell and not a tone. The columns of a
  // row do not move, and a word in the value slot is a value (05 §3 invariant 2).
  assert.equal(block.rows[1]?.tone, undefined);
  assert.equal(block.rows[1]?.cells[2], 'bad');
});

test('a word that is neither a tone nor a cell the kind has room for degrades, never refuses', () => {
  const [seg] = parse('```stat | H\nA | 1 | n | banana\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY');
});

test('a note carries prose, so its lines can never overflow an arity', () => {
  const [seg] = parse('```note | Kicker | bad\nA whole sentence, with | a pipe in it, and more words than any cell.\n\nA second paragraph.\n```');
  assert.equal(seg?.type, 'block');
  if (seg?.type !== 'block') return;
  assert.equal(seg.tone, 'bad', 'a trailing tone word on the heading is the block tone');
  assert.equal(seg.heading, 'Kicker');
  const html = toHTML([seg]);
  assert.equal(html.match(/<p>/g)?.length, 2, 'a blank line is where one paragraph ends');
  assert.match(html, /class="panel measure"/);
});

test('a colour role in the tone slot resolves to its intent, never to a refusal', () => {
  const [block] = parse('```stat | H\nA | 1 | n | danger\n```');
  assert.equal(block?.type === 'block' && block.rows[0]?.tone, 'bad');
});

test('too many cells degrades to a visible fence, and the write is still accepted', () => {
  const src = '```stat | H\nA | 1 | n | x | y | z\n```';
  const [seg] = parse(src);
  assert.equal(seg?.type, 'degraded');
  if (seg?.type !== 'degraded') return;
  assert.equal(seg.code, 'DIALECT_ARITY');
  assert.equal(seg.raw, src, 'the fence must show exactly what the author typed');
  assert.match(toHTML([seg]), /block-degraded/);
});

test('a kind outside the eighteen degrades rather than disappearing', () => {
  const [seg] = parse('```reactor_core | H\nA\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_KIND_UNKNOWN');
});

test('A CAPITALISED KIND IS TOLD ABOUT ITS CAPITAL, NOT TOLD IT WROTE NO KIND', () => {
  /* `INFO` matched `[a-z]+`, so an info string with a capital in it missed the pattern entirely
     and the kind came out as the empty string. The author got "A fence with no kind is shown as
     you wrote it" for a fence whose first word was a kind. The fence is the only feedback channel
     an agent author has, so a sentence that names the wrong fault costs the whole degradation. */
  const fixFor = (src: string): string => {
    const [seg] = parse(src);
    assert.equal(seg?.type, 'degraded');
    return seg?.type === 'degraded' ? seg.fix : '';
  };
  const stat = fixFor('```Stat | Head\na | 1 | n\n```');
  assert.match(stat, /lower case/u, 'the capital is the fault and nothing said so');
  assert.match(stat, /"stat"/u, 'a degradation that does not say what to write is a stop, not a step');
  assert.doesNotMatch(stat, /no kind/u, 'the author wrote a kind');
  assert.match(fixFor('```STAT | Head\n```'), /Write "stat"/u, 'shouting is the same fault');

  // And the three sentences that were already right stay right: a word that is not a kind in any
  // case, a fence with no kind at all, and a kind that is spelled correctly and page-bound.
  assert.match(fixFor('```Reactor | H\nA\n```'), /is not one of the (thirty-nine|forty|forty-one|forty-two|forty-three) kinds/u);
  assert.equal(fixFor('```\nA\n```'), 'A fence with no kind is shown as you wrote it.');
  assert.match(fixFor('```table | Open\n```'), /draws a register on a page/u);
});

test('and a capitalised kind is still a refusal, because the dialect has one spelling for a kind', () => {
  // Accepting it would put `Stat` in `raw` and `stat` in the record for one figure, which is the
  // thing `format.ts` opens by saying makes two figures. The write is accepted; the block degrades.
  const [seg] = parse('```Stat | Head\na | 1 | n\n```');
  assert.equal(seg?.type, 'degraded');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_KIND_UNKNOWN');
  assert.equal(seg?.type === 'degraded' && seg.raw, '```Stat | Head\na | 1 | n\n```');
  assert.match(toHTML(parse('```Stat | Head\na | 1 | n\n```')), /block-degraded/u);
});

test('a stat over six rows degrades under DIALECT_ARITY — there is no DIALECT_ROWS', () => {
  const rows = Array.from({ length: 7 }, (_, i) => `L${i} | ${i} | n`).join('\n');
  const [seg] = parse('```stat | H\n' + rows + '\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY');
});

test('a hole sits last, outside the scale, and is the only row that is a button', () => {
  const html = toHTML(parse('```bar | Spend\nUncategorised | 8500 | | hole\nRent | 1200 | \nFood | 400 | \n```'), { hole: true });
  const holeAt = html.indexOf('data-hole');
  assert.ok(holeAt > html.indexOf('Rent'), 'the hole must be drawn after the known rows');
  assert.match(html, /<button[^>]*data-hole/);
  // It sets no magnitude, so it cannot set the scale and make every real category a one-pixel stub.
  const holeRow = html.slice(holeAt - 200, holeAt + 200);
  assert.ok(!/--magnitude/.test(holeRow.slice(holeRow.indexOf('data-hole'))));
});

test('and it is a div where no host can act on it, still marked and no longer pressable', () => {
  const html = toHTML(parse('```bar | Spend\nUncategorised | 8500 | | hole\nRent | 1200 | \n```'));
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /<div class="prop-row" data-hole/, 'the row must still say it is a hole');
});

test('a bar row whose value is not a number keeps its words and loses its bar', () => {
  /* A BAR OF ONE COMPARES NOTHING SINCE 8a2ad40fc, so two rows have a number here and the third does not. */
  const html = toHTML(parse('```bar | X\nKnown | 10 | \nAlso | 5 | \nUnknown | tbc | \n```'));
  assert.equal(html.match(/--magnitude/g)?.length, 2);
  assert.match(html, /tbc/);
});

test('a bar of one compares nothing: its words and its figure, and no track of 100%', () => {
  const html = toHTML(parse('```bar | X\nOnly | 10 | \nUnknown | tbc | \n```'));
  assert.doesNotMatch(html, /--magnitude|prop-track/u);
  assert.match(html, /Only/u);
  assert.match(html, /tbc/u);
});

test('a chips row without both a number and a word is dropped', () => {
  const html = toHTML(parse('```chips | X\n● | 12 | open\n● | | orphan\n```'));
  assert.match(html, /open/);
  assert.doesNotMatch(html, /orphan/);
});

test('the fence scan is flat: a fence inside a note ends the note', () => {
  const segs = parse('```note | A\nbody\n```\n```note | B\nbody\n```');
  assert.equal(segs.filter((s) => s.type === 'block').length, 2);
});

/* ── the intent contract ──────────────────────────────────────────────────── */

test('an intent reaches the DOM only with its glyph', () => {
  for (const [tone, glyph] of [['good', '✓'], ['warn', '⚠'], ['bad', '⊘'], ['info', 'ⓘ']] as const) {
    const html = toHTML(parse(`\`\`\`stat | H\nA | 1 | n | ${tone}\n\`\`\``));
    assert.match(html, new RegExp(`data-intent="${tone}"`));
    assert.ok(html.includes(glyph), `${tone} reached the DOM without its glyph`);
    assert.match(html, /role="img" aria-label=/);
  }
});

/* ── inline ───────────────────────────────────────────────────────────────── */

test('code spans are lifted first, so a literal token in backticks survives', () => {
  const nodes = inline('use `{{path}}` here', { resolve: () => 'WRONG' });
  assert.equal(nodes.find((n) => n.type === 'code')?.type, 'code');
  assert.equal(text(nodes), 'use {{path}} here');
});

test('a path with no value renders an em dash and an affordance, never a zero', () => {
  const html = toHTML(parse('{{obligations.due_30d}}'), { resolve: () => null });
  assert.match(html, /class="hole"/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, />0</);
});

test('a path that names nothing renders as the path, marked', () => {
  const nodes = inline('{{not a path}}');
  assert.equal(nodes[0]?.type, 'unresolved');
});

test('a link the host cannot resolve is plain text, not a dead anchor', () => {
  assert.doesNotMatch(toHTML(parse('[x](javascript:alert(1))')), /<a /);
  assert.doesNotMatch(toHTML(parse('[x](data:text/html,y)')), /<a /);
  assert.match(toHTML(parse('[x](https://example.com)')), /<a href="https:\/\/example.com"/);
  assert.match(toHTML(parse('[x](/r/obligations)')), /<a href="\/r\/obligations"/);
});

test('{unknown} is a hole, not a tag', () => {
  assert.match(toHTML(parse('The rate is {unknown}.'), { hole: true }), /<button[^>]*class="hole"/);
  assert.match(toHTML(parse('The rate is {verified: Decree 2026}.')), /data-evidence="verified"/);
});

test('AND A HOLE IS A CONTROL ONLY WHERE THE HOST CAN ACT ON IT', () => {
  /* It was a `<button>` on both sides of the parity boundary with no handler on either — a real tab
     stop, styled as a control, doing nothing on every document that had one. Absent a host that can
     act, it is still visibly a gap and no longer a promise. */
  const html = toHTML(parse('The rate is {unknown}.'));
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /<span class="hole">unknown<\/span>/);
});

test('and a path that names nothing says what is missing, not where it lives', () => {
  // It printed `obligations.oldest_overdue` in the middle of a sentence somebody is reading: the
  // author's vocabulary, in the one place the reader is already confused. The path stays in the
  // attribute for whoever is fixing it.
  const html = toHTML(parse('Oldest is {{obligations.oldest_overdue}}.'));
  assert.match(html, /oldest overdue/);
  assert.doesNotMatch(html, />obligations\.oldest_overdue/);
  assert.match(html, /data-path="obligations\.oldest_overdue"/);
});

test('A DATE GOES WHERE THE HOST SAYS, OR NOWHERE', () => {
  /* This was hard-coded to `/calendar/<day>`, which no host in this workspace serves — so every
     date in a document was an anchor to the error page, including the one in the seed's own note on
     a row somebody reaches in two clicks. */
  const plain = toHTML(parse('Due {{date:2026-09-20}}.'));
  assert.doesNotMatch(plain, /<a /);
  assert.doesNotMatch(plain, /calendar/);

  const linked = toHTML(parse('Due {{date:2026-09-20}}.'), { dayHref: (iso) => `/when/${iso}` });
  assert.match(linked, /<a href="\/when\/2026-09-20">/);
});

test('every rendered value is escaped exactly once', () => {
  const html = toHTML(parse('```spec | <script>\n<img src=x onerror=1> | & | "\n```'));
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /&amp;amp;/);
});

test('the only inline styles are --cells and --magnitude, and both are numbers', () => {
  const html = toHTML(
    parse('```stat | H\nA | 1 | n\nB | 2 | n\n```\n```bar | B\nX | 10 | \n```\n```gauge | G\nX | 5 | 10\n```'),
  );
  for (const m of html.matchAll(/style="([^"]*)"/g))
    assert.match(m[1]!, /^(--cells:\d+|--magnitude:\d\.\d{2}|--cols:repeat\(\d+,minmax\(0,1fr\)\))$/, m[1]);
});

/* ── formatting ───────────────────────────────────────────────────────────── */

test('money is minor units, code first, with the currency exponent', () => {
  assert.equal(money(129900, 'EGP'), 'EGP 1,299.00');
  assert.equal(money(1299, 'JPY'), 'JPY 1,299');
  assert.equal(money(1299000, 'KWD'), 'KWD 1,299.000');
  assert.equal(money(-129900, 'EGP'), 'EGP −1,299.00');
  assert.ok(money(-1, 'USD').includes('−'), 'the minus must be U+2212, not a hyphen');
});

test('relative time is banded and signed both ways', () => {
  assert.equal(relative('2026-09-03', NOW), 'today');
  assert.equal(relative('2026-09-10', NOW), 'in 7d');
  assert.equal(relative('2026-10-15', NOW), 'in 6w');
  assert.equal(relative('2026-08-20', NOW), '2w ago');
  assert.equal(relative('2025-09-03', NOW), '1y ago');

  /* THE MINUS, IN ALL FOUR FORMATTERS. `money` and `pct` prepended U+2212 over `Math.abs`;
     `integer` and `quantity` returned `toLocaleString` straight, which is an ASCII hyphen — and
     `Money.svelte` picks between `money()` and `integer()` on whether the row carries a currency,
     so both glyphs landed in one tabular column at two different widths. */
  for (const [what, drawn] of [
    ['money', money(-129900, 'GBP')],
    ['pct', pct(-46.3)],
    ['integer', integer(-1299)],
    ['quantity', quantity(-1.4, 'm')],
  ] as const) {
    assert.ok(drawn.includes('−'), `${what} draws ${JSON.stringify(drawn)} without a real minus`);
    assert.ok(!drawn.includes('-'), `${what} draws ${JSON.stringify(drawn)} with an ASCII hyphen`);
  }
  /* AND NEGATIVE ZERO IS NOT NEGATIVE. `-0 < 0` is false, so the sign never appears — asserted
     because `Math.abs` over a hand-written `value < 0` is exactly where a `-0` leaks a lone minus. */
  assert.equal(integer(-0), '0');
  assert.equal(pct(-0), '0%');
});

test('AN INSTANT IS SAID IN THE UNIT IT MATTERS IN, WHICH NOTHING HERE COULD DO', () => {
  /**
   * `relative()` is anchored on `/^\d{4}-\d{2}-\d{2}$/` and returns its ARGUMENT when the pattern
   * misses — so an instant handed to it rendered as `2026-09-03T11:57:00.000Z` on screen, which is
   * what `/settings/agents` shipped for a day. Every other caller in the app had learned to
   * `.slice(0, 10)` first, which hides the miss and throws the time away with it.
   *
   * That truncation is the deeper failure: a device grant three minutes old and one eleven hours old
   * both read *today*, on the one table whose entire decision is whether ten minutes have passed
   * (`12 §6.1`, `49 §5.9`).
   */
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY_MS = 86_400_000;

  assert.equal(since(at(0.005 * HOUR), NOW), 'just now');
  assert.equal(since(at(3 * MIN), NOW), '3 min ago');
  assert.equal(since(at(30 * MIN), NOW), '30 min ago');
  assert.equal(since(at(3 * HOUR), NOW), '3h ago');
  assert.equal(since(new Date(NOW + 3 * MIN).toISOString(), NOW), 'in 3 min');

  /* THE FIRST QUARTER-HOUR IS NOT ROUNDED, and this is the assertion that says why. Ten minutes is a
     device grant's whole life (`49 §5.9`), so rounding twelve minutes to ten is the difference
     between a request somebody can still approve and one that is already over — on the one screen
     where that is the entire decision. Rounding starts once it stops mattering. */
  assert.equal(since(at(12 * MIN), NOW), '12 min ago');
  assert.equal(since(at(14 * MIN), NOW), '14 min ago', 'the cliff moved off fifteen');
  assert.equal(since(at(15 * MIN), NOW), '15 min ago');
  assert.equal(since(at(16 * MIN), NOW), '15 min ago', 'sixteen is not rounded, so the cliff is not at fifteen');
  assert.equal(since(at(22 * MIN), NOW), '20 min ago');

  /**
   * NO BAND SPELLS THE ONE ABOVE IT, and three did.
   *
   * `Math.round(mins / 5) * 5` is 60 at 58 and 59 minutes, so the ladder read *55 min → 60 min →
   * 1h*; `Math.round(1439 / 60)` is 24, so 23h59m read "24h" beside a real day; and the handover
   * past a day truncated to the DAY and let `relative()`'s noon anchor answer, so an instant exactly
   * 24 hours old, read at midnight, said **"today"** — the failure this function exists to end,
   * surviving one band further out.
   */
  assert.equal(since(at(57 * MIN), NOW), '55 min ago');
  assert.equal(since(at(58 * MIN), NOW), '55 min ago');
  assert.equal(since(at(59 * MIN), NOW), '55 min ago');
  assert.equal(since(at(23 * HOUR), NOW), '23h ago');
  assert.equal(since(at(23 * HOUR + 59 * MIN), NOW), '23h ago');
  assert.equal(since(at(DAY_MS), NOW), '1d ago', 'exactly a day read as today');
  assert.equal(since(at(DAY_MS - 1), NOW), '23h ago');
  assert.equal(since(at(2 * DAY_MS), NOW), '2d ago', 'two days read as one');

  /* Sub-minute is the other edge, and it is one second wide. */
  assert.equal(since(at(59_999), NOW), 'just now');
  assert.equal(since(at(60_000), NOW), '1 min ago');
  assert.equal(since(at(90_000), NOW), '2 min ago', 'the minutes are rounded, not floored');

  /* Past a day it uses `relative`'s own band table rather than a second copy of it. */
  assert.equal(since(at(31 * DAY_MS), NOW), '4w ago', 'the shared band table is not the one `relative` uses');
  assert.equal(since(at(31 * DAY_MS), NOW), relative('2026-08-03', NOW));
  assert.equal(since('2026-08-20', NOW), relative('2026-08-20', NOW), 'a day takes the day path');
  assert.equal(since('2026-09-03', NOW), 'today', 'today is still today');

  /* And it never invents a time it was not given — `relative()`'s own contract, weaker than it reads
     because `Date.parse` accepts far more than an instant. What it rejects, this rejects. */
  assert.equal(since('nonsense', NOW), 'nonsense');
  assert.equal(since('', NOW), '');
});

test('A STAMP IS THE DAY AND THE MINUTE, and it printed the raw instant back', () => {
  /**
   * `since()` answers "how long ago" and its bands are deliberately coarse past a day, so two
   * changes made the same afternoon both read `3d ago`. That is right on a row about an invoice and
   * wrong on the ledger, which the restore setting sends somebody to with the words "find the
   * moment". `stamp` is the answer to the second question.
   *
   * AND IT HANDED THE WHOLE INSTANT TO `day()`, WHICH TAKES A DAY. `noon()` matches
   * `^YYYY-MM-DD$` anchored and returns its argument unchanged when it does not, so the ledger
   * printed `2026-09-03T09:00:00.000Z, 09:00`: the raw stored value, on the one screen this
   * function exists for, two functions under the paragraph saying a machine timestamp is exactly
   * what these formatters are here to stop showing anybody.
   */
  assert.equal(stamp('2026-09-03T09:00:00.000Z'), '3 Sep 2026, 09:00');
  assert.doesNotMatch(stamp('2026-09-03T09:00:00.000Z'), /T|Z/u, 'the stored form reached the screen');

  /* A BARE DAY IS STILL A DAY, at midnight, because an `instant` column may hold one after an
     import from a record that stored less. */
  assert.equal(stamp('2026-09-03'), '3 Sep 2026, 00:00');

  /* AND SOMETHING THAT IS NOT A MOMENT COMES BACK AS ITSELF, rather than as `Invalid Date`. */
  assert.equal(stamp('not a date'), 'not a date');
});


test('AND PAST A DAY IT SAYS WHAT THE DAY COLUMN SAYS, AT EVERY HOUR OF THE CLOCK', () => {
  /**
   * The claim that used to be a sentence. `relative()` rounded a NOON-OFFSET and `since()` rounded
   * ELAPSED time, so past a day they disagreed by a whole band for twelve hours out of every
   * twenty-four — an `instant` column and a `day` column naming the same afternoon, in one table,
   * differing. And `relative()` alone was wrong near midnight: yesterday's date read **"today"**.
   *
   * Both count calendar days now, so this is checkable rather than assertable: four hundred hours
   * back from four different times of day, and the two have to give the same answer every time.
   * A prose claim about two functions agreeing is the kind that survives its own falsification.
   */
  let compared = 0;
  for (const at of [0, 6, 12, 23]) {
    const now = Date.UTC(2026, 8, 8, at);
    for (let h = 24; h <= 400; h += 1) {
      const iso = new Date(now - h * 3_600_000).toISOString();
      assert.equal(since(iso, now), relative(iso.slice(0, 10), now), `${h}h before ${at}:00`);
      compared += 1;
    }
  }
  assert.ok(compared > 1_500, `only ${compared} comparisons`);

  /**
   * AND THE ANSWER IS THE RIGHT ONE, not merely the same one.
   *
   * Both sides are `band(|dayIndex(a) - dayIndex(b)|)`, literally the same expression — so an error
   * inside `dayIndex` cancels and the agreement above proves nothing about it. A review shifted it by
   * one and made it truncate instead of floor, and all 1,508 comparisons stayed green.
   *
   * These are absolute: a day is a day, counted from midnight UTC, which is what the whole fix means.
   */
  const noon = Date.UTC(2026, 8, 8, 12);
  for (const [days, said] of [[1, '1d ago'], [2, '2d ago'], [14, '2w ago'], [21, '3w ago']] as const) {
    assert.equal(since(new Date(noon - days * 86_400_000).toISOString(), noon), said, `${days} days back`);
    assert.equal(relative(new Date(noon - days * 86_400_000).toISOString().slice(0, 10), noon), said);
  }
  /**
   * AND IT FLOORS RATHER THAN TRUNCATES, which is only observable before 1970 — and a record holds
   * dates a person types, so a founding date or a date of birth reaches it. `Math.trunc` rounds
   * toward zero, so on the far side of the epoch it puts a day in the wrong bucket and every
   * distance past it is out by one.
   *
   * (A constant OFFSET on `dayIndex` is not a defect and cannot be tested: both callers take a
   * difference, so it cancels. Saying so is better than an assertion that pretends otherwise.)
   */
  assert.equal(relative('1969-12-31', Date.UTC(1970, 0, 1, 12)), '1d ago');
  assert.equal(relative('1969-12-30', Date.UTC(1970, 0, 1, 12)), '2d ago');
  assert.equal(relative('1969-12-31', Date.UTC(1969, 11, 31, 12)), 'today');

  /* And the boundary is midnight, not "twenty-four hours ago": 23:59 on the previous day is one day
     back however few minutes have passed. */
  const justAfter = Date.UTC(2026, 8, 8, 0, 1);
  assert.equal(since(new Date(Date.UTC(2026, 8, 7, 23, 59)).toISOString(), justAfter), '2 min ago', 'inside an hour it is still minutes');
  assert.equal(relative('2026-09-07', justAfter), '1d ago', 'the day before is one day back one minute after midnight');

  /* AND THE MIDNIGHT CASE THAT STARTED IT, on `relative()` alone. */
  const midnight = Date.UTC(2026, 8, 8, 0);
  assert.equal(relative('2026-09-07', midnight), '1d ago', 'yesterday read as today at midnight');
  assert.equal(relative('2026-09-08', midnight), 'today');
  assert.equal(relative('2026-09-09', midnight), 'in 1d');
});

test('A SIZE IS SAID IN THE UNIT THAT TELLS TWO FILES APART', () => {
  /**
   * Written because a screen printed **"0.2 MB"** for all four snapshots of a ninety-three-row record
   * — four distinct copies, four identical strings, on the one screen whose job is to say which copy
   * is which — and then shipped with no test of its own at all. Seven mutations survived: the guard,
   * the whole-bytes branch, both decimal places, the unit labels, 1000-vs-1024, and never climbing
   * past kB.
   */
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(1), '1 B');
  assert.equal(bytes(999), '999 B');
  assert.equal(bytes(1_000), '1.00 kB');
  assert.equal(bytes(157_000), '157 kB');
  assert.equal(bytes(1_240_000), '1.24 MB');
  assert.equal(bytes(41_943_040), '41.9 MB');
  assert.equal(bytes(2_500_000_000), '2.50 GB');
  assert.equal(bytes(2_500_000_000_000), '2.50 TB');

  /* DECIMAL, NOT BINARY, and the decision is recorded rather than assumed: a person reading a file
     listing sees `MB`. 1024 would make this `976 kB`. */
  assert.equal(bytes(1_000_000), '1.00 MB');
  assert.notEqual(bytes(1_048_576), '1.00 MB');

  /* THREE SIGNIFICANT FIGURES, so the values a snapshot list actually holds are different strings.
     A fixed decimal place is what collapsed them. */
  assert.equal(new Set([157_000, 160_460, 152_100].map(bytes)).size, 3);

  /**
   * AND NO BAND SPELLS THE ONE ABOVE IT. The unit was chosen before the rounding, so `999_500` read
   * `"1,000 kB"` — four significant figures and a thousands separator inside a kB reading — five
   * hundred bytes before the same file becomes `1.00 MB`. Every boundary had it.
   */
  assert.equal(bytes(999_499), '999 kB');
  assert.equal(bytes(999_500), '1.00 MB');
  assert.equal(bytes(999_999_999), '1.00 GB');
  assert.equal(bytes(999_999_999_999), '1.00 TB');
  assert.equal(bytes(999.5), '1.00 kB', 'a four-digit reading of a unit that stops at three');
  for (const n of [999.5, 9_995, 99_950, 999_500, 999_999_999]) {
    const said = bytes(n);
    assert.doesNotMatch(said, /^1,000 /u, `${n} spells the band above it: ${said}`);
    assert.doesNotMatch(said, /^\d{4}/u, `${n} has four digits before the unit: ${said}`);
  }

  /* A size that is not one is `—`, never a number. A negative byte count is a bug upstream and
     printing it as `-1 B` is how it reaches a screen unnoticed. */
  for (const n of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.equal(bytes(n), MISSING);

  /* AND NEVER FOUR FIGURES, AT ANY SIZE. The unit list stopped at `TB`, so the loop's escape —
     `i === units.length - 1` — returned whatever the top rung held: `bytes(999_500_000_000_000)`
     was `"1,000 TB"`, a thousands separator inside a three-figure reading, which is the exact shape
     this function rejects one rung lower. The escape is not the bug; a ladder shorter than the
     numbers handed to it is. */
  assert.equal(bytes(999_500_000_000_000), '1.00 PB');
  for (let e = 0; e < 24; e++)
    for (let m = 1; m < 10; m += 0.017) {
      const figure = bytes(m * 10 ** e).split(' ')[0]!.replaceAll(',', '').replace('.', '').replace(/^0+/u, '');
      assert.ok(figure.length <= 3, `${m * 10 ** e} reads ${bytes(m * 10 ** e)}`);
    }

  /* Monotone, which is the property a list of them is read for. */
  let last = -1;
  for (let n = 0; n < 5_000_000; n += 1_237) {
    const v = Number(bytes(n).replace(/[^\d.]/gu, '')) * (bytes(n).includes('MB') ? 1_000_000 : bytes(n).includes('kB') ? 1_000 : 1);
    assert.ok(v >= last, `${n} reads smaller than the size before it`);
    last = v;
  }
});

test('THE LADDER IS `36 §5.5`’S, AND IT ONLY GOES ONE WAY', () => {
  /**
   * IT WAS A PRIVATE LADDER THAT HAPPENED TO BE TESTED. `Nd` cut at 14 rather than 13, months
   * divided by 30 rather than 30.44, years by 365 rather than 365.25, and a **`1.0y`…`1.9y` decimal
   * form that appears in no document at all**. Measured against the published table: **412 of 1,200
   * day counts disagreed**, and four tests — including this one — pinned every one of them.
   *
   * A test that kills its mutants is not a test that checks the right answer. These assertions now
   * come off `36 §5.5`'s table, boundary by boundary, so the thing being asserted is the document.
   *
   * AND NO BAND SPELLS PAST ITS OWN EDGE — which the table itself broke in two places, so the fix
   * belonged there and `36 §5.5` carries the amendment and its reasoning:
   *
   *   · `round(60/7)` is `9w`, sixty-three days, immediately below `round(61/30.44)` = `2mo`,
   *     sixty-one. One day older read as two days younger, on the ladder every date in this product
   *     goes through. Capped at `8w`.
   *   · `round(364/30.44)` is `12mo`, a year said the long way, immediately below `1y`. Capped at
   *     `11mo`.
   *
   * The same defect `bytes()` was fixed for, twenty lines down and older.
   */
  const at = (d: number) => new Date(NOW - d * 86_400_000).toISOString().slice(0, 10);
  /* `1–13 → Nd`, and the cut is at 13. It was at 14, which put `14d` beside a `2w` that the table
     gives to 14 — one duration, two spellings, on the boundary itself. */
  assert.equal(relative(at(13), NOW), '13d ago');
  assert.equal(relative(at(14), NOW), '2w ago');
  /* `14–60 → Nw` at round(d/7), capped at its own top. */
  assert.equal(relative(at(17), NOW), '2w ago');
  assert.equal(relative(at(18), NOW), '3w ago');
  assert.equal(relative(at(59), NOW), '8w ago');
  assert.equal(relative(at(60), NOW), '8w ago', 'nine weeks is sixty-three days');
  /* `61–364 → Nmo` at round(d/30.44) — not 30, which is what read one month old too early from
     about seventy-five days on. */
  assert.equal(relative(at(61), NOW), '2mo ago');
  assert.equal(relative(at(75), NOW), '2mo ago', 'a divisor of 30 read this as three months');
  assert.equal(relative(at(105), NOW), '3mo ago');
  assert.equal(relative(at(364), NOW), '11mo ago', 'twelve months is a year said the long way');
  /* `≥365 → Ny` at round(d/365.25), a whole number. The `1.0y`…`1.9y` form was ours. */
  assert.equal(relative(at(365), NOW), '1y ago');
  assert.equal(relative(at(729), NOW), '2y ago');
  assert.equal(relative(at(730), NOW), '2y ago');

  /* MONOTONE OVER EIGHT YEARS, which is the property a ladder is read for and the one a per-band
     rounding breaks silently: a list sorted by date read out of order by one row in sixty. */
  const days = (said: string) => {
    const n = Number.parseFloat(said);
    return said.endsWith('d ago') ? n : said.endsWith('w ago') ? n * 7 : said.endsWith('mo ago') ? n * 30.44 : n * 365.25;
  };
  let previous = 0;
  for (let d = 1; d <= 3_000; d += 1) {
    const now = days(relative(at(d), NOW));
    assert.ok(now >= previous, `${d} days reads ${relative(at(d), NOW)}, younger than the day before it`);
    previous = now;
  }
});

test('a day is formatted, and a malformed one renders as what the author typed', () => {
  assert.equal(day('2026-04-10'), '10 Apr 2026');
  assert.equal(formatTyped('date', '31 Sep', NOW), null);
  // The argument is MINOR UNITS. An earlier draft of the spec wrote `1299 EGP` and drew
  // `EGP 1,299` — major units — against the minor-units rule of 02 §3.
  assert.equal(formatTyped('money', '129900 EGP', NOW), 'EGP 1,299.00');
  assert.equal(formatTyped('money', '1299 EGP', NOW), 'EGP 12.99');
  assert.equal(formatTyped('ref', 'tasks#241', NOW), '#241');

  /* THE LITERAL GRAMMARS ARE `36 §5.5` AND `§5.6`'S, and two of them were `Number()`'s instead.
     `05 §7.2`'s rule for the whole family is that an argument which does not parse renders as the
     author's text, MARKED — so accepting more than the grammar is not leniency, it is a figure
     drawn from something nobody meant as a figure. */
  assert.equal(formatTyped('pct', '0x1f', NOW), null, 'hex read as 31%');
  assert.equal(formatTyped('pct', '0b11', NOW), null, 'binary read as 3%');
  assert.equal(formatTyped('pct', '1e3', NOW), null, 'exponent notation read as 1,000%');
  assert.equal(formatTyped('pct', '-46.3', NOW), '−46.3%', 'and the published form still parses');
  assert.equal(formatTyped('money', '129900 egp', NOW), null, '`36 §5.6` rule 1 is `^[A-Z]{3}$`');
  assert.equal(formatTyped('money', '129900 EGP', NOW), 'EGP 1,299.00');

  /* AND A FRACTIONAL MINOR UNIT IS NOT MONEY. `02 §3`. It was rounded to a penny in silence —
     `money(0.5, 'USD')` drew `USD 0.01` — which is a false number arriving through the formatter. */
  assert.equal(money(0.5, 'USD'), MISSING);
  assert.equal(money(-0.5, 'USD'), MISSING);
  assert.equal(money(1, 'USD'), 'USD 0.01');
});

test('a percentage carries no colour, on purpose', () => {
  // Down is not bad. A fall in churn, in spend or in p95 is the work succeeding.
  const html = toHTML(parse('{{pct:-46.3}}'));
  assert.match(html, /−46.3%/);
  assert.doesNotMatch(html, /data-intent/);
  assert.equal(pct(-46.3), '−46.3%');
});

/* ── a figure that is not a figure ───────────────────────────────────────── */

test('AN IMPOSSIBLE DAY IS NOT QUIETLY MOVED TO A POSSIBLE ONE', () => {
  // `Date.UTC` normalises rather than refusing, so a shape check let 30 February through and it
  // rendered as 2 March: a date that is not in the record, unmarked, on a field somebody diaries
  // against. The module's own rule is that it never invents a day.
  for (const bad of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-32', '2025-02-29']) {
    assert.equal(day(bad), bad, `${bad} was rendered as a different day`);
    assert.equal(formatTyped('day', bad, NOW), null, `${bad} was accepted as a day`);
    assert.equal(formatTyped('until', bad, NOW), null);
  }
});

test('and a leap day in a leap year still is one', () => {
  assert.equal(day('2028-02-29'), '29 Feb 2028');
  assert.equal(day('2026-12-31'), '31 Dec 2026');
  assert.equal(day('2026-01-01'), '1 Jan 2026');
});

test('a percentage of nothing is not zero percent', () => {
  // `Number('')` is 0, so `{{pct:}}` printed `0%` — a measurement of a thing nobody measured.
  assert.equal(formatTyped('pct', '', NOW), null);
  assert.equal(formatTyped('pct', '   ', NOW), null);
  assert.equal(formatTyped('pct', 'Infinity', NOW), null);
  assert.equal(formatTyped('pct', '0', NOW), '0%', 'a real zero is still a real zero');
  assert.equal(formatTyped('pct', '-4.5', NOW), pct(-4.5));
});

/* ── the bar reads what the formatter wrote ──────────────────────────────── */

test('A NEGATIVE AMOUNT KEEPS ITS SIGN ON THE WAY BACK IN', () => {
  // `money()` writes a real minus, U+2212. The magnitude parser stripped everything outside
  // `[\d.-]`, which does not include it, so −1,299 came back as +1299 and drew a bar the length of
  // the same amount owed the other way.
  assert.equal(magnitudeOf(money(-129_900, 'GBP')), -1299);
  assert.equal(magnitudeOf(money(129_900, 'GBP')), 1299);
  assert.equal(magnitudeOf(money(-1, 'JPY')), -1);
  assert.equal(magnitudeOf('12.5 days'), 12.5);
  assert.ok(Number.isNaN(magnitudeOf('')), 'an empty cell is not zero');
  assert.ok(Number.isNaN(magnitudeOf(MISSING)), 'a missing value is not zero');
});

test('AND A RUN OF DIGITS INSIDE A WORD IS NOT THE NUMBER THE CELL STATES', () => {
  /* The pattern had no left edge, so it took the first digits anywhere in the cell:
     `magnitudeOf('Q3 −1,299.00')` was 3, which is the quarter, and the amount and its sign were never
     reached. Wrong figure, wrong side of zero, from the one function whose whole job is to read
     back what the formatter just wrote. */
  assert.equal(magnitudeOf('Q3 −1,299.00'), -1299, 'the quarter was measured instead of the amount');
  assert.equal(magnitudeOf('Q3 1,299.00'), 1299);
  assert.equal(magnitudeOf(`FY26 ${money(50_000, 'GBP')}`), 500);
  assert.ok(Number.isNaN(magnitudeOf('Q3')), 'a label is not a magnitude of 3');
  assert.ok(Number.isNaN(magnitudeOf('v1.2.3')), 'nor is a version a magnitude of 1');
  // And the four shapes this function exists to read still read as themselves.
  assert.equal(magnitudeOf(money(-129_900, 'GBP')), -1299);
  assert.equal(magnitudeOf(pct(-12.5)), -12.5);
  assert.equal(magnitudeOf(bytes(1_200_000)), 1.2);
  assert.equal(magnitudeOf('12.5 days'), 12.5);
});

test('and the bar drawn off it put a credit at the top of the chart, full length', () => {
  /* Reachable from a fence an author writes: `inline()` renders a literal cell to itself, so the
     label reaches the measurement. Measured: the −1,299 row set the scale at 3 and drew at 1.00,
     and the only row that was actually owed anything was shrunk to two thirds of a credit. A
     negative value draws no bar at all, because the scale has one side. */
  const html = toHTML(parse(['```bar | Owed', 'Ada | Q3 −1,299.00 | ', 'Bo | GBP 2.00 | ', 'Cy | GBP 1.00 | ', '```'].join(NEWLINE)));
  const tracks = html.match(/--magnitude:[\d.]+/g) ?? [];
  assert.deepEqual(tracks, ['--magnitude:1.00', '--magnitude:0.50'], 'the credit was given a bar and the debt was scaled against it');
  assert.ok(html.indexOf('--magnitude') > html.indexOf('Q3'), 'the first bar drawn belongs to the row that is owed');
});

test('a negative row draws no bar, and still shows its number', () => {
  // A proportional chart has one side. Drawing |v| would put money owed to you and money owed by
  // you at the same length, on the same side, which is the reading the sign exists to prevent.
  const html = toHTML(parse(['```bar | Owed', `Ada | ${money(50_000, 'GBP')} | `, `Bo | ${money(-129_900, 'GBP')} | `, `Cy | ${money(25_000, 'GBP')} | `, '```'].join(NEWLINE)));
  const tracks = html.match(/--magnitude:[\d.]+/g) ?? [];
  assert.deepEqual(tracks, ['--magnitude:1.00', '--magnitude:0.50'], 'the negative row was given a bar');
  assert.ok(html.includes('−'), 'the minus sign did not reach the screen');
});

/* ── and the bar reads what it DREW, not what the author typed ───────────── */

test('A BAR VALUE CELL IS A CELL, AND THE BAR IS MEASURED OFF WHAT IT DREW', () => {
  /* `prop-label` and `prop-note` went through the inline renderer, and `prop-value`, the one cell
     in the block that IS the number, was escaped raw, with the magnitude scraped off the same raw
     string. So this block printed `{{money:500000 GBP}}` in the value column and compared 500000
     minor units against the 1200 major ones it read out of the literal beside it: the first bar a
     hundred times too long, in the same chart, with every selector correct. The only test that
     exercised a magnitude seeded both rows with `money()` literals, which is precisely the case
     where reading the source and reading the render coincide, so it passed either way. */
  const src = ['```bar | Owed', 'Ada | {{money:500000 GBP}} | ', `Bo | ${money(120_000, 'GBP')} | `, '```'];
  const html = toHTML(parse(src.join(NEWLINE)));
  assert.doesNotMatch(html, /\{\{/u, 'the value cell printed its own source');
  assert.match(html, /GBP 5,000\.00/u, 'the interpolated amount never reached the screen');
  const tracks = [...html.matchAll(/--magnitude:([\d.]+)/gu)].map((m) => m[1]);
  assert.deepEqual(tracks, ['1.00', '0.24'], 'the two bars are not in proportion to the two amounts');
});

test('and a gauge bound to two live values draws the proportion between them', () => {
  // How a declared page writes a gauge. `magnitudeOf('{{cash.now}}')` is NaN, so the scale was 0
  // and the bar disappeared entirely while the value column showed the author's braces.
  const resolve = (path: string) =>
    ({ 'cash.now': money(1_250_000, 'GBP'), 'cash.target': money(2_000_000, 'GBP') })[path] ?? null;
  const html = toHTML(parse('```gauge | Cash\nRunway | {{cash.now}} | {{cash.target}}\n```'), { resolve });
  assert.match(html, /--magnitude:0\.63/u, 'the gauge drew nothing');
  assert.match(html, /GBP 12,500\.00/u);
  assert.match(html, /of <span class="figure num">GBP 20,000\.00<\/span>/u, 'the target printed its own source');
});

test('the cell magnitude is the number in the render, and an unresolved one is not a number', () => {
  // `magnitudeOf` is documented as reading "a string it just wrote". This is the wrapper that
  // makes that true of a cell: render first, read second, one function for both renderers.
  assert.equal(magnitudeOfCell('{{money:129900 GBP}}'), 1299);
  assert.equal(magnitudeOfCell('{{money:-129900 GBP}}'), -1299, 'the real minus was lost on the way back in');
  assert.equal(magnitudeOfCell('{{cash.now}}', { resolve: () => money(50_000, 'GBP') }), 500);
  assert.ok(Number.isNaN(magnitudeOfCell('{{cash.now}}')), 'a hole is not a magnitude of zero');
  assert.equal(magnitudeOfCell('GBP 1,200.00'), 1200, 'a literal still reads as itself');
});

test('a bar whose every value is a hole draws no bars at all, rather than four full ones', () => {
  // The scale is the largest finite reading. With nothing resolvable there is no scale, and a bar
  // at zero claims the value IS zero, so the rows keep their words and lose their tracks.
  const html = toHTML(parse('```bar | Owed\nAda | {{a.b}} | \nBo | {{c.d}} | \n```'));
  assert.equal((html.match(/--magnitude:/gu) ?? []).length, 0);
});

/* ── the two that were reachable from a record an agent writes ───────────── */

test('A PROTOCOL-RELATIVE URL IS NOT A SAME-ORIGIN PATH', () => {
  // `//evil.com/x` starts with a slash, carries no scheme, and the browser fills in the page's —
  // so a link written into the record went to somebody else's host wearing the shape of an
  // internal path. A slash followed by a backslash is the same thing: the URL parser reads a
  // backslash in the authority position as a slash.
  for (const bad of ['//evil.com/x', '//evil.com', '/' + String.fromCharCode(92) + 'evil.com', 'javascript:alert(1)', 'http://evil.com', 'data:text/html,x']) {
    assert.equal(safeHref(bad), null, `${bad} was treated as a safe link`);
  }
});

test('and the four shapes that ARE links still are', () => {
  assert.equal(safeHref('/r/tasks/4'), '/r/tasks/4');
  assert.equal(safeHref('#notes'), '#notes');
  assert.equal(safeHref('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeHref('mailto:a@example.com'), 'mailto:a@example.com');
  assert.equal(safeHref('  /p/money  '), '/p/money', 'a trimmed path is still a path');
});

test('a chunk size of zero is a render that never finishes', () => {
  // `i += 0`. The tab froze with no error and nothing on screen to say which component did it.
  const rows = Array.from({ length: 7 }, (_, i) => i);
  assert.deepEqual(chunkRows(rows, 0).groups.length, 7, 'zero has to fall back to one row a group');
  assert.equal(chunkRows(rows, 0).step, 1);
  assert.equal(chunkRows(rows, -5).step, 1);
  assert.equal(chunkRows(rows, Number.NaN).step, 1);
  assert.equal(chunkRows(rows, 2.7).step, 2, 'a fractional step would skip rows');
});

test('the groups and the step agree, or the row index counts a different table', () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);
  const { step, groups } = chunkRows(rows, 100);
  const flat = groups.flatMap((g, gi) => g.map((row, i) => [gi * step + i, row]));
  assert.equal(flat.length, rows.length);
  for (const [index, row] of flat) assert.equal(index, row, 'a row was announced at the wrong index');
});

/* ── the guard rails ──────────────────────────────────────────────────────── */

/**
 * THIS TEST USED TO ASSERT TWO LITERALS AND CONTRADICT ITSELF.
 *
 * `assert.ok(KINDS.table.pageOnly)` and `assert.ok(isKind('table'))` restate `kinds.ts:172`, where
 * both are written down; a table cannot disagree with itself. Then its comment said a `table`
 * fence *"degrades like an unknown kind rather than rendering an empty grid"* and the two lines
 * under it asserted that it renders as a block, which it did, as `<div class="table"></div>`,
 * exactly the empty grid the comment denied. Nothing anywhere read the flag.
 *
 * The behaviour the comment describes is the specified one (`05 §2`'s kind table, `36 §7`'s step
 * 7), so the parser reads the flag now and these assert the degrade instead of the literals.
 */
test('A PAGE-ONLY KIND DEGRADES TO ITS FENCE RATHER THAN DRAWING AN EMPTY GRID', () => {
  const [seg] = parse('```table | Open\n```');
  assert.equal(seg?.type, 'degraded');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_KIND_UNKNOWN');
  const html = toHTML(parse('```table | Open\n```'));
  assert.match(html, /block-degraded/, 'the fence was not shown back to the author');
  assert.doesNotMatch(html, /<div class="table">/, 'the empty grid is still drawn');
});

test('and a page-only fence with rows names the register, not a column count', () => {
  // `table` is `cells: 0`, so arity caught it first and said "a table row has 2 columns where
  // table takes 0". That points an author, usually an agent, which cannot see the screen, at the
  // shape of the row, when the fact is that the kind is bound to a register and takes no authored
  // rows at all. The fence is the only feedback channel there is, so it has to say the real thing.
  const [seg] = parse('```table | Open\na | b\n```');
  assert.equal(seg?.type, 'degraded');
  const fix = seg?.type === 'degraded' ? seg.fix : '';
  assert.doesNotMatch(fix, /takes 0/, 'the author was pointed at the column count');
  assert.match(fix, /register/);
});

test('and the flag is what decides it, for every kind in the table', () => {
  // The invariant the old test only named. `pageOnly` is read by the parser now, so this walks the
  // whole table rather than the one kind that carries the flag today: a seventeenth kind marked
  // page-only degrades without an edit here, and one that is not marked still draws.
  for (const [kind, spec] of Object.entries(KINDS)) {
    assert.ok(isKind(kind));
    const [seg] = parse('```' + kind + ' | H\n```');
    assert.equal(seg?.type, spec.pageOnly ? 'degraded' : 'block', `${kind} drew the wrong way`);
  }
});

/* ── cards and section: the two page kinds ────────────────────────────────── */

const onPage = (src: string) => parse(src, { page: true });
const AGENTS =
  '```cards\nmark: Project | title: Doing | who: Agent | fact: Next | when: Seen\nKiln | Fix the export | Claude |  | 3m ago | warn\nSite | Rewrite pricing | Codex | Ship it | 2h ago\n```';

test('CARDS AND SECTION ARE PAGE-ONLY: a write-up gets its fence back, a page gets the block', () => {
  for (const kind of ['cards', 'section']) assert.equal(parse('```' + kind + ' | H\n```')[0]?.type, 'degraded', kind);
  assert.equal(onPage(AGENTS)[0]?.type, 'block');
  assert.equal(onPage('```section | Working now\n | 3 | \n```')[0]?.type, 'block');
});

test('and a table is still not a fence on a page, because it has no rows anyone writes', () => {
  assert.equal(onPage('```table | H\na | b\n```')[0]?.type, 'degraded');
});

test('a section in a write-up is told to write a heading, not sent looking for a register', () => {
  const [seg] = parse('```section | Working now\n```');
  const fix = seg?.type === 'degraded' ? seg.fix : '';
  assert.match(fix, /heading/u);
  assert.doesNotMatch(fix, /register/u);
});

test('A CARD TAKES ONE FIGURE AND AT MOST THREE FACTS, and says so rather than dropping one', () => {
  for (const head of ['figure | figure', 'fact | fact | fact | fact', 'title | size', 'title | title', '']) {
    const row = head.split('|').map(() => 'x').join(' | ');
    const [seg] = onPage('```cards\n' + (head ? `${head}\n${row}\n` : '') + '```');
    assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY', `"${head}" was drawn`);
  }
  const every = 'title | figure | fact | fact | fact | trend | ring | who | when | mark';
  assert.equal(onPage('```cards\n' + every + '\n```')[0]?.type, 'block');
});

test('the header row carries no tone, and a card’s tone is read only past its last column', () => {
  const [seg] = onPage('```cards\ntitle | fact: State\nKiln | good\nSite | good | warn\n```');
  assert.equal(seg?.type, 'block');
  if (seg?.type !== 'block') return;
  assert.deepEqual(seg.rows[1], { cells: ['Kiln', 'good'] }, 'a value that is also a tone word is a value');
  assert.equal(seg.rows[2]?.tone, 'warn');
});

test('a card leads with its mark, is named by a heading, and wears its tone beside the name', () => {
  const html = toHTML(onPage(AGENTS));
  assert.match(
    html,
    /<li class="cards-item" data-intent="warn"><div class="cards-head"><span class="cards-mark" aria-hidden="true">K<\/span><h3 class="cards-title">Fix the export<\/h3><span class="glyph" role="img" aria-label="watch this">/u,
  );
  assert.match(html, /<span class="cards-face" aria-hidden="true">C<\/span><span class="cards-name">Claude<\/span>/u, 'an agent is a face');
  const first = /<li class="cards-item" data-intent="warn">.*?<\/li>/u.exec(html)?.[0] ?? '';
  assert.doesNotMatch(first, /cards-facts|<dd>—<\/dd>/u, 'a fact nobody wrote is not drawn, and a card with none has no list');
  assert.match(html, /<dt>Next<\/dt><dd>Ship it<\/dd>/u, 'a fact that is written still is');
  assert.match(html, /<span class="cards-when">Seen\u00a03m ago<\/span>/u, 'its column says what the day is');
});

test('a card with no title is the person, so the face takes the mark’s place and is not drawn twice', () => {
  const html = toHTML(onPage('```cards\nwho: Name | fact: Role\nthe assistant | Agent\n```'));
  assert.match(html, /<span class="cards-face" aria-hidden="true">A<\/span><h3 class="cards-title">the assistant<\/h3>/u);
  assert.doesNotMatch(html, /cards-who/u);
});

test('A TREND THAT MISSES A VALUE HAS A GAP THERE, NEVER A DIP TO ZERO', () => {
  const t = trendOf('18 20 - 24');
  assert.ok(t);
  assert.equal(t.d, 'M0 90 L333.33 63.33 M1000 10', 'the line lifts off at the gap and starts again after it');
  assert.equal(t.end, 'M1000 10h0');
  assert.deepEqual(t.said, ['18', '20', 'no value', '24']);
  assert.equal(trendOf('7'), null, 'one point is not a line');
  assert.equal(trendOf('- 5'), null);
  assert.equal(trendOf('3 3 3')?.d, 'M0 50 L500 50 L1000 50', 'a flat run is drawn in the middle, not on the floor');
});

test('A TREND THE RECORD FILLED READS THE SAME AS ONE TYPED, however the run was said, and a gap stays a gap', () => {
  const typed = trendOf('18 20 - 24');
  for (const said of ['[18,null,24]', '18,,24', '[18, null, 24]']) {
    const t = trendOf(said);
    assert.deepEqual(t?.said, ['18', 'no value', '24'], said);
    assert.equal(t?.d, 'M0 90 M1000 10', `${said}: two points either side of a gap, never a line through zero`);
  }
  assert.deepEqual(trendOf('[18,20,null,24]')?.d, typed?.d, 'an array draws the line the dialect draws');
  assert.deepEqual(trendOf('1,200 3,400 2,100')?.said, ['1,200', '3,400', '2,100'], 'a comma between spaced numbers groups thousands');
  assert.equal(trendOf('1,200 3,400')?.d, 'M0 90 L1000 10');
  assert.deepEqual(trendOf('3, 5, 2')?.said, ['3', '5', '2']);
  assert.equal(trendOf('[]'), null);
  assert.equal(trendOf('[7]'), null);
});

test('a ring is a proportion or nothing: 3/5 and 60% draw an arc, a word keeps its words', () => {
  assert.equal(ringOf('3/5'), 0.6);
  assert.equal(ringOf('60%'), 0.6);
  assert.equal(ringOf('150%'), 1, 'clamped to the ring');
  assert.equal(ringOf('nearly'), null);
  assert.equal(ringOf('3/0'), null, 'a proportion of nothing is not a full ring');
  assert.equal(ringDash(0.6), '60 100');
});

test('the figure is drawn with its currency symbol, and a missing figure is the missing mark', () => {
  const html = toHTML(
    onPage('```cards\ntitle | figure: Owed | trend: Weekly | ring: Done\nKiln | GBP 4,800.00 | 18 20 - 24 | 3/5\nSite |  | 7 | nearly\n```'),
  );
  assert.match(html, /<span class="cards-value num">£4,800<\/span><span class="cards-label">Owed<\/span>/u, 'a card\'s figure is a tile\'s, said short');
  assert.match(
    toHTML(onPage('```cards\ntitle | figure: Earned\nKiln | £18,400.00\u00a0GBP\nSite | £4,200.50\n```')),
    /cards-value num">£18,400<\/span>.*cards-value num">£4,201<\/span>/u,
    'one mark of currency, and whole from a thousand up',
  );
  assert.match(html, /<span class="cards-value num">—<\/span>/u);
  assert.match(html, /role="img" aria-label="Weekly: 18, 20, no value, 24"/u);
  assert.match(html, /stroke-dasharray="60 100"/u);
  assert.equal(html.match(/class="cards-trend"/gu)?.length, 1, 'one point drew a line');
  assert.equal(html.match(/cards-ring-mark/gu)?.length, 1, 'a word drew a ring');
  assert.match(html, /<span class="cards-ring"><span class="cards-value num">nearly<\/span>/u);
});

test('a title that is a link makes the card a door', () => {
  const html = toHTML(onPage('```cards\ntitle | fact: Stage\n[Kiln](/r/things/1) | Building\n```'));
  assert.match(html, /<h3 class="cards-title"><a href="\/r\/things\/1">Kiln<\/a><\/h3>/u);
});

test('a card whose quiet cell says anything is dimmed, and the cell itself is never printed', () => {
  const html = toHTML(onPage('```cards\ntitle | when: Seen | quiet\nAxis QA | 3m ago | \nReconcile | 2h ago | quiet\n```'));
  assert.equal(html.match(/data-quiet=""/gu)?.length, 1, 'only the card that went quiet is dimmed');
  assert.match(html, /<li class="cards-item" data-quiet=""><div class="cards-head"><h3 class="cards-title">Reconcile<\/h3>/u);
  assert.doesNotMatch(html, />quiet</u, 'the marker reached the screen as a word');
  const [twice] = onPage('```cards\ntitle | quiet | quiet\nA |  | \n```');
  assert.equal(twice?.type, 'degraded', 'two quiet columns');
});

test('A RUN THE HOST HANDS IS NOT DIMMED, since its face says whether it went quiet, and wears its maker\'s mark', () => {
  const [seg] = onPage('```cards\ntitle | who | when: Seen | quiet\nReconcile | S7 | 2h ago | quiet\nAxis QA | Claude | 1h ago | quiet\n```');
  assert.equal(seg?.type, 'block');
  const mark = { d: 'M0 0h24v24z', rule: 'nonzero' as const, tone: 'claude' };
  const html = toHTML([seg!], {
    runs: [{ run: 'S7', agent: 'claude-code', live: 'stopped' }, null],
    agentMark: (name: string) => (/claude/iu.test(name) ? mark : null),
  } as never);
  assert.equal(html.match(/data-quiet=""/gu)?.length, 1, 'a handed run was dimmed, or a card that is no run was not');
  assert.match(html, /<li class="cards-item" data-quiet=""><div class="cards-head"><h3 class="cards-title">Axis QA/u);
  assert.match(html, /<path class="cards-run-agent" d="M0 0h24v24z" fill-rule="nonzero" clip-rule="nonzero" transform="translate\(10\.5 10\.5\) scale\(0\.625\)" fill="currentColor" data-tone="claude" style="fill:var\(--agent-claude, currentColor\)"><\/path>/u, 'the run wore a glyph and not its maker\'s mark');
});

test('a card grid with no cards says so in a sentence', () => {
  assert.match(toHTML(onPage('```cards\ntitle | fact: Role\n```')), /<p class="cards-empty">Nothing to show\.<\/p>/u);
});

test('A SECTION IS A HEADING, NOT A CAPTION, and its count shows only when it counts something', () => {
  const html = toHTML(onPage('```section | Working now\n | 3 | \n```'));
  assert.doesNotMatch(html, /figcaption/u);
  assert.match(html, /<h2 class="sec-title">Working now<span class="sec-count num">3<\/span><\/h2>/u);
  assert.doesNotMatch(toHTML(onPage('```section | Working now\n | 0 | \n```')), /sec-count/u, 'a zero is not a count');
  assert.doesNotMatch(toHTML(onPage('```section | Working now\n```')), /sec-count|sec-fold/u);
});

test('a folded section carries its control, shut, with the words for both states', () => {
  const html = toHTML(onPage('```section | Parked and retired\nthing | 4 | fold\n```'));
  assert.match(html, /<span class="sec-glyph" data-glyph="thing" aria-hidden="true"><\/span>Parked and retired/u);
  assert.match(
    html,
    /<details class="sec-fold"><summary class="sec-toggle"><span class="sec-show">Show<\/span><span class="sec-hide">Hide<\/span><\/summary><\/details>/u,
  );
  assert.doesNotMatch(html, /<details[^>]*open/u, 'folded means it starts shut');
});

test('and the two page kinds add no inline style: every mark is placed by an attribute', () => {
  const html = toHTML(
    onPage(`${AGENTS}\n\`\`\`cards\ntitle | trend | ring\nA | 1 2 3 | 2/4\n\`\`\`\n\`\`\`section | S\n | 2 | fold\n\`\`\``),
  );
  assert.doesNotMatch(html, /style=/u);
});

/* ── feed and diff: what agents did, and how a skill changed ──────────────── */

const FEED =
  '```feed\nagent | Claude | 14 | saves on [Variable axis QA](/r/things/4) | 3h ago\nrule | Late fees | 2 | reminders sent | 5h ago\n' +
  'seen | 2d ago\nagent | Codex |  | opened Kiln | 3d ago | bad\nyou | You | 1 | decision on Pricing | 4d ago\n```';

test('A FEED IS PAGE-ONLY, and a write-up is pointed at the kind that takes authored rows', () => {
  const [seg] = parse(FEED);
  assert.equal(seg?.type, 'degraded');
  assert.match(seg?.type === 'degraded' ? seg.fix : '', /Use "timeline"/u);
  assert.equal(onPage(FEED)[0]?.type, 'block');
});

test('a feed row is filed under agent, rule or you, and a row under anything else degrades rather than vanishing', () => {
  for (const src of ['```feed\nclaude | Claude | 1 | saved | now\n```', '```feed\nseen | 1d ago\nseen | 2d ago\n```']) {
    const [seg] = onPage(src);
    assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY', src);
  }
});

test('THE FEED KEEPS A MACHINE’S WORK APART FROM THE PERSON’S, and a burst is one row', () => {
  const html = toHTML(onPage(FEED));
  const groups = [...html.matchAll(/<div class="feed-group" data-by="([a-z]+)">/gu)].map((m) => m[1]);
  assert.deepEqual(groups, ['agent', 'rule', 'you'], 'agents, then rules, then you');
  assert.match(
    html,
    /<li class="feed-row" data-new data-row="\d+"><span class="feed-count num">14<\/span><span class="feed-face" aria-hidden="true">C<\/span><span class="feed-what"><span class="feed-who">Claude<\/span> saves on <a href="\/r\/things\/4">Variable axis QA<\/a><\/span><span class="feed-when" data-calm="">3h ago<\/span><\/li>/u,
  );
  assert.match(html, /<span class="feed-count num"><\/span>/u, 'a row with no count has a gap there, not a zero');
  /* A RULE WEARS NO LETTER: `L` for Late fees, `C` for Categorise, said nothing a rule's name beside it does not. AND
     NO EMPTY FACE: the slot kept its column, and every rule's line sat indented under nothing. */
  assert.match(html, /data-by="rule"><h3 class="feed-head">Rules<span class="feed-new num">2 new<\/span><\/h3><ul class="feed-rows"><li class="feed-row" data-new data-row="\d+"><span class="feed-count num">2<\/span><span class="feed-what">/u);
  assert.doesNotMatch(html, /style=/u);
});

test('A LINE OF ONE THING HAS NO COUNT: `1 C Categorise what cleared` was eight rows of noise on Today', () => {
  const html = toHTML(onPage('```feed\nrule | Categorise what cleared | 1 | changed TALLYARD | 2h ago\nrule | Chase late payments | 3 | reminders sent | 3h ago\n```'));
  const counts = [...html.matchAll(/<span class="feed-count num">([^<]*)<\/span>/gu)].map((m) => m[1]);
  assert.deepEqual(counts, ['', '3'], 'a one is a gap, a burst keeps its number');
  assert.doesNotMatch(html, /<span class="feed-face" aria-hidden="true">[A-Z]<\/span>/u, 'and no rule wears its first letter');
});

test('AN AGENT WEARS ITS MAKER\'S MARK WHERE THE HOST DRAWS ONE, in the feed and on a card, and a person keeps their initial', () => {
  const CLAUDE: AgentMark = { d: 'M1 1h22v22H1z', rule: 'nonzero', tone: 'claude' };
  const CURSOR: AgentMark = { d: 'M2 2h20v20H2z', rule: 'evenodd', tone: 'ink' };
  const agentMark = (name: string): AgentMark | null => (name === 'Claude' ? CLAUDE : name === 'Cursor' ? CURSOR : null);
  const feed = toHTML(onPage(FEED), { agentMark });
  assert.match(
    feed,
    /<span class="feed-face" data-agent="" aria-hidden="true"><svg class="agent-mark" data-tone="claude" viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style="fill:var\(--agent-claude, currentColor\)"><path d="M1 1h22v22H1z" fill-rule="nonzero" clip-rule="nonzero"><\/path><\/svg><\/span><span class="feed-what"><span class="feed-who">Claude<\/span>/u,
  );
  assert.match(feed, /<span class="feed-face" aria-hidden="true">C<\/span><span class="feed-what"><span class="feed-who">Codex/u, 'an agent the host draws no mark for keeps its letter');
  assert.match(feed, /<span class="feed-face" aria-hidden="true">Y<\/span><span class="feed-what"><span class="feed-who">You/u);
  const cards = toHTML(onPage('```cards\ntitle: Project | fact: Health | who: Agent\nKiln | At risk | Claude\nMarlow | On track | Cursor\nPortage | Off track | J. Okonkwo\n```'), { agentMark });
  assert.match(cards, /<div class="cards-who"><span class="cards-face" data-agent="" aria-hidden="true"><svg class="agent-mark" data-tone="claude"[^>]*><path d="M1 1h22v22H1z"/u);
  assert.match(cards, /<div class="cards-who"><span class="cards-face" data-agent="" aria-hidden="true"><svg class="agent-mark" data-tone="ink" viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M2 2h20v20H2z" fill-rule="evenodd"/u, 'an ink mark has no paint of its own');
  assert.match(cards, /<div class="cards-who"><span class="cards-face" aria-hidden="true">J<\/span>/u);
  assert.doesNotMatch(toHTML(onPage(FEED)), /agent-mark/u, 'a host that draws no marks keeps the faces it had');
});

test('new is said in words as well as in the accent: the head counts it, and a line says where the read rows begin', () => {
  const html = toHTML(onPage(FEED));
  assert.match(html, /<h3 class="feed-head">Agents<span class="feed-new num">14 new<\/span><\/h3>/u, 'a burst of fourteen is fourteen new things');
  assert.match(html, /<li class="feed-seen">Before you last looked<\/li><li class="feed-row" data-intent="bad" data-row="\d+">/u);
  assert.match(html, /<h3 class="feed-head">You<span class="feed-tally num" data-calm="">1<\/span><\/h3>/u, 'nothing new is a plain count');
  assert.equal(html.match(/feed-seen/gu)?.length, 1, 'a group with nothing read, or nothing new, has no line');
});

test('AGENTS GROUPS BY WHO DID IT, one head per agent in the order they first appear, and a folded rest says earlier', () => {
  const src =
    '```agents\nClaude | 3 | changed [Write the notes](/r/tickets/2) | 3h ago\nCodex | 1 | added Fix login | 5h ago | warn\nClaude | 9 |  | 1d ago\n```';
  assert.equal(parse(src)[0]?.type, 'degraded', 'page-only, as a feed is');
  const html = toHTML(onPage(src));
  const heads = [...html.matchAll(/<h3 class="feed-head">([^<]+)<span class="feed-tally num">(\d+)<\/span>/gu)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(heads, ['Claude 12', 'Codex 1']);
  /* WHO DID IT IN WORDS ON THE LINE, as a feed says it ("Claude changed ..."), and a count only for a burst. */
  assert.match(html, /<span class="feed-what"><span class="feed-who">Claude<\/span> changed <a href="\/r\/tickets\/2">Write the notes<\/a><\/span>/u);
  assert.match(html, /<span class="feed-count num"><\/span><span class="feed-face" aria-hidden="true">C<\/span><span class="feed-what"><span class="feed-who">Codex<\/span> added Fix login/u, 'a lone change says no 1');
  assert.match(html, /<span class="feed-what">earlier<\/span><span class="feed-when">1d ago<\/span>/u);
  assert.match(html, /<li class="feed-row" data-intent="warn">/u);
  assert.match(toHTML(onPage('```agents\n```')), /<p class="feed-empty">No agent has done anything here yet\.<\/p>/u);
  assert.doesNotMatch(html, /style=/u);
});

test('an empty feed says one of two things: nothing new, or no mark yet', () => {
  assert.match(toHTML(onPage('```feed\nseen | 2d ago\n```')), /<p class="feed-empty">Nothing new\.<\/p>/u);
  assert.match(toHTML(onPage('```feed\nseen | \n```')), /<p class="feed-empty">Nothing to catch up on yet\. /u);
  assert.match(toHTML(onPage('```feed\n```')), /<p class="feed-empty">Nothing new\.<\/p>/u);
});

test('with no mark, nothing is new, and the rows are still drawn', () => {
  const html = toHTML(onPage('```feed\nagent | Claude | 3 | saves | 1h ago\nrule | Late fees | 1 | sent | 2h ago\nseen |\n```'));
  assert.doesNotMatch(html, /data-new|feed-new|feed-seen/u);
  assert.match(html, /Agents<span class="feed-tally num" data-calm="">3<\/span>/u);
});

test('A FEED OF ONE GROUP DRAWS NO HEAD, and a name the bank shouted is written as a person writes it', () => {
  const html = toHTML(onPage('```feed\nrule | Categorise what cleared | 1 | changed KILN STOREFRONT PAYOUT at HSBC UK | 4w ago\nrule | Catch a repeat | 1 | suggested SG10 | 4w ago\n```'));
  assert.doesNotMatch(html, /feed-head|>Rules</u, '"Rules" alone over every line named nothing');
  assert.match(html, /changed Kiln Storefront Payout at HSBC UK/u, 'an acronym stays one');
  assert.match(html, /suggested SG10/u, 'a ref with a figure in it is never cased');
  assert.equal(feedCased('changed TALLYARD'), 'changed Tallyard');
  assert.equal(feedCased('NORTHERN RAIL'), 'Northern Rail');
  assert.equal(feedCased('paid VAT to HMRC'), 'paid VAT to HMRC');
  assert.equal(feedCased('BÄCKEREI MÜLLER'), 'Bäckerei Müller', 'a capital outside ASCII is a letter of the word, not its edge');
  assert.equal(feedCased('CAFÉ ROUGE LTD'), 'Café Rouge LTD');
  assert.deepEqual(feedCasedNodes([{ type: 'link', href: '/r/x', body: [{ type: 'text', text: 'FENWICK CLOUD' }] }, { type: 'code', text: 'TALLYARD' }]), [
    { type: 'link', href: '/r/x', body: [{ type: 'text', text: 'Fenwick Cloud' }] },
    { type: 'code', text: 'TALLYARD' },
  ]);
});

test('A LINE DIFF PAIRS WHAT IT CAN, and a changed line reads as the old one, then the new one', () => {
  assert.deepEqual(
    diffRows('When a deploy fails,\nretry once.\nLog the run.\n', 'When a deploy fails,\nretry twice,\nthen page the owner.\nLog the run.'),
    ['  When a deploy fails,', '- retry once.', '+ retry twice,', '+ then page the owner.', '  Log the run.'],
  );
  assert.deepEqual(
    lineDiff('a\nb\nc\nd', 'a\nc\nd\ne').map((l) => `${l.op} ${l.text}`),
    ['same a', 'del b', 'same c', 'same d', 'add e'],
  );
  assert.deepEqual(diffRows('', 'a'), ['+ a']);
  assert.deepEqual(diffRows('a\nb', ''), ['- a', '- b']);
  assert.deepEqual(diffRows('a\r\nb', 'a\nb'), ['  a', '  b'], 'a line ending is not a change');
});

test('a line that is itself a fence cannot close the diff, because every row starts with its mark', () => {
  const segs = parse('```diff\n' + diffRows('a', '```\nb').join('\n') + '\n```');
  assert.equal(segs.length, 1);
  assert.equal(segs[0]?.type, 'block');
});

test('A DIFF ROW STARTS WITH ITS MARK, and a row that does not degrades with the row named', () => {
  const [seg] = parse('```diff | Deploy\n  keep\n@@ -1 +1 @@\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY');
  assert.match(seg?.type === 'degraded' ? seg.fix : '', /"@@ -1 \+1 @@" does not/u);
  assert.equal(parse('```diff\n-old\n+new\n same\n\n```')[0]?.type, 'block', 'a unified diff reads, and a blank line is a shared empty one');
});

test('a removed line is a del with a glyph named "removed", never a colour alone', () => {
  const html = toHTML(parse('```diff | Deploy, v3 to v4\n  When a deploy fails,\n- retry once.\n+ retry twice.\n```'));
  assert.match(html, /<figcaption class="block-head">Deploy, v3 to v4<\/figcaption>/u);
  assert.match(html, /<p class="diff-sum">1 line added, 1 removed<\/p>/u);
  assert.match(
    html,
    /<del class="diff-line" data-op="del"><span class="diff-mark" role="img" aria-label="removed">−<\/span><span class="diff-text">retry once\.<\/span><\/del>/u,
  );
  assert.match(html, /<ins class="diff-line" data-op="add"><span class="diff-mark" role="img" aria-label="added">\+<\/span>/u);
  assert.doesNotMatch(html, /style=|tabindex/u, 'the lines wrap in their box, so there is no scroller to reach');
});

test('A LONG RUN OF SHARED LINES FOLDS, keeping three beside each change', () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
  const plan = diffPlan(diffRows(before, before.replace('line 10', 'line ten')));
  assert.deepEqual(
    plan.parts.map((p) => (p.fold ? `fold ${p.lines.length}` : p.lines.length)),
    ['fold 6', 8, 'fold 7'],
  );
  assert.match(toHTML(parse('```diff\n' + diffRows(before, before).join('\n') + '\n```')), /<p class="diff-sum">No change<\/p><div class="diff-lines"><details class="diff-fold"><summary class="diff-toggle">20 lines unchanged<\/summary>/u);
  assert.equal(diffPlan(['  a', '  b', '  c']).parts[0]?.fold, false, 'three lines are not worth a fold');
});

test('prose in a drawn block is not a style problem, it is a row', () => {
  // An agent told to "summarise in a stat block" will put a sentence in a cell. It must still
  // render, because the write is accepted and the fence is the feedback channel.
  const html = toHTML(parse('```stat | H\nA long sentence that is not a figure at all | 1 | n\n```'));
  assert.match(html, /A long sentence/);
});

/* ── a ledger held by position belongs to one fence ──────────────────────── */

/**
 * A primitive's own source, read as text.
 *
 * A `.svelte` file cannot be mounted under `node --test`: there is no compiler in this package's
 * test path and no DOM behind it, and an effect that fires on a prop change is not visible in a
 * rendered tree at all. So the rules that live in a component are asserted the way `apps/web`
 * already asserts this component's sentinel: over the file. Everything with an answer worth
 * asserting is pulled out into `src/board.ts`, `src/ticks.ts` and `svelte/types.ts` instead, which
 * is what `board.ts`'s header says it is for.
 */
const componentSource = (name: string): string =>
  readFileSync(new URL(`../svelte/p/${name}.svelte`, import.meta.url), 'utf8');

/** The one `$effect` each of the two ledger-holding primitives has, as source. */
const fenceEffect = (name: string): string =>
  /\$effect\(\(\) => \{([\s\S]*?)\n {2}\}\);/u.exec(componentSource(name))?.[1] ?? '';

test('A BOARD DROPS ITS MOVE LEDGER WHEN THE FENCE CHANGES, AS THE CHECKLIST ALREADY DID', () => {
  /* `moved` is keyed by row INDEX, because the dialect is text and a row has no id, so it is a
     fact about one document. `List` drops its ticks when `block.raw` changes and says why;
     `Grid` dropped nothing, and the page iterates its segments unkeyed, so Svelte reuses the
     component when the document changes under it. The cost is below, in the arithmetic. */
  for (const name of ['Grid', 'List'])
    assert.match(fenceEffect(name), /block\.raw/u, `${name} does not watch the fence its ledger belongs to`);
  const grid = fenceEffect('Grid');
  for (const held of ['moved', 'focus', 'carrying', 'over'])
    assert.match(grid, new RegExp(`\\b${held}\\s*=`, 'u'), `Grid carries ${held} across a fence change`);
});

test('and this is what a kept one does to the board it is kept over', () => {
  // The same `{ 2: 'Doing' }` over two different documents. `lanes` clears a mark only when the
  // new row's cell 0 already equals the stored target, which is the "the host wrote it" case, so over a
  // document the reader never touched it draws a card in a column it was not declared in.
  const rows = (titles: [string, string][]) => titles.map(([state, title]) => ({ cells: [state, title, ''] }));
  const before = rows([['Todo', 'Kilnfonts'], ['Doing', 'Legal review'], ['Todo', 'Fenwick invoice']]);
  const after = rows([['Todo', 'Kilnfonts'], ['Doing', 'Legal review'], ['Blocked', 'Registrar']]);
  const moved = { 2: 'Doing' };
  assert.deepEqual(
    lanes(after, moved).find((l) => l.name === 'Doing')?.cards.map((c) => [c.row.cells[1], c.moved]),
    [['Legal review', false], ['Registrar', true]],
    'a card nobody dragged is drawn where nobody put it, wearing "Not saved"',
  );
  assert.deepEqual(
    lanes(after, {}).find((l) => l.name === 'Doing')?.cards.map((c) => c.row.cells[1]),
    ['Legal review'],
    'and with the ledger dropped, the document is the truth again',
  );
  assert.equal(lanes(before, moved).find((l) => l.name === 'Doing')?.cards.length, 2, 'the move itself still works');
});

/* ── the grid's caret ─────────────────────────────────────────────────────── */

test('THE ARROWS MOVE THE GRID’S ONE TAB STOP, AND NOTHING MOVED IT', () => {
  /* `Table` ships `role="grid"`, `role="gridcell"` on every cell and `tabindex="0"` on exactly one
     of them, and had no arrow handler at all: `grep -n Arrow Table.svelte` returned nothing and
     `focus` was `$bindable()` that the component never wrote. Two of its six callers bring their
     own arrows and four do not, so on those four a keyboard user tabbed to cell (0,0) and tabbed
     out again with every other cell unreachable, under a comment claiming the opposite. */
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'ArrowDown', 5, 8), { row: 3, col: 3 });
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'ArrowUp', 5, 8), { row: 1, col: 3 });
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'ArrowRight', 5, 8), { row: 2, col: 4 });
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'ArrowLeft', 5, 8), { row: 2, col: 2 });
});

test('Home and End are the ROW’s ends here, because a row in a grid has columns', () => {
  // Which is what the register grid has always bound them to; the whole list's ends are the same
  // keys with a modifier, and a modifier is never this component's.
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'Home', 5, 8), { row: 2, col: 0 });
  assert.deepEqual(moveCell({ row: 2, col: 3 }, 'End', 5, 8), { row: 2, col: 7 });
});

test('it clamps rather than wrapping, and the press at the edge is still swallowed', () => {
  // Under wrapping the cheapest slip, one press too many, is the largest possible move. The
  // clamp is not a `null`, so the last press before the end does not scroll the page instead.
  assert.deepEqual(moveCell({ row: 0, col: 0 }, 'ArrowUp', 5, 8), { row: 0, col: 0 });
  assert.deepEqual(moveCell({ row: 0, col: 0 }, 'ArrowLeft', 5, 8), { row: 0, col: 0 });
  assert.deepEqual(moveCell({ row: 4, col: 7 }, 'ArrowDown', 5, 8), { row: 4, col: 7 });
  assert.deepEqual(moveCell({ row: 4, col: 7 }, 'ArrowRight', 5, 8), { row: 4, col: 7 });
});

test('a caret left outside a table that has since shrunk comes back in on the first press', () => {
  // `/v/[view]` starts its caret at `{ row: 0, col: 1 }` against a table whose column count is the
  // saved view's, and a filter can take the rows away underneath it.
  assert.deepEqual(moveCell({ row: 900, col: 900 }, 'ArrowDown', 3, 2), { row: 2, col: 1 });
  assert.deepEqual(moveCell({ row: -4, col: -4 }, 'ArrowRight', 3, 2), { row: 0, col: 1 });
  assert.deepEqual(moveCell({ row: Number.NaN, col: 1.7 }, 'Home', 3, 2), { row: 0, col: 0 });
});

test('a key that is not the grid’s is left alone, so nothing bare is bound', () => {
  // A block drawn inside somebody else's page cannot collide with a keymap it knows nothing about.
  for (const key of ['j', 'k', 'Enter', ' ', 'PageDown', 'a', 'Tab', 'Escape'])
    assert.equal(moveCell({ row: 1, col: 1 }, key, 5, 8), null, `${key} was taken`);
});

test('an empty grid is not somewhere a caret can go', () => {
  assert.equal(moveCell({ row: 0, col: 0 }, 'ArrowDown', 0, 8), null);
  assert.equal(moveCell({ row: 0, col: 0 }, 'ArrowRight', 5, 0), null);
});

test('and the primitive that declares the grid is the one that carries the rover', () => {
  // The mover is only worth having where the grid is: a roving tabindex with nothing to rove it
  // is the defect this replaced.
  const src = componentSource('Table');
  assert.match(src, /role="grid"/u);
  /* `cols` is the columns and, where a row has actions, their last column, which the caret reaches too. */
  assert.match(src, /moveCell\(at, e\.key, rows\.length, cols\)/u, 'the arrows reach no mover');
  assert.match(src, /\{onkeydown\}/u, 'the grid root binds no key handler');
});

/* ── the grid's headers, and the body the phone gets ──────────────────────── */

const COLUMN = (over: Partial<Column> = {}): Column => ({ field: 'owed', label: 'Owed', width: '1fr', ...over });

test('A HEADER CLAIMS SORTABILITY ONLY WHERE THERE IS SOMETHING TO PRESS', () => {
  /* `aria-sort="none"` does not mean "not involved in sorting". It means "sortable, and not the
     column currently sorted", so it is the attribute that tells a screen-reader user there is a
     control in this header. It was written on every visible header of every table, and five of
     the six callers pass no `onsort` at all: a `comparison` block, a shared page, a related list
     and a saved view each advertised a control that is not there, once per column. */
  const plain = COLUMN();
  assert.equal(ariaSort(plain, undefined, false), undefined, 'a table that cannot sort announced a sort control');
  assert.equal(ariaSort(plain, undefined, true), 'none', 'and a table that can must still say which columns');
  // A column whose cells are a control has nothing to sort by, which is what `hideLabel` declares.
  assert.equal(ariaSort(COLUMN({ field: 'select', hideLabel: true }), undefined, true), undefined);
  // And the header is wired to it, `onsort` included: the rule is only worth having where it runs.
  assert.match(componentSource('Table'), /aria-sort=\{headerSort\(column\)\}/u, 'the header decides for itself');
  assert.match(
    componentSource('Table'),
    /ariaSort\(column, sort, onsort !== undefined\)/u,
    'the header is not told whether the table can be sorted at all',
  );
});

test('and a column that IS sorted says so, whoever set it', () => {
  /* The direction is a fact about the list on the screen, not about this header: the register
     sorts from the URL and withholds `onsort` while it has one row, and that list is still
     sorted. Silence there would be a second wrong answer in the other direction. */
  const plain = COLUMN();
  assert.equal(ariaSort(plain, { field: 'owed', dir: 'asc' }, false), 'ascending');
  assert.equal(ariaSort(plain, { field: 'owed', dir: 'desc' }, false), 'descending');
  assert.equal(ariaSort(plain, { field: 'due', dir: 'asc' }, false), undefined, 'another column’s sort is not this one’s');
  assert.equal(ariaSort(plain, { field: 'due', dir: 'asc' }, true), 'none');
});

test('and it draws them the way the caller said to, which is the way the grid does', () => {
  /* `cellSnippet` is how a caller draws a cell itself: the register's row picker, its identity
     links, its in-place editor. The card arm never called it, so below 640px every one of those
     came out as the string behind it. Both arms render one snippet now, and the assertion is that
     there is exactly one of it: two arms two hundred lines apart is how they came apart before. */
  const src = componentSource('Table');
  const cardArm = /\{#snippet card\(row: TableRow\)\}([\s\S]*?)\n\{\/snippet\}/u.exec(src)?.[1] ?? '';
  assert.notEqual(cardArm, '', 'the card arm is not where this test thinks it is');
  assert.match(cardArm, /@render cellBody\(/u, 'the card arm draws cells its own way');
  assert.doesNotMatch(cardArm, /row\.cells\[/u, 'the card arm reads cells past the rule that pairs them with columns');
  assert.ok((src.match(/@render cellBody\(/gu)?.length ?? 0) >= 2, 'only one arm draws through the shared cell');
  assert.equal(src.match(/@render cellSnippet\(/gu)?.length, 1, 'a caller’s cell snippet is drawn in one place or in none');
  assert.equal(src.match(/class="missing"/gu)?.length, 1, 'the missing mark is drawn in one place');
});

/* ── the phone card's two lines ───────────────────────────────────────────── */

/* The columns as their callers declare them today: the seed's "Who owes you" through `/p/[slug]`,
   a related list through `columnsFor`, and a `comparison` through `Block.svelte`. */
const WHO_OWES_YOU = [
  COLUMN({ field: 'what', label: 'Description', align: 'start', truncate: 'end' }),
  COLUMN({ field: 'party', label: 'Who', align: 'start', truncate: 'end' }),
  COLUMN({ field: 'amount', label: 'Amount', align: 'end', truncate: 'never' }),
  COLUMN({ field: 'due', label: 'Due', align: 'end', truncate: 'end' }),
];
const RELATED = [
  COLUMN({ field: 'seq', label: '#', align: 'end', truncate: 'middle' }),
  COLUMN({ field: 'what', label: 'Description' }),
  COLUMN({ field: 'direction', label: 'Which way' }),
];
const PICKED = [COLUMN({ field: 'select', label: 'Select', hideLabel: true }), ...WHO_OWES_YOU];
const COMPARISON = ['Option', 'Cost', 'What it gives up'].map((label, i) => COLUMN({ field: String(i), label }));
/** `runwayBlock` with `When` aligned to the end, as `13 §4.2` has dates. */
const FORECAST = [
  COLUMN({ field: 'day', label: 'When', align: 'end', truncate: 'end' }),
  COLUMN({ field: 'what', label: 'What', align: 'start', truncate: 'end' }),
  COLUMN({ field: 'delta', label: 'In and out', align: 'end', truncate: 'never' }),
  COLUMN({ field: 'balance', label: 'Balance', align: 'end', truncate: 'never' }),
];

/** One `{#snippet}` of `Table`, as source, the way the card arm above is read. */
const snippetSource = (name: string, params: string): string =>
  new RegExp(`\\{#snippet ${name}\\(${params}\\)\\}([\\s\\S]*?)\\n\\{\\/snippet\\}`, 'u').exec(componentSource('Table'))?.[1] ?? '';

test('A PHONE CARD LEADS WITH THE TEXT AND ENDS ITS FIRST LINE ON THE FIGURE', () => {
  /* One line per column made `/p/money` 6,267px at 390 against 2,800px at 1440, and its forecast
     1,615px for thirteen payments. The card is two lines now: the title and the amount, then the
     rest, and which is which comes from the alignment and truncation the columns already declare. */
  assert.deepEqual(cardPlan(WHO_OWES_YOU), { title: 0, mark: 2, start: [1], end: [3] });
  // A related list leads with the register's "#", an identifier, which never reaches a card.
  assert.deepEqual(cardPlan(RELATED), { title: 1, mark: -1, start: [2], end: [] });
  // A row picker is a control: never the title, never the figure.
  assert.deepEqual(cardPlan(PICKED), { title: 1, mark: 3, start: [2], end: [4] });
  // A `comparison` declares no alignment at all, so its first cell leads and the rest are labelled.
  assert.deepEqual(cardPlan(COMPARISON), { title: 0, mark: -1, start: [1, 2], end: [] });
  // And the card reads the declaration without second-guessing it: `runwayBlock` sets `When` at
  // the start today, so today the date leads the forecast's card.
  const asDeclared = FORECAST.map((c, i) => (i === 0 ? { ...c, align: 'start' as const } : c));
  assert.equal(cardPlan(asDeclared).title, 0);
  assert.equal(cardPlan([]).title, -1, 'a table with no columns has no title to draw');
  // The component asks once, from the columns.
  assert.match(componentSource('Table'), /const plan = \$derived\(cardPlan\(columns\)\)/u, 'the card arm does not use the plan');
});

test('A FIGURE IS DRAWN WHOLE ON EITHER LINE, AND THE BALANCE ENDS THE LINE UNDER THE PAYMENT', () => {
  /* Two figures. The first ends the title's line, because an amount beside "Legal review" reads as
     that payment's amount, which it is; the running balance ends the second line, so it still reads
     down one edge of the list. Neither is shortened: a truncated figure is not shortened, it is
     wrong (13 §4.2). */
  const plan = cardPlan(FORECAST);
  assert.deepEqual(plan, { title: 1, mark: 2, start: [], end: [0, 3] });
  const card = cardCells({ key: 'r', cells: ['3 Sep 2026', 'Legal review, February', 'GBP −19,100.00', 'GBP −4,190.00'] }, FORECAST);
  assert.equal(card.mark?.value, 'GBP −19,100.00');
  assert.equal(card.end.at(-1)?.value, 'GBP −4,190.00');
  // And the stylesheet is told which values are figures, on both lines, so it can keep them whole.
  const arm = snippetSource('card', 'row: TableRow');
  assert.match(arm, /class="table-card-mark" data-truncate=\{mark\.column\.truncate\}/u, 'the first line’s figure does not say it is one');
  assert.match(arm, /@render cellBody\(row, mark\.column, mark\.value\)/u, 'the figure is not drawn through the one cell body');
  assert.match(
    snippetSource('pair', 'row: TableRow, cell: CardCell'),
    /class="table-card-pair" data-truncate=\{cell\.column\.truncate/u,
    'a figure on the second line does not say it is one',
  );
});


test('A LEADING CURRENCY CODE is split from the amount money() wrote, and nothing else is', () => {
  assert.deepEqual(leadingCode(money(2_832_000, 'GBP')), { currency: 'GBP', rest: '28,320.00', sign: '' });
  assert.deepEqual(leadingCode(money(-129_900, 'EGP')), { currency: 'EGP', rest: '\u22121,299.00', sign: '' });
  assert.deepEqual(leadingCode('USD -5.00'), { currency: 'USD', rest: '-5.00', sign: '' });
  /* A COLUMN THAT MARKS MONEY IN AND MONEY OUT writes the sign in front of the code, and the figure is still a figure. */
  assert.deepEqual(leadingCode('+GBP 850.00'), { currency: 'GBP', rest: '850.00', sign: '+' });
  assert.equal(symbolFigure('+GBP 850.00'), '+\u00a3850.00');
  assert.equal(symbolFigure('\u2212GBP 850.00'), '\u2212\u00a3850.00');
  for (const not of ['VAT quarter to 31 Aug', 'GBP', 'Over 30 days', 'gbp 5.00', 'GBPX 5.00', ''])
    assert.equal(leadingCode(not), null, not);
});

test('a figure is drawn with a symbol where its currency has one, and keeps its code where it has none', () => {
  assert.equal(symbolFigure(money(2_832_000, 'GBP')), '£28,320.00');
  assert.equal(symbolFigure(money(-129_900, 'GBP')), '−£1,299.00');
  assert.equal(symbolFigure(money(480_000, 'USD')), '$4,800.00', 'the dollar by its own sign, as every screen says it');
  assert.equal(symbolFigure(money(129_900, 'EGP')), null, 'no symbol of its own, so the code stays');
  assert.equal(symbolFigure('Kiln'), null);
  assert.equal(money(2_832_000, 'GBP'), 'GBP 28,320.00', 'the written text is unchanged');
});

test('a sentence has its figures drawn with symbols and keeps its words', () => {
  assert.equal(symbolText('no more than GBP 20,000.00 · not enough history'), 'no more than £20,000.00 · not enough history');
  assert.equal(symbolText('EGP 1,573.00 and GBP −14.00'), 'EGP 1,573.00 and −£14.00');
  assert.equal(symbolText('SG31 is open'), 'SG31 is open');
});

test('a stored value is drawn as a word: a lane head starts with a capital, a chip keeps its phrase, an initialism is spelled', () => {
  assert.equal(valueWord('open', true), 'Open');
  assert.equal(valueWord('in_review', true), 'In review');
  assert.equal(valueWord('domain'), 'domain');
  assert.equal(valueWord('saas'), 'SaaS');
  assert.equal(valueWord('cli', true), 'CLI');
  const html = toHTML(parse('```chips\nglyph | 6 | saas\n```\n\n```board\nopen | Chase Halden\n```'));
  assert.match(html, /<span class="pill-word">SaaS<\/span>/);
  assert.match(html, /<h3 class="board-head">Open<span class="board-count num">1<\/span><\/h3>/);
});

test('a board card draws its third and fourth cells as one line, and a card with no fourth draws what it drew', () => {
  const html = toHTML(parse('```board\nDoing | Write the notes | due 24 Sep | Claude\nDoing | Proof |  | Codex\nDone | Fix login | due 20 Sep | \nDone | Send the quote | Amara\n```'));
  assert.match(html, /<span class="card-detail">due 24 Sep · Claude<\/span>/);
  assert.match(html, /<span class="card-title">Proof<\/span><span class="card-detail">Codex<\/span>/);
  assert.match(html, /<span class="card-detail">due 20 Sep<\/span>/);
  assert.equal(toHTML(parse('```board\nDone | Send the quote | Amara | \n```')), toHTML(parse('```board\nDone | Send the quote | Amara\n```')));
  assert.match(toHTML(parse('```board\nDone | a | b | c | d\n```')), /data-code="DIALECT_ARITY"/);
});

/* ── stat's trend and lead, and sparkline ─────────────────────────────────── */

test('A STAT ROW TAKES A FOURTH CELL, THE TREND, and a three-cell row with a tone keeps its tone', () => {
  const [block] = parse('```stat | H\nCash | GBP 12.00 | 2 accounts | 18 20 19 24 | good\nIn | 3 | n | warn\nOut | 4 | n\n```');
  assert.equal(block?.type, 'block');
  if (block?.type !== 'block') return;
  assert.deepEqual(block.rows[0]?.cells, ['Cash', 'GBP 12.00', '2 accounts', '18 20 19 24']);
  assert.equal(block.rows[0]?.tone, 'good');
  assert.deepEqual(block.rows[1]?.cells, ['In', '3', 'n']);
  assert.equal(block.rows[1]?.tone, 'warn', 'the tone right after three cells is still the tone');
  assert.equal(block.rows[2]?.tone, undefined);
});

test('a stat trend draws a line named by its numbers under the figure, and a row without one draws none', () => {
  const html = toHTML(parse('```stat\nCash | 12 | n | 18 20 - 24\nIn | 3 | n\n```'));
  assert.match(html, /<span class="cell-figure num">12<\/span><svg class="cell-trend" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Cash: 18, 20, no value, 24">/u);
  assert.equal(html.match(/<svg/gu)?.length, 1);
  assert.doesNotMatch(html, /style="[^"]*(?<!--cells:\d)"/u);
});

test('a word in the trend cell degrades, as a fourth cell always did', () => {
  const [seg] = parse('```stat | H\nA | 1 | n | banana\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_ARITY');
  assert.match(seg?.type === 'degraded' ? seg.fix : '', /run of numbers/u);
});

test('THE LEAD FORM IS A WORD AFTER THE KIND, carried on the figure, and any other word degrades naming the form', () => {
  const [lead] = parse('```stat lead | Money\nCash | 12 | n\n```');
  assert.equal(lead?.type === 'block' && lead.form, 'lead');
  assert.equal(lead?.type === 'block' && lead.heading, 'Money');
  assert.equal(parse('```stat lead\nCash | 12 | n\n```')[0]?.type, 'block', 'the heading is optional');
  assert.match(toHTML(parse('```stat lead\nA | 1 | n\n```')), /<figure class="block block-grid" data-kind="stat" data-form="lead"/u);
  assert.doesNotMatch(toHTML(parse('```stat\nA | 1 | n\n```')), /data-form/u);

  const big = parse('```stat big | H\nA | 1 | n\n```')[0];
  assert.equal(big?.type === 'degraded' && big.code, 'DIALECT_KIND_UNKNOWN');
  assert.match(big?.type === 'degraded' ? big.fix : '', /Write "stat" or "stat lead"/u);
  const code = parse('```code ts\nx\n```')[0];
  assert.match(code?.type === 'degraded' ? code.fix : '', /takes no word after it/u);
});

test('A SPARKLINE ROW IS A LABEL, A LINE AND ITS FIGURE, and under two points it is the figure only', () => {
  const html = toHTML(parse('```sparkline | Weekly\nCash | 18 20 19 24 | GBP 24.00 | good\nLonely | 7 | 7\nNone |  | \n```'));
  assert.match(
    html,
    /<div class="sparkline-row" data-intent="good"><span class="sparkline-label">Cash<\/span><svg class="sparkline-line" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="Cash: 18, 20, 19, 24"><path class="trend-area" d="M0 [\d.]+ L[^"]+ Z"><\/path><path class="trend-line" d="M0 [\d.]+ L[^"]+" vector-effect="non-scaling-stroke"><\/path><path class="trend-end" d="M1000 [\d.]+h0" vector-effect="non-scaling-stroke"><\/path><\/svg><span class="sparkline-figure num">GBP 24.00<\/span><span class="glyph"/u,
  );
  assert.match(html, /<span class="sparkline-label">Lonely<\/span><span class="sparkline-figure num">7<\/span>/u, 'one point is the figure only');
  assert.match(html, /<span class="sparkline-label">None<\/span><span class="sparkline-figure num">—<\/span>/u);
  assert.doesNotMatch(html, /style=/u);
  assert.equal(parse('```sparkline\nA | 1 2 | 2 | x\n```')[0]?.type, 'degraded', 'a fourth cell that is not a tone is too wide');
});

test('A SPARKLINE PUTS THE POINTS IT DREW IN A TABLE FOR A SCREEN READER, a column per line and a row per position', () => {
  const html = toHTML(parse('```sparkline\nCash | 18 20 x 24 | 24\n | 1 2 | 2\nLonely | 7 | 7\n```'));
  assert.match(
    html,
    /<div class="sparkline-numbers"><table class="sparkline-table"><thead><tr><th scope="col">Point<\/th><th scope="col">Cash<\/th><th scope="col">Trend<\/th><\/tr><\/thead><tbody><tr><th scope="row">1<\/th><td class="num">18<\/td><td class="num">1<\/td><\/tr><tr><th scope="row">2<\/th><td class="num">20<\/td><td class="num">2<\/td><\/tr><tr><th scope="row">3<\/th><td class="num">no value<\/td><td class="num">—<\/td><\/tr><tr><th scope="row">4<\/th><td class="num">24<\/td><td class="num">—<\/td><\/tr><\/tbody><\/table><\/div><\/div>/u,
  );
  assert.doesNotMatch(toHTML(parse('```sparkline\nLonely | 7 | 7\n```')), /<details/u, 'a line that did not draw has no points to show');
  assert.doesNotMatch(toHTML(parse('```stat\nCash | 10 | | 1 2 3\n```')), /<details/u, 'the stat trend cell keeps no fold');
});

test('A QUESTION IS A CARD\'S HEADLINE, so its money is said short, and its reason keeps the amount as written', () => {
  const html = toHTML(
    onPage(
      '```queue\nq | s1 | A rule | 4w ago | Ledger Post was due 4 days ago, £39.00 GBP. Did it go through? | Invoice GBP 4,800.50 is open.\nopt | s1 | yes | It went through |  | \nopt | s1 | no | It stopped |  | \n```',
    ),
  );
  assert.match(html, /<h3 class="queue-question">Ledger Post was due 4 days ago, £39\. Did it go through\?<\/h3>/u);
  assert.match(html, /<p class="queue-why">Invoice GBP 4,800\.50 is open\.<\/p>/u);
});

test('A TILE\'S FIGURE AND NOTE ARE SAID SHORT even when the host already drew them with a symbol and the code after', () => {
  /* At a glance read `£4,050 GBP` and Accounts `£24,000.00 GBP 71%`: the host's code hung on a no-break space. */
  const html = toHTML(onPage('```stat\nOwed to you | £4,050.00 GBP | Keep above £0.00 GBP\n```'));
  assert.match(html, /<span class="cell-figure num">£4,050<\/span>/u);
  assert.match(html, /Keep above £0</u);
  const split = toHTML(onPage('```split\nTax reserve | £24,000.00 GBP\nStudio current account | £9,850.00 GBP\n```'));
  assert.match(split, /<span class="split-value num">£24,000<\/span><span class="split-share num">71%<\/span>/u);
});
