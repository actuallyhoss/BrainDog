/**
 * A rail that follows a person: `setPref` keeps their nav order and the pages they hid, and `boot` answers them.
 *
 * PER PERSON, so a second device and a second person each see their own. A token has no rail, and a key outside the
 * closed list, or a value that is not a list of addresses, is refused before anything is kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: 'read' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  return { api, sql };
}

const prefsOf = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext) => {
  const out = await api.boot(ctx);
  assert.ok(out.ok, JSON.stringify(out));
  /* LESS WHEN THEY LAST OPENED IT, which `boot` itself writes for People to say (`markOpened`): not one of their choices. */
  const held = out.value.me.prefs as Record<string, unknown> | undefined;
  if (held === undefined) return held;
  const { 'record.opened': _opened, ...prefs } = held;
  return prefs;
};

test('A HIDDEN PAGE IS KEPT FOR THE PERSON WHO HID IT, and boot answers it to them and nobody else', async () => {
  const { api, sql } = await record();
  assert.deepEqual(await prefsOf(api, ada), {});

  const hid = await api.setPref({ key: 'nav.hidden', value: ['/p/money', '/p/money', '/p/kiln'] }, ada);
  assert.ok(hid.ok, JSON.stringify(hid));
  assert.deepEqual(hid.value, { key: 'nav.hidden', value: ['/p/money', '/p/kiln'] }, 'an address named twice was kept twice');
  await api.setPref({ key: 'nav.order', value: ['/p/kiln', '/p/money'] }, ada);

  assert.deepEqual(await prefsOf(api, ada), { 'nav.hidden': ['/p/money', '/p/kiln'], 'nav.order': ['/p/kiln', '/p/money'] });
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's rail followed Ada's");
  assert.equal(await prefsOf(api, agent), undefined, 'a token was answered a rail');

  /* Shown again: the list without it, and null takes the key away. */
  await api.setPref({ key: 'nav.hidden', value: ['/p/kiln'] }, ada);
  assert.deepEqual((await prefsOf(api, ada))?.['nav.hidden'], ['/p/kiln']);
  await api.setPref({ key: 'nav.hidden', value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), { 'nav.order': ['/p/kiln', '/p/money'] });
  sql.close();
});

