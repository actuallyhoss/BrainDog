/**
 * The the old tool import proposes a closed list's missing value instead of guessing one (Brief 2C of
 * `loop/research-shell-seed-next.md`, finding N5).
 *
 * MEASURED BEFORE THIS FILE, over the export below: a `crypto` asset arrived in Holdings as `other`, a service of kind
 * `registrar` arrived in Services as `hosting` with nothing said at all, and a person whose role was `investor` arrived
 * as `collaborator`. Each list is a closed one a record can grow at run time: an agent's `{ add: { register, values } }`
 * lands at once when the owner's own token files it (DIRECTION §22, `packages/record/test/add-auto.test.ts`) and waits
 * on Decide otherwise. So the word the old tool used is one proposal away, and the guess was the importer's, not the
 * record's.
 *
 * AND THE `## Domains` PARAGRAPH IN A PROJECT'S NOTE held every name, including the ones that also arrive as a Services
 * row pointing at the project: a second copy a person editing the service never sees change
 * (`loop/research-shell-import.md`, "A project's domains"). Only those names leave the note. A planned name becomes no
 * row, so it stays, and on a record with no Services list at all nothing becomes a row and every name stays.
 *
 * THE RECORD HERE IS `createRecordApi` AND NOT THE BARE KERNEL, because landing by rule is the record's (`propose` asks
 * the gate to answer an addition from a key), and a kernel door would have filed every value as an open question and
 * measured the other half only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { declarations } from '@braindog/seed';
import { useCase } from '@braindog/seed/usecases';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../../packages/record/src/index.ts';
import { KEY_PREFIX, planLegacyTool, type Plan } from '../src/legacy.ts';
import { applyPlan, said, type Door } from '../src/import.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const TODAY = '2026-09-22';

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const token: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'studio-mbp', repo: 'braindog', agent: 'claude' },
};
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** One of each: a holding, a service and a person whose word the list has not got, and a project with two names. */
function exportOf(): Record<string, unknown> {
  return {
    takenAt: '2026-09-22T06:00:00.000Z',
    rev: 7,
    db: {
      entities: [{ id: 'fern', name: 'Fern', lane: 'ship', domains: ['fern.example', 'fernly.example'] }],
      /* THE DOCUMENT'S REGISTER KNOWS BOTH NAMES; THE REGISTRAR TABLE BELOW KNOWS ONE. `fernly.example` is planned and
         not bought, so it becomes no Services row and is said in a skip line. */
      domains: [
        { id: 'fern.example', entity: 'fern', state: 'owned', disposition: 'keep' },
        { id: 'fernly.example', entity: 'fern', state: 'planned', note: 'Not bought yet.' },
      ],
      people: [{ id: 'ines', name: 'Ines Example', role: 'investor' }],
    },
    domains: [{ name: 'fern.example', registrar: 'Example Registrar', renews: '2027-03-01', cost_cents: 1200 }],
    services: [{ id: 'reg-1', name: 'Registrar account', provider: 'example', kind: 'registrar', cost_cents: 0 }],
    money: { assets: [{ kind: 'crypto', label: 'Bitcoin', qty: 1, unit_cost_minor: 5_000_000, currency: 'USD', acquired_on: '2026-01-02', matures_on: null, meta_json: null }] },
  };
}

const plan = (): Plan => planLegacyTool(exportOf(), TODAY);
const HOLDING = `${KEY_PREFIX}holding:other:bitcoin:2026-01-02:5000000:1`;

