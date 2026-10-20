/**
 * A filing rule or a learned category keeps the payee's TEXT (`match`), never its key, and the key is folded from both
 * sides each time a rule is read. So a rule saved while the key was `bank:wwwtalabat` files a new Talabat charge the
 * same way now that the key is `bank:talabat`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bankKey } from '@braindog/kernel';

import { filingFits } from '../src/modules/money/scripts/file-back.js';

const rule = (match: string) => ({ fields: { match, match_by: 'exact', reads: 'payee', direction: 'out', state: 'on', category: 'c_1' } });
const entry = (counterparty_text: string) => ({ counterparty_text, what: counterparty_text, direction: 'out', account: 'a_1' });

test('A RULE SAVED FOR THE WEB SPELLING STILL FILES A NEW CHARGE FROM THE SHOP', () => {
  assert.equal(bankKey('WWW.TALABAT.COM'), 'bank:talabat');
  for (const printed of ['TALABAT', 'GEIDEA*TALABAT 0423 CAIRO EG', 'talabat.com', 'WWW.TALABAT.COM/ORDER']) {
    for (const saved of ['WWW.TALABAT.COM', 'TALABAT', 'talabat.com']) {
      const fit = filingFits(rule(saved), entry(printed), bankKey);
      assert.ok(fit, `${saved} fits ${printed}`);
    }
  }
  assert.equal(filingFits(rule('WWW.TALABAT.COM'), entry('KFC'), bankKey), null);
});