test('A TOKEN, A KEY OUTSIDE THE LIST AND A VALUE THAT IS NOT ADDRESSES ARE REFUSED, and nothing is kept', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['/p/money'] }, agent)), 'FORBIDDEN');
  assert.equal(code(await api.setPref({ key: 'theme', value: ['/p/money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: 'money' }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: Array.from({ length: 501 }, (_, i) => `/p/${i}`) }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: [], extra: 1 } as never, ada)), 'FIELD_UNKNOWN');
  assert.deepEqual(await prefsOf(api, ada), {});
  /* A reader may arrange their own rail: it changes nothing anybody else sees. */
  assert.equal(code(await api.setPref({ key: 'nav.hidden', value: ['/p/money'] }, bo)), 'ok');
  sql.close();
});

test('THE HOME PAGE AND THE NAMES A PERSON GIVES PAGES ARE KEPT FOR THEM, and a wrong shape is refused', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);

  const home = await api.setPref({ key: 'home.page', value: '/p/money' }, ada);
  assert.ok(home.ok, JSON.stringify(home));
  const named = await api.setPref({ key: 'nav.labels', value: { '/p/money': '  Cash  ', '/p/kiln': 'Bake' } }, ada);
  assert.ok(named.ok, JSON.stringify(named));
  assert.deepEqual(named.value, { key: 'nav.labels', value: { '/p/money': 'Cash', '/p/kiln': 'Bake' } }, 'a name was kept with its spaces');
  assert.deepEqual(await prefsOf(api, ada), { 'home.page': '/p/money', 'nav.labels': { '/p/money': 'Cash', '/p/kiln': 'Bake' } });
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else opened on Ada's home page");

  assert.equal(code(await api.setPref({ key: 'home.page', value: 'p/money' }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'home.page', value: ['/p/money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'home.page', value: `/${'x'.repeat(300)}` }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.labels', value: ['/p/money'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.labels', value: { 'p/money': 'Cash' } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.labels', value: { '/p/money': '   ' } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.labels', value: { '/p/money': 'x'.repeat(41) } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.labels', value: { '/p/money': 3 } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'home.page', value: '/p/kiln' }, agent)), 'FORBIDDEN');
  assert.deepEqual(await prefsOf(api, ada), { 'home.page': '/p/money', 'nav.labels': { '/p/money': 'Cash', '/p/kiln': 'Bake' } }, 'a refused value was kept');

  /* null takes each away, and the app opens on Today again. */
  await api.setPref({ key: 'home.page', value: null }, ada);
  await api.setPref({ key: 'nav.labels', value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), {});
  sql.close();
});

test("A RULE A PERSON MUTED LEAVES THEIR NOTICES, its urgent notes still reach them, and nobody else's change", async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_ada' } }).ok,
  );
  const rule = (id: string, notify: Record<string, unknown>) => ({
    id: `rule.${id}`,
    kind: 'rule' as const,
    body: { rule: id, register: 'bills', on: 'create', once_per: ['row'], then: [{ notify }] } as never,
  });
  const installed = await api.kernel.install([
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
    rule('installment-due-soon', { say: 'Rent is due soon' }),
    rule('payment-failed', { say: 'A payment failed', urgent: true }),
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok((await api.create({ register: 'bills', fields: { what: 'Rent' } }, ada)).ok);
  const notes = async (ctx: CallContext) => {
    const news = await api.whatsNew(undefined, ctx);
    assert.ok(news.ok, JSON.stringify(news));
    return news.value.events.filter((e) => e.kind === 'note').map((e) => e.actor).sort();
  };
  assert.deepEqual(await notes(ada), ['rule:installment-due-soon', 'rule:payment-failed']);

  /* BOTH MUTED, and only the plain one goes: what interrupts is never muted. */
  const muted = await api.setPref({ key: 'notify.muted', value: ['rule:installment-due-soon', 'rule:payment-failed', 'rule:installment-due-soon'] }, ada);
  assert.ok(muted.ok, JSON.stringify(muted));
  assert.deepEqual(muted.value, { key: 'notify.muted', value: ['rule:installment-due-soon', 'rule:payment-failed'] }, 'a rule named twice was kept twice');
  assert.deepEqual(await notes(ada), ['rule:payment-failed']);
  assert.deepEqual(await notes(agent), ['rule:payment-failed'], "a token read past its person's mutes");
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's notices followed Ada's mutes");
  assert.deepEqual(await notes(bo), ['rule:installment-due-soon', 'rule:payment-failed'], "Ada's mute hid a rule from Bo");

  /* A MUTED ACTOR IS A RULE BY ITS NAME, and anything else is refused before it is kept. */
  for (const value of [['installment-due-soon'], ['system'], ['rule:'], ['rule:Due Soon'], 'rule:installment-due-soon', [3]])
    assert.equal(code(await api.setPref({ key: 'notify.muted', value }, ada)), 'VALUE_MALFORMED', JSON.stringify(value));
  assert.equal(code(await api.setPref({ key: 'notify.muted', value: [] }, agent)), 'FORBIDDEN');

  /* AND null HEARS IT AGAIN. */
  await api.setPref({ key: 'notify.muted', value: null }, ada);
  assert.deepEqual(await notes(ada), ['rule:installment-due-soon', 'rule:payment-failed']);
  sql.close();
});

test('HOW THE APP LOOKS FOLLOWS THE PERSON: scheme, size, density, contrast and accent are kept for them, and any other word is refused', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  const look = {
    'look.scheme': 'dark',
    'look.size': 'md',
    'look.density': 'compact',
    'look.contrast': true,
    'look.accent': 'Ink blue',
  } as const;
  for (const [key, value] of Object.entries(look)) {
    const kept = await api.setPref({ key, value }, ada);
    assert.ok(kept.ok, JSON.stringify(kept));
    assert.deepEqual(kept.value, { key, value });
  }
  assert.deepEqual(await prefsOf(api, ada), look);
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's screen followed Ada's look");

  /* THE DEVICE'S OWN SCHEME AND THE HOUSE COLOUR ARE CHOICES TOO, and every suggested swatch is one by its name. */
  for (const value of ['light', 'system']) assert.equal(code(await api.setPref({ key: 'look.scheme', value }, ada)), 'ok');
  for (const value of ['House', 'Moss', 'Plum', 'Ochre', 'Teal']) assert.equal(code(await api.setPref({ key: 'look.accent', value }, ada)), 'ok');

  /* ANYTHING ELSE IS REFUSED, NAMING WHAT IT TAKES, and nothing is kept. */
  const wrong: [string, unknown][] = [
    ['look.scheme', 'sepia'],
    ['look.scheme', true],
    ['look.size', 'lg'],
    ['look.size', 16],
    ['look.density', 'cosy'],
    ['look.contrast', 'on'],
    ['look.accent', '#3C72CE'],
    ['look.accent', 'ink blue'],
    ['look.accent', 'Brick'],
  ];
  for (const [key, value] of wrong) assert.equal(code(await api.setPref({ key, value }, ada)), 'VALUE_MALFORMED', `${key} ${JSON.stringify(value)}`);
  const said = await api.setPref({ key: 'look.density', value: 'cosy' }, ada);
  assert.ok(!said.ok);
  assert.equal((said as unknown as { refusal: { fix: string } }).refusal.fix, 'look.density is compact, comfortable, roomy, or null to take it away.');
  assert.equal(code(await api.setPref({ key: 'look.scheme', value: 'dark' }, agent)), 'FORBIDDEN');
  assert.deepEqual(await prefsOf(api, ada), { ...look, 'look.scheme': 'system', 'look.accent': 'Teal' }, 'a refused look was kept');

  /* null takes each away, and the app looks as the device and the record say. */
  for (const key of Object.keys(look)) await api.setPref({ key, value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), {});
  sql.close();
});

test("THE PUBLISHER KEYS A PERSON HAS SEEN FOLLOW THEM: packs.known_keys is kept per add-on, and a wrong shape is refused", async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string; at?: string } }).refusal.code);
  const one = '0123456789abcdef';
  const two = 'fedcba9876543210';
  const kept = await api.setPref({ key: 'packs.known_keys', value: { 'kiln-log': [one, one, two] } }, ada);
  assert.ok(kept.ok, JSON.stringify(kept));
  assert.deepEqual(kept.value, { key: 'packs.known_keys', value: { 'kiln-log': [one, two] } }, 'a key seen twice was kept twice');
  assert.deepEqual(await prefsOf(api, ada), { 'packs.known_keys': { 'kiln-log': [one, two] } });
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's trust followed Ada's");

  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: [one] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: { 'kiln-log': ['not-a-key-id'] } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: { '': [one] } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: { ['x'.repeat(301)]: [one] } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: { 'kiln-log': Array.from({ length: 9 }, (_, i) => i.toString(16).padStart(16, '0')) } }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`pack-${i}`, [one]])) }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'packs.known_keys', value: { 'kiln-log': [one] } }, agent)), 'FORBIDDEN');
  assert.deepEqual(await prefsOf(api, ada), { 'packs.known_keys': { 'kiln-log': [one, two] } }, 'a refused value was kept');

  await api.setPref({ key: 'packs.known_keys', value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), {});
  sql.close();
});