/** Every list the seed declares plus Solo founder's, as `test/legacy.test.ts` opens a record. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const pack = useCase('founder')?.pack as { declarations: Record<string, unknown>[] } | undefined;
  assert.ok(pack, 'Solo founder is not in the catalogue');
  const founder = pack.declarations
    .filter((d) => typeof d.register === 'string')
    .map((d) => {
      const { register, ...rest } = d;
      const fields = rest.fields as { id: string }[];
      const held = fields.some((f) => f.id === 'tags') ? fields : [...fields, { id: 'tags', type: 'list', of: 'text' }];
      return { id: `register.${String(register)}`, kind: 'register' as const, body: { id: register, ...rest, fields: held } as never };
    });
  const put = await api.kernel.install([...declarations(), ...founder]);
  assert.ok(put.ok, put.ok ? '' : `the lists would not install: ${JSON.stringify(put)}`);
  const values = (register: string, field: string): string[] => {
    const decl = api.kernel.declarations().find((d) => d.id === `register.${register}`)!;
    return (JSON.parse(decl.body) as { fields: { id: string; values?: string[] }[] }).fields.find((f) => f.id === field)?.values ?? [];
  };
  const changes = () =>
    sql.all<{ id: string; status: string; body: string }>("SELECT id, status, body FROM suggestion WHERE body_kind = 'change' ORDER BY rowid").map((s) => ({
      id: s.id,
      status: s.status,
      body: JSON.parse(s.body) as { declaration_id: string; to: { add: { register: string; values: Record<string, string[]> } } },
    }));
  /* WHO RESOLVED IT, off the `resolve` event the gate writes beside the decision: the suggestion row names no decision. */
  const decidedBy = (id: string) => sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'resolve' AND target = ?", `suggestion:${id}`)?.actor;
  return { sql, api, values, changes, decidedBy };
}

/**
 * The importer's door onto the record, as the CLI's is onto a host: every call signed by the owner's key.
 *
 * `proposeAs` IS THE ONE THING THE SECOND TEST CHANGES. A person's proposal is never answered by rule (`byRule` in
 * `packages/record/src/index.ts`), so filing as the owner in person is the record's own way of saying "this waits".
 */
function doorOf(api: Awaited<ReturnType<typeof record>>['api'], proposeAs: CallContext = token): Door {
  return {
    schema: (register) => api.schema({ register }, token),
    list: ({ register, limit, cursor }) => api.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }) }, token),
    create: (a) => api.create(a as never, token),
    update: (a) => api.update(a as never, token),
    governance: (a) => api.governance(a, token) as never,
    propose: (a) => api.propose(a as never, proposeAs) as never,
  };
}

const rowOf = (api: Awaited<ReturnType<typeof record>>['api'], register: string, key: string): Record<string, unknown> | undefined => {
  const got = api.kernel.list({ register, limit: 500 });
  assert.ok(got.ok);
  return got.value.rows.map((r) => (r as { fields: Record<string, unknown> }).fields).find((f) => Array.isArray(f.tags) && f.tags.includes(key));
};

test('ON THE OWNER\'S OWN TOKEN each missing value is added to its list at once, and the rows carry the word the old tool used', async () => {
  const { sql, api, values, changes, decidedBy } = await record();
  assert.ok(!values('holdings', 'kind').includes('crypto'), 'the seed already holds crypto, so this measures nothing');
  assert.ok(!values('services', 'kind').includes('registrar'));
  assert.ok(!values('people', 'role').includes('investor'));

  const first = await applyPlan(plan(), doorOf(api), { dryRun: false });
  assert.deepEqual(first.refused, []);

  assert.equal(rowOf(api, 'holdings', HOLDING)?.kind, 'crypto');
  assert.equal(rowOf(api, 'services', `${KEY_PREFIX}service:reg-1`)?.kind, 'registrar');
  assert.equal(rowOf(api, 'people', `${KEY_PREFIX}person:ines`)?.role, 'investor');
  assert.ok(values('holdings', 'kind').includes('crypto'));
  assert.ok(values('services', 'kind').includes('registrar'));
  assert.ok(values('people', 'role').includes('investor'));

  /* ONE ADDITION A LIST, each an `add` of values and nothing else, answered by the rule and not by a person. */
  const filed = changes();
  assert.deepEqual(
    filed.map((c) => [c.body.declaration_id, c.body.to.add]),
    [
      ['register.people', { register: 'people', values: { role: ['investor'] } }],
      ['register.holdings', { register: 'holdings', values: { kind: ['crypto'] } }],
      ['register.services', { register: 'services', values: { kind: ['registrar'] } }],
    ],
  );
  for (const c of filed) {
    assert.equal(c.status, 'resolved', `${c.body.declaration_id} is still waiting`);
    assert.equal(decidedBy(c.id), 'rule:additive');
  }
  const lines = said(first, { dryRun: false, file: 'export.json' });
  assert.ok(
    lines.some((l) => /crypto/u.test(l) && /Holdings/u.test(l)),
    `the report does not say crypto was added to Holdings:\n${lines.join('\n')}`,
  );

  /* AND A SECOND RUN ASKS NOTHING AND CHANGES NOTHING: the list holds the word now, so the row already matches it. */
  const again = await applyPlan(plan(), doorOf(api), { dryRun: false });
  assert.deepEqual(again.refused, []);
  assert.equal(changes().length, 3, 'a second run proposed the same values again');
  assert.deepEqual(again.changes, []);
  sql.close();
});

