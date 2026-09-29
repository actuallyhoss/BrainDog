/**
 * Totals and figures: the two kinds of number Slash may now say, and only by citing them.
 *
 * WHAT THIS HOLDS. "How much did I spend on software this month" is
 * answered from a total code worked out over the rows read, quoted as `{{sum:…}}`; "why is runway four months" is
 * answered from the figure the record keeps, read for the ask and quoted by its id. Neither is typed by the model, a
 * total over a register the record cut short is never offered, and every brace in the answer is kept on its body as
 * what it stood for, so a screen draws the figure and never the brace.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, ok } from '@braindog/ports';

import { createSlash } from '../src/index.ts';
import type { FigureName, ProjectedFigure } from '../src/project.ts';
import { FIGURES_TRACE } from '../src/propose.ts';
import type { Projection } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, INDEX, NOW, OWNER, openSqlite, ROWS, type FakeRecord } from './double.ts';

const RUNWAY: ProjectedFigure = { id: 'runway-months', name: 'Runway in months', value: 4, unit: null, format: 'months' };
const KEPT: FigureName[] = [{ id: 'runway-months', name: 'Runway in months' }];

/**
 * The double, as a host that lists and reads figures answers: the index names what the record keeps, and the rows call
 * reads what the draft named. `cut` is the host saying a register's rows stopped short.
 */
const figured = (over: { cut?: string[]; rows?: Projection['rows'] } = {}): FakeRecord => {
  const base = fakeRecord(INDEX, over.rows ?? ROWS);
  return {
    ...base,
    async project(args, ctx) {
      const out = await base.project(args, ctx);
      if (!out.ok) return out;
      if (args.registers.length === 0) return ok({ ...out.value, index: { ...out.value.index, figures: KEPT } } as Projection);
      const named = (args as { figures?: string[] }).figures ?? [];
      return ok({
        ...out.value,
        ...(named.includes(RUNWAY.id) ? { figures: [RUNWAY] } : {}),
        ...(over.cut === undefined ? {} : { cut: over.cut }),
      } as Projection);
    },
  };
};

const build = (record: FakeRecord) => {
  const inference = canned();
  const slash = createSlash({ sql: openSqlite(), clock: fixedClock(NOW), inference, record });
  return { inference, slash };
};

const DRAFT = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null });
const DRAFT_RUNWAY = JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'state', is: 'open' }] }, q: null, figures: ['runway-months'] });

const query = (text: string): string => JSON.stringify({ text, body_kind: 'query', body: {}, flagged: false });

test('A TOTAL IS WORKED OUT BY CODE, HANDED TO THE MODEL AS A BRACE, AND CITES EVERY ROW IT ADDS UP', async () => {
  const record = figured();
  const { inference, slash } = build(record);
  inference.say(DRAFT);
  inference.say(query('The two open come to {{sum:obligations.amount.EGP}}.'));
  const out = await slash.propose('how much is still owed', OWNER);

  assert.equal(out.ok, true);
  const prompt = inference.seen[1]?.messages[1]?.content ?? '';
  /* 500500 + 120000 minor units of one currency, and nothing else in the list is money. */
  assert.match(prompt, /\{\{sum:obligations\.amount\.EGP\}\} = EGP 6,205\.00/u);
  assert.deepEqual(out.ok ? [...out.value.citations].sort() : [], ['obligations#7', 'obligations#8']);
  const figures = (out.ok ? out.value.body['figures'] : {}) as Record<string, { kind: string; amount: number; currency: string; n: number }>;
  assert.equal(figures['sum:obligations.amount.EGP']?.kind, 'sum');
  assert.equal(figures['sum:obligations.amount.EGP']?.amount, 620500);
  assert.equal(figures['sum:obligations.amount.EGP']?.n, 2);
});

test('A TOTAL NOBODY WORKED OUT IS REFUSED, as a typed figure is', async () => {
  const { inference, slash } = build(figured());
  inference.say(DRAFT);
  inference.say(query('The two open come to {{sum:obligations.amount.USD}}.'));
  assert.equal(codeOf(await slash.propose('how much is still owed', OWNER)), 'PROPOSAL_UNCITED');
});

test('A REGISTER THE RECORD CUT SHORT IS NEVER TOTALLED, so its total cannot be quoted', async () => {
  const { inference, slash } = build(figured({ cut: ['obligations'] }));
  inference.say(DRAFT);
  inference.say(query('The two open come to {{sum:obligations.amount.EGP}}.'));
  const out = await slash.propose('how much is still owed', OWNER);
  assert.equal(codeOf(out), 'PROPOSAL_UNCITED');
  assert.doesNotMatch(inference.seen[1]?.messages[1]?.content ?? '', /\{\{sum:/u);
});

test('A FIGURE THE DRAFT NAMED IS READ WITH THE ROWS, SAID IN THE FOLD, AND CITED BY ITS ID', async () => {
  const record = figured();
  const { inference, slash } = build(record);
  inference.say(DRAFT_RUNWAY);
  inference.say(query('Runway is {{runway-months}}, and {{ref:obligations#7}} is the larger bill.'));
  const out = await slash.propose('why is runway four months', OWNER);

  assert.equal(out.ok, true);
  /* THE INDEX NAMED IT FOR THE DRAFT, and the rows call asked for exactly what the draft named. */
  assert.match(inference.seen[0]?.messages[1]?.content ?? '', /runway-months: Runway in months/u);
  assert.deepEqual((record.projected[1] as { figures?: string[] }).figures, ['runway-months']);
  assert.deepEqual(out.ok ? out.value.read.find((t) => t.register === FIGURES_TRACE) : null, {
    register: FIGURES_TRACE,
    rows: 1,
    predicate: '["runway-months"]',
  });
  const figures = (out.ok ? out.value.body['figures'] : {}) as Record<string, { kind: string; value?: number; title?: string }>;
  assert.equal(figures['runway-months']?.kind, 'metric');
  assert.equal(figures['runway-months']?.value, 4);
  assert.equal(figures['ref:obligations#7']?.title, 'Office rent');
});

test('A FIGURE THE RECORD DOES NOT KEEP IS DROPPED FROM THE DRAFT, and a bare id nothing read is refused', async () => {
  const record = figured();
  const { inference, slash } = build(record);
  inference.say(JSON.stringify({ registers: ['obligations'], where: null, q: 'rent', figures: ['burn-rate'] }));
  inference.say(query('Burn is {{burn-rate}}.'));
  const out = await slash.propose('what is the burn', OWNER);
  assert.equal((record.projected[1] as { figures?: string[] }).figures, undefined);
  assert.equal(codeOf(out), 'PROPOSAL_UNCITED');
});

test('NO ROW BUT A FIGURE STILL GOES ON TO THE MODEL, because the figure is something to answer from', async () => {
  const { inference, slash } = build(figured({ rows: [] }));
  inference.say(DRAFT_RUNWAY);
  inference.say(query('Runway is {{runway-months}}.'));
  const out = await slash.propose('why is runway four months', OWNER);
  assert.equal(out.ok, true);
  assert.equal(inference.seen.length, 2);
});
