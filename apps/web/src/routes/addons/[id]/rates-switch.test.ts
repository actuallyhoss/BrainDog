import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RATES_PACK, ratesFeedOf, ratesKept } from './rates-switch.ts';

const pack = (id: string, disabled_at: string | null) => ({ id, version: '1.1.2', disabled_at, registers: [] });

test('THE SWITCH READS ON ONLY WHILE THE RATES POLL IS INSTALLED AND NOT TURNED OFF', () => {
  assert.equal(RATES_PACK, 'rates-open-er-api-com');
  assert.equal(ratesKept(ratesFeedOf([pack('money-core', null)])), false);
  assert.equal(ratesKept(ratesFeedOf([pack(RATES_PACK, null)])), true);
  assert.equal(ratesKept(ratesFeedOf([pack(RATES_PACK, '2026-10-27T00:00:00Z')])), false);
});
