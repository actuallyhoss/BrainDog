/**
 * The Share sheet says what a guest will see, money included (the owner's call of 21 October): amounts start hidden for
 * anybody outside his team and shown for somebody on it, a press on Amounts is his from then on, and the line under the
 * sentence names the lists, the project's own figures, or that every amount is hidden and why.
 *
 * AGAINST A REAL RECORD over `node:sqlite`, loaded by a runtime URL as `share-state.test.ts` loads it, so the line is
 * drawn from the record's own `sharePreview`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { amountsPressed, seenSaid, sharesOf, startOf, stateOfShare, withPicked, type Decls, type MoneyShown, type SheetState, type Subject, type With } from './share-state.ts';

const at = (p: string) => new URL(`../../../../../packages/${p}`, import.meta.url).href;
const { createRecordApi } = await import(at('record/src/index.ts'));
const { openSqlite } = await import(at('kernel/test/sqlite.ts'));

const NOW = Date.UTC(2026, 9, 21, 12);

const BODIES = {
  things: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'revenue', label: 'Earned in a year', type: 'money' }],
    scopes: { repos: 'repos' },
  },
  tasks: { id: 'tasks', name: 'Tasks', one: 'task', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: {} }] },
  notes: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: {} }] },
};
const DECLS: Decls = BODIES;

const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } });
  value(await api.kernel.install(Object.values(BODIES).map((body) => ({ id: `register.${body.id}`, kind: 'register', body }))));
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const kiln = value<{ id: string }>(await api.create({ register: 'things', fields: { name: 'Kiln', revenue: { amount: 1_840_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Glaze test', thing: kiln.id } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'Kiln temperatures', thing: kiln.id } }, owner));
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_pri', 'priya@example.test', 'Priya', NULL)");
  return { api, kiln: kiln.id };
}

/* PRIYA HOLDS NO ROLE HERE: a guest, outside his team. LEE IS A MEMBER OF IT. */
const PRIYA: With = { kind: 'person', id: 'p_pri', name: 'Priya', team: false };
const LEE: With = { kind: 'person', id: 'p_lee', name: 'Lee', team: true };

/** The record's money said as the screen draws it: "GBP 18,400.00" is "£18,400". */
const drawn = (said: string): string => said.replace(/^GBP ([\d,]+)\.00$/u, '£$1');

test('AMOUNTS START HIDDEN OUTSIDE HIS TEAM AND SHOWN INSIDE IT, and a press on Amounts is his from then on', () => {
  const kiln: Subject = { kind: 'project', register: 'things', seq: 1, id: 'e_kiln', name: 'Kiln' };
  const start = startOf(kiln);
  assert.equal(withPicked(start, PRIYA, NOW).hide.amounts, true, 'a guest was shown amounts');
  assert.equal(withPicked(start, { kind: 'email', email: 'sam@marlow.example' }, NOW).hide.amounts, true, 'an address was shown amounts');
  assert.equal(withPicked(start, { kind: 'group', id: 'g_1', name: 'Accountants', people: 2 }, NOW).hide.amounts, true, 'a group was shown amounts');
  assert.equal(withPicked(start, LEE, NOW).hide.amounts, false, 'his team was not shown amounts');
  /* HE SHOWS THEM TO PRIYA, and picking somebody else then keeps what he chose. */
  const shown = amountsPressed(withPicked(start, PRIYA, NOW));
  assert.equal(shown.hide.amounts, false);
  assert.equal(withPicked(shown, { kind: 'email', email: 'sam@marlow.example' }, NOW).hide.amounts, false);
  assert.equal(withPicked(amountsPressed(withPicked(start, LEE, NOW)), LEE, NOW).hide.amounts, true);
  /* A SHARE KEPT OPENS AS IT WAS KEPT, whoever it is with. */
  const kept = stateOfShare({ who: { kind: 'person', id: 'p_pri' }, who_name: 'Priya', can: 'view', caps: null, hide: null, when: null }, kiln);
  assert.equal(kept.hide.amounts, false);
  assert.equal(withPicked(kept, PRIYA, NOW).hide.amounts, false);
});

test("THE LINE SAYS WHAT PRIYA WILL SEE OF KILN, ITS MONEY INCLUDED, from sharePreview's own answer", async () => {
  const { api, kiln } = await record();
  const subject: Subject = { kind: 'project', register: 'things', seq: 1, id: kiln, name: 'Kiln' };
  const said = async (s: SheetState): Promise<string | null> => {
    const shares = sharesOf(s, subject, NOW, DECLS);
    const got = value<{ lists: { list: string; name: string; rows: number }[]; money: MoneyShown }>(await api.sharePreview({ share: shares[0] }, owner));
    return seenSaid(s.with!, subject, got.lists, got.money, s.hide, drawn);
  };
  const guest = withPicked(startOf(subject), PRIYA, NOW);
  assert.equal(await said(guest), "Priya will see Kiln's tasks and notes, with every amount hidden, since they're not on your team.");
  assert.equal(await said(amountsPressed(guest)), "Priya will see Kiln's tasks, notes and money: £18,400 earned in a year.");
  assert.equal(await said(amountsPressed(amountsPressed(guest))), "Priya will see Kiln's tasks and notes, with every amount hidden.");
  assert.equal(await said(withPicked(startOf(subject), LEE, NOW)), "Lee will see Kiln's tasks, notes and money: £18,400 earned in a year.");
  /* ONE LIST OF THE PROJECT STILL SHOWS THE PROJECT'S OWN ROW, its money among it, and the line says so. */
  assert.equal(await said({ ...withPicked(startOf(subject), LEE, NOW), what: { kind: 'list', list: 'tasks' } }), "Lee will see Kiln's tasks and money: £18,400 earned in a year.");
});
