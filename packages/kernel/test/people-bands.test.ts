/**
 * A model's answer about two people, settled in three bands (ENG-B04 job 1, decision 2 of the engine's second part).
 *
 * Under 0.6 the pair is dropped. From 0.6 it is one question that carries its evidence sentence. From 0.9 it is still
 * a question, one that says the two look certain, unless the host hands the switch on AND something else the record
 * holds agrees (`corroborated`): then the pair is folded as one batch with one Undo, and never again once undone.
 *
 * THE WRITE HERE IS A STAND-IN FOR THE KERNEL'S MERGE DOOR. Only the kernel's own `peopleDeps` may set the merge field,
 * and it calls the old name with the switch off, so until it hands `settleVerdicts` the switch these tests write the
 * fold's lines the way the door logs them (`doorWrite`) and take them back the way `undoMerge` does (`undo`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { BAND_ASK, BAND_SURE, corroborated, fileVerdicts, pairHash, settleVerdicts, type PeopleDeps, type Settlement } from '../src/people.ts';
import type { MeetsFields } from '../src/roles.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 3);

const MEETS: MeetsFields = { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', self: 'self' };

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'email', type: 'email', unique: true, index: true },
  { id: 'handles', type: 'list', of: 'text' },
  { id: 'keys', type: 'list', of: 'text' },
  { id: 'aliases', type: 'list', of: 'text' },
  { id: 'self', type: 'bool' },
  { id: 'projects', type: 'list', of: 'ref', to: 'things' },
  { id: 'met', type: 'list', of: 'text' },
  { id: 'merged_into', type: 'ref', to: 'people' },
];

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = { id: 'register.people', kind: 'register', body: { id: 'people', name: 'People', title: 'name', meets: MEETS, fields: FIELDS } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE]));
  return { k, sql };
}

type Stored = { id: string; seq: number | null; version: number; fields: string; deleted_at: string | null };
let minted = 0;
const mint = (): string => `band_${++minted}`;

/** One line of the log as the merge door writes it: an edit of a field, or a delete, under the fold's batch and note. */
function line(sql: NodeSql, kind: string, id: string, field: string | null, from: unknown, to: unknown, o: { batch?: string; note?: string }): void {
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch) VALUES (?, ?, 'record', ?, ?, 'entry', ?, ?, ?, ?, ?)",
    mint(),
    new Date(NOW).toISOString(),
    kind,
    `entry:${id}`,
    field,
    from === undefined || from === null ? null : JSON.stringify(from),
    to === undefined || to === null ? null : JSON.stringify(to),
    o.note ?? null,
    o.batch ?? null,
  );
}

/** The merge door's write, stood in for: compare-and-set on the version, the row changed, one line a field. */
const doorWrite =
  (sql: NodeSql): PeopleDeps['write'] =>
  (_register, ref, patch, o = {}) => {
    const row = sql.one<Stored>('SELECT id, seq, version, fields, deleted_at FROM entry WHERE id = ?', ref ?? '');
    if (!row) return { ok: false, refusal: { code: 'ROW_UNKNOWN', fix: 'Nobody there.' } } as never;
    if (o.version !== undefined && o.version !== row.version) return { ok: false, refusal: { code: 'VERSION_STALE', fix: 'It changed.' } } as never;
    const fields = JSON.parse(row.fields) as Record<string, unknown>;
    let gone = row.deleted_at;
    for (const [key, to] of Object.entries(patch)) {
      if (key === 'deleted_at') {
        gone = String(to);
        line(sql, 'delete', row.id, null, null, null, o);
        continue;
      }
      line(sql, 'edit', row.id, key, fields[key], to, o);
      fields[key] = to;
    }
    sql.exec('UPDATE entry SET fields = ?, deleted_at = ?, version = ? WHERE id = ?', JSON.stringify(fields), gone, row.version + 1, row.id);
    return { ok: true, value: { id: row.id, seq: row.seq, version: row.version + 1, fields } };
  };

