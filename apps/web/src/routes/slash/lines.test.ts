/**
 * `/slash`'s sentence and its one figure: every number is one the record answered, and the red is what waits on him.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestionsOf, words as slash, type Reading } from '../../lib/record/slash.ts';
import { byLine, foldOf, sentenceOf, suggestedOf, tallyOf, takenOf, waitsOf, words } from './lines.ts';

const READING: Reading = {
  model: null,
  quiet: null,
  noticed: [],
  drafts: [
    { question: 'Turn off Notes?', body_kind: 'pack', asked: { id: 'SG4', status: 'resolved' } },
    { question: 'Add Watch?', body_kind: 'pack', asked: { id: 'SG3', status: 'open' } },
    { question: 'Give Logbook a page of its own?', body_kind: 'arrange', asked: null },
    { question: 'Pin Kiln to Today?', body_kind: 'arrange', asked: null },
  ],
  waiting: [{ id: 'SG3', question: 'Add Watch?' }],
  cap: 3,
};

test('THE LINE IS THE STATE: what waits in Needs you leads, in red, and who drafts is never the headline', () => {
  const s = sentenceOf(1, 2, 4, slash.emptyTitle);
  assert.deepEqual(s, { text: '1 suggestion waits in Needs you.', needs: '1 suggestion waits in Needs you' });
  assert.equal(sentenceOf(3, 0, 3, slash.emptyTitle).needs, '3 suggestions wait in Needs you');
  assert.ok(!s.text.includes(slash.byRules));
});

test('NOTHING WAITING, NO RED: what is new, else everything answered, else nothing yet', () => {
  assert.deepEqual(sentenceOf(0, 2, 3, slash.emptyTitle), { text: '2 new suggestions.', needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 3, slash.emptyTitle), { text: words.allSettled, needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 0, 'Nothing to suggest yet'), { text: 'Nothing to suggest yet.', needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 0, 'Nothing to suggest yet.'), { text: 'Nothing to suggest yet.', needs: undefined });
});

test('THE TILE COUNTS WHERE EACH SUGGESTION STANDS, and leaves out a part with none', () => {
  const t = tallyOf(suggestionsOf(READING), READING.waiting.length, READING.cap);
  assert.ok(t);
  assert.equal(t.total, 4);
  assert.deepEqual(
    t.parts.map((p) => [p.label, p.value, p.tone]),
    [
      [words.partWaiting, 1, 'warn'],
      [words.partNew, 2, 'ink'],
      [words.partAnswered, 1, 'earn'],
    ],
  );
  assert.equal(t.reading, '1 waits for you in Needs you, 2 are not asked yet and you answered 1.');
  const none = tallyOf(suggestionsOf({ ...READING, drafts: READING.drafts.slice(2) }), 0, 3);
  assert.deepEqual(
    none?.parts.map((p) => p.label),
    [words.partNew],
  );
});

test('A FULL DECIDE IS SAID, with the record’s own cap, when new ones are held back by it', () => {
  const t = tallyOf(suggestionsOf(READING), 3, 3);
  assert.match(t?.reading ?? '', /Slash keeps at most 3 in Needs you at once/u);
  assert.doesNotMatch(tallyOf(suggestionsOf(READING), 1, 3)?.reading ?? '', /at most/u);
});

test('NOTHING SUGGESTED, NO TILE: a number tile is never drawn over nothing', () => {
  assert.equal(tallyOf([], 0, 3), null);
});

test('WHO DRAFTED IT IS SAID HONESTLY: the rules as how you use BrainDog, a model by its name', () => {
  assert.equal(byLine('rules'), 'From how you use BrainDog');
  assert.equal(byLine('glm-5.3-flash'), 'Drafted by glm-5.3-flash');
  assert.equal(byLine(null), null);
  assert.equal(byLine(''), null);

  /* A HOST WITH A MODEL STILL SENDS THE RULES' DRAFTS on the read, and not one of them carries the model's name. */
  const withModel: Reading = { ...READING, model: 'glm-5.3-flash' };
  const all = suggestedOf(withModel);
  assert.equal(all.length, 4);
  for (const s of all) {
    assert.equal(byLine(s.by), words.byRules, s.question);
    assert.doesNotMatch(byLine(s.by) ?? '', /glm/u);
  }

  /* WHAT THE LAST PRESS FILED says who drafted it, by id, over the reading's guess. */
  const pressed = suggestedOf(withModel, [{ id: 'SG3', by: 'glm-5.3-flash' }]);
  assert.equal(byLine(pressed.find((s) => s.question === 'Add Watch?')?.by), 'Drafted by glm-5.3-flash');
  assert.equal(byLine(pressed.find((s) => s.question === 'Turn off Notes?')?.by), words.byRules);

  /* A DRAFT THE RECORD SENDS WITH ITS OWN `by` keeps it. */
  const told = suggestedOf({ ...withModel, waiting: [], drafts: [{ ...READING.drafts[2]!, by: 'glm-5.3-flash' } as Reading['drafts'][number]] });
  assert.equal(byLine(told[0]?.by), 'Drafted by glm-5.3-flash');
});

