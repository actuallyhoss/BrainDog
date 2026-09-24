/**
 * A step may read `{{vars.x}}` only where an earlier step certainly kept `x`.
 *
 * WHAT WAS MEASURED BEFORE THE LINT CHANGED, on 24 September at HEAD `896dd8b` (audit sixty-six, finding 7, probe B1).
 * `[{ script: { id: 'tidy' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }]` linted clean, installed,
 * the run ended `done` with no sentence, and the note read `queued as —`: `fill` writes a dash for a path that reaches
 * nothing (`flow.ts`'s `pathValue`). Making a script's `as:` optional (`db7074ad`) widened this, and it was not new. The
 * same body with a `call` step that keeps nothing, and a `{{vars.nope}}` that no step anywhere keeps, both linted clean
 * too: the walk checked that a name was well formed where it was KEPT and never asked whether a name READ was kept at
 * all, for any kind. The first test below failed on every one of those bodies before `unkeptIn` was asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

const ITEMS: Declaration = {
  id: 'register.items',
  kind: 'register',
  body: {
    id: 'items',
    name: 'Items',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const TIDY: Declaration = {
  id: 'script.tidy',
  kind: 'script',
  body: { script: 'tidy', runs: { rule: true }, egress: [], keys: [], reads: ['items'], writes: ['items'], source: 'export default async function run(ctx) {}' } as never,
};

const rule = (steps: unknown[]): Declaration => ({
  id: 'rule.t',
  kind: 'rule',
  body: { rule: 't', on: { written: { register: 'items', op: ['update'], fields: ['state'] } }, steps: [{ if: 'state is done', then: steps }] } as never,
});

const manual = (steps: unknown[]): Declaration => ({ id: 'rule.m', kind: 'rule', body: { rule: 'm', on: { manual: true }, steps } as never });

const said = (d: Declaration): string | null => validateDeclaration(d)?.fix ?? null;
const reads = (name: string) => ({ notify: { say: `about {{vars.${name}}}` } });

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; out: Awaited<ReturnType<Kernel['install']>> }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([ITEMS, ...decls]);
  return { k, sql, out };
}

test('A READ OF A NAME NO EARLIER STEP KEEPS IS REFUSED, for every kind that keeps one, naming the step and the name', () => {
  /* B1 exactly: the script step keeps nothing, and the set after it reads the name it used to keep. */
  assert.equal(
    said(rule([{ script: { id: 'tidy' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }])),
    'rule.t reads {{vars.job}} at steps[0].then[1], and no step keeps an answer called job, so the run would write a dash in its place. Keep it with as: job on the step that makes it, or take {{vars.job}} out.',
  );
  /* THE SAME HOLE THROUGH A CALL, older than the script's: `call.as` was optional from the start. */
  assert.match(said(manual([{ call: { ingest: 'gold_rate' } }, reads('rate')])) ?? '', /^rule\.m reads \{\{vars\.rate\}\} at steps\[1\], and no step keeps an answer called rate/u);
  /* AND A NAME NOTHING KEEPS AT ALL, which needs no optional `as:` to write. */
  assert.match(said(manual([reads('nope')])) ?? '', /^rule\.m reads \{\{vars\.nope\}\} at steps\[0\]/u);
  /* ANOTHER KIND'S NAME, and the spaced spelling `fill` reads the same way (`RUN_PATH`). */
  assert.match(said(manual([{ ask_person: { question: 'Which?', options: ['a', 'b'], as: 'pick' } }, { notify: { say: '{{ vars.picked }}' } }])) ?? '', /reads \{\{ vars\.picked \}\} at steps\[1\]/u);
  /* A STEP READING THE NAME IT IS ABOUT TO KEEP reads it before it is kept, and the run fills the dash. */
  assert.match(said(manual([{ set_var: { name: 'p', to: 'again {{vars.p}}' } }])) ?? '', /^rule\.m reads \{\{vars\.p\}\} at steps\[0\], and p is kept only by a step that does not certainly run before it/u);
  assert.match(said(manual([{ ask_spark: { question: 'Rate for {{vars.r}}?', as: 'r' } }])) ?? '', /reads \{\{vars\.r\}\} at steps\[0\]/u);
  /* A CONDITION IS FILLED FROM THE RUN TOO (`fill(step.if, ...)`), so its braces are reads. */
  assert.match(said(manual([{ if: 'what is {{vars.w}}', then: [{ stop: true }] }])) ?? '', /reads \{\{vars\.w\}\} at steps\[0\]/u);
  /* A LATER STEP'S NAME IS NOT AN EARLIER ONE'S. */
  assert.match(
    said(manual([reads('x'), { set_var: { name: 'x', to: 'one' } }])) ?? '',
    /^rule\.m reads \{\{vars\.x\}\} at steps\[0\], and x is kept only by a step that does not certainly run before it: a later step, or one arm of a branch\. /u,
  );
});