/** A batch taken back as `undoMerge` takes one: newest line first, each row put back, and an edit logged for each. */
function undo(sql: NodeSql, batch: string): void {
  const lines = sql.all<{ kind: string; target: string; field: string | null; from_v: string | null; to_v: string | null }>(
    'SELECT kind, target, field, from_v, to_v FROM event WHERE batch = ? ORDER BY rowid DESC',
    batch,
  );
  for (const l of lines) {
    const id = l.target.replace(/^entry:/u, '');
    const row = sql.one<Stored>('SELECT id, seq, version, fields, deleted_at FROM entry WHERE id = ?', id)!;
    const fields = JSON.parse(row.fields) as Record<string, unknown>;
    if (l.kind === 'delete') {
      sql.exec('UPDATE entry SET deleted_at = NULL, version = version + 1 WHERE id = ?', id);
      continue;
    }
    const before = l.from_v === null ? null : (JSON.parse(l.from_v) as unknown);
    if (before === null) delete fields[l.field!];
    else fields[l.field!] = before;
    sql.exec('UPDATE entry SET fields = ?, version = version + 1 WHERE id = ?', JSON.stringify(fields), id);
    line(sql, 'edit', id, l.field, l.to_v === null ? null : JSON.parse(l.to_v), before, {});
  }
}

/** What the record hands `people.ts`, built as `peopleDeps` builds it, with the parts a test sets. */
function deps(k: Kernel, sql: NodeSql, more: Partial<PeopleDeps> = {}): PeopleDeps {
  return {
    sql,
    nowMs: NOW,
    mint,
    list: { register: 'people', fields: MEETS, declared: true, declaredFields: FIELDS },
    project: () => null,
    nameOf: k.nameOf,
    titleOf: k.titleOfRow,
    write: doorWrite(sql),
    propose: (p) => k.propose(p, 'system'),
    ...more,
  };
}

const person = (k: Kernel, fields: Record<string, unknown>): Entry => value<Entry>(k.create('people', fields, OWNER));
const open = (sql: NodeSql): string[] => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);
const live = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people' AND deleted_at IS NULL")?.n);
const folded = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field = 'merged_into' AND to_v IS NOT NULL")?.n);

/** A resolve job about these pairs and a model's answer to it, each pair at its own score. */
function answer(pairs: readonly [Entry, Entry, number, boolean?][]): { payload: string; result: unknown } {
  const rows: Record<string, [string, string]> = {};
  const verdicts = pairs.map(([a, b, confidence, same = true]) => {
    const hash = pairHash(a.id, b.id);
    rows[hash] = [a.id, b.id];
    return { hash, same, confidence };
  });
  return { payload: JSON.stringify({ pairs: [], rows }), result: { verdicts } };
}

/** Two people on one project, which is the plainest thing that agrees with a model. */
function onOneProject(k: Kernel): [Entry, Entry] {
  const project = value<Entry>(k.create('things', { name: 'Lanternfish' }, OWNER));
  return [person(k, { name: 'Teodor Vance', projects: [project.id] }), person(k, { name: 'Teo Vance', handles: ['github:tvance'], projects: [project.id] })];
}

test('THE BAND EDGES ARE 0.6 AND 0.9, and a verdict under the first is dropped: no question, nothing written', async () => {
  const { k, sql } = await record();
  assert.equal(BAND_ASK, 0.6);
  assert.equal(BAND_SURE, 0.9);
  const [a, b] = onOneProject(k);
  const low = answer([[a, b, 0.59]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql), low.payload, low.result, { fold: true }));
  assert.deepEqual(out, { questions: [], folds: [] });
  /* AND A PAIR THE MODEL SAID ARE TWO PEOPLE, however sure it is of that. */
  const apart = answer([[a, b, 0.99, false]]);
  assert.deepEqual(value<Settlement>(settleVerdicts(deps(k, sql), apart.payload, apart.result, { fold: true })), { questions: [], folds: [] });
  assert.deepEqual(open(sql), []);
  assert.equal(live(sql), 2);
  sql.close();
});

test('THE MIDDLE BAND IS ONE QUESTION THAT CARRIES ITS EVIDENCE SENTENCE, and folds nothing even with the switch on', async () => {
  const { k, sql } = await record();
  const [a, b] = onOneProject(k);
  const said = answer([[a, b, 0.7]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql), said.payload, said.result, { fold: true }));
  assert.equal(out.questions.length, 1);
  assert.deepEqual(out.folds, []);
  assert.deepEqual(open(sql), out.questions);
  const question = k.question(out.questions[0]!) ?? '';
  assert.match(question, /^Are Teodor Vance .*and Teo Vance .*one person\? They look likely to be\. Both are on Lanternfish\. Yes keeps Teodor Vance /u);
  assert.doesNotMatch(question, /people#|@|—/u);
  assert.equal(live(sql), 2);
  assert.equal(folded(sql), 0);
  /* ASKED ONCE: the same answer again opens nothing. */
  assert.deepEqual(value<Settlement>(settleVerdicts(deps(k, sql), said.payload, said.result, { fold: true })), { questions: [], folds: [] });
  sql.close();
});

