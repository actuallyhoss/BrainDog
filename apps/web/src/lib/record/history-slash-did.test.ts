/**
 * What Slash did without asking, on a row's history (ENG-B15): the same sentence Activity says, made by the same
 * function, so a change the ladder let land reads "Slash did this without asking" and its undo "Slash did · Mara undid".
 * Names are invented here, inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { linesOf, settlingOf, slashDidBy, slashDidSaid, type Event, type Say, type Suggested } from './history-live.ts';
import { cardWords } from '../decide/card.ts';
import { slashDidOf } from '../../routes/audit/lines.ts';

const MARA = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
const SAY: Say = { me: null, names: new Map([[MARA, 'Mara']]), words: cardWords };
const LADDER = 'rule:ladder';

const ev = (at: string, e: Partial<Event> & Suggested): Event & Suggested => ({ ts: at, actor: MARA, kind: 'update', field: 'state', from: 'open', to: 'done', ...e });

test('A ROW SLASH CHANGED WITH NO QUESTION SAYS SO, and its undo says who undid it', () => {
  const events = [
    ev('2026-10-01T09:00:00.000Z', { kind: 'create', field: null, from: null, to: null }),
    ev('2026-10-02T09:00:00.000Z', { actor: LADDER, suggested_by: 'slash', settled_by: LADDER }),
    ev('2026-10-03T09:00:00.000Z', { from: 'done', to: 'open', suggested_by: 'slash', settled_by: MARA, undone: true, answered_by: LADDER }),
  ];
  const [undone, landed, made] = linesOf('services', events, SAY);
  assert.equal(landed!.settled, 'Slash did this without asking');
  assert.equal(undone!.settled, 'Slash did · Mara undid');
  assert.equal(made!.settled, undefined, 'a person’s own change reads as it did');
});

test('KEPT BY MARA, AND THE SAME SENTENCE ACTIVITY SAYS', () => {
  const kept = ev('2026-10-02T09:00:00.000Z', { actor: LADDER, suggested_by: 'slash', settled_by: LADDER, kept_by: MARA });
  assert.equal(linesOf('services', [kept], SAY)[0]!.settled, 'Slash did · Mara kept');
  for (const e of [kept, ev('2026-10-02T09:00:00.000Z', { actor: LADDER, suggested_by: 'slash', settled_by: LADDER })])
    assert.equal(slashDidBy(e, SAY), slashDidOf({ settling: settlingOf(e) }, null, SAY.names));
});

test('A SUGGESTION SOMEBODY PRESSED STILL READS "Slash suggested · Mara accepted", and undoing it as before', () => {
  const pressed = ev('2026-10-02T09:00:00.000Z', { actor: 'rule:tidy', suggested_by: 'slash', settled_by: MARA });
  const back = ev('2026-10-03T09:00:00.000Z', { suggested_by: 'slash', settled_by: MARA, undone: true });
  const [b, p] = linesOf('services', [pressed, back], SAY);
  assert.equal(p!.settled, 'Slash suggested · Mara accepted');
  assert.equal(b!.settled, 'Slash suggested · Mara undid');
  assert.equal(slashDidBy(pressed, SAY), null);
  /* WITHOUT THE NAMES TO SAY IT WITH, every line is the line it was. */
  assert.equal(linesOf('services', [pressed], undefined)[0]!.settled, undefined);
});

test('ONLY SLASH: an agent’s change its rung let land is not said as Slash’s', () => {
  const s = settlingOf({ actor: LADDER, kind: 'update', to: null, suggested_by: 'agent:claude', settled_by: LADDER });
  assert.equal(slashDidSaid(s!, () => 'Mara', cardWords), null);
});
