/**
 * `lint(batch, known, owners)`: every check `stageInstall` runs, asked of a record that is planned and not yet written.
 *
 * THE ARRANGER PLANS AN ARRANGEMENT PACK BY PACK, AND NOTHING IS WRITTEN UNTIL THE ACCEPT. So the second pack of one is
 * met at the accept by the record as the first leaves it, and the arranger could only ask the kernel about the record as
 * it stands. Wave forty-eight gave it `declare`'s `stagedFault`, which reads a planned record through `validate` alone,
 * and its checker named the rest: `doorsKept`, a disabled pack, `unreadable`, `unserved`, `stranded`, `tagsNarrowed`
 * and `taggingRefused` read the table and the live list cache. Measured on the wave forty-eight tree through the record
 * (`packages/record/test/arrange-kernel-lint.test.ts`), five arrangements the accept refuses were filed: a pack
 * narrowing Jobs' `tags` under a live `rule.late`, a pack's rule tagging a Jobs whose `tags` is `int` from the pack
 * before it, a pack's page filtering a list the pack before it declares on a field it lacks, a rule asking Slash on a
 * host that answers none, and a page over `rates` beside an update retiring a keyless `fx`.
 *
 * EACH CASE BELOW PUTS WHAT DECIDES IT IN `known` AND NOWHERE ELSE, so a lint that reads the table instead gives the
 * other answer. Against the wave forty-eight kernel, whose `lint` took the batch alone, every one of them failed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Json, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

type Refused = { code: string; fix: string; at?: string } | null;
const said = (r: Refused): string => (r === null ? 'passed' : `${r.code} at ${r.at}: ${r.fix}`);

const register = (id: string, fields: object[], more: Record<string, unknown> = {}): Declaration =>
  ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title: (fields[0] as { id: string }).id, ...more, fields } }) as never;
const WHAT = { id: 'what', type: 'text', required: true };
const LATE: Declaration = { id: 'rule.late', kind: 'rule', body: { rule: 'late', register: 'jobs', when: 'what is Rent', then: [{ tag: 'late' }] } as never };

/** The planned record: the live one, with `put` laid over it and `drop` taken out, as `declare`'s `plannedState` leaves it. */
function planned(k: Kernel, put: readonly Declaration[], drop: readonly string[] = []) {
  const known = new Map<string, Record<string, Json>>();
  const owners = new Map<string, string | null>();
  for (const row of k.declarations()) {
    known.set(row.id, JSON.parse(row.body) as Record<string, Json>);
    owners.set(row.id, row.pack_id);
  }
  for (const d of put) {
    known.set(d.id, d.body);
    owners.set(d.id, d.pack ?? null);
  }
  for (const id of drop) {
    known.delete(id);
    owners.delete(id);
  }
  return { known, owners };
}

async function kernel(...first: Declaration[]): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  if (first.length > 0) {
    const out = await k.install(first);
    assert.ok(out.ok, fixOf(out));
  }
  return k;
}

test('A LIST NARROWING tags UNDER A RULE ONLY THE PLAN HOLDS is refused, and passes against the record as it is', async () => {
  const k = await kernel(register('jobs', [WHAT]));
  const narrowed = register('jobs', [WHAT, { id: 'tags', type: 'list', of: 'enum', values: ['chase'] }]);
  const { known, owners } = planned(k, [LATE]);
  const out = k.lint([narrowed], known, owners);
  assert.equal(out?.code, 'FIELD_TYPE_CHANGED', said(out));
  assert.match(out?.fix ?? '', /rule\.late tags jobs late/u, said(out));
  assert.equal(k.lint([narrowed]), null, 'the live record has no rule tagging Jobs');
});

test('A RULE TAGGING A LIST WHOSE tags THE PLAN MAKES int is refused, where the live list takes the tag', async () => {
  const k = await kernel(register('jobs', [WHAT]));
  const { known, owners } = planned(k, [register('jobs', [WHAT, { id: 'tags', type: 'int' }])]);
  const out = k.lint([LATE], known, owners);
  assert.equal(out?.code, 'FIELD_TYPE_CHANGED', said(out));
  assert.equal(out?.at, 'rule.late.then[0]', said(out));
  assert.equal(k.lint([LATE]), null, said(k.lint([LATE])));
});

