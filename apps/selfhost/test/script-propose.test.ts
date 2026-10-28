/**
 * `ctx.propose` on a real self-host: a script files questions with rows through the record's own gate, signed as its
 * run, and nothing it proposes is applied until the owner accepts it in Needs you.
 *
 * WHY. The key-number backfill (`packages/seed/src/modules/portfolio/kpi-backfill.js`, the KPI plan's K2-C) files one
 * rowset a project with the Key numbers it would keep. A run's own `ask` is one options question and cannot carry rows
 * to make, and no host handed a script `ctx.propose`, so the backfill logged a sentence and filed nothing, on every
 * host. RED BEFORE: with `propose` out of `scriptSandbox`'s runner the first test finds no question and the run's log
 * says this run files no questions.
 *
 * THE WHOLE PATH, as `script-reads.test.ts` runs it: Portfolio installed as an owner installs it, the backfill's
 * declaration installed beside it, due, polled, leased, run in QuickJS through the prelude's frozen `ctx`, its
 * proposals tried against the gate as it asked them and filed with the run when it was applied.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { APART_PREF, PROPOSALS_PER_RUN, type Entry } from '@braindog/kernel';
import { KPI_BACKFILL_SCRIPT, firstPartyDocument } from '@braindog/seed';

import type { Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const DAY = 86_400_000;

const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Question = { id: string; body_kind: string; body: string | Record<string, unknown>; cause?: string | null; opened_by?: string; status?: string };
type Rowset = { register: string; rows: Record<string, unknown>[] };

/** A self-host with a record, its owner, Portfolio installed, and the scripts named installed beside it. */
async function selfhost(scripts: Record<string, unknown>[]) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-script-propose-'));
  const send: Send = async () => new Response('{}');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send, resolve: async () => [] },
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  said(await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } }));
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };
  const doc = firstPartyDocument('portfolio', { seeds: [], holds: ['things'] });
  const planned = said<{ diff: { planHash: string; approve: string[] } }>(await running.api.planPack({ doc, source: { kind: 'local' } } as never, owner));
  said(await running.api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  const k = running.api.kernel;
  said(await k.install(scripts as never));
  /* EVERY QUESTION IN NEEDS YOU, the owner's switch for the agents' shelf turned off: what a run files and how it is
     filed is what this measures, not which of the two places on Decide a draft waits in. */
  running.sql.exec("INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, 'false', '2026-09-01T00:00:00.000Z')", person.value.id, APART_PREF);
  const as = { actor: person.value.id };
  const questions = (): Question[] => said<Question[]>(k.openSuggestions());
  const bodyOf = (q: Question) => (typeof q.body === 'string' ? JSON.parse(q.body) : q.body) as Rowset & { options?: unknown[] };
  return {
    running,
    k,
    as,
    owner,
    questions,
    bodyOf,
    /* DUE NOW, AND RUN: the schedule's row moved into the past, and one pass over the outbox. */
    run: async () => {
      running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(Date.now() - 1_000).toISOString());
      await running.poll();
    },
    /** The newest run line of a script, its outcome, and its log. */
    line: (name: string) => {
      const rows = running.sql.all<{ note: string; to_v: string | null }>(
        "SELECT note, to_v FROM event WHERE target = ? AND kind = 'pull' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1",
        `declaration:script.${name}`,
      );
      const to = JSON.parse(rows[0]?.to_v ?? '{}') as { outcome?: string; log?: string; quiet?: boolean | number };
      return { note: rows[0]?.note ?? 'no run event', outcome: to.outcome, log: to.log ?? '', quiet: to.quiet === 1 || to.quiet === true };
    },
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const BACKFILL = { id: `script.${String(KPI_BACKFILL_SCRIPT.script)}`, kind: 'script', body: KPI_BACKFILL_SCRIPT };

test('THE KEY-NUMBER BACKFILL RUNS THROUGH THE REAL HOST: one question a project in Needs you, draft rows, nothing kept until he accepts', async () => {
  const s = await selfhost([BACKFILL]);
  try {
    const { k, as } = s;
    const project = (name: string, lane: string) => said<Entry>(k.create('things', { name, lane }, as));
    const kiln = project('Kiln', 'earning');
    const linework = project('Linework', 'building');
    const atoll = project('Atoll', 'earning');
    const reading = (thing: Entry, name: string, value: number, at: number, unit?: string) =>
      said(k.create('datapoints', { name, value, thing: thing.id, at: new Date(at).toISOString(), source: 'typed', ...(unit ? { unit } : {}) }, as));
    const end = Date.parse('2026-09-28T00:00:00.000Z');
    for (let i = 0; i < 6; i++) {
      reading(kiln, 'Revenue by month', 400 + i * 120, end - (5 - i) * 30 * DAY, 'USD');
      reading(kiln, 'Daily active players', 700 + i * 13, end - (5 - i) * DAY);
      reading(linework, 'Players', 200 + i * 7, end - (5 - i) * DAY);
      /* ENGINEERING COUNTS ARE NEVER OFFERED, and Atoll's are all it has besides the number it already keeps. */
      reading(linework, 'Lines of code', 9000 + i, end - (5 - i) * DAY);
      reading(atoll, 'Players', 50 + i, end - (5 - i) * DAY);
    }
    said(k.create('kpis', { name: 'Players', thing: atoll.id, measure: 'Players', kind: 'level' }, as));

    await s.run();
    const line = s.line('kpi_backfill');
    assert.equal(line.outcome, 'ok', `${line.note} ${line.log}`);
    assert.match(line.log, /^Offered key numbers for Kiln and Linework\.\n?$/u);
    assert.match(line.note, /wrote nothing\. 2 questions it proposed wait in Needs you\./u);

    /* ONE QUESTION A PROJECT, A ROWSET OF DRAFTS ON KEY NUMBERS, SIGNED AS THE RUN. Atoll keeps one already. */
    const asked = s.questions().filter((q) => String(q.cause ?? '').startsWith('kpi-backfill:'));
    assert.deepEqual(asked.map((q) => q.cause).sort(), [`kpi-backfill:${kiln.id}`, `kpi-backfill:${linework.id}`].sort());
    for (const q of asked) {
      assert.equal(q.body_kind, 'rowset');
      assert.equal(q.opened_by, 'script:kpi_backfill@v1');
      const body = s.bodyOf(q);
      assert.equal(body.register, 'kpis');
      assert.ok(body.rows.length > 0);
      assert.equal(body.rows.every((r) => r.draft === true), true, 'every row is offered as a draft');
    }
    const kilnQ = asked.find((q) => q.cause === `kpi-backfill:${kiln.id}`)!;
    assert.deepEqual(s.bodyOf(kilnQ).rows.map((r) => r.name), ['Revenue by month', 'Daily active players']);
    assert.deepEqual(
      s.bodyOf(asked.find((q) => q.cause === `kpi-backfill:${linework.id}`)!).rows.map((r) => r.name),
      ['Players'],
    );

    /* A PROPOSAL NEVER APPLIES ITSELF: nothing is written, and another night asks nothing new and says nothing. */
    assert.equal(k.count('kpis'), 1);
    await s.run();
    assert.equal(s.line('kpi_backfill').quiet, true, s.line('kpi_backfill').note);
    assert.equal(s.questions().filter((q) => String(q.cause ?? '').startsWith('kpi-backfill:')).length, 2);
    assert.equal(k.count('kpis'), 1);

    /* HE ACCEPTS KILN'S: its rows are made as drafts of Kiln, live, which is what the project page's Suggested section
       lists with Keep and Not this (`draftsOf` in apps/web/src/lib/kpis/kpi-rows.ts). */
    said(await s.running.api.decide({ id: kilnQ.id, decide: { option: 'accept', reason: 'These are the ones.' } }, s.owner));
    const made = said<{ rows: Entry[] }>(k.list({ register: 'kpis' })).rows.filter((e) => e.fields.thing === kiln.id);
    assert.deepEqual(made.map((e) => e.fields.name).sort(), ['Daily active players', 'Revenue by month']);
    assert.equal(made.every((e) => e.fields.draft === true && e.fields.state === 'live'), true);
    assert.deepEqual(made.filter((e) => e.fields.headline === true).map((e) => e.fields.name), ['Revenue by month']);
  } finally {
    await s.close();
  }
});

/** A script that proposes what `proposals` says, writes what each call answered into Seen, and may throw at the end. */
const proposer = (name: string, proposals: string, then = '') => ({
  id: `script.${name}`,
  kind: 'script',
  body: {
    script: name,
    runs: { every: '1h' },
    egress: [],
    keys: [],
    reads: ['things'],
    writes: ['kpis'],
    source: `export default async function run(ctx) {
  const said = [];
  for (const p of ${proposals}) said.push(await ctx.propose(p));
  ctx.log(JSON.stringify(said));
  ${then}
}`,
  },
});

const rowsetOf = (register: string, name: string, i = 0) =>
  `{ question: 'Keep ${name} ${i}?', body_kind: 'rowset', body: { register: '${register}', rows: [{ name: '${name} ${i}', thing: THING, draft: true }] }, cause: 'probe:${name}:${i}' }`;

test('WHAT A SCRIPT MAY PROPOSE IS WHAT IT MAY WRITE, rows or options only, and every refusal is the record\'s usual shape', async () => {
  const s = await selfhost([]);
  try {
    const thing = said<Entry>(s.k.create('things', { name: 'Kiln', lane: 'earning' }, s.as));
    const asks = `[${rowsetOf('things', 'Outside')}, { question: 'Install this?', body_kind: 'change', body: { declaration_id: 'register.kpis', to: { add: { fields: [{ id: 'x', type: 'text' }] } } } }, { question: 'Keep it?', body_kind: 'rowset' }]`;
    said(await s.k.install([proposer('outside', asks.replaceAll('THING', JSON.stringify(thing.id)))] as never));
    await s.run();
    const line = s.line('outside');
    assert.equal(line.outcome, 'ok', line.note);
    const answers = JSON.parse(line.log) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } }[];
    assert.deepEqual(
      answers.map((a) => [a.ok, a.refusal?.code, a.refusal?.at]),
      [
        [false, 'FORBIDDEN', 'body.register'],
        [false, 'ENUM_VALUE_UNKNOWN', 'body_kind'],
        [false, 'REQUIRED_MISSING', 'body'],
      ],
    );
    assert.match(answers[0]!.refusal!.fix, /may write only to kpis/u);
    assert.equal(s.questions().length, 0, 'nothing refused was filed');
  } finally {
    await s.close();
  }
});

