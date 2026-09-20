/**
 * What this package does when the record it draws is hostile.
 *
 * WHY THIS FILE IS SEPARATE FROM `render.test.ts`. That suite asks whether a well-formed block draws
 * the tree it promised. This one asks the opposite question: given a cell an attacker or a confused
 * agent wrote, does the renderer still produce a document, and is every value in it still a value
 * rather than markup. `packages/render` is the MIT package in an Apache-2.0 tree, so it is the one
 * a stranger lifts and runs against text this workspace never saw.
 *
 * Every test here was watched fail before the repair beside it landed. The four faults, measured:
 *
 *   · `toHTML` THREW on a `board` or a `chips` block whose state word was `constructor`. The word is
 *     looked up in a plain object of initialisms, `Object.prototype.constructor` answered, `escape`
 *     was handed a function and `s.replace is not a function` took the whole document down.
 *   · A trailing cell reading `constructor` or `__proto__` was EATEN as a tone, by the same
 *     prototype read in `parse.ts`, and reached the DOM as `data-intent="function Object() { … }"`.
 *   · A `queue`'s `more` row accepted `//evil.example/x` and `/\evil.example/x` as "a path of this
 *     record" and drew an anchor to somebody else's host. `safeHref` documents that exact hazard
 *     twelve files away and this second gate did not read it.
 *   · `inline()` was QUADRATIC on a run of `[`: 80,000 of them took 3.7 seconds, because the link
 *     pattern copied the rest of the string at every one. Runs of `{` and `{{` cost the same shape
 *     for a different reason, a scan to the end of the text for a closer that is not there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, type Tone } from './kinds.ts';
import { parse, type Block, type Degraded } from './parse.ts';
import { toHTML } from './html.ts';
import { inline } from './inline.ts';
import { valueWord } from './format.ts';
import { queuePlan, queueCost, QUEUE_COSTS } from './queue.ts';
import { agentDoing, AGENT_VERBS } from './agents.ts';
import { workingCell } from './working.ts';

/**
 * A cell that is trying to be markup: a tag, and a pair of quotes around an attribute.
 *
 * THE QUOTES ARE THE ASSERTION, not the word `onmouseover`. Drawn correctly the cell is TEXT and the
 * word is in the output, escaped, on every kind: a test that looked for the word would fail on a
 * renderer that is doing exactly the right thing. What cannot survive escaping is the pair of bare
 * `"` around it, so `" onmouseover="` appearing verbatim is the one shape that means a value climbed
 * out of its attribute.
 */
const HOSTILE = '<script>alert(1)</script>" onmouseover="alert(2)';

/** The sequence that exists in the output only if the cell's own quotes were written raw. */
const BROKE_OUT = '" onmouseover="';

const fence = (kind: string, ...body: string[]): string => ['```' + kind + ' | ' + HOSTILE, ...body, '```'].join('\n');

const ms = (run: () => void): number => {
  const at = performance.now();
  run();
  return performance.now() - at;
};

/* ── every value is a value, on every kind ────────────────────────────────── */

/**
 * The rows a generic one of `HOSTILE` per cell cannot make, because the kind reads its first cell
 * as a discriminator, or names its columns in the heading, or takes exactly one row.
 *
 * WHY THIS TABLE IS HERE AND NOT A COMMENT SAYING "close enough". Without it, EIGHT of the
 * twenty-nine kinds degraded under the generic row, and a degraded block draws the author's own
 * fence back at them, escaped, inside a `<pre>`. That echo still contains the word `onmouseover`,
 * so the "did it draw the cell" guard below passed on a block that had never reached its drawer at
 * all. Measured: 21 kinds drew and `quote`, `gauge`, `section`, `cards`, `feed`, `diff` and `queue`
 * did not, plus `table`, which cannot. Those are the drawers holding the most bespoke markup in
 * `html.ts`, `queue`'s anchor and `feed`'s `data-by` among them, so the sweep was blind in exactly
 * the places it was written to watch. The assertion that every block comes back as a `block` is
 * what stops that from happening again quietly.
 *
 * `cards` takes the hostile heading out because a `cards` heading IS its column list, and `queue`
 * needs a `more` row that points somewhere real; both still carry `HOSTILE` in every free cell.
 */
