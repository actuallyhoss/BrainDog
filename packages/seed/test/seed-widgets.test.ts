/**
 * The widgets this build's own modules and starters declare (`SEED_WIDGETS`, SHL-A22): each one reads as an add-on's
 * manifest `widgets` is read at install, and no two of them, nor any an add-on in `packs/` ships, share an id, so a
 * widget that moved out of the core keeps the id what a person kept or turned down of it is counted under.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

import { readPackWidgets } from '@braindog/declare';
import { WIDGETS } from '../../render/src/widgets.ts';

import { SEED_WIDGETS } from '../src/index.ts';

test('EVERY WIDGET THE BUILD DECLARES READS AS AN ADD-ON MANIFEST’S DOES', () => {
  for (const s of SEED_WIDGETS) {
    const read = readPackWidgets(s.widgets);
    assert.ok(read.ok, `${s.pack ?? s.usecase}: ${JSON.stringify((read as { refusal?: unknown }).refusal)}`);
  }
});

test('NO TWO WIDGETS SHARE AN ID, the core’s, the build’s and every add-on’s in packs/', () => {
  const packs = new URL('../../../packs/', import.meta.url);
  const shipped = readdirSync(packs).flatMap((dir) => {
    const file = new URL(`${dir}/${dir}.pack.json`, packs);
    if (!existsSync(file)) return [];
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { widgets?: { id: string }[] };
    return (doc.widgets ?? []).map((w) => w.id);
  });
  const ids = [...WIDGETS.map((w) => w.id), ...SEED_WIDGETS.flatMap((s) => s.widgets.map((w) => String(w.id))), ...shipped];
  assert.equal(new Set(ids).size, ids.length, ids.filter((id, i) => ids.indexOf(id) !== i).join(', '));
});