test('THE TOP BAND IS A QUESTION WHILE THE SWITCH IS OFF, which is the default and what the old name still does', async () => {
  const { k, sql } = await record();
  const [a, b] = onOneProject(k);
  const said = answer([[a, b, 0.97]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql, { write: () => assert.fail('the top band wrote with its switch off') }), said.payload, said.result));
  assert.equal(out.questions.length, 1);
  assert.deepEqual(out.folds, []);
  assert.match(k.question(out.questions[0]!) ?? '', /one person\? They look certain to be\. Both are on Lanternfish\. Yes keeps Teodor Vance /u);
  assert.equal(live(sql), 2);
  sql.close();

  /* `fileVerdicts` IS THE SAME SETTLING WITH THE SWITCH OFF, answering the questions as it always did. */
  const second = await record();
  const [c, d] = onOneProject(second.k);
  const again = answer([[c, d, 0.97]]);
  const ids = value<string[]>(fileVerdicts(deps(second.k, second.sql, { write: () => assert.fail('the old name folded') }), again.payload, again.result));
  assert.deepEqual(ids, open(second.sql));
  assert.equal(ids.length, 1);
  second.sql.close();
});

test('THE TOP BAND, SWITCHED ON AND CORROBORATED, FOLDS THE PAIR AS ONE BATCH WITH ONE UNDO, and never again once undone', async () => {
  const { k, sql } = await record();
  const [a, b] = onOneProject(k);
  const said = answer([[a, b, 0.95]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql), said.payload, said.result, { fold: true }));
  assert.deepEqual(out.questions, []);
  assert.equal(out.folds.length, 1);
  const [fold] = out.folds;
  assert.deepEqual({ kept: fold!.kept, folded: fold!.folded }, { kept: a.id, folded: b.id }, 'the older of the two is kept');
  assert.equal(fold!.sentence, 'Both are on Lanternfish.');
  assert.deepEqual(open(sql), [], 'a fold was asked about as well');
  assert.equal(live(sql), 1);

  /* ONE BATCH, SIGNED BY WHOEVER THE HOST'S WRITE SIGNS AS, saying who and why in names. */
  const lines = sql.all<{ batch: string | null; note: string | null; target: string }>("SELECT batch, note, target FROM event WHERE kind IN ('edit', 'delete') ORDER BY rowid");
  assert.deepEqual([...new Set(lines.map((l) => l.batch))], [fold!.batch]);
  assert.deepEqual([...new Set(lines.map((l) => l.note))], ['Matched Teo Vance with Teodor Vance: Both are on Lanternfish.']);
  assert.deepEqual([...new Set(lines.map((l) => l.target))].sort(), [`entry:${a.id}`, `entry:${b.id}`].sort());
  /* WHAT THE FOLDED ONE HELD IS CARRIED: the handle, and the other name as an alias. */
  const kept = k.get(a.id)!.fields;
  assert.deepEqual(kept.handles, ['github:tvance']);
  assert.deepEqual(kept.aliases, ['Teo Vance']);

  /* ONE UNDO GIVES TWO PEOPLE BACK, and the pair is never folded or asked about again, whatever the score. */
  undo(sql, fold!.batch);
  assert.equal(live(sql), 2);
  assert.equal(k.get(a.id)!.fields.handles, undefined);
  const before = folded(sql);
  for (const confidence of [0.95, 1, 0.7]) {
    const more = answer([[a, b, confidence]]);
    assert.deepEqual(value<Settlement>(settleVerdicts(deps(k, sql), more.payload, more.result, { fold: true })), { questions: [], folds: [] });
  }
  assert.equal(folded(sql), before);
  assert.equal(live(sql), 2);
  assert.deepEqual(open(sql), []);
  sql.close();
});

test('A PAIR NOTHING ELSE AGREES ABOUT NEVER FOLDS, whatever the score: it is a question', async () => {
  const { k, sql } = await record();
  const a = person(k, { name: 'Ines Carvalho', email: 'ines@harborline.example' });
  const b = person(k, { name: 'I. Carvalho', handles: ['github:icarvalho'] });
  assert.equal(corroborated(deps(k, sql), a.id, b.id), false);
  const said = answer([[a, b, 1]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql, { write: () => assert.fail('a score alone folded two people') }), said.payload, said.result, { fold: true }));
  assert.deepEqual(out.folds, []);
  assert.equal(out.questions.length, 1);
  /* NO EVIDENCE SENTENCE WHERE THERE IS NONE: the question says only how sure the reading was. */
  assert.match(k.question(out.questions[0]!) ?? '', /one person\? They look certain to be\. Yes keeps Ines Carvalho /u);
  assert.equal(live(sql), 2);
  sql.close();
});

