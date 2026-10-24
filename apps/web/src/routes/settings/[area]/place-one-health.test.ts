/**
 * One Health (audit 25 October, Y4). Settings had an area called Health that said "32 things went stale" while the
 * Health page said 9 things needed a look, and the Settings tile opened the first. Now the index's Health opens the
 * Health page, the record's housekeeping is its own area under its own name, and an old link to it still lands.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { AREAS, DEFAULT_GROUPS, SETTINGS_INDEX, areaOf, rowsOf } from './place.ts';

const rows = DEFAULT_GROUPS.flatMap((g) => rowsOf(g));

test('THE INDEX HAS ONE HEALTH, and it opens the Health page with its heart', () => {
  const health = rows.filter((r) => r.label === 'Health');
  assert.equal(health.length, 1);
  assert.equal(health[0]!.href, '/p/health');
  assert.equal(health[0]!.icon, 'heart-pulse');
  const cells = SETTINGS_INDEX.blocks.flatMap((b) => b.authored ?? []).filter((r) => r.cells[0] === 'Health');
  assert.deepEqual(cells.map((r) => r.cells[1]), ['/p/health']);
});

test('NO AREA IS CALLED HEALTH: the housekeeping is Tidy up, and the old address lands on it', () => {
  assert.ok(![...AREAS.values()].some((a) => a.label === 'Health'));
  const tidy = AREAS.get('tidy');
  assert.equal(tidy?.label, 'Tidy up');
  assert.equal(tidy?.line, 'What the record found to tidy in itself');
  assert.equal(areaOf('health')?.id, 'tidy');
  const route = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(route, /area === 'tidy'/u);
});
