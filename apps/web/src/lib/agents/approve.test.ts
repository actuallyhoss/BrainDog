/**
 * The approve page's words and boxes (`approve.ts`): who is asking, said as the command and the machine; what it may
 * do; the six boxes; and what a keystroke or a paste leaves in the field.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { copy } from '../copy.ts';
import { askerOf, canOf, cellsOf, enteredOf, minutesLeft } from './approve.ts';

/* An invented machine; never a real one's name. */
const MACHINE = 'Larkspur';

test('who is asking is the command that was run, on the machine it ran on', () => {
  assert.equal(askerOf(`${MACHINE} · braindog-cli · export`, 'export'), `braindog export on ${MACHINE}`);
  assert.equal(askerOf(`${MACHINE} · braindog-cli`, 'login'), `braindog login on ${MACHINE}`);
  assert.equal(askerOf(`${MACHINE} · braindog-cli · runner`, 'runner'), `braindog runner on ${MACHINE}`);
  /* Setup makes an agent its key, and the agent is named, not the command. */
  assert.equal(askerOf(`${MACHINE} · Claude Code · token`, 'token'), `Claude Code on ${MACHINE}`);
  /* A label written some other way is said as written; none is a machine with no name. */
  assert.equal(askerOf('Studio laptop', 'login'), 'Studio laptop');
  assert.equal(askerOf(null, 'login'), copy.unnamedMachine);
  assert.equal(askerOf('  ', 'login'), copy.unnamedMachine);
});

test('what it may do is the reach\'s own sentence, as a sentence', () => {
  assert.equal(canOf('export', null), 'Take one copy of your BrainDog, once, in the next ten minutes.');
  assert.match(canOf('vault', '*'), /seven days\.$/u);
  assert.match(canOf('vault', 'p_01'), /thirty days\.$/u);
});

test('minutes left round up and never go below nothing', () => {
  const now = Date.parse('2026-10-22T10:00:00Z');
  assert.equal(minutesLeft('2026-10-22T10:09:01Z', now), 10);
  assert.equal(minutesLeft('2026-10-22T10:00:30Z', now), 1);
  assert.equal(minutesLeft('2026-10-22T09:59:00Z', now), 0);
});

test('the six boxes draw the digits, in either spelling the terminal prints', () => {
  assert.deepEqual(cellsOf(''), ['', '', '', '', '', '']);
  assert.deepEqual(cellsOf('325'), ['3', '2', '5', '', '', '']);
  assert.deepEqual(cellsOf('325 684'), ['3', '2', '5', '6', '8', '4']);
  assert.deepEqual(cellsOf('325684'), ['3', '2', '5', '6', '8', '4']);
  /* Something that is not a code draws no digit at all, rather than the digits picked out of it. */
  assert.deepEqual(cellsOf('32a'), ['', '', '', '', '', '']);
});

test('the sixth digit sends the code, once, and seven or a letter is refused and not taken', () => {
  assert.deepEqual(enteredOf('32568', '325684'), { typed: '325684', refused: false, send: true });
  assert.deepEqual(enteredOf('', '325 684'), { typed: '325684', refused: false, send: true });
  assert.deepEqual(enteredOf('', '325'), { typed: '325', refused: false, send: false });
  /* The same six held again after a refusal wait for the press. */
  assert.deepEqual(enteredOf('325684', '325684'), { typed: '325684', refused: false, send: false });
  /* Never trimmed into a different code: the field keeps what it held. */
  assert.deepEqual(enteredOf('325684', '3256841'), { typed: '325684', refused: true, send: false });
  assert.deepEqual(enteredOf('32', '32x'), { typed: '32', refused: true, send: false });
});

/* ── where it is drawn ─────────────────────────────────────────────────── */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the page the terminal prints draws the boxes at their lead size, focused, on the owner\'s arm', () => {
  const src = read('../../routes/connect/approve/+page.svelte');
  assert.match(src, /<CodeForm id="user-code" size="lead" autofocus /u);
  assert.match(src, /\{#if !owner\}/u);
  /* Approved says what, in words, and what happens next. */
  assert.match(src, /askerOf\(done\.label, done\.reach\)/u);
  assert.match(src, /copy\.approvedNext/u);
});

test('the page is drawn bare and spared the first-run redirect, as the consent screen is', () => {
  assert.match(read('../../routes/+layout.ts'), /inner === '\/connect\/approve'/u);
  assert.match(read('../shell/AppFrame.svelte'), /at === '\/connect\/approve'/u);
});
