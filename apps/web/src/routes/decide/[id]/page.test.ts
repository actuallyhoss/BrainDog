/**
 * WHO MAY ANSWER A QUESTION ON `/decide/<id>`, AND WHAT THE GATE SAYS TO SOMEBODY WHO MAY NOT.
 *
 * `/decide` WAS REPAIRED AND THIS SCREEN WAS NOT, AND IT IS THE DEEPER DEAD END OF THE TWO. The
 * queue answers a question in one press, so its dead end cost a press, a paragraph and a second
 * press. The gate is deliberately slower than the queue: `Choose this` opens a REQUIRED reason box,
 * the commit is refused while the box is empty, and the reason is the whole ceremony somebody came
 * here for. So a colleague at `read` who reaches this screen from a card link types the longest
 * paragraph in the product before anything tells them their access does not reach the act.
 *
 * COUNTED FROM THE MARKUP OF THIS SCREEN, for the sample's `shall-we-charge-per-seat` with its three
 * options, before the repair: 4 controls inside the decision (three `Choose this` buttons and the
 * `Defer` button), NONE of them disabled, and not one word anywhere on the page about access. The
 * two ways in are the buttons and the keyboard: `Enter` on a highlighted option calls `choose`, `d`
 * calls `defer`, and neither asked. What the record finally answers arrives from `answerQuestion`,
 * after the typing:
 *
 *   "This needs decide, and you have read access. Ask an owner to raise your access."
 *
 * SO THE SENTENCE IS THE RECORD'S OWN, MOVED IN FRONT OF THE OPTIONS, and the module that holds it
 * is the one `/decide` already reads: `../answering.ts` exists precisely so this screen is not a
 * fourth spelling of one rule.
 *
 * AND MOST OF THIS FILE READS THE SCREEN RATHER THAN THE MODULE, deliberately. MEASURED on the
 * queue's own checking pass: `disabled={!answerable}` was deleted from its option buttons and all
 * four of its tests stayed green, because every one of them asked `answering.ts` and none of them
 * asked the markup. The module is the easy half; the wiring is the half that was broken. There is no
 * DOM harness in this app, so this reads the source the way `first-run.test.ts` reads `RowForm.svelte`
 * for the same reason.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mayAnswer, whyNotAnswering } from '../answering.ts';

const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');

/** Word for word what the record answers a `read` colleague, which is what the gate now says first. */
const RECORD_SAID = 'This needs decide, and you have read access. Ask an owner to raise your access.';

test('the gate reads the queue’s own two functions, not a fourth spelling of the rule', () => {
  assert.match(
    page,
    /import \{ mayAnswer, whyNotAnswering \} from '\.\.\/answering\.ts';/u,
    'the gate decides for itself who may answer',
  );
  /* AND THE SENTENCE IT SHOWS IS THE ONE THE RECORD WOULD HAVE SAID. Pinned here so a rewrite of
     `whyNotAnswering` that stopped opening with the record's refusal fails on this screen too, and
     not only on the queue. */
  assert.ok(whyNotAnswering('read').startsWith(RECORD_SAID), `the hint opens ${JSON.stringify(whyNotAnswering('read').slice(0, 40))}`);
  assert.equal(mayAnswer('read', false), false);
  assert.equal(mayAnswer('decide', false), true);
});

test('the reader’s level reaches the screen at all', () => {
  assert.match(
    page,
    /const answerable = \$derived\(mayAnswer\(me\.level, me\.owner\)\);/u,
    'nothing on this screen asks whether this reader may answer',
  );
  assert.match(page, /const whyNot = \$derived\(whyNotAnswering\(me\.level, me\.lists\)\);/u, 'nothing on this screen holds the sentence');
});

test('every option’s own button is off for a reader who may not answer, and says why', () => {
  assert.match(
    page,
    /disabled=\{!answerable\}\n\s+aria-describedby=\{answerable \? undefined : 'cannot-decide'\}\n\s+onclick=\{\(\) => choose\(option\.key\)\}/u,
    'the option buttons are live for a reader who may not answer',
  );
});

test('the third verb is off too, and points at the same sentence', () => {
  /* A GATE WITH ITS TWO ANSWERS OFF AND ITS DEFER LIVE IS STILL A DEAD END: a defer is a decision
     about when, it takes a reason and a wake date, and `decide` is what the record wants for it. */
  assert.match(
    page,
    /<Button disabled=\{!answerable\} aria-describedby=\{answerable \? undefined : 'cannot-decide'\} onclick=\{defer\}>\{copy\.defer\}<\/Button>/u,
    'Defer is still offered to a reader who may not answer',
  );
});