const SHAPES: Readonly<Record<string, { heading?: string; rows: string[][] }>> = {
  quote: { rows: [[HOSTILE, HOSTILE]] },
  gauge: { rows: [[HOSTILE, HOSTILE]] },
  section: { rows: [[HOSTILE, HOSTILE]] },
  cards: {
    rows: [
      ['title: ' + HOSTILE, 'figure: ' + HOSTILE, 'fact: ' + HOSTILE, 'who', 'when', 'mark'],
      Array.from({ length: 6 }, () => HOSTILE),
      Array.from({ length: 6 }, () => HOSTILE),
    ],
  },
  feed: { rows: [['agent', HOSTILE, HOSTILE, HOSTILE, HOSTILE], ['you', HOSTILE, HOSTILE, HOSTILE, HOSTILE]] },
  diff: { rows: [['  ' + HOSTILE], ['- ' + HOSTILE], ['+ ' + HOSTILE]] },
  /* The `more` row's path holds no space, because a path with one is not a path and the block
     would degrade before the anchor was ever drawn. Everything else about it is still hostile, so
     the `href` that reaches the document is the assertion. */
  queue: { rows: [['q', 's1', HOSTILE, HOSTILE, HOSTILE, HOSTILE], ['opt', 's1', HOSTILE, HOSTILE], ['more', '5', '/' + HOSTILE.replace(/ /gu, '')]] },
};

/** `table` is bound to a register rather than to authored rows, so it has no fence to be hostile in. */
const NO_FENCE = new Set(['table']);

/**
 * THE SWEEP IS THE POINT, not any one kind. A hole in this package is one drawer that forgot
 * `escape`, and the kinds are added one at a time by people who are thinking about a chart. So the
 * assertion runs over `KINDS` itself: a kind added tomorrow is in this test the day it is declared,
 * and a drawer that interpolates a cell raw fails here rather than in somebody's browser.
 */
test('NO CELL BECOMES MARKUP, on any of the kinds there are', () => {
  let drew = 0;
  for (const kind of Object.keys(KINDS)) {
    if (NO_FENCE.has(kind)) continue;
    const shape = SHAPES[kind];
    const row = Array.from({ length: Math.max(1, KINDS[kind as keyof typeof KINDS].cells || 5) }, () => HOSTILE).join(' | ');
    const body = shape ? shape.rows.map((r) => r.join(' | ')) : [row, row];
    const blocks = parse(['```' + kind + ' | ' + (shape?.heading ?? HOSTILE), ...body, '```'].join('\n'), { page: true });
    /* The block must have REACHED ITS DRAWER. A degraded fence echoes the source, which carries the
       cell's own words, so every assertion below passes on a block that was never drawn. */
    const bad = blocks.find((b) => b.type !== 'block');
    assert.equal(bad, undefined, `${kind} degraded instead of drawing: ${bad && 'fix' in bad ? bad.fix : ''}`);
    const html = toHTML(blocks, {
      resolve: () => HOSTILE,
      link: () => null,
      dayHref: () => null,
      hole: true,
    });
    assert.equal(html.includes('<script'), false, `${kind} let a tag through`);
    assert.equal(html.includes('onmouseover'), true, `${kind} dropped the cell instead of drawing it`);
    assert.equal(html.includes(BROKE_OUT), false, `${kind} let a value out of its attribute`);
    drew += 1;
  }
  /* The count is the guard on the guard: a kind quietly dropped from the loop is a kind nobody
     sweeps, and the number in the comment above would go on reading as though it had been. */
  assert.equal(drew, Object.keys(KINDS).length - NO_FENCE.size);
  assert.equal(drew, 28);
});