test('A VALUE THAT WAITS ON DECIDE is filed once, the row carries the list\'s own word until he approves, and the next import moves it', async () => {
  const { sql, api, changes } = await record();
  const door = doorOf(api, owner);

  const first = await applyPlan(plan(), door, { dryRun: false });
  assert.deepEqual(first.refused, []);
  /* THE ROW STILL ARRIVES. Written with a value the list refuses it would be `ENUM_VALUE_UNKNOWN`, and the whole row
     would be lost to a question nobody has answered yet. */
  assert.equal(rowOf(api, 'holdings', HOLDING)?.kind, 'other');
  assert.equal(rowOf(api, 'services', `${KEY_PREFIX}service:reg-1`)?.kind, 'hosting');
  assert.deepEqual(
    changes().map((c) => c.status),
    ['open', 'open', 'open'],
  );
  const lines = said(first, { dryRun: false, file: 'export.json' });
  assert.ok(
    lines.some((l) => /Decide/u.test(l) && /registrar/u.test(l)),
    `the report does not say registrar waits on Decide:\n${lines.join('\n')}`,
  );

  /* ASKED ONCE: the open question is found on Decide and not filed again. */
  await applyPlan(plan(), door, { dryRun: false });
  assert.equal(changes().length, 3, 'a second run filed the same question a second time');

  for (const c of changes()) assert.ok((await api.decide({ id: c.id, decide: { option: 'accept', reason: 'Yes, keep his words.' } }, owner)).ok);
  const after = await applyPlan(plan(), door, { dryRun: false });
  assert.deepEqual(after.refused, []);
  assert.equal(rowOf(api, 'holdings', HOLDING)?.kind, 'crypto');
  assert.equal(rowOf(api, 'services', `${KEY_PREFIX}service:reg-1`)?.kind, 'registrar');
  assert.equal(rowOf(api, 'people', `${KEY_PREFIX}person:ines`)?.role, 'investor');
  assert.equal(changes().length, 3);
  sql.close();
});

test('A VALUE HE TURNED DOWN is not asked again, and the rows keep the list\'s own word', async () => {
  /* THE HALF OF "ASKED ONCE" THE TEST ABOVE DOES NOT REACH. `readDecide` reads Decide at `status: 'all'`, and a reader at
     the default status would see only the open ones, so a rejection would be refiled every night. */
  const { sql, api, changes } = await record();
  const door = doorOf(api, owner);
  await applyPlan(plan(), door, { dryRun: false });
  for (const c of changes()) assert.ok((await api.decide({ id: c.id, decide: { option: 'reject', reason: 'Not these words.' } }, owner)).ok);
  assert.deepEqual(
    changes().map((c) => c.status),
    ['resolved', 'resolved', 'resolved'],
  );

  const after = await applyPlan(plan(), door, { dryRun: false });
  assert.deepEqual(after.refused, []);
  assert.equal(changes().length, 3, 'a value he turned down was filed again');
  assert.equal(rowOf(api, 'holdings', HOLDING)?.kind, 'other');
  const lines = said(after, { dryRun: false, file: 'export.json' });
  assert.ok(
    lines.some((l) => /Proposed before/u.test(l) && /crypto/u.test(l)),
    `the report does not say crypto was asked before:\n${lines.join('\n')}`,
  );
  sql.close();
});

test('A DRY RUN proposes nothing and says what it would propose', async () => {
  const { sql, api, changes } = await record();
  const report = await applyPlan(plan(), doorOf(api), { dryRun: true });
  assert.equal(changes().length, 0);
  const lines = said(report, { dryRun: true, file: 'export.json' });
  assert.ok(
    lines.some((l) => /would be proposed/iu.test(l) && /crypto/u.test(l)),
    `the dry run does not say it would propose crypto:\n${lines.join('\n')}`,
  );
  sql.close();
});

