/**
 * What came of Slash's suggestions, read by the record (ENG-B01 job 3 with ENG-A16's reading).
 *
 * WHY THIS FILE EXISTS. The readings said what the model was asked and nothing of how its suggestions ended, so "the
 * share accepted unchanged" (D37.183) had no figure anywhere. Held here on a fresh record through `engineReadings`:
 * Slash files three, the owner takes one as it was, takes only some of another, turns the third down, then undoes the
 * first, and each count and the share say so; one past its last day is lapsed without anything being written; an event
 * signed by Slash outside what it may sign is counted in `outside`, and nothing it may sign is; a fold the record made by
 * itself and put back is counted in `folds`; and a record where Slash filed nothing answers no kinds at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { engineReadings, OTHER, type EngineReadings, type SlashFiled } from '../src/engine-readings.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 86_400_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/** A fresh record with its Tasks, whose host hands an empty ledger, as a host that wired one does. */
const record = async (install: readonly unknown[] = [TASKS]) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, engineLedger: async () => ({ calls: [], mentions: [], questions: [] }) } as never);
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-mill', name: 'The Mill', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install(install as never));
  const read = async (): Promise<EngineReadings> => {
    const out = value<EngineReadings | null>(await api.engineReadings(undefined, owner));
    assert.ok(out !== null, 'the host wired a ledger, so the readings answer');
    return out;
  };
  const file = (rows: readonly string[], extra: Record<string, unknown> = {}) =>
    value<{ id: string }>(api.kernel.propose({ question: `Add ${rows.join(' and ')}?`, body_kind: 'rowset', body: { register: 'tasks', rows: rows.map((what) => ({ what })), ...extra } }, 'slash', 'rules')).id;
  return { sql, clock, api, read, file };
};

const kindOf = (r: EngineReadings, kind: string) => r.slash.find((k) => k.kind === kind);

test('THREE FILED, ONE TAKEN AS IT WAS, ONE IN PART, ONE TURNED DOWN, THEN THE FIRST UNDONE: each count and the share', async () => {
  const { sql, api, read, file } = await record();
  const taken = file(['Mend the gate']);
  const part = file(['Sweep the loft', 'Oil the hinges']);
  const no = file(['Paint the barn']);

  const decided = value<{ decision: string }>(await api.decide({ id: taken, decide: { option: 'accept', reason: '' } }, owner));
  value(await api.decide({ id: part, decide: { option: 'accept', reason: '', rows: [0] } } as never, owner));
  value(await api.decide({ id: no, resolved_as: 'wont-fix', reason: 'Not this year.' } as never, owner));

  const before = await read();
  assert.deepEqual(kindOf(before, 'rowset'), { kind: 'rowset', offered: 3, accepted: 1, changed: 1, declined: 1, undone: 0, lapsed: 0, share: 1 / 3 });

  const plan = value<{ hash: string }>(await api.undo({ decision: decided.decision, dry: true }, owner));
  value(await api.undo({ decision: decided.decision, hash: plan.hash }, owner));

  const after = await read();
  /* THE UNDONE ONE IS ASKED AGAIN and reads undone, never accepted and never open: no answer stands as filed now. */
  assert.deepEqual(after.slash, [{ kind: 'rowset', offered: 3, accepted: 0, changed: 1, declined: 1, undone: 1, lapsed: 0, share: 0 }]);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', taken)?.status, 'open');
  /* THE OLD FIELDS STAND AS THEY WERE beside the new ones. */
  assert.deepEqual(after.asks, []);
  assert.deepEqual(after.understanding, { unattached: 0, open_by_cause: {} });
  assert.equal(after.outside, 0, 'Slash signed nothing outside its list');
  sql.close();
});

test('ONE PAST ITS LAST DAY IS LAPSED, worked out on the read and never written; one still waiting is only offered', async () => {
  const { sql, clock, read, file } = await record();
  const late = file(['Order the seed'], { lapses: '2026-10-16' });
  file(['Count the sacks'], { lapses: '2026-10-30' });
  const lines = (): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;

  assert.deepEqual(kindOf(await read(), 'rowset'), { kind: 'rowset', offered: 2, accepted: 0, changed: 0, declined: 0, undone: 0, lapsed: 0, share: null });

  clock.set(NOW + 4 * DAY);
  const n = lines();
  const r = await read();
  assert.deepEqual(kindOf(r, 'rowset'), { kind: 'rowset', offered: 2, accepted: 0, changed: 0, declined: 0, undone: 0, lapsed: 1, share: null });
  assert.equal(lines(), n, 'a reading writes nothing');
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', late)?.status, 'open', 'and closes nothing');

  /* A MONTH ON, NONE OF THEM IS IN THE MONTH. */
  clock.set(NOW + 31 * DAY);
  assert.deepEqual((await read()).slash, []);
  sql.close();
});

