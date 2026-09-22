/**
 * WHO MAY ANSWER A QUESTION ON `/decide`, AND WHAT THE SCREEN SAYS TO SOMEBODY WHO MAY NOT.
 *
 * DRIVEN BEFORE IT WAS WRITTEN, on 21 September, against a real self-host: `braindog init studio`
 * with the seed in it, the owner in through the server key and a passkey, then two colleagues
 * invited by email and accepted in their own browser contexts. `/decide` came back at 279 words and
 * 168 controls with NONE disabled for the colleague at `read`, control for control the same screen
 * the colleague at `decide` got. Pressing an option, typing a reason and pressing the commit then
 * answered, from the record itself:
 *
 *   "This needs decide, and you have read access. Ask an owner to raise your access."
 *
 * Two presses and a typed paragraph before the product said no, on the screen whose whole subject is
 * who is allowed to answer.
 *
 * SO THE SENTENCE UNDER TEST IS THE RECORD'S OWN, SAID EARLIER. The first two sentences of the
 * standing hint are the string `allows` builds in `packages/record/src/index.ts` word for word, and
 * this test pins them to the text measured coming back off the wire. A colleague who reads the hint
 * and a colleague who pressed through to the refusal are told the same thing, which is the whole
 * argument for saying it before the typing rather than after it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mayAnswer, whyNotAnswering } from './answering.ts';

/** Word for word what the record answered the `read` colleague on 21 September, off the wire. */
const RECORD_SAID = 'This needs decide, and you have read access. Ask an owner to raise your access.';

test('only decide and an owner may answer a question here', () => {
  assert.equal(mayAnswer('decide', false), true);
  assert.equal(mayAnswer('owner', true), true);
  /* AN OWNER IS AN OWNER WHATEVER THE LEVEL WORD SAYS. `boot` sends both, and the shell sets
     `owner` from the level, so the two agree on a live record; a host that ever sends one without
     the other must not cost an owner their own decision queue. */
  assert.equal(mayAnswer('read', true), true);
  assert.equal(mayAnswer('read', false), false);
  assert.equal(mayAnswer('write', false), false);
  assert.equal(mayAnswer('append', false), false);
  /* A LEVEL THIS BUILD HAS NEVER HEARD OF DOES NOT GET THE BENEFIT OF THE DOUBT. */
  assert.equal(mayAnswer('', false), false);
  assert.equal(mayAnswer('admin', false), false);
});

test('the standing hint opens with the record’s own refusal, before anybody types', () => {
  const said = whyNotAnswering('read');
  assert.ok(said.startsWith(RECORD_SAID), `the hint opens ${JSON.stringify(said.slice(0, RECORD_SAID.length))}`);
  /* AND READING IS NOT WITHDRAWN. `read` is what the colleague was invited for, so the sentence has
     to leave them holding it rather than reading as a door closing. */
  assert.match(said, /stays open to you\.$/);
});

test('the hint names the level the reader actually holds', () => {
  assert.ok(whyNotAnswering('write').startsWith('This needs decide, and you have write access.'));
  assert.ok(whyNotAnswering('append').startsWith('This needs decide, and you have append access.'));
});

test('a level with no word for it is still refused in a sentence', () => {
  const said = whyNotAnswering('');
  assert.doesNotMatch(said, /you have {2}access/);
  assert.ok(said.startsWith('This needs decide, and your access does not reach it.'));
  assert.match(said, /Ask an owner to raise your access\./);
});

/**
 * A SOURCE READ, BECAUSE THE FOUR TESTS ABOVE PASS AGAINST A SCREEN WITH THE REPAIR TORN OUT.
 *
 * MEASURED, on the checking pass: the line `disabled={!answerable}` was deleted from the option
 * buttons in `+page.svelte` and every one of the four tests above stayed green, because all four ask
 * `answering.ts` and none of them asks the screen. The module is the easy half. The half that was
 * actually broken is the WIRING, and there is no DOM harness in this app to press a button in, so
 * this reads the markup the way `first-run.test.ts` reads `RowForm.svelte` for the same reason.
 *
 * WHAT IT PINS IS THE FOUR PLACES A READER CAN GET IN, and they are four and not one: the option
 * button, the batch commit, the keyboard answer inside `take`, and the batch commit's own handler.
 * A control that is off is not a path that is closed, so the two handlers are pinned as well as the
 * two controls, and each is pinned to sit BEFORE the call it is guarding rather than merely to exist
 * somewhere in the function.
 */
