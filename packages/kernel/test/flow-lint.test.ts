/**
 * An automation is a rule that has grown a trigger and steps (`loop/research-shell-automations.md` §2, §3).
 *
 * WHAT IS ASSERTED HERE IS THE DEFINITION AND ITS LINT, NOT THE RUNNER. A rule whose trigger is a clock installs, a rule
 * that would install and then do nothing is refused with a sentence, and every rule written before `on:` existed still
 * answers `inline`, which is the promise that the rules already in somebody's record are automations the canvas can open
 * without a migration.
 *
 * `pathOf` IS IMPORTED INSIDE EACH TEST that uses it, so that before `flow-lint.ts` existed each of those tests failed
 * on its own line rather than taking the whole file down at the import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'party', type: 'text' },
    ],
  } as never,
};

/** A call a rule may start, sending fields of obligations. */
const HOOK: Declaration = {
  id: 'ingest.post_invoice',
  kind: 'ingest',
  body: {
    ingest: 'post_invoice',
    channel: 'call',
    url: 'https://hooks.example.test/invoices',
    trigger: 'rule',
    grant: 'hook key',
    sends: ['obligations.what'],
  } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

const code = (decl: Declaration): string | null => validateDeclaration(decl)?.code ?? null;

/** What a refused install said, for an assertion message. */
const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};
const refusedAs = (r: unknown): string | null => (r as { refusal?: { code: string } }).refusal?.code ?? null;

async function install(...decls: Declaration[]) {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  return k.install([OBLIGATIONS, ...decls]);
}

/* ── the red the brief asked for, measured ─────────────────────────────── */

test('A RULE ON A CLOCK, WITH NO REGISTER, INSTALLS, and answers that it runs as a run', async () => {
  const hourly = rule({ rule: 'hourly', on: { every: '1h' }, then: [{ notify: { say: 'Look at the gold rate.' } }], once_per: ['rule'] });
  const done = await install(hourly);
  assert.ok(done.ok, why(done));
  const { pathOf } = await import('../src/flow-lint.ts');
  assert.equal(pathOf(hourly.body as never), 'run');
});

/* ── triggers ─────────────────────────────────────────────────────────── */

test('A CLOCK UNDER FIFTEEN MINUTES IS REFUSED where it is written, as a pull under the floor is', async () => {
  const fast = rule({ rule: 'fast', on: { every: '5m' }, then: [{ stop: true }] });
  assert.equal(code(fast), 'DECLARATION_INVALID');
  const done = await install(fast);
  assert.equal(done.ok, false);
});

test('A CLOCK THIS RECORD CANNOT READ IS REFUSED, not armed at a guess', () => {
  assert.equal(code(rule({ rule: 'vague', on: { every: 'hourly' }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'late', on: { every: '1d', at: '25:00' }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'odd', on: { every: '6h', at: '08:00' }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'weekly', on: { every: '1w', at: '08:00', day: 'mon' }, then: [{ stop: true }] })), null);
});

test('ONE TRIGGER PER RULE, and a trigger nobody wires yet says so', () => {
  assert.equal(code(rule({ rule: 'two', on: { every: '1h', manual: true }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'none', on: {}, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'what', on: { hourly: true }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'answer', on: { decided: {} }, then: [{ stop: true }] })), 'NOT_IN_THIS_BUILD');
  assert.equal(code(rule({ rule: 'button', on: { manual: true }, then: [{ stop: true }] })), null);
});

test('A RULE WITH NEITHER A TRIGGER NOR A REGISTER IS REFUSED, because it would install and never fire', async () => {
  const idle = rule({ rule: 'idle', then: [{ tag: 'x' }] });
  assert.equal(code(idle), 'REQUIRED_MISSING');
  assert.equal((await install(idle)).ok, false);
});

test('A RUN KEEPS ITS REGISTER IN ITS TRIGGER, because the inline pass reads a top-level register as every write', async () => {
  const both = rule({ rule: 'both', register: 'obligations', on: { every: '1h' }, then: [{ stop: true }] });
  assert.equal(code(both), 'DECLARATION_INVALID');
  assert.equal((await install(both)).ok, false);
});

