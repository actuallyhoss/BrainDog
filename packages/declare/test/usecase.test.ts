/**
 * A use case as a file: what it must say, the refusals at the path that is wrong, and its voice kept as
 * the settings of the pack it carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULE_LISTS, MODULE_WORDS, VOICE_KEYS, labelKeyOf, labelSetting, labelsOf, speakingPack, voiceWhenAdding, voiceWrites, normalise, normaliseUseCase, useCasePack, voiceOf, type UseCase } from '../src/index.ts';

const DOC = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  usecase: 'reading',
  version: '1.0.0',
  title: 'Reader',
  summary: 'The books you are reading and what you thought of them.',
  author: 'Halden',
  license: 'MIT',
  audience: 'individual',
  tone: 'quiet',
  signals: ['books', 'reading list'],
  modules: [],
  voice: { home: 'Shelf', needs_you: 'Up next' },
  pack: {
    pack: 'usecase-reading',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
  },
  skills: [{ name: 'book-notes', trigger: 'when a book is finished' }],
  ...over,
});

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: { ok: boolean }) => {
  assert.equal(r.ok, false, 'this was supposed to be refused');
  return (r as unknown as { refusal: { code: string; at?: string } }).refusal;
};

test('A USE CASE READS BACK AS WHAT IT SAYS', () => {
  const u = value<UseCase>(normaliseUseCase(DOC()));
  assert.equal(u.usecase, 'reading');
  assert.deepEqual(u.voice, { home: 'Shelf', needs_you: 'Up next' });
  assert.deepEqual(u.skills, [{ name: 'book-notes', trigger: 'when a book is finished' }]);
});

test('EACH WRONG PART IS REFUSED AT ITS OWN PATH', () => {
  const cases: [Record<string, unknown>, string, string][] = [
    [{ usecase: 'Reading' }, 'PACK_MALFORMED', 'usecase'],
    [{ version: 'one' }, 'PACK_MALFORMED', 'version'],
    [{ tone: '' }, 'PACK_MALFORMED', 'tone'],
    [{ audience: '' }, 'VALUE_MALFORMED', 'audience'],
    [{ audience: 'a choir\nand friends' }, 'VALUE_MALFORMED', 'audience'],
    [{ signals: ['Books'] }, 'VALUE_MALFORMED', 'signals'],
    [{ signals: ['books', 'books'] }, 'VALUE_MALFORMED', 'signals'],
    [{ modules: ['Library'] }, 'VALUE_MALFORMED', 'modules'],
    [{ modules: ['work', 'work'] }, 'VALUE_MALFORMED', 'modules'],
    [{ modules: ['usecase-reading'] }, 'VALUE_MALFORMED', 'modules'],
    [{ voice: { footer: 'Bye' } }, 'FIELD_UNKNOWN', 'voice.footer'],
    [{ voice: { home: 'x'.repeat(81) } }, 'VALUE_MALFORMED', 'voice.home'],
    [{ pack: { pack: 'reading', declarations: [] } }, 'PACK_MALFORMED', 'pack.pack'],
    [{ pack: { pack: 'usecase-reading', config: {}, declarations: [] } }, 'PACK_MALFORMED', 'pack.config'],
    [{ pack: null }, 'PACK_MALFORMED', 'voice'],
    [{ skills: [{ name: 'Notes', trigger: 'x' }] }, 'VALUE_MALFORMED', 'skills'],
    [{ colour: 'red' }, 'FIELD_UNKNOWN', 'colour'],
    [{ labels: { 'Books': 'Shelf' } }, 'VALUE_MALFORMED', 'labels.Books'],
    [{ labels: { 'books.state.read.twice': 'x' } }, 'VALUE_MALFORMED', 'labels.books.state.read.twice'],
    [{ labels: { books: '' } }, 'VALUE_MALFORMED', 'labels.books'],
    [{ labels: 'Shelf' }, 'PACK_MALFORMED', 'labels'],
    [{ voice: undefined, pack: null, labels: { books: 'Shelf' } }, 'PACK_MALFORMED', 'labels'],
    [{ labels: Object.fromEntries(Array.from({ length: 63 }, (_, i) => [`list${i}`, 'x'])) }, 'VALUE_MALFORMED', 'labels'],
  ];
  for (const [over, code, at] of cases) {
    const r = refused(normaliseUseCase(DOC(over)));
    assert.equal(r.code, code, JSON.stringify(over));
    assert.equal(r.at, at, JSON.stringify(over));
  }
});

test('A USE CASE WITH NO VOICE MAY CARRY NO PACK', () => {
  const u = value<UseCase>(normaliseUseCase(DOC({ voice: undefined, pack: null })));
  assert.equal(useCasePack(u), null);
});

test('THE VOICE IS KEPT AS THE PACK\'S SETTINGS, AND READ BACK FROM THEM', async () => {
  const u = value<UseCase>(normaliseUseCase(DOC()));
  const doc = useCasePack(u)!;
  const pack = value<{ manifest: { pack: string; version: string; summary: string; config?: Record<string, { type: string; default?: unknown }> } }>(await normalise(doc));
  assert.equal(pack.manifest.pack, 'usecase-reading');
  assert.equal(pack.manifest.summary, u.summary);
  assert.deepEqual(Object.keys(pack.manifest.config ?? {}).sort(), ['label_books', 'one_books', 'shared_version', 'speaks', 'voice_home', 'voice_needs_you']);
  const defaults = Object.fromEntries(Object.entries(pack.manifest.config ?? {}).map(([k, c]) => [k, c.default]));
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.deepEqual(voiceOf({ voice_home: '  ', voice_lists: 3, other: 'x' }), {});
});

test('EVERY VOICE KEY FITS A SETTING NAME', () => {
  for (const key of VOICE_KEYS) assert.match(`voice_${key}`, /^[a-z][a-z0-9_]{0,31}$/);
});

test('LABELS ARE KEPT AS THE PACK SETTINGS, BESIDE THE VOICE, AND READ BACK BY KEY', async () => {
  const labels = { books: 'Shelf', 'books.state': 'Where it is', 'books.state.to_read': 'Up next', people: 'Readers' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  assert.deepEqual(u.labels, labels);
  const doc = useCasePack(u)!;
  const pack = value<{ manifest: { config?: Record<string, { type: string; default?: unknown; label?: string }> } }>(await normalise(doc));
  const config = pack.manifest.config ?? {};
  assert.deepEqual(Object.keys(config).sort(), ['label_books', 'label_books__state', 'label_books__state__to_read', 'label_people', 'one_books', 'shared_version', 'speaks', 'voice_home', 'voice_needs_you']);
  assert.equal(config.label_books__state__to_read?.label, 'Label: books, state, to read');
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  /* BOOKS RENAMED SHELF WITH NO SINGULAR: one of it is a shelf, as the display already said. */
  assert.deepEqual(labelsOf(defaults), { ...labels, 'books:one': 'shelf' });
  assert.deepEqual(voiceOf(defaults), u.voice);
  assert.equal(labelSetting('people.role.collaborator'), 'label_people__role__collaborator');
  assert.deepEqual(labelsOf({ label_books: ' ', label_people: 3, voice_home: 'x', label_: 'y' }), {});
  assert.deepEqual(value<UseCase>(normaliseUseCase(DOC())).labels, {});
});

