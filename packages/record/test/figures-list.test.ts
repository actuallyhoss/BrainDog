/**
 * Every figure the record declares, listed, and not only the ones a page draws.
 *
 * WHAT WAS MISSING. `metric` reads one figure by an id the caller already knows, and `pages` and `page` name a figure
 * only where a block draws it. Nothing the record answered listed its metric declarations, so on a record holding
 * money-core as it ships an agent could find 18 of the 36 figures, and `late-in`, what is late coming in, was not among
 * them. `4c707131` taught MCP to take such a list when a host answers one; this is the list.
 *
 * WHAT IT IS HELD TO IS `metric`'s OWN CHECK, figure by figure. A figure over a list the caller may not read is one
 * `metric` answers `METRIC_UNKNOWN`, so that a name leaks nothing, and a list that named it would hand the name back.
 * The test that matters most here is therefore the one that asks both methods about every declared id and wants the
 * same answer from each.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { createClient } from '../../client/src/index.ts';
import { handlersFor, serveApi } from '../../host/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Figure = { id: string; name: string; format: string | null; list: string | null; pack: string | null; param: boolean };

const value = <T>(r: { ok: boolean }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as unknown as { value: T }).value;
};

/** The money record: the three first-party packs money-core needs, through the owner's door as they ship. */
async function money() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const plan = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    value(await api.installPack({ doc, source: { kind: 'local' }, planHash: plan.diff.planHash, approve: plan.diff.approve } as never, owner));
  }
  const declared = (api.kernel.declarations() as { id: string; kind: string; pack_id: string | null; body: string }[]).filter((d) => d.kind === 'metric');
  return { sql, api, declared };
}