test("AN EVENT SIGNED BY SLASH OUTSIDE ITS LIST IS COUNTED in `outside`; what it may sign and last month's are not", async () => {
  const { sql, read, file } = await record();
  file(['Fix the fence']);
  const at = (ms: number): string => new Date(NOW - ms).toISOString();
  /* WRITTEN AROUND THE GUARD, as a writer added later could: the guard throws on any of these through the record's own doors. */
  const line = (id: string, ts: string, kind: string, target: string, to: string | null) =>
    sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v) VALUES (?, ?, 'slash', ?, ?, 'entry', ?)", id, ts, kind, target, to);
  line('ev_out_1', at(DAY), 'edit', 'entry:e_fence', '"Mended"');
  /* A list's declaration signed by Slash: a list is a person's to install, never a model's. */
  line('ev_out_2', at(2 * DAY), 'declare', 'declaration:register.tasks', '1');
  line('ev_in_1', at(DAY), 'predict', 'entry:e_fence', null);
  line('ev_old_1', at(40 * DAY), 'edit', 'entry:e_fence', '"Older"');

  const r = await read();
  assert.equal(r.outside, 2, 'the edit and the list, and nothing Slash may sign or older than the month');
  assert.equal(kindOf(r, 'rowset')?.offered, 1, 'its own question is filed, not outside');
  sql.close();
});

test('A RECORD WHERE SLASH FILED NOTHING answers no kinds, no folds and nothing outside', async () => {
  const { sql, api, read } = await record();
  /* A PERSON'S OWN QUESTION IS NOT SLASH'S. */
  value(api.kernel.propose({ question: 'Add Rake the yard?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Rake the yard' }] } }, 'p_owner'));
  const r = await read();
  assert.deepEqual(r.slash, []);
  assert.deepEqual(r.folds, { made: 0, undone: 0 });
  assert.equal(r.outside, 0);
  sql.close();
});

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

test('A FOLD THE RECORD MADE BY ITSELF is made; put back, it is undone too; a week on it is in neither', async () => {
  const { sql, clock, api, read } = await record([TASKS, PEOPLE]);
  const meet = async (said: Record<string, unknown>) => value<{ undo?: string; question?: string }>(await api.meet(said as never, owner));
  /* MET IN A COMMIT, NOTED UNDER ANOTHER ADDRESS, THEN NOTED UNDER THE COMMIT'S OWN: the strong rules fold the two. */
  await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  assert.ok((await meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' })).question);
  const met = await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' });
  assert.ok(met.undo, 'the strong rules folded them');

  assert.deepEqual((await read()).folds, { made: 1, undone: 0 });
  const plan = value<{ hash: string }>(await api.undo({ batch: met.undo, dry: true }, owner));
  value(await api.undo({ batch: met.undo, hash: plan.hash }, owner));
  assert.deepEqual((await read()).folds, { made: 1, undone: 1 });
  assert.deepEqual((await read()).slash, [], 'a fold is the record\'s own, never a question of Slash\'s');

  clock.set(NOW + 8 * 86_400_000);
  assert.deepEqual((await read()).folds, { made: 0, undone: 0 });
  sql.close();
});

test('THE ARITHMETIC: a no by decision, one put off past now, one taken back on its day, and a kind that is not a word', () => {
  const q = (over: Partial<SlashFiled>): SlashFiled => ({
    kind: 'arrange', status: 'open', resolved_as: null, answer: null, in_part: false, undone: false, lapses: null, defer_until: null, closed_at: null, ...over,
  });
  const r = engineReadings({
    now: NOW,
    today: '2026-10-14',
    calls: [],
    owed: [],
    mentions: [],
    questions: [],
    slash: [
      q({ status: 'resolved', resolved_as: 'addressed', answer: 'reject' }),
      q({ status: 'resolved', resolved_as: 'addressed', answer: 'accept' }),
      /* PUT OFF PAST NOW, it waits, so it has not lapsed; one put off until before now has. */
      q({ lapses: '2026-10-10', defer_until: new Date(NOW + DAY).toISOString() }),
      q({ lapses: '2026-10-10', defer_until: new Date(NOW - DAY).toISOString() }),
      /* TAKEN BACK THE DAY AFTER ITS LAST is lapsed; taken back sooner by its filer is neither. */
      q({ status: 'resolved', resolved_as: 'withdrawn', lapses: '2026-10-10', closed_at: '2026-10-11T03:00:00.000Z' }),
      q({ status: 'resolved', resolved_as: 'withdrawn', lapses: '2026-10-20', closed_at: '2026-10-11T03:00:00.000Z' }),
      q({ kind: 'Not A Word', status: 'resolved', resolved_as: 'incorrect' }),
    ],
    folds: { made: 2, undone: 5 },
    outside: -3,
  });
  assert.deepEqual(r.slash, [
    { kind: 'arrange', offered: 6, accepted: 1, changed: 0, declined: 1, undone: 0, lapsed: 2, share: 0.5 },
    { kind: OTHER, offered: 1, accepted: 0, changed: 0, declined: 1, undone: 0, lapsed: 0, share: 0 },
  ]);
  assert.deepEqual(r.folds, { made: 2, undone: 2 }, 'never more put back than were made');
  assert.equal(r.outside, 0, 'a count that is not one reads 0');
});
