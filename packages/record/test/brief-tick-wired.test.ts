/**
 * The briefing, written by the record's own tick (`brief-write.ts` wired in `index.ts` as `slashBrief`).
 *
 * THROUGH THE REAL RECORD: `slashTick` gathers the facts as the owner reads them, asks a model that has `brief` once
 * for its cards on the background allowance, and keeps them; `briefing`, read by the owner, then answers the model's
 * cards. The same slot and the same facts ask nothing again, a bill paid asks once more, a new part of the day in the
 * record's own zone asks once, and with no model, no allowance or Slash switched off the rules' cards stand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type SlashHeld, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const HOUR = 3_600_000;
/** Wednesday 14 October 2026, noon, on a record that keeps UTC. */
const NOON = Date.UTC(2026, 9, 14, 12);

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

type Card = { h: string; line: string; row: string; cause: string | null; by: 'slash' | 'rule' };
type Brief = { cards: Card[]; at: string; basis: string; said?: string | null };
type Handed = { today: string; most: number; facts: { h: string; kind: string; title: string; figures: Record<string, string> }[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** A model that drafts nothing and, when it briefs, says every fact it was handed, the last one first. */
const briefing = (brief = true) => {
  const heard: Handed[] = [];
  const model = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    ...(brief
      ? {
          brief: async (input: Handed) => {
            heard.push(input);
            return { cards: [...input.facts].reverse().map((f) => ({ h: f.h, line: `Now is the time for ${f.title}` })) };
          },
        }
      : {}),
  } as unknown as SlashModel;
  return { heard, model };
};

/** A meter that counts: his own asks (`hold`) and the record's (`background`), which may be refused. */
const meter = (refuse: string | null = null) => {
  const counts = { his: 0, background: [] as string[] };
  const held = (): { ok: true; value: SlashHeld } => ({ ok: true, value: { settle: () => {}, release: () => {} } });
  const m: SlashMeter = {
    hold: async () => {
      counts.his += 1;
      return held();
    },
    background: async (kind) => {
      counts.background.push(String(kind));
      return refuse === null ? held() : { ok: false, refusal: { code: 'RATE_LIMITED', fix: refuse } };
    },
  };
  return { counts, meter: m };
};

/** A record with a bill late since yesterday and a question that waits on its owner. */
async function record(opts: { brief?: boolean; refuse?: string | null; tz?: string; meter?: boolean } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOON - HOUR);
  const { heard, model } = briefing(opts.brief ?? true);
  const { counts, meter: m } = meter(opts.refuse ?? null);
  const api = await createRecordApi({ sql, clock, slashModel: model, ...(opts.meter === false ? {} : { slashMeter: m }) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: opts.tz ?? 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install([BILLS] as never));
  const rent = value<Entry>(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_owner' }));
  value(
    await api.propose(
      {
        question: 'Which account pays the studio rent?',
        body_kind: 'options',
        body: { options: [{ id: 'main', label: 'The main one', because: 'It always has.' }, { id: 'savings', label: 'The savings one', because: 'It holds more.' }] },
      } as never,
      OWNER,
    ),
  );
  clock.set(NOON);
  const read = async () => value<Brief>(await (api as unknown as { briefing(a: unknown, c: CallContext): Promise<unknown> }).briefing({}, OWNER));
  const pay = async () => value(await api.update({ register: 'bills', seq: rent.seq!, patch: { status: 'paid' } }, OWNER));
  return { sql, clock, api, heard, counts, rent, read, pay };
}

test('AFTER A TICK THE OWNER READS THE MODEL\'S CARDS: asked once, on the background allowance, in the names the record holds', async () => {
  const r = await record();
  const rules = await r.read();
  assert.ok(rules.cards.length >= 2, JSON.stringify(rules.cards));
  assert.ok(rules.cards.every((c) => c.by === 'rule'));
  const out = await r.api.slashTick();
  assert.ok(out.ran);
  assert.equal(r.heard.length, 1);
  /* WHAT THE MODEL WAS HANDED: handles and names, never what a card opens. */
  const input = r.heard[0]!;
  assert.equal(input.most, 7);
  assert.ok(input.facts.some((f) => f.title === 'Studio rent'));
  assert.doesNotMatch(JSON.stringify(input), /bills#|suggestion:|rec_|p_owner/u);
  const brief = await r.read();
  assert.equal(brief.cards.length, input.facts.length, JSON.stringify(brief.cards));
  assert.ok(brief.cards.every((c) => c.by === 'slash'), JSON.stringify(brief.cards));
  /* IN THE MODEL'S ORDER, which is the rules' turned round, and each still opens its own thing. */
  assert.deepEqual(brief.cards.map((c) => c.h), [...input.facts].reverse().map((f) => f.h));
  const late = brief.cards.find((c) => /Studio rent$/u.test(c.line) && c.row.startsWith('bills#'));
  assert.ok(late, JSON.stringify(brief.cards));
  assert.equal(late.row, r.api.kernel.nameOf(r.rent.id));
  assert.equal(brief.said ?? null, null);
  /* ON THE RECORD'S OWN ALLOWANCE, the headlines' share, and never one of his asks. */
  assert.ok(r.counts.background.includes('headline'), JSON.stringify(r.counts.background));
  assert.equal(r.counts.his, 0);
  r.sql.close();
});

test('THE SAME PART OF THE DAY AND THE SAME FACTS ASK NOTHING AGAIN, and a bill paid asks once more', async () => {
  const r = await record();
  await r.api.slashTick();
  assert.equal(r.heard.length, 1);
  r.clock.advance(HOUR);
  const again = await r.api.slashTick();
  assert.deepEqual(again, { ran: false, why: 'today' });
  assert.equal(r.heard.length, 1, 'the model was asked again for facts that had not moved');
  assert.ok((await r.read()).cards.every((c) => c.by === 'slash'));
  await r.pay();
  /* THE BASIS MOVED: the rules answer at once, never a card about a bill that is paid. */
  const between = await r.read();
  assert.ok(between.cards.every((c) => c.by === 'rule' && !c.row.startsWith('bills#')), JSON.stringify(between.cards));
  r.clock.advance(HOUR);
  await r.api.slashTick();
  assert.equal(r.heard.length, 2);
  assert.ok(!r.heard[1]!.facts.some((f) => f.title === 'Studio rent'));
  const after = await r.read();
  assert.ok(after.cards.length >= 1 && after.cards.every((c) => c.by === 'slash'), JSON.stringify(after.cards));
  r.clock.advance(HOUR);
  await r.api.slashTick();
  assert.equal(r.heard.length, 2);
  r.sql.close();
});

test('A NEW PART OF THE DAY IN THE RECORD\'S OWN ZONE ASKS ONCE, though nothing moved', async () => {
  /* 11:30 and 12:30 UTC are both between 08:00 and 17:00 in UTC, and either side of 08:00 in New York. */
  const utc = await record();
  utc.clock.set(NOON - HOUR / 2);
  await utc.api.slashTick();
  utc.clock.set(NOON + HOUR / 2);
  await utc.api.slashTick();
  assert.equal(utc.heard.length, 1);
  utc.sql.close();
  const york = await record({ tz: 'America/New_York' });
  york.clock.set(NOON - HOUR / 2);
  await york.api.slashTick();
  york.clock.set(NOON + HOUR / 2);
  await york.api.slashTick();
  assert.equal(york.heard.length, 2);
  york.sql.close();
});

test('A MODEL THAT WRITES NO BRIEFING IS ASKED NOTHING: the rules stand and nothing is said about it', async () => {
  const r = await record({ brief: false });
  const before = await r.read();
  const out = await r.api.slashTick();
  assert.ok(out.ran);
  assert.equal(r.heard.length, 0);
  const brief = await r.read();
  assert.deepEqual(brief.cards.map((c) => c.by), before.cards.map(() => 'rule'));
  assert.equal(brief.said ?? null, null);
  assert.equal(r.api.kernel.prefsOf('slash').briefing ?? null, null);
  r.sql.close();
});

test('AN ALLOWANCE THAT IS SPENT KEEPS THE RULES\' CARDS AND SAYS WHY, and none of his own asks is spent', async () => {
  const spent = "This month's background thinking is spent.";
  const r = await record({ refuse: spent });
  const out = await r.api.slashTick();
  assert.ok(out.ran);
  assert.equal(r.heard.length, 0, 'the model was asked though the allowance refused');
  assert.equal(r.counts.his, 0, 'one of his own asks was spent on the briefing');
  const brief = await r.read();
  assert.ok(brief.cards.length >= 2 && brief.cards.every((c) => c.by === 'rule'), JSON.stringify(brief.cards));
  assert.equal(typeof brief.said, 'string');
  assert.match(brief.said!, /thinking is spent/u);
  assert.doesNotMatch(brief.said!, /—/u);
  /* AND A LATER TICK OF THE SAME PART OF THE DAY DOES NOT TRY THE ALLOWANCE AGAIN. */
  const tried = r.counts.background.length;
  r.clock.advance(HOUR);
  await r.api.slashTick();
  assert.equal(r.counts.background.length, tried);
  r.sql.close();
});

test('SLASH SWITCHED OFF ASKS NOTHING', async () => {
  const r = await record();
  value(await r.api.slashDaily({ on: false }, OWNER));
  assert.deepEqual(await r.api.slashTick(), { ran: false, why: 'off' });
  assert.equal(r.heard.length, 0);
  assert.equal(r.counts.background.length, 0);
  assert.ok((await r.read()).cards.every((c) => c.by === 'rule'));
  r.sql.close();
});

test('A BRIEFING THAT FAILS NEVER COSTS THE DAY ITS LOOK: a model that throws leaves the tick run and the rules standing', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOON);
  const model = { name: 'test model', draft: async () => ({ drafts: [] }), brief: async () => { throw new Error('503'); } } as unknown as SlashModel;
  const api = await createRecordApi({ sql, clock, slashModel: model });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install([BILLS] as never));
  value(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_owner' }));
  const out = await api.slashTick();
  assert.ok(out.ran);
  const brief = value<Brief>(await (api as unknown as { briefing(a: unknown, c: CallContext): Promise<unknown> }).briefing({}, OWNER));
  assert.ok(brief.cards.length === 1 && brief.cards[0]!.by === 'rule', JSON.stringify(brief.cards));
  assert.equal(typeof brief.said, 'string');
  sql.close();
});

test('A MODEL THAT WRITES THE BRIEF IS ASKED NOTHING FOR IT: nobody reads it, and the rules\' cards stand', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOON);
  const asked = { written: 0, brief: 0 };
  const model = {
    name: 'test model',
    draft: async () => ({ drafts: [] }),
    written: async () => ((asked.written += 1), { sentences: ['Studio rent is late.'] }),
    brief: async () => ((asked.brief += 1), { cards: [] }),
  } as unknown as SlashModel;
  const { counts, meter: m } = meter();
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: m });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install([BILLS] as never));
  value(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_owner' }));
  assert.ok((await api.slashTick()).ran);
  clock.set(NOON + 6 * HOUR);
  await api.slashTick();
  assert.deepEqual(asked, { written: 0, brief: 0 });
  assert.ok(!counts.background.includes('headline'), JSON.stringify(counts.background));
  const brief = value<Brief>(await (api as unknown as { briefing(a: unknown, c: CallContext): Promise<unknown> }).briefing({}, OWNER));
  assert.ok(brief.cards.every((c) => c.by === 'rule'), JSON.stringify(brief.cards));
  sql.close();
});
