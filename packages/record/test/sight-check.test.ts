/**
 * Two doors that placed what a caller may read by one list and answered from another: access decided at one door and
 * assumed at the others.
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR. `automations` asked only the list a rule's row lives in, so an Inbox rule whose
 * step files a Money row for Omar at 91000 was listed, and opened in full, for the member invited to Inbox alone and
 * for the member held to `append` on Money, while `governance` held the same rule's change back from both. And the
 * `metric` door filled a caller's `{{it}}` into a figure over Jobs and let the kernel resolve it against Clients, a list
 * the member invited to Jobs alone cannot read: she was answered `ok` for the hidden client's title and for
 * `clients#1`, and REF_UNKNOWN for a made-up title and for `clients#9`, which is two answers where one leaks nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** A whole-record reader at `write`, held to `append` on Money: she may file a Money row and may not read one. */
const appender: CallContext = { principal: { kind: 'person', id: 'p_m', level: 'write' }, levels: { money: 'append' } };
/** Invited to Inbox alone. */
const inboxOnly: CallContext = { principal: { kind: 'person', id: 'p_i', level: null }, registers: ['inbox'], levels: { inbox: 'read' } };
/** Invited to Money and Inbox, and reads both: every list the rule touches, and not the record as a whole. */
const both: CallContext = { principal: { kind: 'person', id: 'p_b', level: null }, registers: ['money', 'inbox'], levels: { money: 'read', inbox: 'read' } };

const reg = (id: string, name: string, fields: Record<string, unknown>[], title = 'what') => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields: [{ id: title, type: 'text', required: true }, ...fields] } as never,
});

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/* ── a rule is placed by every list it touches, not by its row's list alone ── */

const MONEY = reg('money', 'Money', [
  { id: 'amount', type: 'int' },
  { id: 'payee', type: 'text' },
]);
const INBOX = reg('inbox', 'Inbox', []);
/** The measured case: a rule about Inbox rows whose one step creates a Money row paying Omar 91000. */
const FILE_IT = {
  id: 'rule.file-it',
  kind: 'rule' as const,
  body: {
    rule: 'file-it',
    name: 'Pay from the inbox',
    on: { written: { register: 'inbox', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ create: { register: 'money', bound: 1, fields: { what: 'from the inbox', payee: 'Omar', amount: '91000' } } }],
  },
};
/** A rule that stays on Inbox, so the repair is seen to hold back only what reaches past her lists. */
const TAG_IT = {
  id: 'rule.tag-it',
  kind: 'rule' as const,
  body: { rule: 'tag-it', name: 'Tag the inbox', on: { written: { register: 'inbox', op: ['create'] } }, steps: [{ note: 'seen' }] },
};

