/**
 * Names that draw nothing, or draw noise, and the joiners that let them in. `loop/research-batch-sixteen-audit.md`
 * findings 6 and 7, on `personName` (`packages/host/src/invite.ts`).
 *
 * THE JOINERS WERE EXEMPT FOR EVERY SCRIPT. ZWNJ and ZWJ were taken out of the inside check wholesale, because they
 * are spelling in Persian and the Indic scripts, so the audit stored `Bob\u200CSmith` (a Latin name with a gap nobody
 * can see) and `a`, 98 joiners and `b`, which is 100 code points drawn as `ab`. The Malayalam chillu the exemption was
 * written for and a Latin spoof were the same to it.
 *
 * AND WHAT IS LEFT AFTER THE INVISIBLES ARE GONE COULD STILL BE NOISE. Stored by the audit: a combining acute with no
 * letter under it, one letter carrying 99 combining marks, 90 emoji variation selectors after a letter, a private use
 * character alone, the noncharacters U+FFFF and U+FDD0, and `Bo`, 80 figure spaces and `T`.
 *
 * THESE DRIVE `personName` DIRECTLY. `invite-hostile.test.ts` already proves the route and the operator's provision
 * both call it and refuse before anybody is made; what is new here is only what it answers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { personName } from '../src/invite.ts';

/** Each of these has something visible in it and something a screen should not draw as part of a person's name. */
const REFUSED: [string, string][] = [
  /* FINDING 6. A joiner is spelling only after a letter of a script that spells with it, or between two emoji. */
  ['a non-joiner between Latin letters', 'Bob\u200CSmith'],
  ['a joiner between Latin letters', 'Bo\u200DTanner'],
  ['98 joiners between two letters', `a${'\u200D'.repeat(98)}b`],
  ['a joiner leading a name', '\u200DBo'],
  /* THE SCRIPT BEING RIGHT IS NOT ENOUGH. Persian needs one non-joiner between two halves, never a run of them. */
  ['two non-joiners in a row in Persian', 'محمد\u200C\u200Cرضا'],
  ['50 joiners after a Malayalam virama', `ന്${'\u200D'.repeat(50)}`],
  /* FINDING 7. What is not invisible, and still draws no name. */
  ['a lone combining acute', '\u0301'],
  ['a combining acute after a space', 'Bo \u0301Tanner'],
  ['a letter carrying 99 combining marks', `a${'\u0301'.repeat(99)}`],
  ['90 emoji variation selectors after a letter', `a${'\uFE0F'.repeat(90)}`],
  ['a private use character alone', '\uE000'],
  ['a private use character inside a name', 'Bo\uF8FFTanner'],
  ['a supplementary private use character', '\u{F0000}'],
  ['the noncharacter U+FFFF', '\uFFFF'],
  ['the noncharacter U+FDD0', 'Bo\uFDD0'],
];

/** Each of these is a name somebody could have typed on purpose, and it must arrive as typed. */
const KEPT: [string, string][] = [
  ['Persian with a non-joiner', 'محمد\u200Cرضا'],
  ['Persian with a non-joiner after a vowel mark', 'مِ\u200Cر'],
  ['Hindi half form with a joiner', 'क्\u200Dष'],
  ['Hindi explicit virama with a non-joiner', 'क्\u200Cष'],
  ['a Malayalam chillu', 'ന്\u200D'],
  ['Sinhala Sri, written with a joiner', 'ශ්\u200Dරී'],
  ['an emoji family', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'],
  ['an emoji with a skin tone and a joiner', '\u{1F469}\u{1F3FD}\u200D\u{1F4BB}'],
  ['the rainbow flag', '\u{1F3F3}\uFE0F\u200D\u{1F308}'],
  ['a heart with its presentation selector', 'Bo ❤\uFE0F'],
  ['accented, precomposed', 'José Müller'],
  ['accented, decomposed', 'Jose\u0301'],
  ['Vietnamese, two marks on one letter', 'Nguye\u0323\u0302n'],
  ['Vietnamese, precomposed', 'Ngô Bảo Châu'],
  ['Hebrew with points', 'שָׁלוֹם'],
  ['Tibetan stacked', 'བསྒྲུབས'],
  ['Japanese with an ideographic space', '山田\u3000太郎'],
];

test('A JOINER OUTSIDE THE SCRIPTS THAT SPELL WITH IT, AND A NAME THAT DRAWS NOISE, ARE REFUSED at `name`', () => {
  for (const [what, name] of REFUSED) {
    const out = personName(name);
    assert.equal(out.ok, false, `${what} was stored as ${JSON.stringify(out.ok && out.value)}`);
    assert.ok(!out.ok && 'refusal' in out, what);
    assert.equal(out.refusal.code, 'VALUE_MALFORMED', what);
    assert.equal(out.refusal.at, 'name', what);
  }
});

/* CLEANED AND NOT REFUSED, AS THE EDGES ALREADY ARE. A run of spaces between two words draws as a gap, not as a hidden
   character, and the person asked to be the two words; the first space of the run is kept, so an ideographic space in
   a Japanese name stays ideographic. */
test('A RUN OF SPACES INSIDE A NAME IS ONE SPACE', () => {
  assert.deepEqual(personName(`Bo${'\u2007'.repeat(80)}T`), { ok: true, value: 'Bo\u2007T' });
  assert.deepEqual(personName('Bo   Tanner'), { ok: true, value: 'Bo Tanner' });
  assert.deepEqual(personName('山田\u3000\u3000太郎'), { ok: true, value: '山田\u3000太郎' });
});

test('THE SCRIPTS THAT NEED A JOINER, EMOJI SEQUENCES AND ACCENTED NAMES STILL ARRIVE AS TYPED', () => {
  for (const [what, name] of KEPT) assert.deepEqual(personName(name), { ok: true, value: name }, what);
});
