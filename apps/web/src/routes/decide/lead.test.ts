/**
 * What Decide says first, held without a browser: the sentence under the title, the gate's sentence, how long each
 * question has waited, and the one share a proposer's reason may carry. Every figure is one the record gave; these
 * tests pin that nothing here invents one.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ageDays, countSentence, evidenceIn, sentenceOf, shortTitle, waitedOf, waitedWords, waitingSaid } from './lead.ts';

const NOW = Date.parse('2026-09-29T09:40:00Z');
/** When a question is late, as the record says it (`boot`'s `lateDays`): the web keeps no number of its own. */
const LATE = 14;
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const opt = (title: string, recommended = false) => ({ key: title.toLowerCase(), title, body: '', recommended });

test('the count is said in words, then what is hard to undo or what the first suggests; red only for what has waited past two weeks', () => {
  const two = sentenceOf([{ band: 'call' }, { band: 'rows' }], { options: [opt('Accept', true), opt('Not now')] }, 'claude', NOW);
  assert.deepEqual(two, { text: 'Two questions wait on you. claude suggests “Accept” for the first.', needs: '' });

  const undo = sentenceOf([{ band: 'undo' }], { options: [opt('Per seat', true)] }, '', NOW);
  assert.deepEqual(undo, { text: 'One question waits on you. It is hard to undo.', needs: '' });

  /* NO AIM, NO QUOTA: eight is a count, and nothing in it is red until something is late. */
  const eight = sentenceOf([{ band: 'undo' }, {}, {}, {}, {}, {}, {}, {}], { options: [opt('Yes'), opt('No')] }, '', NOW);
  assert.deepEqual(eight, { text: 'Eight questions wait on you. One of them is hard to undo.', needs: '' });

  const stale = sentenceOf([{ opened: daysAgo(20) }, { opened: daysAgo(16) }, { opened: daysAgo(1) }], { options: [opt('Yes', true)] }, '', NOW, LATE);
  assert.deepEqual(stale, { text: 'Three questions wait on you, two of them for over two weeks. “Yes” is suggested for the first.', needs: 'two of them for over two weeks' });
  /* THE RED PHRASE IS INSIDE THE SENTENCE, so PageHead can cut round it. */
  assert.ok(stale && stale.text.includes(stale.needs));
  /* A HOST THAT DID NOT SAY WHEN A QUESTION IS LATE: nothing is called late, rather than a number of the web's own. */
  const unsaid = sentenceOf([{ opened: daysAgo(20) }, { opened: daysAgo(1) }], { options: [opt('Yes', true)] }, '', NOW);
  assert.deepEqual(unsaid, { text: 'Two questions wait on you. “Yes” is suggested for the first.', needs: '' });
  /* AND ITS WORDS ARE THE RECORD'S NUMBER: ten days is said as ten days. */
  assert.equal(sentenceOf([{ opened: daysAgo(12) }], undefined, '', NOW, 10)?.needs, 'for over ten days');
});

test('nothing waiting is not a sentence, because the cleared state says it', () => {
  assert.equal(sentenceOf([], undefined), null);
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
  const w = waitedOf(qs, 'a', NOW, LATE);
  assert.deepEqual(
    w.items.map((i) => i.tone),
    ['ink', 'danger', 'g2'],
  );
  assert.equal(Math.round(w.items[1]!.value), 36);
  assert.equal(w.reading, 'One has waited over two weeks, the longest 5 weeks.');
  assert.equal(waitedOf(qs.slice(0, 1), 'a', NOW, LATE).reading, 'None has waited two weeks; the oldest has waited 2 days.');

  const many = Array.from({ length: 11 }, (_, i) => ({ id: String(i), title: `Q${i}`, opened: daysAgo(i) }));
  const drawn = waitedOf(many, '0', NOW, LATE);
  assert.equal(waitedOf(qs, 'a', NOW).reading, 'The oldest has waited 5 weeks.', 'no late mark from the record, none here');
  assert.deepEqual(waitedOf(qs, 'a', NOW).items.map((i) => i.tone), ['ink', 'g2', 'g2']);
  assert.equal(drawn.items.length, 8);
  assert.match(drawn.reading, /The first eight of 11 are drawn\.$/u);
});