test('A LABEL WHOSE SETTING NAME WOULD BE TOO LONG IS KEPT BY ITS HASH, AND READ BACK THROUGH ITS TITLE', async () => {
  const labels = { 'obligations.category.client_work': 'Pay', 'obligations.category.premises': 'Home', books: 'Shelf', 'a_very_long_list_name_for_books:holds': 'what is kept' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  const long = labelSetting('obligations.category.client_work');
  assert.match(long, /^lk_[0-9a-f]{8}$/);
  assert.notEqual(long, labelSetting('obligations.category.premises'));
  assert.equal(labelSetting('books'), 'label_books', 'a name that fits keeps its form, so nothing a record holds is renamed');
  assert.equal(config[long]?.label, 'Label: obligations, category, client work');
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  assert.deepEqual(labelsOf(defaults, config), { ...labels, 'books:one': 'shelf' });
  assert.deepEqual(labelsOf(defaults), { books: 'Shelf', 'books:one': 'shelf' }, 'without the declared settings a hashed label is left out');
  assert.equal(labelKeyOf(long, 'Label: obligations, category, premises'), null, 'a title that is not the hashed key is not read');
});

test("A LIST'S SINGULAR AND ITS DESCRIPTION LINE ARE LABELS TOO, as one_<list> and holds_<list>", async () => {
  const labels = { books: 'Shelf', 'books:one': 'volume', 'books:holds': 'every volume on the shelf and where each one is' };
  const u = value<UseCase>(normaliseUseCase(DOC({ labels })));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  assert.equal(config.one_books?.default, 'volume');
  /* TITLED BY WHAT THE LIST IS CALLED, the word a person reads on it, and never by its id. */
  assert.equal(config.label_books?.label, 'Name of the Shelf list');
  assert.equal(config.one_books?.label, 'What one is called in the Shelf list');
  assert.equal(config.holds_books?.label, 'What the Shelf list holds');
  /* A LIST ALREADY CALLED A LIST IS NOT CALLED ONE TWICE. */
  const reading = useCasePack(value<UseCase>(normaliseUseCase(DOC({ labels: { books: 'Reading list' } }))))!.config as Record<string, { label?: string }>;
  assert.equal(reading.label_books?.label, 'Name of the Reading list');
  assert.equal(reading.one_books?.label, 'What one is called in the Reading list');
  assert.equal(labelSetting('books:holds'), 'holds_books');
  assert.deepEqual(labelsOf(Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]))), labels);
  const long = 'a line about what is kept here, '.repeat(6);
  assert.equal(refused(normaliseUseCase(DOC({ labels: { 'books:one': long } }))).at, 'labels.books:one', 'a singular is a word');
  assert.ok(normaliseUseCase(DOC({ labels: { 'books:holds': long.slice(0, 180) } })).ok, 'a description is a line');
  assert.equal(refused(normaliseUseCase(DOC({ labels: { 'books:many': 'x' } }))).code, 'VALUE_MALFORMED');
});

