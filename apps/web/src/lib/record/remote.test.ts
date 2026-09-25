/**
 * The register list's translation, held against the sample it replaces and the kernel it now reads.
 *
 * TWO KINDS OF TEST. The first half pins the shapes `treeOf`, `entryOf` and `orderOf` produce. The
 * second is differential: the seed installed into a real kernel over `node:sqlite`, asked the same
 * question the in-browser sample is asked, for every register, every pill value, every relative day
 * and every ref the address can carry, with the row numbers compared. A translation checked only for
 * its shape is a translation that agrees with itself.
 *
 * THE KERNEL'S CLOCK IS THE SEED'S `NOW`, which is what the gates' record runs on and what the sample
 * resolves `today` against, so a relative day means the same day on both sides.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { NOW, ORDER, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { list } from './fixtures/readers.ts';
import { ROWS } from './fixtures/sample.ts';
import { DECIDED, QUESTIONS, ROWSETS } from './fixtures/sample.ts';
import { questionOf, rowsetOf } from './governance.ts';
import { projected, terms } from './find.ts';
import { declOf, entryOf, orderOf, refMapOf, targetsOf, treeOf, type RecordRow, type Refs } from './remote.ts';
import type { Filter } from './schema.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Sql;
}

function rowsOf(k: Kernel, register: string): RecordRow[] {
  const out = k.list({ register, limit: 500 });
  assert.ok(out.ok, `${register}: ${JSON.stringify(out)}`);
  assert.equal(out.value.cursor, null, `${register} holds more than one page of 500, and this walk reads one`);
  return out.value.rows as unknown as RecordRow[];
}

/** The seed in a real kernel, once for the file, with the ULID-to-number map for every register. */
const seeded = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  const refs: Refs = new Map(ORDER.map((r) => [r, refMapOf(r, rowsOf(k, r))] as const));
  return { k, refs };
})();

const bySeq = (a: number, b: number) => a - b;

/** The row numbers the record answers, or the code it refused with. */
function fromRecord(k: Kernel, refs: Refs, register: string, filters: Filter[], q = ''): number[] | string {
  const where = treeOf(register, filters, q, refs);
  const out = k.list({ register, ...(where === undefined ? {} : { where: where as never }), limit: 500 });
  if (!out.ok) return 'refusal' in out ? `${out.refusal.code}: ${out.refusal.fix}` : 'a conflict';
  return (out.value.rows as unknown as RecordRow[]).map((r) => entryOf(register, r, refs).seq).sort(bySeq);
}

/** The row numbers the in-browser sample answers. */
const fromSample = (register: string, filters: Filter[], q = ''): number[] =>
  list(register, { filters, q }).entries.map((e) => e.seq).sort(bySeq);

/** Ask both, and say what differed in words a failure can be read by. */
function differences(k: Kernel, refs: Refs, cases: [register: string, filters: Filter[]][]): string[] {
  const off: string[] = [];
  for (const [register, filters] of cases) {
    const s = fromSample(register, filters);
    const r = fromRecord(k, refs, register, filters);
    if (JSON.stringify(s) !== JSON.stringify(r))
      off.push(`${register} ${filters.map((f) => `${f.field}:${f.op}:${f.values.join(',')}`).join(' ')}  sample ${JSON.stringify(s)}  record ${JSON.stringify(r)}`);
  }
  return off;
}

const chip = (field: string, op: string, ...values: string[]): Filter => ({ field, op, values });

/* ── the shapes ──────────────────────────────────────────────────────────── */

test('nothing narrowing the list is no predicate at all', async () => {
  const { refs } = await seeded;
  assert.equal(treeOf('obligations', [], '', refs), undefined);
  assert.equal(treeOf('obligations', [], '  ...  ', refs), undefined, 'punctuation alone is no search, as it is to the sample');
});

