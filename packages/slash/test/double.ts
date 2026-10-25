/**
 * The doubles: a real SQLite, a clock a test can move, a canned model, and a record that records.
 *
 * THE DATABASE IS REAL AND THE MODEL IS NOT, and each for its own reason. `node:sqlite` is the same
 * SQLite the Durable Object runs, so a CHECK constraint that would refuse a row in production
 * refuses it here; a mocked `Sql` would make every assertion about the schema a statement about the
 * mock. The model is canned because what is under test is what this package does WITH an answer,
 * and a live call would make the suite slow, expensive and differently wrong every run.
 *
 * THE CANNED ADAPTER KEEPS EVERY CALL IT WAS GIVEN, which is how `46 §13` D9 is tested rather than
 * asserted: the type has no `tools` field, and the suite then reads the objects that actually
 * reached the adapter and checks that none of them grew one.
 *
 * IT LIVES IN `test/` AND NOT IN `src/`, for the reason `packages/kernel/test/sqlite.ts` states at
 * length: `31 §1` bans `node:` under `packages/**`, so that one package runs unchanged in workerd,
 * in Node and in a bare test process. The adapter is the other side of that line.
 */

import { DatabaseSync } from 'node:sqlite';

import type { Param, Result, Row, Sql } from '@braindog/ports';
import type {
  CallContext,
  Inference,
  InferenceCall,
  Projection,
  ProjectQuery,
  RecordApi,
} from '../src/index.ts';

export type TestSql = Sql & { close(): void };

export const openSqlite = (): TestSql => {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    close: () => db.close(),
    exec(text: string, ...params: Param[]): void {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all<T = Row>(text: string, ...params: Param[]): T[] {
      return db.prepare(text).all(...(params as never[])) as T[];
    },
    one<T = Row>(text: string, ...params: Param[]): T | undefined {
      return db.prepare(text).get(...(params as never[])) as T | undefined;
    },
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
};

/** A clock a test can move. Real time in a test is a test that is slow and flaky in one move. */
export const fixedClock = (ms: number) => {
  let at = ms;
  return { now: () => at, set: (next: number) => (at = next), advance: (by: number) => (at += by) };
};

export type Canned = Inference & {
  /** Every call as the package made it, for the assertions about what a call may carry. */
  seen: InferenceCall[];
  /** Queue another answer. A string is the model's `text`; an `Error` is a provider that did not answer. */
  say(text: string | Error, usage?: { in: number; out: number }): void;
};

export const canned = (): Canned => {
  const queue: { text: string | Error; usage: { in: number; out: number } }[] = [];
  const seen: InferenceCall[] = [];
  return {
    seen,
    say(text, usage = { in: 100, out: 20 }) {
      queue.push({ text, usage });
    },
    complete(call) {
      seen.push(call);
      const next = queue.shift();
      if (next === undefined) throw new Error('the test queued no answer for this call');
      if (next.text instanceof Error) throw next.text;
      return Promise.resolve({ text: next.text, usage: next.usage });
    },
  };
};

export type Filed = { question: string; body_kind: string; body: Record<string, unknown>; ctx: CallContext };

export type FakeRecord = RecordApi & {
  /** Every `project` this package made, in order, so a test can say what it asked for. */
  projected: (ProjectQuery & { budget: { tokens: number } })[];
  /** Every proposal filed, with the context it was filed under. */
  filed: Filed[];
  /** What the next `propose` answers with. `null` files normally. */
  refuse: Result<{ id: string }> | null;
};

/** The two registers the palette tests ask about, with one money field and two day fields. */
export const INDEX: Projection['index'] = {
  registers: [
    {
      id: 'obligations',
      rows: 3,
      open: 2,
      fields: [
        { id: 'what', type: 'text' },
        { id: 'amount', type: 'money' },
        { id: 'due', type: 'day' },
        { id: 'state', type: 'enum' },
      ],
    },
    {
      id: 'domains',
      rows: 2,
      open: 2,
      fields: [
        { id: 'what', type: 'text' },
        { id: 'renews', type: 'day' },
      ],
    },
    /* THE KEYCHAIN IS IN THE INDEX BECAUSE THE RECORD HAS ONE. A test where it is absent proves nothing
       about a package that is supposed to drop it. */
    { id: 'grant', rows: 4, open: 4, fields: [{ id: 'label', type: 'text' }] },
  ],
  open_questions: [],
};

export const ROWS: Projection['rows'] = [
  {
    id: '01',
    register: 'obligations',
    seq: 7,
    spoken: 'obligations#7',
    summary: 'Office rent',
    fields: { what: 'Office rent', amount: { amount: 500500, currency: 'EGP' }, due: '2026-11-04', state: 'open' },
  },
  {
    id: '02',
    register: 'obligations',
    seq: 8,
    spoken: 'obligations#8',
    summary: 'Accountant',
    fields: { what: 'Accountant', amount: { amount: 120000, currency: 'EGP' }, due: '2026-11-18', state: 'open' },
  },
  {
    id: '03',
    register: 'domains',
    seq: 4,
    spoken: 'domains#4',
    summary: 'brain.dog',
    fields: { what: 'brain.dog', renews: '2026-12-01' },
  },
];

/**
 * A record that answers a projection and files a proposal, and keeps what it was asked.
 *
 * `project` ANSWERS THE INDEX WHEN NO REGISTER IS NAMED, which is the record's own two-shaped call
 * (`46 §5.4` steps 3 and 5): the first asks what exists, the second asks for rows. Filtering by
 * register is all the filtering this double does, because what the tests are about is which query
 * this package SENT, not whether SQLite can apply a predicate.
 */
export const fakeRecord = (index = INDEX, rows = ROWS): FakeRecord => {
  const self: FakeRecord = {
    projected: [],
    filed: [],
    refuse: null,
    project(args, _ctx) {
      self.projected.push(args);
      if (args.registers.length === 0)
        return Promise.resolve({ ok: true as const, value: { rows: [], index, budget: { used: 40, limit: args.budget.tokens } } });
      return Promise.resolve({
        ok: true as const,
        value: {
          rows: rows.filter((r) => args.registers.includes(r.register)),
          index: { registers: index.registers.filter((r) => args.registers.includes(r.id)), open_questions: [] },
          budget: { used: 900, limit: args.budget.tokens },
        },
      });
    },
    propose(args, ctx) {
      if (self.refuse !== null) return Promise.resolve(self.refuse);
      self.filed.push({ question: args.question, body_kind: args.body_kind, body: args.body, ctx });
      return Promise.resolve({ ok: true as const, value: { id: `SG${self.filed.length}` } });
    },
  };
  return self;
};

/** The owner, as a browser session builds one. */
export const OWNER: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** A member who may write one register and may not change how Slash is set up. */
export const MEMBER: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };

/** 2026-11-14T09:00:00Z, so the month rolls over to December and the meter's reset date is checkable. */
export const NOW = Date.UTC(2026, 10, 14, 9);
