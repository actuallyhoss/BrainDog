/**
 * What a person said shows nowhere in the sign-up letter (letter-link-51, use case 6 step 4).
 *
 * MEASURED BEFORE THIS FILE: the letter printed the whole link under its button and again in its plain text, so her
 * sentence stood in the letter in the clear, and anybody could start a sign-up for an address not theirs and have a
 * thousand characters of their own shown to whoever opened it.
 *
 * THE SENTENCE RIDES IN THE BUTTON'S ADDRESS AND NOWHERE ELSE. The line under the button and the plain text hold the
 * link as far as its proof, which still makes the record; a phone that opens that one starts without the sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { letterOf } from '../src/mail.ts';

const TOKEN = 'p'.repeat(43);
const BARE = `https://app.brain.dog/signup#verify=${TOKEN}`;
const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer.";
const ARABIC = 'أنا مريم وأدير متجرا صغيرا للشموع في الإسكندرية وأعمل مصممة حرة';
const linkOf = (said: string): string => `${BARE}&said=${encodeURIComponent(JSON.stringify({ said, currency: 'EGP' }))}`;

/** The letter's HTML with every address a link goes to taken out, which leaves what a person can read. */
const read = (html: string): string => html.replace(/\shref="[^"]*"/gu, '');

/** Every way the sentence could stand in a letter: as typed, as a link carries it, and as HTML writes either. */
const tracesOf = (said: string): string[] => {
  const words = said.split(/\s+/u).filter((w) => w.length > 3);
  const esc = (s: string): string => s.replace(/&/gu, '&amp;').replace(/'/gu, '&#39;').replace(/"/gu, '&quot;');
  return [...new Set([...words, ...words.map((w) => encodeURIComponent(w)), ...words.map(esc)])];
};

for (const [who, said] of [['English', MARIAM], ['Arabic', ARABIC]] as const) {
  test(`THE PLAIN TEXT HOLDS THE LINK AS FAR AS ITS PROOF, and none of an ${who} sentence`, () => {
    const { text } = letterOf('signup.verify', { link: linkOf(said) });
    assert.ok(text.split('\n').includes(BARE), 'the link stands by itself on a line, proof and no more');
    assert.doesNotMatch(text, /said/u);
    for (const t of tracesOf(said)) assert.equal(text.includes(t), false, `the plain text holds "${t}"`);
  });

  test(`THE HTML HOLDS AN ${who.toUpperCase()} SENTENCE ONLY IN THE BUTTON'S ADDRESS`, () => {
    const { html } = letterOf('signup.verify', { link: linkOf(said) });
    const seen = read(html);
    assert.doesNotMatch(seen, /said=/u, 'nothing of the sentence outside an address');
    for (const t of tracesOf(said)) assert.equal(seen.includes(t), false, `the letter shows "${t}"`);
    /* THE LINE UNDER THE BUTTON: the proof's link as its words and as where it goes. */
    assert.ok(html.includes(`Or paste this link into your browser:<br><a href="${BARE}"`), 'the line under the button goes to the proof alone');
    assert.ok(seen.includes(`>${BARE}</a>`), 'and shows the proof alone');
    /* THE BUTTON STILL CARRIES IT, so the tab it opens builds from what she said. */
    const hrefs = [...html.matchAll(/\shref="([^"]*)"/gu)].map((m) => (m[1] ?? '').replace(/&#39;/gu, "'").replace(/&amp;/gu, '&'));
    assert.ok(hrefs.includes(linkOf(said)), 'the button goes to the whole link');
  });
}

test('A LINK WITH NOTHING SAID IS SHOWN AS IT ALWAYS WAS, and so is a sign-in link', () => {
  const plain = letterOf('signup.verify', { link: BARE });
  assert.ok(plain.text.split('\n').includes(BARE));
  assert.ok(plain.html.includes(`>${BARE}</a>`));
  const signin = 'https://app.brain.dog/signin#magic=abc&said=kept';
  assert.ok(letterOf('signin', { link: signin }).text.includes(signin), 'only a proof that makes a record is followed by a sentence');
});