test('A WRITTEN TRIGGER AND THE REGISTER BESIDE IT MUST AGREE', () => {
  assert.equal(
    code(rule({ rule: 'split', register: 'people', on: { written: { register: 'obligations' } }, then: [{ tag: 'x' }] })),
    'DECLARATION_INVALID',
  );
  assert.equal(code(rule({ rule: 'bare', on: { written: { register: 'obligations' } }, then: [{ tag: 'x' }] })), 'REQUIRED_MISSING');
  assert.equal(code(rule({ rule: 'same', register: 'obligations', on: { written: { register: 'obligations' } }, then: [{ tag: 'x' }] })), null);
});

test('A ROW VERB ON A TRIGGER WITH NO ROW IS REFUSED, since it would reach for a row that is not there', async () => {
  const tag = rule({ rule: 'tagless', on: { every: '1h' }, then: [{ tag: 'late' }] });
  assert.equal(code(tag), 'DECLARATION_INVALID');
  assert.equal((await install(tag)).ok, false);
  assert.equal(code(rule({ rule: 'whenless', on: { manual: true }, when: 'what is x', then: [{ stop: true }] })), 'DECLARATION_INVALID');
});

test('A METRIC TRIGGER NAMES A METRIC THAT IS THERE', async () => {
  const crossing = rule({ rule: 'crossing', on: { metric: { id: 'cash_now', crosses: { lte: 0 } } }, then: [{ stop: true }] });
  assert.equal(code(crossing), 'NOT_IN_THIS_BUILD');
  const done = await install(crossing);
  assert.equal(done.ok, false);
  assert.equal(refusedAs(done), 'DECLARATION_UNKNOWN');
  assert.equal(code(rule({ rule: 'vague', on: { metric: { id: 'cash_now', crosses: 'lots' } }, then: [{ stop: true }] })), 'DECLARATION_INVALID');
});

/* ── steps ────────────────────────────────────────────────────────────── */

const deep = (n: number): unknown => (n === 0 ? { tag: 'x' } : { if: 'what is x', then: [deep(n - 1)] });

test('BRANCHES NEST THREE DEEP AND NO FURTHER', () => {
  const at = (n: number) => rule({ rule: `deep${n}`, on: { written: { register: 'obligations', op: ['create'] } }, steps: [deep(n)] });
  assert.equal(code(at(3)), null);
  assert.equal(code(at(4)), 'OUT_OF_BOUNDS');
});

test('FIFTY STEPS, and a declaration can lower the ceiling but never raise it', () => {
  const many = (n: number, limits?: unknown) =>
    rule({ rule: 'many', on: { manual: true }, steps: Array.from({ length: n }, () => ({ wait: '15m' })), ...(limits ? { limits } : {}) });
  assert.equal(code(many(50)), null);
  assert.equal(code(many(51)), 'OUT_OF_BOUNDS');
  assert.equal(code(many(10, { steps_per_run: 5 })), 'OUT_OF_BOUNDS');
  assert.equal(code(many(3, { runs_per_day: 5000 })), 'OUT_OF_BOUNDS');
});

