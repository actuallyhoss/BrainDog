/**
 * THE DESIGN AGENT ASKS THE MODEL WHEN THE RULES CANNOT DRAW (§45 "Thinking and cost"): a list on a page with days
 * and nothing that shows them by day, whose rules' calendar the design check refuses, is asked of the model once. What
 * comes back passes the same check before it is filed as the day's one "I drew X. Keep it?", and it says what it cost.
 * The model here is the test's own; nothing is spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SlashModel, type SlashModelInput } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* A LIST WHOSE NAME IS A SYSTEM WORD, so the rules' calendar, headed "Release blocks by day", is refused by the check. */
const BUILDS = {
  id: 'register.builds',
  kind: 'register' as const,
  body: {
    id: 'builds',
    name: 'Release blocks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const TABLE = { kind: 'table', span: 12, source: 'register.builds', columns: [{ field: 'what' }, { field: 'due' }], empty: 'Nothing yet.' };
const PAGE = { id: 'page.desk', kind: 'page' as const, body: { page: 'desk', title: 'Desk', requires: ['register.builds'], blocks: [TABLE] } as never };

const drawnDesk = (calendar: Record<string, unknown>) => ({
  drafts: [{ question: 'Draw them by day?', body_kind: 'change', body: { to: { id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', requires: ['register.builds'], blocks: [TABLE, calendar] } } } }],
});
const CALENDAR = { kind: 'calendar', heading: 'Releases by day', icon: 'calendar', span: 12, source: 'register.builds', columns: [{ field: 'what' }, { field: 'due' }], empty: 'Nothing is on a day yet.' };

/** A model that answers the drawing it is asked for with `answer`, and the daily look with nothing. */
const listening = (answer: (input: SlashModelInput) => unknown) => {
  const heard: SlashModelInput[] = [];
  const model: SlashModel = {
    name: 'test model',
    draft: async (input) => {
      if (input.asked === undefined) return { drafts: [] };
      heard.push(input);
      return answer(input);
    },
  };
  return { heard, model };
};

async function record(model?: SlashModel) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, ...(model ? { slashModel: model } : {}) });
  value(await api.kernel.install([BUILDS, PAGE]));
  /* THE OWNER THE MODEL DRAWS FOR, as a record always has one. */
  sql.exec("INSERT OR IGNORE INTO person (id, name) VALUES ('p_owner', 'Sam Reed')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  for (let i = 1; i <= 6; i++) value(api.kernel.create('builds', { what: `Build ${i}`, due: `2026-11-0${i}` }, { actor: 'p_owner' }));
  return { api, sql, day: (n: number) => clock.set(NOW + n * DAY) };
}

type Ticked = { ran: boolean; filed?: { id: string; question: string; by: string }[]; dropped?: string[] };
const drew = (t: Ticked) => (t.filed ?? []).filter((f) => f.question.startsWith('I drew'));

test('WHAT THE RULES CANNOT DRAW IS ASKED OF THE MODEL, FILED ONCE IT PASSES THE CHECK, AND SAYS WHAT IT COST', async () => {
  /* THE FIRST ANSWER PAINTS ITS OWN COLOUR, which the check hands back to be mended; the repair draws clean. */
  const { heard, model } = listening((input) => (input.repair === undefined ? drawnDesk({ ...CALENDAR, kind: 'drawn', code: '<p style="color:#ff0000">x</p>' }) : drawnDesk(CALENDAR)));
  const { api, sql } = await record(model);
  const out = (await api.slashTick()) as Ticked;
  const made = drew(out);
  assert.deepEqual(
    made.map((f) => [f.question, f.by]),
    [['I drew Release blocks on Desk as a calendar. Keep it?', 'test model']],
    JSON.stringify(out.dropped),
  );
  /* ASKED ABOUT THE PAGE, IN THE DESIGN AGENT'S WORDS, and mended once. */
  assert.equal(heard.length, 2);
  assert.match(heard[0]!.asked ?? '', /^Draw Release blocks on Desk by day/u);
  assert.equal(heard[0]!.page?.id, 'page.desk');
  const q = sql.one<{ cause: string; body: string }>('SELECT cause, body FROM suggestion WHERE id = ?', made[0]!.id)!;
  assert.equal(q.cause, 'drew:desk:calendar:builds');
  const body = JSON.parse(q.body) as { why: string[]; about: string; to: { body: { blocks: { kind: string; heading?: string }[] } } };
  assert.equal(body.about, 'page.desk');
  assert.deepEqual(body.why, ['6 entries in Release blocks have a day, and nothing on Desk shows them by day.', "This cost about 2 of the month's asks of the model."]);
  assert.deepEqual(
    body.to.body.blocks.map((b) => b.kind),
    ['table', 'calendar'],
  );
  /* KEEPING IT WRITES THE PAGE AS THE MODEL DREW IT. */
  value(await api.decide({ id: made[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const kept = JSON.parse(sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = 'page.desk' AND superseded_at IS NULL")!.body) as { blocks: { heading?: string }[] };
  assert.equal(kept.blocks[1]?.heading, 'Releases by day');
  sql.close();
});

test('THE MODEL IS ASKED ONCE A DRAWING, WHATEVER IT ANSWERED, AND NOT AT ALL WITHOUT ONE', async () => {
  const { heard, model } = listening(() => ({ drafts: [] }));
  const { api, sql, day } = await record(model);
  const first = (await api.slashTick()) as Ticked;
  assert.equal(drew(first).length, 0);
  assert.equal(heard.length, 1);
  assert.ok((first.dropped ?? []).some((d) => d.startsWith('I drew Release blocks on Desk as a calendar. Keep it? was not drawn: ')), JSON.stringify(first.dropped));
  /* THE NEXT DAY IT IS NOT ASKED AGAIN, so a drawing the model could not make costs one ask and no more. */
  day(1);
  await api.slashTick();
  assert.equal(heard.length, 1);
  sql.close();

  /* WITH NO MODEL, A DRAWING ONLY THE MODEL COULD MAKE IS NOT OFFERED. */
  const bare = await record();
  assert.equal(drew((await bare.api.slashTick()) as Ticked).length, 0);
  assert.equal(bare.sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE cause LIKE 'drew:%'")?.n, 0);
  bare.sql.close();
});