test('CORROBORATED IS A SHARED PROJECT, AN ORGANISATION’S DOMAIN WITH A FIRST NAME, OR AN ALIAS, and nothing less', async () => {
  const { k, sql } = await record();
  const d = deps(k, sql);
  const [a, b] = onOneProject(k);
  assert.equal(corroborated(d, a.id, b.id), true, 'one project');
  assert.equal(corroborated(d, b.id, a.id), true, 'either way round');

  const mira = person(k, { name: 'Mira Okafor', email: 'mira.okafor@harborline.example' });
  const miraO = person(k, { name: 'Mira O', email: 'm.okafor@harborline.example' });
  assert.equal(corroborated(d, mira.id, miraO.id), true, 'one organisation’s domain and one first name');
  const colleague = person(k, { name: 'Jonas Okafor', email: 'jonas@harborline.example' });
  assert.equal(corroborated(d, mira.id, colleague.id), false, 'two colleagues share a domain and are two people');
  const namesake = person(k, { name: 'Mira Lindqvist', email: 'mira@pellucid.example' });
  assert.equal(corroborated(d, mira.id, namesake.id), false, 'a first name alone');
  /* A PUBLIC MAIL HOST IS NOBODY'S ORGANISATION: two Miras at gmail are two people. */
  const one = person(k, { name: 'Sami Haddad', email: 'sami.haddad@gmail.com' });
  const two = person(k, { name: 'Sami H', email: 'samih@gmail.com' });
  assert.equal(corroborated(d, one.id, two.id), false, 'a public mail host');

  const kasia = person(k, { name: 'Katarzyna Wolny', aliases: ['Kasia Wolny'] });
  const short = person(k, { name: 'Kasia Wolny' });
  assert.equal(corroborated(d, kasia.id, short.id), true, 'one goes by the other’s name');
  assert.equal(corroborated(d, kasia.id, mira.id), false);
  assert.equal(corroborated(d, kasia.id, 'nobody'), false, 'somebody gone corroborates nothing');
  sql.close();
});

test('EACH KIND OF AGREEMENT IS SAID IN ITS OWN SENTENCE, in names', async () => {
  const { k, sql } = await record();
  const mira = person(k, { name: 'Mira Okafor', email: 'mira.okafor@harborline.example' });
  const miraO = person(k, { name: 'Mira O', email: 'm.okafor@harborline.example' });
  const kasia = person(k, { name: 'Katarzyna Wolny', aliases: ['Kasia Wolny'] });
  const short = person(k, { name: 'Kasia Wolny' });
  const said = answer([[mira, miraO, 0.93], [kasia, short, 0.93]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql), said.payload, said.result, { fold: true }));
  /* TWO PAIRS ARE TWO BATCHES, so one Undo takes back one match and leaves the other. */
  assert.equal(new Set(out.folds.map((f) => f.batch)).size, 2);
  assert.deepEqual(
    out.folds.map((f) => f.sentence),
    ['Both have an address at harborline.example and the first name Mira.', 'Katarzyna Wolny also goes by Kasia Wolny.'],
  );
  assert.equal(live(sql), 2);
  sql.close();
});

test('THE BARS HOLD IN THE TOP BAND: his own person, two that money points at, and a row another member made are asked or left', async () => {
  const { k, sql } = await record();
  const project = value<Entry>(k.create('things', { name: 'Lanternfish' }, OWNER));
  const me = person(k, { name: 'Kas Aziz', self: true, projects: [project.id] });
  const other = person(k, { name: 'Kas A', projects: [project.id] });
  const never = { write: () => assert.fail('a barred pair was folded') } as const;
  const own = answer([[me, other, 0.99]]);
  const asked = value<Settlement>(settleVerdicts(deps(k, sql, never), own.payload, own.result, { fold: true }));
  assert.deepEqual(asked.folds, []);
  assert.equal(asked.questions.length, 1, 'his own person is always his to answer');
  assert.match(k.question(asked.questions[0]!) ?? '', /both you\? They look certain to be\. Both are on Lanternfish\./u);

  const second = await record();
  const [a, b] = onOneProject(second.k);
  const said = answer([[a, b, 0.99]]);
  const paid = value<Settlement>(settleVerdicts(deps(second.k, second.sql, { ...never, moneyAt: () => true }), said.payload, said.result, { fold: true }));
  assert.deepEqual(paid.folds, []);
  assert.equal(paid.questions.length, 1, 'two that money points at are asked about');

  const third = await record();
  const [c, e] = onOneProject(third.k);
  const theirs = answer([[c, e, 0.99]]);
  const left = value<Settlement>(settleVerdicts(deps(third.k, third.sql, { ...never, othersRow: (id) => id === e.id }), theirs.payload, theirs.result, { fold: true }));
  assert.deepEqual(left, { questions: [], folds: [] }, 'a row another member made is theirs to merge');
  sql.close();
  second.sql.close();
  third.sql.close();
});

