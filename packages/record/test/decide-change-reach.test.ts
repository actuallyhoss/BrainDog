/**
 * A `change` is held back from a caller who cannot read a list its declarations touch, as `automations` and `scripts`
 * hold back the rule and the script themselves.
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
/** The member: a whole-record reader at `write`, held to `append` on Money, refused `list money`. */
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
  /* What the kernel's filing check answers a proposal it refuses. */
  const refused = async (question: string, declaration_id: string, to: unknown): Promise<string> => {
    const out = (await api.propose({ question, body_kind: 'change', body: { declaration_id, to } } as never, owner)) as Out;
    assert.equal(out.ok, false, `${question} was filed`);
    return out.refusal!.fix;
  };
  /* A proposal put in the queue by hand, as one filed before the filing check refused its shape would be, so the read
     side is measured on its own (the kernel's `govern-bundle-scope.test.ts` does the same with SG90). */
  let hand = 0;
  const insert = (question: string, declaration_id: string, to: unknown): void => {
    hand += 1;
    const at = new Date(clock.now()).toISOString();
    const id = `SG9${String(hand).padStart(2, '0')}`;
    sql.exec("INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', ?, 'open', 'p_owner', ?)", id, JSON.stringify({ declaration_id, to }), at);
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'p_owner', 'suggest', ?, 'suggestion', ?)",
      `01M0000000000000000000${String(hand).padStart(2, '0')}EV`,
      at,
      `suggestion:${id}`,
      question,
    );
  };
  return { sql, api, clock, shown, file, refused, insert };
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

/* A PAGE BESIDE THE RULE IS ABOUT THE LISTS IT READS, AND HERE THAT IS INBOX. This test once said the opposite: an
   earlier check marked every page `whole`, and the test was a mutation guard for that line, since removing it left the
   other cases green. It was never a measured leak. `page` shows this page to the member invited to Inbox alone, so the
   proposal that declares it is hers too; the same `whole` held a bundle under `register.inbox` carrying a page over
   Inbox from her (below). */
test('A BUNDLE UNDER A RULE ON INBOX THAT ALSO CARRIES A PAGE OF INBOX GOES TO INBOX\'S READERS', async () => {
  const { sql, shown, file } = await record();
  const stays = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };
  const page = {
    id: 'page.inbox',
    kind: 'page' as const,
    body: { page: 'inbox', title: 'Inbox', requires: ['register.inbox'], blocks: [{ kind: 'table', source: 'register.inbox', span: 12, empty: 'Nothing in.' }] },
  };
  await file('Tag the inbox and give it a page?', 'rule.seen', { declarations: [stays, page] });
  assert.equal(await shown(owner, 'Tag the inbox and give it a page?'), true);
  assert.equal(await shown(inboxOnly, 'Tag the inbox and give it a page?'), true, 'held from the member invited to Inbox alone');
  assert.equal(await shown(member, 'Tag the inbox and give it a page?'), true);
  sql.close();
});

/* ── bundles, pages, doors and replaced rules ─────────────────────────────────────────────────────────────────────── */

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

/* UNDER A LIST'S NAME, `holds` ASKED NOTHING BUT THE NAME. A change filed under `register.inbox` was read as about
   Inbox alone and `changeTouches` was never asked, so the filing check was the only gate, and that check does not read
   a script's `reads` and `writes` or an arrival rule's door. Measured before the fix: all three bundles were filed, and
   the member invited to Inbox alone was shown each one whole, the source that posts Omar's Money rows to
   `collector.test` included, while `scripts` answered her `[]`.

   THE KERNEL NOW REFUSES ALL THREE AT FILING, since the filing check asks the same walk (`govern-bundle-scope.test.ts`),
   so they are put in the queue by hand here, as a row filed before that check would be, and the read side is measured
   on its own. */