/** A resolved `{{path}}` is a value the host handed back, and a value is never markup either. */
test('AN INTERPOLATED VALUE IS ESCAPED, and so is the path that named it', () => {
  const html = toHTML(parse('```spec | Heading\nLabel | {{a.b}} | note\n```'), { resolve: () => HOSTILE });
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('&lt;script&gt;'), true);
  const hole = toHTML(parse('```spec | Heading\nLabel | {{' + HOSTILE + '}} | note\n```'));
  assert.equal(hole.includes('<script'), false);
});

/** A link the record cannot vouch for is the author's words, and never a live anchor. */
test('A LINK TO ANOTHER HOST IS TEXT', () => {
  for (const href of ['javascript:alert(1)', '//evil.example/x', '/\\evil.example/x', 'data:text/html,<script>x</script>']) {
    const html = toHTML(parse('```note | Heading\n[click](' + href + ')\n```'));
    assert.equal(html.includes('<a '), false, `${href} drew an anchor`);
    assert.equal(html.includes('click'), true, `${href} lost the words`);
  }
});

/* ── a cell whose text is the name of something internal ──────────────────── */

/**
 * `valueWord` reads a plain object of initialisms with the author's own word as the key, so every
 * member of `Object.prototype` was a hit. `constructor` is the only one that survives the lower-casing
 * and the underscore rewrite, and one is enough: it came back as a FUNCTION from a function declared
 * to return a string, and the next thing that touched it was `escape`.
 */
test('A WORD THAT NAMES SOMETHING ON Object.prototype IS STILL A WORD', () => {
  assert.equal(typeof valueWord('constructor'), 'string');
  assert.equal(valueWord('constructor'), 'constructor');
  assert.equal(valueWord('constructor', true), 'Constructor');
  assert.equal(valueWord('toString'), 'toString');
  assert.equal(valueWord('__proto__'), '  proto  ');
});

/**
 * THE OTHER THREE TABLES THE SAME REPAIR TOUCHED, which shipped beside `valueWord` with nothing
 * watching them: reverting all three left the suite at 281 passing, so they were repairs nobody had
 * seen fail. Each is a plain object read with a word a caller chooses, and each has its own shape of
 * damage. `queueCost` and `agentDoing` return the Object constructor from a function declared to
 * return a string, and `?? kind` does not catch it because a function is not nullish; `workingCell`
 * returns it from one declared to return a number, and the working dot would have been put on cell
 * `[Function]`. All three are exported, so a host reaches them without going through the parser.
 */
test('THE OTHER LOOKUP TABLES ANSWER A PROTOTYPE MEMBER WITH NOTHING, not with a function', () => {
  for (const word of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.equal(queueCost(word), '', `queueCost(${word})`);
    assert.equal(typeof agentDoing(word, null, null), 'string', `agentDoing(${word})`);
    assert.equal(agentDoing(word, 'the gate', null), `${word} the gate`, `agentDoing(${word})`);
    assert.equal(workingCell(word), 0, `workingCell(${word})`);
  }
  /* And the words that ARE in the tables still answer with what is in them. */
  assert.equal(queueCost('undo'), QUEUE_COSTS['undo']);
  assert.equal(agentDoing('edit', 'a note', null), `${AGENT_VERBS['edit']} a note`);
  assert.equal(workingCell('board'), 1);
});

test('A BOARD COLUMN CALLED "constructor" DRAWS, rather than taking the document down with it', () => {
  const html = toHTML(parse('```board | Work\nconstructor | Fix the gate | Claude\n```'));
  assert.equal(html.includes('Constructor'), true);
  assert.equal(html.includes('Fix the gate'), true);
});

test('A CHIP WHOSE WORD IS "constructor" DRAWS', () => {
  const html = toHTML(parse('```chips | Kinds\n· | 4 | constructor\n```'));
  assert.equal(html.includes('>constructor<'), true);
});

