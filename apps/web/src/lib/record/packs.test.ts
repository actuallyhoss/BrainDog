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
  currencyOf,
  heldElsewhere,
  choose,
  draftOf,
  fieldAt,
  installPlanned,
  isDefault,
  openSettings,
  packDocument,
  planInstall,
  type Installer,
  sample,
  signInFor,
  words,
  type Caller,
  type Draft,
  type PackConfig,
  type PackState,
} from './packs.ts';
import { copy } from '../copy.ts';
import { firstPartyDocument, MONEY_TARGET_SETTINGS } from '@braindog/seed';

const AT = '2026-09-15T12:00:00.000Z';

const value = <T>(r: { ok: true; value: T } | { ok: false; refusal: { code: string; fix: string } }): T => {
  assert.ok(r.ok, r.ok ? '' : `${r.refusal.code}: ${r.refusal.fix}`);
  return r.value;
};

test('INSTALLING PLANS FIRST, SENDS THE PLAN THAT WAS SHOWN, AND PLANS AGAIN WHEN THE RECORD MOVED', async () => {
  const doc = await packDocument('estate');
  assert.ok(doc, 'estate ships a document');
  assert.equal(await packDocument('freelancer-uk'), null, 'an entry with no document is not installable');
  assert.equal((await packDocument('agents'))?.pack, 'agents');

  const sent: { name: string; args: Record<string, unknown> }[] = [];
  let hash = '12.abc';
  let stale = true;
  const diff = () => ({
    diff: { planHash: hash, adds: [{ id: 'register.services', summary: '9 fields' }], seeds: { count: 3 }, approve: ['calls example.com'], calls_out: [] },
  });
  const client: Installer = {
    planPack: async (args) => (sent.push({ name: 'planPack', args }), { ok: true, value: diff() }),
    installPack: async (args) => {
      sent.push({ name: 'installPack', args });
      if (stale) {
        stale = false;
        hash = '13.def';
        return { ok: false, refusal: { code: 'PLAN_STALE', fix: 'The record changed since this plan. Read it again.' } };
      }
      return { ok: true, value: { id: 'estate' } };
    },
  };
  const nameOf = (_: 'register' | 'page', id: string) => (id === 'services' ? 'Services' : id);

  const planned = value(await planInstall(client, 'estate', doc, nameOf));
  assert.equal(planned.plan.planHash, '12.abc');
  assert.deepEqual(planned.plan.adds, [{ kind: 'list', name: 'Services', detail: '9 fields' }]);
  assert.deepEqual(planned.approve, ['calls example.com']);
  assert.deepEqual(sent[0]?.args, { doc, source: { kind: 'local' } });

  const first = await installPlanned(client, planned, nameOf);
  assert.ok(!first.ok);
  assert.equal(first.again?.plan.planHash, '13.def', 'a stale plan is planned again and drawn');
  assert.deepEqual(sent[1]?.args, { doc, source: { kind: 'local' }, planHash: '12.abc', approve: ['calls example.com'] });

  assert.deepEqual(await installPlanned(client, first.again!, nameOf), { ok: true });
  assert.equal(sent.at(-1)?.args.planHash, '13.def');

  const refused: Installer = { ...client, planPack: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner can install.' } }) };
  const no = await planInstall(refused, 'estate', doc, nameOf);
  assert.ok(!no.ok && no.refusal.fix === 'Only an owner can install.');
});

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

test('THE SHELL SAYS WHICH RECORD THIS IS, AND EVERY ANSWER AFTER THAT IS THAT SOURCE’S', async () => {
  const sent: unknown[] = [];
  const caller = (packs: Awaited<ReturnType<Caller['packs']>>): Caller => ({
    packs: async () => packs,
    disablePack: async (args) => (sent.push(args), { ok: false, refusal: { code: 'PACK_REQUIRED', fix: 'x', allowed: ['work'] } }),
    enablePack: async (args) => (sent.push(args), { ok: false, conflict: {} }),
    packConfig: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }),
    setPackConfig: async () => ({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }),
    uninstallPack: async (args) => (sent.push(args), { ok: true, value: { id: args.id } }),
  });

  /* THE SHELL SAID THERE IS NO RECORD HERE, SO NOTHING IS ASKED OF ONE. */
  let asked = 0;
  const counting: Caller = { ...caller({ ok: true, value: [] }), packs: async () => ((asked += 1), { ok: true, value: [] }) };
  const none = await choose(counting, true);
  assert.equal(none.source.sample, true);
  assert.ok(none.first.ok);
  assert.equal(asked, 0, 'a record the shell said was not there was asked anyway');

  /* AND ON A RECORD EVERY ANSWER IS THE RECORD'S, INCLUDING THE ONE THAT USED TO MEAN "NO RECORD".
     The shell has already established that there is a record here to refuse, and falling back to
     the sample on a transient failure is what let this screen and the list disagree. */
  const gone = await choose(caller({ ok: false, refusal: { code: 'UNREACHABLE', fix: 'x' } }), false);
  assert.equal(gone.source.sample, false);
  assert.equal(gone.first.ok ? '' : gone.first.refusal.code, 'UNREACHABLE');

  const no = await choose(caller({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner.' } }), false);
  assert.equal(no.source.sample, false);
  assert.equal(no.first.ok ? '' : no.first.refusal.code, 'FORBIDDEN');

  const yes = await choose(caller({ ok: true, value: [{ id: 'agents', version: '1.0.0', disabled_at: null, registers: ['skills'] }] }), false);
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

/* ONE SETTING OF EACH OTHER TYPE, for the controls a first-party pack does not use yet. */
const EVERY_TYPE: PackConfig = {
  id: 'ledger',
  version: '1.0.0',
  config: {
    heading: { type: 'text', label: 'Page heading', default: 'Money' },
    reminders: { type: 'enum', label: 'Reminders', values: ['weekly', 'monthly', 'never'], default: 'weekly' },
    chase_overdue: { type: 'bool', label: 'Chase overdue invoices', default: true },
    late_fee: { type: 'money', label: 'Late fee', default: { amount: 4000, currency: 'GBP' } },
    year_end: { type: 'day', label: 'Year end', default: '2027-04-05' },
    lead_time: { type: 'duration', label: 'Remind before due', default: 604_800 },
  },
  values: { heading: 'Money', reminders: 'monthly', chase_overdue: true, late_fee: { amount: 4000, currency: 'GBP' }, year_end: '2027-04-05', lead_time: 604_800 },
};

test("THE SAMPLE'S MONEY DECLARES THE HOME CURRENCY AND THE SIX TARGETS THE REAL PACK DOES, AND THE OTHERS NONE", async () => {
  const s = sample(() => AT);
  const money = value(await s.config('money-core'));
  const doc = firstPartyDocument('money-core') as { config: Record<string, unknown> };
  assert.deepEqual(money.config, doc.config, 'the sample and the pack a record installs declare different settings');
  assert.deepEqual(Object.keys(money.config).sort(), ['home_currency', ...Object.values(MONEY_TARGET_SETTINGS).map((t) => t.setting)].sort());
  assert.deepEqual(money.values.most_out_30d, { amount: 5_000_000, currency: 'GBP' });
  assert.equal(money.values.most_days_late, 14);
  assert.equal(money.values.home_currency, 'GBP', "the sample's money is sterling, so its home currency is chosen");
  assert.deepEqual(value(await s.config('people')).config, {});
  const none = await s.config('no-such-pack');
  assert.equal(none.ok ? '' : none.refusal.code, 'DECLARATION_UNKNOWN');
});

test('EACH CONTROL STARTS FROM ITS VALUE, AND SAVE SENDS ONLY WHAT MOVED', async () => {
  const money = await settingsOf();
  const targets = draftsOf(money);
  /* GROUPED AS AMOUNTS READ ELSEWHERE, and read back as the same amount, so an untouched box has not moved. */
  assert.equal(targets.most_out_30d?.text, '50,000.00');
  assert.deepEqual(changesOf(money, { ...targets, most_out_30d: { ...targets.most_out_30d!, text: '1,234.50' } }).values, { most_out_30d: { amount: 123_450, currency: 'GBP' } });
  assert.ok('most_out_30d' in changesOf(money, { ...targets, most_out_30d: { ...targets.most_out_30d!, text: '1,23' } }).wrong);
  assert.equal(targets.most_days_late?.text, '14');
  assert.deepEqual(changesOf(money, targets), { values: {}, wrong: {} });
  assert.deepEqual(
    changesOf(money, { ...targets, most_out_30d: { ...targets.most_out_30d!, text: '1000' }, most_days_late: { ...targets.most_days_late!, text: '7' } }).values,
    { most_out_30d: { amount: 100_000, currency: 'GBP' }, most_days_late: 7 },
  );

  const s = EVERY_TYPE;
  const drafts = draftsOf(s);
  assert.equal(drafts.late_fee?.text, '40.00');
  assert.deepEqual([drafts.lead_time?.text, drafts.lead_time?.unit], ['7', 'days']);
  assert.equal(drafts.chase_overdue?.on, true);
  assert.equal(drafts.reminders?.text, 'monthly');
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
  const saved = value(await s.setConfig('money-core', { most_days_late: 7, most_out_30d: { amount: 100_000, currency: 'GBP' } }));
  assert.deepEqual(saved.changed, ['most_out_30d', 'most_days_late']);
  assert.equal(saved.said, copy.notWritten(words.changed(['Most owed by you in 30 days', 'Most days money in may be late'])));
  assert.equal(value(await s.config('money-core')).values.most_days_late, 7);
  assert.ok(!isDefault(saved.config.most_days_late!, saved.values.most_days_late));

  const reset = value(await s.setConfig('money-core', { most_days_late: null }));
  assert.deepEqual(reset.changed, ['most_days_late']);
  assert.equal(reset.values.most_days_late, 14);
  assert.ok(isDefault(reset.config.most_days_late!, reset.values.most_days_late));
  assert.deepEqual(reset.values.most_out_30d, { amount: 100_000, currency: 'GBP' }, 'a reset of one setting moved another');
});

test('A REFUSAL NAMES ITS SETTING, AND THE SESSION RULES ARE ANSWERED BY SIGNING IN AGAIN', async () => {
  const s = sample(() => AT);
  const unnamed = await s.setConfig('money-core', { reminders: 'hourly' });
  assert.ok(!unnamed.ok);
  assert.equal(unnamed.refusal.code, 'FIELD_UNKNOWN');
  assert.equal(fieldAt(unnamed.refusal), 'reminders');
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

  const none = await openSettings(caller({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'x' } }), 'money-core', true);
  assert.equal(none.source.sample, true);
  assert.ok(none.first.ok && Object.keys(none.first.value.config).length === 7);

  const live: PackConfig = { id: 'ledger', version: '1.0.0', config: { cadence: { type: 'enum', values: ['weekly', 'monthly'] } }, values: { cadence: 'monthly' } };
  const yes = await openSettings(caller({ ok: true, value: live }), 'ledger', false);
  assert.equal(yes.source.sample, false);
  const refused = await yes.source.setConfig('ledger', { cadence: 'weekly' });
  assert.deepEqual(sent.at(-1), { name: 'setPackConfig', args: { id: 'ledger', values: { cadence: 'weekly' } } });
  assert.ok(!refused.ok && signInFor(refused.refusal));

  /* THE ONE USE CASE ON IS ALONE, so its settings screen says its words are the record's. */
  const held = (ids: string[]): Caller => ({
    ...caller({ ok: true, value: live }),
    packs: async () => ({ ok: true, value: ids.map((id) => ({ id, version: '1.0.0', disabled_at: null, registers: [] })) as never }),
  });
  assert.equal((await openSettings(held(['usecase-founder', 'work']), 'usecase-founder', false)).alone, true);
  assert.equal((await openSettings(held(['usecase-founder', 'usecase-student']), 'usecase-founder', false)).alone, false);
  assert.equal((await openSettings(held(['usecase-founder']), 'work', false)).alone, false);

  const no = await openSettings(caller({ ok: false, refusal: { code: 'DECLARATION_UNKNOWN', fix: 'ledger is not a pack this record has installed.' } }), 'ledger', false);
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
  const { source } = await choose(caller, false);
  const refused = await source.uninstall('work');
  assert.deepEqual(sent, [{ id: 'work' }]);
  assert.equal(refused.ok ? '' : refused.refusal.fix, 'Only an owner can take an add-on out.');
});

test('PEOPLE ALONE, FROM THE ADD-ONS SCREEN: no "Met in" without Projects, and none of the sample studio\'s rows', async () => {
  const bare = [{ id: 'usecase-student', version: '1.0.0', disabled_at: null, registers: ['courses', 'assignments'] }];
  type Doc = { declarations: { register?: string; fields?: { id: string; to?: string }[] }[]; seeds?: unknown[] };
  const alone = (await packDocument('people', bare)) as Doc;
  const people = alone.declarations.find((d) => d.register === 'people');
  assert.ok(people, 'the document declares People');
  assert.ok(!people.fields?.some((f) => f.to === 'things'), 'People points at Projects on a record without them');
  assert.equal(alone.seeds, undefined, 'a module added here brings no example rows');
  const withProjects = (await packDocument('people', [{ id: 'portfolio', version: null, disabled_at: null, registers: ['things'] }])) as Doc;
  assert.ok(withProjects.declarations.find((d) => d.register === 'people')?.fields?.some((f) => f.to === 'things'), 'a record with Projects gets the link');
  assert.ok((await packDocument('people'))?.seeds, 'with no record to go into, the document is as it always was');
});

test('A MODULE A USE CASE BRINGS IS ITS, even on a record where none speaks yet: Personal gives Money a person\'s sums and words', async () => {
  type Doc = { declarations: { metric?: string; name?: string; target?: { lte?: number } }[] };
  const figure = (doc: unknown, metric: string) => (doc as Doc).declarations.find((d) => d.metric === metric);
  const personal = await packDocument('money-core', [], 'personal');
  assert.equal(figure(personal, 'out-30d')?.target?.lte, 250_000);
  assert.equal(figure(personal, 'days-late-in')?.name, 'Pay comes in late by');
  const bare = await packDocument('money-core', []);
  assert.equal(figure(bare, 'out-30d')?.target?.lte, 5_000_000, 'with no use case, Money keeps its own');
  assert.equal(figure(await packDocument('money-core', [], 'reading-club'), 'out-30d')?.target?.lte, 5_000_000, 'a use case this build does not know changes nothing');
});

test("A MODULE ALREADY HERE IS OFFERED IN A USE CASE'S WORDS ONLY WHEN THE USE CASE GIVES IT SOME, and with no example rows", async () => {
  const { relabelDocument } = await import('./packs.ts');
  const held = [{ id: 'money-core', version: '1.0.0', disabled_at: null, registers: ['accounts', 'obligations'] }];
  assert.equal(await relabelDocument('money-core', held, 'student'), null);
  assert.equal(await relabelDocument('people', held, 'personal'), null);
  const money = (await relabelDocument('money-core', held, 'personal'))!;
  assert.equal(money.seeds, undefined, 'an update would write example bills into a record already holding Money');
  assert.ok(JSON.stringify(money.declarations).includes('Pay comes in late by'));
  assert.deepEqual((money.config as Record<string, { default: unknown }>).most_out_30d?.default, { amount: 250_000, currency: 'GBP' });
});

test("MONEY'S SUMS ARE TYPED IN THE HOME CURRENCY once one is chosen, and one still held in sterling has not moved until typed over", async () => {
  const sterling = await settingsOf();
  const money: PackConfig = { ...sterling, values: { ...sterling.values, home_currency: 'EGP' } };
  assert.equal(currencyOf(money, 'most_out_30d'), 'EGP');
  assert.equal(currencyOf(sterling, 'most_out_30d'), 'GBP', 'the sample is at home in sterling, as its sums are');
  assert.equal(currencyOf(EVERY_TYPE, 'late_fee'), 'GBP', 'an add-on with no home currency types a sum in its own');
  const drafts = Object.fromEntries(Object.entries(money.config).map(([k, d]) => [k, draftOf(d, money.values[k], currencyOf(money, k))]));
  assert.equal(drafts.most_out_30d?.text, '', 'a sterling sum is not drawn as pounds');
  assert.equal(heldElsewhere(money, 'most_out_30d'), 'GBP 50,000.00', 'what holds until then is said in the box');
  assert.equal(heldElsewhere(sterling, 'most_out_30d'), null);
  assert.deepEqual(changesOf(money, drafts), { values: {}, wrong: {} }, 'nothing typed is nothing sent');
  assert.deepEqual(changesOf(money, draftsOf(money)), { values: {}, wrong: {} }, 'nor a box still drawn in sterling before the home was chosen');
  assert.deepEqual(changesOf(money, { ...drafts, most_out_30d: { ...drafts.most_out_30d!, text: '2,500,000' } }).values, { most_out_30d: { amount: 250_000_000, currency: 'EGP' } });
});

test('a module turned on by itself is offered its newer version on /packs, as a use case is on browse', async () => {
  const { moduleUpdates } = await import('./packs.ts');
  const { FIRST_PARTY_VERSIONS } = await import('@braindog/seed');
  const held = (id: string, version: string | null, off = false) => ({ id, version, disabled_at: off ? '2026-09-17' : null, registers: [] });
  const out = await moduleUpdates([held('work', '1.0.0'), held('people', FIRST_PARTY_VERSIONS.people), held('estate', '1.0.0', true), held('bookshelf', '0.1.0'), held('portfolio', null)]);
  assert.deepEqual(out, [{ id: 'work', from: '1.0.0', to: FIRST_PARTY_VERSIONS.work }]);

  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('../../routes/packs/+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /moduleUpdates\(/u);
  assert.match(screen, /copy\.updateTo\(/u);
});
