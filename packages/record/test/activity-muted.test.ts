/**
 * A rule a person muted leaves the activity they read on a page, as it leaves `whatsNew` (`unmuted` in `index.ts`).
 *
 * MUTING CHANGED NOTHING ON TODAY. `notify.muted` filtered `whatsNew` alone, and Today's "since you were away" is a
 * `feed` over `activity`, drawn by the kernel for no reader in particular, so a rule turned off in Settings went on
 * filling the page. The same reading as `test/prefs.test.ts`'s mute case, drawn
 * through `previewPage` (Today's own door) and `page` (an installed page).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_ada', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_ada', level: 'owner' } };

const FEED = { kind: 'feed', heading: 'Since you last looked', source: 'activity', since: 'seen', first: 8 };

type Row = { who: string | null; kind: string | null; count: number };
type Drawn = { feed?: Row[]; matched: number; seen?: string | null; refusals: unknown[] };

test("A RULE A PERSON MUTED LEAVES THE ACTIVITY THEY READ ON A PAGE, its urgent notes stay, and nobody else's feed changes", async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_ada' } }).ok);
  const rule = (id: string, notify: Record<string, unknown>) => ({
    id: `rule.${id}`,
    kind: 'rule' as const,
    body: { rule: id, register: 'bills', on: 'create', once_per: ['row'], then: [{ notify }] } as never,
  });
  const installed = await api.kernel.install([
    { id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
    rule('installment-due-soon', { say: 'Rent is due soon' }),
    rule('payment-failed', { say: 'A payment failed', urgent: true }),
    { id: 'page.since', kind: 'page', body: { page: 'since', title: 'Since', blocks: [FEED] } as never },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const what of ['Rent', 'Water']) assert.ok((await api.create({ register: 'bills', fields: { what } }, ada)).ok);
  assert.ok((await api.invite({ person: 'p_bo', name: 'Bo', level: 'read' } as never, ada)).ok);
  const held = api.kernel.access('p_bo')!;
  const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  /* TODAY'S DOOR AND AN INSTALLED PAGE, each read the way a person's screen reads it. */
  const today = async (ctx: CallContext): Promise<Drawn> => {
    const out = await api.previewPage({ body: { page: 'today', title: 'Today', blocks: [FEED] } }, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as { blocks: Drawn[] }).blocks[0]!;
  };
  const page = async (ctx: CallContext): Promise<Drawn> => {
    const out = await api.page({ slug: 'since' }, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as unknown as { blocks: Drawn[] }).blocks[0]!;
  };
  /* ONE LINE A NOTE HERE, one per bill each rule saw: the rules' names, once each. */
  const notes = (b: Drawn) => [...new Set((b.feed ?? []).filter((r) => r.kind === 'note').map((r) => r.who))].sort();
  const NOTES = ['rule:installment-due-soon', 'rule:payment-failed'];

  const before = await today(ada);
  assert.deepEqual(notes(before), NOTES, JSON.stringify(before.feed));
  assert.deepEqual(notes(await page(ada)), NOTES);

  /* BOTH MUTED, and only the plain one goes, as from `whatsNew`: what interrupts is never muted. Before the repair, both
     stayed on Today. */
  assert.ok((await api.setPref({ key: 'notify.muted', value: NOTES }, ada)).ok);
  const after = await today(ada);
  assert.deepEqual(notes(after), ['rule:payment-failed'], 'a muted rule still filled Today');
  assert.deepEqual(notes(await page(ada)), ['rule:payment-failed'], 'a muted rule still filled an installed page');
  /* THE COUNT FOLLOWS: what the feed says it matched loses the muted notes, every one the line folded. */
  const gone = (before.feed ?? []).filter((r) => r.kind === 'note' && r.who === 'rule:installment-due-soon').reduce((n, r) => n + r.count, 0);
  assert.ok(gone >= 2, JSON.stringify(before.feed));
  assert.equal(after.matched, before.matched - gone);
  /* THE READ MARK IS STILL HERS, on the block it filtered. */
  assert.ok('seen' in after);
  /* AND THE SAME FOR HER AGENT, which reads its person's mutes as it reads her mark. */
  assert.deepEqual(notes(await today(agent)), ['rule:payment-failed'], "a token read past its person's mutes");
  /* NOBODY ELSE'S FEED CHANGES. */
  assert.deepEqual(notes(await today(bo)), NOTES, "Ada's mute hid a rule from Bo");

  /* AND null HEARS IT AGAIN, since the log keeps every line. */
  assert.ok((await api.setPref({ key: 'notify.muted', value: null }, ada)).ok);
  assert.deepEqual(notes(await today(ada)), NOTES);
  sql.close();
});
