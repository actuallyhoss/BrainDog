/**
 * The pad's second opinion as an add-on of its own: one automation on the pad's notes that asks Slash about a note with
 * no reply, and writes the answer back as its reply with `set`.
 *
 * IT WAS THE PAD'S UNTIL PAD 1.2.0 (SHL-A11). The rule is the one 1.1.0 held, word for word and under the same id, so a
 * record that kept the pad and wants its second opinion back gets exactly what it had. It needs the pad, for the
 * notes list it writes to, and a host that answers Slash, because the step that asks is refused anywhere else.
 *
 * Slash here is the outbox, answered by hand: no adapter, no key, nothing sent. Every note is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 25, 12);

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[] };
type Note = { id: string; version: number; fields: Record<string, unknown> };
type Decl = Record<string, unknown>;
type Doc = { pack: string; version: string; summary: string; requires: { packs: Record<string, string> }; declarations: Decl[] };

/** A file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const fileAt = (path: string): (() => Doc) => {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  return () => JSON.parse(text) as Doc;
};
const TEXT = readFileSync(new URL('./pad-second-opinion.pack.json', import.meta.url), 'utf8');
const opinion = fileAt('./pad-second-opinion.pack.json');
const pad = fileAt('../pad/pad.pack.json');
/** Pad 1.1.0 as the catalogue serves it, the last pad that asked Slash itself. Released, so read and never written. */
const was = fileAt('../../apps/web/static/catalogue/packs/pad/1.1.0.pack.json');
const RULE = opinion().declarations[0] as Decl & { rule: string };

async function record(answersSlash?: boolean): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(answersSlash === undefined ? {} : { answersSlash }) });
  return { api, sql };
}

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved. A refused plan is handed back as it came. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const plan = await planOf(api, doc);
  if (!plan.ok) return plan;
  const diff = (plan.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** A record on a host that answers Slash, with the pad and then its second opinion installed. */
async function opined(): Promise<{ api: Api; sql: NodeSql }> {
  const r = await record(true);
  said(await put(r.api, pad()));
  said(await put(r.api, opinion()));
  return r;
}

const write = (api: Api, fields: Record<string, unknown>): Note => said<Note>(api.kernel.create('notes', fields, { actor: 'p_1' }));
const noteOf = (api: Api, id: string): Note => api.kernel.get(id) as unknown as Note;
const asked = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.ask'")!.n;
const runs = (sql: NodeSql): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM automation_run WHERE rule = ?', RULE.rule)!.n;

/** Slash's host, by hand: lease the one question waiting, answer it with `text`, and let the run carry on. */
async function answer(api: Api, text: string): Promise<Record<string, unknown>> {
  const [job] = api.kernel.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no question was queued for Slash');
  said(api.kernel.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { text } }));
  await api.kernel.drain();
  return JSON.parse(job.payload) as Record<string, unknown>;
}

/* ── the file ─────────────────────────────────────────────────────────── */

test('the file passes as an add-on opened from disk, its folder is its id, and it needs the pad that asks no model', async () => {
  const file = said<{ pack: { manifest: { pack: string; requires: { packs: Record<string, string> } } } }>(await readPackFile(TEXT));
  assert.equal(file.pack.manifest.pack, 'pad-second-opinion');
  assert.equal(new URL('.', import.meta.url).pathname.split('/').filter(Boolean).at(-1), 'pad-second-opinion');
  assert.deepEqual(file.pack.manifest.requires.packs, { pad: '>=1.2.0 <2.0.0' }, 'it must need a pad that no longer holds the same rule');
  assert.equal(opinion().version, '1.0.0');
});

test('ITS SUMMARY SAYS IT ASKS THE RECORD\'S MODEL AND SPENDS ITS ALLOWANCE, so nobody adds it without knowing', () => {
  const { summary } = opinion();
  assert.match(summary, /model/u);
  assert.match(summary, /allowance/u);
  assert.doesNotMatch(TEXT, /—/u, 'an em dash in words a person reads');
});