test("A BUNDLE UNDER A LIST'S NAME IS HELD TO EVERY LIST ITS SCRIPTS AND RULES TOUCH, not only to the name", async () => {
  const { sql, api, shown, file, refused, insert } = await record();
  assert.ok((await api.kernel.install([PAYROLL])).ok);
  const writes = { id: 'script.post', kind: 'script' as const, body: { ...PEEK.body, script: 'post', reads: [], writes: ['money'] } };
  const arrived = {
    id: 'rule.arrived',
    kind: 'rule' as const,
    body: { rule: 'arrived', on: { arrival: { ingest: 'payroll' } }, steps: [{ notify: { say: 'The payroll came in.' } }] },
  };
  const asked = ['Give the inbox a sender, and read Money?', 'Give the inbox a sender, and write Money?', 'Give the inbox a sender, and watch the payroll?'];
  const bundles = [{ declarations: [INBOX2, PEEK] }, { declarations: [INBOX2, writes] }, { declarations: [INBOX2, arrived] }];
  for (const [i, to] of bundles.entries()) {
    assert.match(await refused(asked[i]!, 'register.inbox', to), /reads register\.money/, asked[i]);
    insert(asked[i]!, 'register.inbox', to);
  }
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

/* A PAGE, A DOOR AND A FIGURE WERE `whole`, AND `whole` IS NOT A LIST. A member held to `append` on Money reads the
   whole record, so `whole` let her through. Measured before the fix: she was shown all four, while `page` answered her
   `PAGE_UNKNOWN` for the page and `metric` answered `METRIC_UNKNOWN` for the figure. */
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
    /* AND WHOEVER READS EVERY LIST IT NAMES IS SHOWN IT, as `page pay` and `metric omar` answer her `ok`. Measured at
       `bccc7ea8`, the member invited to Money and Inbox was refused all four, by the same `whole` that held the page
       below. */
    assert.equal(await shown(both, q), true, `${q}: held from a member who reads every list it names`);
  }
  /* A page over Inbox alone goes to a whole-record reader who reads Inbox, the member held on Money included. */
  const inboxPage = { id: 'page.in', kind: 'page' as const, body: { page: 'in', title: 'In', blocks: [{ kind: 'table', source: 'register.inbox', span: 12, empty: 'Nothing in.' }] } };
  await file('A page of the inbox?', 'page.in', inboxPage);
  assert.equal(await shown(member, 'A page of the inbox?'), true);
  sql.close();
});

/* THE LIVE COPY IS TODAY'S, AND AFTER THE ACCEPT TODAY'S IS THE NEW BODY. Measured before the fix: the proposal that
   moved `rule.omar-pay` off Money was held from the member invited to Inbox alone while it was open, and the moment the
   owner accepted it she read the question in `governance`, the decision and its reason, and both again in `whatsNew`. */
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
   created at the decision's instant, so when the change is filed and accepted inside one millisecond (a fixed clock, or
   a Worker whose clock stands still inside a request) the newest version created by `opened` was the new body. Measured
   before this: with no time between the filing and the accept, the member invited to Inbox alone read the question and
   the owner's reason, as she did before that was fixed. The rule installed in the same millisecond as the filing is the
   other side of the same tie, and it has to be read too. */
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

/* ── one rule, the kernel's walk ───────────────────────────────────────────────────────────────────────────────────── */

const table = (id: string, list: string, extra: Record<string, unknown> = {}) => ({
  id: `page.${id}`,
  kind: 'page' as const,
  body: { page: id, title: 'Look', blocks: [{ kind: 'table', source: `register.${list}`, span: 12, empty: 'Nothing.', ...extra }] },
});
const count = (id: string, list: string) => ({
  id: `metric.${id}`,
  kind: 'metric' as const,
  body: { metric: id, name: 'Count', source: `register.${list}`, value: { count: 'what' }, format: 'int', target: { gte: 0 }, window: '30d' },
});
const SEEN = { id: 'rule.seen', kind: 'rule' as const, body: { rule: 'seen', register: 'inbox', then: [{ tag: 'seen' }] } };
const LETTERS = { id: 'ingest.letters', kind: 'ingest' as const, body: { ingest: 'letters', channel: 'email', extract: { what: { after: 'Re ' } }, writes: { register: 'inbox' } } };
const TEMPLATE = {
  id: 'page.each-letter',
  kind: 'page' as const,
  body: { page: 'each-letter', title: 'Letter', for: { register: 'inbox' }, blocks: [{ kind: 'note', tone: 'warn', heading: 'From', span: 12, body: '{{from}}' }] },
};
const GOLD = {
  id: 'ingest.gold',
  kind: 'ingest' as const,
  body: { ingest: 'gold', channel: 'poll', url: 'https://api.gold.example.test/v1/xau', every: '1h', extract: { what: { after: 'rate ' } }, writes: { register: 'inbox' } },
};
/** The kernel test's "every declaration is about Obligations" bundle, over Inbox: a rule, a figure, a table, a stat, a door, a digest, a note and a template. */
const ALL_INBOX = [
  SEEN,
  count('inbox-count', 'inbox'),
  table('inbox', 'inbox'),
  { id: 'page.figures', kind: 'page' as const, body: { page: 'figures', title: 'Figures', blocks: [{ kind: 'stat', cells: [{ metric: 'inbox-count' }] }] } },
  LETTERS,
  {
    id: 'digest.inbox-weekly',
    kind: 'digest' as const,
    body: { digest: 'inbox-weekly', schedule: { day: 'mon', at: '08:00' }, channels: ['in-app'], sections: [{ heading: 'Rows', source: 'register.inbox', as: 'table', columns: [{ field: 'what' }] }] },
  },
  { id: 'page.said', kind: 'page' as const, body: { page: 'said', title: 'Said', blocks: [{ kind: 'note', tone: 'warn', heading: 'Count', span: 12, body: '{{inbox-count}} rows, `{{money-count}}` is text' }] } },
  TEMPLATE,
];

