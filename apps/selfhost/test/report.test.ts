/**
 * A report key over a real socket: minted with the server key, used by a project with curl's own request, and
 * refused by every other route in the table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES } from '@braindog/host';
import { start } from '../src/server.ts';

const POINTS = {
  id: 'register.points',
  kind: 'register' as const,
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'project', type: 'text' },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/** Obviously not a real key. */
const SERVER_KEY = 'fake-server-key-for-tests';

test('A PROJECT REPORTS WITH ITS KEY OVER HTTP, AND THE KEY OPENS NOTHING ELSE', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-report-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, token: SERVER_KEY });
  const port = (running.server.address() as { port: number }).port;
  const post = async (name: string, body: unknown, bearer: string) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/${name}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Answer };
  };
  try {
    assert.ok(
      running.api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
    );
    assert.ok((await running.api.kernel.install([POINTS])).ok);

    const minted = await post('createReportKey', { register: 'points', fixed: { project: 'fake-project' }, stamp: 'at', name: 'Fake project' }, SERVER_KEY);
    assert.equal(minted.status, 200, JSON.stringify(minted.body));
    const bearer = (minted.body.value as { bearer: string }).bearer;

    const one = await post('report', { name: 'Monthly recurring revenue', value: 4200, unit: 'GBP' }, bearer);
    assert.equal(one.status, 200, JSON.stringify(one.body));
    const batch = await post('report', { rows: [{ name: 'Sign-ups', value: 12 }, { name: 'Sign-ups', value: 15 }] }, bearer);
    assert.equal(batch.status, 200, JSON.stringify(batch.body));
    assert.equal((batch.body.value as { written: unknown[] }).written.length, 2);

    const rows = await post('list', { register: 'points' }, SERVER_KEY);
    assert.equal((rows.body.value as { rows: unknown[] }).rows.length, 3);

    /* EVERY OTHER ROUTE, AS A POST, and none of them answers. Every one is 403 but `log`, which checks its
       arguments before it asks who is calling, and answers 422 with nothing from the record in it. */
    for (const route of ROUTES) {
      if (route.name === 'report') continue;
      const said = await post(route.name, { register: 'points', seq: 1 }, bearer);
      assert.equal(said.body.ok, false, `${route.name} answered a report key`);
      assert.equal(said.status, route.name === 'log' ? 422 : 403, `${route.name} answered ${said.status}`);
    }

    /* And what the owner sees afterwards: one key, bound to points. */
    const keys = await post('reportKeys', {}, SERVER_KEY);
    assert.equal(keys.status, 200);
    assert.deepEqual((keys.body.value as { register: string }[]).map((k) => k.register), ['points']);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
