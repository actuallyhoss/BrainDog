/**
 * WHO MAY ANSWER A QUESTION ON `/decide/<id>`, AND WHAT THE GATE SAYS TO SOMEBODY WHO MAY NOT.
 *
 * `/decide` WAS REPAIRED AND THIS SCREEN WAS NOT, AND IT WAS THE DEEPER DEAD END OF THE TWO. The
 * queue answered a question in one press, so its dead end cost a press, a paragraph and a second
 * press. The gate was slower than the queue then: `Choose this` opened a REQUIRED reason box, the
 * commit was refused while the box was empty, and the reason was the whole ceremony. So a colleague
 * at `read` who reached this screen from a card link typed the longest paragraph in the product
 * before anything told them their access did not reach the act. One press answers here now too,
 * and the refusal still comes before it.
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

import { figuresIn, reasonIn } from '../../../lib/cite.ts';
import { mayAnswer, whyNotAnswering } from '../answering.ts';
import { evidenceIn } from '../lead.ts';
import { sideOf } from './side.ts';

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
    /disabled=\{!answerable \|\| holding !== null\}\n\s+aria-describedby=\{answerable \? undefined : 'cannot-decide'\}\n\s+onclick=\{\(\) => choose\(option\.key\)\}/u,
    'the option buttons are live for a reader who may not answer',
  );
});

test('the third verb is off too, and points at the same sentence', () => {
  /* A GATE WITH ITS TWO ANSWERS OFF AND ITS DEFER LIVE IS STILL A DEAD END: a defer is a decision
     about when, it takes a reason and a wake date, and `decide` is what the record wants for it. It is Ask me later, a
     clock beside the answers as on every card (VERIFY H8). */
  assert.match(
    page,
    /<button type="button" class="dc-btn dc-later" data-weight="bare" disabled=\{!answerable\} aria-describedby=\{answerable \? undefined : 'cannot-decide'\} aria-label=\{queueWords\.notNow\} title=\{queueWords\.notNow\} onclick=\{defer\}\n\s+><Icon name="clock" size="s" \/><span class="dc-later-words">\{queueWords\.notNow\}<\/span><\/button/u,
    'Not now is still offered to a reader who may not answer',
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
  const options = page.indexOf('<section class="options"');
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
  const closedAt = page.indexOf('<span>{onwardWords.closed}</span>');
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
 * ONE TILE, READ LIKE A FORM: who asked and when, the answers straight after, then what accepting does as
 * a plain part of the same tile, and the comments under it all.
 *
 * MEASURED before: up to seven tiles (what an arrangement does, what a proposal puts in place, the rows to tick, the
 * rows it changes, what it calls, why it was asked and what it costs) stood between the title and the options, so on a
 * laptop the one thing this screen is for was below the fold. Then they were one folded tile under the options, a
 * second treatment beside the options' tile and the comments floating on the board under both.
 */
test('the options come first with what it changes under them in their tile, and why and the comments are the second tile', () => {
  const head = page.indexOf('<PageHead named kicker={copy.decide}');
  const tile = page.indexOf('<Tile class="gate">');
  const options = page.indexOf('<section class="options"');
  const aside = page.indexOf('<Tile class="gate-aside">');
  const thread = page.indexOf('<Thread');
  const shut = page.lastIndexOf('</Tile>');
  /* WHAT IT CHANGES IS ONE SNIPPET NOW (9764d40be), drawn under the answers in their tile, and over them only where it is
     the choice itself: two answers on rows that change, with no story or preview to read first. */
  const does = page.indexOf('<section class="does"');
  const part = page.indexOf('{#snippet doesPart()}');
  const partEnd = page.indexOf('{/snippet}', does);
  assert.ok(part >= 0 && part < does && partEnd > does, 'what it changes is not the one snippet');
  assert.match(page, /const changesFirst = \$derived\(two && !story && !preview && \(updates\.length > 0 \|\| creates\.length > 0 \|\| picking\)\);/u);
  const over = page.indexOf('{#if changesFirst}{@render doesPart()}{/if}');
  const under = page.indexOf('{#if !changesFirst}{@render doesPart()}{/if}');
  assert.equal(page.match(/\{@render doesPart\(\)\}/gu)?.length, 2, 'what it changes is drawn from somewhere else too');
  /* WHAT IT CHANGES UNDER THE ANSWERS, IN THEIR TILE: beside them it left half the board empty under two buttons. */
  assert.ok(head >= 0 && tile > head && over > tile && options > over && under > options && aside > under && thread > aside && shut > thread, 'the tiles no longer read options, then what it changes, then the comments');
  assert.match(page.slice(under), /^\{#if !changesFirst\}\{@render doesPart\(\)\}\{\/if\}\n\s+<\/Tile>/u, 'what it changes is not the end of the answers\' tile');
  /* TWO TILES ON THE SCREEN, and nothing folded shut in the way of what it changes. */
  assert.equal(page.match(/<Tile\b/gu)?.length, 2, 'the gate is one tile again, or three');
  assert.doesNotMatch(page, /<details class="does"/u, 'what accepting does is folded shut again');
  for (const inside of ['<Arranged arranged={story} />', '<Proposed proposed={preview} />', '<ul class="picks">', '<Changes {updates} />', '<CallsOut', '{copy.costOfDelay}']) {
    const at = page.indexOf(inside);
    assert.ok(at > does && at < partEnd, `${inside} is not inside what accepting does`);
  }
  /* WHY IT IS ASKED IS IN THE SECOND TILE, in the asker's words, before the comments. */
  const why = page.indexOf('<p class="gate-why">');
  assert.ok(why > aside && why < thread, 'why it is asked is no longer in the second tile');
});

test('no option carries a key cap, and no sentence is typed into the gate', () => {
  assert.doesNotMatch(page, /<kbd/u, 'an option carries a key cap again');
  for (const typed of ['>required<', 'You are choosing', '>Cancel<', 'Nobody has decided it.']) assert.ok(!page.includes(typed), `"${typed}" is typed into the markup`);
});

test('both doors refuse before they open, not only the buttons on them', () => {
  const guard = /if \(!answerable\) \{\n\s+toasts\.push\(whyNot, \{ intent: 'warn' \}\);\n\s+return;\n\s+\}/gu;
  /* FOUR DOORS NOW: a press, a choice chosen, a defer, and a press held for its Undo (a merge's answer, or Backspace's
     decline). */
  assert.equal([...page.matchAll(guard)].length, 4, 'choose, pick, defer and a held press do not all refuse a reader who may not answer');
  const pickAt = page.indexOf('function pick(key: string) {');
  const chosenAt = page.indexOf('chosenKey = key;', pickAt);
  assert.ok(pickAt >= 0 && chosenAt > pickAt && page.slice(pickAt, chosenAt).search(guard) >= 0, 'a choice is chosen before anybody checks whether it may');
  const heldAt = page.indexOf('function held(key: string, line: string, rows?: number[]) {');
  const holdAt = page.indexOf('const h = hold(', heldAt);
  assert.ok(heldAt >= 0 && holdAt > heldAt, 'a held press no longer reads the way this test assumes');
  assert.ok(page.slice(heldAt, holdAt).search(guard) >= 0, 'a press is held for its Undo before anybody checks whether it may');

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
      /* ASK ME LATER, the third verb, off with the same sentence. */
      "<button type=\"button\" class=\"dc-btn dc-later\" data-weight=\"bare\" disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} aria-label={queueWords.notNow} title={queueWords.notNow} onclick={defer}",
      '{#if !answerable}',
      /* THE RECORD'S TWO ANSWERS. */
      'disabled={!answerable || holding !== null}',
      "aria-describedby={answerable ? undefined : 'cannot-decide'}",
      /* THE MERGE CARD IS HANDED THE FLAG, and turns its presses off with it as the snippet above does (`MergeCard.svelte`). */
      '{answerable}',
      /* EACH OPTION CARD'S OWN BUTTON. */
      'disabled={!answerable || holding !== null}',
      "aria-describedby={answerable ? undefined : 'cannot-decide'}",
    ],
    'the markup reads `answerable` somewhere new, so something a reader was invited to read may now turn on whether they may answer',
  );

  /* THE OPTION BODIES STAY. A gate that greys its buttons and takes the options with them has told a
     reader the question exists and nothing about it. */
  assert.match(page, /<span class="dc-choice-does card-body"><Cited text=\{because\}/u, 'the option bodies no longer read the way this test assumes');
  const bodyAt = page.indexOf('<span class="dc-choice-does card-body"><Cited text={because}');
  const optionsAt = page.indexOf('{#each question.options as option}');
  assert.ok(optionsAt >= 0 && bodyAt > optionsAt, 'the option loop no longer reads the way this test assumes');
  /* THE CHOICE'S BUTTON BEFORE IT IS OFF FOR SUCH A READER, and that is all: no condition over the body turns on it. */
  assert.doesNotMatch(page.slice(optionsAt, bodyAt), /\{[#:](if|else if)[^}]*answerable/u, 'an option’s body is drawn only for a reader who may answer');
});

/**
 * ONE PRESS IS THE ANSWER, and a reason is the record's to ask for, once, never this screen's to demand.
 *
 * MEASURED on the walk of 2 October: a press made a round trip and then asked "Why?", and two of the owner's decisions
 * carried the reasons "f" and "y". So the press sends the answer alone, the one line opens only on the record's own
 * `wants: 'reason'`, and the suggested answer is the one filled primary and says so on its own button.
 */
test('one press is the answer, and a reason is asked for only when the record asks', () => {
  const chooseAt = page.indexOf('function choose(key: string) {');
  const chooseEnd = page.indexOf('\n  }\n', chooseAt);
  assert.match(page.slice(chooseAt, chooseEnd), /void send\(key\);/u, 'a press no longer sends the answer');
  assert.doesNotMatch(page.slice(chooseAt, chooseEnd), /reason/u, 'a press asks for a reason before it sends');
  assert.match(page, /out\.from === 'refused' && out\.wants === 'reason' && said === undefined/u, 'the one line opens on something other than the record asking');
  assert.match(page, /\{#if asked\}\n\s+<form class="line-form" onsubmit=\{sendReason\}>/u, 'the reason line is drawn without the record asking');

  /* THE SUGGESTED ANSWER IS THE ONE FILLED PRIMARY, "Accept, suggested" on its own button, as on the queue's cards
     (`primaryOf`): of the record's two answers the suggested one is filled, and Accept only where nothing is suggested.
     A late payment's own buttons say which leads (`lead`). The press is still the reader's. A question of options is a card each, and its own button gives it (today F9). */
  const snippetAt = page.indexOf('{#snippet answer(');
  const snippet = page.slice(snippetAt, page.indexOf('{/snippet}', snippetAt));
  assert.ok(snippetAt >= 0, 'the one answer button is no longer one snippet');
  assert.deepEqual(snippet.match(/weight=\{[^}]*\}/gu), ["weight={(lead ?? (marked || (suggestedKey === undefined && option.key === 'accept'))) && !hardly(option.key) ? 'primary' : undefined}"], 'the filled answer is not the suggested one, or Accept where nothing is suggested, or it is one that cannot be undone (audit 6g, AG11)');
  const pickAt = page.indexOf('function pick(key: string) {');
  assert.doesNotMatch(page.slice(pickAt, page.indexOf('\n  }\n', pickAt)), /send\(/u, 'a choice sends its answer before Needs you');
  const pressAt = page.indexOf('async function press(key: string) {');
  const press = page.slice(pressAt, page.indexOf('\n  }\n', pressAt));
  assert.ok(pressAt >= 0, 'an option card’s button no longer has its own press');
  assert.match(press, /if \(confirming !== key && hardly\(key\)\) \{\n\s+confirming = key;[^]*?return;\n\s+\}\n\s+confirming = null;\n\s+chosenKey = key;\n\s+choose\(key\);$/u, 'a card’s press does not give its answer, or gives one that cannot be undone without asking');
  assert.match(snippet, /data-suggested=\{marked \? '' : undefined\}/u, 'the suggestion is no longer marked on its button');
  assert.match(snippet, /\{#if marked && lead === undefined\}<span class="gate-sug">, \{gate\.suggested\.toLowerCase\(\)\}<\/span>\{\/if\}/u, 'the filled answer no longer says on its button that it is the suggested one');
  assert.match(snippet, /labelOf\(option, q, moves\)/u, 'an answer no longer says what it does');
});

/**
 * A KEY NEVER SENDS MONEY, AND NEVER A CHANGE THAT IS HARD TO UNDO. Enter gives the suggested answer, or
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
    /\{#if settled\.reason\.trim\(\) !== '' && !pressedOnly\(settled\.reason\) && !ownReason\(settled\.reason\)\}<p class="settled-reason">/u,
    'the receipt quotes the record’s own sentence for a press, or quotes nothing at all',
  );
  /* THE RECORD HAS A SECOND SENTENCE OF ITS OWN FOR A PRESS (`govern.ts`), and the receipt keeps that out of the quotes too. */
  assert.match(page, /const ownReason = \(reason: string\): boolean => \/\^Answered in one press, for the option's own reason: \/u\.test\(reason\.trim\(\)\);/u);
});

/**
 * A MERGE IS ASKED AS WHO IS WHO, and an answer that cannot be taken back waits six seconds for its Undo:
 * a merge's presses, and Backspace's decline on any question, since a declined question is never reopened and a pair
 * kept apart is never asked about again. A key that starts in a field or a box is never the gate's.
 */
test('a merge is the one decision card with Undo, and Backspace is held and never fires from a field', () => {
  assert.match(page, /\{#if merge\}\n(\s+<!--[^]*?-->\n)?\s+<MergeCard\n/u, 'a merge question is drawn as a plain Accept and Decline');
  assert.match(page, /onpress=\{pressMerge\}/u, 'the merge card’s presses are not held for their Undo');
  assert.match(page, /const pressMerge = \(press: Press, line: string\) => held\(press\.option, line, press\.rows\);/u);

  const start = page.indexOf('function onkeydown(e: KeyboardEvent) {');
  const handler = page.slice(start, page.indexOf('\n  }\n', start));
  assert.match(handler, /if \(typing\(\) \|\| fromInput\(e\.target\)\) return;/u, 'a key from inside a field or a box reaches the gate');
  assert.match(handler, /pressMerge\(merge\.apart, mergeWords\.keptApart\);/u, 'Backspace keeps a merge apart with no Undo');
  /* A DECLINE IS HELD FOR ITS UNDO ON EVERY QUESTION (Enter was taken away on a hard one, never the hold), and the
     line it leaves says the question as the title does, with no address or id in it. */
  assert.match(
    handler,
    /if \(act === 'decline'\) held\(key, gate\.declinedHeld\(spoken\(question\.title\)\)\);\n\s+else choose\(two \? key : \(selectedKey \?\? key\)\);/u,
    'Backspace declines with no Undo, or says the question with its addresses in',
  );

  /* HELD FOR SIX SECONDS, ON THE LINE IT LEAVES, AND SENT WHEN THE SCREEN GOES rather than dropped. */
  assert.match(page, /toasts\.push\(line, \{ undo: unhold, life: HOLD_MS, intent: 'good' \}\)/u, 'the Undo line does not last as long as the hold');
  assert.match(page, /mounted = false;\n\s+leave\(\);/u, 'a held press is dropped when the screen goes');
  assert.match(
    page,
    /if \(mounted && question\?\.id === id && String\(page\.params\.id\) === id\) void send\(key, undefined, rows\);\n\s+else void sendAway\(id, key, rows\);/u,
    'a held press that outlives its screen, or its question, answers the next question',
  );
  assert.match(page, /if \(holding && holding\.id !== id\) holding\.held\.flush\(\);/u, 'moving on to the next question leaves a held press holding its answers off');

  /* AND A QUESTION THAT GATHERED SEVERAL SAYS HOW MANY BESIDE ITS TITLE. */
  assert.match(page, /title=\{headed\.ask\} count=\{joined\}/u, 'a joined question’s count is not in its heading');
});

/**
 * THE SIDE, AS THIS PAGE ASKS FOR IT (`side.ts`, `../lead.ts`), held by what it returns and not by the markup's text.
 * The tests that stood here read the side's markup as regexes, and passed with it present whatever it said (audit
 * 31-32). These hold what the page is handed for a question as the record sends one: its why, each answer's
 * reason as filed (`reasonIn`), and its body. Each fails on a revert of finding 5.
 */
const asked = (q: { context?: string; options: { key: string; body: string }[]; body?: unknown }) =>
  sideOf({
    why: q.context ?? '',
    reasons: q.options.map((o) => ({ text: reasonIn(q.body, o.key) ?? o.body })),
    body: q.body,
    figures: figuresIn(q.body),
    now: Date.parse('2026-10-08T09:00:00Z'),
  });

test('a question whose only news is what answering changes has no side, so that news is said once, under the answers', () => {
  /* AN ARRANGEMENT THAT ADDS A PAGE AND MOVES MONEY, with no why and nothing cited: the side used to hold its headline
     beside the answers on a wide screen, the same lines the tile under the answers draws whole. */
  const side = asked({
    options: [
      { key: 'accept', body: 'Adds the page Cash this month and moves £12.98.' },
      { key: 'decline', body: '' },
    ],
    body: { kind: 'arrange', options: [{ id: 'accept', because: 'Adds the page Cash this month and moves £12.98.' }] },
  });
  assert.equal(side.any, false, 'the side is drawn, with what answering changes in it a second time');
  assert.equal('changes' in side, false, 'the side holds what answering changes again');
});

test('an agent’s “2 of 5 steps” is words and never a chart; a pair on the body is the one chart', () => {
  const prose = asked({
    context: 'The import stopped part way: 2 of 5 steps are done.',
    options: [{ key: 'accept', body: '' }],
    body: { options: [{ id: 'accept', because: "41 of September's 58 HSBC lines were typed in by hand." }] },
  });
  assert.equal(prose.evidence, null, 'a share was read out of an agent’s sentence and drawn as Evidence');
  assert.equal(prose.any, true, 'why it is asked still keeps the side');

  const given = asked({
    options: [{ key: 'accept', body: 'Files them by your rules.' }],
    body: { evidence: { value: 37, of: 41, said: 'Your rules would have filed 37 of the 41 correctly.' } },
  });
  assert.deepEqual(given.evidence, { value: 37, max: 41, said: 'Your rules would have filed 37 of the 41 correctly.' });
  assert.deepEqual(evidenceIn({ evidence: { value: 37, of: 41 } }), { value: 37, max: 41, said: '37 of 41' });
});

/* THE SQUARES AND THEIR SENTENCE ARE ONE CLAIM, heard once. Whether a screen reader hears a node is the markup's alone,
   so this one line reads the markup: the waffle sits in a box hidden from it, and the sentence under it is read. */
test('the evidence is heard once: the squares are hidden from a screen reader, and the sentence under them is read', () => {
  const ev = page.slice(page.indexOf('{#if side.evidence}'), page.indexOf('{#if side.links.length > 0}'));
  assert.match(ev, /<div class="gate-ev" aria-hidden="true">\s+(?:<!--[^]*?-->\s+)?<Waffle/u, 'the squares say the sentence to a screen reader too');
  assert.match(ev, /<p class="gate-ev-said">\{ev\.said\}<\/p>/u, 'the sentence under the squares is gone');
});