/**
 * THE TONE SLOT READ THE SAME PROTOTYPE, and the cost there is data rather than a crash: the cell
 * was taken off the row and replaced by a tone nobody wrote. A `stat` note reading `constructor` is
 * an ordinary English word in an ordinary column, and it vanished from the page.
 */
test('A TRAILING CELL THAT NAMES A PROTOTYPE MEMBER IS NOT A TONE', () => {
  /* A `timeline` takes three cells and reads the fourth as a tone, so a fourth cell is the slot
     itself being read rather than a row too short to have one. A word that is not a tone leaves the
     row one cell too wide, which is a DIALECT_ARITY degradation and says so on the fence. What it
     must not be is what it was: the cell taken off the row and a tone nobody wrote put in its place,
     with the fence drawn as though the author had written three columns. */
  for (const word of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
    const [b] = parse('```timeline | Work\n3 Sep | Signed | note | ' + word + '\n```');
    assert.equal(b?.type, 'degraded', `${word} was read as a tone`);
    assert.match((b as Degraded).fix, /4 columns where timeline takes 3/);
    assert.ok((b as Degraded).raw.includes(word), `${word} was lost from the fence`);
  }
  /* And the four words that ARE tones are still tones, plus the four aliases the dialect forgives. */
  const tones = parse('```timeline | Work\na | b | c | good\na | b | c | warn\na | b | c | bad\na | b | c | info\na | b | c | earn\na | b | c | danger\na | b | c | accent\na | b | c | risk\n```');
  assert.equal(tones[0]?.type, 'block');
  assert.deepEqual(
    (tones[0] as Block).rows.map((r) => r.tone),
    ['good', 'warn', 'bad', 'info', 'good', 'bad', 'info', 'warn'],
  );
});

test('A TONE IN A FENCE HEADING THAT NAMES A PROTOTYPE MEMBER IS PART OF THE HEADING', () => {
  const [b] = parse('```stat | Cash | constructor\nOverdue | 12\n```');
  const block = b as Block;
  assert.equal(block.tone, undefined);
  assert.equal(block.heading, 'Cash | constructor');
});

/**
 * AND THE ATTRIBUTE IS ESCAPED ANYWAY. `Tone` is a closed union, and `Block` is a public type a host
 * builds by hand, so the type is a promise rather than a check. The Svelte drawer escapes this
 * attribute because Svelte escapes every attribute; `toHTML` wrote it raw, which is the two renderers
 * differing on the one input nobody sends on purpose.
 */
test('data-intent IS ESCAPED, whatever a host put in it', () => {
  const [b] = parse('```stat | Cash\nOverdue | 12\n```');
  const block = b as Block;
  block.tone = HOSTILE as Tone;
  block.rows[0]!.tone = HOSTILE as Tone;
  const html = toHTML([block]);
  assert.equal(html.includes(BROKE_OUT), false);
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('&quot;'), true);
});

/* ── the second place an off-origin link could get in ─────────────────────── */

/**
 * A LEADING SLASH IS NOT THE TEST FOR SAME-ORIGIN, which `safeHref` says in full and this gate had
 * never been told. `queue`'s "where the rest of the questions are" was checked against `^/\S*$`, and
 * both of the shapes that comment names pass it: the browser fills in the scheme and the reader
 * leaves the record.
 */
test('A QUEUE POINTING AT ANOTHER HOST POINTS NOWHERE', () => {
  for (const where of ['//evil.example/x', '/\\evil.example/x', '/\\\\evil.example', '/\\/evil.example']) {
    const plan = queuePlan([{ cells: ['more', '5', where] }]);
    assert.equal(plan.moreHref, null, `${where} was accepted as a path of this record`);
  }
  assert.equal(queuePlan([{ cells: ['more', '5', '/queue'] }]).moreHref, '/queue');
  assert.equal(queuePlan([{ cells: ['more', '5', '/r/things/1?sort=due'] }]).moreHref, '/r/things/1?sort=due');
});

