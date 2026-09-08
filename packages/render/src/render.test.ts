import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, PRIMITIVES, PRIMITIVES_VERSION, isKind } from './kinds.ts';
import { parse, splitRow } from './parse.ts';
import { toHTML } from './html.ts';
import { chunkRows } from '../svelte/types.ts';
import { inline, safeHref, text } from './inline.ts';
import { money, pct, relative, since, day, formatTyped, magnitudeOf, MISSING } from './format.ts';

const NOW = Date.UTC(2026, 8, 3, 12); // 2026-09-03

/* ── the closed sets ──────────────────────────────────────────────────────── */

test('sixteen kinds over eight primitives, and every kind names one that exists', () => {
  assert.equal(Object.keys(KINDS).length, 16);
  assert.equal(PRIMITIVES.length, 8);
  assert.equal(PRIMITIVES_VERSION, 1);
  for (const [kind, spec] of Object.entries(KINDS))
    assert.ok(PRIMITIVES.includes(spec.primitive), `${kind} names ${spec.primitive}, which is not a primitive`);
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

test('every byte of the source lands in exactly one segment', () => {
  const src = 'intro\n\n```stat | Head\na | 1 | note\n```\n\ntail\n';
  const segs = parse(src);
  for (const s of segs) assert.ok(s.end >= s.start && s.end <= src.length);
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i]!.start >= segs[i - 1]!.end);
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

test('a kind outside the sixteen degrades rather than disappearing', () => {
  const [seg] = parse('```reactor_core | H\nA\n```');
  assert.equal(seg?.type === 'degraded' && seg.code, 'DIALECT_KIND_UNKNOWN');
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
  const html = toHTML(parse('```bar | X\nKnown | 10 | \nUnknown | tbc | \n```'));
  assert.equal(html.match(/--magnitude/g)?.length, 1);
  assert.match(html, /tbc/);
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
  assert.equal(relative('2026-08-20', NOW), '14d ago');
  assert.equal(relative('2025-09-03', NOW), '1.0y ago');
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

  /* AND THE MIDNIGHT CASE THAT STARTED IT, on `relative()` alone. */
  const midnight = Date.UTC(2026, 8, 8, 0);
  assert.equal(relative('2026-09-07', midnight), '1d ago', 'yesterday read as today at midnight');
  assert.equal(relative('2026-09-08', midnight), 'today');
  assert.equal(relative('2026-09-09', midnight), 'in 1d');
});

test('a day is formatted, and a malformed one renders as what the author typed', () => {
  assert.equal(day('2026-04-10'), '10 Apr 2026');
  assert.equal(formatTyped('date', '31 Sep', NOW), null);
  // The argument is MINOR UNITS. An earlier draft of the spec wrote `1299 EGP` and drew
  // `EGP 1,299` — major units — against the minor-units rule of 02 §3.
  assert.equal(formatTyped('money', '129900 EGP', NOW), 'EGP 1,299.00');
  assert.equal(formatTyped('money', '1299 EGP', NOW), 'EGP 12.99');
  assert.equal(formatTyped('ref', 'tasks#241', NOW), '#241');
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

test('a negative row draws no bar, and still shows its number', () => {
  // A proportional chart has one side. Drawing |v| would put money owed to you and money owed by
  // you at the same length, on the same side, which is the reading the sign exists to prevent.
  const html = toHTML(parse(['```bar | Owed', `Ada | ${money(50_000, 'GBP')} | `, `Bo | ${money(-129_900, 'GBP')} | `, '```'].join(NEWLINE)));
  const tracks = html.match(/--magnitude:[\d.]+/g) ?? [];
  assert.equal(tracks.length, 1, 'the negative row was given a bar');
  assert.ok(html.includes('−'), 'the minus sign did not reach the screen');
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

test('the page-only kind is marked, so it cannot be drawn from a write-up fence', () => {
  assert.ok(KINDS.table.pageOnly);
  assert.ok(isKind('table'));
  // A `table` fence has no rows to draw, so it degrades like an unknown kind rather than rendering
  // an empty grid that looks like a bug in the record.
  const [seg] = parse('```table | Open\n```');
  assert.equal(seg?.type, 'block');
  assert.equal(seg?.type === 'block' && seg.rows.length, 0);
});

test('prose in a drawn block is not a style problem, it is a row', () => {
  // An agent told to "summarise in a stat block" will put a sentence in a cell. It must still
  // render, because the write is accepted and the fence is the feedback channel.
  const html = toHTML(parse('```stat | H\nA long sentence that is not a figure at all | 1 | n\n```'));
  assert.match(html, /A long sentence/);
});
