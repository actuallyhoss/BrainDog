/**
 * Turning an add-on off and on, as `/packs` draws it.
 *
 * What is tested is what the screen offers after each answer: an add-on that is off is still listed,
 * a refused switch names who leans on it and sends them on the second press, and one that cannot come
 * back yet points at the add-on to turn on first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blocked,
  changesOf,
  choose,
  draftOf,
  fieldAt,
  isDefault,
  openSettings,
  sample,
  signInFor,
  words,
  type Caller,
  type Draft,
  type PackConfig,
  type PackState,
} from './packs.ts';
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
    packConfig: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }),
    setPackConfig: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }),
    uninstallPack: async (args) => (sent.push(args), { ok: true, value: { id: args.id } }),
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

/* ── settings ───────────────────────────────────────────────────────────── */

const settingsOf = async (): Promise<PackConfig> => value(await sample(() => AT).config('money-core'));
const draftsOf = (s: PackConfig): Record<string, Draft> =>
  Object.fromEntries(Object.entries(s.config).map(([k, d]) => [k, draftOf(d, s.values[k])]));

test('THE SAMPLE DECLARES ONE OF EACH TYPE ON ONE ADD-ON, AND NONE ON THE OTHERS', async () => {
  const s = sample(() => AT);
  const money = value(await s.config('money-core'));
  assert.deepEqual(Object.values(money.config).map((d) => d.type).sort(), ['bool', 'day', 'duration', 'enum', 'enum', 'money', 'text']);
  assert.deepEqual(money.values.late_fee, { amount: 4000, currency: 'GBP' });
  assert.deepEqual(value(await s.config('people')).config, {});
  const none = await s.config('no-such-pack');
  assert.equal(none.ok ? '' : none.refusal.code, 'DECLARATION_UNKNOWN');
});

test('EACH CONTROL STARTS FROM ITS VALUE, AND SAVE SENDS ONLY WHAT MOVED', async () => {
  const s = await settingsOf();
  const drafts = draftsOf(s);
  assert.equal(drafts.late_fee?.text, '40.00');
  assert.deepEqual([drafts.lead_time?.text, drafts.lead_time?.unit], ['7', 'days']);
  assert.equal(drafts.chase_overdue?.on, true);
  assert.equal(drafts.digest_day?.text, 'mon');
  assert.deepEqual(changesOf(s, drafts), { values: {}, wrong: {} });

  const edited: Record<string, Draft> = {
    ...drafts,
    late_fee: { ...drafts.late_fee!, text: '45.5' },
    lead_time: { ...drafts.lead_time!, text: '2', unit: 'hours' },
    chase_overdue: { ...drafts.chase_overdue!, on: false },
  };
  assert.deepEqual(changesOf(s, edited).values, { late_fee: { amount: 4550, currency: 'GBP' }, lead_time: 7200, chase_overdue: false });

  /* A FIGURE IN THE WRONG SHAPE IS HELD BACK, in the row form's own words, and nothing else is. */
  const wrong = changesOf(s, { ...drafts, late_fee: { ...drafts.late_fee!, text: '45.555' }, heading: { ...drafts.heading!, text: 'Cash' } });
  assert.deepEqual(wrong, { values: { heading: 'Cash' }, wrong: { late_fee: copy.moneyPlaces(2) } });
});

test('THE DEMO SAVES IN THE TAB AND SAYS NOTHING WAS SAVED; RESET PUTS THE DEFAULT BACK', async () => {
  const s = sample(() => AT);
  const saved = value(await s.setConfig('money-core', { reminders: 'monthly', late_fee: { amount: 5000, currency: 'GBP' } }));
  assert.deepEqual(saved.changed, ['reminders', 'late_fee']);
  assert.equal(saved.said, copy.notWritten(words.changed(['Reminders', 'Late fee'])));
  assert.equal(value(await s.config('money-core')).values.reminders, 'monthly');
  assert.ok(!isDefault(saved.config.reminders!, saved.values.reminders));

  const reset = value(await s.setConfig('money-core', { reminders: null }));
  assert.deepEqual(reset.changed, ['reminders']);
  assert.equal(reset.values.reminders, 'weekly');
  assert.ok(isDefault(reset.config.reminders!, reset.values.reminders));
  assert.deepEqual(reset.values.late_fee, { amount: 5000, currency: 'GBP' }, 'a reset of one setting moved another');
});

