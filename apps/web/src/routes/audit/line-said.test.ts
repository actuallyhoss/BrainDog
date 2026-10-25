/**
 * `lineSaid`: one line of Activity as one sentence. The owner's pass read "Handled decided Filed 2…", "Noted Newsletter
 * sending · Newsletter sending · renews 2026-09-10" and "renews Today" for a day a week off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lineSaid } from './lines.ts';

const NOW = Date.parse('2026-09-03T12:00:00Z');

test('A TITLE THAT SAYS WHAT WAS DONE TAKES NO SECOND VERB, and the verb is said beside who did it', () => {
  assert.deepEqual(lineSaid('Closed', 'Filed 2 Ledger Post payments under Software', '', true, NOW), { verb: null, quoted: false, done: 'closed', note: '' });
});

test('A QUESTION IS QUOTED AFTER ITS VERB', () => {
  const said = lineSaid('Asked', 'Does Portage keep sending from portagemail.example?', '', true, NOW);
  assert.equal(said.verb, 'Asked');
  assert.equal(said.quoted, true);
  assert.equal(lineSaid('Changed', 'Ledger Post', 'category set', false, NOW).quoted, false, 'a row is said by its title, unquoted');
});

test('THE NOTE DOES NOT SAY THE TITLE AGAIN, and its days are said as a person says them', () => {
  assert.equal(lineSaid('Noted', 'Newsletter sending', 'Newsletter sending · renews 2026-09-10', false, NOW).note, 'renews 10 Sep');
  assert.equal(lineSaid('Noted', 'Newsletter sending', 'Newsletter sending', false, NOW).note, '');
  assert.equal(lineSaid('Noted', 'Halden licence', 'Halden licence is due today: £2,400.', false, NOW).note, 'Halden licence is due today: £2,400.');
});
import { bankName, thingOf } from './lines.ts';
test('a bank line loses its statement date and a bare number is no name', () => {
  assert.equal(bankName('25OCT26 Phone Banking Transfer'), 'Phone Banking Transfer');
  assert.equal(bankName('0447'), null);
  assert.equal(thingOf('ledger#4', '0447', () => 'Ledger')?.text, 'an entry');
});
