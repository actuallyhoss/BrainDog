/**
 * The words a person must never read (`words.mjs`): each kind finds the example a review found on his
 * screens, none fires on the text the sample record's own screens print, and `rawIn(text)` still counts only the five
 * kinds the people's walks have always been held to.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { KIND_NAMES, MACHINE_WORDS, ORIGINAL, RAW, rawIn, slugsOf } from '../words.mjs';
import { rawIn as capturedRawIn } from '../capture.mjs';

const all = (text, more = {}) => rawIn(text, { all: true, ...more });

/** A kind, a sentence with one of it planted, and what the count must show for it. */
const PLANTED = [
  ['placeholders', 'Party Line "{{entity:merriment}}" is not a path or a typed value.', '{{entity:merriment}}'],
  ['paths', 'Saved to ~/Developer/braindog/loop/NEXT.md now', '~/Developer/braindog/loop/NEXT.md'],
  ['paths', 'See /Users/sam/Developer/braindog for it', '/Users/sam/Developer/braindog'],
  ['paths', 'Edit apps/web/src/lib/home/Home.svelte please', 'apps/web/src/lib/home/Home.svelte'],
  ['paths', 'Open ./scripts/run.mjs', './scripts/run.mjs'],
  ['paths', 'Opened at C:\\Users\\sam\\Desktop\\notes.txt', 'C:\\Users\\sam\\Desktop\\notes.txt'],
  ['paths', 'Open /p/sam-site/notes for it', '/p/sam-site/notes'],
  ['paths', 'Drawn in loop/proof/looks/audit/today-1512-light.png', 'loop/proof/looks/audit/today-1512-light.png'],
  ['instants', 'Updated 2026-10-06T19:07:01.610Z by a script', '2026-10-06T19:07:01.610Z'],
  ['dates', 'Due 2026-10-06 for the bank', '2026-10-06'],
  ['dates', 'Last run 2026-10-06 19:07:01 on a Mac', '2026-10-06'],
  ['ids', 'Filed as 01J8Z3K9X5Q2W7R4T6Y8V0B1N3 today', '01J8Z3K9X5Q2W7R4T6Y8V0B1N3'],
  ['hashes', 'Run full CI on master 8b1fe59 and fix the reds', '8b1fe59'],
  ['hashes', 'Key 3f2a9c1e-7b4d-4e6a-9c0f-1a2b3c4d5e6f is live', '3f2a9c1e-7b4d-4e6a-9c0f-1a2b3c4d5e6f'],
  ['handles', 'Change tools#8 to something shorter', 'tools#8'],
  ['handles', 'credentials#26 has no name', 'credentials#26'],
  ['refs', 'Asked as SG185 on Needs you', 'SG185'],
  ['refs', 'Run S880 did it', 'S880'],
  ['slugs', 'bank-card-used-sms could not read the account', 'bank-card-used-sms'],
  ['codes', 'It stopped (ROUTE_UNKNOWN).', 'ROUTE_UNKNOWN'],
  ['codes', 'The owner sets COUNT_VISITS first', 'COUNT_VISITS'],
  ['zeros', 'Paid GBP 0.00 so far', 'GBP 0.00'],
  ['zeros', 'EGP 0 left to pay', 'EGP 0'],
  ['ticks', 'Put the words in `backticks` to keep them as text.', '`backticks`'],
  ['machine', 'It only arranges your own rows, and every change can be undone.', null],
  ['machine', 'A typed value starts with date, day, until or ago.', null],
  ['machine', 'There are no list items here yet.', null],
  ['machine', 'Every entity has a name.', null],
  ['machine', 'It is kept in the register that holds it.', null],
  ['stuck', 'Total undefined today', 'undefined'],
  ['stuck', 'Balance NaN', 'NaN'],
  ['stuck', 'The note reads [object Object] and then stops', '[object Object]'],
  ['dashes', 'user claude \u2014 the keys', null],
];

