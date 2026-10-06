/**
 * The names other packages read from the kernel rather than keep a copy of: the identity keys' normalisers (the CLI's
 * harvest), the ladder's kinds and rungs (the record and the web), the token's clients and ceilings, and `senderOf`, the
 * one reading of a mail's From header that the kernel fills stored arrivals with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as kernel from '../src/index.ts';

test('EVERY SHARED NAME IS EXPORTED, and each is the function or table its own file holds', () => {
  for (const name of [
    'isMachineIdentity', 'keyOfAny', 'keyOf', 'PUBLIC_MAIL',
    'RUNGS', 'FLOORS', 'KEPT_DAYS', 'kindOfWrite', 'kindsOfProposal', 'keysOfStamp', 'rungOf', 'seedLadder', 'stampOf', 'ladderAgentOf',
    'LADDER_RULE', 'ladderFault',
    'CEILING', 'CLIENT_KINDS', 'ceilingOf',
    'senderOf',
  ])
    assert.ok(name in kernel, `${name} is not exported`);
  /* `agentOf` STAYS THE RUN'S KIND OF AGENT, which the record already reads under that name. */
  assert.equal(kernel.agentOf({ client: 'claude-code' }).name, 'Claude Code');
});

test('THE CLI AND THE KERNEL READ ONE ADDRESS AS ONE KEY', () => {
  assert.equal(kernel.keyOf('email', 'Sara@Halden.example'), kernel.keyOfAny('Sara@Halden.example'));
  assert.equal(kernel.isMachineIdentity({ name: 'dependabot[bot]', email: '49699333+dependabot[bot]@users.noreply.github.com' }), true);
  assert.deepEqual(kernel.senderOf('"Ali, Sara" <Sara@Halden.example>'), { name: 'Ali, Sara', address: 'sara@halden.example', domain: 'halden.example' });
  assert.deepEqual(kernel.keysOfStamp('["tasks:edit","money:edit"]'), ['tasks:edit', 'money:edit']);
});
