/**
 * Turning an add-on off and on, as `/packs` draws it.
 *
 * What is tested is what the screen offers after each answer: an add-on that is off is still listed,
 * a refused switch names who leans on it and sends them on the second press, and one that cannot come
 * back yet points at the add-on to turn on first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blocked, choose, sample, type Caller, type PackState } from './packs.ts';
import { copy } from '../copy.ts';

const AT = '2026-09-15T12:00:00.000Z';

const value = <T>(r: { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } }): T => {
  assert.ok(r.ok, r.ok ? '' : `${r.refusal.code}: ${r.refusal.fix}`);
  return r.value;
};

test('THE SAMPLE LISTS EVERY INSTALLED ADD-ON, AND ONE TURNED OFF IS STILL LISTED', async () => {
  const s = sample(() => AT);
  const first = value(await s.packs());
  assert.deepEqual(first.map((p) => p.id), ['money-core', 'estate', 'people', 'work', 'portfolio', 'agents']);
  assert.ok(first.every((p) => p.disabled_at === null));

  assert.deepEqual(value(await s.disable('people')).packs, ['people']);
  const after = value(await s.packs());
  assert.equal(after.length, first.length, 'an add-on turned off left the list');
  assert.equal(after.find((p) => p.id === 'people')?.disabled_at, AT);
  assert.deepEqual(after.find((p) => p.id === 'people')?.registers, ['people'], 'its lists are still named');
  assert.equal(value(await s.disable('people')).changed, false);
});

test('A REFUSED SWITCH NAMES WHO LEANS ON IT, AND THE SECOND PRESS TURNS THEM OFF TOGETHER', async () => {
  const s = sample(() => AT);
  const refused = await s.disable('portfolio');
  assert.ok(!refused.ok);
  const b = blocked('portfolio', refused.refusal);
  assert.deepEqual(b, { kind: 'required', id: 'portfolio', also: ['agents', 'estate', 'money-core', 'people', 'work'] });
  assert.ok(value(await s.packs()).every((p: PackState) => p.disabled_at === null), 'a refused switch turned something off');
  assert.equal(copy.packOffTogether(4), 'Turn all 5 off');
  assert.equal(copy.packOffTogether(1), 'Turn both off');
  assert.equal(copy.packNeededBy(['Money', 'Work']), 'Needed by Money and Work');

  assert.ok(b.kind === 'required');
  assert.deepEqual(value(await s.disable('portfolio', b.also)).packs, ['portfolio', 'agents', 'estate', 'money-core', 'people', 'work']);

  /* BACK ON IN ORDER. The dependent first points at the one it needs. */
  const early = await s.enable('work');
  assert.ok(!early.ok);
  assert.deepEqual(blocked('work', early.refusal), { kind: 'off', id: 'work', pack: 'portfolio' });
  value(await s.enable('portfolio'));
  value(await s.enable('work'));
  assert.equal(value(await s.packs()).find((p) => p.id === 'work')?.disabled_at, null);
});

test('EVERY OTHER REFUSAL IS READ AS WHAT THE SCREEN CAN SAY', () => {
  assert.deepEqual(
    blocked('portfolio', {
      code: 'SCOPES_IN_USE',
      fix: 'register.things holds the projects, and register.tasks.thing, register.notes.project still point at them.',
      at: 'register.tasks.thing',
    }),
    { kind: 'scopes', id: 'portfolio', registers: ['tasks', 'notes'] },
  );
  /* A cascade that finds a second layer keeps the first. */
  assert.deepEqual(blocked('portfolio', { code: 'PACK_REQUIRED', fix: 'x', allowed: ['agents'] }, ['work']), {
    kind: 'required',
    id: 'portfolio',
    also: ['work', 'agents'],
  });
  assert.deepEqual(blocked('work', { code: 'PACK_DISABLED', fix: 'x' }), { kind: 'off', id: 'work', pack: 'work' });
  assert.deepEqual(blocked('work', { code: 'FORBIDDEN', fix: 'Only an owner.' }), { kind: 'other', id: 'work', fix: 'Only an owner.' });
});

test('WITH NO RECORD TO ASK THE SCREEN DRAWS THE SAMPLE, AND A RECORD THAT SAYS NO IS DRAWN SAYING NO', async () => {
  const sent: unknown[] = [];
  const caller = (packs: Awaited<ReturnType<Caller['packs']>>): Caller => ({
    packs: async () => packs,
    disablePack: async (args) => (sent.push(args), { ok: false, refusal: { code: 'PACK_REQUIRED', fix: 'x', allowed: ['work'] } }),
    enablePack: async (args) => (sent.push(args), { ok: false, conflict: {} }),
  });

  const none = await choose(caller({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }));
  assert.equal(none.source.sample, true);
  assert.ok(none.first.ok);

  const no = await choose(caller({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner.' } }));
  assert.equal(no.source.sample, false);
  assert.equal(no.first.ok ? '' : no.first.refusal.code, 'FORBIDDEN');

  const yes = await choose(caller({ ok: true, value: [{ id: 'agents', version: '1.0.0', disabled_at: null, registers: ['skills'] }] }));
  assert.equal(yes.source.sample, false);
  await yes.source.disable('portfolio');
  await yes.source.disable('portfolio', ['work']);
  const raced = await yes.source.enable('work');
  assert.deepEqual(sent, [{ id: 'portfolio' }, { id: 'portfolio', alsoDisable: ['work'] }, { id: 'work' }]);
  assert.equal(raced.ok ? '' : raced.refusal.code, 'VERSION_STALE');
});