const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

test('every option button is off for a reader who may not answer, and says why', () => {
  assert.match(
    page,
    /disabled=\{!answerable\}\n\s+aria-describedby=\{answerable \? undefined : 'cannot-decide'\}\n\s+onclick=\{\(\) => take\(q, o\.key\)\}/u,
    'the option buttons are live for a reader who may not answer',
  );
  /* THE SENTENCE THE DESCRIPTION POINTS AT HAS TO BE ON THE PAGE. `aria-describedby` at an id
     nothing renders is a control that is off and silent about it, which is the state before the
     repair with one extra attribute on it. */
  assert.match(
    page,
    /\{#if !answerable\}\n\s+<p class="cannot" id="cannot-decide">\{whyNot\}<\/p>\n\s+\{\/if\}/u,
    'nothing renders the sentence the option buttons point at',
  );
});

test('the batch commit is off too, and points at the same sentence', () => {
  assert.match(
    page,
    /disabled=\{batching \|\| !answerable \|\| \(from === 'live' && !batchReason\.trim\(\)\)\}\n\s+aria-describedby=\{answerable \? undefined : 'cannot-decide'\}/u,
    'one answer to eight questions is still offered to a reader who may not answer one',
  );
});

test('both handlers refuse before they act, not only the controls that call them', () => {
  const guard = /if \(!answerable\) \{\n\s+toasts\.push\(whyNot, \{ intent: 'warn' \}\);\n\s+return;\n\s+\}/gu;
  assert.equal([...page.matchAll(guard)].length, 2, 'the two write handlers do not both refuse a reader who may not answer');

  /* AND EACH ONE BEFORE THE WRITE IT GUARDS. `1` to `9` and `a` reach `take` with no button in the
     way, so a guard sitting under `answerFor` would be a key that answers and then apologises. */
  const takeAt = page.indexOf('async function take(q: Question, key: string) {');
  const answeredAt = page.indexOf('const a = answerFor(q, key,');
  assert.ok(takeAt >= 0 && answeredAt > takeAt, 'take no longer reads the way this test assumes');
  const inTake = page.slice(takeAt, answeredAt).search(guard);
  assert.ok(inTake >= 0, 'a keyboard answer records before anybody checks whether it may');

  const batchAt = page.indexOf('async function answerPicked() {');
  const sentAt = page.indexOf('const out = await answerQuestion(apiBase(), q.id, a.option, reason);');
  assert.ok(batchAt >= 0 && sentAt > batchAt, 'answerPicked no longer reads the way this test assumes');
  const inBatch = page.slice(batchAt, sentAt).search(guard);
  assert.ok(inBatch >= 0, 'the batch sends its answers before anybody checks whether it may');
});

/**
 * A COLLEAGUE ON ONE LIST IS NOT A READER OF THE RECORD, AND THE HINT MUST NOT SAY THEY ARE.
 *
 * `loop/research-invite-landing.md` finding 3: the shell has no level for a member who holds lists
 * and not the record, so `layoutOf` falls back to `read`, and this hint told a bookkeeper given
 * `write` on Expenses "This needs decide, and you have read access." Neither half is theirs. The
 * record's own refusal for them talks about a "record-wide token", which they were never offered and
 * cannot ask for by that name, so the hint does not borrow that sentence either.
 */
test('a colleague on some lists is told who answers, not a level they do not hold', () => {
  for (const lists of [['expenses'], ['tasks', 'expenses']]) {
    const said = whyNotAnswering('read', lists);
    assert.doesNotMatch(said, /you have read access/u, 'the hint claims a level the colleague does not hold');
    assert.doesNotMatch(said, /token/iu, 'the hint talks about a token nobody gave them');
    assert.match(said, /whole record/u);
    assert.match(said, /stays open to you\.$/u);
  }
  assert.match(whyNotAnswering('read', ['expenses']), /your list\b/u);
  assert.match(whyNotAnswering('read', ['tasks', 'expenses']), /your lists\b/u);
  /* AND A RECORD-WIDE READER STILL HEARS THE RECORD'S OWN SENTENCE, word for word. */
  assert.ok(whyNotAnswering('read', null).startsWith(RECORD_SAID));
});
