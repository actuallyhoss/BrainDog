/**
 * What a `change` or a `pattern` proposal previews on Decide: each page, list, rule or look it would put
 * on the screen, in a person's words, and for an automation what starts it and what it would do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { egressOf } from '@braindog/kernel';

import { sayStep, sayTrigger, words } from '../../../lib/flow/flow.ts';
import { proposedOf } from './proposed.ts';

test('a page says where it lands in the sidebar and what it shows', () => {
  const out = proposedOf('change', {
    declaration_id: 'page.reading',
    to: {
      id: 'page.reading',
      kind: 'page',
      body: { title: 'Reading list', nav: { section: 'Studies', order: 20 }, requires: ['register.books'], blocks: [{ kind: 'table', heading: 'Still to read' }, { kind: 'stat' }] },
    },
  });
  assert.equal(out?.appears.length, 1);
  const [page] = out!.appears;
  assert.equal(page?.kind, 'Page');
  assert.equal(page?.title, 'Reading list');
  assert.deepEqual(page?.lines, [
    { label: 'In the sidebar', value: 'Under Studies' },
    { label: 'Shows', value: 'Still to read, Stat' },
    { label: 'Reads from', value: 'Books' },
  ]);
});

test('a module is every declaration it installs, and a look carries its accent', () => {
  const out = proposedOf('change', {
    declaration_id: 'register.assignments',
    to: {
      declarations: [
        { id: 'register.assignments', kind: 'register', body: { title: 'Assignments', fields: [{ id: 'due', label: 'Due' }, { id: 'course_name' }] } },
        { id: 'theme.calm', kind: 'theme', body: { seed: { accent: 'oklch(0.62 0.12 160)' }, scheme: 'both' } },
      ],
    },
  });
  assert.deepEqual(out?.appears.map((a) => [a.kind, a.title]), [['List', 'Assignments'], ['Look', 'Calm']]);
  assert.deepEqual(out?.appears[0]?.lines, [{ label: 'Fields', value: 'Due, Course name' }]);
  assert.equal(out?.appears[1]?.accent, 'oklch(0.62 0.12 160)');
});

test('a pattern is the rule it would install, with how many arrivals it was drawn from', () => {
  const out = proposedOf('pattern', { ingest: { ingest: 'card_receipts', channel: 'email', writes: { register: 'obligations' } }, samples: ['r1', 'r2', 'r3'] });
  assert.equal(out?.samples, 3);
  assert.deepEqual(out?.appears[0]?.lines, [
    { label: 'Comes from', value: 'email' },
    { label: 'Files into', value: 'Obligations' },
  ]);
});

/* THE CANVAS'S OWN SENTENCES, called here and not typed out, because the promise is that Decide and the canvas say one
   rule in one set of words. It was typed out at first, and while this was being written the canvas renamed its branch
   from "Only if" with arms "Then" and "Otherwise" to "If" with "If so" and "If not": the literal failed, and Decide,
   which imports the words, had already followed. */
test('a rule is what starts it and each step as a sentence, with a branch read as its two arms', () => {
  const steps = [
    { tag: 'late' },
    { if: { field: 'amount', gt: 70 }, then: [{ notify: { say: 'A big one is late' } }], else: [{ note: 'Small, left alone' }] },
    { call: { ingest: 'dunning', as: 'sent' } },
  ];
  const on = { written: { register: 'invoices', op: ['update' as const], fields: ['state'] } };
  const out = proposedOf('change', {
    declaration_id: 'rule.chase',
    to: { id: 'rule.chase', kind: 'rule', body: { rule: 'chase', name: 'Chase late invoices', on, when: 'state is late', steps } },
  });
  const [rule] = out?.appears ?? [];
  assert.deepEqual([rule?.kind, rule?.title], ['Rule', 'Chase late invoices']);
  assert.deepEqual(rule?.lines, [
    { label: 'Starts', value: sayTrigger(on) },
    { label: 'Only when', value: 'state is late' },
    { label: 'How it runs', value: words.asRun },
    { label: 'Step 1', value: sayStep(steps[0]!) },
    { label: 'Step 2', value: sayStep(steps[1]!) },
    { label: `Step 2, ${words.then.toLowerCase()} 1`, value: 'Tell you: A big one is late' },
    { label: `Step 2, ${words.otherwise.toLowerCase()} 1`, value: 'Add a note: Small, left alone' },
    /* A CALL INSTALLS AND DOES NOT RUN in this build, and the record's dry run says so; the owner reads it before accepting. */
    { label: 'Step 3', value: `${sayStep(steps[2]!)}. Not in this build: a run stops here, after the steps before it.` },
  ]);
});