test('EVERY KIND FINDS WHAT THE AUDIT FOUND ON HIS SCREENS, planted in a sentence', () => {
  for (const [kind, text, example] of PLANTED) {
    const found = all(text)[kind];
    assert.ok(found, `${kind} in "${text}"`);
    assert.equal(found.count, 1, `${kind} in "${text}" is one`);
    if (example !== null) assert.equal(found.e[0], example, `${kind} in "${text}"`);
    else assert.match(found.e[0], /rows|typed value|list items|entity|register|claude \u2014 the/u, 'a machine word or a dash is shown with the words around it');
  }
  assert.deepEqual(new Set(PLANTED.map(([kind]) => kind)), new Set(Object.keys(RAW)), 'a kind with no planted example is a kind nobody has seen find anything');
});

/** What the sample record's own screens print (Today, Needs you, Projects, a project, Money, Agents), word for word. */
const CLEAN = [
  'Thursday 3 September',
  '8 need you. £7,200 owed to you is late, and £10,540 you owe. 2 agents are working.',
  '8 need you: 3 about money, £7,239 in all, and 5 quick ones.',
  'Invoice 2026-041: brand system',
  'Invoice 2026-049: type licensing',
  'Chase £4,800',
  '38 days late',
  'Ledger Post, sending plan',
  '4 days late · Did it go through?',
  'Does Portage keep sending from portagemail.example, or move to the apex?',
  'Not updated since 13 Aug',
  'Ask Claude to report it',
  'Up 5.6% since 26 Aug',
  '60% · aiming 20 Sep',
  'Part\tAmount\tShare',
  'Portage\t£0\tnone',
  'Sep 2026so far, and due\t£960\t£26,690\t−£25,730.00',
  'Filter status is Open or Part paid, due after yesterday, due before 31 days from now',
  'Pause and Stop reach Claude at its next tool call, through its hooks.',
  '4 lists, 4 pages, 21 rules',
  'Variable axis QA, instances 3 of 9',
  'Kiln · Thinking · axis-qa · running 3 h 30 min · heard 3 min ago',
  'It went through',
  'Yes/No and/or N/A, 24/7 support, TCP/IP and I/O',
  'A built-in sign-in, a year-end follow-up, an up-to-date list, a mother-in-law',
  'Call 0207 123 4567 or 07911 123456 about ref 20261022',
  'See https://example.com/docs/index.html and brain.dog/app/sam',
  'Order #12, issue #8 and a USB 0 hub',
  'Growth is up, and the rowing club is back',
  'Mon 7 Sep',
  'Rent\t\u2014\tFriday',
  'Paid \u2014',
  '\u2014',
];

test('NOTHING FIRES ON THE TEXT THE SAMPLE RECORD ITSELF PRINTS', () => {
  for (const line of CLEAN) assert.deepEqual(all(line), {}, line);
});

test('rawIn(text) STILL COUNTS ONLY THE FIVE KINDS IT BEGAN WITH, which is what the walks fail on', () => {
  assert.deepEqual(ORIGINAL, ['placeholders', 'instants', 'ids', 'handles', 'stuck']);
  const text = 'Run CI on master 8b1fe59 and see tools#8 in ~/Developer/x/NEXT.md, {{a.b}} rows on 2026-10-06 and ROUTE_UNKNOWN';
  assert.deepEqual(Object.keys(rawIn(text)), ['placeholders', 'handles']);
  assert.deepEqual(Object.keys(all(text)), ['placeholders', 'paths', 'dates', 'hashes', 'handles', 'codes', 'machine']);
  assert.equal(capturedRawIn, rawIn, 'capture.mjs still exports the one the walks import');
});

