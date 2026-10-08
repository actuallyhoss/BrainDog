/**
 * `resources/list` draws a record's pages a few at a time (`pooled`, inside `tools`), so a record of fifty pages is not
 * fifty round trips one after another. It is a closure, so it is read through `resources()`, over a stub whose `page`
 * counts how many draws are in flight.
 *
 * THREE THINGS ARE HELD: no more than eight at once, the pages listed in the order the record gave them however the
 * draws finish, and a draw that throws failing the listing rather than leaving it pending or quietly short.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/index.ts';
import { handle } from '../src/rpc.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
const PAGES = Array.from({ length: 20 }, (_, i) => ({ slug: `page-${i}`, title: `Page ${i}` }));
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A surface whose pages each take a while to draw, the later ones less, so they finish out of order. */
function counted(throwsAt?: string) {
  const seen = { now: 0, most: 0, drawn: [] as string[] };
  const { surface } = stub({
    pages: async () => ({ ok: true, value: PAGES }),
    page: async (args) => {
      const { slug } = args as { slug: string };
      seen.now += 1;
      seen.most = Math.max(seen.most, seen.now);
      try {
        await wait(2 + (PAGES.length - PAGES.findIndex((p) => p.slug === slug)));
        if (slug === throwsAt) throw new Error(`the read of ${slug} failed`);
        seen.drawn.push(slug);
        return { ok: true, value: { blocks: [] } };
      } finally {
        seen.now -= 1;
      }
    },
  });
  return { surface, seen };
}

test('NO MORE THAN EIGHT PAGES ARE DRAWN AT ONCE, and every one is drawn', async () => {
  const { surface, seen } = counted();
  await tools(surface).resources(ctx);
  assert.equal(seen.most, 8, `${seen.most} pages were drawn at once`);
  assert.equal(seen.drawn.length, PAGES.length);
  /* THE DRAWS REALLY FINISHED OUT OF ORDER, or the order below would prove nothing. */
  assert.notDeepEqual(seen.drawn, PAGES.map((p) => p.slug));
});

test('THE PAGES ARE LISTED IN THE ORDER THE RECORD GAVE THEM, however their draws finish', async () => {
  const { surface } = counted();
  const listed = (await tools(surface).resources(ctx)).map((r) => r.uri).filter((uri) => uri.startsWith('braindog:page/'));
  assert.deepEqual(listed, PAGES.map((p) => `braindog:page/${p.slug}`));
});

test('A DRAW THAT THROWS FAILS THE LISTING, and over the wire that is -32603 with a reference', async (t) => {
  /* The host's log is where the error goes, and it is not what this test reads. */
  t.mock.method(console, 'error', () => {});
  const { surface } = counted('page-5');
  await assert.rejects(tools(surface).resources(ctx), /the read of page-5 failed/);

  const { surface: again } = counted('page-5');
  const reply = await handle({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, again, ctx);
  assert.ok(reply && 'error' in reply, JSON.stringify(reply));
  assert.equal(reply.error.code, -32603);
  assert.equal(reply.error.message, 'internal');
  assert.doesNotMatch(JSON.stringify(reply), /page-5/, 'the exception text crossed the wire');
});