test('AN INBOX RULE THAT FILES MONEY ROWS IS SHOWN ONLY TO WHOEVER READS MONEY TOO, as Decide shows its change', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const installed = await api.kernel.install([MONEY, INBOX, FILE_IT, TAG_IT]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const filed = (await api.propose({ question: 'Change the inbox rule?', body_kind: 'change', body: { declaration_id: 'rule.file-it', to: FILE_IT } } as never, owner)) as Out;
  assert.ok(filed.ok, JSON.stringify(filed));

  const listed = async (ctx: CallContext): Promise<string[]> => {
    const out = (await api.automations(undefined, ctx)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    return (out.value as { rule: string }[]).map((a) => a.rule);
  };
  const opened = async (ctx: CallContext): Promise<string> => {
    const out = (await api.automations({ rule: 'file-it' }, ctx)) as Out;
    return out.ok ? 'ok' : String(out.refusal?.code);
  };
  const decides = async (ctx: CallContext): Promise<boolean> => {
    const g = (await api.governance({ status: 'open' }, ctx)) as Out;
    assert.ok(g.ok, JSON.stringify(g));
    return (g.value as { question?: string }[]).some((s) => s.question === 'Change the inbox rule?');
  };

  for (const [who, ctx, sees] of [
    ['the owner', owner, true],
    ['the member reading Money and Inbox', both, true],
    ['the member invited to Inbox alone', inboxOnly, false],
    ['the member held to append on Money', appender, false],
  ] as const) {
    assert.equal((await listed(ctx)).includes('file-it'), sees, `${who}: listed`);
    assert.equal(await opened(ctx), sees ? 'ok' : 'DECLARATION_UNKNOWN', `${who}: opened by name`);
    /* THE SAME ANSWER AS DECIDE'S, which is the point of one predicate: the change and the rule are held alike. */
    assert.equal(await decides(ctx), sees, `${who}: Decide`);
  }
  /* The rule that touches Inbox alone is still hers. */
  assert.ok((await listed(inboxOnly)).includes('tag-it'));
  sql.close();
});

/* ── a figure filled with a caller's words resolves them only against lists she reads ── */

const CLIENTS = reg('clients', 'Clients', [], 'name');
const JOBS = reg('jobs', 'Jobs', [{ id: 'client', type: 'ref', to: 'clients' }]);
const CLIENT_JOBS = {
  id: 'metric.client-jobs',
  kind: 'metric' as const,
  body: { metric: 'client-jobs', name: 'Jobs for a client', source: 'register.jobs', where: 'client is {{it}}', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
};
/** A figure whose `{{it}}` fills a field of Jobs itself, which she reads, so the repair is seen to leave it hers. */
const NAMED_JOBS = {
  id: 'metric.named-jobs',
  kind: 'metric' as const,
  body: { metric: 'named-jobs', name: 'Jobs by name', source: 'register.jobs', where: 'what is {{it}}', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
};

test('A FIGURE FILLED WITH A CLIENT SHE CANNOT READ ANSWERS ALIKE WHETHER THE CLIENT EXISTS OR NOT, and the owner is answered as before', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([CLIENTS, JOBS, CLIENT_JOBS, NAMED_JOBS])).ok);
  const harrow = (await api.create({ register: 'clients', fields: { name: 'Harrow Divorce Case' } } as never, owner)) as Out;
  assert.ok(harrow.ok, JSON.stringify(harrow));
  assert.ok((await api.create({ register: 'jobs', fields: { what: 'Draft the petition', client: (harrow.value as { id: string }).id } } as never, owner)).ok);

  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  /* What a caller can tell from one answer: the whole refusal, or the figure, with her own words taken out. */
  const said = async (it: string, ctx: CallContext): Promise<string> => {
    const out = (await api.metric({ metric: `client-jobs:${it}` }, ctx)) as Out;
    return JSON.stringify(out.ok ? { ok: (out.value as { value: unknown }).value } : out.refusal).split(it).join('<it>');
  };
  const answers = new Map<string, string>();
  for (const it of ['Harrow Divorce Case', 'Nobody At All', 'clients#1', 'clients#9']) answers.set(it, await said(it, wren));
  assert.equal(new Set(answers.values()).size, 1, `her answers told the hidden rows apart: ${JSON.stringify([...answers])}`);

  const own = (await api.metric({ metric: 'named-jobs:Draft the petition' }, wren)) as Out;
  assert.ok(own.ok, JSON.stringify(own));
  assert.equal((own.value as { value: unknown }).value, 1);

  const figure = (await api.metric({ metric: 'client-jobs:Harrow Divorce Case' }, owner)) as Out;
  assert.ok(figure.ok, JSON.stringify(figure));
  assert.equal((figure.value as { value: unknown }).value, 1);
  sql.close();
});

/**
 * THE ONE ANSWER IS NOW `list`'s, AND IT WAS A SENTENCE OF ITS OWN. With no `reads` to hand the kernel's `metric`, the
 * door above listed twice and answered her `FORBIDDEN`, "worked out for a row of a list you cannot read", for all four
 * spellings: one answer, and not the one her list of Jobs gives for the same words, which is `ok` with nothing matched.
 * A tile and the page it links to reading different answers is the drift `metric`'s own header exists to prevent.
 */