test('THE PHONE BAR IS KEPT FOR THE PERSON, at most four addresses', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  assert.equal(code(await api.setPref({ key: 'nav.tabs', value: ['/p/money', '/p/money', '/p/kiln'] }, ada)), 'ok');
  assert.deepEqual((await prefsOf(api, ada))?.['nav.tabs'], ['/p/money', '/p/kiln']);
  assert.equal(code(await api.setPref({ key: 'nav.tabs', value: ['/a', '/b', '/c', '/d', '/e'] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'nav.tabs', value: ['money'] }, ada)), 'VALUE_MALFORMED');
  sql.close();
});

test('A SHELF KEEPS HOW A COMPONENT IS BUILT FOR THE PERSON, never rows of data', async () => {
  const { api, sql } = await record();
  const code = (r: { ok: boolean }) => (r.ok ? 'ok' : (r as unknown as { refusal: { code: string } }).refusal.code);
  const block = { kind: 'lines', source: 'register.pots', columns: [{ field: 'day' }, { field: 'sum' }], where: 'day is between today and +90d' };
  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: ' Cash ahead ', block }] }, ada)), 'ok');
  assert.deepEqual((await prefsOf(api, ada))?.['shelf.kept'], [{ id: 'c1', name: 'Cash ahead', block }]);
  assert.deepEqual(await prefsOf(api, bo), {}, "somebody else's shelf followed Ada's");

  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: 'x', block: { ...block, authored: 'a | 1' } }] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: 'x', block: { ...block, rows: [1] } }] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: 'a', block }, { id: 'c1', name: 'b', block }] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: '', block }] }, ada)), 'VALUE_MALFORMED');
  assert.equal(code(await api.setPref({ key: 'shelf.kept', value: [{ id: 'c1', name: 'x', block }] }, agent)), 'FORBIDDEN');

  await api.setPref({ key: 'shelf.kept', value: null }, ada);
  assert.deepEqual(await prefsOf(api, ada), {});
  sql.close();
});
