/**
 * WHO MAY ANSWER A QUESTION ON `/decide/<id>`, AND WHAT THE GATE SAYS TO SOMEBODY WHO MAY NOT.
 *
 * `/decide` WAS REPAIRED AND THIS SCREEN WAS NOT, AND IT WAS THE DEEPER DEAD END OF THE TWO. The
 * queue answered a question in one press, so its dead end cost a press, a paragraph and a second
 * press. The gate was slower than the queue then: `Choose this` opened a REQUIRED reason box, the
 * commit was refused while the box was empty, and the reason was the whole ceremony. So a colleague
 * at `read` who reached this screen from a card link typed the longest paragraph in the product
 * before anything told them their access did not reach the act. One press answers here now too
 * (DIRECTION §37), and the refusal still comes before it.
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

import { pressedOnly } from '@braindog/kernel';

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
     question, and every test here stayed green while four disabled controls pointed
     `aria-describedby` at an id that does not exist on the screen they are drawn on. Source order is
     what `indexOf` can see; a branch is not, so the paragraph is pinned between the last line of the
     closed question's branch and the options, and nothing may open a condition over it in that gap
     but the one `{:else}` that is the open question's own branch.

     THE OPTIONS COME STRAIGHT UNDER THE TITLE NOW, so the anchor is no longer the cost tile, which is
     folded into "What accepting does" under them: it is the closed branch just above. */
  const closedAt = page.indexOf('<p class="cost-age">{gate.closedNow}');
  assert.ok(closedAt >= 0, 'the closed branch no longer reads the way this test assumes');
  assert.ok(closedAt < said, 'the sentence is no longer inside the branch that draws an undecided question');
  const between = page.slice(closedAt, said);
  assert.equal(between.match(/\{:else\}/gu)?.length, 1, 'the sentence is not in the open question\'s own branch');
  assert.doesNotMatch(
    between.replace('{#if !answerable}', '').replace('{:else}', ''),
    /\{#if |\{:else|\{#each /u,
    'a condition opens between the open branch and the sentence, so the sentence and the options are no longer certainly drawn together',
  );
});

/**
 * THE OPTIONS ARE STRAIGHT UNDER THE TITLE, and everything accepting would do is one folded tile under them.
 *
 * MEASURED before: up to seven tiles (what an arrangement does, what a proposal puts in place, the rows to tick, the
 * rows it changes, what it calls, why it was asked and what it costs) stood between the title and the options, so on a
 * laptop the one thing this screen is for was below the fold. And every option carried a key cap.
 */
test('the options come first, and what accepting does is one folded tile after them', () => {
  const head = page.indexOf('<PageHead icon="decide"');
  const options = page.indexOf('<section class="options">');
  const does = page.indexOf('<Tile icon="settings" title={LEAD.does}>');
  assert.ok(head >= 0 && options > head && does > options, 'the options are not the first thing under the title');
  /* NO TILE STANDS BETWEEN THE TITLE AND THE OPTIONS but the receipt, which replaces them, and the options' own. */
  const before = page.slice(head, options).match(/<Tile\b[^>]*>/gu) ?? [];
  assert.deepEqual(
    before,
    ['<Tile>', '<Tile icon="decide" title={copy.theOptions} count={two ? undefined : question.options.length}>'],
    'a tile is drawn above the options again',
  );
  /* ONE TILE HOLDS EVERY PART, folded shut. */
  assert.match(page.slice(does), /^<Tile icon="settings" title=\{LEAD\.does\}>\s*<details class="does"/u, 'what accepting does is not folded');
  for (const part of ['<Arranged arranged={story} />', '<Proposed proposed={preview} />', '<ul class="picks">', '<Changes {updates} />', '<CallsOut', '{copy.whyAsked}', '{costTitle}']) {
    const at = page.indexOf(part);
    assert.ok(at > does, `${part} is not inside the one tile`);
  }
  assert.equal(page.match(/<Tile icon="settings"/gu)?.length, 1, 'what accepting does is split across tiles again');
});

test('no option carries a key cap, and no sentence is typed into the gate', () => {
  assert.doesNotMatch(page, /<kbd/u, 'an option carries a key cap again');
  for (const typed of ['>required<', 'You are choosing', '>Cancel<', 'Nobody has decided it.']) assert.ok(!page.includes(typed), `"${typed}" is typed into the markup`);
});

test('both doors refuse before they open, not only the buttons on them', () => {
  const guard = /if \(!answerable\) \{\n\s+toasts\.push\(whyNot, \{ intent: 'warn' \}\);\n\s+return;\n\s+\}/gu;
  assert.equal([...page.matchAll(guard)].length, 2, 'choose and defer do not both refuse a reader who may not answer');

  /* AND BEFORE ANYTHING IS SENT OR SET, because the keyboard reaches both with no button in the way:
     Enter and Backspace call `choose`, `d` calls `defer`, and `?defer` on the URL calls `defer` on
     arrival. One press is the answer, so a guard under the send would be an answer that went to the
     record and came back refused, which is the dead end with a round trip in it. */
  const chooseAt = page.indexOf('function choose(key: string) {');
  const sendAt = page.indexOf('void send(key);', chooseAt);
  assert.ok(chooseAt >= 0 && sendAt > chooseAt, 'choose no longer reads the way this test assumes');
  assert.ok(page.slice(chooseAt, sendAt).search(guard) >= 0, 'the answer is sent before anybody checks whether it may');

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
  const optionsAt = page.indexOf('{#each question.options as option}');
  assert.ok(optionsAt >= 0 && bodyAt > optionsAt, 'the option loop no longer reads the way this test assumes');
  assert.doesNotMatch(page.slice(optionsAt, bodyAt), /answerable/u, 'an option’s body is drawn only for a reader who may answer');
});