test('the sentence the controls point at is rendered, and before the first of them', () => {
  assert.match(
    page,
    /\{#if !answerable\}\n\s+<p class="cannot" id="cannot-decide">\{whyNot\}<\/p>\n\s+\{\/if\}/u,
    'nothing renders the sentence the controls point at',
  );
  /* AND IT IS ABOVE THE OPTIONS, which is the whole repair. `aria-describedby` at an id further down
     the page is a control that is off and a reason a reader meets after looking for it. */
  const said = page.indexOf('id="cannot-decide">{whyNot}');
  const options = page.indexOf('<section class="options">');
  assert.ok(said >= 0 && options > said, 'the sentence is not above the options it is about');

  /* AND IN THE SAME BRANCH AS THE CONTROLS THAT NAME IT, which earlier in the source is not the same
     claim. MEASURED on the checking pass for this slot: the paragraph was moved into the `{#if
     settled}` block above, where it is still earlier in the file and never renders for an open
     question, and all seven tests here stayed green while four disabled controls pointed
     `aria-describedby` at an id that does not exist on the screen they are drawn on. Source order is
     what `indexOf` can see; a branch is not, so the paragraph is pinned between the last line of the
     cost section and the options, and nothing may open a condition over it in that gap. */
  const opened = page.indexOf('<p class="cost-age">Opened {since(question.opened, now)}.');
  assert.ok(opened >= 0, 'the cost section no longer reads the way this test assumes');
  assert.ok(opened < said, 'the sentence is no longer inside the branch that draws an undecided question');
  const between = page.slice(opened, said);
  assert.doesNotMatch(
    between.replace('{#if !answerable}', ''),
    /\{#if |\{:else|\{#each /u,
    'a condition opens between the cost section and the sentence, so the sentence and the options are no longer certainly drawn together',
  );
});

test('both doors refuse before they open, not only the buttons on them', () => {
  const guard = /if \(!answerable\) \{\n\s+toasts\.push\(whyNot, \{ intent: 'warn' \}\);\n\s+return;\n\s+\}/gu;
  assert.equal([...page.matchAll(guard)].length, 2, 'choose and defer do not both refuse a reader who may not answer');

  /* AND BEFORE THE STATE THEY SET, because the keyboard reaches both with no button in the way:
     `Enter` on a highlighted option calls `choose`, `d` calls `defer`, and `?defer` on the URL calls
     `defer` on arrival. A guard under the assignment would be a reason box that opens and then
     apologises, which is the dead end with an extra sentence in it. */
  const chooseAt = page.indexOf('function choose(key: string) {');
  const committingAt = page.indexOf('committing = key;');
  assert.ok(chooseAt >= 0 && committingAt > chooseAt, 'choose no longer reads the way this test assumes');
  assert.ok(page.slice(chooseAt, committingAt).search(guard) >= 0, 'the reason box opens before anybody checks whether it may');

  const deferAt = page.indexOf('function defer() {');
  const deferringAt = page.indexOf('deferring = true;');
  assert.ok(deferAt >= 0 && deferringAt > deferAt, 'defer no longer reads the way this test assumes');
  assert.ok(page.slice(deferAt, deferringAt).search(guard) >= 0, 'the defer step opens before anybody checks whether it may');
});

/**
 * AND READING IS NOT WITHDRAWN, which is the half of this repair that is easy to lose.
 *
 * `read` is what the colleague was invited for, and this screen is where a decision gets EXAMINED:
 * why it was asked, what deciding late costs, what getting it wrong costs, the body of every option,
 * the recommendation, and the reason behind a decision already taken. An absence is not a refusal,
 * so none of that may end up behind `answerable`.
 */
test('nothing a reader was invited to read is hidden from them', () => {
  assert.doesNotMatch(page, /\{#if answerable\}/u, 'something on this screen is drawn only for a reader who may answer');

  /* AND `{#if answerable}` IS ONE SPELLING OF IT OUT OF MANY, so the markup's uses of the flag are
     pinned as a set rather than one forbidden phrase. MEASURED on the checking pass for this slot:
     `{#if question.cost}` was changed to `{#if answerable && question.cost}`, which withdraws the
     cost of delay from the colleague this repair is for, and all seven tests here stayed green
     because the exact phrase above never appeared. These four lines are the whole of what the flag is
     allowed to do to the screen, and the two controls are pinned line for line further up as well; a
     fifth use fails here until somebody reads it and decides it is reading or refusal. */
  const markup = page.slice(page.indexOf('</script>'));
  assert.deepEqual(
    markup
      .split('\n')
      .filter((line) => line.includes('answerable'))
      .map((line) => line.trim()),
    [
      '{#if !answerable}',
      'disabled={!answerable}',
      "aria-describedby={answerable ? undefined : 'cannot-decide'}",
      "<Button disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} onclick={defer}>{copy.defer}</Button>",
    ],
    'the markup reads `answerable` somewhere new, so something a reader was invited to read may now turn on whether they may answer',
  );

  /* THE OPTION BODIES STAY. A gate that greys its buttons and takes the options with them has told a
     reader the question exists and nothing about it. */
  assert.match(page, /<p class="card-body"><Cited text=\{because\}/u, 'the option bodies no longer read the way this test assumes');
  const bodyAt = page.indexOf('<p class="card-body"><Cited text={because}');
  const optionsAt = page.indexOf('{#each question.options as option, i}');
  assert.ok(optionsAt >= 0 && bodyAt > optionsAt, 'the option loop no longer reads the way this test assumes');
  assert.doesNotMatch(page.slice(optionsAt, bodyAt), /answerable/u, 'an option’s body is drawn only for a reader who may answer');
});
