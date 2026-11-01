/**
 * The daily look's page headlines on the host's side: the ask goes to the model with its own instructions and comes back
 * as `{ lines }`, on a chat-completions endpoint and on Anthropic's Messages API alike, and it is held to its own share of
 * the background allowance, which skill drafts and the model-jobs pass cannot spend and it cannot spend past.
 *
 * `createSlash` is imported by a relative path, as `slash.test.ts` does, because `packages/host` does not depend on
 * `@braindog/slash`; it is here only to build the ledger the meter counts in and to answer `status()`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calmFaults, type CallContext } from '@braindog/record';

import { anthropicModel, endpointModel, SLASH_HEADLINE_INSTRUCTIONS, SLASH_INSTRUCTIONS } from '../src/slash.ts';
import { slashRecordMeter } from '../src/slash-ask.ts';
import { floorsOf } from '../src/budget-plan.ts';
import { backgroundMeter, BACKGROUND_JOBS_MONTH, HEADLINE_ASK } from '../src/model-jobs.ts';
import { createSlash } from '../../slash/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const FAKE_KEY = 'fake-key-for-tests-only';
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const T0 = Date.UTC(2026, 9, 2, 3, 17);

const INPUT = {
  today: '2026-10-02',
  pages: [
    { page: 'money', title: 'Money', rules: 'Cash now is £4,210.00.', figures: [{ id: 'cash-now', value: '£4,210.00', change: '-£120.00' }] },
    { page: 'bake', title: 'Bake', rules: '3 orders to bake.', figures: [{ id: 'orders-open', value: '3', change: '+1' }] },
  ],
};
const LINES = { lines: { money: 'Cash now is £4,210.00, down £120.00 since yesterday.', bake: '3 orders to bake, one more than yesterday.' } };

function endpoint(answer: () => Response) {
  const sent: { url: string; init: RequestInit }[] = [];
  return { sent, send: async (url: URL, init: RequestInit) => (sent.push({ url: url.href, init }), answer()) };
}

test('A HEADLINE IS ASKED OF A CHAT-COMPLETIONS ENDPOINT with its own instructions, and its lines come back as the model wrote them', async () => {
  const net = endpoint(
    () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(LINES) } }] }), { status: 200 }),
  );
  const model = endpointModel({ url: 'http://localhost:11434/v1/chat/completions', model: 'small', key: async () => FAKE_KEY, send: net.send });
  assert.deepEqual(await model.headline(INPUT), LINES);
  const body = JSON.parse(String(net.sent[0]!.init.body)) as { messages: { role: string; content: string }[]; response_format: unknown };
  assert.equal(body.messages[0]!.content, SLASH_HEADLINE_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[1]!.content), INPUT);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.ok(!String(net.sent[0]!.init.body).includes(FAKE_KEY), 'the key went into what the model reads');
});

test('A HEADLINE ON AN OWN ANTHROPIC KEY goes as the system text, with the key in x-api-key alone, and its fenced lines are read', async () => {
  const net = endpoint(
    () =>
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(LINES) + '\n```' }], usage: { input_tokens: 90, output_tokens: 30 } }),
        { status: 200 },
      ),
  );
  const model = anthropicModel({ url: 'https://api.anthropic.com/v1/messages', model: 'claude-x', key: async () => FAKE_KEY, send: net.send });
  assert.deepEqual(await model.headline(INPUT), LINES);
  const init = net.sent[0]!.init;
  assert.equal((init.headers as Record<string, string>)['x-api-key'], FAKE_KEY);
  const body = JSON.parse(String(init.body)) as { system: string; messages: { content: string }[] };
  assert.equal(body.system, SLASH_HEADLINE_INSTRUCTIONS);
  assert.deepEqual(JSON.parse(body.messages[0]!.content), INPUT);
  assert.ok(!String(init.body).includes(FAKE_KEY));
});

test('WHAT THE MODEL IS TOLD reads as the record checks: the answer shape, numbers from the input only, no system words, no dashes', () => {
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /\{"lines":\{"<page id>":"<the line>"\}\}/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /140 characters/u);
  assert.match(SLASH_HEADLINE_INSTRUCTIONS, /never work one out/u);
  assert.ok(!SLASH_HEADLINE_INSTRUCTIONS.includes('—') && !SLASH_HEADLINE_INSTRUCTIONS.includes('–'), 'no dash as punctuation');
});

test("THE GOOD PAGE THE DRAFTS ARE SHOWN is one: a lead note first, rows of 12, an icon on every heading, a trend on its figure, an empty line on its list", () => {
  const line = SLASH_INSTRUCTIONS.split('\n').find((l) => l.startsWith('A good page'));
  assert.ok(line !== undefined, 'the instructions say what a good page is');
  assert.ok(!line.includes('—'));
  const page = JSON.parse(line.slice(line.indexOf('{"id"'))) as { body: { blocks: Record<string, unknown>[] } };
  const blocks = page.body.blocks;
  assert.equal(blocks[0]!.kind, 'note');
  assert.equal(blocks[0]!.lead, true);
  assert.match(String(blocks[0]!.body), /\{\{[a-z-]+\}\}/u, 'the lead says a real figure');
  /* ROWS TILE TO 12, as the record's own check walks them. */
  let row = 0;
  for (const b of blocks) {
    row += Number(b.span);
    assert.ok(row <= 12);
    if (row === 12) row = 0;
  }
  assert.equal(row, 0);
  for (const b of blocks.filter((b) => b.heading !== undefined)) assert.equal(typeof b.icon, 'string', `${String(b.heading)} has no icon`);
  for (const b of blocks.filter((b) => b.kind === 'stat')) assert.equal(typeof b.back, 'number', 'a figure without its trend');
  for (const b of blocks.filter((b) => b.source !== undefined)) assert.ok(b.empty !== undefined || b.when !== undefined);
  /* AND THE RECORD'S OWN BAR passes it, as it holds every drafted page to (`calmFaults`). */
  assert.deepEqual(calmFaults([{ id: 'page.bake', blocks }]), []);
});

