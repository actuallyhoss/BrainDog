/**
 * What Decide says first, held without a browser: the sentence under the title, the gate's sentence, how long each
 * question has waited, and the one share a proposer's reason may carry. Every figure is one the record gave; these
 * tests pin that nothing here invents one.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ageDays, countSentence, evidenceOf, gateSentence, sentenceOf, shortTitle, waitedOf, waitedWords, waitingSaid } from './lead.ts';

const NOW = Date.parse('2026-09-29T09:40:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const opt = (title: string, recommended = false) => ({ key: title.toLowerCase(), title, body: '', recommended });

test('the count is said in words, and red only over the aim or when a question is hard to undo', () => {
  const two = sentenceOf([{ band: 'call' }, { band: 'rows' }], { options: [opt('Accept', true), opt('Not now')] }, 'claude');
  assert.deepEqual(two, { text: 'Two questions wait on you. claude suggests “Accept” for the first.', needs: '' });

  const undo = sentenceOf([{ band: 'undo' }], { options: [opt('Per seat', true)] });
  assert.deepEqual(undo, { text: 'One question waits on you. “Per seat” is suggested.', needs: 'One question waits on you' });

  const five = sentenceOf([{}, {}, {}, {}, {}], { options: [opt('Yes'), opt('No')] });
  assert.equal(five?.text, 'Five questions wait on you, two over the aim of three.');
  assert.equal(five?.needs, 'Five questions wait on you, two over the aim of three');
  /* THE RED PHRASE IS INSIDE THE SENTENCE, so PageHead can cut round it. */
  assert.ok(five && five.text.includes(five.needs));
});

test('nothing waiting is not a sentence, because the cleared state says it', () => {
  assert.equal(sentenceOf([], undefined), null);
});

test('the gate says how many options, which is suggested, and how long it has been open', () => {
  assert.equal(
    gateSentence({ options: [opt('Flat'), opt('Per seat', true), opt('Usage')], opened: daysAgo(15) }, NOW),
    'Three options; “Per seat” is suggested; opened 2 weeks ago.',
  );
  assert.equal(gateSentence({ options: [opt('Yes'), opt('No')], opened: daysAgo(0.2) }, NOW), 'Two options; opened today.');
});

test('an age is said as a person holds it', () => {
  assert.equal(waitedWords(0.4), 'today');
  assert.equal(waitedWords(1.2), '1 day');
  assert.equal(waitedWords(13.9), '13 days');
  assert.equal(waitedWords(36), '5 weeks');
  assert.equal(waitedWords(90), '3 months');
  assert.equal(waitedWords(400), '1 year');
  assert.equal(waitingSaid(daysAgo(2.1), NOW), 'waiting 2 days');
  assert.equal(waitingSaid(daysAgo(0.1), NOW), 'asked today');
  /* A TIME THIS BUILD CANNOT READ IS NO AGE, never a negative bar. */
  assert.equal(ageDays('not a day', NOW), 0);
  assert.equal(ageDays(new Date(NOW + 86_400_000).toISOString(), NOW), 0);
});

test('a label is cut at a word, and only when it has to be', () => {
  assert.equal(shortTitle('Pay the vendor?'), 'Pay the vendor');
  assert.equal(shortTitle('Read HSBC Egypt texts and mails into Money?'), 'Read HSBC Egypt…');
  assert.ok(shortTitle('Supercalifragilisticexpialidocious').length <= 19);
});

