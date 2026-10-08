/**
 * A late card's ring still says how far it got (audit 34, finding 1).
 *
 * The arc's share is the fill circle's `stroke-dasharray="N 100"` ATTRIBUTE. A stylesheet rule beats a presentation
 * attribute, so a `stroke-dasharray` rule on `.cards-ring-fill` drew every late card as a full broken circle whatever
 * its share. Late is marked by breaking the track instead, and by the card's glyph, never by the fill's dash.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parse } from './parse.ts';
import { toHTML } from './html.ts';

const CSS = readFileSync(new URL('../../skin/kinds/cards.css', import.meta.url), 'utf8');

/** Every innermost rule of the sheet as its selector and its declarations, comments gone, so a nested layer or media
    block still yields its own rules. */
const rules = (css: string): { selector: string; body: string }[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));

const dashes = (body: string): boolean => /(^|[;\s])stroke-dasharray\s*:/u.test(body);

test('a late card keeps its share: its ring fill carries "40 100", as an on-plan card does', () => {
  const html = toHTML(parse('```cards\ntitle | ring: Done\nKiln | 2/5 | bad\nSite | 3/5\n```', { page: true }));
  const late = /<li class="cards-item" data-intent="bad"[^>]*>([\s\S]*?)<\/li>/u.exec(html)?.[1];
  assert.ok(late, 'the late card is drawn with its intent');
  assert.match(late, /<circle class="cards-ring-fill"[^>]* stroke-dasharray="40 100"/u, 'the late arc is its share');
  assert.match(late, /<span class="glyph" role="img" aria-label="[^"]+">/u, 'late carries a mark, never the colour alone');
  assert.match(html, /<li class="cards-item">[\s\S]*?stroke-dasharray="60 100"/u, 'the card on plan is unchanged');
});

test('no rule in cards.css sets stroke-dasharray on the ring fill, so nothing beats the share', () => {
  const found = rules(CSS);
  assert.ok(found.some((r) => r.selector.includes('.cards-ring-fill')), 'the sheet was read and has its ring rules');
  const beaten = found.filter((r) => r.selector.includes('.cards-ring-fill') && dashes(r.body)).map((r) => r.selector);
  assert.deepEqual(beaten, [], 'a dash rule on the fill hides the share');
});

test('late breaks the track, the part of the ring still to go', () => {
  const track = rules(CSS).filter((r) => /data-intent='bad'\]\s+\.cards-ring-track/u.test(r.selector));
  assert.ok(
    track.some((r) => dashes(r.body)),
    'a late ring is told apart by a mark as well as its red',
  );
});
