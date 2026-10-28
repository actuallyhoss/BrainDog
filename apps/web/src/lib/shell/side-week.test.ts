/**
 * The sidebar's week waits for the screen's own reads, and its money figures are held a few minutes: one figure a
 * project, asked first on every open and again on every move of the record, held the screen's reads up behind it in
 * the record's one thread.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MONEY_HELD_MS, readWeek, type SideRow } from './side-read.ts';

const row = (seq: number, name: string): SideRow => ({ key: `things#${seq}`, seq, name, href: `/r/things/${seq}`, mark: '', hue: null, lane: 'play' }) as unknown as SideRow;

test('the money figures are asked once for the same projects within the hold, and again after it', async () => {
  const asked: string[] = [];
  const was = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === 'string' ? init.body : '';
    asked.push(`${url} ${body}`);
    const metrics = /metric/u.test(url);
    const value = metrics ? { readings: {}, refused: {} } : { rows: [], cursor: null };
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const play = [row(1, 'Kiln'), row(2, 'Portage')];
    const base = 'https://week.example/api';
    const t = 1_000_000;
    await readWeek(base, 'things', play, t);
    const first = asked.filter((a) => /metric/u.test(a)).length;
    assert.ok(first > 0, 'the first week asks the figures');
    await readWeek(base, 'things', play, t + 60_000);
    assert.equal(asked.filter((a) => /metric/u.test(a)).length, first, 'a minute later they are held');
    await readWeek(base, 'things', play, t + MONEY_HELD_MS + 1);
    assert.ok(asked.filter((a) => /metric/u.test(a)).length > first, 'past the hold they are asked again');
  } finally {
    globalThis.fetch = was;
  }
});

test('the sidebar asks its week once the screen has rested', () => {
  const bar = readFileSync(new URL('./SideBar.svelte', import.meta.url), 'utf8');
  assert.match(bar, /await rested\(\);\s+if \(n !== asked\) return;\s+const w = await readWeek\(/u);
});