test('THEN AND STEPS ARE ONE LIST OR THE OTHER, never both', () => {
  assert.equal(code(rule({ rule: 'twice', on: { manual: true }, then: [{ stop: true }], steps: [{ wait: '1h' }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'nothing', on: { manual: true } })), 'REQUIRED_MISSING');
});

test('A STEP IS ONE OF THE CLOSED VERBS, and its answer lands under a name a template can read', () => {
  const one = (step: unknown) => code(rule({ rule: 'one', on: { manual: true }, steps: [step] }));
  assert.equal(one({ fetch: 'https://example.test' }), 'DECLARATION_INVALID');
  /* A WELL-MADE ask_spark IS NOT IN THIS BUILD, since no host answers one; a malformed one is told what is wrong first. */
  assert.equal(one({ ask_spark: { question: 'Gold today?', as: 'rate', shape: 'number' } }), 'NOT_IN_THIS_BUILD');
  assert.equal(one({ ask_spark: { question: 'Gold today?', as: 'Rate!' } }), 'DECLARATION_INVALID');
  assert.equal(one({ ask_spark: { question: 'Which?', as: 'vars' } }), 'DECLARATION_INVALID');
  assert.equal(one({ ask_spark: { question: 'Which?', as: 'pick', shape: 'choice' } }), 'REQUIRED_MISSING');
  assert.equal(one({ ask_person: { question: 'Pay it?', options: [], as: 'answer' } }), 'DECLARATION_INVALID');
  assert.equal(one({ ask_person: { question: 'Pay it?', options: ['yes', 'no'], as: 'answer', wait: 'a week' } }), 'DECLARATION_INVALID');
  assert.equal(one({ wait: '2 hours' }), 'DECLARATION_INVALID');
  assert.equal(one({ set_var: { name: 'total', to: '{{vars.rate}}' } }), null);
  assert.equal(one({ script: { id: 'gold_rate', as: 'rate' } }), null);
});

test('A CALL STEP NAMES A DECLARED CALL, never an address', () => {
  const calls = (to: string) => rule({ rule: 'poster', on: { written: { register: 'obligations', op: ['create'] } }, steps: [{ call: { ingest: to } }], once_per: ['what'] });
  assert.equal(code(calls('https://hooks.example.test')), 'DECLARATION_INVALID');
  assert.equal(code(calls('post_invoice')), null);
  /* NOT INSTALLED: a `steps` body with no `then` is refused by the kernel's own `undeclarable` in `index.ts`, which
     this brief does not own. The lint alone is asked, against the call as installed. */
  const known = new Map([OBLIGATIONS, HOOK].map((d) => [d.id, d.body as Record<string, never>]));
  assert.equal(validateDeclaration(calls('post_nothing'), known)?.code, 'DECLARATION_UNKNOWN');
  assert.equal(validateDeclaration(calls('post_invoice'), known), null);
});

test('A STEP THAT CALLS OR ASKS ABOUT A ROW DECLARES ONCE_PER, as notify has always had to', () => {
  const asks = rule({ rule: 'asks', on: { written: { register: 'obligations', op: ['update'] } }, steps: [{ ask_person: { question: 'Pay?', options: ['yes'], as: 'a' } }] });
  assert.equal(code(asks), 'REQUIRED_MISSING');
});

test('A CREATE INSIDE A STEP MEETS THE SAME BOUND A CREATE IN THEN DOES', () => {
  const unbounded = rule({ rule: 'gen', on: { manual: true }, steps: [{ if: 'x is y', then: [{ create: { register: 'obligations', fields: { what: 'x' } } }] }] });
  assert.equal(code(unbounded), 'CREATE_UNBOUNDED');
});

test('A RULE WITH NO TRIGGER STILL DOES WHAT IT DID, and a key the inline pass would ignore is refused rather than ignored', () => {
  assert.equal(code(rule({ rule: 'off', register: 'obligations', enabled: false, then: [{ tag: 'x' }] })), 'NOT_IN_THIS_BUILD');
  assert.equal(code(rule({ rule: 'scoped', register: 'obligations', project: 'p1', then: [{ tag: 'x' }] })), 'NOT_IN_THIS_BUILD');
  assert.equal(code(rule({ rule: 'named', register: 'obligations', name: 'Tag it', then: [{ tag: 'x' }] })), null);
});

/* ── the path ─────────────────────────────────────────────────────────── */

test('EVERY RULE OF TODAY ANSWERS INLINE, and anything that waits, filters or has no row answers run', async () => {
  const { pathOf } = await import('../src/flow-lint.ts');
  assert.equal(pathOf({ rule: 'late', register: 'obligations', when: 'what is x', then: [{ tag: 'late' }] } as never), 'inline');
  assert.equal(pathOf({ rule: 'late', register: 'obligations', on: { written: { register: 'obligations' } }, then: [{ tag: 'late' }] } as never), 'inline');
  /* `on: 'create'` is an older word three kernel fixtures carry and nothing ever read. It stays what it was. */
  const legacy = rule({ rule: 'legacy', register: 'obligations', on: 'create', once_per: ['what'], then: [{ tag: 'late' }] });
  assert.equal(pathOf(legacy.body as never), 'inline');
  assert.equal(code(legacy), null);
  assert.equal(pathOf({ rule: 'late', on: { written: { register: 'obligations', op: ['create'] } }, then: [{ tag: 'late' }] } as never), 'run');
  assert.equal(pathOf({ rule: 'late', register: 'obligations', steps: [{ tag: 'late' }] } as never), 'run');
  assert.equal(pathOf({ rule: 'late', on: { arrival: {} }, then: [{ stop: true }] } as never), 'run');
  assert.equal(pathOf({ rule: 'late', on: { manual: true }, then: [{ stop: true }] } as never), 'run');
});

test('THE EXAMPLE IN 07 §6.2 LINTS AS PRINTED, so the page a stranger copies from is not refused', () => {
  const gold = rule({
    rule: 'gold_rate',
    on: { every: '1h' },
    steps: [{ call: { ingest: 'gold_price', as: 'price' } }, { if: 'price > 3000', then: [{ notify: { say: 'Gold is at {{vars.price}}' } }] }],
  });
  assert.equal(code(gold), null);
});

/* ── what the checker found untested ──────────────────────────────────── */

test('A TRIGGER NAMES WHAT IS INSTALLED: a register for writes, an ingest for arrivals, a day for a weekly clock', () => {
  /* EACH OF THESE CHECKS COULD BE DELETED AND THE FILE ABOVE STAYED GREEN. Measured on 22 September by removing the
     line and rerunning: the unknown register, the unknown ingest and the weekly clock with no day all survived. */
  const known = new Map([OBLIGATIONS, HOOK].map((d) => [d.id, d.body as Record<string, never>]));
  const writes = rule({ rule: 'ghost', on: { written: { register: 'nobody', op: ['create'] } }, steps: [{ stop: true }] });
  assert.equal(validateDeclaration(writes, known)?.code, 'REGISTER_UNKNOWN');
  const lands = rule({ rule: 'lands', on: { arrival: { ingest: 'nowhere' } }, steps: [{ stop: true }] });
  assert.equal(validateDeclaration(lands, known)?.code, 'DECLARATION_UNKNOWN');
  assert.equal(code(rule({ rule: 'weekly', on: { every: '1w', at: '08:00' }, then: [{ stop: true }] })), 'REQUIRED_MISSING');
});

test('A CALL SENDS FIELDS OF THE REGISTER THE RULE IS ABOUT, from run: and from a call step alike', () => {
  /* NOTHING IN THE KERNEL SUITE HELD THIS BEFORE: with the sends check in `callFault` removed, all 1,177 kernel tests
     passed. A call that posts fields of obligations from a rule about people would post a row it was never given. */
  const PEOPLE: Declaration = { id: 'register.people', kind: 'register', body: { id: 'people', name: 'People', title: 'who', fields: [{ id: 'who', type: 'text', required: true }] } as never };
  const known = new Map([OBLIGATIONS, PEOPLE, HOOK].map((d) => [d.id, d.body as Record<string, never>]));
  const inline = rule({ rule: 'wrong', register: 'people', then: [{ run: 'post_invoice' }], once_per: ['who'] });
  assert.equal(validateDeclaration(inline, known)?.code, 'DECLARATION_INVALID');
  const step = rule({ rule: 'wrong_step', on: { written: { register: 'people', op: ['create'] } }, steps: [{ call: { ingest: 'post_invoice' } }], once_per: ['who'] });
  assert.equal(validateDeclaration(step, known)?.code, 'DECLARATION_INVALID');
});

test('ENABLED AND NAME ARE CHECKED ON THE INLINE PATH TOO, so the string "false" is not a switch that is ignored', () => {
  /* `enabled: false` was refused inline and `enabled: 'false'` installed, the same switch drawn and read by nothing. A
     `name: 42` installed on either path and reached the canvas card as a number. */
  assert.equal(code(rule({ rule: 'quoted', register: 'obligations', enabled: 'false', then: [{ tag: 'x' }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'on_still', register: 'obligations', enabled: true, then: [{ tag: 'x' }] })), null);
  assert.equal(code(rule({ rule: 'numbered', register: 'obligations', name: 42, then: [{ tag: 'x' }] })), 'DECLARATION_INVALID');
  assert.equal(code(rule({ rule: 'numbered_run', on: { manual: true }, name: '', steps: [{ stop: true }] })), 'DECLARATION_INVALID');
});

test('THE HOOK FIXTURE IS A CALL A RULE MAY START, so the refusals above are about the rule and not the fixture', async () => {
  const fine = rule({ rule: 'poster', register: 'obligations', then: [{ run: 'post_invoice' }], once_per: ['what'] });
  const done = await install(HOOK, fine);
  assert.ok(done.ok, why(done));
});