test('EVERY LIST A USE CASE HOLDS CAN BE RENAMED, and starts from the words the record already shows', async () => {
  const u = value<UseCase>(normaliseUseCase(DOC({ modules: ['work', 'money-core'], labels: { tasks: 'Tickets' } })));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  const labels = labelsOf(defaults, config);
  /* ITS OWN LIST GIVES NO SINGULAR, so the setting is declared with none and the display keeps making its own. */
  assert.equal(labels.books, 'Books');
  assert.ok(Object.hasOwn(config, 'one_books') && config.one_books?.default === undefined);
  assert.equal(config.one_books?.label, 'What one is called in the Books list');
  /* A MODULE'S LIST IS TITLED BY THE MODULE'S WORD, or the use case's where it renamed it: "Label: put by" read an id. */
  assert.equal(config.label_transactions?.label, 'Name of the Ledger list');
  assert.equal(config.one_obligations?.label, 'What one is called in the Bills and invoices list');
  assert.equal(config.label_tasks?.label, 'Name of the Tickets list');
  assert.equal(config.one_tasks?.label, 'What one is called in the Tickets list');
  /* A MODULE'S LIST SAYS THE MODULE'S WORDS, and one renamed with no singular says one of the new name. */
  assert.equal(labels.transactions, 'Ledger');
  assert.equal(labels['transactions:one'], 'transaction');
  assert.equal(labels['obligations:one'], 'bill or invoice');
  assert.equal(labels.tasks, 'Tickets');
  assert.equal(labels['tasks:one'], 'ticket');
  /* WHAT MONEY KEEPS FOR ITS OWN SUMS HAS NO BOX. */
  for (const list of ['balances', 'fx', 'snapshots']) assert.equal(Object.hasOwn(config, `label_${list}`), false, list);
  /* AND A SINGULAR THE USE CASE GAVE IS KEPT. */
  const given = value<UseCase>(normaliseUseCase(DOC({ modules: ['work'], labels: { tasks: 'Bakes', 'tasks:one': 'loaf' } })));
  assert.equal(((useCasePack(given)!.config as Record<string, { default?: string }>).one_tasks)?.default, 'loaf');
  /* A MODULE THIS BUILD DOES NOT SHIP HAS NO LISTS HERE, and nothing is declared for it. */
  const stranger = value<UseCase>(normaliseUseCase(DOC({ modules: ['bookshelf'] })));
  assert.deepEqual(Object.keys(useCasePack(stranger)!.config as object).filter((k) => !k.startsWith('voice_')).sort(), ['label_books', 'one_books', 'shared_version', 'speaks']);
});

