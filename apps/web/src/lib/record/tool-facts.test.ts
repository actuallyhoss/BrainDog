import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hostsSaid, needsSaid, originSaid } from './tool-facts.ts';

const names = new Map([
  ['credentials#1', 'Fenwick deploy key'],
  ['credentials#4', 'Nordhaven API'],
]);

test('A KEY A TOOL NEEDS IS SAID BY ITS NAME AND HOW IT REACHES THE TOOL, never its row or a value', () => {
  assert.equal(needsSaid(['header:Authorization=credentials#1'], names), 'Sends the Fenwick deploy key in a header');
  assert.equal(needsSaid(['header:Authorization=credentials#4'], names), 'Sends the key Nordhaven API in a header');
  assert.equal(needsSaid(['LEDGER_POST_KEY=credentials#3'], names), 'Is given one of your keys when it starts', 'a key the screen was not named');
  assert.equal(needsSaid(['BRAINDOG_TOKEN']), 'Is given a key called BRAINDOG_TOKEN when it starts');
  assert.equal(needsSaid(['header:X-Api-Key']), 'Sends a key you set yourself in a header');
  assert.equal(needsSaid(['header:Authorization=credentials#1', 'BRAINDOG_TOKEN'], names), 'Sends the Fenwick deploy key in a header; is given a key called BRAINDOG_TOKEN when it starts');
  assert.equal(needsSaid([]), null);
  for (const s of [needsSaid(['header:Authorization=credentials#1'], names), needsSaid(['NAME=credentials#9'])]) assert.doesNotMatch(s ?? '', /credentials#|header:/u);
});

test('A MACHINE A TOOL WAS SEEN ON IS SAID BY ITS NAME', () => {
  assert.equal(hostsSaid(['kiln-mbp']), 'MacBook Pro');
  assert.equal(hostsSaid(['kiln-mbp', 'studio-desktop']), 'MacBook Pro, Studio desktop');
  assert.equal(hostsSaid(['kiln-mbp', 'studio-mbp']), 'Kiln MacBook Pro, Studio MacBook Pro', 'two that would read the same keep their own words');
  assert.equal(hostsSaid([]), null);
});

test('WHERE A TOOL CAME FROM SAYS ITS MACHINE BY NAME, and anything else as written', () => {
  assert.equal(originSaid('~/.claude.json on kiln-mbp'), '~/.claude.json on MacBook Pro');
  assert.equal(originSaid('Deposited from studio-desktop'), 'Deposited from Studio desktop');
  assert.equal(originSaid('.mcp.json in kiln-site'), '.mcp.json in kiln-site');
  assert.equal(originSaid('Found on GitHub'), 'Found on GitHub');
});
