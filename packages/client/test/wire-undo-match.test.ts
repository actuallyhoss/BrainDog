/**
 * What batch 86 added, through the client: Undo on a match the record made, and the briefing a model wrote.
 *
 * NOT A STAND-IN FETCH AND NOT A STAND-IN GUARD, as `reads-stale.test.ts` is not: `serveApi` over a real record, so what
 * the client sends is what the host decodes and the caller is held by the record's own guards. The model is the host's
 * own adapter (`endpointModel`) over a request that never leaves the test, so no key and no network, and its asks are
 * counted by the host's own meter (`slashRecordMeter`) in Slash's real ledger.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlersFor, serveApi } from '@braindog/host';
import { endpointModel, SLASH_BRIEF_INSTRUCTIONS, SLASH_WRITTEN_INSTRUCTIONS } from '@braindog/host/slash';
import { backgroundMeter, BACKGROUND_JOBS_MONTH } from '@braindog/host/model-jobs';

import { createClient, type Briefing } from '../src/index.ts';
import { slashRecordMeter } from '../../host/src/slash-ask.ts';
import { BRIEF_NO_ANSWER, WRITTEN_QUIET_MS, createRecordApi, type CallContext } from '../../record/src/index.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const HOUR = 3_600_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text', label: 'Handles' },
      { id: 'keys', type: 'list', of: 'text', label: 'Keys' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'name',
    state: 'status',
    done: ['paid'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'status', type: 'enum', values: ['open', 'paid'], default: 'open' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(r)}`);
  return x.refusal!;
};

/** No id, address or handle in anything a person reads. */
const PLAIN = /[0-9A-HJKMNP-TV-Z]{26}|@|[a-z_]+#\d|merged_into|—/u;

type Plan = { say: string; lines: string[]; steps: { line: string }[]; skipped: { line: string }[]; hash: string; already: boolean };
type Done = { batch: string; put: number; say: string; lines: string[]; skipped: unknown[] };
type Match = { batch: string };

const clientOver = (api: Awaited<ReturnType<typeof createRecordApi>>, ctx: CallContext) => {
  const handlers = handlersFor(api);
  return createClient({
    base: 'https://x',
    fetch: (async (input: string | URL | Request, init?: RequestInit) => serveApi(new Request(new URL(String(input)), init), handlers, ctx)) as typeof globalThis.fetch,
  });
};

/* ── Undo on a match ─────────────────────────────────────────────────────── */

type Met = { undo?: string; question?: string };

/** Teodor met in a commit, noted under another address, then noted under the commit's own: the strong rules fold the two. */
async function folded() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([PEOPLE] as never));
  const meet = async (said: Record<string, unknown>) => value<Met>(await api.meet(said as never, owner));
  const people = (): number[] => sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq").map((r) => r.seq);
  const folds = (): number => sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field = 'merged_into' AND to_v IS NOT NULL")!.n;
  const questions = (): number => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")!.n;
  await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  const asked = await meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  assert.ok(asked.question, 'a commit and a note under another address are asked about, not folded');
  const met = await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' });
  assert.ok(met.undo, 'the strong rules did not fold them');
  assert.deepEqual(people(), [1]);
  const mine = clientOver(api, owner);
  const matched = async (): Promise<Match[]> => value<{ matches: Match[] }>(await mine.matched()).matches;
  return { sql, api, mine, meet, people, folds, questions, matched, asked: asked.question, batch: met.undo! };
}