test('how long each has waited: the open one in ink, anything past two weeks red, and the reading says so', () => {
  const qs = [
    { id: 'a', title: 'Read HSBC texts', opened: daysAgo(2) },
    { id: 'b', title: 'GA4 consent gate', opened: daysAgo(36) },
    { id: 'c', title: 'Supplier price', opened: daysAgo(5) },
  ];
  const w = waitedOf(qs, 'a', NOW);
  assert.deepEqual(
    w.items.map((i) => i.tone),
    ['ink', 'danger', 'g2'],
  );
  assert.equal(Math.round(w.items[1]!.value), 36);
  assert.equal(w.reading, 'One has waited over two weeks, the longest 5 weeks.');
  assert.equal(waitedOf(qs.slice(0, 1), 'a', NOW).reading, 'None has waited two weeks; the oldest has waited 2 days.');

  const many = Array.from({ length: 11 }, (_, i) => ({ id: String(i), title: `Q${i}`, opened: daysAgo(i) }));
  const drawn = waitedOf(many, '0', NOW);
  assert.equal(drawn.items.length, 8);
  assert.match(drawn.reading, /The first eight of 11 are drawn\.$/u);
});

test('a share is read out of the proposer’s own reason, and nothing else is drawn as one', () => {
  const said =
    "41 of September's 58 HSBC lines were typed in by hand from those texts, and your rules would have filed 37 of the 41 correctly. Accepting takes the typing away.";
  const e = evidenceOf(said);
  assert.deepEqual(e && { value: e.value, max: e.max }, { value: 41, max: 58 });
  assert.equal(e?.said, "41 of September's 58 HSBC lines were typed in by hand from those texts, and your rules would have filed 37 of the 41 correctly.");

  assert.equal(evidenceOf('3 of the 1,200 rows moved.')?.max, 1200);
  /* NOT A SHARE: a count against something else, a larger part than its whole, a whole too small to draw, no pair. */
  assert.equal(evidenceOf('1 of them paid 2 days later.'), null);
  assert.equal(evidenceOf('9 of 4 were filed.'), null);
  assert.equal(evidenceOf('1 of 2 is fine.'), null);
  assert.equal(evidenceOf('Nothing is paid or moved.'), null);
  assert.equal(evidenceOf('Q3 of 12 went well.'), null);
});

/**
 * THE SCREEN READS THESE, and keeps what the gates and the other tests hold it to. A pure module the screen does not
 * call fixes nothing, so the wiring is read as text, the way `page.test.ts` reads the answer buttons.
 */
test('the queue draws its sentence, its lead and its chart from this module, and draws the open question once', () => {
  const page = readFileSync(new URL('./Classic.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\.\/lead\.ts'/u);
  assert.match(page, /sentenceOf\(/u);
  assert.match(page, /waitedOf\(/u);
  assert.match(page, /evidenceOf\(/u);
  /* THE LEAD IS ITS OWN `ol.queue`, and the rows under it start after it, so no question is drawn twice. */
  assert.match(page, /<ol class="queue"/u);
  assert.match(page, /class="q"/u);
  assert.match(page, /order\.slice\(1\)/u);
  /* THE HOOKS THE KEYS GATE PRESSES. */
  for (const hook of ['id="q-{q.id}"', 'id="opt-{q.id}-{o.key}"', 'class="rec"', 'class="pick"', 'data-picking=', 'data-cursor=', 'data-done='])
    assert.ok(page.includes(hook), `the queue no longer draws ${hook}`);
});

test('the declared page says the same sentence from a count, a flag and the first suggestion', () => {
  assert.deepEqual(countSentence(0, false, 'Yes'), null);
  assert.deepEqual(countSentence(2, false, 'Per seat', 'Claude'), { text: 'Two questions wait on you. Claude suggests “Per seat” for the first.', needs: '' });
  assert.deepEqual(countSentence(1, true, undefined), { text: 'One question waits on you.', needs: 'One question waits on you' });
  /* AND THE CLASSIC SCREEN'S SENTENCE IS THIS ONE, over the questions it holds whole. */
  const waiting = [{ band: 'call' }, { band: 'undo' }] as never[];
  assert.deepEqual(sentenceOf(waiting, { options: [{ key: 'a', title: 'Per seat', body: '', recommended: true }] } as never), countSentence(2, true, 'Per seat'));
});

test('the gate draws its sentence from this module', () => {
  const gate = readFileSync(new URL('./[id]/+page.svelte', import.meta.url), 'utf8');
  assert.match(gate, /gateSentence\(/u);
});