test('a rule with no trigger of its own starts on its list and runs inside the write', () => {
  const out = proposedOf('change', { to: { id: 'rule.flag', kind: 'rule', body: { rule: 'flag', register: 'invoices', then: [{ tag: 'new' }] } } });
  assert.deepEqual(out?.appears[0]?.title, 'Flag');
  assert.deepEqual(out?.appears[0]?.lines, [
    { label: 'Starts', value: 'When a row in invoices is added or changed' },
    { label: 'How it runs', value: words.inline },
    { label: 'Step 1', value: 'Tag it: new' },
  ]);
});

test('a script says where it calls out, what it may send, and carries its source to be read', () => {
  const body = {
    script: 'fx',
    title: 'Exchange rates',
    runs: { every: '1h' },
    egress: ['https://api.rates.example'],
    keys: ['Rates'],
    reads: ['holdings'],
    writes: ['series.fx'],
    source: 'export default async (ctx) => {\n  return ctx.fetch("https://api.rates.example/today");\n}',
  };
  const out = proposedOf('change', { to: { id: 'script.fx', kind: 'script', body } });
  const [script] = out?.appears ?? [];
  assert.deepEqual([script?.kind, script?.title], ['Script', 'Exchange rates']);
  /* THE RECORD'S OWN EGRESS LINE, the one the owner arms on accept (`approvalLines`), less the shouted lead the label says.
     Asked of the kernel and not typed out, for the canvas's reason above: its wording grew a clause about the vault
     while this test was being written. */
  const egress = egressOf(body)!;
  assert.match(egress.line, /^CALLS OUT api\.rates\.example · every 1h · key "Rates"/u);
  assert.deepEqual(script?.lines, [
    { label: 'Calls out', value: egress.line.slice('CALLS OUT '.length) },
    { label: 'May send', value: egress.key_line },
  ]);
  assert.equal(script?.source, body.source);
  const quiet = proposedOf('change', { to: { id: 'script.tidy', kind: 'script', body: { script: 'tidy', runs: { rule: true }, egress: [], keys: [], reads: [], writes: ['notes'], source: 'x' } } });
  assert.deepEqual(quiet?.appears[0]?.lines, [{ label: 'Calls out', value: 'Nothing outside this record' }]);
});

/* THE RECORD FILES THE LINE WITH THE VAULT IN HAND (`egressOf(d.body, titleOfRow, opensOf)` where a change is filed), and
   this screen cannot reach the vault: worked out again here it said `key "Rates" to the host its vault entry opens`
   where the record had filed `to api.rates.example`, so the one pairing the owner approves was said vaguer on the
   screen than on the proposal. */
test('a script the record filed an egress line for is said in that line, with the host each key goes to', () => {
  const body = { script: 'fx', runs: { every: '1h' }, egress: ['https://api.rates.example'], keys: ['Rates'], reads: [], source: 'x' };
  const line = 'CALLS OUT api.rates.example · every 1h · key "Rates" to api.rates.example';
  const filed = { to: { id: 'script.fx', kind: 'script', body }, egress: [{ ingest: 'fx', channel: 'script', line, key_line: null }] };
  assert.deepEqual(proposedOf('change', filed)?.appears[0]?.lines, [{ label: 'Calls out', value: line.slice('CALLS OUT '.length) }]);
  /* ANOTHER SCRIPT'S LINE IS NOT THIS ONE'S, and an action's is not a script's: those are worked out from the body. */
  const other = { ...filed, egress: [{ ingest: 'rates', channel: 'pull', line, key_line: null }, { ingest: 'fy', channel: 'script', line, key_line: null }] };
  assert.deepEqual(proposedOf('change', other)?.appears[0]?.lines, [{ label: 'Calls out', value: egressOf(body)!.line.slice('CALLS OUT '.length) }]);
});

test('a choice and a rowset have drawings of their own, and a change with nothing in it previews nothing', () => {
  assert.equal(proposedOf('options', { options: [] }), null);
  assert.equal(proposedOf('rowset', { register: 'things', rows: [] }), null);
  assert.equal(proposedOf('change', { declaration_id: 'x', to: {} }), null);
});