test('A MATCH IS COUNTED ONCE, by the first kind that reads it', () => {
  assert.deepEqual(Object.keys(all('Updated 2026-10-06T19:07:01.610Z')), ['instants'], 'an instant is not also a date');
  assert.deepEqual(Object.keys(all('Key 3f2a9c1e-7b4d-4e6a-9c0f-1a2b3c4d5e6f')), ['hashes'], 'a UUID is one id and not five runs of hex');
  assert.deepEqual(Object.keys(all('Drawn in loop/looks/2026-10-22/today.png')), ['paths'], 'a date inside a path is the path');
  const far = ['It lists rows', 'b'.repeat(80), 'and more rows', 'c'.repeat(80), 'then a row', 'd'.repeat(80), 'and last the rows'].join(' ');
  assert.equal(all(far).machine.count, 4);
  assert.equal(all(far).machine.e.length, 3, 'up to three examples, each with the words around it');
  assert.equal(all('tools#8 and tools#8 again').handles.e.length, 1, 'the same example is shown once');
});

test('THE MACHINE WORDS ARE READ FROM words.json, and "list" is not one of them', () => {
  assert.deepEqual(MACHINE_WORDS, ['row', 'list item', 'entity', 'register']);
  assert.deepEqual(Object.keys(all('A list of lists, 4 lists, 4 pages, your lists, the list')), [], "list is the product's own word for what a person keeps");
  assert.equal(all('Growth is up and the rowing club is back').machine, undefined, 'a word is whole: rowing and growth are not row');
  assert.equal(all('Writing it will register an address').machine, undefined, 'to register, the verb, is plain');
  assert.ok(all('in the register that holds it').machine, "register as a noun is the kernel's word");
});

test('A ZERO AMOUNT IS A REAL CURRENCY CODE AND NOTHING IN IT', () => {
  assert.ok(all('GBP 0.00').zeros);
  assert.ok(all('USD 0,00 and EGP 0').zeros.count === 2);
  assert.equal(all('GBP 0.50 and GBP 05').zeros, undefined, 'an amount is not empty because it starts with a nought');
  assert.equal(all('USB 0 ports, CPU 0, FAQ 0').zeros, undefined, 'three capitals are not a currency');
  assert.equal(all('£0.00 owed and £0 left').zeros, undefined, 'a plain sign and nought is a figure');
});

test('A PAGE ADDRESS THAT IS NOT JUST ITS TITLE IS A SLUG, and a title written as an address is its name', () => {
  const pages = [
    { slug: 'sam-site', title: 'Studio site' },
    { slug: 'marlow-co', title: 'Marlow & Co' },
    { slug: 'variable-axis-qa-instances-3-of-9', title: 'Variable axis QA, instances 3 of 9' },
    { slug: 'kiln', title: 'Kiln' },
    { slug: 'money-rules', title: 'Filing rules' },
  ];
  assert.deepEqual(slugsOf(pages), ['sam-site', 'money-rules']);
  assert.equal(all('Open sam-site now').slugs, undefined, 'two hyphened words are only a slug where the record names it');
  assert.equal(all('Open sam-site now', { slugs: slugsOf(pages) }).slugs.e[0], 'sam-site');
  assert.equal(all('The marlow-co page and the kiln page', { slugs: slugsOf(pages) }).slugs, undefined);
  assert.equal(all('Open sam-sitemap', { slugs: slugsOf(pages) }).slugs, undefined, 'a longer word is not the slug');
  assert.equal(all('review-pr-kiln is open', { slugs: ['review-pr-kiln'] }).slugs.count, 1, 'a slug the shape and the record both name is one');
  assert.deepEqual(slugsOf(undefined), []);
});

test('A STUCK OBJECT IS FOUND BEFORE A SPACE, which the first spelling of the pattern missed', () => {
  assert.equal(rawIn('[object Object] and more').stuck.count, 1);
  assert.equal(rawIn('The note says null here').stuck.count, 1);
  assert.equal(rawIn('A nullable value, an undefinedness').stuck, undefined, 'a word is whole or it is not stuck');
});

test('EVERY KIND HAS A NAME A READER CAN SAY', () => {
  assert.deepEqual(Object.keys(KIND_NAMES), Object.keys(RAW));
  for (const name of Object.values(KIND_NAMES)) assert.match(name, /^[a-z ]+$/u);
});