test('EVERY FIGURE A PACK DECLARES IS LISTED, late-in among them, each with its name, its format and the pack that declared it', async () => {
  const { sql, api, declared } = await money();
  const listed = value<Figure[]>(await api.figures(owner));
  assert.deepEqual(
    listed.map((f) => f.id).sort(),
    declared.map((d) => d.id.slice('metric.'.length)).sort(),
    `${listed.length} of ${declared.length} listed`,
  );
  /* Measured on this record before the method existed: 36 declared and 18 drawn; money-core 3.0.0 made it 41, and its
     books and a project's monthly series made it 47, a project page's month (money-core 3.2.0) made it 51, and People's
     four figures over Last in touch with money-core 3.3.0's cash by account, bills due and old balances made it 58, and
     work 1.11.0's own-task bands (after this week, undated, not this week) made it 61, and portfolio 1.12.0's projects
     on track, which its line names, made it 62, and money-core 3.8.0's book-spent-month, which a book's month is drawn
     on, made it 63, and People 3.0.0's count of organisations, moved in from Founder with the organisations list, made it
     64, and money-core 3.15.0's ledger-rows-7d made it 67, and money-core 3.16.0's three signs (ledger-newest-days,
     currencies-held, uncategorised-share-30d) made it 70, and the same unreleased 3.16.0's statement-oldest-days and
     nights-missed-30d made it 72, and its account-ages, each account's last confirmed day, made it 73, and the same
     3.16.0's received-7d and settled-in-7d, the week's money in, and portfolio's project-said made it 76, and the same
     3.16.0's categories-against-direction, categories holding money going the other way, made it 77, and money-core 3.17.0's
     cash-cross-check, the cash figure against the ledger, made it 78, and filed-for-you-30d and filed-today, who filed the
     Ledger, made it 80 (filing-figures-61), and the same 3.17.0's four figures of this month's spending against last made
     it 84 (spend-figures-63), and the same 3.17.0's repeating-overdue, the matched repeating lines whose next day has gone by
     more than three days, made it 85 (repeating-overdue-67), and the same 3.17.0's eight figures of a plan and its parts
     (plan-page-68) and budget-passed-on, the day a category's spending reached its budget (budget-passed-on-68), made it
     94, and the same 3.17.0's seven figures of books, a book's month in, out and net and the four counts of what sits in
     no book (book-figures-71), made it 101, and the same 3.17.0's two more figures of one plan, plan-parts-open, its parts
     still open, and plan-share-left, the share of it still to pay (plan-lead-all-paid-72), made it 103, and the same
     3.17.0's budgets-set, how many budgets are set, now Money's own (budgets-set-73), and its two figures of what is due
     to come into one book and go out of it (book-owed-figures-73) and one book's in, out and net by month, which its
     chart is drawn on (book-page-months-73), made it 109, and plan-share-left went out again when the plan page's leads
     came to wait on two counts held together (plan-lead-one-figure-74), which made it 108, and
     book-lasts-until, the day one book's money runs out (book-lasts-until-76), made it 109, and the four counts of the Ledger by the rule that filed each entry (filing-rules-page-91) made it 113, and the same
     3.17.0's lasts-no-income, how many days the cash lasts with no income (money-lasts-no-income-95), made it 114, and portfolio's projects-lane-earning and projects-with-health, the earning lane and the projects saying
     how they are going (projects-lanes-lines-101), made it 116, and money-core's three of the next unpaid part of each plan (the day, what is left and what is left after it) made it 119, and portfolio 1.19.0's kpis-held and kpi-stale, the key numbers kept and the days since a measure was read, made it 121, and money-core 3.18.0's installments-late, the parts whose day has gone, made it 122, and portfolio 1.22.0's project-staged, project-plan-path and project-plan-roadmap, a project's stages and the shape its plan is kept in, made it 125, and money-core 3.20.0's card-to-pay and card-to-pay-on, what the card has
     to pay and as of when, made it 127, and people 3.9.0's organisations-from-card-texts, the shops a card text named,
     made it 128, and money-core 3.27.0's in-ahead-by-month and out-ahead-by-month, what the cash walk moves in each
     month ahead, made it 130, and money-core 3.29.0's five figures of one account (its balance, its Ledger lines, the gap
     between them and its money in and out by month), lines-by-account, and the ten of a month against its budgets (what
     is left, what came in, what is unfiled and unfiled spent, the budgets' total and the categories with none, the share
     kept, and who was paid, how often and when last), made it 146, and every-month-net, what is left each month, 147, and
     the plan page's eight of one plan (what is late on it, its cancelled parts, what was paid by quarter, and its left, next
     due, after next, parts and parts paid as the page's tiles read them) made it 155, and cash-foreign-share, the share of cash held in other
     currencies, 156, and round 1030's Money and People (net worth with what the add-ons hold, week and year budgets, the
     waiting lines, accounts open, Stripe below zero, organisations you work with and the rest) made it 182, and what the
     packs have added since, books and their figures among them, 213. The number is
     asserted so that a pack shipping fewer figures is noticed here rather than read as the gap closing on its own. */
  assert.equal(declared.length, 213);
  const late = listed.find((f) => f.id === 'late-in');
  assert.deepEqual(late, { id: 'late-in', name: 'Late receivables', format: 'money', list: 'obligations', pack: 'money-core', param: false });
  /* AND THE TEMPLATES, which `metric` refuses bare (`REF_UNKNOWN`, "thing is {{it}}") and answers named, as `project-owed:Kiln`:
     a project's own figures and its monthly series, a book's cash, the day it runs out, its month, its months and what is due to and from it, a category's budget passed and one plan's sixteen since the plan page, one account's five since money-core 3.29.0, and since portfolio 1.19.0 the days since one measure was read, and since portfolio 1.22.0 a project's stages and the shape its plan is kept in, and since money-core 3.32.0 one payee's and one category's weeks, and since then a book's accounts and one filing rule's filings. */
  assert.deepEqual(listed.filter((f) => f.param).map((f) => f.id), ['account-gap', 'account-in-by-month', 'account-lines', 'account-now', 'account-out-by-month', 'book-accounts', 'book-cash', 'book-in-by-month', 'book-in-month', 'book-lasts-until', 'book-net-by-month', 'book-net-month', 'book-out-by-month', 'book-out-month', 'book-owed-by', 'book-owed-to', 'book-spent-month', 'budget-passed-on', 'filing-rule-filed', 'kpi-stale', 'paid-to-by-week', 'plan-after-next-by-plan', 'plan-last-due', 'plan-late', 'plan-left', 'plan-left-by-plan', 'plan-next-due', 'plan-next-due-by-plan', 'plan-paid', 'plan-paid-by-quarter', 'plan-parts', 'plan-parts-by-plan', 'plan-parts-cancelled', 'plan-parts-open', 'plan-parts-paid', 'plan-parts-paid-by-plan', 'project-in-by-month', 'project-in-month', 'project-kept-month', 'project-out-by-month', 'project-out-month', 'project-owed', 'project-plan-path', 'project-plan-roadmap', 'project-said', 'project-staged', 'spent-in-category-by-week']);
  for (const f of listed) {
    const row = declared.find((d) => d.id === `metric.${f.id}`)!;
    assert.equal(f.pack, row.pack_id, f.id);
    assert.equal(f.name, (JSON.parse(row.body) as { name: string }).name, f.id);
  }
  sql.close();
});

test('A FIGURE THE OWNER REWROTE STILL SAYS WHICH PACK IT CAME FROM, where the live row carries no pack', async () => {
  /* `setDeclaration` writes the edit with `pack_id` null, so read off the live row alone, an owner who renamed one
     figure would be told nobody's pack declared it. `detached` is where the record already keeps whose it was. */
  const { sql, api, declared } = await money();
  const row = declared.find((d) => d.id === 'metric.late-in')!;
  const version = (api.kernel.declarations() as { id: string; version: number }[]).find((d) => d.id === row.id)!.version;
  /* `metric` FIRST, because a declaration begins with its kind and the stored body is in JCS order, `compare` first. */
  value(await api.setDeclaration({ body: { metric: 'late-in', ...(JSON.parse(row.body) as object), name: 'Late, to me' }, version } as never, owner));
  const late = value<Figure[]>(await api.figures(owner)).find((f) => f.id === 'late-in');
  assert.equal(late?.name, 'Late, to me');
  assert.equal(late?.pack, 'money-core');
  sql.close();
});

