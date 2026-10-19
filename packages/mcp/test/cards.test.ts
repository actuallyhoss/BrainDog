/**
 * The project and decision cards: what is drawn from a tool's answer, and that nothing is drawn from one that is not
 * a project or one open question. Pure, so no record is opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardHtml, cardMeta, cardOf, cardResource, decisionCard, moneyLine, projectCard } from '../src/cards.ts';

test('a projects row becomes a project card with its hue, brief, next step and one figure', () => {
  const card = projectCard(
    { spoken: 'projects#4', hue: 210, fields: { name: 'Nook', brief: 'Rooms for friends.', next: 'Ship the iOS build', budget: { amount: 120000, currency: 'GBP' }, working: 'Claude' } },
    'https://brain.dog/',
  );
  assert.deepEqual(card, {
    kind: 'project',
    name: 'Nook',
    hue: 210,
    brief: 'Rooms for friends.',
    next: 'Ship the iOS build',
    money: 'GBP 1,200',
    working: 'Claude',
    href: 'https://brain.dog/app',
  });
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
  for (const kind of ['project', 'decision'] as const) {
    const html = cardHtml(kind);
    assert.ok(html.includes('prefers-color-scheme:dark'));
    assert.ok(html.includes('window.openai'));
    assert.ok(html.includes('ui/notifications/tool-result'));
    assert.ok(!/<link |src=|@import|https?:\/\/fonts/.test(html));
    assert.ok(!html.includes('—'));
  }
});
