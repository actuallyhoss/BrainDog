/**
 * The record's lines of batch 44, each held by a test that goes red by itself when its line is taken out.
 *
 * 1. Audit 38-39 finding 1, the record's half: `page` draws a signs block for a key the inbox does not reach in the
 *    kernel's quiet words, by the rule `redSigns` asks (`pageReader`).
 * 2. PGS-A01: `pages` drops a page whose blocks are every one held from the caller (kernel `whollyWithheld`).
 * 3. SHL-D07 job 3: `ruleApply` writes every row one press fills under one batch.
 * 4. REC-A06 job 4: `decide` takes `parts`, checks its shape, and hands it to the kernel.
 * 5. AGT-B03: no statement in the record builds one placeholder a value (`agent-reads.test.ts` holds `readFrom`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' },
  session: { client_id: 'run-1', agent: 'claude', host: 'mac', repo: 'kiln' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (r: unknown) => (r as { ok: boolean; refusal?: { code: string; at?: string; fix: string } }).refusal;

const reg = (id: string, name: string, title: string, fields: unknown[], extra: Record<string, unknown> = {}) =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name, title, fields, ...extra } }) as never;
const pageDecl = (slug: string, blocks: unknown[]) => ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title: slug, blocks } }) as never;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  return { api, sql };
}

/* ── 1. the signs on a page, quiet for a key the inbox does not reach ───────────────────── */

const SAYS = 'No account has 1234 in Digits the bank prints.';

test('A SIGNS BLOCK ON A PAGE IS QUIET FOR A KEY THE INBOX DOES NOT REACH, and says the message to the owner', async () => {
  const { api, sql } = await record();
  for (let i = 0; i < 3; i++)
    sql.exec(
      "INSERT INTO inbox_raw (id, ts, channel, body, sha256, state, reason) VALUES (?, ?, 'api', ?, ?, 'review', ?)",
      `raw_${String(i)}`,
      new Date(NOW - 2 * 24 * 3_600_000).toISOString(),
      `CARD 1234 SHOP ${String(i)}`,
      `sha_${String(i)}`,
      SAYS,
    );
  value(await api.kernel.install([pageDecl('health', [{ kind: 'table', source: 'signs', columns: [{ field: 'name' }, { field: 'said' }] }])]));
  const own = JSON.stringify(value(await api.page({ slug: 'health' }, owner)));
  assert.match(own, /Most say/u, 'the owner reads the sign as it was filed');
  const read = JSON.stringify(value(await api.page({ slug: 'health' }, agent)));
  assert.doesNotMatch(read, /1234|Most say|Digits/u);
  assert.match(read, /Messages came in that are not filed yet\./u);
  /* A KEY GIVEN THE INBOX READS IT AS THE OWNER DOES. */
  const reached: CallContext = { ...agent, principal: { ...agent.principal, reach: ['inbox'] } as CallContext['principal'] };
  assert.match(JSON.stringify(value(await api.page({ slug: 'health' }, reached))), /Most say/u);
  sql.close();
});

/* ── 2. a page every block of which is held is not listed ───────────────────────────────── */

