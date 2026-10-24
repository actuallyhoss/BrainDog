/** `ref-rows.ts`: one walk of a list for the tab, shared while out, kept until the list or this tab's writes move. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createClient } from '@braindog/client';

import { forgetRows, rowsOf, rowsSaid } from './ref-rows.ts';
import { heardLocal } from './local-tab.ts';

const row = (seq: number) => ({ id: `r${seq}`, seq, fields: { name: `Row ${seq}` }, version: 1, created_at: '2026-10-20T00:00:00Z' });

function lister(pages: number) {
  let asked = 0;
  let refuse = false;
  const client = {
    async list(args: { register: string; cursor?: string | null }) {
      asked += 1;
      if (refuse) return { ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'You may not read this list.' } };
      const at = args.cursor ? Number(args.cursor) : 0;
      return { ok: true as const, value: { rows: [row(at + 1)], cursor: at + 1 < pages ? String(at + 1) : null, matched: pages } };
    },
  };
  return { client: client as never, asked: () => asked, refuse: (on: boolean) => (refuse = on) };
}

test('A LIST IS WALKED ONCE FOR THE TAB, whoever asks and whether or not the walk is still out', async () => {
  forgetRows();
  const l = lister(3);
  const [a, b] = await Promise.all([rowsOf(l.client, 'https://a', 'projects'), rowsOf(l.client, 'https://a', 'projects')]);
  assert.equal(a?.length, 3);
  assert.equal(a, b);
  await rowsOf(l.client, 'https://a', 'projects');
  assert.equal(l.asked(), 3, 'three pages, walked once');
  await rowsOf(l.client, 'https://b', 'projects');
  assert.equal(l.asked(), 6, 'another record walks its own');
});

test('A WRITE THIS TAB SENDS WALKS AGAIN, a refusal is handed back and never kept, and forget drops every walk', async () => {
  forgetRows();
  const l = lister(1);
  await rowsOf(l.client, 'https://a', 'projects');
  /* A WRITE through the client, whose count the walk is kept under (`wrote`). */
  const io = (async () => Response.json({ ok: true, value: {} })) as typeof fetch;
  await createClient({ base: 'https://a', fetch: io }).create({ register: 'projects', fields: { name: 'x' } });
  await rowsOf(l.client, 'https://a', 'projects');
  assert.equal(l.asked(), 2);
  l.refuse(true);
  forgetRows();
  const out = await rowsSaid(l.client, 'https://a', 'projects');
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.refusal.code, 'FORBIDDEN');
  l.refuse(false);
  assert.equal((await rowsOf(l.client, 'https://a', 'projects'))?.length, 1, 'the refusal was not kept');
});

test('A WALK SENT BEFORE ANY VERSION WAS HEARD STANDS AT THE FIRST ONE HEARD, and a version that moves after it walks again', async () => {
  forgetRows();
  heardLocal(null);
  const l = lister(1);
  await rowsOf(l.client, 'https://a', 'people');
  heardLocal(7);
  await rowsOf(l.client, 'https://a', 'people');
  assert.equal(l.asked(), 1, 'the first version heard asked nothing again');
  heardLocal(8);
  await rowsOf(l.client, 'https://a', 'people');
  assert.equal(l.asked(), 2);
  heardLocal(null);
});