/** Somebody invited at the levels `registers` names and to nothing else, built the way the host builds one. */
async function member(api: Awaited<ReturnType<typeof money>>['api'], person: string, registers: Record<string, string>): Promise<CallContext> {
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.invite({ person, name: person, registers } as never, owner));
  const held = api.kernel.access(person)!;
  return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
}

/**
 * The ids `metric` admits exist for this caller, asked one declared id at a time.
 *
 * ADMITS, AND NOT ANSWERS, because of the one template: `project-owed` asked bare is refused `REF_UNKNOWN`, a figure
 * that exists and wants its parameter, where one over a list she may not read is `METRIC_UNKNOWN`, one that does not.
 */
async function answered(api: Awaited<ReturnType<typeof money>>['api'], declared: readonly { id: string }[], ctx: CallContext): Promise<string[]> {
  const out: string[] = [];
  for (const d of declared) {
    const id = d.id.slice('metric.'.length);
    if (codeOf(await api.metric({ metric: id }, ctx)) !== 'METRIC_UNKNOWN') out.push(id);
  }
  return out.sort();
}

test('SOMEBODY INVITED TO ONE LIST IS LISTED EXACTLY THE FIGURES metric ADMITS TO HER, and no name beyond them', async () => {
  const { sql, api, declared } = await money();
  const wren = await member(api, 'p_9', { accounts: 'read' });
  const listed = value<Figure[]>(await api.figures(wren)).map((f) => f.id).sort();
  assert.deepEqual(listed, await answered(api, declared, wren));
  /* AND THE CONTROL, so an empty list on both sides cannot pass: she reads the accounts, and the figures over them alone.
     `cash-now` is not one since money-core 3.0.0, because it rolls the balances and transactions too, which she cannot read,
     and `cash-as-of` and `balances-stale` are not since money-core 3.16.0, which reads them off the same roll. Round 1030's
     accounts open, held beyond cash and Stripe below zero read the accounts alone, so they are hers too, and so does a book's accounts since money-core added it. */
  assert.deepEqual(listed, ['accounts-open', 'book-accounts', 'card-to-pay', 'card-to-pay-on', 'cash-accounts', 'currencies-held', 'held-beyond-cash', 'stripe-below-zero-count']);
  /* NOR HOW MANY NIGHTS CASH NOW MISSED: a kept line names the lists its figure reads (`figureLists`), so the line of a
     figure held from her is held from her too. Named here because it was listed to her while its line named none. */
  assert.ok(declared.some((d) => d.id === 'metric.nights-missed-30d') && !listed.includes('nights-missed-30d'));
  /* NOR A SUM OF FIGURES SHE MAY NOT READ: Not in the ledger is over Accounts and adds an account's balance less its Ledger
     lines, and was listed to her, and answered, while both of its parts were held from her. */
  assert.ok(declared.some((d) => d.id === 'metric.account-gap') && !listed.includes('account-gap'));
  sql.close();
});

test('AND SOMEBODY WHO MAY ONLY ADD TO A LIST IS LISTED NONE OF ITS FIGURES, since append does not read', async () => {
  /* `metric` asks `readable` and not the ceiling, because a figure over a list somebody may only append to answered
     with the figure, "the same leak one number wide". A list that asked the ceiling would name the three cash ones here. */
  const { sql, api, declared } = await money();
  const sam = await member(api, 'p_8', { accounts: 'append', obligations: 'read' });
  const listed = value<Figure[]>(await api.figures(sam)).map((f) => f.id).sort();
  assert.deepEqual(listed, await answered(api, declared, sam));
  assert.ok(listed.includes('late-in'), 'the obligations figures are hers to read');
  assert.ok(!listed.some((id) => id.startsWith('cash-')), `an append grant was listed a figure: ${listed.join(', ')}`);
  sql.close();
});

test('AND IT IS ROUTED: the client asks the host, READ+, and gets the same list the record answers', async () => {
  /* NOT A STAND-IN FETCH: `serveApi` over the real record, as `packages/client/test/list-include-deleted.test.ts` drives
     it, so the verb the client picks and the group the host checks are the ones a browser and the command line meet. */
  const { sql, api } = await money();
  const handlers = handlersFor(api);
  const sent: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  const client = createClient({ base: 'https://braindog.example', fetch });
  const listed = value<Figure[]>(await client.figures());
  assert.deepEqual(listed, value<Figure[]>(await api.figures(owner)));
  assert.equal(listed.length, 213);
  assert.deepEqual(sent, ['GET /api/figures']);
  sql.close();
});