test(`A RUN FILES AT MOST ${PROPOSALS_PER_RUN} QUESTIONS, and one that throws after proposing files none`, async () => {
  const s = await selfhost([]);
  try {
    const thing = said<Entry>(s.k.create('things', { name: 'Kiln', lane: 'earning' }, s.as));
    const many = `[${Array.from({ length: PROPOSALS_PER_RUN + 2 }, (_, i) => rowsetOf('kpis', 'Number', i)).join(', ')}]`.replaceAll('THING', JSON.stringify(thing.id));
    said(await s.k.install([proposer('many', many), proposer('thrower', `[${rowsetOf('kpis', 'Thrown')}]`.replaceAll('THING', JSON.stringify(thing.id)), "throw new Error('stopped');")] as never));
    await s.run();

    const answers = JSON.parse(s.line('many').log) as { ok: boolean; value?: { queued?: true }; refusal?: { code: string } }[];
    assert.equal(answers.filter((a) => a.ok && a.value?.queued === true).length, PROPOSALS_PER_RUN);
    assert.deepEqual(answers.slice(PROPOSALS_PER_RUN).map((a) => a.refusal?.code), ['OUT_OF_BOUNDS', 'OUT_OF_BOUNDS']);
    const filed = s.questions().filter((q) => String(q.cause ?? '').startsWith('probe:Number:'));
    assert.equal(filed.length, PROPOSALS_PER_RUN);
    assert.equal(filed.every((q) => q.opened_by === 'script:many@v1'), true);

    /* THROWN AFTER PROPOSING: the run is refused whole, and its question was never filed. */
    assert.equal(s.line('thrower').outcome, 'refused');
    assert.equal(s.questions().filter((q) => String(q.cause ?? '').startsWith('probe:Thrown')).length, 0);

    /* THE NEXT RUN JOINS THE TWENTY WAITING, which are not counted, and files the two left over. */
    await s.run();
    const next = JSON.parse(s.line('many').log) as { ok: boolean; value?: { queued?: true; joined?: true } }[];
    assert.equal(next.filter((a) => a.ok && a.value?.joined === true).length, PROPOSALS_PER_RUN);
    assert.equal(next.filter((a) => a.ok && a.value?.queued === true).length, 2);
    assert.equal(s.questions().filter((q) => String(q.cause ?? '').startsWith('probe:Number:')).length, PROPOSALS_PER_RUN + 2);
    assert.equal(s.k.count('kpis'), 0, 'no proposal applied itself');
  } finally {
    await s.close();
  }
});