test('A LIST TOO LONG FOR A SETTING NAME KEEPS ITS KEYED TITLE, the one place its hashed setting says which list it is', async () => {
  const list = 'books_kept_upstairs_on_a_shelf';
  const doc = DOC({ pack: { pack: 'usecase-reading', requires: { format: 1, primitives: 1, packs: {} }, declarations: [{ register: list, name: 'Upstairs', one: 'volume', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }] } });
  const u = value<UseCase>(normaliseUseCase(doc));
  const pack = value<{ manifest: { config?: Record<string, { default?: unknown; label?: string }> } }>(await normalise(useCasePack(u)!));
  const config = pack.manifest.config ?? {};
  const name = labelSetting(list);
  assert.match(name, /^lk_[0-9a-f]{8}$/);
  assert.equal(config[name]?.label, `Label: ${list.replace(/_/g, ' ')}`);
  const defaults = Object.fromEntries(Object.entries(config).map(([k, c]) => [k, c.default]));
  assert.deepEqual(labelsOf(defaults, config), { [list]: 'Upstairs', [`${list}:one`]: 'volume' });
});

test("THE LISTS' WORDS FILL WHAT ROOM IS LEFT, names before singulars and own lists first, and never take the pack past its settings", async () => {
  const many = Object.fromEntries(Array.from({ length: 57 }, (_, i) => [`list${i}`, 'x']));
  const u = value<UseCase>(normaliseUseCase(DOC({ modules: ['money-core'], labels: many })));
  const config = useCasePack(u)!.config as Record<string, unknown>;
  assert.equal(Object.keys(config).length, 64);
  /* THREE BOXES OF ROOM: its own list's name, then Money's first two names, and no singular. A name is what the rail
     and the list read; filling list by list spent the room on "one of" first. */
  assert.ok(Object.hasOwn(config, 'label_books') && Object.hasOwn(config, 'label_accounts') && Object.hasOwn(config, 'label_categories'), 'its own list comes first');
  assert.ok(!Object.hasOwn(config, 'one_books'), 'a singular took the room of a name');
  assert.ok(!Object.hasOwn(config, 'label_installments'), 'a module list past the ceiling keeps its own word');
  assert.ok((await normalise(useCasePack(u)!)).ok);
});

test('EVERY FIRST-PARTY LIST A PERSON NAMES HAS ITS WORDS, and each word table names only real lists', () => {
  const lists = Object.values(MODULE_LISTS).flatMap((m) => m.lists);
  /* AND `organisations`, People's since 3.0.0: words for it would give every use case with People two more settings and
     a version to bump, so it keeps its own. */
  /* AND `filing_rules`, Money's since 3.17.0: a list a person keeps and no use case renames, for the same reason. */
  /* AND `plans`, Money's since plans-list-66 in the same unreleased step: made by Money's script from the name its parts share. */
  /* AND `payee_names`, Money's since 3.34.0: the bank's words to names, kept by Money's script, and no use case renames it. */
  /* AND `kpis`, Portfolio's since 1.19.0, each project's key numbers: no use case renames it. */
  assert.deepEqual(lists.filter((l) => !Object.hasOwn(MODULE_WORDS, l)).sort(), ['balances', 'filing_rules', 'fx', 'kpis', 'organisations', 'payee_names', 'plans', 'snapshots']);
  assert.deepEqual(Object.keys(MODULE_WORDS).filter((l) => !lists.includes(l)), []);
});

