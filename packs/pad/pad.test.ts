/**
 * The pad as a pack: a list of notes beside the work, each with room for a reply, and a page that draws them.
 *
 * NO NEW KIND AND NO CODE, which is the point of building it here. Every half of it measured as something a
 * record already says: `capture` adds a note, and `cards` draws the notes with the `reply` role under each title. So a
 * launch desk, a study plan and a founder's page install the same pad instead of three people drawing three.
 *
 * NO MODEL EITHER, SINCE 1.2.0 (SHL-A11, "it sohuld be a facade. a display layer"). 1.1.0 held its own rule that put
 * each note to Slash, so a record with no model could not keep a pad at all: a pack is installed whole, and the step
 * that asks was refused. The second opinion is `packs/pad-second-opinion` now, an add-on that needs this one, and the
 * `reply` field stays here so a pad written under 1.1.0 keeps every reply it was given.
 *
 * RED FIRST, MEASURED: with no `pad.pack.json` beside it this file failed at its first read, ENOENT,
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
type Doc = { pack: string; version: string; declarations: Decl[] };

/** A file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const fileAt = (path: string): (() => Doc) => {
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  return () => JSON.parse(text) as Doc;
};
const TEXT = readFileSync(new URL('./pad.pack.json', import.meta.url), 'utf8');
const pad = fileAt('./pad.pack.json');
/** 1.1.0 as the catalogue serves it, the pad that asked Slash itself. Released, so it is read and never written. */
const was = fileAt('../../apps/web/static/catalogue/packs/pad/1.1.0.pack.json');
const opinion = fileAt('../pad-second-opinion/pad-second-opinion.pack.json');
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

/** Plan and install with exactly what the plan asked to be approved. A refused plan is handed back as it came. */
async function put(api: Api, doc: unknown = pad()): Promise<Out> {
  const plan = await planOf(api, doc);
  if (!plan.ok) return plan;
  const diff = (plan.value as { diff: Diff }).diff;
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/** A record with no model and the pad installed: the record every person can have. */
async function padded(): Promise<{ api: Api; sql: NodeSql }> {
  const r = await record();
  said(await put(r.api));
  return r;
}

const write = (api: Api, fields: Record<string, unknown>): Note => said<Note>(api.kernel.create('notes', fields, { actor: 'p_1' }));
const noteOf = (api: Api, id: string): Note => api.kernel.get(id) as unknown as Note;
const asked = (sql: NodeSql): number => sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.ask'")!.n;
const waitingAsks = (sql: NodeSql): number =>
  sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.ask' AND state = 'pending'")!.n;
const rules = (api: Api): string[] => api.kernel.declarations().filter((d) => d.id.startsWith('rule.')).map((d) => d.id);

/** Slash's host, by hand: lease the one question waiting, answer it with `text`, and let the run carry on. */
async function answer(api: Api, text: string): Promise<void> {
  const [job] = api.kernel.leaseOutbox(['infer.ask'], 10);
  assert.ok(job, 'no question was queued for Slash');
  said(api.kernel.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { text } }));
  await api.kernel.drain();
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

test('1.2.0 IS A LIST AND A PAGE: no automation, no step that asks a model, and the reply field kept', () => {
  const doc = pad();
  assert.equal(doc.version, '1.2.1');
  assert.notEqual(doc.version, was().version, 'the released 1.1.0 was changed in place instead of cut beside');
  assert.deepEqual(doc.declarations.map((d) => (d.register ? 'register' : d.page ? 'page' : 'other')), ['register', 'page']);
  assert.doesNotMatch(TEXT, /ask_slash|"rule"/u, 'the pad still holds a step that asks a model');
  const notes = doc.declarations.find((d) => d.register === 'notes') as Decl & { fields: { id: string; type: string }[] };
  const kept = was().declarations.find((d) => d.register === 'notes') as Decl & { fields: { id: string; type: string }[] };
  assert.deepEqual(
    notes.fields.map((f) => [f.id, f.type]),
    kept.fields.map((f) => [f.id, f.type]),
    'a field went or changed type, so a pad written under 1.1.0 would lose what it holds',
  );
});

test('THE PAGE SAYS NOTHING OF A SECOND OPINION OR A MODEL, which is the other add-on\'s to say', () => {
  const page = JSON.stringify(PAGE);
  assert.doesNotMatch(page, /opinion|Slash|model/iu);
  const notes = JSON.stringify(pad().declarations.find((d) => d.register === 'notes'));
  assert.doesNotMatch(notes, /opinion|Slash|model/iu, 'the list still names the second opinion in a label or what it holds');
});

/* ── a record with no model ───────────────────────────────────────────── */