test('A PAGE FILTERING A LIST ONLY THE PLAN DECLARES is read against that list: a field it lacks is refused, one it has passes', async () => {
  const k = await kernel();
  const { known, owners } = planned(k, [register('things', [{ id: 'name', type: 'text', required: true }])]);
  const page = (where: string): Declaration =>
    ({ id: 'page.p', kind: 'page', body: { page: 'p', title: 'P', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', where, span: 12, empty: 'None.' }] } }) as never;
  const wrong = k.lint([page('nosuch is x')], known, owners);
  assert.equal(wrong?.code, 'FIELD_UNKNOWN', said(wrong));
  assert.match(wrong?.fix ?? '', /things has no field called nosuch/u, said(wrong));
  assert.equal(k.lint([page('name is x')], known, owners), null);
});

test('A LIST THE PLAN RETIRES IS NOT HELD AGAINST THE BATCH: rates: beside a keyless fx an earlier update drops', async () => {
  const RATE_FIELDS = [
    { id: 'currency', type: 'text', required: true },
    { id: 'base', type: 'text', required: true },
    { id: 'rate', type: 'decimal', required: true },
    { id: 'as_of', type: 'day', index: true, required: true },
  ];
  const k = await kernel(register('fx', RATE_FIELDS));
  const rates = register('rates', RATE_FIELDS, { rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' } });
  assert.match(k.lint([rates])?.fix ?? '', /register\.fx holds this record's rates/u, 'the live fx is in the way');
  const { known, owners } = planned(k, [], ['register.fx']);
  assert.equal(k.lint([rates], known, owners), null, said(k.lint([rates], known, owners)));
});

test('A DOOR A PATTERN IN THE PLAN NAMES is held to verify: { kind: path }, as doorsKept holds a live one', async () => {
  const k = await kernel(register('spend', [{ id: 'merchant', type: 'text', required: true }]));
  const hook = (ingest: string, more: Record<string, unknown>): Declaration =>
    ({
      id: `ingest.${ingest}`,
      kind: 'ingest',
      body: { ingest, channel: 'webhook', match: { all: [{ field: 'body', contains: 'Spent' }] }, extract: { merchant: { text: { between: ['You ', ' EGP'] } } }, writes: { register: 'spend', confidence: 'exact' }, ...more },
    }) as never;
  const door = hook('bank', {});
  const { known, owners } = planned(k, [hook('spent', { door: 'bank', verify: { kind: 'path' } })]);
  const out = k.lint([door], known, owners);
  assert.equal(out?.code, 'DECLARATION_INVALID', said(out));
  assert.match(out?.fix ?? '', /ingest\.bank is the door ingest\.spent reads/u, said(out));
  assert.equal(k.lint([door]), null, said(k.lint([door])));
});

test('A RULE ASKING SLASH IS REFUSED ON A HOST THAT ANSWERS NONE, whatever record it is read against', async () => {
  const k = await kernel(register('jobs', [WHAT]));
  const ask: Declaration = {
    id: 'rule.rate',
    kind: 'rule',
    body: { rule: 'rate', on: { written: { register: 'jobs', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash: { question: 'What rate for {{what}}?', about: ['what'], as: 'rate', shape: 'number' } }] } as never,
  };
  const { known, owners } = planned(k, []);
  assert.equal(k.lint([ask], known, owners)?.code, 'NOT_IN_THIS_BUILD');
});

test('THE LIVE LIST CACHE IS PUT BACK after a planned lint, so the next write reads the record and not the plan', async () => {
  const k = await kernel(register('jobs', [WHAT]));
  const { known, owners } = planned(k, [], ['register.jobs']);
  k.lint([LATE], known, owners);
  const made = k.create('jobs', { what: 'Rent' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
});

/* ─── WHICH LIST WAS THERE BEFORE ───

   `keylessBeside` tells a keyless list the record already holds to move its rows and go, and a list arriving to take
   another id. Which is which is read from `held`, the ids before the batch, and for a planned lint that is the plan's and
   not the table's. The checker measured both turns below on the first cut: with `fx` held alone and `rates` arriving in
   the same batch, `fx` first, the fix read "register.fx has sat beside register.rates ... since before" of a `rates` the
   record had never held; and with `heldIn` reading the table under a plan, every test in this package still passed. */
const RATE_FIELDS = [
  { id: 'currency', type: 'text', required: true },
  { id: 'base', type: 'text', required: true },
  { id: 'rate', type: 'decimal', required: true },
  { id: 'as_of', type: 'day', index: true, required: true },
];
const RATES = register('rates', RATE_FIELDS, { rates: { currency: 'currency', base: 'base', rate: 'rate', as_of: 'as_of' } });

test('A HELD fx UPDATED BESIDE A rates THE SAME BATCH BRINGS is told what the arriving rates is told, in either order', async () => {
  const k = await kernel(register('fx', RATE_FIELDS));
  const fx = register('fx', [...RATE_FIELDS, { id: 'source', type: 'text' }]);
  for (const batch of [[fx, RATES], [RATES, fx]]) {
    const out = k.lint(batch);
    assert.equal(out?.code, 'DECLARATION_INVALID', said(out));
    assert.match(out?.fix ?? '', /register\.fx holds this record's rates and declares no rates:/u, said(out));
    assert.doesNotMatch(out?.fix ?? '', /has sat beside/u, said(out));
  }
});

test('A KEYLESS fx THE PLAN RETIRES AND A LATER PACK DECLARES AGAIN, BESIDE THE PLAN\'S rates, is told it is arriving', async () => {
  const k = await kernel(register('fx', RATE_FIELDS));
  const { known, owners } = planned(k, [RATES], ['register.fx']);
  const out = k.lint([{ ...register('fx', RATE_FIELDS), pack: 'later' }], known, owners);
  assert.equal(out?.code, 'DECLARATION_INVALID', said(out));
  assert.match(out?.fix ?? '', /Install fx under another id/u, said(out));
});
