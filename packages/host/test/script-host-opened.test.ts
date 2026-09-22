/**
 * The host a key is sent to and the host the approval line names it going to, asked of the same `opens`
 * (`loop/research-batch-thirty-eight-audit.md` finding 4).
 *
 * THE LINE AND THE RUN READ `opens` TWO WAYS. `keyRefused` sent a key where a URL parse of the vault entry's words said,
 * and the line the owner approves printed the words raw, so the audit filed `opens: https://api.goldapi.io@collector.test`,
 * read "key goldapi to https://api.goldapi.io@collector.test" on the line, and watched the key go to `collector.test`
 * alone. The line now reads `hostOpened` in `packages/kernel/src/actions.ts`. `keyRefused` still reads its own copy,
 * because `@braindog/kernel` does not export the function from its index yet, so this file holds the two to one answer
 * over every form the audit and the old comment named: a key is let through to a host exactly when the kernel's parse
 * names that host. It stays true, and worth running, once the copy is deleted and the host imports the kernel's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyRefused } from '../src/script.ts';
import { hostOpened } from '../../kernel/src/actions.ts';

const OPENS = [
  'api.goldapi.io',
  'API.GoldAPI.io.',
  'api.goldapi.io:8443',
  'https://api.goldapi.io/v1',
  'https://api.goldapi.io@collector.test',
  'https://collector.test#@api.goldapi.io',
  'the GoldAPI account',
  'metals.example.org',
  'goldapi.io',
  '',
  '   ',
];

const FETCHED = ['https://api.goldapi.io/v1/XAU/EGP', 'https://collector.test/in', 'https://metals.example.org/', 'https://goldapi.io/', 'https://api.goldapi.io:8443/'];

test('keyRefused LETS A KEY THROUGH EXACTLY WHERE THE KERNEL SAYS ITS VAULT ENTRY OPENS, for every form the audit named', () => {
  for (const opens of OPENS)
    for (const url of FETCHED) {
      const at = new URL(url);
      const sent = keyRefused('gold-rate', { id: 'g_1', label: 'goldapi', opens }, at) === null;
      assert.equal(sent, hostOpened(opens) === at.hostname, `opens ${JSON.stringify(opens)}, fetched ${url}: the host ${sent ? 'sent' : 'refused'} and the kernel's parse names ${JSON.stringify(hostOpened(opens))}`);
    }
});

/* THE AUDIT'S L4, AS THE HOST SEES IT. Everything before the `@` is user-info, so the entry opens `collector.test`, and
   GoldAPI, the host the words appear to name, is refused the key. */
test('AN ENTRY THAT OPENS https://api.goldapi.io@collector.test SENDS ITS KEY TO collector.test AND NOT TO GOLDAPI', () => {
  const grant = { id: 'g_1', label: 'goldapi', opens: 'https://api.goldapi.io@collector.test' };
  assert.equal(keyRefused('gold-rate', grant, new URL('https://collector.test/in')), null);
  assert.equal(keyRefused('gold-rate', grant, new URL('https://api.goldapi.io/v1'))?.code, 'FORBIDDEN');
  assert.equal(hostOpened(grant.opens), 'collector.test');
});
