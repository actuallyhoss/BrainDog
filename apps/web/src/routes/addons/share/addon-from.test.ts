/**
 * The add-on mode's words and sums: what is ticked, what the file is called, what the preview says, and the one quiet
 * line a host without `exportPack` gets. Invented names only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addonHref, addonId, argsOf, asksOf, fileName, SUMMARY_MOST, summaryOf, groupsOf, modeOf, offeredOf, picked, previewLines, quietOf, skillsOffered, skillsPicked, words, writtenOf } from './addon-from.ts';

const ULID = '01J9ZQ4K7V3T8W2M5N6P0R1S2T';

const offered = offeredOf({
  offered: [
    { id: 'list:greenhouse', kind: 'list', title: 'Greenhouse' },
    { id: 'page:seedlings', kind: 'pages', title: 'Seedlings' },
    { id: 'auto:water', kind: 'automation', title: 'Watering round' },
    { id: 'fig:yield', kind: 'figure', title: 'Harvest weight' },
    { id: 'page:seedlings', kind: 'page', title: 'Seedlings again' },
    { id: 'page:nameless', kind: 'page', title: '  ' },
    { id: 'door:weather', kind: 'door', title: 'Weather feed' },
  ],
});

test('the offer keeps each id once and drops what has no name', () => {
  assert.deepEqual(
    offered.map((o) => o.id),
    ['list:greenhouse', 'page:seedlings', 'auto:water', 'fig:yield', 'door:weather'],
  );
  assert.deepEqual(offeredOf(null), []);
  assert.deepEqual(offeredOf({ offered: 'no' }), []);
});

test('the ticks are grouped lists, pages, figures, automations, then the rest', () => {
  const groups = groupsOf(offered);
  assert.deepEqual(
    groups.map((g) => [g.heading, g.items.map((i) => i.title)]),
    [
      ['Lists', ['Greenhouse']],
      ['Pages', ['Seedlings']],
      ['Figures', ['Harvest weight']],
      ['Automations', ['Watering round']],
      ['Other things', ['Weather feed']],
    ],
  );
});

test('the picked set is offered ids only, once, in the offer order', () => {
  assert.deepEqual(picked(offered, ['auto:water', 'list:greenhouse', 'list:greenhouse', 'list:nowhere']), ['list:greenhouse', 'auto:water']);
  assert.deepEqual(picked(offered, new Set<string>()), []);
});

test('the call carries ids and a title, never rows', () => {
  const args = argsOf(offered, ['page:seedlings'], '  ');
  assert.deepEqual(args, { declarations: ['page:seedlings'], title: words.untitledAddon, version: '1.0.0' });
  assert.equal('rows' in args, false);
});

test('the one line goes with the call only when it is a line, tidied, and never past its length', () => {
  assert.deepEqual(argsOf(offered, ['page:seedlings'], 'Kit', '1.0.0', '  Waters the  seedlings\non a round. '), {
    declarations: ['page:seedlings'],
    title: 'Kit',
    version: '1.0.0',
    summary: 'Waters the seedlings on a round.',
  });
  assert.equal('summary' in argsOf(offered, ['page:seedlings'], 'Kit', '1.0.0', 'x'.repeat(SUMMARY_MOST + 1)), false);
  assert.equal(summaryOf('x'.repeat(SUMMARY_MOST)), 'x'.repeat(SUMMARY_MOST));
  assert.equal(summaryOf('   '), '');
});

test('what it asks permission for is the calls it makes out, or one plain line saying none', () => {
  assert.deepEqual(asksOf({ calls_out: [] }), [words.asksNothing]);
  assert.deepEqual(asksOf(null), [words.asksNothing]);
  assert.deepEqual(asksOf({ calls_out: [{ host: 'weather.example.test', line: 'Fetches the forecast every morning', key: null }, { host: 'feeds.example.test', line: '' }, 3] }), [
    'Calls out: Fetches the forecast every morning',
    'Calls out: feeds.example.test',
  ]);
});

test('the file is called <id>-<version>.pack.json', () => {
  assert.equal(fileName('greenhouse-kit', '1.2.0'), 'greenhouse-kit-1.2.0.pack.json');
  assert.equal(fileName(addonId('Greenhouse Kit!')), 'greenhouse-kit-1.0.0.pack.json');
  assert.equal(addonId('   '), 'my-add-on');
  assert.equal(writtenOf({ text: '{}' }, 'x-1.0.0.pack.json')?.file, 'x-1.0.0.pack.json');
  assert.equal(writtenOf({ file: 'seed-kit-1.0.0.pack.json', text: '{}' }, 'x')?.file, 'seed-kit-1.0.0.pack.json');
  assert.equal(writtenOf({ file: 'f' }, 'x'), null);
});

test('the preview says names, never ids, and each thing once', () => {
  const written = writtenOf(
    {
      file: 'g-1.0.0.pack.json',
      text: '{}',
      adds: ['page:seedlings', { id: 'auto:water' }, 'page:seedlings'],
      brings: [
        { id: 'script:frost-check', why: 'Seedlings runs it' },
        { id: `script:${ULID}`, why: 'Watering round calls it' },
        { id: 'auto:water', why: 'already added' },
      ],
    },
    'x',
  );
  assert.ok(written);
  const lines = previewLines(written, offered);
  assert.deepEqual(lines, [
    { text: 'Adds the page Seedlings' },
    { text: 'Adds the automation Watering round' },
    { text: 'Also brings Frost check', detail: 'Seedlings runs it' },
    { text: `Also brings ${words.needed}`, detail: 'Watering round calls it' },
  ]);
  for (const l of lines) {
    assert.doesNotMatch(l.text, new RegExp(ULID, 'u'));
    assert.doesNotMatch(l.text, /:|—/u);
  }
});

test('a host without exportPack says one quiet line', () => {
  assert.equal(quietOf({ code: 'ROUTE_UNKNOWN' }), 'This BrainDog cannot make a plugin yet.');
  assert.equal(quietOf({ code: 'NOT_IN_THIS_BUILD' }), words.cannot);
  assert.equal(quietOf({ code: 'VALUE_MALFORMED' }), null);
  assert.equal(quietOf(null), null);
});

test('the Add-ons screen links straight to this mode', () => {
  assert.equal(modeOf(new URL(`https://example.test${addonHref}`).searchParams), 'addon');
  assert.equal(modeOf(new URLSearchParams('')), 'usecase');
});

test('the skills the record keeps are offered once each, and only offered ones are ticked', () => {
  const skills = skillsOffered({
    skills: [
      { seq: 3, name: 'Weekly tidy', trigger: 'On a Friday.' },
      { seq: 3, name: 'Weekly tidy again', trigger: 'On a Friday.' },
      { seq: 5, name: 'No moment', trigger: ' ' },
      { seq: 7, name: 'Mail the client', trigger: 'When a job is done.' },
      { seq: 'x', name: 'Odd', trigger: 'Odd.' },
    ],
  });
  assert.deepEqual(skills.map((s) => s.seq), [3, 7]);
  assert.deepEqual(skillsPicked(skills, [7, 9, 3]), [3, 7]);
  assert.deepEqual(skillsOffered({}), []);
});

test('a fix or an update is asked for under the same id, with its note and the ticked skills, and a plain ask carries none of them', () => {
  const plain = argsOf(offered, ['list:greenhouse'], 'Greenhouse', '1.0.0', '');
  assert.deepEqual(Object.keys(plain).sort(), ['declarations', 'title', 'version']);
  const more = argsOf(offered, ['list:greenhouse'], 'Greenhouse', '1.0.1', 'Keeps a greenhouse.', { id: 'greenhouse', changes: '  Fixes the\n watering round. ', skills: [3] });
  assert.deepEqual(more, { declarations: ['list:greenhouse'], title: 'Greenhouse', version: '1.0.1', summary: 'Keeps a greenhouse.', id: 'greenhouse', changes: 'Fixes the watering round.', skills: [3] });
});

test('a skill that goes out is said in the preview by its name', () => {
  const lines = previewLines({ adds: ['list:greenhouse'], brings: [], skills: ['weekly-tidy'] }, offered);
  assert.deepEqual(lines.map((l) => l.text), ['Adds the list Greenhouse', 'Gives agents the skill weekly tidy']);
  assert.deepEqual(writtenOf({ text: '{}', skills: ['weekly-tidy', 4, ''] }, 'x.pack.json')?.skills, ['weekly-tidy']);
});

test('no em dash in anything a person reads', () => {
  for (const w of Object.values(words)) if (typeof w === 'string') assert.doesNotMatch(w, /—/u);
});