/**
 * A WORD THE OLD MAPPING TRANSLATED ON PURPOSE IS STILL TRANSLATED, AND ONLY A WORD IT HAD NO ANSWER FOR IS PROPOSED.
 *
 * The first cut of the proposal compared the export's word with the fallback and proposed any difference, so the
 * translations the importer had always made became questions: `dns` proposed `dns` beside the `domain` it already
 * meant, `account` proposed `account` beside `saas`, and a service with no kind at all proposed `other`, a word that
 * says nothing to a closed list. On the owner's own token each of those lands at once, so a Services list would have
 * grown three values that name what it already holds. Measured on this export before the repair: all five services
 * below planned a proposal, where only the registrar should.
 */
test('A DELIBERATE TRANSLATION IS NOT PROPOSED: dns is a domain, account is saas, and no kind is the fallback', async () => {
  const exp = exportOf();
  exp.services = [
    { id: 'dns-1', name: 'DNS zone', kind: 'dns' },
    { id: 'acc-1', name: 'Billing account', kind: 'Account' },
    { id: 'none-1', name: 'Something unnamed' },
    { id: 'oth-1', name: 'Something else', kind: 'other' },
    { id: 'reg-1', name: 'Registrar account', kind: 'registrar' },
  ];
  const p = planLegacyTool(exp, TODAY);
  const planned = Object.fromEntries(
    p.rows.filter((r) => r.key.startsWith(`${KEY_PREFIX}service:`)).map((r) => [r.key.slice(`${KEY_PREFIX}service:`.length), [r.fields.kind, r.own ?? null]]),
  );
  assert.deepEqual(planned, {
    'dns-1': ['domain', null],
    'acc-1': ['saas', null],
    'none-1': ['saas', null],
    'oth-1': ['saas', null],
    'reg-1': ['hosting', { kind: 'registrar' }],
  });

  /* AND THE RECORD IS ASKED FOR THE ONE WORD, filed in person so nothing lands by rule and every question stays visible. */
  const { sql, api, changes } = await record();
  const report = await applyPlan(p, doorOf(api, owner), { dryRun: false });
  assert.deepEqual(report.refused, []);
  assert.deepEqual(
    changes()
      .filter((c) => c.body.declaration_id === 'register.services')
      .map((c) => c.body.to.add.values),
    [{ kind: ['registrar'] }],
  );
  sql.close();
});

/* ── the domains paragraph ─────────────────────────────────────────────── */

const noteOf = (p: Plan): string => String(p.rows.find((r) => r.key === `${KEY_PREFIX}project:fern`)!.fields.note ?? '');

test('A NAME THAT ARRIVES AS A SERVICES ROW LEAVES THE PROJECT NOTE, and a planned name stays in it', () => {
  const p = plan();
  const service = p.rows.find((r) => r.key === `${KEY_PREFIX}domain:fern.example`);
  assert.ok(service, 'the registered name is not a Services row at all');
  assert.deepEqual(service.fields.thing, { $ref: `${KEY_PREFIX}project:fern` });
  const note = noteOf(p);
  assert.ok(!note.includes('fern.example'), `a name that is a Services row is still in the note:\n${note}`);
  assert.ok(note.includes('## Domains\n\n- fernly.example'), `the planned name left the note too:\n${note}`);
});

test('ON A RECORD WITH NO SERVICES LIST no name became a row, so every name stays in the note', async () => {
  /* A MEMORY DOOR, because the seed's lists read one another and a record missing only Estate is not one this file
     can install from `declarations()`. Only the two lists the plan's project and holding need answer. */
  const rows: { register: string; fields: Record<string, unknown> }[] = [];
  const has = new Set(['things', 'people', 'holdings']);
  const door: Door = {
    schema: async (register) => (has.has(register) ? { ok: true, value: { register } } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } }),
    list: async () => ({ ok: true, value: { rows: [], cursor: null } }),
    create: async ({ register, fields }) => {
      rows.push({ register, fields });
      return { ok: true, value: { id: `e_${String(rows.length)}`, seq: rows.length, version: 1, fields } };
    },
    update: async () => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Nothing was written before.' } }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async () => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'Nothing is proposed on this door.' } }),
  };
  const report = await applyPlan(plan(), door, { dryRun: false });
  assert.ok(report.plan.skipped.some((s) => /no Services list/u.test(s.reason)), 'the Services rows were not left out');
  const project = rows.find((r) => r.register === 'things');
  assert.ok(project);
  assert.ok(String(project.fields.note).includes('## Domains\n\n- fern.example\n- fernly.example'), `a name was lost with the Services list:\n${String(project.fields.note)}`);
});
