/**
 * The `via: render` runner: the first of `40 §6`'s seven, and the first thing to DRIVE a fixture.
 *
 * `52 §5.3` files these as tests and not as gates, in one line: *"the script owns the enumeration,
 * the tests own the behaviour"*. `tools/gates/refusal-fixtures.mjs` already holds every code to
 * having a fixture, that fixture to being named after its code, and its `raises:` to being a file
 * that still says the code. What no part of the tree has ever done is take a fixture's input, run
 * the surface, and compare the answer to what the fixture promised. Until something does, a fixture
 * is a comment with a file extension, which is how twelve of them came to carry an `at` prefix no
 * refusal has ever contained.
 *
 * IT LIVES HERE AND NOT IN `packages/render` FOR TWO REASONS, and `40 §6`'s table already says so
 * (*"`apps/web/test`, through `braindog-render`"*). `braindog-render` is the published MIT package
 * and its own test script globs `src/*.test.ts`, so a file under a `test/` folder there would never
 * run; and its tests must hold when the package is unpacked on its own, which a test reading
 * `fixtures/refusals/` two directories above the package root does not.
 *
 * ─── WHAT IT READS ──────────────────────────────────────────────────────────────────────────────
 *
 * Every file in `fixtures/refusals/`, keyed by `via`. The two that say `render` carry a `document:`
 * block, which is `40 §6`'s input key for this surface, and the runner parses that document and
 * reads the degradation back. A `render` fixture with no `document:` is a failure rather than a
 * skip: a fixture nothing drives is the thing this file exists to end, and skipping quietly would
 * rebuild it one fixture at a time.
 *
 * Nothing in this repository parses YAML (`42 §2` puts the one parser behind a `@braindog/declare`
 * subpath that does not exist yet), so the reader below is the same forty-line subset the gate
 * reads, plus literal block scalars. When the real parser lands these files are read unchanged.
 *
 * ─── WHAT IT ASSERTS, AND WHAT IT CANNOT ────────────────────────────────────────────────────────
 *
 * `52 §5.3` step 2 asks for four things: exactly one refusal, its `code` and `at` equal to the
 * fixture's, `found` when the fixture carries one, and `fix` a non-empty sentence. Three of those
 * land here. The fourth cannot, and finding out why is what these two fixtures were for.
 *
 * A FENCE IS NOT REFUSED, IT DEGRADES, AND `Degraded` HAS NO `at`. The envelope at
 * `packages/render/src/parse.ts:59-68` is `{ type, code, fix, raw, info, start, end }`. Both render
 * fixtures used to claim one (`blocks[0].kind` and `blocks[0].rows[2]`, which is also the column
 * `40 §6`'s table promises), and both claims named a key nothing on this surface can carry. The row
 * index is further out of reach than the field is: `readRows` answers with a sentence about the
 * offending line and no index, and the parse loop then skips to the closing fence, so a degraded
 * fence never becomes a block and has no rows to be the third of. Adding either is a change to a
 * published package's envelope, which is a decision and not a repair, so the fixtures dropped the
 * claim and say why in place. This runner holds the line from the other side: a `render` fixture
 * that carries an `at` is red, because the surface has nowhere to read one from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, type Degraded, type Segment } from 'braindog-render';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const HOME = join(ROOT, 'fixtures', 'refusals');

type Fixture = { name: string; keys: Map<string, string> };

/**
 * The header subset, and literal block scalars beneath it.
 *
 * The gate's own reader takes column-0 `key: value` lines and skips everything indented, because it
 * never needed a fixture's input. A runner does, and `40 §6`'s worked examples put that input in
 * nested blocks. `document:` is the only one this surface takes and it is a whole document, so `|`
 * is the form it arrives in: the block's own indentation comes off and every other character is the
 * author's, which matters when the document is itself made of backticks and pipes.
 */