test('A PILL IS A LEAF IN THE RECORD’S WORDS: one value is `is`, two are `in`, and a negation is `not`', async () => {
  const { refs } = await seeded;
  /* A value the address may carry in its readable form, so the declared spelling is what is sent. */
  const found = ORDER.flatMap((register) =>
    (REGISTERS[register]?.fields ?? [])
      .filter((f) => f.type === 'enum')
      .flatMap((f) => (f.values ?? []).filter((v) => v.includes('_')).map((v) => [register, f.id, v] as const)),
  )[0];
  assert.ok(found, 'the seed declares no enum value with an underscore, so the readable spelling is untested');
  const [register, field, value] = found;
  assert.deepEqual(treeOf(register, [chip(field, 'in', value.replace(/_/g, ' '))], '', refs), { field, is: value });
  assert.deepEqual(treeOf(register, [chip(field, 'not-in', value)], '', refs), { field, not: value });

  const values = REGISTERS[register]!.fields.find((f) => f.id === field)!.values!.slice(0, 2);
  assert.deepEqual(treeOf(register, [chip(field, 'in', ...values)], '', refs), { field, in: values });
  assert.deepEqual(treeOf(register, [chip(field, 'not-in', ...values)], '', refs), { field, not_in: values });
  assert.deepEqual(treeOf(register, [chip('due', 'before', 'today')], '', refs), { field: 'due', before: 'today' });
});

test('a lone word the field does not hold is the question about absence, and a negation turns it round', async () => {
  const { refs } = await seeded;
  assert.deepEqual(treeOf('obligations', [chip('due', 'is', 'empty')], '', refs), { field: 'due', empty: true });
  assert.deepEqual(treeOf('obligations', [chip('due', 'in', 'set')], '', refs), { field: 'due', present: true });
  assert.deepEqual(treeOf('obligations', [chip('due', 'not-in', 'empty')], '', refs), { field: 'due', present: true });
});

test('A REF IN THE ADDRESS IS A NUMBER OR A NAME, AND THE RECORD GETS THE ROW’S ULID', async () => {
  const { refs } = await seeded;
  const [register, f] = ORDER.flatMap((r) => (REGISTERS[r]?.fields ?? []).filter((x) => x.type === 'ref' && x.to).map((x) => [r, x] as const))[0]!;
  const to = f.to!;
  const ulid = refs.get(to)?.idOf.get(1);
  assert.ok(ulid, `${to}#1 has no ULID in the map`);
  assert.deepEqual(treeOf(register, [chip(f.id, 'in', '1')], '', refs), { field: f.id, is: ulid });

  const title = String(ROWS[to]?.[0]?.fields[REGISTERS[to]!.title] ?? '');
  assert.deepEqual(treeOf(register, [chip(f.id, 'in', title)], '', refs), { field: f.id, is: ulid }, 'a row named by its title');
  assert.deepEqual(treeOf(register, [chip(f.id, 'in', '9999')], '', refs), { field: f.id, is: '9999' }, 'no such row is passed through');
});

test('THE TWO LIST OPERATORS KEEP THE RECORD’S OWN TWO WORDS, and both arrived as `is`', async () => {
  const { refs } = await seeded;
  /* `things.repos` IS THE FIELD BOTH SIDES WERE MEASURED ON. `repos has portage` answers one row on
     the record and on the sample; `repos is portage` is refused by both engines by name — *"repos is
     a list, which cannot be asked \"is\""* — so the chip that the sample runs could not be asked of
     the record at all. */
  assert.deepEqual(treeOf('things', [chip('repos', 'has', 'portage')], '', refs), { field: 'repos', has: 'portage' });
  assert.deepEqual(treeOf('things', [chip('repos', 'lacks', 'portage')], '', refs), { field: 'repos', lacks: 'portage' });
});