test('A FOLD THE RECORD REFUSES IS ASKED INSTEAD, and an answer that is not one is refused in a sentence', async () => {
  const { k, sql } = await record();
  const [a, b] = onOneProject(k);
  const said = answer([[a, b, 0.95]]);
  const refuses: Partial<PeopleDeps> = { write: () => ({ ok: false, refusal: { code: 'VERSION_STALE', fix: 'It changed.' } }) as never, attempt: (fn) => fn() };
  const out = value<Settlement>(settleVerdicts(deps(k, sql, refuses), said.payload, said.result, { fold: true }));
  assert.deepEqual(out.folds, []);
  assert.equal(out.questions.length, 1);
  assert.equal(live(sql), 2);

  const bad = settleVerdicts(deps(k, sql), said.payload, { verdicts: 'yes' }, { fold: true }) as { ok: boolean; refusal?: { code: string } };
  assert.equal(bad.ok, false);
  assert.equal(bad.refusal?.code, 'VALUE_MALFORMED');
  assert.deepEqual(value<Settlement>(settleVerdicts(deps(k, sql), 'not json', said.result, { fold: true })), { questions: [], folds: [] });
  sql.close();
});

test('A ROW ONLY ARRIVALS VOUCH FOR IS NEVER FOLDED IN THE TOP BAND, and a score past 1 is no score', async () => {
  const { k, sql } = await record();
  const project = value<Entry>(k.create('things', { name: 'Lanternfish' }, OWNER));
  const known = person(k, { name: 'Teodor Vance', projects: [project.id] });
  /* MADE BY A MAIL AND MET ONLY IN MAIL: text anybody could have written, however sure a model is of it (H1). */
  const mailed = person(k, { name: 'Teo Vance', projects: [project.id], met: ['2026-10-01 · mail from a sender'] });
  const never = { write: () => assert.fail('a row only arrivals vouch for was folded') } as const;
  const said = answer([[known, mailed, 0.99]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql, never), said.payload, said.result, { fold: true }));
  assert.deepEqual(out.folds, []);
  assert.equal(out.questions.length, 1);
  assert.equal(live(sql), 2);
  sql.close();

  /* 85 IS A PERCENTAGE, NOT A SCORE: it is asked about as likely, and folds nothing with the switch on. */
  const second = await record();
  const [a, b] = onOneProject(second.k);
  const percent = answer([[a, b, 85]]);
  const asked = value<Settlement>(settleVerdicts(deps(second.k, second.sql, { write: () => assert.fail('a score past 1 folded two people') }), percent.payload, percent.result, { fold: true }));
  assert.deepEqual(asked.folds, []);
  assert.equal(asked.questions.length, 1);
  assert.match(second.k.question(asked.questions[0]!) ?? '', /one person\? They look likely to be\. Both are on Lanternfish\./u);
  second.sql.close();
});

test('BESIDE OTHERS TAKEN INTO THE SAME QUESTION, THE EVIDENCE SENTENCE NAMES ITS TWO, since "both" of three says nothing', async () => {
  const { k, sql } = await record();
  const [a, b] = onOneProject(k);
  /* A THIRD OF THE SAME NAME AS ONE OF THEM, on no project: taken into the question, and not what the sentence is about. */
  person(k, { name: 'Teo Vance' });
  const said = answer([[a, b, 0.8]]);
  const out = value<Settlement>(settleVerdicts(deps(k, sql), said.payload, said.result));
  assert.equal(out.questions.length, 1);
  const question = k.question(out.questions[0]!) ?? '';
  assert.match(question, /^Are Teodor Vance .*, Teo Vance .*and Teo Vance.* one person\? They look likely to be\. Teodor Vance and Teo Vance are both on Lanternfish\. Yes keeps Teodor Vance /u);
  sql.close();
});
