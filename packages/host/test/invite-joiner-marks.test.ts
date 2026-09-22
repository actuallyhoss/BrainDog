/**
 * A joiner between marks, and the joining scripts the list left out. `loop/research-batch-eighteen-audit.md` findings
 * 1 and 8, on `personName` (`packages/host/src/invite.ts`).
 *
 * A JOINER ENDED A RUN OF MARKS, AND THE NEXT MARK STARTED A NEW ONE. `bd928ffe` refused seven marks in a row and kept a
 * joiner after any character of a joining script, marks included, so a ZWJ after every sixth candrabindu reset the
 * count: the audit stored one Devanagari letter carrying 84 of them (99 code points), one Arabic letter carrying 84
 * harakat split by ZWNJ, and `Bo`, sixty harakat and `Tanner`. The count now runs through a joiner, so it is marks per
 * letter however many joiners sit between them.
 *
 * AND ADLAM AND HANIFI ROHINGYA WERE REFUSED A JOINER. Both are cursive scripts with living users (Fula, Rohingya), and
 * a joiner is spelling there as it is in Arabic, but neither was on the list, so `bd928ffe` newly refused both.
 *
 * A TRAILING EMOJI ZWJ WAS UNTESTED. The checker of `bd928ffe` noted it: the emoji branch needs a pictograph after the
 * joiner, so a ZWJ at the end of an emoji sequence is refused, and nothing proved it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { personName } from '../src/invite.ts';

const REFUSED: [string, string][] = [
  ['one Devanagari letter, 84 candrabindu split by ZWJ every 6', `क${`${'ँ'.repeat(6)}\u200d`.repeat(14)}`],
  ['one Arabic letter, 84 harakat split by ZWNJ every 6', `ب${`${'ً'.repeat(6)}\u200c`.repeat(14)}`],
  ['a Latin name with Arabic marks and ZWNJ between', `Bo${`${'ً'.repeat(6)}\u200c`.repeat(10)}Tanner`],
  ['seven marks with one joiner among them', `क${'ँ'.repeat(3)}\u200d${'ँ'.repeat(4)}`],
  ['an emoji with a trailing ZWJ', '\u{1F468}\u200d'],
  ['a name ending in an emoji with a trailing ZWJ', 'Bo \u{1F468}\u200d\u{1F469}\u200d'],
  ['an emoji ZWJ onto a Latin letter', '\u{1F468}\u200dBo'],
  /* ONE BORROWED MARK MADE A LATIN NAME A JOINING ONE. `7f6610bd` asked the script of the character before the joiner,
     so a single haraka, candrabindu or Adlam mark on `b` passed as Arabic, Devanagari or Adlam, and the joiner after it
     split `Bob` from `Smith` unseen (`loop/research-batch-twenty-audit.md` finding 7). The Adlam line was refused
     before `7f6610bd` put Adlam on the list. */
  ['Bob, one Arabic haraka, ZWNJ, Smith', 'Bob\u064b\u200cSmith'],
  ['Bob, one Devanagari mark, ZWJ, Smith', 'Bob\u0901\u200dSmith'],
  ['Bob, one Adlam mark, ZWJ, Smith', 'Bob\u{1E944}\u200dSmith'],
  ['Bob, two Arabic harakat, ZWNJ, Smith', 'Bob\u064b\u064e\u200cSmith'],
];

const KEPT: [string, string][] = [
  ['Adlam with a joiner', '\u{1E900}\u200d\u{1E901}'],
  ['Adlam with a non-joiner', '\u{1E900}\u{1E922}\u200c\u{1E901}'],
  ['Hanifi Rohingya with a joiner', '\u{10D00}\u200d\u{10D01}'],
  ['Hanifi Rohingya with a non-joiner', '\u{10D00}\u200c\u{10D01}'],
  /* SIX MARKS ON EACH OF TWO LETTERS, a joiner between, is two letters' worth and not one letter's twelve. */
  ['six marks, a joiner, a letter, six marks', `क${'ँ'.repeat(6)}\u200dक${'ँ'.repeat(6)}`],
  ['Persian with a non-joiner after a vowel mark', 'مِ\u200cر'],
  ['a Malayalam chillu', 'ന്\u200d'],
  /* AND A JOINING SCRIPT'S OWN MARKS STILL CARRY A JOINER, since the base under them is of the script. */
  ['Adlam with a mark and a joiner', '\u{1E900}\u{1E944}\u200d\u{1E901}'],
  ['Hanifi Rohingya with a mark and a non-joiner', '\u{10D00}\u{10D24}\u200c\u{10D01}'],
  ['Arabic with two harakat and a non-joiner', '\u0628\u064b\u064e\u200c\u0631'],
  ['Devanagari with a virama and a joiner', '\u0915\u094d\u200d\u0937'],
  ['an emoji family', '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}'],
];

test('A JOINER DOES NOT RESET THE COUNT OF MARKS, AND A TRAILING EMOJI ZWJ IS REFUSED at `name`', () => {
  for (const [what, name] of REFUSED) {
    const out = personName(name);
    assert.equal(out.ok, false, `${what} (${[...name].length} code points) was stored as ${JSON.stringify(out.ok && out.value)}`);
    assert.ok(!out.ok && 'refusal' in out, what);
    assert.equal(out.refusal.code, 'VALUE_MALFORMED', what);
    assert.equal(out.refusal.at, 'name', what);
  }
});

test('ADLAM AND HANIFI ROHINGYA KEEP THEIR JOINERS, AND SIX MARKS PER LETTER STILL ARRIVE AS TYPED', () => {
  for (const [what, name] of KEPT) assert.deepEqual(personName(name), { ok: true, value: name }, what);
});