function read(text: string, where: string): Map<string, string> {
  const keys = new Map<string, string>();
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '' || line.startsWith('#') || /^\s/.test(line)) continue;
    const m = /^([a-z_]+):(?:[ \t]+(.*))?$/.exec(line);
    assert.ok(m, `${where}:${i + 1} is not a key line, and this reader reads column 0 only`);
    const key = m![1]!;
    assert.ok(!keys.has(key), `${where}:${i + 1} says \`${key}\` twice`);
    const value = (m![2] ?? '').trim();
    if (value !== '|' && value !== '|-') {
      const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
      keys.set(key, quoted ? quoted[2]! : value);
      continue;
    }
    const body: string[] = [];
    let indent = '';
    while (i + 1 < lines.length) {
      const next = lines[i + 1]!;
      if (next.trim() !== '' && !/^\s/.test(next)) break;
      i++;
      if (indent === '' && next.trim() !== '') indent = /^\s+/.exec(next)![0]!;
      body.push(next.startsWith(indent) ? next.slice(indent.length) : next.trim());
    }
    while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
    keys.set(key, value === '|' ? `${body.join('\n')}\n` : body.join('\n'));
  }
  return keys;
}

const corpus: Fixture[] = readdirSync(HOME)
  .filter((name) => name.endsWith('.yaml'))
  .map((name) => ({ name, keys: read(readFileSync(join(HOME, name), 'utf8'), `fixtures/refusals/${name}`) }));

const family = corpus.filter((f) => f.keys.get('via') === 'render');

const degradedIn = (segments: Segment[]): Degraded[] => segments.filter((s): s is Degraded => s.type === 'degraded');

/* THE COUNT IS ASSERTED SO THAT AN EIGHTH FIXTURE CANNOT ARRIVE UNDRIVEN. `40 §6`'s table says the
   render family is two. If somebody adds a third, this line is where they find out that it needs a
   `document:` as well, rather than the family quietly growing a member nothing runs. */
test('every render fixture in the corpus is driven here, and there are two of them', () => {
  assert.equal(family.length, 2);
  assert.deepEqual(
    family.map((f) => f.name).sort(),
    ['dialect-arity.yaml', 'dialect-kind-unknown.yaml'],
  );
});

for (const fixture of family) {
  test(`${fixture.name} raises ${fixture.keys.get('code')} when its document is parsed`, () => {
    const document = fixture.keys.get('document');
    assert.ok(document, `${fixture.name} carries no \`document:\`, so nothing drives it`);

    const found = degradedIn(parse(document!));

    /* ONE, AND THAT IS `40 §6` RULE TWO. A document that degrades twice is a fixture about two
       faults at once, and neither of them is the one it names. */
    assert.equal(found.length, 1, `${fixture.name} degraded ${found.length} times: ${found.map((d) => d.code).join(', ')}`);
    assert.equal(found[0]!.code, fixture.keys.get('code'));

    /* A SENTENCE, NOT THE FIXTURE'S SENTENCE. The `fix:` in a fixture is the reader's summary; the
       one the parser builds quotes the author's own words back at them and so exists only at
       runtime. What holds for every one of them is that it is a sentence, which is 30 §6's whole
       requirement of a fix and is what a degradation is worth having. */
    const fix = found[0]!.fix;
    assert.ok(fix.trim().length > 0, `${fixture.name} degraded with an empty fix`);
    assert.ok(fix.trim().endsWith('.'), `${fixture.name} degraded with "${fix}", which is not a sentence`);

    /* THE SPAN IS THE ONLY ADDRESS THIS SURFACE HAS, so it is checked rather than assumed: it must
       select real bytes of the document the fixture sent. */
    const { start, end } = found[0]!;
    assert.ok(start >= 0 && end > start && end <= document!.length, `${fixture.name} degraded at [${start}, ${end})`);
    assert.equal(found[0]!.raw, document!.slice(start, end));
  });

  test(`${fixture.name} claims no address, because a degradation carries none`, () => {
    assert.equal(
      fixture.keys.has('at'),
      false,
      `${fixture.name} claims \`at: ${fixture.keys.get('at')}\`, and \`Degraded\` has no \`at\` to compare it to`,
    );
    assert.equal(fixture.keys.has('found'), false);
    assert.equal(fixture.keys.has('wanted'), false);
  });
}