test('A FIGURE FILLED WITH A CLIENT SHE CANNOT READ COUNTS WHAT HER LIST OF JOBS COUNTS FOR THE SAME WORDS', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([CLIENTS, JOBS, CLIENT_JOBS])).ok);
  const harrow = (await api.create({ register: 'clients', fields: { name: 'Harrow Divorce Case' } } as never, owner)) as Out;
  assert.ok((await api.create({ register: 'jobs', fields: { what: 'Draft the petition', client: (harrow.value as { id: string }).id } } as never, owner)).ok);
  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  for (const it of ['Harrow Divorce Case', 'Nobody At All', 'clients#1', 'clients#9']) {
    const listed = (await api.list({ register: 'jobs', where: `client is ${it}` } as never, wren)) as Out;
    assert.ok(listed.ok, `${it}: ${JSON.stringify(listed)}`);
    const out = (await api.metric({ metric: `client-jobs:${it}` }, wren)) as Out;
    assert.ok(out.ok, `${it}: ${JSON.stringify(out)}`);
    assert.equal((out.value as { value: unknown }).value, (listed.value as { matched: number }).matched, it);
  }
  sql.close();
});

/* ── a ref written into a list the writer cannot read ── */

/**
 * WHAT WAS MEASURED BEFORE THE REPAIR. The write path resolved a ref against the whole record, so the member invited to
 * Jobs alone at `write`, whose `list` of Clients is refused, filed a Job at `clients#1` and at `CL1` and was answered
 * `ok`, at `clients#2` and `CL2` was told "which was deleted", and at `clients#9` and `CL9` "there is no such row":
 * three answers where `list`'s rule gives one.
 */
test('A JOB POINTED AT A CLIENT SHE CANNOT READ IS REFUSED IN ONE SENTENCE, LIVE, DELETED OR NEVER THERE, and the owner is told which', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const clients = reg('clients', 'Clients', [], 'name');
  (clients.body as unknown as { seq_prefix: string }).seq_prefix = 'CL';
  assert.ok((await api.kernel.install([clients, JOBS])).ok);
  assert.ok((await api.create({ register: 'clients', fields: { name: 'Harrow Divorce Case' } } as never, owner)).ok);
  assert.ok((await api.create({ register: 'clients', fields: { name: 'Closed Matter' } } as never, owner)).ok);
  assert.ok((await api.update({ register: 'clients', seq: 2, patch: { deleted_at: new Date(NOW).toISOString() } } as never, owner)).ok);

  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'write' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.equal(((await api.list({ register: 'clients' } as never, wren)) as Out).ok, false, 'the probe needs a member who cannot read Clients');

  const filed = async (it: string, ctx: CallContext): Promise<string> => {
    const out = (await api.create({ register: 'jobs', fields: { what: 'A job', client: it } } as never, ctx)) as Out;
    return JSON.stringify(out.ok ? 'ok' : out.refusal).split(it).join('<it>');
  };
  const answers = new Map<string, string>();
  for (const it of ['clients#1', 'clients#2', 'clients#9', 'CL1', 'CL2', 'CL9']) answers.set(it, await filed(it, wren));
  assert.equal(new Set(answers.values()).size, 1, `her answers told the hidden rows apart: ${JSON.stringify([...answers])}`);
  assert.match(answers.get('clients#1')!, /there is no such row/);

  /* A Job she writes without naming a client is still hers to write. */
  const own = (await api.create({ register: 'jobs', fields: { what: 'No client yet' } } as never, wren)) as Out;
  assert.ok(own.ok, JSON.stringify(own));

  /* AND AN UPDATE IS ASKED AS A CREATE IS, which no test held: `reads` taken off `update` left every test here green.
     Her own Job, pointed at each spelling in turn, is answered one sentence for all six. */
  const seq = (own.value as { seq: number }).seq;
  const pointed = new Set<string>();
  for (const it of ['clients#1', 'clients#2', 'clients#9', 'CL1', 'CL2', 'CL9']) {
    const out = (await api.update({ register: 'jobs', seq, patch: { client: it } } as never, wren)) as Out;
    pointed.add(JSON.stringify(out.ok ? 'ok' : out.refusal).split(it).join('<it>'));
  }
  assert.deepEqual([...pointed], [answers.get('clients#1')], 'her updates told the hidden rows apart');

  /* The owner reads Clients, and is told what is true of each. */
  assert.equal(await filed('clients#1', owner), '"ok"');
  assert.match(await filed('clients#2', owner), /which was deleted/);
  assert.match(await filed('CL9', owner), /there is no such row/);
  sql.close();
});
