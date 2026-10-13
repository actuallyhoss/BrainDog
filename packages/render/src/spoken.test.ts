/**
 * `spoken`, and the one place this package reads through it: an option's figure (audit 72 #3).
 *
 * THE SAME CASES THE APP HOLDS IT TO (`apps/web/src/lib/decide/card.test.ts`), word for word, because the function
 * here is the one the app's was copied from and the two must not drift while both exist.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { spoken } from './spoken.ts';
import { queueFault, queuePlan, showsOf } from './queue.ts';

test('SPOKEN LEAVES WORDS ALONE and takes out only what is an address or an id', () => {
  const same = ['Pay the £12.98 invoice by 10/06/2026.', 'Two of the three quotes came back.', 'Renew it in 3 days and/or cancel.', 'Invoice 20261001 is late.'];
  for (const s of same) assert.equal(spoken(s), s);
  assert.equal(spoken('alex@acme.com wrote back'), 'Someone wrote back');
  assert.equal(spoken('Seen on https://www.stripe.com/invoices/42.'), 'Seen on stripe.com.');
  assert.equal(spoken('Running on mara-mbp.local'), 'Running');
  assert.equal(spoken('From commit 4464966f in braindog'), 'From commit in braindog');
  assert.equal(spoken('Filed by agent:claude as SG14 for p_7x2k'), 'Filed');
  assert.equal(spoken('Proposed by agent:claude because the bill is late'), 'Proposed because the bill is late');
  assert.equal(spoken('Moved from ~/Developer/old to C:\\Repos\\new'), 'Moved');
  assert.equal(spoken('Renew the face2face plan.'), 'Renew the face2face plan.', 'a word of hex letters is no hash');
  assert.equal(spoken('Ask Jo (jo@x.io) about it.'), 'Ask Jo about it.', 'an address beside its name goes whole');
  assert.equal(spoken('Changed in (apps/web/src/a.ts, apps/web/src/b.ts)'), 'Changed', 'no bracket of commas is left');
});

test('SPOKEN TAKES OUT WHAT A PERSON CANNOT READ, in a sentence somebody else wrote', () => {
  assert.equal(spoken('Add alex@acme.com to Acme?'), 'Add someone to Acme?');
  assert.equal(
    spoken('Alex Ng <alex.ng@acme.com> replied from 192.168.1.4 about tasks#8 (see /Users/mara/Developer/braindog/notes.md).'),
    'Alex Ng replied.',
  );
  assert.equal(spoken('Adds 01J9Z8X7W6V5T4S3R2Q1P0N9M8 to people'), 'Adds to people');
  assert.equal(spoken('Fix the sign-in in apps/web/src/login.ts'), 'Fix the sign-in');
});

test('A SHORT PATH GOES TOO, when its last part is a file by its extension, and two words with a slash stay', () => {
  assert.equal(spoken('Approve the review (see docs/review.md)'), 'Approve the review', 'the bracket goes with it');
  assert.equal(spoken('Approve the review (see docs/review.md).'), 'Approve the review.');
  assert.equal(spoken('Read docs/review.md, then src/card.ts and data/rates.json.'), 'Read, then and.');
  assert.equal(spoken('Fix it in src/card.ts.'), 'Fix it.', 'the stop that ended the sentence stays');
  assert.equal(spoken('Open ./README.MD first'), 'Open first');
  const same = [
    'Renew it and/or cancel.',
    'Open 24/7 all year.',
    'Ask whether he/she agrees.',
    'Ship it w/o the logo.',
    'Compare Q3/Q4 spend.',
    'Rate it 1.5/2.0 or better.',
    'Pay by 10/06/2026.',
    'Due 10/06.',
    'Split it 50/50.Then send it.',
    'Either/or.',
    /* Two words that hold a stop are no file in a folder (audit 81, claim 2): each lost words before. */
    'Use e.g./i.e. forms',
    'Fix a/b.test please',
    'try v1/v2.beta',
    'See Node.js/Deno.land now',
  ];
  for (const s of same) assert.equal(spoken(s), s, s);
  assert.equal(spoken('Keep docs/.env out of it'), 'Keep out of it', 'a file that is all extension is still a file');
  /* Three parts or more read as they did before the short rule. */
  assert.equal(spoken('Fix the sign-in in apps/web/src/login.ts'), 'Fix the sign-in');
  assert.equal(spoken('Changed in (apps/web/src/a.ts, apps/web/src/b.ts)'), 'Changed');
  assert.equal(showsOf('figure:docs/review.md'), null, 'a figure that is a path is not drawn');
});

test('A FIGURE THAT SAYS ITSELF IS DRAWN AS WRITTEN', () => {
  for (const said of ['EGP 1,200', '£12.98', '3 of 5', '12 days', 'Due 10/06/2026', '40%'])
    assert.deepEqual(showsOf(`figure:${said}`), { figure: said }, said);
});

test('A FIGURE SPOKEN WOULD CHANGE IS NOT DRAWN, because a figure with a part gone is one nobody wrote', () => {
  for (const said of ['3 of tasks#8', 'alex@acme.com', '01J9Z8X7W6V5T4S3R2Q1P0N9M8', 'apps/web/src/login.ts', 'by agent:claude', 'on mara-mbp.local', '4464966f'])
    assert.equal(showsOf(`figure:${said}`), null, said);
  /* At its edge too: ".5" would read "5", and "1,200," is a figure cut short. */
  for (const said of ['.5', '1,200,']) assert.equal(showsOf(`figure:${said}`), null, said);
  /* The other two spellings are read as they were: a file names its row by a handle, which is how the host finds it. */
  assert.deepEqual(showsOf('file:parts#2/photo'), { file: { row: 'parts#2', field: 'photo' } });
  assert.deepEqual(showsOf('swatch:#1f3a5f'), { swatch: ['#1f3a5f'] });
});

test('AN OPTION WHOSE FIGURE IS LEFT OUT STILL DRAWS, and the questions beside it with it', () => {
  const rows = [
    { cells: ['q', 's1', 'Mara', '', 'Which box?', ''] },
    { cells: ['opt', 's1', 'a', 'Small', '', '', 'figure:3 of tasks#8'] },
    { cells: ['opt', 's1', 'b', 'Large', '', '', 'figure:EGP 1,200'] },
  ];
  assert.equal(queueFault(rows.map((r) => r.cells)), null, 'the spelling is right, so the fence is');
  const [item] = queuePlan(rows).items;
  assert.deepEqual(item!.options.map((o) => o.shows), [null, { figure: 'EGP 1,200' }]);
  assert.deepEqual(item!.options.map((o) => o.label), ['Small', 'Large'], 'it reads by its name');
  assert.equal(queueFault([['q', 's1', 'a', 'b', 'c', 'd'], ['opt', 's1', 'k', 'K', '', '', 'figure:']]), 'a visual this build does not draw: "figure:"');
});
