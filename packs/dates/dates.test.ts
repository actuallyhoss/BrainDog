/**
 * Dates: the days somebody else fixed, as a pack file. A deadline, a window with a last day, and a date that comes round.
 *
 * WHY A LIST OF ITS OWN. A day somebody else fixed is not work somebody here chose to do, so filed as a task it sat in
 * the open work and went when the tasks were cleared. Here a date is a row of `dates`: what it is, its day, and where
 * it is a window, its last day. `day` is a deadline with a reminder a week and a day before, as Services declares its
 * renewal day (`packages/seed/src/modules/estate.ts`), so a date is in whatever a record reads its deadlines into.
 *
 * WHY A SCRIPT AND NOT THE LIST'S OWN REPEAT. A list declares one repeat for every row it holds, and the kernel refuses
 * `bymonthday` by name (`packages/kernel/src/declare.ts`), so "this row every week, that one on the first of each
 * month, most of them never" is nothing a list can say. Each row says its own in `comes_round`, and `roll.js`, started by
 * a rule on a daily clock, moves a repeating row whose last day has passed to its first turn on or after today. A move
 * is an update of the row, so its history holds every turn it has had.
 *
 * WHAT IT CANNOT DRAW YET, MEASURED BELOW AND NOT READ: a time strip of the windows. `lanes` reads two instants and
 * looks back from now, a week at most (`packages/kernel/src/kinds/lanes.ts`), and a window here is two days, most of
 * them ahead. The first test under "The page" holds that refusal, so the day lanes take days this file goes red and
 * the table of windows becomes the strip.
 *
 * AND THE DAY IS THE RECORD'S OWN. `roll.js` read the UTC day off the instant until a script could ask for the local
 * one; it asks `ctx.today()` now (`packages/script`, batch 64), and the test under "The script" holds a record ahead
 * of UTC and one behind it.
 *
 * RED FIRST, MEASURED: with no `roll.js` and no `dates.pack.json` this file failed at its first read, ENOENT, before a
 * single test ran. With both and a script that writes nothing, six of the eighteen failed: the four on where a turn
 * lands, the question the script asks of the list, and the daily rule. So the days are the script's arithmetic and
 * not the list's. The fixture rows are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

/* A TUESDAY IN MARCH OF A YEAR WHOSE FEBRUARY HAS 28 DAYS, so the month before is the short one. */
const NOW = Date.UTC(2026, 2, 10, 9);
const TODAY = '2026-03-10';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Clock = ReturnType<typeof fixedClock>;
type Sql = ReturnType<typeof openSqlite>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Body = Record<string, unknown>;

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./dates.pack.json', import.meta.url);
const file = (): Body & { version: string; declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const SOURCE = readFileSync(new URL('./roll.js', import.meta.url), 'utf8');

/** A fresh record holding every first-party pack, which is where a person stands when they add this one. */
async function record(at = NOW): Promise<{ api: Api; clock: Clock; sql: Sql; close: () => void }> {
  const sql = openSqlite();
  const clock = fixedClock(at);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  return { api, clock, sql, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/**
 * The rule's runs, taken to the end the way a host takes them: the schedule drained, then the outbox, with the script
 * run in QuickJS by the runner the self-host builds. The script fetches nothing, so the socket, the pin and the key
 * opener are doubles that refuse, and its `ctx.now()` is the record's own clock.
 */
async function settle(api: Api, clock: Clock, rounds = 3): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('rolling a date fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => clock.now() } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const DAY_MS = 24 * 60 * 60_000;

type Entry = { id: string; seq: number; version: number; fields: Body; deleted_at?: string | null };
const add = (api: Api, fields: Body): string => said<{ id: string }>(api.kernel.create('fixed_dates', fields as never, { actor: 'p_1' })).id;
const got = (api: Api, id: string): Entry => api.kernel.get(id) as unknown as Entry;
/** The days a row's reminders are armed for, soonest first, read off the record's own schedule. */
const reminders = (sql: Sql, id: string): string[] =>
  sql
    .all<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'reminder' AND state = 'pending' AND key LIKE ? ORDER BY due_at", `${id}:%`)
    .map((r) => r.due_at.slice(0, 10));
const span = (api: Api, id: string): unknown[] => [got(api, id).fields.day, got(api, id).fields.until ?? null];

/* ── Before the pack, and the file ─────────────────────────────────────────────────────────────── */

test('BEFORE THE PACK: a record with every first-party pack has no dates, no Dates page and nothing that rolls one', async () => {
  const { api, close } = await record();
  assert.equal(api.kernel.register('fixed_dates'), undefined);
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['register.fixed_dates', 'page.dates', 'rule.dates_roll', 'script.dates_roll']) assert.ok(!ids.includes(id), `${id} is already on the record`);
  close();
});

test('THE SCRIPT IN THE FILE IS roll.js, byte for byte; it fetches nothing and reaches nothing but dates, once a day', () => {
  const doc = file();
  assert.deepEqual([doc.pack, doc.version, (doc.requires as Body).packs ?? {}], ['fixed-dates', '1.0.0', {}], 'Dates needs no other add-on');
  const script = doc.declarations.find((d) => d.script === 'dates_roll')!;
  assert.equal(script.source, SOURCE, 'dates.pack.json and roll.js disagree; copy roll.js into the source');
  assert.deepEqual([script.egress, script.keys, script.reads, script.writes], [[], [], ['fixed_dates'], ['fixed_dates']]);
  /* THE CLOCK IS THE RULE'S, so the script is started by it and has none of its own to drift from it. */
  assert.deepEqual(script.runs, { rule: true });
  const rule = doc.declarations.find((d) => d.rule === 'dates_roll')!;
  assert.deepEqual(rule.on, { every: '1d' });
  assert.deepEqual(rule.steps, [{ script: { id: 'dates_roll', as: 'rolled' } }]);
  assert.match(SOURCE, /^\/\*\*/u, 'a script opens with a comment saying what it does');
  assert.doesNotMatch(JSON.stringify(doc), /—/u, 'an em dash in words a person reads');
});

test('INSTALLED FROM THE FILE: one list, one rule, one script and a page, and nothing refused', async () => {
  const { api, close } = await record();
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(diff.adds.map((a) => a.id).sort(), ['page.dates', 'register.fixed_dates', 'rule.dates_roll', 'script.dates_roll']);
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'fixed-dates')?.version, '1.0.0');
  close();
});

test('THE SAME FILE PASSES AS AN ADD-ON SOMEBODY OPENS FROM DISK', async () => {
  const opened = said<{ pack: { manifest: { pack: string; version: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['fixed-dates', '1.0.0']);
});

/* ── The list ──────────────────────────────────────────────────────────────────────────────────── */

type Field = Body & { id: string };
const fieldsOf = (): Field[] => file().declarations.find((d) => d.register === 'fixed_dates')!.fields as Field[];

test('A DATE IS WHAT AND A DAY, and the day is a deadline that reminds a week and a day before', async () => {
  const { api, sql, close } = await record();
  said(await put(api, file()));
  const day = fieldsOf().find((f) => f.id === 'day')!;
  assert.deepEqual([day.type, day.required, day.deadline, day.remind], ['day', true, true, ['-7d', '-1d']]);
  assert.deepEqual([fieldsOf().find((f) => f.id === 'until')!.label, fieldsOf().find((f) => f.id === 'until')!.required ?? false], ['Last day', false]);

  /* WHAT AND A DAY ARE ENOUGH. With no last day it is a deadline, of the kind and the repeat a row has when it says neither. */
  const id = add(api, { what: 'Trade mark renewal', day: '2026-04-02' });
  assert.deepEqual(span(api, id), ['2026-04-02', null]);
  assert.deepEqual([got(api, id).fields.kind, got(api, id).fields.comes_round], ['deadline', 'no']);
  const bare = api.kernel.create('fixed_dates', { what: 'No day at all' } as never, { actor: 'p_1' }) as Out;
  assert.equal(bare.ok, false, 'a date with no day was taken');

  /* THE RECORD READS IT AS A DEADLINE: its two reminders are armed for the days before it, and none for the day itself. */
  assert.deepEqual(reminders(sql, id), ['2026-03-26', '2026-04-01']);
  close();
});

test('WITH A LAST DAY IT IS A WINDOW, and the kinds and repeats are the ones the list names, each with words of its own', async () => {
  const { api, close } = await record();
  said(await put(api, file()));
  const id = add(api, { what: 'Trade fair', day: '2026-05-14', until: '2026-05-17', kind: 'event' });
  assert.deepEqual(span(api, id), ['2026-05-14', '2026-05-17']);
  const kind = fieldsOf().find((f) => f.id === 'kind')!;
  assert.deepEqual([kind.values, kind.labels], [['deadline', 'event'], { deadline: 'Deadline', event: 'Event' }]);
  const repeats = fieldsOf().find((f) => f.id === 'comes_round')!;
  assert.deepEqual(repeats.values, ['no', 'weekly', 'monthly', 'yearly', 'month_start', 'month_end']);
  assert.deepEqual(repeats.labels, {
    no: 'Does not repeat',
    weekly: 'Every week',
    monthly: 'Every month',
    yearly: 'Every year',
    month_start: 'First day of each month',
    month_end: 'Last day of each month',
  });
  const odd = api.kernel.create('fixed_dates', { what: 'Fortnightly', day: '2026-05-14', comes_round: 'fortnightly' } as never, { actor: 'p_1' }) as Out;
  assert.equal(odd.ok, false, 'a repeat the script cannot roll was taken');
  close();
});

/* ── The script, in QuickJS ────────────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number };
type Listed = { where: Json; options: Json };

/** A host double holding a few dates on a given day. It hands back every row, so the script's own check is what is tested. */
const hostOf = (today: string, rows: Row[], asked: Listed[] = []): CtxHost => ({
  fetch: async () => {
    throw new Error('rolling a date fetches nothing');
  },
  list: async (_register, where, options) => {
    asked.push({ where, options });
    return rows as unknown as Json[];
  },
  now: () => `${today}T09:00:00.000Z`,
  clock: () => 0,
  tz: 'UTC',
  input: null,
});

const decl = (): ScriptDecl => {
  const s = file().declarations.find((d) => d.script === 'dates_roll') as unknown as { script: string; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };
  return { id: s.script, version: 1, egress: s.egress, keys: s.keys, reads: s.reads, writes: s.writes, source: s.source };
};

const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

test('TODAY IS THE DAY WHERE THE RECORD IS: a weekly date moves at the record\'s own midnight, not at UTC\'s', async () => {
  const row = (day: string): Row => ({ id: '01K5DATE000000000000000001', register: 'fixed_dates', seq: 7, fields: { title: 'Bins', day, comes_round: 'weekly' }, version: 3 });
  const at = (now: string, tz: string, day: string): CtxHost => ({ ...hostOf('2026-03-10', [row(day)]), now: () => now, tz });
  /* 22:30 UTC ON THE 10TH IS ALREADY THE 11TH IN CAIRO, so the 10th has passed there and the date moves on a week. */
  const ahead = writesOf(await runInQuickJs(decl(), at('2026-03-10T22:30:00.000Z', 'Africa/Cairo', '2026-03-10'))) as unknown as { patch: Record<string, Json> }[];
  assert.deepEqual(ahead.map((w) => w.patch.day), ['2026-03-17']);
  /* THE SAME INSTANT IN UTC IS STILL THE 10TH, the date's own day, and nothing moves. */
  assert.deepEqual(writesOf(await runInQuickJs(decl(), at('2026-03-10T22:30:00.000Z', 'UTC', '2026-03-10'))), []);
  /* 01:00 UTC ON THE 11TH IS STILL THE 10TH IN NEW YORK, so a date on the 10th is not behind today there yet. */
  assert.deepEqual(writesOf(await runInQuickJs(decl(), at('2026-03-11T01:00:00.000Z', 'America/New_York', '2026-03-10'))), []);
});

/** Where one row is moved to on a given day: its new day and last day, or `null` when the script leaves it alone. */
async function rolled(today: string, fields: Record<string, Json>): Promise<[Json, Json] | null> {
  const writes = writesOf(await runInQuickJs(decl(), hostOf(today, [{ id: '01K5DATE000000000000000001', register: 'fixed_dates', seq: 7, fields, version: 3 }])));
  if (writes.length === 0) return null;
  assert.equal(writes.length, 1);
  const w = writes[0] as { op: string; spoken: string; patch: Record<string, Json>; version: number };
  assert.deepEqual([w.op, w.spoken, w.version], ['update', 'fixed_dates#7', 3], 'a move is an update of the row, at the version it was read');
  return [w.patch.day ?? null, w.patch.until ?? null];
}

test('A DATE THAT DOES NOT REPEAT, IS STILL TO COME OR IS STILL RUNNING IS LEFT WHERE IT IS', async () => {
  assert.equal(await rolled(TODAY, { what: 'Filing', day: '2026-01-31', comes_round: 'no' }), null, 'a date that never repeats was moved');
  assert.equal(await rolled(TODAY, { what: 'Filing', day: '2026-01-31' }), null, 'a date that says nothing of repeating was moved');
  assert.equal(await rolled(TODAY, { what: 'Board call', day: TODAY, comes_round: 'weekly' }), null, 'today has not passed');
  assert.equal(await rolled(TODAY, { what: 'Board call', day: '2026-03-17', comes_round: 'weekly' }), null);
  /* A WINDOW IS MEASURED BY ITS LAST DAY, so one that opened last week and closes today is still on. */
  assert.equal(await rolled(TODAY, { what: 'Regatta', day: '2026-03-06', until: TODAY, comes_round: 'yearly' }), null);
});

test('EACH REPEAT LANDS ON ITS FIRST TURN ON OR AFTER TODAY, however many turns were missed', async () => {
  const day = (today: string, from: string, repeats: string): Promise<[Json, Json] | null> => rolled(today, { what: 'Turn', day: from, comes_round: repeats });
  /* 3 March was a Tuesday, and so is today: the turn that falls today is the one, not the week after. */
  assert.deepEqual(await day(TODAY, '2026-03-03', 'weekly'), [TODAY, null]);
  assert.deepEqual(await day('2026-03-11', '2026-03-03', 'weekly'), ['2026-03-17', null]);
  /* YEARS BEHIND, AND STILL ITS OWN WEEKDAY: 6 January 2015 was a Tuesday too. */
  assert.deepEqual(await day('2026-03-11', '2015-01-06', 'weekly'), ['2026-03-17', null]);
  assert.deepEqual(await day(TODAY, '2026-02-12', 'monthly'), ['2026-03-12', null]);
  assert.deepEqual(await day(TODAY, '2025-11-05', 'monthly'), ['2026-04-05', null]);
  assert.deepEqual(await day(TODAY, '2025-06-20', 'yearly'), ['2026-06-20', null]);
  assert.deepEqual(await day(TODAY, '2024-03-10', 'yearly'), [TODAY, null]);
});

test('A MONTH TOO SHORT FOR THE DAY TAKES ITS LAST DAY, and 29 February is the 28th in a year without one', async () => {
  const day = (today: string, from: string, repeats: string): Promise<[Json, Json] | null> => rolled(today, { what: 'Turn', day: from, comes_round: repeats });
  assert.deepEqual(await day('2026-02-03', '2026-01-31', 'monthly'), ['2026-02-28', null]);
  assert.deepEqual(await day('2028-02-03', '2028-01-31', 'monthly'), ['2028-02-29', null]);
  assert.deepEqual(await day('2026-04-05', '2026-01-31', 'monthly'), ['2026-04-30', null]);
  assert.deepEqual(await day('2025-01-10', '2024-02-29', 'yearly'), ['2025-02-28', null]);
  assert.deepEqual(await day('2027-06-01', '2024-02-29', 'yearly'), ['2028-02-29', null]);
});

/** One row taken through several days' runs, each run's move written onto it as the record would: its day and the day it repeats from, after each. */
async function walked(fields: Record<string, Json>, todays: string[]): Promise<[Json, Json][]> {
  const row: Row = { id: '01K5DATE000000000000000001', register: 'fixed_dates', seq: 7, fields: { ...fields }, version: 3 };
  const out: [Json, Json][] = [];
  for (const today of todays) {
    for (const w of writesOf(await runInQuickJs(decl(), hostOf(today, [row]))) as unknown as { patch: Record<string, Json> }[]) {
      for (const [k, v] of Object.entries(w.patch)) {
        if (v === null) delete row.fields[k];
        else row.fields[k] = v;
      }
    }
    out.push([row.fields.day ?? null, row.fields.repeats_from ?? null]);
  }
  return out;
}

test('THE 31ST COMES BACK AFTER A SHORT MONTH: a monthly date keeps the day it was written with and is counted from it', async () => {
  /* JANUARY'S 31ST, RUN THE DAY AFTER EACH TURN: February cuts it to the 28th, and March has it on the 31st again. */
  assert.deepEqual(await walked({ what: 'Card bill', day: '2026-01-31', comes_round: 'monthly' }, ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']), [
    ['2026-02-28', '2026-01-31'],
    ['2026-03-31', '2026-01-31'],
    ['2026-04-30', '2026-01-31'],
    ['2026-05-31', '2026-01-31'],
    ['2026-06-30', '2026-01-31'],
  ]);
  /* THE 30TH AND THE 29TH ARE CUT IN FEBRUARY TOO, and each comes back to its own day and not to the 31st. */
  assert.deepEqual(await walked({ what: 'Payroll', day: '2026-01-30', comes_round: 'monthly' }, ['2026-02-01', '2026-03-01']), [
    ['2026-02-28', '2026-01-30'],
    ['2026-03-30', '2026-01-30'],
  ]);
  /* MANY TURNS MISSED AT ONCE, AND STILL THE 31ST: found on 28 February with months gone by, it lands on July's. */
  assert.deepEqual(await walked({ what: 'Card bill', day: '2026-02-28', repeats_from: '2026-01-31', comes_round: 'monthly' }, ['2026-07-04']), [['2026-07-31', '2026-01-31']]);
  /* A WINDOW KEEPS ITS LENGTH AS ITS FIRST DAY COMES BACK. */
  const row = { what: 'Close', day: '2026-02-28', until: '2026-03-02', repeats_from: '2026-01-31', comes_round: 'monthly' };
  assert.deepEqual(await rolled('2026-03-05', row), ['2026-03-31', '2026-04-02']);
});

test('29 FEBRUARY COMES BACK IN THE NEXT LEAP YEAR, standing on the 28th in the years between', async () => {
  assert.deepEqual(await walked({ what: 'Leap day', day: '2024-02-29', comes_round: 'yearly' }, ['2024-03-01', '2025-03-01', '2026-03-01', '2027-03-01']), [
    ['2025-02-28', '2024-02-29'],
    ['2026-02-28', '2024-02-29'],
    ['2027-02-28', '2024-02-29'],
    ['2028-02-29', '2024-02-29'],
  ]);
});

test('A DAY NO MONTH CUTS SHORT KEEPS NOTHING, and a day somebody moved off its turn is the one counted from', async () => {
  /* THE 12TH IS IN EVERY MONTH, so there is nothing to keep and the row says nothing more than its day. */
  assert.deepEqual(await walked({ what: 'Rent', day: '2026-01-12', comes_round: 'monthly' }, ['2026-01-13', '2026-02-13']), [
    ['2026-02-12', null],
    ['2026-03-12', null],
  ]);
  /* MOVED BY HAND TO THE 15TH: that is the day now, and the 31st it once kept is taken off. */
  assert.deepEqual(await walked({ what: 'Card bill', day: '2026-03-15', repeats_from: '2026-01-31', comes_round: 'monthly' }, ['2026-03-16']), [['2026-04-15', null]]);
  /* MOVED BY HAND TO ANOTHER DAY PAST THE 28TH: the 30th is kept from here on, in place of the 31st. */
  assert.deepEqual(await walked({ what: 'Card bill', day: '2026-01-30', repeats_from: '2025-12-31', comes_round: 'monthly' }, ['2026-02-01', '2026-03-01']), [
    ['2026-02-28', '2026-01-30'],
    ['2026-03-30', '2026-01-30'],
  ]);
  /* A YEARLY DATE MOVED TO ANOTHER MONTH IS COUNTED FROM THERE, though its day of the month is the same. */
  assert.deepEqual(await walked({ what: 'Review', day: '2026-05-28', repeats_from: '2024-02-29', comes_round: 'yearly' }, ['2026-06-01']), [['2027-05-28', null]]);
  /* CHANGED TO A REPEAT THAT KEEPS NO DAY OF THE MONTH: the kept day goes, and the week is seven days on. */
  assert.deepEqual(await walked({ what: 'Call', day: '2026-02-28', repeats_from: '2026-01-31', comes_round: 'weekly' }, ['2026-03-01']), [['2026-03-07', null]]);
  assert.deepEqual(await walked({ what: 'Close', day: '2026-02-28', repeats_from: '2026-01-31', comes_round: 'month_end' }, ['2026-03-01']), [['2026-03-31', null]]);
});

test('FIRST DAY OF EACH MONTH IS THE 1ST, AND LAST DAY OF EACH MONTH IS THE 28TH, 29TH, 30TH OR 31ST', async () => {
  const day = (today: string, from: string, repeats: string): Promise<[Json, Json] | null> => rolled(today, { what: 'Turn', day: from, comes_round: repeats });
  assert.deepEqual(await day(TODAY, '2026-03-01', 'month_start'), ['2026-04-01', null]);
  assert.deepEqual(await day('2026-04-01', '2026-03-01', 'month_start'), ['2026-04-01', null]);
  assert.deepEqual(await day('2027-01-01', '2026-03-01', 'month_start'), ['2027-01-01', null]);
  /* FEBRUARY, THE SHORT ONE: from January's 31st, in a year with 28 days and in one with 29. */
  assert.deepEqual(await day('2026-02-03', '2026-01-31', 'month_end'), ['2026-02-28', null]);
  assert.deepEqual(await day('2028-02-03', '2028-01-31', 'month_end'), ['2028-02-29', null]);
  /* AND BACK OUT TO THE 31ST, which a monthly date that landed on the 28th would not do. */
  assert.deepEqual(await day(TODAY, '2026-02-28', 'month_end'), ['2026-03-31', null]);
  assert.deepEqual(await day('2026-04-02', '2026-02-28', 'month_end'), ['2026-04-30', null]);
  /* A DAY WRITTEN MID-MONTH TAKES ITS OWN MONTH'S END FIRST, and its own month's 1st has already gone. */
  assert.deepEqual(await day('2026-03-20', '2026-03-15', 'month_end'), ['2026-03-31', null]);
  assert.deepEqual(await day('2026-03-20', '2026-03-15', 'month_start'), ['2026-04-01', null]);
});

test('A WINDOW MOVES WHOLE: its last day by as many days as its first, to the first turn that has not ended', async () => {
  /* FOUR DAYS, A YEAR ON. */
  assert.deepEqual(await rolled(TODAY, { what: 'Regatta', day: '2025-08-21', until: '2025-08-24', comes_round: 'yearly' }), ['2026-08-21', '2026-08-24']);
  /* THE TURN STILL RUNNING TODAY IS THE ONE: it opened on the 8th and closes on the 11th. */
  assert.deepEqual(await rolled(TODAY, { what: 'Market', day: '2026-02-08', until: '2026-02-11', comes_round: 'monthly' }), ['2026-03-08', '2026-03-11']);
  /* THE LENGTH IS COUNTED IN DAYS, so three days from a month's end run into the next whatever the month's length. */
  assert.deepEqual(await rolled(TODAY, { what: 'Close', day: '2026-01-31', until: '2026-02-02', comes_round: 'month_end' }), ['2026-03-31', '2026-04-02']);
  assert.deepEqual(await rolled('2026-03-03', { what: 'Close', day: '2026-01-31', until: '2026-02-02', comes_round: 'month_end' }), ['2026-03-31', '2026-04-02']);
  assert.deepEqual(await rolled('2026-03-02', { what: 'Close', day: '2026-01-31', until: '2026-02-02', comes_round: 'month_end' }), ['2026-02-28', '2026-03-02']);
});

test('THE SCRIPT ASKS ONLY FOR REPEATING DATES WHOSE LAST DAY IS BEHIND TODAY, so its one page is never spent on the rest', async () => {
  const asked: Listed[] = [];
  writesOf(await runInQuickJs(decl(), hostOf(TODAY, [], asked)));
  assert.deepEqual(asked, [
    {
      where: {
        all: [
          { field: 'comes_round', in: ['weekly', 'monthly', 'yearly', 'month_start', 'month_end'] },
          { any: [{ field: 'until', before: TODAY }, { all: [{ field: 'until', empty: true }, { field: 'day', before: TODAY }] }] },
        ],
      },
      options: null,
    },
  ]);
});

/* ── The whole path, on the record's own clock ─────────────────────────────────────────────────── */

type Line = { kind: string; field: string | null; to: unknown };
/** Every day a row has stood on, oldest first, read off its own history: the day it was written with, then each move. */
const turns = (api: Api, id: string): unknown[] =>
  (api.kernel as unknown as { history(id: string): Line[] }).history(id).flatMap((l) => {
    if (l.field === 'day') return [l.to];
    const whole = l.to !== null && typeof l.to === 'object' ? (l.to as Body).day : undefined;
    return l.field === null && whole !== undefined ? [whole] : [];
  });

test('THE DAILY RULE ROLLS WHAT HAS PASSED AND NOTHING ELSE, and a row keeps every turn it has had', async () => {
  const { api, clock, sql, close } = await record();
  said(await put(api, file()));
  const rent = add(api, { what: 'Rent leaves the account', day: '2026-03-01', comes_round: 'month_start' });
  const close_ = add(api, { what: 'Month close', day: '2026-02-28', comes_round: 'month_end' });
  const fair = add(api, { what: 'Trade fair', day: '2025-05-14', until: '2025-05-17', kind: 'event', comes_round: 'yearly' });
  const once = add(api, { what: 'Tax return', day: '2026-01-31' });
  const ahead = add(api, { what: 'Standards review', day: '2026-03-12', comes_round: 'weekly' });

  /* THE INSTALL ARMS THE RULE FOR THE SAME HOUR THE DAY AFTER, the clock reaches it, and the record's own drain starts
     the script. So today in what follows is 11 March. */
  clock.advance(DAY_MS + 1);
  await settle(api, clock);
  assert.deepEqual(span(api, rent), ['2026-04-01', null]);
  assert.deepEqual(span(api, close_), ['2026-03-31', null]);
  assert.deepEqual(span(api, fair), ['2026-05-14', '2026-05-17']);
  assert.deepEqual(span(api, once), ['2026-01-31', null], 'a date that does not repeat was moved');
  assert.deepEqual(span(api, ahead), ['2026-03-12', null], 'a date still to come was moved');
  /* THE REMINDERS FOLLOW THE DAY, because the move is an update like any other. */
  assert.deepEqual(reminders(sql, rent), ['2026-03-25', '2026-03-31']);

  /* THE NEXT DAY'S RUN FINDS NOTHING PASSED AND WRITES NOTHING: the weekly date falls that very day, and today is not past. */
  const before = [rent, close_, fair, once, ahead].map((id) => got(api, id).version);
  clock.advance(DAY_MS);
  await settle(api, clock);
  assert.deepEqual([rent, close_, fair, once, ahead].map((id) => got(api, id).version), before, 'a date that had not passed was written again');

  /* THREE WEEKS ON, THE DAY AFTER THE 1ST, each one that has passed moves again, and a row's history holds every day
     it has stood on: the one it was written with, then each move. */
  clock.set(Date.UTC(2026, 3, 2, 9));
  await settle(api, clock);
  assert.deepEqual(span(api, rent), ['2026-05-01', null]);
  assert.deepEqual(span(api, close_), ['2026-04-30', null]);
  assert.deepEqual(span(api, ahead), ['2026-04-02', null]);
  assert.deepEqual(turns(api, rent), ['2026-03-01', '2026-04-01', '2026-05-01']);
  close();
});

test('ON A RECORD: the rule keeps the 31st through a short month, and takes the kept day off a date moved by hand', async () => {
  /* THE LAST DAY OF JANUARY, so the first run, on 1 February, has a short month straight ahead. */
  const { api, clock, close } = await record(Date.UTC(2026, 0, 31, 9));
  said(await put(api, file()));
  const bill = add(api, { what: 'Card bill', day: '2026-01-31', comes_round: 'monthly' });
  const moved = add(api, { what: 'Insurance', day: '2026-01-15', repeats_from: '2025-12-31', comes_round: 'monthly' });
  const kept = (id: string): unknown[] => [got(api, id).fields.day, got(api, id).fields.repeats_from ?? null];

  clock.advance(DAY_MS + 1);
  await settle(api, clock);
  assert.deepEqual(kept(bill), ['2026-02-28', '2026-01-31']);
  assert.deepEqual(kept(moved), ['2026-02-15', null], 'a day moved by hand still carries the day it once kept');

  clock.set(Date.UTC(2026, 2, 1, 9));
  await settle(api, clock);
  assert.deepEqual(kept(bill), ['2026-03-31', '2026-01-31'], 'the 31st did not come back after February');
  clock.set(Date.UTC(2026, 3, 1, 9));
  await settle(api, clock);
  assert.deepEqual(kept(bill), ['2026-04-30', '2026-01-31']);
  clock.set(Date.UTC(2026, 4, 1, 9));
  await settle(api, clock);
  assert.deepEqual(kept(bill), ['2026-05-31', '2026-01-31']);
  assert.deepEqual(turns(api, bill), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  close();
});

/* ── Moving and restoring, which are the record's own ──────────────────────────────────────────── */

test('A MOVE IS AN UPDATE WITH A NEW DAY, and a deleted date is restored to where it was', async () => {
  const { api, clock, sql, close } = await record();
  said(await put(api, file()));
  const id = add(api, { what: 'Hearing', day: '2026-04-02', until: '2026-04-03', note: 'Room 4, bring the bundle.' });
  /* THE NEXT MORNING, because a person's edit in the minute they wrote the row is part of writing it. */
  clock.advance(DAY_MS);
  said(api.kernel.update('fixed_dates', id, { day: '2026-04-09', until: '2026-04-10' } as never, { actor: 'p_1' }));
  assert.deepEqual(span(api, id), ['2026-04-09', '2026-04-10']);
  assert.deepEqual(turns(api, id), ['2026-04-02', '2026-04-09']);
  assert.deepEqual(reminders(sql, id), ['2026-04-02', '2026-04-08'], 'the reminders stayed with the old day');

  said(api.kernel.update('fixed_dates', id, { deleted_at: true } as never, { actor: 'p_1' }));
  const listed = (): unknown[] => said<{ rows: { id: string }[] }>(api.kernel.list({ register: 'fixed_dates', limit: 50 })).rows.map((r) => r.id);
  assert.deepEqual(listed(), [], 'a deleted date is still listed');
  assert.deepEqual(reminders(sql, id), [], 'a deleted date still reminds');

  said(api.kernel.update('fixed_dates', id, { deleted_at: null } as never, { actor: 'p_1' }));
  assert.deepEqual(listed(), [id]);
  const back = got(api, id);
  assert.deepEqual([back.seq, back.fields.what, back.fields.day, back.fields.until, back.fields.note], [1, 'Hearing', '2026-04-09', '2026-04-10', 'Room 4, bring the bundle.']);
  assert.deepEqual(reminders(sql, id), ['2026-04-02', '2026-04-08']);
  close();
});

/* ── The page ──────────────────────────────────────────────────────────────────────────────────── */

type Drawn = { kind: string; heading: string; rows?: { fields: Body }[]; refusals: { code: string; fix: string }[]; window?: Body; matched?: number };
const pageOf = async (api: Api): Promise<{ title: string; blocks: Drawn[] }> => said(await api.page({ slug: 'dates' }, owner));
const named = (b: Drawn | undefined): unknown[] => (b?.rows ?? []).map((r) => r.fields.what);

test('MEASURED: LANES READ TWO INSTANTS AND A WINDOW IS TWO DAYS, so the windows are a table until lanes take days', async () => {
  const { api, close } = await record();
  /* THE STRIP AS IT WOULD BE DECLARED: the title, the first day and the last. It installs, and is refused when read. */
  const doc = file();
  const page = doc.declarations.find((d) => d.page === 'dates') as Body & { blocks: Body[] };
  const at = page.blocks.findIndex((b) => b.heading === 'Windows');
  assert.equal(page.blocks[at]!.kind, 'table');
  page.blocks[at] = { kind: 'lanes', heading: 'Windows', span: 12, source: 'register.fixed_dates', columns: [{ field: 'what' }, { field: 'day' }, { field: 'until' }] };
  said(await put(api, doc));
  add(api, { what: 'Trade fair', day: '2026-05-14', until: '2026-05-17', kind: 'event' });
  const strip = (await pageOf(api)).blocks.find((b) => b.heading === 'Windows')!;
  assert.deepEqual(named(strip), [], 'lanes drew a window of days, so the Windows table can become the time strip');
  assert.deepEqual(
    strip.refusals.map((r) => r.fix),
    ["A lanes's second column is when it started, an instant field, and fixed_dates's day is day."],
  );
  close();
});

test('THE DATES PAGE DRAWS A CALENDAR OF THE DAYS, THE WINDOWS AND WHAT IS COMING, with nothing refused', async () => {
  const { api, close } = await record();
  said(await put(api, file()));
  add(api, { what: 'Tax return', day: '2026-01-31' });
  add(api, { what: 'Trade mark renewal', day: '2026-04-02' });
  add(api, { what: 'Trade fair', day: '2026-05-14', until: '2026-05-17', kind: 'event' });
  add(api, { what: 'Audit visit', day: '2026-03-09', until: '2026-03-12' });
  add(api, { what: 'Stocktake', day: '2026-02-02', until: '2026-02-04' });
  add(api, { what: 'Licence review', day: '2026-09-01' });

  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'dates'));
  const page = await pageOf(api);
  assert.equal(page.title, 'Dates');
  assert.deepEqual(page.blocks.map((b) => [b.kind, b.heading]), [['calendar', 'On the calendar'], ['table', 'Windows'], ['table', 'What is coming']]);
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);

  /* THE CALENDAR IS THIS MONTH AND THE TWO AFTER, so a date in January and one in September are off it and still kept. */
  const calendar = page.blocks[0]!;
  assert.deepEqual(calendar.window, { from: '2026-03-01', to: '2026-05-31', today: TODAY });
  assert.deepEqual(named(calendar).sort(), ['Audit visit', 'Trade fair', 'Trade mark renewal']);

  /* A WINDOW IS ANY DATE WITH A LAST DAY THAT HAS NOT PASSED: the visit that opened yesterday is still on, and the
     stocktake that closed in February is not. */
  assert.deepEqual(named(page.blocks[1]), ['Audit visit', 'Trade fair']);

  /* WHAT IS COMING STARTS TODAY, soonest first, a deadline and a window alike. */
  assert.deepEqual(named(page.blocks[2]), ['Trade mark renewal', 'Trade fair', 'Licence review']);
  close();
});

test('NOTHING A PERSON READS ON THE PAGE NAMES A ROW, AN ID OR A FILE', () => {
  const doc = file();
  const page = doc.declarations.find((d) => d.page === 'dates') as Body & { blocks: Body[] };
  const words = [doc.title, doc.summary, doc.changes, page.title, ...page.blocks.flatMap((b) => [b.heading, b.empty])].map(String);
  for (const w of words) assert.doesNotMatch(w, /\b(row|rows|entity|list item|register|ULID)\b|#\d|\.js|\.json/iu, w);
  /* ONE CALENDAR AND TWO TABLES: no figure with nothing to say, and no chart. */
  assert.equal(page.blocks.length, 3);
});

/* ── A record's own kinds ──────────────────────────────────────────────────────────────────────── */

test('A RECORD ADDS KINDS OF ITS OWN, and a later version of the add-on leaves them and the dates that use them', async () => {
  const { api, close } = await record();
  said(await put(api, file()));
  /* THE OWNER'S OWN WORDS FOR THEIR DATES, added to the list in the app. The add-on ships two and names nobody's. */
  const live = api.kernel.declarations().find((d) => d.id === 'register.fixed_dates') as unknown as { body: string; version: number };
  const body = JSON.parse(live.body) as Body & { fields: Field[] };
  const kind = body.fields.find((f) => f.id === 'kind')!;
  kind.values = [...(kind.values as string[]), 'bundle', 'work'];
  said(await api.setDeclaration({ body: { register: 'fixed_dates', ...body }, version: live.version } as never, owner));
  const id = add(api, { what: 'Regatta week', day: '2026-06-18', until: '2026-06-21', kind: 'bundle' });

  /* THE NEXT VERSION, a patch that changes a word and still names its own two kinds. */
  const next = file();
  next.version = '1.0.1';
  next.changes = 'A word on the page changed.';
  const diff = await planOf(api, next);
  assert.deepEqual(diff.conflicts, [], 'the update could not be laid over a list the owner had added to');
  said(await api.installPack({ doc: next, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  assert.equal(api.kernel.packs().find((p) => p.id === 'fixed-dates')?.version, '1.0.1');
  assert.equal(got(api, id).fields.kind, 'bundle');
  /* AND STILL TAKEN ON A NEW DATE AND ON A MOVE, which is what a value quietly dropped would refuse. */
  said(api.kernel.update('fixed_dates', id, { day: '2026-06-19', until: '2026-06-22' } as never, { actor: 'p_1' }));
  add(api, { what: 'Delivery slot', day: '2026-07-01', kind: 'work' });
  close();
});