test('a share is the pair the question’s body gives as data, and a sentence never makes one', () => {
  const said = "41 of September's 58 HSBC lines were typed in by hand from those texts.";
  assert.deepEqual(evidenceIn({ evidence: { value: 41, of: 58, said } }), { value: 41, max: 58, said });
  /* THE SENTENCE MAY CITE THE BODY'S FIGURES, and is read through them; with none, the reading is the pair itself. */
  const figures = { 'ref:people#2': { kind: 'row', register: 'people', seq: 2, title: 'Ana Reyes' } };
  const cited = evidenceIn({ evidence: { value: 3, of: 12, said: '3 of the 12 went to {{ref:people#2}}.' }, figures });
  assert.equal(cited?.said, '3 of the 12 went to Ana Reyes.');
  assert.deepEqual(evidenceIn({ evidence: { value: 3, of: 1200 } }), { value: 3, max: 1200, said: '3 of 1,200' });

  /* NOT A SHARE: a part larger than its whole, a whole too small to draw, a part that is no whole number, no field. */
  assert.equal(evidenceIn({ evidence: { value: 9, of: 4 } }), null);
  assert.equal(evidenceIn({ evidence: { value: 1, of: 2 } }), null);
  assert.equal(evidenceIn({ evidence: { value: 1.5, of: 4 } }), null);
  assert.equal(evidenceIn({ evidence: { value: '41', of: '58' } }), null);
  assert.equal(evidenceIn({ evidence: [41, 58] }), null);
  assert.equal(evidenceIn(undefined), null);

  /* THE WORDS OF AN AGENT ARE NEVER EVIDENCE (audit 31-32, finding 5): "2 of 5 steps" in a reason drew a waffle. A body
     that holds the pair only in an option's reason draws nothing. */
  assert.equal(evidenceIn({ options: [{ id: 'accept', because: '2 of 5 steps are done.' }] }), null);
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
  /* THE OPEN QUESTION'S SHARE IS READ FROM ITS BODY, never out of its reason's words. */
  assert.match(page, /evidenceIn\(body/u);
  assert.doesNotMatch(page, /evidenceOf\(/u);
  /* THE LEAD IS ITS OWN `ol.queue`, and the rows under it start after it, so no question is drawn twice. */
  assert.match(page, /<ol class="queue"/u);
  assert.match(page, /class="q"/u);
  assert.match(page, /order\.slice\(1\)/u);
  /* THE HOOKS THE KEYS GATE PRESSES. */
  /* THE OPTIONS ARE THE ONE DECISION CARD'S, which carries the ids the keys find by, and marks the suggestion. */
  for (const hook of ['id="q-{q.id}"', 'idOf={(key) => `opt-${q.id}-${key}`}', '<DecisionCard', 'class="pick"', 'data-picking=', 'data-cursor=', 'data-done='])
    assert.ok(page.includes(hook), `the queue no longer draws ${hook}`);
});

test('the declared page says the same sentence from a count, how many are hard to undo, the first suggestion and how many are late', () => {
  assert.deepEqual(countSentence(0, 0, 'Yes'), null);
  assert.deepEqual(countSentence(2, 0, 'Per seat', 'Claude'), { text: 'Two questions wait on you. Claude suggests “Per seat” for the first.', needs: '' });
  assert.deepEqual(countSentence(1, 1, undefined), { text: 'One question waits on you. It is hard to undo.', needs: '' });
  assert.deepEqual(countSentence(5, 2, 'Yes'), { text: 'Five questions wait on you. Two of them are hard to undo.', needs: '' });
  assert.equal(countSentence(2, 2, 'Yes')?.text, 'Two questions wait on you. Both are hard to undo.');
  assert.deepEqual(countSentence(1, 0, undefined, '', 1, LATE), { text: 'One question waits on you, for over two weeks.', needs: 'for over two weeks' });
  assert.equal(countSentence(1, 0, undefined, '', 1)?.needs, 'for too long', 'a late count from a host that named no days');
  /* AND THE CLASSIC SCREEN'S SENTENCE IS THIS ONE, over the questions it holds whole. */
  const waiting = [{ band: 'call' }, { band: 'undo' }] as never[];
  assert.deepEqual(sentenceOf(waiting, { options: [{ key: 'a', title: 'Per seat', body: '', recommended: true }] } as never, '', NOW), countSentence(2, 1, 'Per seat'));
});

/* THE GATE SAYS NO TRIVIA UNDER ITS TITLE (DIRECTION §39): "Three options; Per product is suggested; opened 5 weeks ago"
   said what the tile under it already shows. Who asked and when is the tile's quiet first line instead. */
test('the gate draws no sentence of counts under its title', () => {
  const gate = readFileSync(new URL('./[id]/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(gate, /gateSentence\(|<PageHead[^>]*\bsentence=/u);
  assert.match(gate, /<p class="gate-by">/u, 'the tile no longer says who asked and when');
});