/** Slash's own ledger, through the real engine, and the meter the record holds its background asks with. */
function ledger() {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  const engine = createSlash({
    sql,
    clock,
    inference: { complete: async () => ({ text: '{}', usage: { in: 1, out: 1 } }) },
    record: new Proxy({}, { get: () => { throw new Error('the record was read by the package'); } }) as never,
  });
  const configured = engine.configure({ ask_cap: 20 }, OWNER);
  assert.ok(configured.ok);
  const meter = slashRecordMeter({ sql, clock, engine: async () => engine, model: 'glm-5.3-flash' });
  return { sql, meter };
}

const since = new Date(Date.UTC(2026, 9, 1)).toISOString();

test('HEADLINES SPEND THEIR OWN SHARE OF THE ONE POOL: all of the month but the floors of the others, then the next is refused, while a skill draft still is not', async () => {
  const { sql, meter } = ledger();
  /* THE MOST THE HEADLINES MAY SPEND IS THE MONTH LESS EVERYBODY ELSE'S FLOORS (`budget-plan.ts`), 340 of 600, and no
     wall of thirty stops them before it. */
  const most = backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').cap;
  assert.equal(most, BACKGROUND_JOBS_MONTH - 260);
  for (let i = 0; i < most; i++) {
    const held = await meter.background('headline');
    assert.ok(held.ok, `headline ask ${i + 1} was refused`);
    held.value.settle({ usage: { in: 300, out: 40 } });
  }
  const refused = await meter.background('headline');
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.refusal.code, 'SLASH_BUDGET_SPENT');
    assert.match(refused.refusal.fix, /headlines are spent until 2026-11-01, so each page keeps its own line/u);
  }
  const rows = sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE kind = 'pattern' AND question = ?", HEADLINE_ASK)?.n;
  assert.equal(rows, most, 'a refused ask wrote a row');

  /* THE OTHERS' FLOORS ARE UNTOUCHED: the skill draft and the model-jobs pass still have what the plan keeps for them,
     the 260 the headlines could not spend. A meter's `spent` reads what was left over as spent, so what a share may
     spend now is its cap less that. */
  const left = (): number => {
    const work = backgroundMeter(sql);
    return work.cap - work.spent(since);
  };
  assert.equal(left(), 260);
  assert.equal(backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').spent(since), most);
  const skill = await meter.background();
  assert.ok(skill.ok, 'a skill draft was refused by the headlines');
  skill.value.settle({ usage: { in: 500, out: 200 } });
  assert.equal(left(), 259);
  sql.close();
});

