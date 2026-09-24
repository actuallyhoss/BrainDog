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
    { script: { id: 'tidy', as: 'queued' } },
    { script: { id: 'tidy' } },
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
    /* A SCRIPT STEP RUNS SINCE `e6010208`, and this screen still ended it "Not in this build: a run stops here", as the
       call above, where the record's dry run says the run goes on. Measured red first on that sentence. What the owner
       reads instead is the dry run's: the run does not wait, what `as:` keeps is the queued run's id (the canvas's
       sentence says "the answer"), and the three things that stop it. */
    {
      label: 'Step 4',
      value: `${sayStep(steps[3]!)}. The run goes on without waiting for it: what the script writes lands when this host runs it. What is kept as queued is the id of its queued run, not what the script answers. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused.`,
    },
    {
      label: 'Step 5',
      value: `${sayStep(steps[4]!)}. The run goes on without waiting for it: what the script writes lands when this host runs it. The run stops here if the script is not installed, does not say runs: { rule: true }, or is paused.`,
    },
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

/* ── what a digest and a pattern send out (audit fifty-one, section 2) ── */

const POLL_BODY = { ingest: 'gold', channel: 'poll', url: 'https://api.goldapi.io/v1/xau', every: '1h', grant: 'goldapi', extract: { what: { after: 'rate ' } }, writes: { register: 'notes' } };
const HOOK_BODY = {
  digest: 'out',
  name: 'Weekly out',
  schedule: { day: 'mon', at: '08:00' },
  channels: ['webhook'],
  webhook: { url: 'https://collector.example.com/in' },
  sections: [{ heading: 'Rows', source: 'register.notes', as: 'table' }],
};

/* A DIGEST WAS A TITLE AND NOTHING ELSE. `appearsOf` drew every kind it did not know as `{ kind, title, lines: [] }`, so
   the owner accepting a weekly summary read "Summary · Out" and nothing of the address it posts his rows to. */
test('a digest that posts out says where, when and what, in the line the record filed', () => {
  const line = egressOf(HOOK_BODY)!.line;
  const filed = { to: { id: 'digest.out', kind: 'digest', body: HOOK_BODY }, egress: [{ ingest: 'out', channel: 'digest', line, key_line: null }] };
  const [digest] = proposedOf('change', filed)?.appears ?? [];
  assert.deepEqual([digest?.kind, digest?.title], ['Summary', 'Weekly out']);
  assert.deepEqual(digest?.lines, [{ label: 'Calls out', value: line.slice('CALLS OUT '.length) }]);
  assert.match(line, /collector\.example\.com/u);
  /* AND ONE THAT STAYS WITH THE OWNER SAYS SO, as a script that fetches nothing does. */
  const quiet = proposedOf('change', { to: { id: 'digest.in', kind: 'digest', body: { ...HOOK_BODY, channels: ['email'], webhook: undefined } } });
  assert.deepEqual(quiet?.appears[0]?.lines, [{ label: 'Calls out', value: 'Nothing outside this record' }]);
});

/* A PATTERN'S INGEST COMES IN TWO SHAPES, and Decide drew one. `spark/src/jobs.ts` files the bare body; an agent files the
   declaration, and drawn as a body the declaration read its `ingest`, `channel` and `writes` off the wrapper, where there
   are none, so the probe's poll was a title-less "Rule for what comes in" with no host and no key. */
test('a pattern draws its ingest as a bare body or as a declaration, with the line the record filed and its key', () => {
  /* FOR A PROJECT'S POLL, so the line the record filed and this screen's own reading differ: the record names the project
     and the screen can only say its row id. Filed with no project, the two were the same string, and drawing the body's
     reading with the filed lines ignored altogether still passed. */
  const body = { ...POLL_BODY, project: 'prj_7' };
  const filed = egressOf(body, () => 'Lanternly')!;
  const egress = [{ ingest: 'gold', channel: 'poll', line: filed.line, key_line: filed.key_line }];
  const want = [
    { label: 'Comes from', value: 'api.goldapi.io' },
    { label: 'How often', value: '1h' },
    { label: 'Calls out', value: filed.line.slice('CALLS OUT '.length) },
    { label: 'May send', value: 'gold runs for the project Lanternly and sends the key "goldapi".' },
    { label: 'Files into', value: 'Notes' },
  ];
  const declared = proposedOf('pattern', { ingest: { id: 'ingest.gold', kind: 'ingest', body }, samples: ['r1'], egress });
  assert.deepEqual([declared?.appears[0]?.title, declared?.appears[0]?.lines], ['Gold', want]);
  assert.match(filed.line, /grant "goldapi"/u);
  const bare = proposedOf('pattern', { ingest: body, samples: ['r1'], egress });
  assert.deepEqual([bare?.appears[0]?.title, bare?.appears[0]?.lines], ['Gold', want]);
});

/* A PATTERN QUEUED BEFORE THE KERNEL HELD IT TO AN INGEST can still hold a rule, and the accept refuses it; drawn as an
   ingest it would say nothing true, so it is drawn as what it is. */
test('a pattern that holds another kind is drawn as that kind', () => {
  const out = proposedOf('pattern', { ingest: { id: 'rule.flag', kind: 'rule', body: { rule: 'flag', register: 'invoices', then: [{ tag: 'new' }] } }, samples: ['r1'] });
  assert.equal(out?.appears[0]?.kind, 'Rule');
});
