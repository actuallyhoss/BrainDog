/**
 * `briefing` once a written brief is kept (`src/methods/briefing.ts`, `src/written-brief.ts`): the sentences are filled
 * from the record as it is, each figure opens its own row, the needs stand under them, and when the model is off or the
 * last ask failed the rules' cards stand with one quiet line saying the written brief is paused. Through the real record
 * on a kernel in memory; no model is asked, the kept brief is written straight into the pref as the tick leaves it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH } from '@braindog/kernel';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { WRITTEN_KEPT, WRITTEN_STATE, writtenOf, type WrittenRead } from '../src/written-brief.ts';
import type { BriefFact } from '../src/briefing.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const HOUR = 3_600_000;

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

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
type Brief = { cards: { h: string; line: string; row: string; by: string }[]; said: string | null; written: WrittenRead | null; paused: string | null };
type Health = () => Promise<{ health: { state: 'off' | 'answering' | 'not_answering'; last_ok: string | null; since: string | null }; said: { text: string; whose: null } }>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function morning(health?: Health) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 2 * HOUR);
  const api = await createRecordApi({ sql, clock, ...(health ? { engineHealth: health as never } : {}) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([BILLS] as never));
  const rent = value<Entry>(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_1' }));
  value(
    await api.propose(
      { question: 'Which account pays the studio rent?', body_kind: 'options' as const, body: { options: [{ id: 'main', label: 'The main one', because: 'It always has.' }, { id: 'sav', label: 'The savings one', because: 'It holds more.' }] } } as never,
      owner,
    ),
  );
  clock.set(NOW);
  const read = async () => value<Brief>(await api.briefing({}, owner));
  /** The late bill as the read gathers it, found from the rules' own card so no list id is spelled here. */
  const facts = async (): Promise<BriefFact[]> => {
    const card = (await read()).cards.find((c) => c.h.startsWith('late-'))!;
    return [{ h: card.h, kind: 'late', title: 'Studio rent', figures: { days: '1' }, row: card.row, cause: null, rank: 4 }];
  };
  /** What the tick leaves: the model's sentences passed through the check, kept as parts. */
  const keep = async (sentences: string[]) => {
    const got = writtenOf({ sentences }, await facts());
    api.kernel.setPref(SLASH, WRITTEN_KEPT, { basis: 'older', at: new Date(NOW - HOUR).toISOString(), sentences: got.sentences });
    return got;
  };
  return { api, sql, rent, read, keep, facts };
}

test("with nothing written the answer is the rules' cards, and a model that is only waiting is not called paused", async () => {
  const r = await morning(async () => ({ health: { state: 'answering', last_ok: null, since: null }, said: { text: 'ok', whose: null } }));
  const brief = await r.read();
  assert.equal(brief.written, null);
  assert.equal(brief.paused, null);
  assert.ok(brief.cards.length > 0);
  r.sql.close();
});

test('a written brief is answered at once, its figures filled from the record and opening their rows, with the needs under it', async () => {
  const r = await morning();
  const late = (await r.facts())[0]!;
  const kept = await r.keep([`${late.title} is {{${late.h}.days}} late.`]);
  assert.equal(kept.sentences.length, 1, kept.fault ?? '');
  const brief = await r.read();
  assert.equal(brief.paused, null);
  const text = brief.written!.sentences[0]!.parts.map((p) => p.text).join('');
  assert.equal(text, 'Studio rent is 1 day late.');
  assert.deepEqual(brief.written!.sentences[0]!.parts.filter((p) => p.row !== null).map((p) => p.row), [late.row, late.row]);
  assert.ok(brief.written!.needs.some((n) => n.row.startsWith('suggestion:')));
  assert.ok(brief.written!.needs.length <= 5);
  r.sql.close();
});

test('a bill paid since the brief was written voids it at once, and the rules say what is true', async () => {
  const r = await morning();
  const late = (await r.facts())[0]!;
  await r.keep([`${late.title} is {{${late.h}.days}} late.`]);
  value(r.api.kernel.update('bills', r.rent.id, { status: 'paid' } as never, { actor: 'p_1' }));
  const brief = await r.read();
  assert.equal(brief.written, null);
  assert.ok(brief.cards.every((c) => !c.line.includes('Studio rent')));
  r.sql.close();
});

test("a model that is off or failing leaves the rules' cards and one quiet line, led by the engine's own sentence", async () => {
  const off = await morning(async () => ({ health: { state: 'off', last_ok: null, since: null }, said: { text: 'Slash has no model on this host, so BrainDog works from its rules.', whose: null } }));
  const a = await off.read();
  assert.equal(a.written, null);
  assert.equal(a.paused, 'The written brief is paused. Slash has no model on this host, so BrainDog works from its rules.');
  assert.ok(a.cards.length > 0);
  off.sql.close();

  const failing = await morning();
  failing.api.kernel.setPref(SLASH, WRITTEN_STATE, { version: 1, looked: '2026-10-14', day: '2026-10-14', asks: 1, dirty: null, inflight: null, failed: { basis: 'x', at: NOW, why: 'down' } });
  const b = await failing.read();
  assert.match(b.paused ?? '', /^The written brief is paused/u);
  failing.sql.close();
});

test('a fresh record is told nothing about a paused brief', async () => {
  const sql = openSqlite();
  const off: Health = async () => ({ health: { state: 'off', last_ok: null, since: null }, said: { text: 'off', whose: null } });
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), engineHealth: off as never });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'new', name: 'New', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const brief = value<Brief>(await api.briefing({}, owner));
  assert.equal(brief.paused, null);
  assert.equal(brief.written, null);
  sql.close();
});