/**
 * AN ELEMENT OF A LIST OF REFS IS THE TARGET ROW’S ULID, the same reconciliation a ref FIELD's value
 * has always had, and this one is held against the RECORD ALONE rather than against the sample.
 *
 * `skills.because` is a `list<ref>` into `learnings`, and the sample cannot be asked about it at all:
 * the sentence dialect wants a ref by its title, every `learnings` title in the seed contains a
 * comma, and a comma separates clauses — so `because has <lesson>` comes back as two refusals. The
 * numbers are therefore read off the seed's own rows, which is the one source both sides were built
 * from, and the record is asked the question the address actually carries: a row number.
 */
test('A LIST OF REFS IS ASKED IN THE IDS THE RECORD STORES, and the address carries a number', async () => {
  const { k, refs } = await seeded;
  /* `skills` IS NOT ON `ORDER`'S WALK, which stops at `session`, so this register's ref targets are
     mapped here. Without `learnings` in the map there is no ULID to send and the number would go
     through unchanged, which is the failure this test would then be unable to see. */
  const withLearnings: Refs = new Map([...refs, ['learnings', refMapOf('learnings', rowsOf(k, 'learnings'))]]);
  const ulid = withLearnings.get('learnings')?.idOf.get(4);
  assert.ok(ulid, 'learnings#4 has no ULID in the map');
  assert.deepEqual(treeOf('skills', [chip('because', 'has', '4')], '', withLearnings), { field: 'because', has: ulid });

  const all = (ROWS.skills ?? []).map((e) => e.seq).sort(bySeq);
  const held = (ROWS.skills ?? [])
    .filter((e) => Array.isArray(e.fields.because) && (e.fields.because as unknown[]).includes(4))
    .map((e) => e.seq)
    .sort(bySeq);
  assert.deepEqual(held, [1, 4], 'the seed no longer has exactly skills#1 and #4 citing learnings#4');
  assert.deepEqual(fromRecord(k, withLearnings, 'skills', [chip('because', 'has', '4')]), held);
  assert.deepEqual(
    fromRecord(k, withLearnings, 'skills', [chip('because', 'lacks', '4')]),
    all.filter((seq) => !held.includes(seq)),
    'a row citing nothing lacks everything',
  );
});

test('THE SEARCH BOX IS EVERY WORD, EACH IN ANY SEARCHABLE FIELD, beside the chips', async () => {
  const { refs } = await seeded;
  const tree = treeOf('obligations', [chip('state', 'in', 'open')], 'Kiln. deposit', refs);
  assert.ok(tree && Array.isArray(tree.all), 'two narrowings are not one `all`');
  const [first, ...words] = tree.all as Record<string, unknown>[];
  assert.deepEqual(first, { field: 'state', is: 'open' });
  assert.equal(words.length, 2, 'punctuation did not separate the words');
  for (const [i, word] of ['kiln', 'deposit'].entries())
    assert.ok(
      (words[i]!.any as { contains: string }[]).every((leaf) => leaf.contains === word),
      `word ${i + 1} is not ${word} in every searchable field`,
    );
});

test('a row comes back in the numbers a person says, and a ref with no row stays the id it is', async () => {
  const { refs } = await seeded;
  const [register, f] = ORDER.flatMap((r) => (REGISTERS[r]?.fields ?? []).filter((x) => x.type === 'ref' && x.to).map((x) => [r, x] as const))[0]!;
  const ulid = refs.get(f.to!)!.idOf.get(1)!;
  const row: RecordRow = { id: 'x', seq: 4, fields: { [f.id]: ulid }, version: 2, created_at: '2026-09-03T12:00:00.000Z' };
  assert.deepEqual(entryOf(register, row, refs), { seq: 4, fields: { [f.id]: 1 }, version: 2, created: row.created_at, by: '' });
  assert.equal(entryOf(register, { ...row, fields: { [f.id]: '01ZZZZZZZZZZZZZZZZZZZZZZZZ' } }, refs).fields[f.id], '01ZZZZZZZZZZZZZZZZZZZZZZZZ');
  assert.ok(targetsOf(register).includes(f.to!));
});