test('THE VOICE RULE: a use case added goes beside the one speaking, or takes the voice when its id sorts first', () => {
  const on = (...ids: string[]) => ids.map((id) => ({ id, disabled_at: null }));
  assert.equal(voiceWhenAdding([], 'student'), 'speaks', 'nothing speaks yet');
  assert.equal(voiceWhenAdding(on('usecase-personal', 'work'), 'student'), 'beside');
  assert.equal(voiceWhenAdding(on('usecase-student'), 'personal'), 'speaks');
  assert.equal(voiceWhenAdding(on('usecase-student'), 'usecase-student'), 'speaks', 'the one speaking still speaks');
  assert.equal(voiceWhenAdding([{ id: 'usecase-founder', disabled_at: '2026-09-17' }, ...on('usecase-team')], 'guide'), 'speaks', 'a pack switched off does not speak');
  assert.equal(speakingPack([...on('usecase-team', 'usecase-personal')]), 'usecase-personal');
  /* A PERSON'S CHOICE LEADS THE RULE: set to speak, or set not to. */
  assert.equal(speakingPack([{ id: 'usecase-personal', disabled_at: null, speaks: false }, ...on('usecase-student')]), 'usecase-student');
  assert.equal(speakingPack([...on('usecase-personal'), { id: 'usecase-student', disabled_at: null, speaks: true }]), 'usecase-student');
  assert.equal(voiceWhenAdding([...on('usecase-student'), { id: 'usecase-personal', disabled_at: null, speaks: false }], 'team'), 'beside');
  /* UNASKED, ONE A PERSON CHOSE TO SPEAK KEEPS THE VOICE, however the added id sorts. */
  assert.equal(voiceWhenAdding([{ id: 'usecase-student', disabled_at: null, speaks: true }], 'personal'), 'beside');
  const carried = useCasePack({ ...(normaliseUseCase(DOC({})) as { value: UseCase }).value });
  assert.deepEqual((carried?.config as Record<string, unknown>)?.speaks, { type: 'bool', label: 'Speaks for this BrainDog' });
});

test('THE VOICE WRITTEN DOWN: exactly one use case on speaks, and no id sorting first moves it afterwards', () => {
  const three = [
    { id: 'usecase-personal', disabled_at: null },
    { id: 'usecase-student', disabled_at: null, speaks: true },
    { id: 'usecase-team', disabled_at: null, speaks: false },
    { id: 'usecase-guide', disabled_at: '2026-09-17', speaks: true },
  ];
  assert.deepEqual(voiceWrites(three, 'usecase-team'), [
    { id: 'usecase-student', speaks: false },
    { id: 'usecase-team', speaks: true },
    { id: 'usecase-personal', speaks: false },
  ].sort((a, b) => three.findIndex((p) => p.id === a.id) - three.findIndex((p) => p.id === b.id)));
  const after = three.map((p) => ({ ...p, ...(voiceWrites(three, 'usecase-team').find((w) => w.id === p.id) ?? {}) }));
  assert.equal(speakingPack(after), 'usecase-team');
  assert.equal(speakingPack([...after, { id: 'usecase-art', disabled_at: null }]), 'usecase-team', 'a use case added later took the voice');
  assert.deepEqual(voiceWrites(after, 'usecase-team'), [], 'written twice');
  assert.deepEqual(voiceWrites([{ id: 'usecase-personal', disabled_at: null }], 'usecase-personal'), [], 'one alone is not written');
  assert.deepEqual(voiceWrites(three, 'usecase-guide'), [], 'a use case switched off is never made to speak');
});

/* AN ICON, AS AN ADD-ON'S MANIFEST SAYS ONE (1 Nov): optional, a name in the icon set's own spelling, and left out of what
   a file with none reads back as, so no shipped use case's fingerprint moves. */
test('A USE CASE MAY NAME ITS ICON, AND ONE WITH NONE READS BACK WITHOUT IT', () => {
  assert.equal(value<UseCase>(normaliseUseCase(DOC({ icon: 'book-open' }))).icon, 'book-open');
  assert.equal('icon' in value<UseCase>(normaliseUseCase(DOC())), false);
  assert.equal(refused(normaliseUseCase(DOC({ icon: 'Book Open' }))).at, 'icon');
  assert.equal(refused(normaliseUseCase(DOC({ icon: 7 }))).at, 'icon');
});
