/**
 * The project and decision cards: what is drawn from a tool's answer, and that nothing is drawn from one that is not
 * a project or one open question. Pure, so no record is opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardHtml, cardMeta, cardOf, cardResource, decisionCard, moneyLine, projectCard, ruleCard } from '../src/cards.ts';

test('a projects row becomes a project card from the fields the list declares', () => {
  const card = projectCard(
    { spoken: 'projects#4', fields: { name: 'Nook', about: 'Rooms for friends.', next: 'Ship the iOS build', hue: 210, lane: 'building', revenue: { amount: 120000, currency: 'GBP' }, agent: 'Claude' } },
    'https://brain.dog/',
    'mara',
  );
  assert.deepEqual(card, {
    kind: 'project',
    name: 'Nook',
    hue: 210,
    lane: 'Building',
    brief: 'Rooms for friends.',
    next: 'Ship the iOS build',
    money: 'GBP 1,200',
    working: 'Claude',
    href: 'https://brain.dog/mara',
  });
});

test('the brief is the clean first lines of the note when there is no about, and the link falls back to the app\'s front door', () => {
  const card = projectCard({ spoken: 'projects#5', fields: { name: 'Harbour', note: '# Harbour\nStatus: building · Lane: ship\nA tool for sites. It builds them nightly.\nMore later.' } }, 'https://brain.dog');
  assert.equal(card?.brief, 'A tool for sites. It builds them nightly.');
  assert.equal(card?.href, 'https://brain.dog');
  assert.equal(card?.hue, null);
});

test('only a projects row is a project card', () => {
  assert.equal(projectCard({ spoken: 'people#2', fields: { name: 'Sam' } }), null);
  assert.equal(projectCard({ spoken: 'projects#4', fields: {} }), null);
});

test('a zero-decimal currency is not divided', () => {
  assert.equal(moneyLine(5000, 'JPY'), 'JPY 5,000');
});

test('a decision card leads with the suggested option as the primary one', () => {
  const card = decisionCard({
    rows: [{ spoken: 'SG12', question: 'Ship Friday?', status: 'open', suggested: 'wait', options: [{ id: 'go', label: 'Ship', because: 'Fast' }, { id: 'wait', label: 'Wait', because: 'Safer' }] }],
  });
  assert.equal(card?.options[0]?.id, 'wait');
  assert.equal(card?.options[0]?.suggested, true);
  assert.equal(card?.options[1]?.suggested, false);
  assert.equal(card?.answerTool, null);
});

test('with no suggestion the first option leads', () => {
  const card = decisionCard({ rows: [{ spoken: 'SG1', question: 'Which?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] });
  assert.equal(card?.options[0]?.suggested, true);
});

test('a resolved question, or a page of several, draws no card', () => {
  assert.equal(decisionCard({ rows: [{ question: 'Done?', status: 'resolved' }] }), null);
  assert.equal(decisionCard({ rows: [{ question: 'A' }, { question: 'B' }] }), null);
});

test('governance draws a card only when asked for one question by id', () => {
  const rows = { rows: [{ question: 'Ship?', options: [] }] };
  assert.equal(cardOf('governance', {}, rows), null);
  assert.equal(cardOf('governance', { id: 'SG1' }, rows)?.kind, 'decision');
  assert.equal(cardOf('list', {}, rows), null);
});

test('each tool names its card for both conventions', () => {
  const meta = cardMeta('project') as { ui: { resourceUri: string }; 'openai/outputTemplate': string };
  assert.equal(meta.ui.resourceUri, 'ui://braindog/project.html');
  assert.equal(meta['openai/outputTemplate'], 'ui://braindog/project.skybridge.html');
  assert.equal(cardResource('ui://braindog/decision.html')?.mimeType, 'text/html;profile=mcp-app');
  assert.equal(cardResource('ui://braindog/decision.skybridge.html')?.mimeType, 'text/html+skybridge');
});

test('the page is self-contained, answers on a press only, and carries no fetched file', () => {
  for (const kind of ['project', 'decision', 'rule'] as const) {
    const html = cardHtml(kind);
    assert.ok(html.includes('prefers-color-scheme:dark'));
    assert.ok(html.includes('window.openai'));
    assert.ok(html.includes('ui/notifications/tool-result'));
    assert.ok(!/<link |src=|@import|https?:\/\/fonts/.test(html));
    assert.ok(!html.includes('—'));
  }
});

test('a rule proposal draws a rule card: what it would do, what it was tried against, and the decision buttons', () => {
  const rows = {
    rows: [
      {
        id: 'SG7',
        question: 'File invoices by sender?',
        status: 'open',
        body_kind: 'change',
        body: { to: { kind: 'rule', id: 'rule.invoices', body: { name: 'Invoices', about: 'Files an emailed invoice in Money. It reads the sender.' } } },
        dry_run: { matches: 12, won: 9 },
        options: [{ id: 'yes', label: 'Turn it on' }, { id: 'no', label: 'Leave it' }],
      },
    ],
  };
  const card = ruleCard(rows, 'https://brain.dog', 'mara');
  assert.equal(card?.does, 'Files an emailed invoice in Money.');
  assert.equal(card?.tried, 'Tried against a sample: 12 matched, and it would take 9 of them.');
  assert.equal(card?.options[0]?.suggested, true);
  assert.equal(card?.answerTool, null);
  assert.equal(card?.href, 'https://brain.dog/mara');
  assert.equal(cardOf('governance', { id: 'SG7' }, rows)?.kind, 'rule');
});

test('a pattern proposal is a rule, and an options question is not', () => {
  const pattern = { rows: [{ id: 'SG8', question: 'Read these emails as invoices?', body_kind: 'pattern', body: { ingest: { id: 'ingest.x', kind: 'ingest', body: {} }, samples: ['a', 'b'] } }] };
  const card = ruleCard(pattern);
  assert.equal(card?.does, 'Read these emails as invoices?');
  assert.equal(card?.tried, 'Tried against 2 sample arrivals.');
  assert.equal(ruleCard({ rows: [{ question: 'Ship?', body_kind: 'options', body: { options: [] } }] }), null);
  assert.equal(ruleCard({ rows: [{ question: 'A', body_kind: 'pattern', body: {} }, { question: 'B' }] }), null);
});

test('the rule card has its own addresses for both conventions', () => {
  assert.equal(cardResource('ui://braindog/rule.html')?.mimeType, 'text/html;profile=mcp-app');
  assert.equal(cardResource('ui://braindog/rule.skybridge.html')?.mimeType, 'text/html+skybridge');
});
