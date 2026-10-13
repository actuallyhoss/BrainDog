/**
 * `core-names`, asked of this tree, of its planted trees, and of the rules one at a time; and the nine public words
 * `shell-words` took on the same day (SHL-A01, `loop/scope/area-shell-a.md`).
 *
 *   node --test tools/gates/test/core-names.test.mjs
 *
 * THE UNIT'S OWN FIVE: with no held list the gate is red on this tree; with the held list it is green; a `'tasks'`
 * written under `packages/kernel/src` turns it red; so does a held entry whose name no longer stands; and the list
 * does not grow, which is the ledger's line. Each is a case below, by that name.
 *
 * SPAWNED WHERE THE EXIT CODE IS THE CLAIM, because the exit code is what `run.mjs` and CI read, and called where a
 * rule is the claim, so the rule fails by itself when its line is taken out.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { HELD, collect, fold, heldIn, hitsIn, judge, kernelWords, namesIn, namesOfDocument, namesOfSource, read, unnamed } from '../core-names.mjs';
import { EXEMPT, HELD as WORDS_HELD, PUBLIC_WORDS, WORDS, uncomment, wordsWith } from '../shell-words.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const GATE = join(gates, 'core-names.mjs');

const run = (root) => {
  const r = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: r.status, said: `${r.stdout}${r.stderr}` };
};
/** The lines that name a place, `path:line`, as the gate prints a finding. */
const places = (said) => said.split('\n').filter((l) => /^\s+\S+:\d+\s/u.test(l)).map((l) => l.trim().split(/\s/u)[0]);
/** A set of names as `collect` hands them, for the rules that need no tree. */
const namesOf = (...list) => new Map(list.map((name) => [fold(name), { name, kind: 'list', by: new Set(['planted']) }]));

/* Read once: the tree is 1,300 files, and four cases stand on the same reading. */
const reading = read(repo);

