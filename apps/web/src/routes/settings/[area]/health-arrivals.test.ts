/**
 * Messages waiting to be filed open the messages (audit 25 October, Y6). The line above Settings said "Messages wait to be
 * filed. Look", and Look opened the Health page, which said the same line again. Where the reader can open what came in,
 * the link opens it; anybody else is taken to the signs as before.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { healthSaid, type Part, type Sign } from './health.ts';

const text = (parts: Part[] | null): string => (parts ?? []).map((p) => p.text).join('');
const WAITING: Sign = { sign: 'arrivals-filed', state: 'red', said: '3 messages have waited more than a day.' };
const PAGES: Sign = { sign: 'pages-clean', state: 'red', said: 'Two pages print something raw.' };

test('WAITING MESSAGES OPEN WHERE THEY WAIT, said with their count', () => {
  const parts = healthSaid(null, null, { signs: [WAITING, PAGES], signsAt: '/p/health', inboxAt: '/inbox' });
  assert.equal(text(parts), '3 messages have waited more than a day. Open them');
  assert.equal(parts?.find((p) => p.href)?.href, '/inbox');
});

test('WITHOUT A WAY TO THE MESSAGES, and for any other sign, the link is to the signs as before', () => {
  assert.equal(healthSaid(null, null, { signs: [WAITING], signsAt: '/p/health' })?.find((p) => p.href)?.href, '/p/health');
  assert.equal(healthSaid(null, null, { signs: [PAGES, WAITING], signsAt: '/p/health', inboxAt: '/inbox' })?.find((p) => p.href)?.href, '/p/health');
});