test('UNDO ON A MATCH, THROUGH THE CLIENT: the look says who comes back, the press brings both back, and the pair is never folded again', async () => {
  const { sql, mine, meet, people, folds, questions, matched, batch } = await folded();
  const listed = await matched();
  assert.deepEqual(listed.map((m) => m.batch), [batch], 'the batch the tile hands its Undo');

  /* THE LOOK changes nothing and says it in names. */
  const events = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  const plan = value<Plan>(await mine.undo({ batch, dry: true }));
  assert.match(plan.say, /^Puts back 2 people/u);
  assert.match(JSON.stringify(plan.lines), /Teodor Vance/u);
  assert.doesNotMatch(JSON.stringify([plan.say, plan.lines]), PLAIN);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, events, 'a look wrote to the log');
  assert.deepEqual(people(), [1]);

  /* THE PRESS, by the hash the look answered. */
  const done = value<Done>(await mine.undo({ batch, hash: plan.hash }));
  assert.equal(done.say, 'Put back 2 people.');
  assert.ok(done.put > 0);
  assert.deepEqual(people(), [1, 2], 'two people again');
  assert.deepEqual(await matched(), [], 'the pair is no longer listed as matched');
  /* A SECOND LOOK SAYS IT WAS PUT BACK, and a second press with its hash puts nothing back. */
  const again = value<Plan>(await mine.undo({ batch, dry: true }));
  assert.equal(again.say, 'This was put back already.');
  assert.deepEqual(again.steps, []);

  /* A PAIR HE UNDID IS NEVER FOLDED AGAIN: the same meeting that folded them, met once more, folds nobody. */
  const before = { folds: folds(), questions: questions() };
  const met = await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Thursday' });
  assert.equal(met.undo, undefined, 'the meeting folded the pair again');
  assert.deepEqual(people(), [1, 2]);
  assert.equal(folds(), before.folds, 'a new fold was written');
  assert.equal(questions(), before.questions, 'and it asked nothing new about them');
  assert.deepEqual(await matched(), []);

  /* AND THE UNDO'S OWN BATCH IS NOT UNDONE FROM HERE: read line by line it would delete the one who came back and
     fold nobody, so the look and the press are both refused and both people stand. */
  for (const args of [{ batch: done.batch, dry: true }, { batch: done.batch, hash: 'x' }]) {
    const no = refused(await mine.undo(args));
    assert.equal(no.code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(no.fix, PLAIN);
  }
  assert.deepEqual(people(), [1, 2]);
  sql.close();
});

test('THE PRESS SHOWS THE WRITE DOOR’S REFUSAL AND NEVER TRUSTS THE PLAN ALONE: an address taken since is said in names, and nothing is put back', async () => {
  const { sql, api, mine, people, matched, batch } = await folded();
  /* THE KEY THE FOLD CARRIED IS TAKEN OFF THE ONE KEPT, and somebody else is given the address the folded one held.
     The plan is read from the log and cannot see that: it still says both come back. */
  const kept = api.kernel.get({ register: 'people', seq: 1 })!;
  value(api.kernel.write('people', kept.id, { keys: [] } as never, { actor: 'p_1', version: kept.version }));
  value(api.kernel.create('people', { name: 'Mira Holt', email: 'teodor.v@pellucid.example' } as never, { actor: 'p_1' }));
  assert.deepEqual(people(), [1, 3]);

  const plan = value<Plan>(await mine.undo({ batch, dry: true }));
  assert.ok(plan.steps.some((s) => /^Bring Teodor Vance back$/u.test(s.line)), JSON.stringify(plan.lines));
  const events = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;

  const no = refused(await mine.undo({ batch, hash: plan.hash }));
  assert.equal(no.code, 'ALREADY_KNOWN', 'the door’s own code');
  assert.match(no.fix, /^This match was not put back, and nothing changed: Mira Holt already has that email\. /u);
  assert.doesNotMatch(no.fix, PLAIN);
  /* NOTHING OF IT LANDED: nobody came back, no line was written, the fold is not marked undone and is still listed. */
  assert.deepEqual(people(), [1, 3]);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, events);
  assert.equal(sql.one('SELECT 1 AS y FROM undone WHERE batch = ?', batch), undefined);
  assert.deepEqual((await matched()).map((m) => m.batch), [batch]);
  assert.equal(value<Plan>(await mine.undo({ batch, dry: true })).already, false, 'and it can still be put back once the address is free');
  sql.close();
});

test('A MATCH SOMEBODY SAID YES TO IS NOT ONE THE RECORD MADE: `isFold` is asked first, so its batch goes the general way and never to the fold’s plan', async () => {
  const { sql, api, mine, people } = await folded();
  /* A SECOND PAIR, asked about and accepted: that batch holds the decision's own line. */
  value(await api.meet({ name: 'Ines Moreau', email: 'ines@lanternfish.example', source: 'commit 2 in lanternfish' } as never, owner));
  const asked = value<Met>(await api.meet({ name: 'Ines Moreau', email: 'ines.m@pellucid.example', source: 'note from Friday' } as never, owner));
  assert.ok(asked.question);
  const live = people().length;
  value(await api.decide({ id: asked.question!, decide: { option: 'accept', reason: 'They are one person.' } }, owner));
  assert.equal(people().length, live - 1, 'the accept folded the two');
  const line = sql.one<{ batch: string | null; id: string }>("SELECT batch, id FROM event WHERE field = 'merged_into' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1")!;
  const batch = line.batch ?? line.id;
  assert.ok(sql.one("SELECT 1 AS y FROM event WHERE batch = ? AND kind = 'decide'", batch), 'the accept wrote its fold under the decision’s batch');
  assert.equal(api.kernel.isFold(batch), false);
  assert.notEqual(api.kernel.foldPlan(batch), null, 'the plan alone would have answered it');
  /* THE GENERAL UNDO ANSWERS IT, in its own words, which count changes and never people. */
  const plan = value<Plan>(await mine.undo({ batch, dry: true }));
  assert.match(plan.say, /^Puts back \d+ changes\.$/u);
  assert.ok(plan.lines.includes('Puts the question back in Decide.'), JSON.stringify(plan.lines));
  sql.close();
});

