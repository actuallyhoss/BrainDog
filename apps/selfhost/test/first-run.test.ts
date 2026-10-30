import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { claimUrl, degradeLines, setupLine } from '../src/first-run.ts';

const dir = (passkey: boolean, email: string | null) =>
  ({
    one: (q: string) => (q.includes('dir_passkey') ? (passkey ? { x: 1 } : undefined) : email ? { email } : undefined),
  }) as never;

const place = () => {
  const folder = mkdtempSync(join(tmpdir(), 'braindog-claim-'));
  return { folder, file: join(folder, 'claim-link'), read: 'cat claim-link' };
};

test('THE CLAIM LINK GOES TO A 0600 FILE AND NEVER INTO THE LINE, until the owner has a passkey', async () => {
  const auth = async () => ({ status: 200, mail: { claimToken: 'tok-secret' } });
  const p = place();
  try {
    const line = await setupLine({ dir: dir(false, 'ada@example.com'), auth, origin: 'http://localhost:8080', signInOff: null, file: p.file, read: p.read });
    assert.ok(line !== null);
    assert.ok(!line.includes('tok-secret'), 'the log line carried the link');
    assert.ok(line.includes(p.file) && line.includes('cat claim-link'), line);
    assert.equal(readFileSync(p.file, 'utf8'), 'http://localhost:8080/signin#claim=tok-secret\n');
    if (process.platform !== 'win32') assert.equal(statSync(p.file).mode & 0o777, 0o600);
    assert.equal(claimUrl('http://x', 'a'), 'http://x/signin#claim=a');

    /* A PASSKEY ENDS IT, AND THE FILE GOES WITH IT. */
    assert.equal(await setupLine({ dir: dir(true, 'ada@example.com'), auth, origin: 'http://x', signInOff: null, ...p }), null);
    assert.ok(!existsSync(p.file), 'the link stayed on disk after a passkey existed');
    assert.equal(await setupLine({ dir: dir(false, null), auth, origin: 'http://x', signInOff: null, ...p }), null);
  } finally {
    rmSync(p.folder, { recursive: true, force: true });
  }
});

test('A TERMINAL OF THE PERSON\'S OWN ALSO SHOWS THE LINK, and the log line still does not', async () => {
  const auth = async () => ({ status: 200, mail: { claimToken: 'tok-secret' } });
  const p = place();
  const shown: string[] = [];
  try {
    const line = await setupLine({ dir: dir(false, 'ada@example.com'), auth, origin: 'http://localhost:8080', signInOff: null, ...p, tty: (l) => void shown.push(l) });
    assert.match(shown.join('\n'), /http:\/\/localhost:8080\/signin#claim=tok-secret/);
    assert.ok(!(line ?? '').includes('tok-secret'));
  } finally {
    rmSync(p.folder, { recursive: true, force: true });
  }
});

test('A LINK THAT CANNOT BE WRITTEN IS NOT PRINTED INSTEAD', async () => {
  const auth = async () => ({ status: 200, mail: { claimToken: 'tok-secret' } });
  const line = await setupLine({ dir: dir(false, 'ada@example.com'), auth, origin: 'http://x', signInOff: null, file: join(tmpdir(), 'no-such-folder-braindog', 'claim-link'), read: 'cat' });
  assert.ok(line !== null && !line.includes('tok-secret'));
  assert.match(line, /could not be written/);
});

test('AN OPEN LOOPBACK HOST SAYS WHERE TO OPEN AND MINTS NOTHING', async () => {
  const auth = async () => assert.fail('no link is minted');
  const p = place();
  try {
    const line = await setupLine({ dir: dir(false, 'a@b.c'), auth, origin: 'http://localhost:8080', signInOff: 'open', ...p });
    assert.match(line ?? '', /open http:\/\/localhost:8080/);
  } finally {
    rmSync(p.folder, { recursive: true, force: true });
  }
});

test('EACH SERVICE THAT IS OFF IS A PLAIN LINE, NEVER AN ERROR', () => {
  const off = degradeLines({}, false).join('\n');
  for (const word of ['mail: off', 'model: off', 'billing: off', 'turnstile: off']) assert.ok(off.includes(word), word);
  const on = degradeLines({ SLASH_FALLBACK_ENDPOINT: 'https://m', SLASH_FALLBACK_MODEL: 'm', SLASH_FALLBACK_KEY: 'k' }, true).join('\n');
  assert.ok(!on.includes('mail: off') && !on.includes('model: off'));
});