test('WHAT WAITS ON DECIDE LEADS THE LIST, the record’s own waiting included, and nothing is claimed for who drafted it unknown', () => {
  const extra: Reading = { ...READING, waiting: [...READING.waiting, { id: 'SG9', question: 'Add a desk for the launch?' }] };
  const all = suggestedOf(extra);
  assert.deepEqual(
    all.map((s) => [s.question, s.state]),
    [
      ['Add Watch?', 'waiting'],
      ['Add a desk for the launch?', 'waiting'],
      ['Give Logbook a page of its own?', 'new'],
      ['Pin Kiln to Today?', 'new'],
      ['Turn off Notes?', 'answered'],
    ],
  );
  const desk = all.find((s) => s.question === 'Add a desk for the launch?');
  assert.equal(desk?.href, '/decide/SG9');
  assert.equal(desk?.by, null);
  assert.equal(byLine(desk?.by), null);
  assert.equal(byLine(suggestedOf(extra, [{ id: 'SG9', by: 'glm-5.3-flash' }]).find((s) => s.href === '/decide/SG9')?.by), 'Drafted by glm-5.3-flash');
  /* The tile counts the same list the headline does. */
  assert.equal(tallyOf(all, extra.waiting.length, extra.cap)?.total, 5);
});

test('A QUESTION WAITING AFTER A RELOAD SAYS WHO DRAFTED IT, from what the record kept, and the last press still outranks it', () => {
  const kept: Reading = {
    ...READING,
    waiting: [...READING.waiting, { id: 'SG9', question: 'Add a desk for the launch?', by: 'glm-5.3-flash' }, { id: 'SG10', question: 'Turn off Log?', by: 'rules' }, { id: 'SG11', question: 'Add Diary?', by: null }],
  };
  const all = suggestedOf(kept);
  const line = (href: string) => byLine(all.find((s) => s.href === href)?.by);
  assert.equal(line('/decide/SG9'), 'Drafted by glm-5.3-flash');
  assert.equal(line('/decide/SG10'), words.byRules);
  assert.equal(line('/decide/SG11'), null, 'a question filed before the record kept who drafted it was given a drafter');
  assert.equal(byLine(suggestedOf(kept, [{ id: 'SG9', by: 'included' }]).find((s) => s.href === '/decide/SG9')?.by), 'Drafted by included');
});

test('THE FOLD NAMES ONLY WHAT IT HOLDS, and is not drawn over nothing', () => {
  const none = { tally: false, noticed: false, answered: false, lately: false, daily: false, describe: false };
  assert.equal(foldOf(none), null);
  assert.equal(foldOf({ ...none, daily: true }), 'The daily look');
  assert.equal(foldOf({ ...none, noticed: true, answered: true, lately: true, daily: true }), 'What Slash noticed, what you answered, what you asked lately and the daily look');
  for (const line of [foldOf({ ...none, tally: true, noticed: true, answered: true, lately: true, daily: true, describe: true }) ?? '', words.more])
    assert.doesNotMatch(line, /\b(rows?|lists?|items?|entit(y|ies))\b/iu, line);
});