/* A PAGE, A FIGURE, A DOOR OR A DIGEST OVER INBOX ALONE IS INBOX'S. Every page, door, figure and digest was `whole` in
   `changeTouches`, so each of these was held from the member invited to Inbox alone, whom `page`, `pages` and `metric`
   show every one of them. Measured at `bccc7ea8` (`... actual: false, expected: true`), all six were held from her. The
   page per letter was the record's copy reading a template's `{{from}}` as a figure nothing resolved. */
test('A PROPOSAL OVER INBOX ALONE IS SHOWN TO THE MEMBER INVITED TO INBOX, whatever kinds it carries', async () => {
  const { sql, shown, file } = await record();
  const asked: [string, string, unknown][] = [
    ['Give the inbox a page?', 'register.inbox', { declarations: [INBOX2, table('inbox', 'inbox')] }],
    ['Give the inbox a figure?', 'register.inbox', { declarations: [INBOX2, count('inbox-count', 'inbox')] }],
    ['Give the inbox a door and a page?', 'register.inbox', { declarations: [INBOX2, LETTERS, table('inbox', 'inbox')] }],
    ['Give the inbox everything?', 'register.inbox', { declarations: [INBOX2, ...ALL_INBOX] }],
    ['A page per letter?', 'register.inbox', { declarations: [INBOX2, TEMPLATE] }],
    ['A table of the inbox?', 'page.inbox', table('inbox', 'inbox')],
  ];
  for (const [q, name, to] of asked) await file(q, name, to);
  const wrong: string[] = [];
  for (const [q] of asked)
    for (const [who, ctx] of [['owner', owner], ['inboxOnly', inboxOnly], ['both', both], ['member', member]] as const)
      if (!(await shown(ctx, q))) wrong.push(`${q} held from ${who}`);
  assert.deepEqual(wrong, []);
  sql.close();
});

/* WHAT THE RULE STILL HOLDS, each passing at `bccc7ea8` and kept: a door that polls and a page with a log block read
   across the record (`actions` and the log block refuse the member invited to Inbox alone), a prose page names nothing
   and so is about the record as a whole, and a polling door bundled under Inbox's name, which the kernel now refuses at
   filing, is still held from her when it is in the queue from before. */
test('A PROPOSAL THAT READS ACROSS THE RECORD, OR NAMES NOTHING, STAYS WITH WHOEVER READS THE WHOLE RECORD', async () => {
  const { sql, shown, file, refused, insert } = await record();
  await file('Poll the gold rate?', 'ingest.gold', GOLD);
  const feed = {
    id: 'page.feed',
    kind: 'page' as const,
    body: { page: 'feed', title: 'Feed', blocks: [{ kind: 'table', source: 'register.inbox', span: 12, empty: 'None.' }, { kind: 'feed', source: 'activity', span: 12 }] },
  };
  await file('A feed of the inbox?', 'page.feed', feed);
  const prose = { id: 'page.about', kind: 'page' as const, body: { page: 'about', title: 'About', blocks: [{ kind: 'note', tone: 'info', heading: 'Hello', span: 12, body: 'Nothing here counts.' }] } };
  await file('An about page?', 'page.about', prose);
  assert.match(await refused('Give the inbox the gold rate?', 'register.inbox', { declarations: [INBOX2, GOLD] }), /ingest\.gold.*across the whole record/);
  insert('Give the inbox the gold rate?', 'register.inbox', { declarations: [INBOX2, GOLD] });
  for (const q of ['Poll the gold rate?', 'A feed of the inbox?', 'An about page?', 'Give the inbox the gold rate?']) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(member, q), true, `${q}: a whole-record reader who reads Inbox`);
    assert.equal(await shown(inboxOnly, q), false, `${q}: the member invited to Inbox alone`);
    assert.equal(await shown(both, q), false, `${q}: invited to two lists is not the whole record`);
  }
  sql.close();
});

/* A FIGURE NOTHING DECLARES MAY COUNT ANY LIST, so a change reading one is held to whoever reads every list. The page
   counts nothing today, but the figure it names is the one a later change is free to declare over Money, and the page
   installed from this proposal would then read Money. Removing the line in `changeTouches` that adds `ANY_LIST` for
   such a figure left every other test in the record green while the member invited to Inbox alone was shown this
   bundle. */
