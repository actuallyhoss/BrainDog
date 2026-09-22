/**
 * A field added to a list at run time, and whether it is still there after the tab moves on (DIRECTION §22).
 *
 * TWO WAYS IT WAS LOST, both after `field-write.test.ts` had gone green. `voice.ts` `relabelAll` kept each list's
 * first declaration, which for a list the build ships is the bundle's, and drew it back over `REGISTERS` on every boot:
 * the add calls `forget()`, the next navigation re-boots, and the field was gone from the row page, RowForm and
 * `display` for the rest of the tab. And `data/record.ts` kept a list's declaration only when the build did not ship
 * it, so a list screen opened first in a tab drew the bundle's RowForm with no added field on it.
 *
 * THE HOOK IS `data/record.test.ts`'s, for its reason: `record.ts` imports a `.svelte.ts` module that evaluates a rune.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

import { readableFields, REGISTERS } from '../record/api.ts';
import { forget, type Fetch } from '../record/boot-live.ts';
import { addField } from '../record/field-write.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { relabelAll } from '../voice.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { open } = await import('./record.ts');

const BASE = 'http://record.test';
globalThis.location = { origin: BASE } as unknown as Location;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* THE BUILD'S OWN PROJECTS, and the same list as the record declares it once its owner has added `launched`. */
const BUNDLED: RegisterDecl = REGISTERS.things!;
const LIVE = { ...BUNDLED, fields: [...BUNDLED.fields, { id: 'launched', label: 'Launched', type: 'day' }] };

/** A record whose Projects has `launched`, answering every method this file calls, and every one asked. */
function record(): { io: Fetch; asked: { name: string; register: string }[] } {
  const asked: { name: string; register: string }[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const name = at.pathname.replace(/^\/api\//u, '');
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    const register = String(args.register ?? '');
    asked.push({ name, register });
    if (name === 'boot') return json(200, { ok: true, value: { registers: [{ id: 'things', name: 'Projects', count: 0 }], now: '2026-09-22T09:00:00.000Z' } });
    if (name === 'schema') return register === 'things' ? json(200, { ok: true, value: LIVE }) : json(200, { ok: true, value: REGISTERS[register] });
    if (name === 'list') return json(200, { ok: true, value: { rows: [], matched: 0, cursor: null } });
    if (name === 'propose') return json(200, { ok: true, value: { id: 's_1' } });
    if (name === 'decide') return json(200, { ok: true, value: {} });
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `Nothing here answers ${name}.` } });
  }) as Fetch;
  return { io, asked };
}

const ids = (): string[] => readableFields('things').map((f) => f.id);

test('A FIELD ADDED IN THIS TAB IS STILL THERE AFTER THE NEXT BOOT, and the labels over it still come and go', async () => {
  REGISTERS.things = BUNDLED;
  /* THE FIRST BOOT, as the layout runs it before any screen draws. */
  relabelAll(REGISTERS, {});
  assert.deepEqual(await addField(BASE, 'things', { id: 'launched', label: 'Launched', type: 'day' }, true, record().io), { from: 'added' });
  assert.ok(ids().includes('launched'), 'the add did not reach this tab');

  /* THE NEXT NAVIGATION: `forget()` dropped the boot, so the layout boots again and hears the labels again. */
  relabelAll(REGISTERS, {});
  assert.ok(ids().includes('launched'), `the re-boot put the bundle's Projects back: ${ids().join(', ')}`);

  /* A LABEL STILL DRAWS OVER THE LEARNT LIST, and taking it away still gives the declaration's word back. */
  relabelAll(REGISTERS, { things: 'Clients' });
  assert.equal(REGISTERS.things!.name, 'Clients');
  assert.ok(ids().includes('launched'));
  relabelAll(REGISTERS, {});
  assert.equal(REGISTERS.things!.name, 'Projects');
  assert.ok(ids().includes('launched'));
  REGISTERS.things = BUNDLED;
});

test('A LIST SCREEN OPENED FIRST IN A TAB HAS THE FIELD, and asks the record about the list once', async () => {
  REGISTERS.things = BUNDLED;
  relabelAll(REGISTERS, {});
  forget();
  const { io, asked } = record();
  globalThis.fetch = io as typeof fetch;
  const source = await open();
  const decl = await source.schema('things');
  assert.ok(decl.ok && decl.value.fields.some((f) => f.id === 'launched'), 'the list screen was not told about the field');
  assert.ok(ids().includes('launched'), `RowForm reads the bundle's Projects: ${ids().join(', ')}`);
  await source.page('things', { filters: [], q: '' }, null);
  await source.count('things', { filters: [], q: '' });
  await source.schema('things');
  assert.equal(asked.filter((a) => a.name === 'schema' && a.register === 'things').length, 1, 'Projects was asked about more than once');

  relabelAll(REGISTERS, {});
  assert.ok(ids().includes('launched'), 'the next boot lost it');
  REGISTERS.things = BUNDLED;
});

/*
 * THE LIST SCREEN'S QUESTION SENT BEFORE THE ADD AND ANSWERED AFTER IT (`loop/research-batch-thirty-three-audit.md` §7).
 * `learn` keeps the newest ticket per list, but the Source sent its `schema` first and took the ticket only once the
 * answer was back, so the slow, older answer carried a newer ticket than the add's and put Projects back without
 * `launched`: measured true after the add, false once the slow answer landed, false after the next boot.
 */
test('A LIST SCREEN WHOSE QUESTION WAS OUT BEFORE AN ADD DOES NOT PUT THE LIST BACK when its answer lands after it', async () => {
  REGISTERS.things = BUNDLED;
  relabelAll(REGISTERS, {});
  forget();
  let added = false;
  let release: () => void = () => {};
  const slow = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const name = at.pathname.replace(/^\/api\//u, '');
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    if (name === 'boot') return json(200, { ok: true, value: { registers: [{ id: 'things', name: 'Projects', count: 0 }], now: '2026-09-22T09:00:00.000Z' } });
    if (name === 'schema' && args.register === 'things') {
      /* THE SCREEN'S QUESTION goes out while Projects is still as it was, and its answer is held until after the add. */
      if (first) {
        first = false;
        const before = added ? LIVE : BUNDLED;
        await slow;
        return json(200, { ok: true, value: before });
      }
      return json(200, { ok: true, value: added ? LIVE : BUNDLED });
    }
    if (name === 'schema') return json(200, { ok: true, value: REGISTERS[String(args.register)] });
    if (name === 'propose') return json(200, { ok: true, value: { id: 's_1' } });
    if (name === 'decide') {
      added = true;
      return json(200, { ok: true, value: {} });
    }
    return json(200, { ok: true, value: { rows: [], matched: 0, cursor: null } });
  }) as Fetch;
  globalThis.fetch = io as typeof fetch;

  const source = await open();
  const screen = source.schema('things');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(await addField(BASE, 'things', { id: 'launched', label: 'Launched', type: 'day' }, true, io), { from: 'added' });
  assert.ok(ids().includes('launched'), 'the add did not reach this tab');

  release();
  await screen;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(ids().includes('launched'), `the screen's older answer put the bundle's Projects back: ${ids().join(', ')}`);
  relabelAll(REGISTERS, {});
  assert.ok(ids().includes('launched'), 'the next boot kept the list from before the add');
  REGISTERS.things = BUNDLED;
});
