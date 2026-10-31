/**
 * THE MODEL'S LINE KEEPS THE TEMPLATE'S LINKS (polish-j PJ2). Money's rules line makes its late figure the way to the
 * late bills; the line written overnight in its place said the figure with no link, since the model types no markup.
 * `linkedLine` lays each link back where the line says its words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkedLine } from '../src/headlines.ts';

const BILLS = '/r/obligations?f=direction:is:owed_by_me&f=state:in:open,part&f=due:before:today';
const PARTS = '/r/installments?f=state:is:open&f=direction:is:out&f=due:before:today';
const GBP = (minor: number) => ({ amount: minor, currency: 'GBP' });
const lead = {
  body: `{{installments-late.first}} is {{bad:late}}: [{{installments-late.first_amount}}](${PARTS}), due {{ago:installments-late.first_due}}. Bills {{bad:late}} too: [{{overdue}}](${BILLS}) to pay.`,
  values: { overdue: GBP(1_054_000), 'installments-late.first': 'Kiln part 2', 'installments-late.first_amount': GBP(120_000) },
};

test('the late figure the model wrote is the link the rules line had', () => {
  assert.equal(linkedLine('Pay GBP 10,540.00 of late bills first.', lead, '2026-10-31'), `Pay [GBP 10,540.00](${BILLS}) of late bills first.`);
});

test('each link is laid once, on its own figure, and the one-hole label finds its figure alone', () => {
  const both = linkedLine('Kiln part 2 owes GBP 1,200.00 and GBP 10,540.00 of bills is late; GBP 10,540.00 again.', lead, '2026-10-31');
  assert.equal(both, `Kiln part 2 owes [GBP 1,200.00](${PARTS}) and [GBP 10,540.00](${BILLS}) of bills is late; GBP 10,540.00 again.`);
});

test('a figure inside a longer number, a figure the line never says, and a template with no link lay nothing', () => {
  assert.equal(linkedLine('GBP 10,540.001 is not it.', lead, '2026-10-31'), 'GBP 10,540.001 is not it.');
  assert.equal(linkedLine('Nothing to pay.', lead, '2026-10-31'), 'Nothing to pay.');
  assert.equal(linkedLine('Pay GBP 10,540.00.', { body: 'Bills late: {{overdue}} to pay.', values: lead.values }, '2026-10-31'), 'Pay GBP 10,540.00.');
  assert.equal(linkedLine('Pay GBP 10,540.00.', { body: lead.body, values: {} }, '2026-10-31'), 'Pay GBP 10,540.00.');
});
