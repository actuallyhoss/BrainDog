/**
 * What landed: only arrivals with a name to say, newest first, filed under the list's name, by name and never by id,
 * with the washed set being only what was not drawn before.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOOLS } from '@braindog/seed';

import { LANDED_MOST, freshOf, landedOf, type Line } from './landed.ts';

const NOW = Date.parse('2026-10-19T10:00:00Z');
const lists = new Map([['payments', 'Payments']]);
const line = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  ts: '2026-10-19T09:48:00Z',
  actor: 'agent:claude',
  kind: 'create',
  register: 'payments',
  seq: 7,
  title: 'Talabat',
  note: null,
  ...over,
});

test('an arrival is drawn with who, what, when and where it was filed', () => {
  const [r] = landedOf([line('a', { note: 'EGP 312' })], lists, null, NOW);
  assert.equal(r?.name, 'Talabat');
  assert.equal(r?.note, 'EGP 312');
  assert.equal(r?.to, 'Payments');
  assert.equal(r?.who, 'Claude');
  assert.equal(r?.kind, 'agent');
  assert.equal(r?.href, '/r/payments/7');
  assert.match(r?.at ?? '', /12 min/u);
});

/** The lists the kernel declares itself, as boot marks them (`kernel: true`): invented ids, so no name decides it. */
const OWN = new Set(['runs-list', 'told-list']);

test('edits, heartbeats, nameless lines and minted ids are not arrivals', () => {
  const rows = landedOf(
    [line('a', { kind: 'edit' }), line('b', { register: 'runs-list' }), line('c', { title: null }), line('d', { title: '01HZX3Y4ABCDEFGHJKMNPQRSTV' }), line('e')],
    lists,
    null,
    NOW,
    new Map(),
    undefined,
    OWN,
  );
  assert.deepEqual(
    rows.map((r) => r.key),
    ['e'],
  );
});

test('what he told an agent is no arrival: a list the kernel declares is left out by its declaration, not its name', () => {
  const told = [1, 2, 3].map((n) => line(`t${n}`, { actor: 'p_me', register: 'told-list', title: `Put the licence price on page ${n}` }));
  const named = new Map([...lists, ['told-list', 'Instructions']]);
  /* MARKED KERNEL, NONE IS DRAWN, so Today never says "You filed 3 into Instructions". */
  assert.deepEqual(landedOf([...told, line('e')], named, 'p_me', NOW, new Map(), undefined, OWN).map((r) => r.key), ['e']);
  /* AND THE SAME LIST UNMARKED IS AN ORDINARY ONE: the name alone decides nothing. */
  assert.equal(landedOf(told, named, 'p_me', NOW).length, 3);
});

test('the reader is You and a list the record does not name is not said', () => {
  const [r] = landedOf([line('a', { actor: 'p_me', register: 'other' })], lists, 'p_me', NOW);
  assert.equal(r?.who, 'You');
  assert.equal(r?.to, null);
});

test('no more than the most are drawn, and no dash is said in a note', () => {
  const many = Array.from({ length: LANDED_MOST + 4 }, (_, i) => line(`k${i}`));
  assert.equal(landedOf(many, lists, null, NOW).length, LANDED_MOST);
  assert.equal(landedOf([line('a', { note: 'paid — filed' })], lists, null, NOW)[0]?.note, 'paid, filed');
});

test('only a line not drawn before is washed, and the first read washes nothing', () => {
  const rows = [{ key: 'a' }, { key: 'b' }];
  assert.equal(freshOf(null, rows).size, 0);
  assert.deepEqual([...freshOf(new Set(['a']), rows)], ['b']);
});

test('a handle is said as a name, and no lowercase slug reaches a line on the seed', () => {
  const [r] = landedOf([line('a', { title: 'nordhaven-dns' })], lists, null, NOW);
  assert.equal(r?.name, 'Nordhaven DNS');
  const lines = TOOLS.map((t, i) => line(`t${i}`, { title: String(t.name), register: 'tools', seq: i + 1 }));
  const drawn = landedOf(lines, lists, null, NOW, new Map(), lines.length);
  assert.equal(drawn.length, TOOLS.length);
  for (const d of drawn) assert.doesNotMatch(d.name, /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u, `"${d.name}" reached the landed lines as a slug`);
});

test('THE READER FILED UNDER HER OWN NAME IS NO ARRIVAL: a new Today said Arrivals 1, Wenna, You, People', () => {
  /* Invented: the reader's minted id and the name the record holds for her. Sign-up files her as a person of her own
     record, and that row was the only news on her first Today. Somebody she filed, and her name filed by somebody
     else, are still arrivals. */
  const me = 'p_01J0WENNA0000000000000000';
  const names = new Map([[me, 'Wenna Tregarth']]);
  const folk = new Map([['folk', 'People']]);
  const own = line('own', { actor: me, register: 'folk', title: 'Wenna Tregarth' });
  const rows = landedOf([own, line('met', { actor: me, register: 'folk', title: 'Ilar Penrose' }), line('told', { register: 'folk', title: 'Wenna Tregarth' })], folk, me, NOW, names);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['met', 'told'],
  );
  /* With nothing else new nothing is drawn, so the tile is not there at all. */
  assert.deepEqual(landedOf([own], folk, me, NOW, names), []);
});

test('rows a script made are its setup and not an arrival (audit 6f AF11)', () => {
  const rows = landedOf([line('s', { actor: 'script:plans_from_names@v1', title: 'Halden licence' }), line('a')], lists, null, NOW);
  assert.deepEqual(rows.map((r) => r.name), ['Talabat']);
});

test("rows the making wrote are not said as added by hand (PK1)", () => {
  const rows = landedOf([line('m', { made: true, title: 'Halden licence' }), line('a')], lists, null, NOW);
  assert.deepEqual(rows.map((r) => r.name), ['Talabat']);
});
