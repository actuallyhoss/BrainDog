/**
 * WHO A ROW ON `/settings/people` IS, said the way the rest of the product says a person.
 *
 * WHAT WAS MEASURED. `personOf` in `lib/record/settings-write.ts` falls back to the email for the
 * name when the record holds none, and `research-second-person.md` measured that it holds none for
 * anybody: `boot.names` came back `{}` for all seven people on a driven record, owners included,
 * because nothing in the product writes `member.name`. The row then drew that fallback in the two
 * places a name goes, the initial on the face (`B` for `ben@ashgrove.co.uk`) and the name slot
 * beside it, and the level control's accessible name read "What ben@ashgrove.co.uk can do".
 * `cd611217` stopped the detail line repeating the email a third time; the name slot was left.
 *
 * THE RULE ALREADY EXISTS, and this screen was the one not keeping it. `whoDid`, which `/audit`
 * reaches through `actorSaid` in `routes/audit/who.ts`: the reader is You, a person the record has
 * a name for is that name, and anybody else is Someone on this record. The email stays on the row,
 * in the detail line, which is its job: telling two people apart, not being one of them.
 *
 * A TEXT TEST OVER MARKUP FOR THE WIRING, for the reason `levels.test.ts` gives: there is no
 * component test in this tree. The naming itself is a plain function and is driven for real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Member } from '@braindog/client';
import { copy } from '../../lib/copy.ts';
import { PEOPLE_ACCESS } from '../../lib/record/fixtures/sample.ts';
import { personOf } from '../../lib/record/settings-write.ts';

/** The page without its comments, so a comment quoting the defect cannot fail or pass a check. */
const PAGE = readFileSync(new URL('./[area]/areas/People.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** The markup of one person's row in the People area, from `{#each people as p` to its level control. */
const ROW = (() => {
  const from = PAGE.indexOf('{#each people as p (p.id)}');
  assert.ok(from >= 0, 'the People area no longer draws one row per person');
  const to = PAGE.indexOf('class="segmented levels"', from);
  assert.ok(to > from, 'the row has no level control after its head');
  return PAGE.slice(from, PAGE.indexOf('>', to));
})();

/* A colleague invited by address, as `members` returns them today: no name, because nothing writes one. */
const ben = personOf({
  person_id: 'p_01M1KJ7RG0TYYA0AX15QPGJJ45',
  name: null,
  email: 'ben@ashgrove.co.uk',
  level: 'write',
  scoped: [],
  suspended_at: null,
  seen_at: null,
} as unknown as Member);

test('the row names a person through one call, and never prints `p.name` where the name goes', () => {
  assert.doesNotMatch(ROW, /<Face name=\{p\.name\}/u, 'the face takes its initial from the email');
  assert.doesNotMatch(ROW, /<span class="who-name">\{p\.name\}<\/span>/u, 'the name slot prints the email');
  assert.doesNotMatch(ROW, /copy\.levelFor\(p\.name\)/u, 'the level control is named "What <email> can do"');
  assert.match(ROW, /<Face name=\{said\(p\)\}/u);
  assert.match(ROW, /<span class="who-name">\{said\(p\)\}<\/span>/u);
  assert.match(ROW, /copy\.levelFor\(said\(p\)\)/u);
});

test('a colleague the record has no name for is Someone on this record, and the email moves to the detail line', async () => {
  const { namesHeld, personSaid, secondSaid } = await import('./[area]/people-said.ts');
  assert.equal(ben.name, 'ben@ashgrove.co.uk', 'the fallback this test is about has changed; re-measure');
  const names = namesHeld([ben]);
  assert.equal(names.size, 0, 'an email was taken for a name');
  const said = personSaid(ben, 'p_01OWNER0000000000000000000', names);
  assert.equal(said, copy.feedSomeone);
  assert.doesNotMatch(said, /@/u);
  /* THE EMAIL IS STILL ON THE ROW, once, where it tells two people apart. */
  assert.equal(secondSaid(ben, said), 'ben@ashgrove.co.uk');
  assert.match(ROW, /secondSaid\(p, said\(p\)\)/u, 'the detail line does not carry the email the name slot gave up');
});

test('a colleague with no address is not named by their id either', async () => {
  const { namesHeld, personSaid } = await import('./[area]/people-said.ts');
  /* `Member.email` IS NULLABLE and `invite` takes the address as optional, so `personOf`'s last
     fallback is reachable: the id goes in `name`. Deleting the id check in `namesHeld` passed every
     other test here, and the name slot then read `p_01M1KJ7RG0TYYA0AX15QPGJJ46`. */
  const bare = personOf({ ...({} as Member), person_id: 'p_01M1KJ7RG0TYYA0AX15QPGJJ46', name: null, email: null, level: 'write', scoped: [], suspended_at: null, seen_at: null });
  assert.equal(bare.name, bare.id, 'the fallback this test is about has changed; re-measure');
  const names = namesHeld([bare]);
  assert.equal(names.size, 0, 'an id was taken for a name');
  assert.equal(personSaid(bare, 'p_01OWNER0000000000000000000', names), copy.feedSomeone);
});

test('the reader is You, and a person the record does know is still their name', async () => {
  const { namesHeld, personSaid, secondSaid } = await import('./[area]/people-said.ts');
  assert.equal(personSaid(ben, ben.id, namesHeld([ben])), copy.feedYou);
  const sam = { ...ben, id: 'p_01SAM00000000000000000000', name: 'Sam Okafor', email: 'sam@ashgrove.co.uk' };
  const names = namesHeld([ben, sam]);
  assert.deepEqual([...names], [[sam.id, 'Sam Okafor']]);
  assert.equal(personSaid(sam, ben.id, names), 'Sam Okafor');
  assert.equal(secondSaid(sam, 'Sam Okafor'), 'sam@ashgrove.co.uk');
});

test('the sample record draws exactly the names it drew before', async () => {
  const { namesHeld, personSaid } = await import('./[area]/people-said.ts');
  const names = namesHeld(PEOPLE_ACCESS);
  for (const p of PEOPLE_ACCESS) assert.equal(personSaid(p, 'you', names), p.name, `${p.id} is said differently`);
});