test('a sort is the record’s `order`, and no sort is none', () => {
  assert.deepEqual(orderOf({ field: 'due', dir: 'desc' }), [{ field: 'due', dir: 'desc' }]);
  assert.equal(orderOf(undefined), undefined);
});

/* ── the record and the sample, asked the same questions ─────────────────── */

test('THE RECORD AND THE SAMPLE HOLD THE SAME ROWS UNDER THE SAME NUMBERS, refs included', async () => {
  const { k, refs } = await seeded;
  for (const register of ORDER) {
    assert.deepEqual(fromRecord(k, refs, register, []), fromSample(register, []), `${register} holds different rows`);
    const refFields = (REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'ref');
    for (const row of rowsOf(k, register)) {
      const drawn = entryOf(register, row, refs);
      const seeded = ROWS[register]?.find((e) => e.seq === drawn.seq);
      for (const f of refFields)
        assert.equal(drawn.fields[f.id] ?? null, seeded?.fields[f.id] ?? null, `${register}#${drawn.seq}.${f.id} points somewhere else`);
    }
  }
});

test('EVERY PILL ANSWERS THE SAME ROWS FROM BOTH, in either spelling and either sense', async () => {
  const { k, refs } = await seeded;
  const cases: [string, Filter[]][] = [];
  for (const register of ORDER)
    for (const f of REGISTERS[register]?.fields ?? []) {
      if (f.type !== 'enum') continue;
      const values = f.values ?? [];
      for (const v of values) {
        cases.push([register, [chip(f.id, 'in', v)]]);
        cases.push([register, [chip(f.id, 'in', v.replace(/_/g, ' '))]]);
        cases.push([register, [chip(f.id, 'not-in', v)]]);
      }
      if (values.length > 1) cases.push([register, [chip(f.id, 'in', ...values.slice(0, 2))]]);
    }
  assert.ok(cases.length > 40, `only ${cases.length} pill questions, so the seed lost its enums`);
  assert.deepEqual(differences(k, refs, cases), []);
});

test('EVERY RELATIVE DAY ANSWERS THE SAME ROWS FROM BOTH, before, after and on', async () => {
  const { k, refs } = await seeded;
  const WORDS = ['today', 'tomorrow', 'yesterday', '+30d', '-7d', '+2w', '-1m', 'eom', 'bom', 'eoy', 'boy', '2026-09-01'];
  const cases: [string, Filter[]][] = [];
  for (const register of ORDER)
    for (const f of REGISTERS[register]?.fields ?? []) {
      if (f.type !== 'day' && f.type !== 'instant') continue;
      for (const w of WORDS)
        for (const op of ['before', 'after', 'in', 'not-in']) cases.push([register, [chip(f.id, op, w)]]);
    }
  assert.ok(cases.length > 100, `only ${cases.length} date questions, so the seed lost its dates`);
  assert.deepEqual(differences(k, refs, cases), []);
});

test('EVERY REF ANSWERS THE SAME ROWS FROM BOTH, by number and by name', async () => {
  const { k, refs } = await seeded;
  const cases: [string, Filter[]][] = [];
  for (const register of ORDER)
    for (const f of REGISTERS[register]?.fields ?? []) {
      if (f.type !== 'ref' || !f.to) continue;
      const title = REGISTERS[f.to]?.title;
      for (const target of ROWS[f.to] ?? []) {
        cases.push([register, [chip(f.id, 'in', String(target.seq))]]);
        cases.push([register, [chip(f.id, 'not-in', String(target.seq))]]);
        if (title) cases.push([register, [chip(f.id, 'is', String(target.fields[title] ?? ''))]]);
      }
    }
  assert.ok(cases.length > 20, `only ${cases.length} ref questions`);
  assert.deepEqual(differences(k, refs, cases), []);
});