test('A BUNDLE CARRYING A PAGE OF A FIGURE NOTHING DECLARES IS HELD FROM WHOEVER DOES NOT READ EVERY LIST', async () => {
  const { sql, shown, file } = await record();
  const lost = { id: 'page.lost', kind: 'page' as const, body: { page: 'lost', title: 'Lost', blocks: [{ kind: 'stat', cells: [{ metric: 'nowhere-count' }] }] } };
  await file('Tag the inbox and count nowhere?', 'rule.seen', { declarations: [SEEN, lost] });
  assert.equal(await shown(owner, 'Tag the inbox and count nowhere?'), true);
  assert.equal(await shown(inboxOnly, 'Tag the inbox and count nowhere?'), false, 'the member invited to Inbox alone was shown it');
  assert.equal(await shown(member, 'Tag the inbox and count nowhere?'), false, 'a member held to append on Money was shown it');
  sql.close();
});

/* FOUR KINDS BY HAND. The kernel refuses each at filing now; a row from before is still held from the member invited to
   Inbox alone and from the member held on Money, as `scripts` and `automations` hold them. */
test("A SCRIPT OR AN ARRIVAL RULE OVER MONEY IN THE QUEUE FROM BEFORE IS STILL HELD FROM INBOX'S READERS", async () => {
  const { sql, api, shown, insert } = await record();
  assert.ok((await api.kernel.install([PAYROLL])).ok);
  const arrived = { id: 'rule.arrived', kind: 'rule' as const, body: { rule: 'arrived', on: { arrival: { ingest: 'payroll' } }, steps: [{ notify: { say: 'In.' } }] } };
  const rows: [string, unknown][] = [
    ['Read Money from the inbox?', { declarations: [INBOX2, PEEK] }],
    ['Post to Money from the inbox?', { declarations: [INBOX2, { ...PEEK, id: 'script.post', body: { ...PEEK.body, script: 'post', reads: [], writes: ['money'] } }] }],
    ['Peek at Money?', PEEK],
    ['Tell me when pay arrives?', { declarations: [INBOX2, arrived] }],
  ];
  for (const [q, to] of rows) insert(q, 'register.inbox', to);
  for (const [q] of rows) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(inboxOnly, q), false, q);
    assert.equal(await shown(member, q), false, q);
  }
  sql.close();
});

/* THE NAME A CHANGE IS FILED UNDER IS ALWAYS ONE OF ITS NAMES. An addition is stored as the proposer sent it, `{ add }`
   with no `id`, so the walk finds no declaration in it; without the name it would be a question about no list, and the
   member held to `append` on Money would be shown "Add salary band to Money?" (measured with the name-first line
   removed). */
test("AN ADDITION UNDER A LIST'S NAME IS HELD TO THAT LIST, though the walk finds nothing in it", async () => {
  const { sql, shown, file } = await record();
  await file('Add salary band to Money?', 'register.money', { add: { fields: [{ id: 'salary_band', type: 'text' }] } });
  assert.equal(await shown(owner, 'Add salary band to Money?'), true);
  assert.equal(await shown(member, 'Add salary band to Money?'), false, 'a member held to append on Money was shown it');
  assert.equal(await shown(inboxOnly, 'Add salary band to Money?'), false);
  assert.equal(await shown(both, 'Add salary band to Money?'), true);
  sql.close();
});

/* A PAGE OVER `sessions.live` READS THE RUNS. The record's copy of the walk had no line for a page source that is no
   list, so the change fell to `whole` alone, which a member held to `append` on Session passes. Measured at `bccc7ea8`:
   she was handed the change declaring the runs page while `page runs` answered her `PAGE_UNKNOWN`. A block marked
   `working: true` reads the runs the same way. */
test('A PAGE OVER THE RUNS IS HELD FROM A MEMBER HELD TO append ON SESSION, as page holds the page', async () => {
  const { sql, shown, file } = await record();
  const sessionHeld: CallContext = { principal: { kind: 'person', id: 'p_s', level: 'write' }, levels: { session: 'append' } };
  await file('A runs page?', 'page.runs', { id: 'page.runs', kind: 'page', body: { page: 'runs', title: 'Runs', blocks: [{ kind: 'table', source: 'sessions.live', span: 12, empty: 'Quiet.' }] } });
  await file('A working inbox page?', 'page.win', table('win', 'inbox', { working: true }));
  for (const q of ['A runs page?', 'A working inbox page?']) {
    assert.equal(await shown(owner, q), true, q);
    assert.equal(await shown(sessionHeld, q), false, `${q}: a member refused the runs was handed it`);
  }
  sql.close();
});