/**
 * ONE PRESS IS THE ANSWER (DIRECTION §37), and a reason is the record's to ask for, once, never this screen's to demand.
 *
 * MEASURED on the walk of 2 October: a press made a round trip and then asked "Why?", and two of the owner's decisions
 * carried the reasons "f" and "y". So the press sends the answer alone, the one line opens only on the record's own
 * `wants: 'reason'`, and the suggestion is an outline with a dot rather than the filled primary.
 */
test('one press is the answer, and a reason is asked for only when the record asks', () => {
  const chooseAt = page.indexOf('function choose(key: string) {');
  const chooseEnd = page.indexOf('\n  }\n', chooseAt);
  assert.match(page.slice(chooseAt, chooseEnd), /void send\(key\);/u, 'a press no longer sends the answer');
  assert.doesNotMatch(page.slice(chooseAt, chooseEnd), /reason/u, 'a press asks for a reason before it sends');
  assert.match(page, /out\.from === 'refused' && out\.wants === 'reason' && said === undefined/u, 'the one line opens on something other than the record asking');
  assert.match(page, /\{#if asked\}\n\s+<form class="line-form" onsubmit=\{sendReason\}>/u, 'the reason line is drawn without the record asking');

  /* NO ANSWER IS THE FILLED PRIMARY: the suggested one is marked, and the press is the reader's. */
  const snippetAt = page.indexOf('{#snippet answer(');
  const snippet = page.slice(snippetAt, page.indexOf('{/snippet}', snippetAt));
  assert.ok(snippetAt >= 0, 'the one answer button is no longer one snippet');
  assert.doesNotMatch(snippet, /weight=/u, 'an answer is drawn heavier than the others again');
  assert.match(snippet, /data-suggested=\{marked \? '' : undefined\}/u, 'the suggestion is no longer marked on its button');
  assert.match(snippet, /labelOf\(option, q, moves\)/u, 'an answer no longer says what it does');
});

/**
 * A KEY NEVER SENDS MONEY, AND NEVER A CHANGE THAT IS HARD TO UNDO (DIRECTION §37). Enter gives the suggested answer, or
 * Accept, only where `acceptKey` says a key may; anywhere else it puts the focus on the first answer, whose words name
 * the amount, so the press that sends it is the reader's own on that button. The same on a row to tick, where Enter is
 * "done" with what `e` opened.
 */
test('a key never sends money: with nothing it may give, Enter puts the focus on the button', () => {
  const start = page.indexOf('function onkeydown(e: KeyboardEvent) {');
  const handler = page.slice(start, page.indexOf('\n  }\n', start));
  assert.ok(start >= 0 && handler.length > 0, 'the gate’s key handler no longer reads the way this test assumes');
  assert.match(handler, /const key = act === 'accept' \? acceptKey\(question, moves\.length > 0\) : declineKey\(question\);/u, 'Enter no longer asks whether a key may accept');
  assert.match(
    handler,
    /if \(key === null && act === 'accept'\) \{\n\s+e\.preventDefault\(\);\n\s+document\.getElementById\(`opt-\$\{question\.options\[0\]\?\.key \?\? ''\}`\)\?\.focus\(\);\n\s+return;/u,
    'Enter with nothing it may give does something other than reach the first answer',
  );
  assert.match(
    handler,
    /if \(acceptKey\(question, moves\.length > 0\) === 'accept'\) choose\('accept'\);\n\s+else document\.getElementById\('opt-accept'\)\?\.focus\(\);/u,
    'Enter on a row to tick accepts where a key may not',
  );
  /* AND NO ID REACHES THE READER: a question settled elsewhere and an address the record does not hold say so in words. */
  assert.doesNotMatch(page, /governed\.closed\(question\.id\)|copy\.noSuch\('question'/u, 'the gate reads a question’s handle back to the reader');
});

/**
 * THE RECEIPT QUOTES ONLY WORDS A PERSON GAVE. An answer given in one press is kept by the record with a sentence of its
 * own for the reason (`govern.ts`), and a reloaded receipt drew it in quotation marks under the answer, "Answered in one
 * press, with no reason given." read as though the person had typed it.
 */
test('a reloaded receipt never quotes the sentence the record wrote for a press as the person’s reason', () => {
  assert.equal(pressedOnly('Answered in one press, with no reason given.'), true);
  assert.equal(pressedOnly('Nothing had changed on either side.'), false);
  assert.match(
    page,
    /\{#if settled\.reason\.trim\(\) !== '' && !pressedOnly\(settled\.reason\)\}<p class="settled-reason">/u,
    'the receipt quotes the record’s own sentence for a press, or quotes nothing at all',
  );
});
