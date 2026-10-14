/**
 * The page lint's rules, each with a page that breaks it and one that does not, and one whole page
 * drawn by `toHTML` that has nothing to find. The red cases are the faults his own pages printed on
 * 7 October (`evidence-own-record.md` 2.1, `research-direction-audit.md`): a chips figure in braces, a
 * stat figure with no answer, a run's handle and an ISO instant in the side, and "cake" for an icon.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LINT_RULES, lintHtml, lintPage, lintText, parse, toHTML, type LintFinding, type LintRule } from './index.ts';
import { BUTTON_WORDS, PAGE_WORDS } from './lint.ts';

const rules = (fs: readonly LintFinding[]): LintRule[] => fs.map((f) => f.rule);
const draw = (src: string, values: Record<string, string> = {}): string => toHTML(parse(src), { resolve: (p) => values[p] ?? null });
/** Red: the rule finds it, in a sentence with no raw form of what it found. Green: nothing at all. */
const red = (fs: readonly LintFinding[], rule: LintRule): LintFinding => {
  const f = fs.find((x) => x.rule === rule);
  assert.ok(f, `expected ${rule}, found ${JSON.stringify(fs)}`);
  assert.doesNotMatch(f.said, /—|\{\{|#\d|\bS\d{2,}\b|\d{4}-\d{2}-\d{2}T/, 'a finding says what it found without printing it raw');
  return f;
};

test('THE RULE LIST IS CLOSED AND SAYS ITSELF: seventeen rules, each named once, with a sentence and no em dash', () => {
  assert.deepEqual(LINT_RULES.map((r) => r.rule), [
    'placeholder', 'braces', 'raw-key', 'raw-id', 'raw-instant', 'icon-word', 'only-a-dash', 'cut-money', 'two-spellings', 'em-dash', 'plain-words',
    'system-word', 'dev-name', 'bare-key', 'one-word-button', 'title-stop', 'raw-fault',
  ]);
  for (const r of LINT_RULES) assert.match(r.says, /^[A-Z].*\.$/), assert.doesNotMatch(r.says, /—/);
  assert.deepEqual(LINT_RULES.filter((r) => r.copy).map((r) => r.rule), ['em-dash', 'plain-words', 'system-word', 'one-word-button', 'title-stop']);
});

test('placeholder: a figure with no answer is the hole, named by its last word', () => {
  const f = red(lintHtml(draw('```stat\nMonthly | {{revenue.mrr}}\nChurn | {{metrics.churn30d}}\n```'), { name: 'Crumb.gg' }), 'placeholder');
  assert.deepEqual(f, { rule: 'placeholder', part: 'Crumb.gg', said: 'Prints 2 placeholders where values go: mrr, churn30d.' });
  assert.deepEqual(lintHtml(draw('```stat\nMonthly | {{revenue.mrr}}\n```', { 'revenue.mrr': '£4,200' })), []);
});

test('placeholder: a bar\'s hole bucket prints its amount and is not one, even drawn as a control', () => {
  for (const kind of ['bar', 'split'])
    for (const opts of [{ hole: true as const }, {}])
      assert.deepEqual(lintHtml(toHTML(parse(`\`\`\`${kind} | Spend\nRent | 1200\nUncategorised | 400 | | hole\n\`\`\``), { ...opts, resolve: () => null })), []);
  const f = red(lintHtml(toHTML(parse('```bar | Spend\nRent | 1200\nUncategorised | {{spend.loose}} | | hole\n```'), { hole: true, resolve: () => null })), 'placeholder');
  assert.equal(f.said, 'Prints a placeholder where a value goes: loose.');
});

test('braces: a chips figure printed as written, braces and all', () => {
  /* THE PAGE AS IT WAS DRAWN ON 7 OCTOBER: `toHTML` no longer prints a chip's braces, so the fixture is the old drawing. */
  const html = '<div class="inline"><span class="pill"><span class="pill-figure num">{{revenue.monthly}}</span><span class="pill-word">monthly, trailing</span></span><span class="pill"><span class="pill-figure num">{{effortDays}}d</span><span class="pill-word">to build as sized</span></span></div>';
  assert.doesNotMatch(draw('```chips\nmoney | {{revenue.monthly}} | monthly, trailing\n```'), /\{\{/u, 'a drawn chip never prints braces');
  assert.equal(red(lintHtml(html), 'braces').said, 'Prints 2 figures in braces instead of their values: monthly, effort days.');
  assert.deepEqual(lintHtml(draw('```chips\nmoney | £4,200 | monthly, trailing\n```')), []);
});

test('raw-key: a key in a figure slot, or joined words in the product copy; not in his own prose', () => {
  assert.equal(red(lintHtml('<span class="pill-figure num">revenue.monthly</span>'), 'raw-key').said, 'Prints a key where a value goes: monthly.');
  red(lintText('Earned this month: dailyRunRate'), 'raw-key');
  red(lintText('Waiting on blockers_count'), 'raw-key');
  assert.deepEqual(lintText('Earned £4,200 this month on brain.dog, the iPhone app and macOS'), []);
  assert.deepEqual(lintText('The user_id column moved to dailyRunRate', { name: 'Note', theirs: true }), []);
  assert.deepEqual(lintText('From first_last@gmail.com, with invoice_2026.pdf attached'), []);
});

test('raw-id: a row number, a run handle, a ULID, a UUID or a random id where a name goes', () => {
  for (const id of ['tools#8', 'S731', '01J9ZQ4X8M2K7V3N6P5R1T0W9Y', '3f2b8c1e-9a4d-4e6f-8b2a-1c5d7e9f0a3b', 'a3f9c2e81b7d4f60', 'V1StGXR8Z5jdHi6BmyT0aq'])
    assert.equal(red(lintText(`Started by ${id} this morning`), 'raw-id').said, 'Prints an id where a name goes.');
  /* `fixtures/names.ts`'s owner, written out: a test in `src/` may not climb out of its package (the graph gate). */
  assert.deepEqual(lintText('Started by Mara Lindqvist this morning, the 3rd of 12'), []);
});

test('raw-id: a part that prints handles on purpose declares it, and his own notes keep their hashes', () => {
  assert.deepEqual(lintText('Ledger sync, S731\nBank texts, S732', { name: 'Runs', ids: true }), []);
  assert.deepEqual(lintText('Fixed in a3f9c2e81b7d4f60', { name: 'Note', theirs: true }), []);
  red(lintText('Filed as tools#8', { name: 'Note', theirs: true }), 'raw-id');
  assert.deepEqual(lintHtml('<li><span class="name">Claude Code</span> <span class="handle">S731</span></li>', { name: 'Runs', ids: true }), []);
  for (const id of ['01J9ZQ4X8M2K7V3N6P5R1T0W9Y', 'tools#8']) red(lintText(`Ledger sync, S731, ${id}`, { name: 'Runs', ids: true }), 'raw-id');
  assert.equal(red(lintText('Shows {{tools#8}}'), 'braces').said, 'Prints a figure in braces instead of its value.');
});

test('raw-instant: an ISO instant or seconds since 1970 in what is read', () => {
  for (const at of ['2026-10-06T19:07:01.610Z', '2026-10-06 19:07:01', '1759777621', '1759777621610'])
    red(lintText(`Last read ${at}`), 'raw-instant');
  assert.deepEqual(lintText('Last read 6 Oct at 19:07, on 2026-10-06, call +201012345678'), []);
  assert.deepEqual(lintText('Order 1759777621 shipped', { name: 'Note', theirs: true }), [], 'ten digits in his words are his own number');
  red(lintHtml('<span class="figure num">1759777621</span>', { name: 'Note', theirs: true }), 'raw-instant');
});

test('icon-word: a glyph slot holding a word, or an icon the set does not have', () => {
  assert.equal(red(lintHtml('<span class="sec-glyph" data-glyph="cake" aria-hidden="true">cake</span>'), 'icon-word').said, "Prints an icon's name where the icon goes: cake.");
  red(lintHtml(draw('Shipped {{icon:not-a-glyph}} today')), 'icon-word');
  assert.deepEqual(lintHtml(draw('Shipped {{icon:rocket}} today')), []);
});

test('only-a-dash: a dash alone is a finding only where the data holds a value', () => {
  /* The two marks the drawers print for no value: a figure slot of only a dash, and the table's `missing` cell. */
  const html = '<span class="cell-label">Paid</span><span class="cell-figure num">\u2014</span><span class="td"><span class="missing">\u2014</span></span>';
  red(lintHtml(html, { name: 'Bills', hasValue: true }), 'only-a-dash');
  assert.deepEqual(lintHtml(html, { name: 'Bills' }), []);
});

test('cut-money: an amount cut off part way through its number', () => {
  red(lintText('Owed £33,8…'), 'cut-money');
  red(lintText('Owed EGP 1,23'), 'cut-money');
  assert.equal(red(lintHtml('<p>Owed £33,8&hellip;</p>'), 'cut-money').said, 'Cuts an amount off part way through its number.');
  assert.deepEqual(lintText('Owed £33,850.00, EGP 1,230 and €1,50'), []);
});

test('em-dash: in the product copy, never in his own note, and never the drawn mark for no value', () => {
  assert.equal(red(lintText('Rent — due Friday'), 'em-dash').said, 'Uses an em dash in its words.');
  red(lintHtml('<p>Rent &mdash; due Friday</p>'), 'em-dash');
  assert.deepEqual(lintText('Rent — due Friday', { name: 'Note', theirs: true }), []);
  assert.deepEqual(lintText('Rent, due Friday\n—'), []);
});

test('plain-words: row, list item and entity in the product copy', () => {
  assert.equal(red(lintText('Open this row to edit the entity'), 'plain-words').said, 'Says a word for the machinery where it should name the thing: "row", "entity".');
  assert.deepEqual(lintText('Open this bill to change it. Arrow keys move between bills.'), []);
  assert.deepEqual(lintText('Three wins in a row', { name: 'Note', theirs: true }), []);
});

test('plain-words: credential, and register as a noun, never register the verb', () => {
  assert.equal(red(lintText('Paste the credential into the register'), 'plain-words').said, 'Says a word for the machinery where it should name the thing: "credential", "register".');
  red(lintText("Each register's fields"), 'plain-words');
  assert.deepEqual(lintText('Register a passkey to sign in. Your keys stay in the vault.'), []);
});

test('plain-words and system-word READ THE WORDS GATE\'S LIST: PAGE_WORDS and BUTTON_WORDS are words.json\'s, word for word', () => {
  const list = JSON.parse(readFileSync(new URL('../../../tools/gates/words.json', import.meta.url), 'utf8')) as {
    words: { name: string; shape: string; case?: true; page: false | 'plain-words' | 'system-word' }[];
    buttons: string[];
  };
  const page = list.words.filter((w) => w.page).map((w) => ({ name: w.name, shape: w.shape, ...(w.case ? { case: true as const } : {}), rule: w.page }));
  assert.deepEqual(PAGE_WORDS, page);
  assert.deepEqual(BUTTON_WORDS, list.buttons);
  for (const w of PAGE_WORDS) red(lintText(`Open the ${w.name} here`), w.rule);
  for (const b of BUTTON_WORDS) assert.deepEqual(lintHtml(`<button>${b}</button>`), [], b);
});

test('system-word: pack, schema and MCP in the product copy; add-on and the agent app by name are plain', () => {
  assert.equal(red(lintText('Install the pack to add its schema'), 'system-word').said, 'Says a word for how the app is built where a plain word goes: "pack", "schema".');
  red(lintText('Connect any MCP client'), 'system-word');
  assert.deepEqual(lintText('Install the add-on to add its fields. Connect Claude Code or Cursor.'), []);
  assert.deepEqual(lintText('Six packs of paper and a spark of an idea', { name: 'Note', theirs: true }), []);
});

test('dev-name: his Decide on 7 October, a name from the code where a sentence stands', () => {
  const decide = 'bank-card-used-sms could not read account out of this one. Accept it into transactions, or fix the pattern.';
  assert.equal(red(lintText(decide, { name: 'Decide', theirs: true }), 'dev-name').said, 'Prints a name from the code where a sentence should say what it is.');
  red(lintText("infer.resolve could not be delivered after 8 attempts: No model answered for 'glm-5.3-flash'", { name: 'Decide', theirs: true }), 'dev-name');
  red(lintText('Waiting on the run of card-alerts-import-daily'), 'dev-name');
  /* A site, a file, a mail address, plain English hyphens, a name standing alone, and one in the middle of his own note. */
  assert.deepEqual(lintText('Crumb.gg is live at crumb.gg and brain.dog; notes in plan.md and package.json, mail tima@quartz.studio'), []);
  assert.deepEqual(lintText('Move kilnfonts.example off auto-renew, and keep sending from portagemail.example'), [], "the seed's sample sites");
  assert.deepEqual(lintText('An up-to-date, pay-as-you-go plan, end-to-end'), []);
  assert.deepEqual(lintText('gstack-openclaw-ceo-review'), []);
  assert.deepEqual(lintText('Fixed the bug in infer.resolve today', { name: 'Note', theirs: true }), []);
});

test('bare-key: his Renewals on 7 October printed a service type as its key; its name is green', () => {
  const keys = ['vm', 'domain', 'database', 'edge', 'object'];
  const part = { name: 'Each month, by type', keys };
  assert.equal(red(lintText('vm E£547.97 71%', part), 'bare-key').said, 'Prints a value as its key where its name goes.');
  assert.equal(red(lintText('Each month, by type: vm E£547.97 71%, Domain E£224.05 29%, database E£0, edge E£0', part), 'bare-key').said, 'Prints 3 values as their keys where their names go.');
  assert.deepEqual(lintText('Server E£547.97 71%\nDomain E£224.05 29%\nWhat each domain points at', part), []);
  assert.deepEqual(lintText('vm E£547.97 71%'), [], 'with no keys given, nothing is a key');
});

test('one-word-button: a drawn button or an answer\'s action of one word, unless it is on the approved list', () => {
  assert.equal(red(lintHtml('<button type="button">Submit</button><button>Save</button>'), 'one-word-button').said, 'Has 2 buttons of one word: "Submit", "Save". Say what each does to what.');
  red(lintText('Accept it into transactions?', { name: 'Decide', buttons: ['Accept', 'Dismiss'] }), 'one-word-button');
  assert.deepEqual(lintHtml('<button>Save the bill</button><button>Cancel</button><button>Undo</button>'), []);
  assert.deepEqual(lintHtml('<button type="button" class="prop-row" data-hole>Uncategorised</button>'), [], "a bar's bucket drawn as a control is a value");
});

test('title-stop: a heading, a button or a heading part that ends in a full stop; a sentence, an ellipsis and a short form do not', () => {
  assert.equal(red(lintHtml('<h2 class="sec-title">What you owe.</h2><p>Three bills are due.</p>'), 'title-stop').said, 'Ends a title in a full stop.');
  red(lintHtml('<button>Save the bill.</button>'), 'title-stop');
  red(lintText('Who are you.', { name: 'First run', heading: true }), 'title-stop');
  assert.deepEqual(lintHtml('<h2>What you owe</h2><p>Three bills are due.</p><h3>Acme Ltd.</h3><h3>Loading more...</h3>'), []);
  assert.deepEqual(lintText('Who are you.', { name: 'Note', heading: true, theirs: true }), []);
});

test('raw-fault: a thrown error on a page; in his own words only a stack line', () => {
  assert.equal(red(lintText("TypeError: Cannot read properties of undefined (reading 'amount')"), 'raw-fault').said, 'Prints an error from the code where a sentence should say what went wrong.');
  red(lintText('Failed to fetch'), 'raw-fault');
  red(lintText('at fillFeed (/app/packs/live-feed/fill.ts:194:12)', { name: 'Note', theirs: true }), 'raw-fault');
  assert.deepEqual(lintText('Owed [object Object]'), [], 'a value that never arrived is the printed gate\'s own word');
  assert.deepEqual(lintText('Fixed the TypeError on sign in', { name: 'Note', theirs: true }), []);
  assert.deepEqual(lintText('The bank did not answer. Try again in a minute.'), []);
});

test('NO RULE READS CODE: a span in backticks or a type\'s angle brackets, in the words or the HTML, and the words beside them are read', () => {
  assert.deepEqual(lintText('Run `infer.resolve` again today, with the `pack` and `rows` flags'), []);
  assert.deepEqual(lintText('A Record<string, Pack> holds Map<string, Array<Row>> here'), []);
  assert.deepEqual(lintHtml('<p>Returns Promise&lt;Row[]&gt; and <code>TypeError: x is not a function</code> to the caller</p>'), []);
  assert.deepEqual(lintText('Who are you `x.`', { name: 'First run', heading: true }), []);
  assert.deepEqual(rules(lintText('A Record<string, Pack> holds the rows')), ['plain-words']);
  assert.deepEqual(rules(lintText('Run `x` now, then infer.resolve could not be delivered')), ['dev-name']);
});

test('A WHOLE DECLARED PAGE, DRAWN BY toHTML, HAS NOTHING TO FIND, and a code sample is never read', () => {
  const src = [
    '# Crumb.gg',
    '',
    'Earning **{{revenue.monthly}}** a month, and {{blockers.count}} things in the way.',
    '',
    '```stat',
    'Monthly | {{revenue.monthly}}',
    'Paying | {{metrics.payers}}',
    '```',
    '',
    '```chips',
    'money | £4,200 | monthly, trailing',
    'block | 2 | in the way',
    '```',
    '',
    '```comparison | Bills',
    'Name | Amount | Due',
    'Hosting | £120.00 | Friday',
    'Domain | £12.00 | 3 Nov',
    '```',
    '',
    '```bar | Spend',
    'Hosting | 120',
    'Domain | 12',
    'Design | 40',
    '```',
    '',
    '- Ship the trial page',
    '- Ask Tima about the pricing',
    '',
    '```code',
    'run S731 at 2026-10-06T19:07:01.610Z on tools#8 {{revenue.monthly}}',
    '```',
  ].join('\n');
  const html = draw(src, { 'revenue.monthly': '£4,200', 'blockers.count': '2', 'metrics.payers': '31' });
  assert.match(html, /S731/, 'the code sample is drawn, and the lint does not read it');
  assert.deepEqual(lintPage({ name: 'Crumb.gg', html, parts: [{ name: 'Who is paying', text: '31 people pay, newest on 6 Oct' }] }), []);
  assert.deepEqual(lintPage(html), []);
});

test('A PAGE NAMES EACH PART IN ITS FINDINGS, its own HTML under its own name', () => {
  const fs = lintPage({
    name: 'Crumb.gg',
    html: draw('```stat\nMonthly | {{revenue.mrr}}\n```'),
    parts: [{ name: 'Activity', text: 'Run S731 read the bank at 2026-10-06T19:07:01.610Z' }],
  });
  assert.deepEqual(fs.map((f) => [f.part, f.rule]), [['Crumb.gg', 'placeholder'], ['Activity', 'raw-id'], ['Activity', 'raw-instant']]);
  assert.deepEqual(rules(lintPage({ name: 'Empty' })), []);
});