test('with no held list the gate is red on this tree, by more than the unit thought a flood', () => {
  const { findings } = judge(reading, []);
  assert.equal(findings.length, reading.hits.length);
  /* The unit's sign of a flood is over 300 hits. The tree is past it with both field rules on, and the test says so
     rather than letting the number pass unread. */
  assert.ok(findings.length > 300, `${findings.length} places`);
  assert.match(findings[0], /^\s+(packages|apps)\/\S+:\d+\s+\S+, (an add-on's id|a (list|figure|field) of \S)/u);
});

test('with the held list the gate is green on this tree, and says how much it holds', () => {
  const { status, said } = run(repo);
  assert.equal(status, 0, said.split('\n').slice(0, 12).join('\n'));
  assert.match(said, new RegExp(`places held by ${HELD.length} entries`, 'u'));
});

test("a 'tasks' written under packages/kernel/src turns it red, once, by its line", () => {
  assert.ok(reading.names.has('tasks'), 'an add-on in packs/ names the list tasks');
  const planted = hitsIn("export const KEY = 1;\nexport const isWork = (list) => list === 'tasks';\n", reading.names);
  assert.deepEqual(planted.map((h) => [h.line, h.key]), [[2, 'tasks']]);
  const hits = [...reading.hits, ...planted.map((h) => ({ ...h, path: 'packages/kernel/src/planted.ts' }))];
  const { findings } = judge({ ...reading, hits }, HELD);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /packages\/kernel\/src\/planted\.ts:2 {2}tasks, a list of /u);
});

test('a held entry whose name no longer stands turns it red, and so does a file that is gone', () => {
  const gone = { path: 'packages/kernel/src/gone.ts', name: 'tasks', reason: 'planted', unit: 'SHL-A07' };
  const { findings } = judge(reading, [...HELD, gone]);
  assert.deepEqual(findings, ['  packages/kernel/src/gone.ts is held for tasks and does not spell it. Take the entry out, so the next one there is seen.']);
  const { status, said } = run(join(gates, 'negative', 'core-names-held-idle'));
  assert.equal(status, 1, said);
  assert.match(said, /clean\.ts is held for tasks and does not spell it/u);
  assert.match(said, /1 finding\(s\)/u);
});

test('the list does not grow: the ledger holds its count, and every entry says all four things', () => {
  const book = JSON.parse(readFileSync(join(gates, 'ledger.json'), 'utf8'));
  assert.equal(book.held['core-names.HELD']?.lines.at(-1).count, HELD.length);
  assert.ok(HELD.length > 0);
  for (const e of HELD) assert.match(e.unit, /^SHL-A\d\d$/u, `${e.path} ${e.name}`);
  assert.equal(new Set(HELD.map((e) => `${e.path} ${fold(e.name)}`)).size, HELD.length);
});

test('a held file that leaves out a part, or says one entry twice, is a throw and never a shorter list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'core-names-held-'));
  try {
    const file = join(dir, 'held.json');
    const write = (...lines) => writeFileSync(file, `{\n  "held": [\n${lines.join(',\n')}\n  ]\n}\n`);
    const entry = '    { "path": "apps/cli/src/a.ts", "name": "tasks", "reason": "planted", "unit": "SHL-A20" }';
    write(entry);
    assert.deepEqual(heldIn(file).map((e) => e.name), ['tasks']);
    write('    { "path": "apps/cli/src/a.ts", "name": "tasks", "reason": "planted" }');
    assert.throws(() => heldIn(file), /held\.json:3 holds no unit/u);
    write(entry, entry);
    assert.throws(() => heldIn(file), /held\.json:4 holds tasks in apps\/cli\/src\/a\.ts a second time/u);
    assert.deepEqual(heldIn(join(dir, 'absent.json')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a name is matched whole, at a part boundary', () => {
  const names = namesOf('gold', 'notes', 'cash_counts', 'money', 'money-core');
  assert.deepEqual(namesIn('gold', names), ['gold']);
  assert.deepEqual(namesIn('goldRate', names), ['gold']);
  assert.deepEqual(namesIn('register.gold', names), ['gold']);
  for (const other of ['golden', 'marigold', 'notebook', 'footnotes', 'loadingOlder']) assert.deepEqual(namesIn(other, names), [], other);
  /* A name's own separators do not count, and the longest name at one place is the one that is said. */
  assert.deepEqual(namesIn('cashCounts', names), ['cashcounts']);
  assert.deepEqual(namesIn('money-core', names), ['moneycore']);
  assert.deepEqual(namesIn('core-money', names), ['money']);
});

test('a string with no space is read, a sentence and a comment are not, and register. is read anywhere', () => {
  const names = namesOf('tasks');
  const lines = [
    "const a = 'tasks';",
    "const b = 'No tasks yet.';",
    '// tasks, and register.tasks in a comment',
    'const tasks = db.register.tasks.count();',
    "const d = 'open register.tasks to see them';",
    'const e = `${base}/tasks/${id}`;',
    "const f = /'tasks'/;",
  ];
  assert.deepEqual(hitsIn(lines.join('\n'), names).map((h) => h.line), [1, 4, 5, 6]);
  /* One place, not two, where a string that was read says `register.` before the name. */
  assert.equal(hitsIn("const g = 'register.tasks';", names).length, 1);
});

test('the names are read off a pack by key, and off a use case by its text', () => {
  const doc = {
    pack: 'desk',
    requires: { packs: { 'money-core': '^3.0.0' } },
    declarations: [
      { register: 'tasks', fields: [{ id: 'state' }, { id: 'waiting_on' }] },
      { rule: 'tick', on: { written: { register: 'threads' } } },
      { metric: 'open-tasks:{{name}}' },
    ],
  };
  assert.deepEqual(
    namesOfDocument(doc, 'desk').map((f) => `${f.kind} ${f.name}`).sort(),
    ['add-on desk', 'add-on money-core', 'field state', 'field waiting_on', 'figure open-tasks', 'list tasks', 'list threads'],
  );
  const source = [
    "// register: 'ghosts' in a comment declares nothing",
    'export const CANDLE = {',
    "  usecase: 'candle',",
    "  modules: ['people', 'work'],",
    "  pack: { pack: 'usecase-candle', declarations: [{ register: 'wicks', fields: [{ id: 'poured_on', type: 'day' }] }, { metric: 'wicks-poured' }] },",
    '};',
  ].join('\n');
  assert.deepEqual(
    namesOfSource(source).map((f) => `${f.kind} ${f.name}`).sort(),
    ['add-on candle', 'add-on people', 'add-on usecase-candle', 'add-on work', 'field poured_on', 'figure wicks-poured', 'list wicks'],
  );
  /* A helper beside the use cases has no `usecase:` of its own, and declares nothing. */
  assert.deepEqual(namesOfSource("export const HOLDS = [{ register: 'tasks' }];"), []);
});

test('the field pass leaves out five letters or fewer and an id two add-ons declare', () => {
  const { names, files } = collect(join(gates, 'negative', 'core-names-field'));
  assert.equal(files, 2);
  assert.deepEqual([...names.values()].filter((n) => n.kind === 'field').map((n) => n.name), ['matures_on']);
  assert.ok(!names.has('amount') && !names.has('label'));
});

for (const [tree, place] of [
  ['core-names-string', 'packages/kernel/src/seeded-list.ts:2'],
  ['core-names-register', 'packages/record/src/seeded-address.ts:3'],
  ['core-names-usecase', 'apps/web/src/lib/seeded-figure.ts:2'],
  ['core-names-field', 'packages/host/src/seeded-field.ts:2'],
])
  test(`the planted tree ${tree} is red, once, at its seeded line`, () => {
    const { status, said } = run(join(gates, 'negative', tree));
    assert.equal(status, 1, said);
    assert.deepEqual(places(said), [place], said);
    assert.match(said, /1 finding\(s\)/u);
  });

test('a word the kernel declares is not a place, and after register. it still is', () => {
  const own = kernelWords(repo);
  /* READ OFF THE KERNEL, never listed: block kinds, a list's keys, an answer's keys, and what a money value is answered as. */
  for (const word of ['lines', 'roadmap', 'progress', 'steps', 'source', 'parts']) assert.ok(own.has(word), word);
  /* AND NOTHING AN ADD-ON ALONE DECLARES: a list the kernel's grammar never says stays a name. */
  for (const word of ['tasks', 'orders', 'transactions', 'making']) assert.ok(!own.has(word), word);
  assert.deepEqual(kernelWords(join(gates, 'negative', 'core-names-string')), new Set(), 'a tree with no kernel grammar declares no word');

  const names = namesOf('lines', 'tasks');
  const lines = [
    "const a = kind === 'lines';",
    "const b = list === 'tasks';",
    'const c = db.register.lines.count();',
    "const d = 'register.lines';",
    "const e = 'lines:one';",
  ];
  const kernel = new Set(['lines']);
  assert.deepEqual(hitsIn(lines.join('\n'), names, false, kernel).map((h) => [h.line, h.key]), [[2, 'tasks'], [3, 'lines'], [4, 'lines']]);
  /* WITHOUT THE KERNEL'S WORDS every one of the five is a place, as it was. */
  assert.deepEqual(hitsIn(lines.join('\n'), names).map((h) => h.line), [1, 2, 3, 4, 5]);
});

test('a class, an id, a role and a style rule in markup are not read, and every other attribute is', () => {
  const names = namesOf('tasks', 'status');
  const page = [
    '<script lang="ts">',
    "  const open = list === 'tasks';",
    '</script>',
    '<section class="tasks wide" aria-labelledby="tasks-h">',
    '  <h2 id="tasks-h">Yours</h2>',
    '  <p role="status">Saved.</p>',
    '  <a href="/r/tasks" data-list="tasks">Open</a>',
    "  <p class={on ? 'tasks' : ''}>A class worked out in code is a string like any other.</p>",
    '</section>',
    '<style>',
    "  .tasks::before { content: 'tasks'; }",
    '</style>',
  ].join('\n');
  assert.deepEqual(hitsIn(page, names, true).map((h) => [h.line, h.key]), [[2, 'tasks'], [7, 'tasks'], [7, 'tasks'], [8, 'tasks']]);
  /* NOTHING MOVES: what is blanked keeps its length and its lines, so a place after it is where it was. */
  assert.equal(unnamed(page, true).length, page.length);
  assert.equal(unnamed(page, true).split('\n').length, page.split('\n').length);
  /* AND A FILE THAT IS NOT MARKUP IS READ WHOLE: `class="tasks"` in a string of a `.ts` file is a string. */
  assert.equal(unnamed(page), page);
});

test('the planted tree core-names-kernel-word is red twice, at the real leak, and its decoys are left', () => {
  const { status, said } = run(join(gates, 'negative', 'core-names-kernel-word'));
  assert.equal(status, 1, said);
  assert.deepEqual(places(said), ['packages/render/src/seeded-leak.ts:2', 'packages/render/src/seeded-leak.ts:3'], said);
  assert.match(said, /lines, a list of desk, in `register\.lines`/u);
  assert.match(said, /2 finding\(s\)/u);
});

test('a root with no code, or with no add-on to read a name from, could not run', () => {
  const empty = run(join(gates, 'negative', 'core-names-empty'));
  assert.equal(empty.status, 3, empty.said);
  assert.match(empty.said, /no code was read/u);
  /* The `shell-words` tree has code and no pack, so there is no name to look for: a skip, never a pass. */
  const nameless = run(join(gates, 'negative', 'shell-words'));
  assert.equal(nameless.status, 3, nameless.said);
  assert.match(nameless.said, /no name to look for/u);
});

test('the lexer says where each string is, and still blanks only comments', () => {
  const source = "const a = `x${b + 'q'}y`; const r = /'/; const c = 'tasks'; // 'no'";
  const literals = [];
  const text = uncomment(source, literals);
  assert.deepEqual(literals.map(([from, to]) => source.slice(from, to)), ['x', 'q', 'y', 'tasks']);
  assert.equal(text, uncomment(source));
  assert.ok(!text.includes("'no'"));
});

/* THE NINE PUBLIC WORDS, here because `negative/shell-words` is another unit's tree and plants none of them. */

test('shell-words reads the nine public words of one country, each at a part boundary', () => {
  assert.deepEqual(PUBLIC_WORDS, ['geidea', 'paymob', 'fawry', 'kashier', 'paytabs', 'cairo', 'giza', 'maadi', 'zamalek']);
  for (const w of PUBLIC_WORDS) assert.ok(WORDS.includes(w), w);
  const wordsIn = wordsWith({ words: WORDS, whole: new Set() });
  assert.deepEqual(wordsIn('Africa.Cairo'), ['cairo']);
  assert.deepEqual(wordsIn('FAWRY'), ['fawry']);
  assert.deepEqual(wordsIn('newCairoBranch'), ['cairo']);
  assert.deepEqual(wordsIn('newcairo'), []);
});

test('each of the nine is held where it stands, under a unit, and the exempt list did not grow for them', () => {
  const book = JSON.parse(readFileSync(join(gates, 'ledger.json'), 'utf8'));
  assert.equal(book.held['shell-words.EXEMPT'].lines.at(-1).count, Object.keys(EXEMPT).length);
  assert.equal(book.held['shell-words.HELD']?.lines.at(-1).count, Object.keys(WORDS_HELD).length);
  for (const [path, e] of Object.entries(WORDS_HELD)) {
    assert.match(e.until, /^SHL-A\d\d$/u, path);
    for (const w of Object.keys(e.words)) assert.ok(PUBLIC_WORDS.includes(w), `${path} holds ${w}`);
    assert.ok(!Object.hasOwn(EXEMPT, path), path);
  }
  for (const e of Object.values(EXEMPT)) for (const w of Object.keys(e.words)) assert.ok(!PUBLIC_WORDS.includes(w), w);
  assert.deepEqual(Object.keys(WORDS_HELD['packages/kernel/src/identity-keys.ts'].words).sort(), [...PUBLIC_WORDS].sort());
  /* And the gate is green on this tree with them held, which is the entries earning their place. */
  const r = spawnSync(process.execPath, [join(gates, 'shell-words.mjs'), repo], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});