test('PAGES LISTS NO PAGE WHOSE BLOCKS ARE EVERY ONE HELD FROM THE CALLER, and keeps one she can read', async () => {
  const { api, sql } = await record();
  value(
    await api.kernel.install([
      reg('areas', 'Areas', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'what', type: 'text' }]),
      reg(
        'steps',
        'Steps',
        'what',
        [{ id: 'what', type: 'text', required: true }, { id: 'area', type: 'ref', to: 'areas' }, { id: 'done', type: 'bool' }, { id: 'rank', type: 'int' }],
        { steps: { of: 'area', done: 'done', order: 'rank' } },
      ),
      /* OVER AREAS, WHICH SHE READS, and drawing each area's next step out of Steps, which she does not. */
      pageDecl('areas-cards', [{ kind: 'cards', source: 'register.areas', columns: [{ field: 'name', as: 'title' }, { field: 'what', as: 'next' }], empty: 'None.' }]),
      pageDecl('areas-table', [{ kind: 'table', source: 'register.areas', columns: [{ field: 'name' }], empty: 'None.' }]),
    ]),
  );
  const area = value<{ id: string }>(await api.create({ register: 'areas', fields: { name: 'Product' } }, owner));
  value(await api.create({ register: 'steps', fields: { what: 'Tell the bank', area: area.id, done: false, rank: 1 } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { areas: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  /* THE PAGE IS HELD WHOLE when she opens it, which is what `pages` now asks. */
  const opened = value<{ blocks: { refusals: { code: string }[] }[] }>(await api.page({ slug: 'areas-cards' }, wren));
  assert.equal(opened.blocks[0]!.refusals[0]?.code, 'FORBIDDEN');
  const hers = value<{ slug: string }[]>(await api.pages(wren)).map((p) => p.slug);
  assert.ok(hers.includes('areas-table'), 'a page she can read went too');
  assert.ok(!hers.includes('areas-cards'), 'a page of held blocks was listed');
  const own = value<{ slug: string }[]>(await api.pages(owner)).map((p) => p.slug);
  assert.ok(own.includes('areas-cards') && own.includes('areas-table'));
  /* AND A GRANT NARROWED TO SOME ROWS OF ONE LIST, over the whole record otherwise: a page of one feed is held from her
     whole, so it is not listed, though she reads every list. */
  value(await api.kernel.install([pageDecl('the-log', [{ kind: 'feed', source: 'activity' }])]));
  const narrowed: CallContext = { ...agent, wheres: { areas: { field: 'name', op: 'eq', value: 'Product' } } as never };
  const theirs = value<{ slug: string }[]>(await api.pages(narrowed)).map((p) => p.slug);
  assert.ok(theirs.includes('areas-table'), 'a page she can read went too');
  assert.ok(!theirs.includes('the-log'), 'a page of one held feed was listed to a narrowed grant');
  assert.ok(value<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'the-log'));
  sql.close();
});

/* ── 3. one press of a rule is one batch ────────────────────────────────────────────────── */

test('ONE PRESS OF A RULE WRITES EVERY ROW IT FILLS UNDER ONE BATCH, so one undo puts the press back', async () => {
  const { api, sql } = await record();
  value(await api.kernel.install([reg('ledger', 'Ledger', 'payee', [{ id: 'payee', type: 'text', required: true }, { id: 'category', type: 'text' }])]));
  for (let i = 0; i < 4; i++) value(api.kernel.create('ledger', { payee: 'Spinneys' }, { actor: 'p_1' }));
  const grocer = { rule: 'grocer', register: 'ledger', when: 'payee is Spinneys', then: [{ set: { field: 'category', to: 'Groceries' } }] };
  value(await api.kernel.install([{ id: 'rule.grocer', kind: 'rule', body: grocer } as never]));
  value(await api.ruleApply({ id: 'grocer' }, owner));
  const batches = sql.all<{ batch: string | null }>("SELECT DISTINCT batch FROM event WHERE actor = 'rule:grocer'");
  const filled = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'ledger' AND json_extract(fields, '$.category') = 'Groceries'")!.n;
  assert.equal(filled, 4);
  assert.equal(batches.length, 1, `the press wrote under ${String(batches.length)} batches`);
  assert.ok(batches[0]!.batch, 'the press wrote under no batch');
  sql.close();
});

/* ── 4. decide takes parts ───────────────────────────────────────────────────────────────── */

test('DECIDE TAKES parts: a list of names is handed to the kernel, and anything else is refused at parts', async () => {
  const { api, sql } = await record();
  const options = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };
  const asked = value<{ id: string }>(await api.propose({ question: 'Fire the kiln on Friday?', body_kind: 'options', body: options } as never, owner));
  const id = String((asked as { id?: string }).id ?? asked);
  /* NOT A LIST: the record's own check. */
  const bad = refusal(await api.decide({ id, decide: { option: 'yes', reason: 'due', parts: 'install:stripe' as never } }, owner));
  assert.equal(bad?.code, 'VALUE_MALFORMED');
  assert.equal(bad?.at, 'parts');
  assert.match(bad?.fix ?? '', /the parts of the change to take/u, 'the record did not check it before anything was asked');
  assert.doesNotMatch(bad?.fix ?? '', /—|install:/u);
  /* A LIST GOES ON TO THE KERNEL, which says parts go only with an arrangement: the record dropped nothing. */
  const passed = refusal(await api.decide({ id, decide: { option: 'yes', reason: 'due', parts: ['rows:tasks'] } }, owner));
  assert.equal(passed?.at, 'parts', JSON.stringify(passed));
  assert.match(passed?.fix ?? '', /arrangement/u);
  sql.close();
});

/* ── 5. one JSON array, never one placeholder a value ─────────────────────────────────────── */

test('NO STATEMENT IN THE RECORD BUILDS ONE PLACEHOLDER A VALUE, so no read binds past the hundred the Durable Object takes', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const built = source.split('\n').flatMap((line, i) => (/\.map\(\(\) => '\?'\)|\.fill\('\?'\)/u.test(line) ? [`index.ts:${String(i + 1)}`] : []));
  assert.deepEqual(built, []);
  assert.ok((source.match(/IN \(SELECT value FROM json_each\(\?\)\)/gu) ?? []).length >= 4);
});
