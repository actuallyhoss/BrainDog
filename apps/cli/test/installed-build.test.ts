/**
 * The bridge's look at the installed command (H27): a session opened before `braindog update` is told once that a newer
 * command is installed, read off the bundle's own `cliBuild`, and never on a checkout or an older or the same build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOOK_EVERY_MS, buildInBundle, newerSaid, watchInstalled } from '../src/installed-build.ts';

const bundle = (build: string) => `var a = 1;\n    cliBuild = () => true ? "${build}" : "dev+0000000";\nvar b = "2026.01.01+1234567";\n`;

test('THE BUILD IS READ OFF cliBuild, not off any build-like text in the bundle', () => {
  assert.equal(buildInBundle(bundle('2026.10.23+ae3f232')), '2026.10.23+ae3f232');
  assert.equal(buildInBundle('const x = "2026.10.23+ae3f232";'), null);
  assert.equal(buildInBundle(''), null);
});

test('SAID ONCE WHEN THE FILE MOVES TO A NEWER BUILD, at most one look a minute, then never again', () => {
  let now = 0;
  let mtime = 1;
  let text = bundle('2026.10.22+c6504b3');
  let reads = 0;
  const check = watchInstalled({
    file: '/x/braindog.mjs',
    mine: '2026.10.22+c6504b3',
    now: () => now,
    stat: () => ({ mtimeMs: mtime }),
    read: () => (reads++, text),
  });
  assert.equal(check(), null, 'the file has not moved');
  assert.equal(reads, 0, 'an unmoved file was read');
  mtime = 2;
  text = bundle('2026.10.23+ae3f232');
  now += 1_000;
  assert.equal(check(), null, 'looked twice inside a minute');
  now += LOOK_EVERY_MS;
  assert.equal(check(), newerSaid('2026.10.22+c6504b3', '2026.10.23+ae3f232'));
  assert.match(newerSaid('2026.10.22+c6504b3', '2026.10.23+ae3f232'), /installed \(2026\.10\.23\); this session still runs 2026\.10\.22\. Start a new session/u);
  mtime = 3;
  now += LOOK_EVERY_MS;
  assert.equal(check(), null, 'said twice');
});

test('NOTHING FOR A CHECKOUT, THE SAME BUILD, AN OLDER ONE, OR A FILE THAT IS GONE', () => {
  const at = (mine: string, installed: string, stat?: () => { mtimeMs: number }) => {
    let mtime = 1;
    let now = 0;
    const check = watchInstalled({ file: '/x', mine, now: () => now, stat: stat ?? (() => ({ mtimeMs: mtime })), read: () => bundle(installed) });
    mtime = 2;
    now += LOOK_EVERY_MS;
    return check();
  };
  assert.equal(at('dev+0000000', '2026.10.23+ae3f232'), null);
  assert.equal(at('2026.10.23+ae3f232', '2026.10.23+ae3f232'), null);
  assert.equal(at('2026.10.23+ae3f232', '2026.10.22+c6504b3'), null);
  assert.equal(
    at('2026.10.22+c6504b3', '2026.10.23+ae3f232', () => {
      throw new Error('ENOENT');
    }),
    null,
  );
});
