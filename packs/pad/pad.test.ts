/**
 * The pad as a pack: a list of notes beside the work, and a second opinion from Slash written under each one
 * (`loop/research-dynamic-layouts.md` section 5 P7 and brief D6, `loop/DIRECTION.md` sections 22, 28 and 31).
 *
 * NO NEW KIND AND NO CODE, which is the point of building it here. The survey measured every half of it as something a
 * record already says: `capture` adds a note, `cards` draws the notes with the new `reply` role under each title, and
 * an automation on the notes list asks Slash and writes the answer back with `set`. So a launch desk, a study plan and
 * a founder's page install the same pad instead of three people drawing three.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 25TH: with no `pad.pack.json` beside it this file failed at its first read, ENOENT,
 * before a single test ran; the first test below is what holds the fresh record to having no notes list of its own.
 *
 * Every note here is invented, and none of them is about anybody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { validateDeclaration } from '../../packages/kernel/src/index.ts';
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

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./pad.pack.json', import.meta.url);
const TEXT = readFileSync(PACK_FILE, 'utf8');
const pad = (): { pack: string; declarations: Decl[] } => JSON.parse(TEXT) as { pack: string; declarations: Decl[] };
const RULE = pad().declarations.find((d) => typeof d.rule === 'string') as Decl & { rule: string };
const PAGE = pad().declarations.find((d) => typeof d.page === 'string') as Decl & { blocks: Decl[] };

/**
 * A fresh record on a host that answers Slash, or says nothing about it. Nothing else is installed: the pad asks
 * nothing of any other pack, so a record with no module at all is the hardest place it has to install.
 */
async function record(answersSlash?: boolean): Promise<{ api: Api; sql: NodeSql }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(answersSlash === undefined ? {} : { answersSlash }) });
  return { api, sql };
}

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown = pad()): Promise<Out> {
  const diff = said<{ diff: Diff }>(await planOf(api, doc)).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** A record with the pad installed on a host that answers Slash, which is where its second opinion is served. */
async function padded(): Promise<{ api: Api; sql: NodeSql }> {
  const r = await record(true);
  said(await put(r.api));
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

/* ── before ───────────────────────────────────────────────────────────── */

test('BEFORE THE PACK: a fresh record has no notes list, and a note written to one is refused', async () => {
  const { api, sql } = await record(true);
  assert.equal(
    api.kernel.declarations().find((d) => d.id === 'register.notes'),
    undefined,
    'a fresh record already holds a notes list, so this pack would be adding nothing',
  );
  const r = api.kernel.create('notes', { text: 'Ask for a proof on the heavier paper.' }, { actor: 'p_1' }) as Out;
  assert.equal(r.ok, false, 'a note was written to a list nobody declared');
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'pad'));
  sql.close();
});

/* ── the file ─────────────────────────────────────────────────────────── */

test('the same file passes as an add-on somebody opens from disk, and asks for no other pack', async () => {
  const file = said<{ pack: { manifest: { pack: string; requires: { packs: Record<string, string> } } } }>(await readPackFile(TEXT));
  assert.equal(file.pack.manifest.pack, 'pad');
  assert.deepEqual(file.pack.manifest.requires.packs, {}, 'the pad is placed beside any work, so it may not need a particular one');
});

test('the rule asks Slash only about a note with no reply, once per wording, and writes the answer back as the reply', () => {
  /* THE RULE AS THE SURVEY WROTE IT, held here word by word because the three tests below only see its effects. */
  assert.deepEqual(RULE.on, { written: { register: 'notes', op: ['create', 'update'], fields: ['text', 'reply'] } });
  assert.equal(RULE.when, 'reply is empty');
  const [ask, set] = RULE.steps as [{ ask_slash: { question: string; as: string } }, { set: { field: string; to: string } }];
  assert.match(ask.ask_slash.question, /\{\{trigger\.row\.text\}\}/u);
  assert.deepEqual(set, { set: { field: 'reply', to: `{{vars.${ask.ask_slash.as}}}` } });
});

/* ── the second opinion ───────────────────────────────────────────────── */