/**
 * EVERY ELEMENT OF EVERY LIST, HELD AND LACKED, because a chip carrying a list operator is the one
 * chip shape that reached the sample and not the record.
 *
 * `has` and `lacks` fell through to `is`, which a list refuses: the record answered a REFUSAL where
 * the sample answered rows, so this differential is the whole defect in one line. The elements are
 * the seed's own, read off the rows rather than typed, so a list field a pack adds is asked about
 * here the day its rows arrive.
 */
test('EVERY ELEMENT OF EVERY LIST ANSWERS THE SAME ROWS FROM BOTH, held and lacked', async () => {
  const { k, refs } = await seeded;
  const cases: [string, Filter[]][] = [];
  for (const register of ORDER)
    for (const f of REGISTERS[register]?.fields ?? []) {
      if (f.type !== 'list') continue;
      const elements = new Set<string>();
      for (const e of ROWS[register] ?? []) {
        const held = e.fields[f.id];
        if (Array.isArray(held)) for (const v of held as unknown[]) elements.add(String(v));
      }
      for (const v of elements) cases.push([register, [chip(f.id, 'has', v)]], [register, [chip(f.id, 'lacks', v)]]);
    }
  assert.ok(cases.length > 25, `only ${cases.length} list questions, so the seed lost its lists`);
  assert.deepEqual(differences(k, refs, cases), []);
});

test('the question about absence, and two chips at once, answer the same rows from both', async () => {
  const { k, refs } = await seeded;
  const cases: [string, Filter[]][] = [];
  for (const register of ORDER) {
    const fields = REGISTERS[register]?.fields ?? [];
    for (const f of fields) {
      if (f.type === 'secret') continue;
      cases.push([register, [chip(f.id, 'is', 'empty')]], [register, [chip(f.id, 'is', 'set')]], [register, [chip(f.id, 'not-in', 'empty')]]);
    }
    const enums = fields.filter((f) => f.type === 'enum' && (f.values ?? []).length > 0);
    if (enums.length > 1)
      cases.push([register, [chip(enums[0]!.id, 'in', enums[0]!.values![0]!), chip(enums[1]!.id, 'not-in', enums[1]!.values![0]!)]]);
  }
  assert.deepEqual(differences(k, refs, cases), []);
});

/**
 * THE ONE KNOWN DISAGREEMENT, PINNED RATHER THAN HOPED AWAY.
 *
 * The sample's box matches a word PREFIX (`ftsQuery`'s rule), and the record's `contains` is a
 * SUBSTRING. So every row the sample finds, the record finds, and the record also finds a row where
 * the word sits inside a longer one. This walks every word of every searchable value in the seed, and
 * three-letter prefixes of them, and asserts both halves: nothing the sample finds is lost, and every
 * extra row the record finds is the substring case and nothing else.
 */
test('THE SEARCH BOX: nothing the sample finds is lost, and what the record adds is a word inside a word', async () => {
  const { k, refs } = await seeded;
  const lost: string[] = [];
  const added: string[] = [];
  let asked = 0;
  for (const register of ORDER) {
    const words = new Set<string>();
    for (const e of ROWS[register] ?? [])
      for (const w of terms(projected(register, e)) ?? []) {
        words.add(w);
        if (w.length > 3) words.add(w.slice(0, 3));
      }
    for (const word of words) {
      asked++;
      const s = fromSample(register, [], word);
      const r = fromRecord(k, refs, register, [], word);
      if (typeof r === 'string') {
        lost.push(`${register} "${word}": refused, ${r}`);
        continue;
      }
      for (const seq of s) if (!r.includes(seq)) lost.push(`${register} "${word}": #${seq}`);
      for (const seq of r) {
        if (s.includes(seq)) continue;
        const text = projected(register, ROWS[register]!.find((e) => e.seq === seq)!).toLowerCase();
        const insideAWord = text.includes(word) && !(terms(text) ?? []).some((t) => t.startsWith(word));
        added.push(`${register} "${word}" #${seq}${insideAWord ? '' : ' (NOT a word inside a word)'}`);
      }
    }
  }
  assert.ok(asked > 50, `only ${asked} words asked`);
  assert.deepEqual(lost, [], 'the record lost rows the sample finds');
  assert.deepEqual(added.filter((a) => a.includes('NOT')), [], 'the record found a row for a reason that is not the substring rule');

  /* AND THE CASE ITSELF, NAMED. `on` sits inside a longer word in obligations#3's searchable text, so
     the record finds that row and the sample, which matches the starts of words, does not. The day
     this stops holding, the box has become a word-prefix search, and this pin and the note on
     `treeOf` are what change with it. */
  assert.ok(added.length > 0, 'the record and the sample now agree on every word, so the note on treeOf is stale');
  assert.ok(!fromSample('obligations', [], 'on').includes(3), 'the sample now finds obligations#3 for "on"');
  assert.ok((fromRecord(k, refs, 'obligations', [], 'on') as number[]).includes(3), 'the record no longer finds obligations#3 for "on"');
});

