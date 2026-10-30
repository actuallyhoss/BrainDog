/**
 * WHO MAY ANSWER A QUESTION ON `/decide`, AND WHAT THE SCREEN SAYS TO SOMEBODY WHO MAY NOT.
 *
 * DRIVEN BEFORE IT WAS WRITTEN, against a real self-host: `braindog init studio`
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

/** Word for word what the record answered the `read` colleague, off the wire. */
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
 * MEASURED, on the checking pass: the line `disabled={!answerable}` was deleted from the option buttons of the old
 * queue and every one of the four tests above stayed green, because all four ask `answering.ts` and none of them asks
 * the screen. The module is the easy half; the half that was broken is the WIRING, and there is no DOM harness in this
 * app to press a button in, so this reads the markup the way `first-run.test.ts` reads `RowForm.svelte`.
 *
 * THE OLD QUEUE IS GONE (24 October), and the screen is the declared page (`+page.svelte`): every card is the one
 * decision card through `QueueAnswer`, which works out who may answer from the shell, and the page's own keys are the
 * only path a reader reaches an answer by without a card's button. So what is pinned is the card's rule, the sentence
 * over the queue, and each key's guard sitting before the press it guards.
 */
const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

test('every option is words and not a button for a reader who may not answer, and the screen says why', () => {
  /* THE CARD IS THE ONE DECISION CARD (`lib/decide/DecisionCard.svelte`), and its rule is the renderer's: a control that
     cannot act is absent, not greyed. */
  const card = readFileSync(fileURLToPath(new URL('../../lib/decide/DecisionCard.svelte', import.meta.url)), 'utf8');
  /* EACH CHOICE IS A BUTTON ONLY FOR A READER WHO MAY ANSWER, and the same rectangle as words for one who may not; the
     buttons under the choices (Decide, Accept and Decline, Not now) are not drawn for them at all. */
  assert.match(card, /\{#if drawn\}\n\s+<button\n\s+type="button"\n\s+role="radio"\n\s+class="queue-act dc-choice"/u, 'the card draws a live choice for a reader who may not answer');
  assert.match(card, /\{:else\}\n\s+<div class="dc-choice" data-read>\n\s+\{@render choiceBody\(way\)\}/u, 'the card draws nothing in place of the option it will not offer');
  assert.match(card, /\{#if drawn && \(!card\.merge \|\| compact\)\}\n(\s+<!--[^]*?-->\n)?(\s+\{#if moneyAbove\}[^\n]*\n)?\s+<div class="dc-actions"/u, 'the card offers its buttons to a reader who may not answer');
  /* THE KEPT COPY IS THE ONE EXCEPTION (VERIFY H45): while it is drawn nobody is known to answer or not, so the controls
     keep their boxes, quiet and `aria-disabled`, and nothing presses; the live shell decides. */
  assert.match(card, /const kept = \$derived\(may === undefined && shell\.stale === true && !answerable\);/u, 'the card holds its controls for somebody the live shell said may not answer');
  assert.match(card, /const drawn = \$derived\(answerable \|\| kept\);/u);
  assert.match(card, /function press\(way: Way\) \{\n(\s+if \(busy \|\| holding !== null\) return;\n)?\s+if \(kept \|\|/u, 'a control held for the kept copy answers');
  assert.match(card, /function selectWay\(way: Way\) \{\n\s+if \(kept \|\|/u, 'a choice held for the kept copy is chosen');
  /* THE SENTENCE THAT SAYS WHY HAS TO BE ON THE PAGE, over the queue, before anybody presses. */
  assert.match(page, /\{#if !answerable[^}]*\}\n(\s+<!--[^]*?-->\n)?\s+<p class="cannot" id="cannot-decide">\{whyNot\}<\/p>/u, 'nothing renders the sentence that says why the options are words');
});

test('the page keys refuse a reader who may not answer before they press anything', () => {
  /* `e` OPENS THE QUESTION TO CHANGE IT, and `a` and `d` answer or defer it: each asks `answerable` before it acts. */
  const onkeyAt = page.indexOf('function onkey(e: KeyboardEvent) {');
  const editAt = page.indexOf("if (act === 'edit') {", onkeyAt);
  assert.ok(onkeyAt >= 0 && editAt > onkeyAt, 'onkey no longer reads the way this test assumes');
  assert.match(page.slice(editAt, editAt + 200), /if \(!id \|\| !answerable\) return;/u, 'e opens a question for somebody who may not answer it');
  const queueAt = page.indexOf('function queueKey(');
  const clickAt = page.indexOf('press.click();', queueAt);
  assert.ok(queueAt >= 0 && clickAt > queueAt, 'queueKey no longer reads the way this test assumes');
  const guardAt = page.indexOf('if (!id || !answerable) return;', queueAt);
  assert.ok(guardAt > queueAt && guardAt < clickAt, 'a and d act before anybody checks whether the reader may answer');
  /* AND `a` NEVER PRESSES WHAT WEIGHS SOMETHING: a cost on the card, or a button Enter would not press, opens it whole. */
  const weighAt = page.indexOf('const weighs = ', queueAt);
  assert.ok(weighAt > guardAt && weighAt < clickAt, 'a presses an answer before it is weighed');
});

/**
 * A COLLEAGUE ON ONE LIST IS NOT A READER OF THE RECORD, AND THE HINT MUST NOT SAY THEY ARE.
 *
 * The shell has no level for a member who holds lists
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
    assert.match(said, /all of this BrainDog/u);
    assert.match(said, /stays open to you\.$/u);
  }
  assert.match(whyNotAnswering('read', ['expenses']), /your list\b/u);
  assert.match(whyNotAnswering('read', ['tasks', 'expenses']), /your lists\b/u);
  /* AND A RECORD-WIDE READER STILL HEARS THE RECORD'S OWN SENTENCE, word for word. */
  assert.ok(whyNotAnswering('read', null).startsWith(RECORD_SAID));
});