test('ON A FRESH RECORD WITH NO MODEL THE PAD INSTALLS AND ITS PAGE READS, with no refusal and nothing put to Slash', async () => {
  /* 1.1.0 WAS REFUSED HERE, `NOT_IN_THIS_BUILD` at its rule's question, and nothing of it installed. Measured on the
     released file below, so the test says what changed and not only what is. */
  const old = await record();
  const refused = await put(old.api, was());
  assert.equal(refused.ok, false, '1.1.0 installed on a host with no model, so the split proves nothing');
  assert.equal(refused.refusal?.code, 'NOT_IN_THIS_BUILD');
  old.sql.close();

  const { api, sql } = await padded();
  assert.equal(api.kernel.packs().find((p) => p.id === 'pad')?.version, '1.2.1');
  assert.deepEqual(rules(api), [], 'the pad brought an automation with it');
  write(api, { text: 'Ask the printer for a proof on the heavier paper before the whole run.' });
  await api.kernel.drain();
  assert.equal(asked(sql), 0, 'a note on the pad was put to a model');

  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'pad'), 'the pad has no page in the list of pages');
  const page = said<{ blocks: { kind: string; refusals: Refusal[] }[] }>(await api.page({ slug: 'pad' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `the ${b.kind} block was refused`);
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

test('MEASURED: first: 6, the obvious key for the cards, is refused on a cards block, so the pad says limit: 6', () => {
  /* `first:` is read by feed, agents and steps (`block-keys.ts` `KEY_KINDS`), and the install refuses a key the
     kind does not read. The pad is cut to six by `limit:`, which draws the same six and says the count in `matched`. */
  const cards = PAGE.blocks.find((b) => b.kind === 'cards')!;
  const withFirst = { ...PAGE, blocks: PAGE.blocks.map((b) => (b === cards ? { ...b, limit: undefined, first: 6 } : b)) };
  const refused = validateDeclaration({ id: `page.${String(PAGE.page)}`, kind: 'page', body: JSON.parse(JSON.stringify(withFirst)) } as never) as Refusal | null;
  assert.ok(refused, 'first: 6 on cards installed, so the pad could say it that way');
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

/* ── from 1.1.0 ───────────────────────────────────────────────────────── */

test('A RECORD ON 1.1.0 TAKES 1.2.0 WITH EVERY NOTE AND REPLY KEPT, and its rule goes, so nothing is put to Slash again', async () => {
  /* The released 1.1.0 on the host it needed, with a note Slash answered, one answered by hand, and one still waiting. */
  const { api, sql } = await record(true);
  said(await put(api, was()));
  const answered = write(api, { text: 'Price the small tin at nine.' });
  await api.kernel.drain();
  await answer(api, 'Nine sits under the large tin by enough to make the choice easy.');
  const byHand = write(api, { text: 'Move the stall to the corner by the door.', reply: 'Written by hand, beside the note.' });
  const waiting = write(api, { text: 'Try the green ink on the cover.' });
  await api.kernel.drain();
  assert.equal(asked(sql), 2, 'the note still waiting was never put to Slash, so the upgrade has nothing to leave behind');

  const diff = said<{ diff: Diff }>(await planOf(api, pad())).diff;
  assert.deepEqual(diff.conflicts, [], 'the upgrade asks about something a person wrote');
  said(await put(api));
  assert.equal(api.kernel.packs().find((p) => p.id === 'pad')?.version, '1.2.1');
  assert.deepEqual(rules(api), [], 'the upgrade left the rule that asks Slash behind');

  assert.equal(noteOf(api, answered.id).fields.reply, 'Nine sits under the large tin by enough to make the choice easy.');
  assert.equal(noteOf(api, byHand.id).fields.reply, 'Written by hand, beside the note.');
  assert.equal(noteOf(api, waiting.id).fields.text, 'Try the green ink on the cover.');
  const cards = said<{ blocks: { kind: string; rows: { fields: Record<string, unknown> }[]; refusals: Refusal[] }[] }>(
    await api.page({ slug: 'pad' }, owner),
  ).blocks.find((b) => b.kind === 'cards')!;
  assert.deepEqual(cards.refusals, []);
  assert.deepEqual(cards.rows.map((r) => r.fields.reply ?? null), [null, 'Written by hand, beside the note.', 'Nine sits under the large tin by enough to make the choice easy.']);

  /* MEASURED: THE QUESTION STILL WAITING IS WITHDRAWN WITH THE RULE, its run cancelled, so no answer lands after the
     upgrade. A note written after it is only a note. */
  assert.equal(waitingAsks(sql), 0, 'a question the retired rule queued is still waiting for Slash');
  write(api, { text: 'Ask the market for a pitch nearer the gate.' });
  await api.kernel.drain();
  assert.equal(waitingAsks(sql), 0, 'a note written on 1.2.0 was put to Slash');
  sql.close();
});

/* ── the second opinion, an add-on of its own ─────────────────────────── */

test('THE SECOND OPINION INSTALLS ON TOP OF THE PAD, and is refused on a record with no pad, at the notes list it writes to', async () => {
  /* MEASURED: REFUSED AT PLAN, `REGISTER_UNRESOLVED`, before `requires.packs` is read at install: the rule's trigger
     names the notes list, and the record holds none. */
  const bare = await record(true);
  const refused = await put(bare.api, opinion());
  assert.equal(refused.ok, false, 'the second opinion installed on a record with no pad to write under');
  assert.equal(refused.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(refused.refusal?.fix ?? '', /notes list/u);
  assert.equal(bare.api.kernel.declarations().find((d) => d.id === 'rule.pad_second_opinion'), undefined);
  bare.sql.close();

  const { api, sql } = await record(true);
  said(await put(api));
  said(await put(api, opinion()));
  assert.deepEqual(rules(api), ['rule.pad_second_opinion']);
  assert.deepEqual(
    api.kernel.packs().filter((p) => p.id.startsWith('pad')).map((p) => [p.id, p.version]).sort(),
    [['pad', '1.2.1'], ['pad-second-opinion', '1.0.1']],
  );
  sql.close();
});
