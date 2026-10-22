/**
 * `@braindog/seed/packs/lists` and `@braindog/seed/packs/metrics` say what the documents say, without the documents.
 *
 * THE APP'S FIRST OPEN READS THESE INSTEAD OF BUILDING EVERY MODULE'S DOCUMENT (`modules/lists.ts`, `modules/metrics.ts`). The lists
 * are written out by hand, so this file reads them back the way the two old readers did: the lists each module declares,
 * off `firstPartyModules()`, and the list that plays each part, off `moduleDocument` in module order, exactly as
 * `apps/web/src/lib/start/parts.ts` read it before it read `PLAYED_BY`. A list that moves, or a part that changes hands,
 * is red here before a screen says the wrong name.
 *
 * IMPORTED BY THE PACKAGE NAMES, because the names are what the app resolves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_LISTS, PLAYED_BY, listsOfModule, moduleNamed, type Part } from '@braindog/seed/packs/lists';
import { METRICS as LIGHT } from '@braindog/seed/packs/metrics';
import { METRICS } from '@braindog/seed/packs';
import { firstPartyModules } from '@braindog/seed/packs/modules';
import { MODULE_ORDER } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';

test('each module brings the lists its document declares, in its order', () => {
  const modules = firstPartyModules();
  assert.deepEqual(Object.keys(MODULE_LISTS), modules.map((m) => m.id));
  for (const m of modules) {
    assert.deepEqual(listsOfModule(m.id), m.registers, m.id);
    assert.equal(moduleNamed(m.id), m.name, m.id);
  }
});

test('a pack that is not a first-party module brings no lists and has no module name here', () => {
  for (const id of ['usecase-shop', 'holdings', 'constructor']) {
    assert.equal(listsOfModule(id), undefined, id);
    assert.equal(moduleNamed(id), undefined, id);
  }
});

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

test('the list that plays each part is the one the module documents declare', () => {
  const out = new Map<Part, string>();
  for (const id of MODULE_ORDER) {
    const doc = moduleDocument(null, id, { today: '1970-01-01' });
    for (const d of Array.isArray(doc?.declarations) ? (doc.declarations as unknown[]) : []) {
      if (!isMap(d) || typeof d.register !== 'string') continue;
      for (const part of ['meets', 'hand', 'rates'] as const) if (isMap(d[part]) && !out.has(part)) out.set(part, d.register);
      const meets = d.meets;
      if (isMap(meets) && typeof meets.projects === 'string' && Array.isArray(d.fields)) {
        const field = (d.fields as unknown[]).find((f) => isMap(f) && f.id === meets.projects);
        if (isMap(field) && typeof field.to === 'string' && !out.has('projects')) out.set('projects', field.to);
      }
    }
  }
  assert.deepEqual(PLAYED_BY, Object.fromEntries(out));
});

test('the figures through their own door are the very table the packs door hands out', () => {
  assert.equal(LIGHT, METRICS);
  assert.ok(Object.keys(LIGHT).length > 0);
});
