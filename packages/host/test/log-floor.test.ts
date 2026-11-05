/**
 * Nothing shaped like a key reaches a log, whoever wrote the line.
 *
 * THE FAULT THIS HOLDS: a scrub's pattern overflowed the regular expression stack, the runtime's sentence quoted the
 * pattern, and the pattern held a key in base64, so the key went to the Worker's logs through an `e.message` nobody had
 * looked at. Every key below is put together at run time, so this file is not a finding of the repository's own scan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { floored, flooredError, installLogFloor, LINE_MOST, messageOf, reasonOf, type LogTarget } from '../src/log-floor.ts';
import { crashed } from '../src/crash.ts';

const random = 'Q7d9Xk2Lm4Zp8Rt6Vb3Nc1Hs5Jf0Gw2Y';
const shapes: readonly (readonly [string, string])[] = [
  ['a card processor key', `sk_${'live'}_${random}`],
  ['a restricted key', `rk_${'live'}_${random}`],
  ['a webhook secret', `whsec_${random}`],
  ['a code host token', `gh${'p'}_${random}abc`],
  ['a chat bot token', `xox${'b'}-1234567890-${random}`],
  ['a model key', `sk-${'ant'}-${random}`],
  ['a cloud key', `AK${'IA'}ABCDEFGHIJKLMNOP`],
  ['a signed token', `ey${'J'}hbGciOiJIUzI1.eyJzdWIiOiIx.${random}`],
  ['a bearer on the wire', `rec_01ABCDEF.${random}`],
  ['a backup identity', `AGE-${'SECRET'}-KEY-1${random.toUpperCase()}AAAAAAAAAA`],
  ['base64 of a key', Buffer.from(`a metrics key ${random}`).toString('base64')],
  ['hex of a key', Buffer.from(random).toString('hex')],
];

for (const [name, key] of shapes)
  test(`${name} does not reach a log, in a sentence or as a value`, () => {
    for (const line of [`could not reach the host with ${key} just now`, JSON.stringify({ op: 'crash', error: `refused ${key}` })]) {
      const kept = floored(line);
      assert.ok(!kept.includes(key), `${name} survived`);
    }
  });

test('A RUNTIME THAT QUOTES ITS PATTERN quotes nothing: the sentence that carried a key to the logs', () => {
  const inPieces = Array.from({ length: 60 }, (_, i) => `(?:${random.slice(i % 8, (i % 8) + 3)})`).join('|');
  const said = `Invalid regular expression: /${inPieces}/gu: Stack overflow`;
  const kept = floored(said);
  assert.ok(kept.startsWith('Invalid regular expression:'), 'the kind of fault is still said');
  assert.ok(!kept.includes(inPieces.slice(0, 40)), 'the pattern stayed');
  assert.ok(!kept.includes('(?:'), 'a piece of the pattern stayed');
});

test('an address is asked without its query and its login, and a name saying "key" loses what follows', () => {
  const key = `abcdef${random}`;
  assert.equal(floored(`fetch failed: https://api.example/v1/run?key=${key}&x=1 refused`), 'fetch failed: https://api.example/v1/run?[struck] refused');
  assert.equal(floored(`postgres://user:${key}@db.example/x`), 'postgres://[struck]@db.example/x');
  assert.ok(!floored(`Authorization: Bearer ${key}`).includes(key));
  assert.equal(floored(`{"token":"s3cret-value"}`), '{"token":"[struck]"}');
  assert.equal(floored(`password=hunter2hunter2`), 'password=[struck]');
  assert.equal(floored(`-----BEGIN ${'PRIVATE'} KEY-----\nMIIE\n-----END ${'PRIVATE'} KEY-----`), '[struck]');
});

test('a person is not named, as `oplog` already holds for its own fields', () => {
  assert.equal(floored('row alice@example.com not authorized'), 'row [an address] not authorized');
});

test('WHAT DIAGNOSES A FAULT IS KEPT: a reference, a record, a path, a code and a sentence', () => {
  const ref = '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b';
  const line = JSON.stringify({ op: 'crash', ref, where: '/api/boot', rec: 'rec_01HZY8K9Q2X7M4N6P0R3S5T7V9', error: 'SQLITE_BUSY: database is locked' });
  assert.equal(floored(line), line);
  const path = 'apps/worker/src/some/long/folder/without/any/figure/in/it.ts failed';
  assert.equal(floored(path), path);
  assert.equal(floored('token expired, so nothing was sent'), 'token expired, so nothing was sent');
  assert.equal(floored('rewrapKeys: 18 rows walked'), 'rewrapKeys: 18 rows walked');
});

test('a thrown message holding a whole body is cut before anything reads it, and this stays quick', () => {
  const body = `${'word '.repeat(200_000)}`;
  const began = Date.now();
  const kept = floored(body);
  assert.ok(kept.length <= LINE_MOST + 3);
  assert.ok(Date.now() - began < 500, 'a long line must not take long');
  const worst = floored('a'.repeat(1_000_000));
  assert.ok(worst.length <= LINE_MOST + 3);
});

test('a key past the cut is gone with the cut, and one across it leaves no usable piece', () => {
  const key = Buffer.from(random.repeat(4)).toString('base64');
  const kept = floored(`${'x '.repeat(Math.floor(LINE_MOST / 2) - 10)}${key}`);
  assert.ok(!kept.includes(key.slice(0, 20)));
});

test('reasonOf never throws and floors what it reads', () => {
  const hostile = { toString() { throw new Error('no'); } };
  assert.match(reasonOf(hostile), /could not be turned into text/u);
  const key = `sk_${'live'}_${random}`;
  assert.ok(!reasonOf(new Error(`refused ${key}`)).includes(key));
  assert.equal(reasonOf('plain'), 'plain');
});

test('THE CONSOLE ITSELF IS FLOORED: every method, every argument, an Error and an object, and installing twice wraps once', () => {
  const lines: unknown[][] = [];
  const target: LogTarget = { error: (...said) => void lines.push(said), log: (...said) => void lines.push(said) };
  installLogFloor(target);
  const first = target.error;
  installLogFloor(target);
  assert.equal(target.error, first);
  const key = `sk_${'live'}_${random}`;
  target.error?.('slash:', `refused ${key}`);
  target.error?.(new Error(`refused ${key}`));
  target.log?.({ headers: { authorization: `Bearer ${key}` } });
  target.log?.(7, true, null);
  assert.equal(lines.length, 4);
  assert.ok(!JSON.stringify(lines).includes(key));
  assert.deepEqual(lines[3], [7, true, null]);
});

test('a crash line and what is mailed from it hold no key, on a host that installed nothing', () => {
  const key = `sk_${'live'}_${random}`;
  const lines: string[] = [];
  const out = crashed('/api/boot', new Error(`Invalid regular expression: /${key}/: Stack overflow`), (line) => void lines.push(line));
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]!.includes(key));
  assert.ok(!JSON.stringify(out).includes(key));
});

test('AN ERROR THROWN ON IS THE SAME ERROR, with its flags, and its message and stack hold no key', () => {
  const key = `sk_${'live'}_${random}`;
  const e = Object.assign(new Error(`refused ${key}`), { retryable: true });
  const on = flooredError(e);
  assert.equal(on, e);
  assert.equal((on as unknown as { retryable: boolean }).retryable, true);
  assert.ok(!on.message.includes(key));
  assert.ok(!(on.stack ?? '').includes(key));
  assert.ok(!flooredError(`refused ${key}`).message.includes(key));
});

test('a sentence told to a caller is the thrown message with no key in it, and no error name added', () => {
  const key = `sk_${'live'}_${random}`;
  assert.equal(messageOf(new Error('the model is busy')), 'the model is busy');
  assert.ok(!messageOf(new Error(`refused ${key}`)).includes(key));
  assert.ok(!messageOf(`refused ${key}`).includes(key));
});