test('THE SCREEN AT REST: the conversation, and Past suggestions as one list with everything else in one fold that a press opens', async () => {
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  const markup = screen.slice(screen.indexOf('</svelte:head>'), screen.indexOf('<style>'));
  /* SLASH IS A CONVERSATION ON ITS OWN PAGE SINCE 3 NOV (tools lane): at rest it is the composer and the threads, and the
     suggestions are their own page (`?history`), whose own ask field went, so the composer is the one place to ask. */
  assert.match(markup, /\{#if !history\}\s*<SlashThreads \/>/u, 'the page at rest is not the conversation');
  const fold = markup.indexOf('<details class="more"');
  assert.ok(fold > 0, 'no fold');
  assert.equal((markup.match(/<details class="more"/gu) ?? []).length, 1, 'one fold, not several');
  const rest = markup.slice(0, fold);
  const inside = markup.slice(fold);
  /* At rest on Past suggestions: the list's tile alone, and no other tile. */
  assert.equal((rest.match(/<(Tile|Section|SlashDaily)\b/gu) ?? []).length, 1, 'more than the one list at rest');
  for (const part of ['<SlashDaily', 'words.noticed', 'pageWords.answeredTitle', 'askWords.lately', 'tally.reading', '<AskPage']) {
    assert.ok(!rest.includes(part), `${part} is drawn at rest`);
    assert.ok(inside.includes(part), `${part} is lost`);
  }
  assert.match(screen, /byLine\(/u);
  /* THE FOLD'S LINE NAMES ONLY WHAT HAS SOMETHING IN IT: nothing noticed or asked yet is neither named nor drawn. */
  assert.match(screen, /noticed: reading\.noticed\.length > 0/u);
  assert.match(screen, /lately: modelHere && \(lately\?\.length \?\? 0\) > 0/u);
  assert.ok(!inside.includes('words.noticedNone') && !inside.includes('askWords.latelyNone'), 'an empty part is drawn in the fold');
});

test('NO EM DASH in anything this screen adds', () => {
  for (const w of Object.values(words)) {
    const line = typeof w === 'function' ? (w as (x: unknown) => string)(2) : w;
    assert.ok(!line.includes('—'), line);
  }
});

/* Noon, so the reader's day is the same in any zone the suite runs in. */
const NOON = Date.parse('2026-10-14T12:00:00Z');

test('EACH SUGGESTION ON DECIDE SAYS HOW LONG IT WAITS, from the day the record hands, in words', () => {
  const dated: Reading = {
    ...READING,
    drafts: [READING.drafts[0]!, { ...READING.drafts[1]!, asked: { id: 'SG3', status: 'open', lapses: '2026-10-28' } } as Reading['drafts'][number], READING.drafts[2]!],
    waiting: [{ id: 'SG3', question: 'Add Watch?' }, { id: 'SG9', question: 'Add a desk for the launch?', lapses: '2026-10-20' } as Reading['waiting'][number]],
  };
  const all = suggestedOf(dated, [], NOON);
  const of = (q: string) => all.find((s) => s.question === q);
  assert.equal(of('Add Watch?')?.waits, 'Offered until 28 Oct', 'the day the draft was asked with');
  assert.equal(of('Add a desk for the launch?')?.waits, 'Offered until 20 Oct', 'the record\u2019s own waiting, with no draft');
  assert.equal(of('Give Logbook a page of its own?')?.waits, null, 'one not asked yet waits on nobody');
  assert.equal(of('Turn off Notes?')?.waits, null, 'one answered waits no more');
  /* NONE HANDED, NONE SAID: the reading as it is today draws exactly what it drew. */
  for (const s of suggestedOf(READING, [], NOON)) assert.deepEqual([s.waits, s.taken], [null, null], s.question);
  assert.equal(waitsOf('2026-10-14', NOON), 'Offered until tonight');
  assert.equal(waitsOf('2026-10-02', NOON), 'Offered until tonight', 'a day gone by is never drawn');
  assert.equal(waitsOf('2027-01-04', NOON), 'Offered until 4 Jan 2027');
  for (const bad of ['2026-02-30', '28 Oct', '', null, 20261028]) assert.equal(waitsOf(bad, NOON), null, String(bad));
});

test('ONE THE RECORD TOOK BACK SAYS SO AMONG WHAT YOU ANSWERED, in the record\u2019s two notes, and nothing for any other', () => {
  const closed: Reading = {
    ...READING,
    drafts: [
      { question: 'Pin Kiln to Today?', body_kind: 'arrange', asked: { id: 'SG5', status: 'withdrawn', note: 'Taken back: a stronger suggestion took its place.' } },
      { question: 'Give Logbook a page of its own?', body_kind: 'arrange', asked: { id: 'SG6', status: 'withdrawn', note: 'Taken back on 2026-10-12: nobody answered it.' } },
      { question: 'Give Ledgerline a page?', body_kind: 'arrange', asked: { id: 'SG7', status: 'withdrawn' }, note: 'Taken back on 12 Oct: nobody answered it.' },
      { question: 'Turn off Notes?', body_kind: 'pack', asked: { id: 'SG4', status: 'resolved', note: 'Taken back by the agent that asked it.' } },
      { question: 'Add Diary?', body_kind: 'pack', asked: { id: 'SG8', status: 'withdrawn' } },
    ] as Reading['drafts'],
    waiting: [],
  };
  const all = suggestedOf(closed, [], NOON);
  const of = (q: string) => all.find((s) => s.question === q);
  assert.ok(all.every((s) => s.state === 'answered'), 'each is among what you answered');
  assert.equal(of('Pin Kiln to Today?')?.taken, 'Taken back: a stronger suggestion took its place.');
  assert.equal(of('Give Logbook a page of its own?')?.taken, 'Taken back on 12 Oct: nobody answered it.', 'the record\u2019s day, in words');
  assert.equal(of('Give Ledgerline a page?')?.taken, 'Taken back on 12 Oct: nobody answered it.', 'a note handed with the draft');
  assert.equal(of('Turn off Notes?')?.taken, null, 'another note is not ours to say');
  assert.equal(of('Add Diary?')?.taken, null, 'the host handed none, so nothing is said');
  for (const s of all) assert.doesNotMatch(s.taken ?? '', /\d{4}-\d{2}-\d{2}|\u2014/u, s.question);
  assert.equal(takenOf('Taken back on 2026-02-30: nobody answered it.', NOON), 'Taken back: nobody answered it.', 'a day it cannot read is left out');
  assert.equal(takenOf(undefined, NOON), null);
});

test('THE PAGE DRAWS HOW LONG IT WAITS BESIDE WHO DRAFTED IT, and why it was taken back among what you answered', async () => {
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(screen, /\{#if by\}<span class="slash-by">\{by\}<\/span>\{\/if\}\{#if s\.waits\}<span class="slash-by">\{s\.waits\}<\/span>\{\/if\}/u);
  const answered = screen.slice(screen.indexOf('pageWords.answeredTitle'));
  assert.match(answered, /\{#if s\.taken\}<span class="line-detail">\{s\.taken\}<\/span>\{\/if\}/u);
});