/**
 * AND THE FENCE SAYS SO RATHER THAN DRAWING A DEAD LINK. `queueFault` and `queuePlan` ask the same
 * question, so a `more` row pointing off-origin degrades the block: the author sees their own fence
 * with the reason above it, which on a page whose rows an agent writes is the only feedback channel
 * there is. What the tree must not hold is an anchor.
 */
test('AND THE DRAWN QUEUE HAS NO ANCHOR TO ONE EITHER', () => {
  const src = ['```queue | Waiting', 'q | s1 | Ada | now | Ship it? |', 'opt | s1 | yes | Yes', 'more | 5 | /\\evil.example/x', '```'].join('\n');
  const html = toHTML(parse(src, { page: true }));
  assert.equal(/href="[^"]*evil\.example/.test(html), false);
  assert.equal(html.includes('not a path of this record'), true);
});

test('A QUEUE POINTING AT A PATH OF ITS OWN STILL DRAWS THE ANCHOR', () => {
  const src = ['```queue | Waiting', 'q | s1 | Ada | now | Ship it? |', 'opt | s1 | yes | Yes', 'more | 5 | /decide', '```'].join('\n');
  const html = toHTML(parse(src, { page: true }));
  assert.equal(html.includes('<a class="queue-more" href="/decide">5 more</a>'), true);
});

/* ── an input that is valid and enormous ──────────────────────────────────── */

/**
 * THE BUDGET IS 500 ms AND THE MEASUREMENTS WERE SECONDS, which is the only reason a wall-clock
 * assertion earns its place here. Before the repair: 80,000 open brackets took 3,745 ms and 200,000
 * open braces took about 1,100 ms, both growing with the square of the length, so a 1 MB note was
 * minutes. After it, each is single-digit milliseconds, so the margin is a hundredfold and a slow
 * machine does not make this flake.
 */
test('A RUN OF UNCLOSED BRACKETS DOES NOT COST THE SQUARE OF ITS LENGTH', () => {
  const took = ms(() => void inline('['.repeat(80_000)));
  assert.ok(took < 500, `80,000 brackets took ${took.toFixed(0)}ms`);
});

test('A RUN OF UNCLOSED BRACES DOES NOT EITHER, single or double', () => {
  const single = ms(() => void inline('{'.repeat(200_000)));
  assert.ok(single < 500, `200,000 braces took ${single.toFixed(0)}ms`);
  const double = ms(() => void inline('{{'.repeat(100_000)));
  assert.ok(double < 500, `100,000 double braces took ${double.toFixed(0)}ms`);
});

/** And the whole path, not just the tokeniser: a big document still renders in a human time. */
test('A LARGE DOCUMENT OF HOSTILE PROSE STILL RENDERS', () => {
  const line = '[' .repeat(200) + '{{' .repeat(200) + '**' .repeat(200);
  const src = ['```note | Heading', ...Array.from({ length: 200 }, () => line), '```'].join('\n');
  const took = ms(() => void toHTML(parse(src)));
  assert.ok(took < 2_000, `the document took ${took.toFixed(0)}ms`);
});

/* ── constructs that never end ────────────────────────────────────────────── */

test('AN UNTERMINATED CONSTRUCT IS THE AUTHOR TEXT, and never an exception', () => {
  const opens = ['**bold', '*em', '`code', '{{path', '{verified: where', '[label](/half', '[label', '~~~', '{{money:1'];
  for (const open of opens) {
    const html = toHTML(parse('```note | Heading\n' + open + '\n```'));
    assert.equal(html.includes('<script'), false);
    assert.ok(html.length > 0, `${open} drew nothing`);
  }
});

/**
 * A fence that never closes is still a block, and a fence inside one ends it: the scan is flat on
 * purpose, so there is no depth here for a document to run away with.
 */
test('A DOCUMENT OF NOTHING BUT FENCES TERMINATES', () => {
  const took = ms(() => void toHTML(parse('```'.repeat(1) + '\n' + '```stat | A\n'.repeat(2_000))));
  assert.ok(took < 2_000, `the fences took ${took.toFixed(0)}ms`);
});
