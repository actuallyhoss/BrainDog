/* THE SEED ANSWERS THE SWITCHER'S QUESTION. The shell asks `GET /account/records` on every screen, and a 404 there put
   one failed request and two console errors in every seed picture. The row is the record `boot` says is open. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { open } from '../sources/seed.mjs';

test('the seed lists its one record, the one boot opens, as a host does', async () => {
  const source = await open();
  const server = createServer((req, res) => source.handle(req, res, new URL(req.url ?? '/', 'http://x')));
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const at = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${at}/account/records`, { headers: { accept: 'application/json' } });
    assert.equal(res.status, 200);
    const boot = (await (await fetch(`${at}/api/boot`)).json()).value.record;
    assert.deepEqual(await res.json(), { ok: true, value: [{ slug: boot.slug, name: boot.name, level: 'owner' }] });
  } finally {
    await new Promise((done) => server.close(done));
    await source.close();
  }
});
