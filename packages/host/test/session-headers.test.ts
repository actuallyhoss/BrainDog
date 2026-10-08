/**
 * The command's build, read off every call (AGT-B01, batch 37): `x-braindog-cli` is a date or `dev` and a commit, kept when
 * it has that shape and dropped when it does not, on the headers and over `/mcp`'s `_meta.session` alike.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HINTS, hintsOf, sessionOf } from '../src/session.ts';

const said = (cli: string) => sessionOf(new Headers({ 'x-braindog-cli': cli, 'x-braindog-session': 'S4' }));

test('THE HEADER IS x-braindog-cli', () => {
  assert.equal(HINTS.cli.header, 'x-braindog-cli');
});

test('A GOOD BUILD IS KEPT: a dated build and a dev build, short or full commit', () => {
  for (const cli of ['2026.10.09+abc1234', 'dev+0123456789abcdef0123456789abcdef01234567', 'dev+deadbee']) {
    assert.deepEqual(said(cli), { spoken: 'S4', cli });
    assert.deepEqual(hintsOf({ cli }), { cli });
  }
});

test('A BAD BUILD IS DROPPED, and the call keeps its other hints', () => {
  for (const cli of ['2026.10.09', '2026-10-09+abc1234', 'beta+abc1234', 'dev+ABC1234', 'dev+abc12', '2026.10.09+abc1234\x07', `dev+${'a'.repeat(41)}`]) {
    assert.deepEqual(said(cli), { spoken: 'S4' }, cli);
    assert.deepEqual(hintsOf({ cli }), {}, cli);
  }
  assert.deepEqual(hintsOf({ cli: 20261009 }), {});
});