test('A REFUSAL NAMES ITS SETTING, AND THE SESSION RULES ARE ANSWERED BY SIGNING IN AGAIN', async () => {
  const s = sample(() => AT);
  const enumWrong = await s.setConfig('money-core', { reminders: 'hourly' });
  assert.ok(!enumWrong.ok);
  assert.equal(enumWrong.refusal.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(fieldAt(enumWrong.refusal), 'reminders');
  const unknown = await s.setConfig('people', { colour: 'dark' });
  assert.ok(!unknown.ok);
  assert.deepEqual([unknown.refusal.code, unknown.refusal.fix], ['FIELD_UNKNOWN', 'people declares no settings.']);
  assert.equal(fieldAt({ code: 'REQUIRED_MISSING', fix: 'x', at: 'values' }), null);

  assert.equal(signInFor({ code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app.' }), true);
  assert.equal(signInFor({ code: 'FORBIDDEN', fix: 'Only an owner.' }), true);
  assert.equal(signInFor({ code: 'ENUM_VALUE_UNKNOWN', fix: 'x' }), false);
});

test('WITH NO RECORD THE SETTINGS ARE THE SAMPLE’S, AND A LIVE SAVE SENDS setPackConfig WITH ONLY THE VALUES', async () => {
  const sent: { name: string; args: unknown }[] = [];
  const session = { ok: false as const, refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot change what this record is.' } };
  const caller = (config: Awaited<ReturnType<Caller['packConfig']>>): Caller => ({
    packs: async () => ({ ok: true, value: [] }),
    disablePack: async () => ({ ok: false, conflict: {} }),
    enablePack: async () => ({ ok: false, conflict: {} }),
    packConfig: async (args) => (sent.push({ name: 'packConfig', args }), config),
    setPackConfig: async (args) => (sent.push({ name: 'setPackConfig', args }), session),
    uninstallPack: async (args) => (sent.push({ name: 'uninstallPack', args }), session),
  });

  const none = await openSettings(caller({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'x' } }), 'money-core');
  assert.equal(none.source.sample, true);
  assert.ok(none.first.ok && Object.keys(none.first.value.config).length === 7);

  const live: PackConfig = { id: 'ledger', version: '1.0.0', config: { cadence: { type: 'enum', values: ['weekly', 'monthly'] } }, values: { cadence: 'monthly' } };
  const yes = await openSettings(caller({ ok: true, value: live }), 'ledger');
  assert.equal(yes.source.sample, false);
  const refused = await yes.source.setConfig('ledger', { cadence: 'weekly' });
  assert.deepEqual(sent.at(-1), { name: 'setPackConfig', args: { id: 'ledger', values: { cadence: 'weekly' } } });
  assert.ok(!refused.ok && signInFor(refused.refusal));

  const no = await openSettings(caller({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: 'ledger is not a pack this record has installed.' } }), 'ledger');
  assert.equal(no.source.sample, false);
  assert.equal(no.first.ok ? '' : no.first.refusal.fix, 'ledger is not a pack this record has installed.');
});

test('UNINSTALLING ON THE SAMPLE SAYS WHAT WOULD GO AND KEEPS IT; ON A RECORD IT SENDS uninstallPack', async () => {
  const s = sample(() => AT);
  const said = value(await s.uninstall('people'));
  assert.equal(said.said, copy.notWritten(copy.uninstallWould('People')));
  assert.ok(value(await s.packs()).some((p) => p.id === 'people'), 'the sample took an add-on out');
  const none = await s.uninstall('no-such-pack');
  assert.equal(none.ok ? '' : none.refusal.code, 'DECLARATION_UNKNOWN');

  const sent: unknown[] = [];
  const caller: Caller = {
    packs: async () => ({ ok: true, value: [] }),
    disablePack: async () => ({ ok: false, conflict: {} }),
    enablePack: async () => ({ ok: false, conflict: {} }),
    packConfig: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'x' } }),
    setPackConfig: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'x' } }),
    uninstallPack: async (args) => (sent.push(args), { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner can take an add-on out.' } }),
  };
  const { source } = await choose(caller);
  const refused = await source.uninstall('work');
  assert.deepEqual(sent, [{ id: 'work' }]);
  assert.equal(refused.ok ? '' : refused.refusal.fix, 'Only an owner can take an add-on out.');
});