test('SKILL DRAFTS AND THE MODEL-JOBS PASS cannot spend the headlines: with the rest of the month gone, a headline is still held', async () => {
  const { sql, meter } = ledger();
  const work = backgroundMeter(sql);
  assert.equal(work.cap, BACKGROUND_JOBS_MONTH - floorsOf(BACKGROUND_JOBS_MONTH).headline);
  /* A SKILL DRAFT AND THE PASS ARE HELD TO THE REST: the work less the floor reading who is who has not used. */
  const rest = work.rest!;
  assert.equal(rest.cap, work.cap - floorsOf(BACKGROUND_JOBS_MONTH).understand);
  /* A month of digests and skill drafts, as the pass and the look settle them. */
  for (let i = 0; i < rest.cap - 1; i++)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code, question, purpose, spends)
       VALUES (?, ?, 'prose', 'a', 'glm-5.3-flash', 10, 10, 0, 0, 'ok', NULL, NULL, 'look', 'background')`,
      `prose-${i}`,
      new Date(T0 - 1000 * i).toISOString(),
    );
  for (let i = 0; i < floorsOf(BACKGROUND_JOBS_MONTH).skill; i++) {
    const last = await meter.background('skill');
    assert.ok(last.ok);
    last.value.settle({ usage: { in: 10, out: 10 } });
  }
  const spent = await meter.background('skill');
  assert.equal(spent.ok, false);
  if (!spent.ok) assert.match(spent.refusal.fix, /background Slash questions are used until 2026-11-01/u);

  const headline = await meter.background('headline');
  assert.ok(headline.ok, 'the skill drafts and digests ate the headlines');
  /* A CALL NEVER SENT IS RELEASED, and costs the share nothing. */
  headline.value.release();
  /* WHAT THE HEADLINES MAY STILL SPEND IS THEIR FLOOR, all of it: the work took what was left over and none of theirs. */
  const theirs = backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline');
  assert.equal(theirs.cap - theirs.spent(since), floorsOf(BACKGROUND_JOBS_MONTH).headline);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM slash_call WHERE purpose = 'headline'")?.n, 0);
  /* AND READING WHO IS WHO STILL HAS ITS OWN: a look or a skill draft through this door spent none of it. */
  assert.equal(work.understand!.cap - work.understand!.spent(since), floorsOf(BACKGROUND_JOBS_MONTH).understand);
  const who = await meter.background('understand');
  assert.ok(who.ok, 'the skill drafts and digests ate what reading who is who was owed');
  who.value.release();
  sql.close();
});

test("THE DAILY LOOK'S OWN DRAFT is written as a look and spends the work share, never the headlines'", async () => {
  const { sql, meter } = ledger();
  const look = await meter.background('look');
  assert.ok(look.ok);
  look.value.settle({ usage: { in: 800, out: 300 } });
  const row = sql.one<{ question: string }>("SELECT question FROM slash_call WHERE kind = 'pattern'");
  assert.equal(row?.question, "Slash's daily look");
  assert.equal(backgroundMeter(sql).spent(since), 1);
  assert.equal(backgroundMeter(sql, BACKGROUND_JOBS_MONTH, 'headline').spent(since), 0);
  sql.close();
});

test('A SMALLER ALLOWANCE IS SHARED IN PROPORTION, so neither share is left with nothing', () => {
  const sql = openSqlite();
  const work = backgroundMeter(sql, 10);
  const headline = backgroundMeter(sql, 10, 'headline');
  assert.ok(work.cap > 0 && headline.cap > 0);
  /* EACH IS THE MONTH LESS THE OTHERS' FLOORS, so the two overlap in what is nobody's and no longer add up to the cap. */
  assert.equal(work.cap, 8);
  assert.equal(headline.cap, 5);
  sql.close();
});
