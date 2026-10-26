/**
 * The Scripts page reads clean once a script has run: its "Where it stands" column is a script's last run, an instant no
 * list declares, and the `scripts` source answers its type, so the web says it as how long ago and the lint reads it as
 * drawn. Before the source answered its types, every script that had run printed its last run as an ISO time and the
 * sign `pages-clean` read red over Scripts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCRIPTS_PAGES } from '@braindog/seed/packs/scripts';

import { createRecordApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 26, 12);
const HOUR = 3_600_000;

const GOLD_EGP = {
  id: 'register.gold_egp',
  kind: 'register' as const,
  body: { id: 'gold_egp', name: 'Gold, EGP', title: 'at', fields: [{ id: 'at', type: 'text', required: true }] } as never,
};
const GOLD = {
  id: 'script.gold-rate',
  kind: 'script' as const,
  body: { script: 'gold-rate', title: 'Gold rate', runs: { every: '1h' }, egress: [], keys: [], reads: [], writes: ['gold_egp'], source: 'export default async function run(ctx) {}' } as never,
};
/** The page as the People add-on installs it. */
const PAGE = (({ pack: _pack, ...body }) => ({ id: 'page.scripts', kind: 'page' as const, body: body as never }))(SCRIPTS_PAGES['scripts']!);

const wrote = async () => ({ writes: [{ op: 'create' as const, register: 'gold_egp', fields: { at: 'noon' } }], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } });

test('SCRIPTS PRINTS NO RAW TIME: a script that ran is said by how long ago, and the page reads clean', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const installed = await api.kernel.install([GOLD_EGP, GOLD, PAGE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  clock.advance(2 * HOUR);
  await api.kernel.runActions(async () => assert.fail('a script sends no action request'), { script: wrote as never });

  /* THE SOURCE ANSWERS THE COLUMN'S TYPE, which the web draws the cell by. */
  const page = api.kernel.page('scripts');
  assert.ok(page.ok, JSON.stringify(page));
  const table = page.value.blocks.find((b) => b.source === 'scripts')!;
  assert.match(String(table.rows?.[0]?.fields?.['last_at']), /^2026-10-26T14:/, 'the script ran');
  assert.equal(table.types?.['last_at'], 'instant');

  assert.deepEqual(await api.lintTick(), { ran: true, state: 'green', findings: 0, pages: 1 });
  sql.close();
});