test('A NOTE WITH NO REPLY IS PUT TO SLASH, and what Slash answers is written under it as its reply', async () => {
  const { api, sql } = await padded();
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

test('A NOTE WRITTEN WITH A REPLY QUEUES NOTHING: no run and no question', async () => {
  const { api, sql } = await padded();
  write(api, { text: 'Move the stall to the corner by the door.', reply: 'Written by hand, beside the note.' });
  await api.kernel.drain();
  assert.equal(runs(sql), 0, 'a note that already had its reply started a run');
  assert.equal(asked(sql), 0, 'a note that already had its reply was put to Slash');
  sql.close();
});

test('ASKING AGAIN IS REWORDING THE NOTE WITH ITS REPLY CLEARED; clearing the reply on the same words asks nothing', async () => {
  /* MEASURED, AND IT IS NOT WHAT THE SURVEY SAID. P7 has "asking again is clearing the reply". A rule that asks Slash
     about a row must declare `once_per` (`flow-lint.ts`: "asks about a row and declares no once_per"), and the marker
     `once_per` leaves is kept for good, so with `once_per: [entry]` a note is asked about once in its life and clearing
     its reply asks nothing ever again. Keyed on the entry and its text instead, a new wording is a new question, and
     the same words cleared are not sent again. */
  const { api, sql } = await padded();
  const note = write(api, { text: 'Price the small tin at nine.' });
  await api.kernel.drain();
  await answer(api, 'Nine sits under the large tin by enough to make the choice easy.');

  let now = noteOf(api, note.id);
  said(api.kernel.update('notes', note.id, { reply: null } as never, { actor: 'p_1', version: now.version }));
  await api.kernel.drain();
  assert.equal(asked(sql), 1, 'the same words were put to Slash a second time');
  assert.equal(noteOf(api, note.id).fields.reply ?? null, null);

  now = noteOf(api, note.id);
  said(api.kernel.update('notes', note.id, { text: 'Price the small tin at eight.' } as never, { actor: 'p_1', version: now.version }));
  await api.kernel.drain();
  const payload = await answer(api, 'Eight makes the pair of tins read as a set.');
  assert.match(String(payload.question), /at eight\./u);
  assert.equal(noteOf(api, note.id).fields.reply, 'Eight makes the pair of tins read as a set.');
  assert.equal(asked(sql), 2);
  sql.close();
});

test('ON A HOST THAT DOES NOT ANSWER SLASH THE PAD IS REFUSED at the rule\'s question, and nothing of it is installed', async () => {
  /* ONE PACK, ONE INSTALL. The notes list and the page would work without Slash, but a pack is installed whole, and a
     host that serves no `infer.ask` refuses the step that asks (`answersSlash`, off unless the host says so). */
  const { api, sql } = await record();
  const r = await put(api);
  assert.equal(r.ok, false, 'the pad installed on a host where nothing would ever answer its question');
  assert.equal(r.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(api.kernel.declarations().find((d) => d.id === 'register.notes'), undefined);
  sql.close();
});

/* ── the page ─────────────────────────────────────────────────────────── */

test('THE PAD\'S PAGE IS A SECTION ANY PAGE CAN COPY: a capture into notes, then the six newest as cards with the reply under each', async () => {
  const { api, sql } = await padded();
  assert.deepEqual(
    PAGE.blocks.map((b) => b.kind),
    ['section', 'capture', 'cards'],
    'the pad is placed on another page by copying these blocks, so they must stand without anything else on the page',
  );
  for (const [i, text] of ['First thought.', 'Second thought.', 'Third thought.', 'Fourth thought.', 'Fifth thought.', 'Sixth thought.', 'Seventh thought.'].entries())
    write(api, { text, ...(i === 6 ? { reply: 'A reply on the newest.' } : {}) });

  const page = said<{ title: string; blocks: { kind: string; rows: { fields: Record<string, unknown> }[]; matched: number; refusals: Refusal[] }[] }>(
    await api.page({ slug: 'pad' }, owner),
  );
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `the ${b.kind} block was refused`);
  const cards = page.blocks.find((b) => b.kind === 'cards')!;
  assert.deepEqual(
    cards.rows.map((r) => r.fields.text),
    ['Seventh thought.', 'Sixth thought.', 'Fifth thought.', 'Fourth thought.', 'Third thought.', 'Second thought.'],
    'the pad shows the six newest notes, newest first',
  );
  assert.equal(cards.matched, 7, 'the seventh note is not counted, so nothing could say there are more');
  assert.equal(cards.rows[0]!.fields.reply, 'A reply on the newest.');
  sql.close();
});

test('MEASURED: first: 6, which the survey wrote on the cards, is refused on a cards block, so the pad says limit: 6', () => {
  /* `first:` is read by feed, agents and steps (`block-keys.ts` `KEY_KINDS`), and D1 made the install refuse a key the
     kind does not read. The pad is cut to six by `limit:`, which draws the same six and says the count in `matched`. */
  const cards = PAGE.blocks.find((b) => b.kind === 'cards')!;
  const withFirst = { ...PAGE, blocks: PAGE.blocks.map((b) => (b === cards ? { ...b, limit: undefined, first: 6 } : b)) };
  const refused = validateDeclaration({ id: `page.${String(PAGE.page)}`, kind: 'page', body: JSON.parse(JSON.stringify(withFirst)) } as never) as Refusal | null;
  assert.ok(refused, 'first: 6 on cards installed, so the pad could say it as the survey did');
  assert.match(refused.fix, /first: is read by feed, agents and steps blocks/u);
  assert.equal(cards.limit, 6);
});

test('the notes list takes a link to any row as what a note is about, of whatever list', async () => {
  const { api, sql } = await padded();
  const first = write(api, { text: 'The first note.' });
  /* A NOTE MAY BE ABOUT ANOTHER NOTE, which is the one list a fresh record with the pad is sure to hold, and it proves the
     field names no list of its own: a `ref` with no `to` takes a row of any register (`coerce.ts`). */
  const second = write(api, { text: 'On the first note.', about: first.id });
  assert.equal(noteOf(api, second.id).fields.about, first.id);
  const notes = api.kernel.declarations().find((d) => d.id === 'register.notes')!;
  const about = (JSON.parse(notes.body) as { fields: { id: string; type: string; to?: string; required?: boolean }[] }).fields.find((f) => f.id === 'about')!;
  assert.deepEqual([about.type, about.to, about.required ?? false], ['ref', undefined, false]);
  sql.close();
});

test('uninstalling the pad takes its page and keeps every note and reply already written', async () => {
  const { api, sql } = await padded();
  const note = write(api, { text: 'Keep the receipts in the blue folder.', reply: 'One folder is easier to hand over at the end of the year.' });
  said(await api.uninstallPack({ id: 'pad' } as never, owner));
  assert.equal(noteOf(api, note.id).fields.reply, 'One folder is easier to hand over at the end of the year.');
  assert.ok(!said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'pad'));
  sql.close();
});
