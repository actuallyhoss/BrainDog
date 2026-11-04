/**
 * A record's object reads what it was sent before it answers, whichever answer it gives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { drained } from '../src/route.ts';

test('AN UNREAD BODY IS READ TO ITS END BEFORE THE ANSWER IS HANDED BACK', async () => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      if (pulled > 3) controller.close();
      else controller.enqueue(new Uint8Array([1, 2, 3]));
    },
  });
  const request = new Request('https://app.example/api/nope', { method: 'POST', body, duplex: 'half' } as RequestInit);
  const answer = new Response('{}', { status: 404 });
  assert.equal(await drained(request, answer), answer);
  assert.ok(request.bodyUsed, 'the body was left unread');
  assert.ok(pulled > 3, 'the body was not read to its end');

  // A body already read, and no body at all, are answered as they are.
  const read = new Request('https://app.example/api/boot', { method: 'POST', body: '{}' });
  await read.text();
  assert.equal((await drained(read, answer)).status, 404);
  assert.equal((await drained(new Request('https://app.example/api/boot'), answer)).status, 404);
});

test('AND THE RECORD\'S OBJECT ANSWERS THROUGH IT', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');
  assert.match(source, /override async fetch\(request: Request\): Promise<Response> \{[\s\S]{0,700}?let out: Response;\s*try \{\s*out = await this\.#answer\(request\);[\s\S]{0,900}?return drained\(request, out\);/);
});
