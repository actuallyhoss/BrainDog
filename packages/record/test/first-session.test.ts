import { describe, expect, it } from 'vitest';

import { firstSessionCards } from '../src/first-session.ts';

describe('the first brief drawn from the first session', () => {
  it('says the agent, project, device and what it did, then what comes next', () => {
    const cards = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: "Sam's Mac", doing: 'Wiring the tide table.', next: 'Test the tide table', row: 'things#1' });
    expect(cards.map((c) => c.line)).toEqual(["Claude Code started on Tidepool on Sam's Mac: Wiring the tide table.", 'Next: Test the tide table.']);
    expect(cards.every((c) => c.row === 'things#1' && c.by === 'rule')).toBe(true);
  });

  it('leaves out the device, the doing and the next step when the session did not say them', () => {
    const cards = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: null, doing: null, next: null, row: 'things#1' });
    expect(cards.map((c) => c.line)).toEqual(['Claude Code started on Tidepool.']);
  });

  it('keeps a long line to one card line without cutting a word', () => {
    const [card] = firstSessionCards({ agent: 'Claude Code', project: 'Tidepool', device: 'Mac', doing: 'word '.repeat(80), next: null, row: 'things#1' });
    expect(card!.line.length).toBeLessThanOrEqual(140);
    expect(card!.line.endsWith('…')).toBe(true);
  });
});
