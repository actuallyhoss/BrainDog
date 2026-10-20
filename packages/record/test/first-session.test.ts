import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { firstSessionCards } from '../src/first-session.ts';

describe('the first brief drawn from the first session', () => {
  it('says the agent, project, device and what it did, then what comes next', () => {
    const cards = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: "Sam's Mac", doing: 'Wiring the tide table.', next: 'Test the tide table', row: 'things#1' });
    assert.deepEqual(cards.map((c) => c.line), ["Claude Code started on Tidepool on Sam's Mac: Wiring the tide table.", 'Next: Test the tide table.']);
    assert.ok(cards.every((c) => c.row === 'things#1' && c.by === 'rule'));
  });

  it('leaves out the device, the doing and the next step when the session did not say them', () => {
    const cards = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: null, doing: null, next: null, row: 'things#1' });
    assert.deepEqual(cards.map((c) => c.line), ['Claude Code started on Tidepool.']);
  });

  it('keeps a long line to one card line without cutting a word', () => {
    const [card] = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: 'Mac', doing: 'word '.repeat(80), next: null, row: 'things#1' });
    assert.ok(card!.line.length <= 140);
    assert.ok(card!.line.endsWith('…'));
  });
});
