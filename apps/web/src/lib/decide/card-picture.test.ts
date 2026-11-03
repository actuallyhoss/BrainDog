/**
 * AN OPTION SHOWN AS WHAT IT IS: its colours, its figure or its picture reach the card
 * as the way's `shows`, a spelling the renderer would refuse reaches nothing, and the card's markup says each one the way
 * a person hears it. Read without a DOM: the card's rules from `card.ts`, its markup from the source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, inlineOf } from './card.ts';

const now = Date.parse('2026-10-06T09:00:00Z');
const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const ask = (options: Record<string, unknown>[]): QueueQuestion =>
  ({
    id: 'SG7',
    who: 'agent:claude',
    at: '2026-10-06T07:00:00Z',
    kind: 'options',
    question: 'Which lining for the coat?',
    why: '',
    cost: 'call',
    options: options.map((o, i) => ({ key: `o${i + 1}`, label: `Lining ${i + 1}`, because: '', recommended: false, ...o })),
  }) as QueueQuestion;

/* WHERE A PAGE SERVES A FILE IT HOLDS: the second part's photograph, and nothing for a file the page does not hold. */
const serves = (row: string, field: string): string | null => (row === 'parts#2' ? `/acme/files/parts/2/${field}` : null);

test('A COLOUR AND A FIGURE ARE THE WAY\'S VISUAL, as the option said them', () => {
  const card = cardOf(ask([{ shows: { swatch: ['#1f3a5f', '#c9a227'] } }, { shows: { figure: '3' } }, {}]), { now });
  assert.deepEqual(card.ways[0]?.shows, { swatch: ['#1f3a5f', '#c9a227'] });
  assert.deepEqual(card.ways[1]?.shows, { figure: '3' });
  assert.equal(card.ways[2]?.shows, null, 'an option that shows nothing reads by its name');
  assert.deepEqual(
    card.ways.map((w) => w.label),
    ['Lining 1', 'Lining 2', 'Lining 3'],
    'a visual takes no word from the name beside it',
  );
  assert.equal(inlineOf(card), false, 'answers that show something are the list to choose from, not a row of bare buttons');
});

test('A SHOWS THE RENDERER WOULD REFUSE GIVES NO VISUAL, and the option still reads by its name', () => {
  const bad = [
    { swatch: ['red'] },
    { swatch: ['#1f3a5f', 'url(/x)'] },
    { swatch: ['#1f3a5f;background:red'] },
    { swatch: [] },
    { swatch: '#1f3a5f' },
    { figure: '' },
    { figure: 3 },
    { file: { row: 'parts#2' } },
    { picture: 'parts#2/photo' },
    'swatch:#1f3a5f',
    7,
    null,
  ];
  const card = cardOf(ask(bad.map((shows) => ({ shows }))), { now, file: serves });
  for (const [i, way] of card.ways.entries()) {
    assert.equal(way.shows, null, `shows ${JSON.stringify(bad[i])} drew something`);
    assert.equal(way.label, `Lining ${i + 1}`);
  }
});

test('A PICTURE IS THE WAY\'S VISUAL ONLY WHERE THE PAGE SERVES IT, from this host and nowhere else', () => {
  const photo = { shows: { file: { row: 'parts#2', field: 'photo' } } };
  const q = ask([photo, { shows: { file: { row: 'parts#9', field: 'photo' } } }]);

  const held = cardOf(q, { now, file: serves });
  assert.deepEqual(held.ways[0]?.shows, { file: { row: 'parts#2', field: 'photo', src: '/acme/files/parts/2/photo' } });
  assert.equal(held.ways[1]?.shows, null, 'a file the page does not hold');
  assert.equal(inlineOf(held), false, 'answers that are pictures are choices in the list');

  assert.equal(cardOf(q, { now }).ways[0]?.shows, null, 'a card handed no way to a file draws none');
  for (const elsewhere of ['https://cdn.example/p.png', '//cdn.example/p.png', 'data:image/png;base64,AAAA'])
    assert.equal(cardOf(q, { now, file: () => elsewhere }).ways[0]?.shows, null, `${elsewhere} is not this host's`);
});

test('THE CARD DRAWS EACH ONE AS A PERSON HEARS IT: colours unsaid, a figure read with the name, a picture silent beside it', () => {
  const drawn = source('./DecisionCard.svelte');
  const body = drawn.match(/\{#snippet choiceBody\(way: Way\)\}([\s\S]*?)\{\/snippet\}/u)?.[1] ?? '';
  assert.notEqual(body, '', 'the card has no one place a choice is drawn');

  /* COLOURS SAY NOTHING ALOUD, and a colour from the record reaches `--swatch` on its own chip and nothing else. */
  assert.match(
    body,
    /<span class="queue-visual" data-shows="swatch" aria-hidden="true"\s*>\{#each way\.shows\.swatch as colour\}<span class="queue-swatch" style="--swatch:\{colour\}"><\/span>\{\/each\}<\/span\s*>/u,
    'the swatch is not hidden from a screen reader, or a colour is written somewhere else',
  );
  assert.equal(drawn.match(/\{colour\}/gu)?.length, 1, 'a colour from the record is written in more than one place');

  /* A FIGURE IS WORDS: read aloud, inside the choice, with the option's name after it as its label. */
  const figure = body.match(/<span class="queue-visual" data-shows="figure"[^>]*>\s*<span class="queue-figure num"[^>]*>\{way\.shows\.figure\}<\/span>\s*<\/span>/u)?.[0] ?? '';
  assert.notEqual(figure, '', 'the figure is not drawn');
  assert.doesNotMatch(figure, /aria-hidden|hidden/u, 'a figure is hidden from a screen reader');
  const name = body.indexOf('<span class="queue-label dc-choice-name own-dir">{way.label}</span>');
  assert.ok(name > body.indexOf(figure), 'the figure has no name after it in the same choice');

  /* A PICTURE IS BESIDE ITS NAME AND SAYS NOTHING ITSELF: one image, from the address `visualOf` passed, `alt=""`. */
  assert.match(
    body,
    /<span class="queue-visual" data-shows="file"\s*><img class="queue-file dc-choice-file" src=\{way\.shows\.file\.src\} alt="" \/><\/span\s*>/u,
    'the picture is not drawn from the address the page passed, or it has words of its own',
  );
  assert.equal(drawn.match(/<img\b/gu)?.length, 1, 'the card draws a picture somewhere a choice is not');
  assert.ok(name > body.indexOf('data-shows="file"'), 'the picture has no name after it in the same choice');
  assert.match(drawn, /\.dc-choice-file \{[^}]*inline-size: 20px;/u, "the picture is not a swatch's size");

  /* EVERY CHOICE IS DRAWN BY IT: one press each, a list to choose from, and a list only read. */
  assert.equal(drawn.match(/\{@render choiceBody\(way\)\}/gu)?.length, 3);
});

test('THE CARD READS ITS OPTIONS ONCE, with the page\'s way to a file', () => {
  const drawn = source('./DecisionCard.svelte');
  assert.match(drawn, /const fileAt = getContext<FileAt \| undefined>\(QUEUE_FILE\);/u, 'the card does not ask the page that drew it');
  assert.match(drawn, /cardOf\(question, \{[^}]*\bfile: fileAt\b[^}]*\}\)/u, 'the card does not hand the way to a file to `cardOf`');
  assert.doesNotMatch(drawn, /waysOf\(/u, 'the card reads its options a second time');
});