test('A BRANCH KEEPS A NAME FOR WHAT FOLLOWS IT ONLY WHEN BOTH ARMS DO', () => {
  const branch = (then: unknown[], otherwise?: unknown[]) => ({ if: 'state is done', then, ...(otherwise ? { else: otherwise } : {}) });
  const keep = (n: string) => ({ set_var: { name: n, to: 'v' } });
  /* ONE ARM: the other way through reaches the read with nothing kept, and `if` with no `else` has an empty one. */
  assert.match(said(manual([branch([keep('x')]), reads('x')])) ?? '', /reads \{\{vars\.x\}\} at steps\[1\], and x is kept only by a step that does not certainly run/u);
  assert.match(said(manual([branch([keep('x')], [{ stop: true }]), reads('x')])) ?? '', /reads \{\{vars\.x\}\} at steps\[1\]/u);
  /* KEPT ONLY IN THE `else` IS STILL KEPT SOMEWHERE, so the sentence is the wrong-place one. With `keptAnywhere` blind to
     the `else` arm the checker measured this saying "no step keeps an answer called x", and every other case passing. */
  assert.match(said(manual([branch([{ stop: true }], [keep('x')]), reads('x')])) ?? '', /reads \{\{vars\.x\}\} at steps\[1\], and x is kept only by a step that does not certainly run/u);
  /* NOT IN THE OTHER ARM EITHER: no run takes the `else` after the `then`. */
  assert.match(said(manual([branch([keep('x')], [reads('x')])])) ?? '', /reads \{\{vars\.x\}\} at steps\[0\]\.else\[0\]/u);
  /* BOTH ARMS, or before the branch, and it is read anywhere after. */
  assert.equal(said(manual([branch([keep('x')], [keep('x')]), reads('x')])), null);
  assert.equal(said(manual([keep('x'), branch([reads('x')], [reads('x')]), reads('x')])), null);
  assert.equal(said(manual([branch([keep('x'), reads('x')])])), null);
});

test('WHAT KEEPS A NAME STILL LETS IT BE READ: every kind, and a deeper path into it', () => {
  assert.equal(said(rule([{ script: { id: 'tidy', as: 'job' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }])), null);
  assert.equal(said(manual([{ call: { ingest: 'gold_rate', as: 'rate' } }, reads('rate')])), null);
  assert.equal(said(manual([{ ask_spark: { question: 'Rate?', as: 'r' } }, { notify: { say: '{{vars.r.value}}' } }])), null);
  assert.equal(said(manual([{ ask_person: { question: 'Which?', options: ['a', 'b'], as: 'pick' } }, reads('pick')])), null);
  assert.equal(said(manual([{ set_var: { name: 'p', to: 'one' } }, { set_var: { name: 'p', to: 'again {{vars.p}}' } }])), null);
  /* THE TRIGGER'S OWN PATHS ARE NOT ANSWERS, and are left alone. */
  assert.equal(said(manual([{ notify: { say: '{{trigger.at}}' } }])), null);
});

test('B1 IS REFUSED AT INSTALL, and nothing is queued or written', async () => {
  const { k, sql, out: ready } = await record(TIDY);
  assert.ok(ready.ok, fixOf(ready));
  /* THE RULE ALONE, SO THE LIST AND THE SCRIPT STAY: install takes a batch whole or not at all. */
  const out = await k.install([rule([{ script: { id: 'tidy' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }])]);
  assert.equal(out.ok, false);
  assert.match(fixOf(out), /rule\.t reads \{\{vars\.job\}\} at steps\[0\]\.then\[1\], and no step keeps an answer called job/u);
  const made = k.create('items', { what: 'Ship it' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  k.update('items', made.value.id, { state: 'done' }, { actor: 'p_1' });
  await k.drain();
  assert.equal(sql.all("SELECT id FROM automation_run").length, 0);
  sql.close();
});

test('THE SAME BODY WITH as: job INSTALLS AND FILLS THE NOTE with the queued job id', async () => {
  const { k, sql, out } = await record(TIDY, rule([{ script: { id: 'tidy', as: 'job' } }, { set: { field: 'note', to: 'queued as {{vars.job}}' } }]));
  assert.ok(out.ok, fixOf(out));
  const made = k.create('items', { what: 'Ship it' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  k.update('items', made.value.id, { state: 'done' }, { actor: 'p_1' });
  await k.drain();
  const job = sql.one<{ id: string }>("SELECT id FROM outbox WHERE kind = 'script.run'");
  const row = sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', made.value.id);
  assert.equal(JSON.parse(row!.fields).note, `queued as ${job!.id}`);
  sql.close();
});