test('IT BRINGS ONE AUTOMATION, THE ONE PAD 1.1.0 HELD, word for word: ask Slash about a note with no reply, set the reply', () => {
  const doc = opinion();
  assert.equal(doc.declarations.length, 1, 'the add-on brings a list or a page of its own; the pad holds those');
  const held = was().declarations.find((d) => typeof d.rule === 'string');
  assert.deepEqual(RULE, held, 'the rule drifted from the one records on 1.1.0 ran, so its markers would not carry');
  assert.deepEqual(RULE.on, { written: { register: 'notes', op: ['create', 'update'], fields: ['text', 'reply'] } });
  assert.equal(RULE.when, 'reply is empty');
  const [ask, set] = RULE.steps as [{ ask_slash: { question: string; as: string } }, { set: { field: string; to: string } }];
  assert.match(ask.ask_slash.question, /\{\{trigger\.row\.text\}\}/u);
  assert.deepEqual(set, { set: { field: 'reply', to: `{{vars.${ask.ask_slash.as}}}` } });
});

/* ── where it installs ────────────────────────────────────────────────── */

test('ON A HOST THAT DOES NOT ANSWER SLASH IT IS REFUSED, and the pad stays as it was', async () => {
  const { api, sql } = await record();
  said(await put(api, pad()));
  const r = await put(api, opinion());
  assert.equal(r.ok, false, 'the second opinion installed where nothing would ever answer its question');
  assert.equal(r.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(api.kernel.declarations().find((d) => d.id === `rule.${RULE.rule}`), undefined);
  assert.ok(api.kernel.declarations().some((d) => d.id === 'register.notes'), 'the refusal took the pad with it');
  sql.close();
});

test('ON A RECORD STILL ON PAD 1.1.0 IT IS REFUSED, naming the pad version it needs', async () => {
  /* 1.1.0 holds the same rule under the same id, so the two together would be one rule owned twice. */
  const { api, sql } = await record(true);
  said(await put(api, was()));
  const r = await put(api, opinion());
  assert.equal(r.ok, false, 'the second opinion installed beside a pad that still asks Slash itself');
  assert.equal(r.refusal?.code, 'PROVIDES_CONFLICT');
  assert.match(r.refusal?.fix ?? '', /needs pad >=1\.2\.0 <2\.0\.0\. Update pad first/u);
  assert.equal(api.kernel.packs().find((p) => p.id === 'pad-second-opinion'), undefined);
  sql.close();
});

test('MEASURED: THE PAD CAN BE TAKEN OUT FROM UNDER IT TODAY, and the rule left behind has no notes to ask about', async () => {
  /* NOT WHAT IT SHOULD BE, AND NOT THIS ADD-ON'S TO FIX. Uninstalling a pack another one needs is allowed
     (`uninstallPack` reads no `requires.packs` of the held packs), so the rule stays with its list gone. SHL-A12 is
     where that is refused by name. What this file holds is that nothing is asked in the meantime: with no notes list,
     no note can be written for the rule to fire on. */
  const { api, sql } = await opined();
  said(await api.uninstallPack({ id: 'pad' } as never, owner));
  assert.equal(api.kernel.declarations().find((d) => d.id === 'register.notes'), undefined);
  const r = api.kernel.create('notes', { text: 'Ask for a proof on the heavier paper.' }, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false, 'a note was written with the pad gone');
  await api.kernel.drain();
  assert.equal(asked(sql), 0, 'the rule left behind asked Slash about something');
  said(await api.uninstallPack({ id: 'pad-second-opinion' } as never, owner));
  assert.equal(api.kernel.declarations().find((d) => d.id === `rule.${RULE.rule}`), undefined);
  sql.close();
});

/* ── the second opinion ───────────────────────────────────────────────── */

test('A NOTE WITH NO REPLY IS PUT TO SLASH, and what Slash answers is written under it as its reply', async () => {
  const { api, sql } = await opined();
  const note = write(api, { text: 'Ask the printer for a proof on the heavier paper before the whole run.' });
  await api.kernel.drain();

  const payload = await answer(api, 'A proof costs a day and saves reprinting the run if the paper curls.');
  assert.match(String(payload.question), /Ask the printer for a proof on the heavier paper before the whole run\./u, 'Slash was not handed the note');
  assert.equal(noteOf(api, note.id).fields.reply, 'A proof costs a day and saves reprinting the run if the paper curls.');
  /* THE RULE'S OWN WRITE STARTS NOTHING, so writing the reply does not put the note to Slash a second time. */
  assert.equal(asked(sql), 1);
  assert.equal(runs(sql), 1);
  sql.close();
});

test('AN EMPTY ANSWER FROM SLASH LEAVES THE REPLY EMPTY, never a mark under the note', async () => {
  /* MEASURED BEFORE THE KERNEL'S FIX, when this was the pad's own rule: the question acked `done` with no text wrote
     `—` as the reply. `packages/slash`'s own pass refuses a blank answer before it acks, so this is a host that acks the
     outbox itself, which the kernel accepts. `once_per` had marked the note by then, so it was never asked again either. */
  const { api, sql } = await opined();
  const note = write(api, { text: 'Try the green ink on the cover.' });
  await api.kernel.drain();
  await answer(api, '');
  assert.equal(noteOf(api, note.id).fields.reply ?? null, null, 'an empty answer was written under the note as a mark');
  assert.equal(runs(sql), 1);
  sql.close();
});

test('A NOTE WRITTEN WITH A REPLY QUEUES NOTHING: no run and no question', async () => {
  const { api, sql } = await opined();
  write(api, { text: 'Move the stall to the corner by the door.', reply: 'Written by hand, beside the note.' });
  await api.kernel.drain();
  assert.equal(runs(sql), 0, 'a note that already had its reply started a run');
  assert.equal(asked(sql), 0, 'a note that already had its reply was put to Slash');
  sql.close();
});

test('ASKING AGAIN IS REWORDING THE NOTE WITH ITS REPLY CLEARED; clearing the reply on the same words asks nothing', async () => {
  /* MEASURED, AND IT IS NOT THE OBVIOUS READING, "asking again is clearing the reply". A rule that asks Slash
     about a row must declare `once_per` (`flow-lint.ts`: "asks about a row and declares no once_per"), and the marker
     `once_per` leaves is kept for good, so keyed on the entry and its text a new wording is a new question, and the
     same words cleared are not sent again. */
  const { api, sql } = await opined();
  const note = write(api, { text: 'Price the small tin at nine.' });
  await api.kernel.drain();
  await answer(api, 'Nine sits under the large tin by enough to make the choice easy.');

  let now = noteOf(api, note.id);
  said(api.kernel.update('notes', note.id, { reply: null } as never, { actor: 'p_1', version: now.version }));
  await api.kernel.drain();
  assert.equal(asked(sql), 1, 'the same words were put to Slash a second time');

  now = noteOf(api, note.id);
  said(api.kernel.update('notes', note.id, { text: 'Price the small tin at eight.' } as never, { actor: 'p_1', version: now.version }));
  await api.kernel.drain();
  const payload = await answer(api, 'Eight makes the pair of tins read as a set.');
  assert.match(String(payload.question), /at eight\./u);
  assert.equal(noteOf(api, note.id).fields.reply, 'Eight makes the pair of tins read as a set.');
  assert.equal(asked(sql), 2);
  sql.close();
});

test('A PAD KEPT FROM 1.1.0 TAKES THE SECOND OPINION BACK, and a note already answered there is not asked again', async () => {
  /* THE SAME RULE ID IS THE POINT: the `once_per` marker 1.1.0 left on an answered note still holds under this add-on,
     so taking it back sends nothing for what was already answered, and a note written after it is asked as before. */
  const { api, sql } = await record(true);
  said(await put(api, was()));
  const old = write(api, { text: 'Keep the receipts in the blue folder.' });
  await api.kernel.drain();
  await answer(api, 'One folder is easier to hand over at the end of the year.');
  said(await put(api, pad()));
  said(await put(api, opinion()));

  const kept = noteOf(api, old.id);
  assert.equal(kept.fields.reply, 'One folder is easier to hand over at the end of the year.');
  const fresh = write(api, { text: 'Ask the market for a pitch nearer the gate.' });
  await api.kernel.drain();
  await answer(api, 'Nearer the gate is where people slow down.');
  assert.equal(noteOf(api, fresh.id).fields.reply, 'Nearer the gate is where people slow down.');
  assert.equal(asked(sql), 2, 'a note answered under 1.1.0 was put to Slash again');
  sql.close();
});