/* ── the questions, on both sides ────────────────────────────────────────── */

test('THE SEED FILES THE SAMPLE’S QUESTIONS, so /decide on the gates’ record draws what the sample draws', async () => {
  const { k } = await seeded;
  const open = k.governance('suggestion', { status: 'open' });
  const decided = k.governance('decision');
  assert.ok(open.ok && decided.ok);

  /* THE IDS DIFFER AND THE QUESTIONS DO NOT. The record issues SG1 upward, so a question is matched by
     what it asks, which is the only thing a person reads it by. */
  const asked = new Map(open.value.map((row) => [k.question(String(row.id)), row] as const));
  for (const q of QUESTIONS) {
    const row = asked.get(q.title);
    assert.ok(row, `the record has no open question asking "${q.title}" (${q.id})`);
    const drawn = questionOf(row, q.title, q.rank);
    if (row.body_kind === 'options') assert.deepEqual(drawn.options, q.options, `${q.id}'s options differ`);
    /* EVERYTHING BUT THE VERSION, which is the one the row was read at on each side: 1 on a freshly
       seeded record, and whatever the sample's entries carry. Answering compares against the record's. */
    else {
      const unversioned = (body: ReturnType<typeof rowsetOf>) => body && { ...body, rows: body.rows.map(({ version: _, ...r }) => r) };
      assert.deepEqual(unversioned(rowsetOf(row)), unversioned(ROWSETS[q.id]), `${q.id}'s rows differ`);
    }
  }
  /* LESS WHAT MONEY'S RULES ASKED, which the record asks of its own rows as they go late and the sample does not draw. */
  const filed = open.value.filter((row) => !String(row.opened_by ?? '').startsWith('rule:'));
  assert.equal(filed.length, QUESTIONS.length, 'the record holds an open question the sample does not show');

  for (const q of DECIDED) {
    const row: Record<string, unknown> | undefined = decided.value.find((d) => d.question === q.title);
    assert.ok(row, `the record has no decision on "${q.title}" (${q.id})`);
    assert.deepEqual([row.answer, row.reason], [q.decided?.option, q.decided?.reason], `${q.id}'s answer differs`);
  }
});

test('A LIST A PACK DECLARED WITHOUT ITS NOUN OR ITS CARD STILL HAS BOTH, so the list screen can say what one row is', () => {
  const bare = declOf({ id: 'suppliers', name: 'Suppliers', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'city', type: 'text' }] } as never);
  assert.equal(bare.one, 'supplier');
  assert.deepEqual(bare.mobile, ['name', 'city', 'name']);
  assert.equal(declOf({ id: 'x', name: 'Companies', title: 't', fields: [] } as never).one, 'company');
  assert.equal(declOf({ id: 'x', name: 'Address', title: 't', fields: [] } as never).one, 'address');
  const told = declOf({ ...REGISTERS.tasks! });
  assert.deepEqual([told.one, told.mobile], [REGISTERS.tasks!.one, REGISTERS.tasks!.mobile], 'a declared noun was replaced');
});
