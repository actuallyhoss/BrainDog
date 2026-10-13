/**
 * HOME'S MARK IS SENT IN THE TURN THE READER LEAVES. Home fetched `news-live.ts` inside its leave, and a closing tab
 * does not wait for a module: `pagehide` ran, the import never answered, and what was new stayed new at the next
 * visit. `markAll` is imported with the screen now, and nothing is awaited between the leave and the client's fetch.
 *
 * A TEXT TEST OVER THE PART for the import, since a component does not load under `node --test`; the leave itself is
 * run here against `stampOf` and `markAll`, in the order Home calls them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampOf } from '../page/read-mark.ts';
import { forget } from '../record/boot-live.ts';
import { markAll } from '../record/news-live.ts';

const BASE = 'https://record.test';

/** Home's script without its comments, so a comment quoting a call cannot fail or pass a check. */
const home = readFileSync(new URL('./Home.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('Home imports markAll with the screen, never inside the leave', () => {
  assert.match(home, /^\s*import \{[^}]*\bmarkAll\b[^}]*\} from '\$lib\/record\/news-live\.ts';$/mu);
  assert.doesNotMatch(home, /import\(\s*'\$lib\/record\/news-live\.ts'\s*\)/u, 'the mark waits on a module again');
  assert.match(home, /stampOf\(\(upTo\) => markAll\(base, upTo\)\)/u);
  assert.equal(home.split('markAll(').length - 1, 1, 'the mark is sent by the stamp alone');
});

test('the leave has reached the record before it returns, with a request that outlives the page', async () => {
  forget();
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, value: { upTo: 9, seen_at: '2026-09-15T09:00:00.000Z' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const stamp = stampOf((upTo) => markAll(BASE, upTo, io));

  const landing = stamp.leave(9);
  /* NO AWAIT ABOVE THIS LINE. A closing tab runs `pagehide` to its end and nothing after it. */
  assert.equal(sent.length, 1, 'nothing was sent in the turn the reader left');
  assert.equal(new URL(sent[0]!.url).pathname, '/api/markRead');
  assert.equal(sent[0]!.init?.method, 'POST');
  assert.equal(sent[0]!.init?.keepalive, true, 'a plain fetch of a closing page is cancelled');
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { upTo: 9 });

  assert.equal(await landing, true);
  assert.equal(await stamp.leave(9), false, 'one mark a visit');
  assert.equal(sent.length, 1);
  forget();
});

test('a send that waits on a module first has sent nothing when the leave returns', async () => {
  /* What Home did, kept as the measure: the same stamp over a dynamic import sends nothing in the turn. */
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(String(url));
    return new Response(JSON.stringify({ ok: true, value: { upTo: 9, seen_at: null } }), { status: 200 });
  }) as typeof fetch;
  const late = stampOf((upTo) => import('../record/news-live.ts').then((m) => m.markAll(BASE, upTo, io)));
  const landing = late.leave(9);
  assert.equal(sent.length, 0);
  await landing;
  assert.equal(sent.length, 1);
  forget();
});