/* ── the briefing a model wrote ──────────────────────────────────────────── */

/** The read once the brief is written as sentences: the cards stand beside it, and `paused` says why none was written. */
type WrittenBriefing = Briefing & { written?: { sentences: { parts: { text: string; row: string | null }[] }[] } | null; paused?: string | null };

type Sent = { instructions: string; input: { facts?: { h: string; title: string; figures?: Record<string, string> }[] } };

/**
 * The host's own chat-completions adapter, over a request that is answered here. `answer` may fail the briefing ask.
 *
 * `written` IS WHETHER THE MODEL ALSO WRITES THE BRIEF AS SENTENCES. The host's adapter does, and a record whose model
 * does is asked for sentences when its rows change, instead of for cards by the slot of the day; one without writes the
 * cards, which is the road the first three tests below keep.
 */
function model(answer: 'cards' | 'down', written = false) {
  const sent: Sent[] = [];
  const send = async (_url: URL, init: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    const instructions = body.messages[0]!.content;
    const input = JSON.parse(body.messages[1]!.content) as Sent['input'];
    sent.push({ instructions, input });
    const briefing = instructions === SLASH_BRIEF_INSTRUCTIONS;
    const sentences = instructions === SLASH_WRITTEN_INSTRUCTIONS;
    if ((briefing || sentences) && answer === 'down') return new Response('busy', { status: 503 });
    const said = briefing
      ? { cards: (input.facts ?? []).map((f) => ({ h: f.h, line: `Look at ${f.title} first` })) }
      : sentences
        ? { sentences: (input.facts ?? []).filter((f) => f.figures?.days !== undefined).map((f) => `${f.title} is {{${f.h}.days}} late.`) }
        : { drafts: [], lines: {} };
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(said) } }] }), { status: 200 });
  };
  const { written: sentences, ...cards } = endpointModel({ url: 'http://localhost:11434/v1/chat/completions', model: 'small', key: async () => 'not-a-key', send });
  return { sent, model: (written ? { ...cards, written: sentences } : cards) as never };
}

/** A record with a bill late since yesterday, a model behind the host's adapter and the host's meter over Slash's ledger. */
async function briefed(answer: 'cards' | 'down', written = false) {
  const sql = openSqlite();
  const ledger = openSqlite();
  const clock = fixedClock(NOW - HOUR);
  const engine = createSlash({
    sql: ledger,
    clock,
    inference: { complete: async () => ({ text: '{}', usage: { in: 1, out: 1 } }) },
    record: new Proxy({}, { get: () => { throw new Error('the record was read by the package'); } }) as never,
  });
  assert.ok(engine.configure({ ask_cap: 20 }, owner as never).ok);
  const m = model(answer, written);
  const api = await createRecordApi({ sql, clock, slashModel: m.model, slashMeter: slashRecordMeter({ sql: ledger, clock, engine: async () => engine, model: 'small' }) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([BILLS] as never));
  value(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_1' }));
  clock.set(NOW);
  const asks = () => m.sent.filter((s) => s.instructions === (written ? SLASH_WRITTEN_INSTRUCTIONS : SLASH_BRIEF_INSTRUCTIONS));
  const spent = (): number => ledger.one<{ n: number }>("SELECT count(*) AS n FROM slash_call WHERE spends = 'background' AND purpose = 'headline'")?.n ?? 0;
  const his = (): number => ledger.one<{ n: number }>("SELECT count(*) AS n FROM slash_call WHERE spends = 'person'")?.n ?? 0;
  return { sql, ledger, api, clock, asks, spent, his, mine: clientOver(api, owner) };
}

test('THE BRIEFING A MODEL WROTE, THROUGH THE CLIENT: the tick asks the host’s adapter on the background allowance, and the read answers its cards', async () => {
  const r = await briefed('cards');
  /* BEFORE ANY TICK the rules speak, and nothing is said about a model nobody asked. */
  const rules = value<Briefing>(await r.mine.briefing());
  assert.ok(rules.cards.length > 0 && rules.cards.every((c) => c.by === 'rule'), JSON.stringify(rules));
  assert.equal(rules.said, null);
  assert.equal(r.asks().length, 0, 'a read asked a model');

  assert.ok((await r.api.slashTick()).ran);
  assert.equal(r.asks().length, 1, 'the tick asks once');
  /* WHAT LEFT THE HOST: the briefing's own instructions and the facts by handle and name, never a row or an id. */
  assert.ok(r.asks()[0]!.input.facts!.some((f) => f.title === 'Studio rent'));
  assert.doesNotMatch(JSON.stringify(r.asks()[0]!.input), /bills#|rec_|p_1/u);
  /* ON THE RECORD'S OWN ALLOWANCE, counted in the ledger, and none of his asks. */
  const counted = r.spent();
  assert.ok(counted >= 1, 'the ask was not counted in the ledger');
  assert.equal(r.his(), 0);

  const brief = value<Briefing>(await r.mine.briefing());
  assert.ok(brief.cards.length > 0 && brief.cards.every((c) => c.by === 'slash'), JSON.stringify(brief));
  assert.ok(brief.cards.some((c) => c.line === 'Look at Studio rent first' && (c.row ?? '').startsWith('bills#')));
  assert.equal(brief.said, null, 'a model’s cards stand, so nothing is said about the rules');
  /* A SECOND TICK IN THE SAME PART OF THE DAY, WITH NOTHING MOVED, ASKS NOTHING. */
  await r.api.slashTick();
  assert.equal(r.asks().length, 1);
  assert.equal(r.spent(), counted);
  r.sql.close();
  r.ledger.close();
});

test('A MODEL THAT DOES NOT ANSWER LEAVES THE RULES’ CARDS, and the read says why in one sentence', async () => {
  const r = await briefed('down');
  await r.api.slashTick();
  assert.equal(r.asks().length, 1);
  const brief = value<Briefing>(await r.mine.briefing());
  assert.ok(brief.cards.length > 0 && brief.cards.every((c) => c.by === 'rule'), JSON.stringify(brief));
  assert.equal(brief.said, BRIEF_NO_ANSWER);
  r.sql.close();
  r.ledger.close();
});

test('WITH THE HEADLINES’ SHARE OF THE MONTH SPENT THE MODEL IS NOT ASKED: the rules write the cards and the read says the month is spent', async () => {
  const r = await briefed('cards');
  /* THE MOST THE HEADLINES MAY SPEND OF THE ONE POOL, written as the meter writes each ask. */
  const most = backgroundMeter(r.ledger, BACKGROUND_JOBS_MONTH, 'headline').cap;
  for (let i = 0; i < most; i++)
    r.ledger.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
       VALUES (?, ?, 'pattern', 'a', 'small', 10, 10, 0, 0, 'ok', NULL, NULL, 'headline', 'background')`,
      `spent-${i}`,
      new Date(NOW - 1000 * (i + 1)).toISOString(),
    );
  await r.api.slashTick();
  assert.equal(r.asks().length, 0, 'a spent month still asked the model');
  const brief = value<Briefing>(await r.mine.briefing());
  assert.ok(brief.cards.length > 0 && brief.cards.every((c) => c.by === 'rule'));
  assert.match(brief.said ?? '', /spent until 2026-11-01/u);
  assert.doesNotMatch(brief.said ?? '', /[0-9A-HJKMNP-TV-Z]{26}|—/u);
  r.sql.close();
  r.ledger.close();
});

test('A MODEL THAT WRITES THE BRIEF IS NOT ASKED FOR IT, THROUGH THE CLIENT: ticks ask nothing and the rules cards speak', async () => {
  for (const kind of ['cards', 'down'] as const) {
    const r = await briefed(kind, true);
    await r.api.slashTick();
    r.clock.advance(WRITTEN_QUIET_MS + 1_000);
    await r.api.slashTick();
    assert.equal(r.asks().length, 0, 'a tick asked a model for the written brief');
    const brief = value<WrittenBriefing>(await r.mine.briefing());
    assert.ok(brief.cards.length > 0 && brief.cards.every((c) => c.by === 'rule'), JSON.stringify(brief));
    assert.equal(brief.written ?? null, null);
    r.sql.close();
    r.ledger.close();
  }
});
