/**
 * WHO DECIDES A QUESTION: the line each reader meets, the members an owner may name, a hand the record takes
 * and one it refuses, and a question naming nobody drawn as it always was. Invented names only.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { deciderLine, hand, namer, whoCanDecide, WORDS, type Person, type Send } from './decider.ts';

const ADA = 'p_ada';
const BEN = 'p_ben';
const CY = 'p_cy';

const members: Person[] = [
  { person_id: CY, name: 'Cy Ober', email: 'cy@example.test', level: 'owner' },
  { person_id: BEN, name: 'Ben Arlow', email: 'ben@example.test', level: 'decide' },
  { person_id: ADA, name: 'Ada Quill', email: 'ada@example.test', level: 'decide' },
  { person_id: 'p_dee', name: 'Dee Marsh', email: 'dee@example.test', level: 'write' },
  { person_id: 'p_eli', name: 'Eli Stone', email: 'eli@example.test', level: 'decide', suspended_at: '2026-10-01T09:00:00Z' },
  { person_id: 'p_fay', name: null, email: 'fay.lune@example.test', level: 'decide' },
  { person_id: 'p_gus', name: null, email: null, level: 'owner' },
];
const nameOf = namer(members);

test('the decider reads "Yours to decide", everybody else her name, and nobody named draws nothing', () => {
  const q = { id: 'SG4', decider: ADA };
  assert.equal(deciderLine(q, ADA, nameOf), 'Yours to decide');
  assert.equal(deciderLine(q, BEN, nameOf), 'Ada Quill decides this');
  assert.equal(deciderLine(q, CY, nameOf), 'Ada Quill decides this');
  assert.equal(deciderLine({ id: 'SG4', decider: null }, ADA, nameOf), null);
  /* A RECORD OLDER THAN THE COLUMN sends no `decider` at all, and the question is drawn as today. */
  assert.equal(deciderLine({ id: 'SG4' }, ADA, nameOf), null);
});

test('a decider the reader cannot name is another member, never an id', () => {
  const line = deciderLine({ id: 'SG4', decider: 'p_zed' }, BEN, nameOf);
  assert.equal(line, `${WORDS.somebody} decides this`);
  assert.doesNotMatch(String(line), /p_zed/u);
});

test('names come from the members first, then from the names the record sent', () => {
  const said = namer([{ person_id: ADA, name: 'Ada Quill', email: null, level: 'decide' }], { [ADA]: 'ada', [BEN]: 'Ben Arlow' });
  assert.equal(said(ADA), 'Ada Quill');
  assert.equal(said(BEN), 'Ben Arlow');
  assert.equal(said(CY), null);
  assert.equal(namer([{ person_id: 'p_fay', name: ' ', email: 'fay.lune@example.test', level: 'decide' }])('p_fay'), 'Fay Lune');
});

test('the picker holds the owners and those who hold Decides, by name, the reader first', () => {
  const picks = whoCanDecide(members, CY);
  assert.deepEqual(
    picks.map((p) => p.name),
    ['Cy Ober', 'Ada Quill', 'Ben Arlow', 'Fay Lune'],
  );
  assert.equal(picks[0]?.you, true);
  assert.ok(picks.slice(1).every((p) => !p.you));
  /* Somebody at write cannot decide, a stopped member answers nothing, and a person with no name to say is not offered. */
  for (const left of ['p_dee', 'p_eli', 'p_gus']) assert.ok(!picks.some((p) => p.id === left), left);
  assert.deepEqual(
    whoCanDecide(members).map((p) => p.name),
    ['Ada Quill', 'Ben Arlow', 'Cy Ober', 'Fay Lune'],
  );
});

/** A record that answers one call, and keeps what it was asked. */
function recordThat(answer: Awaited<ReturnType<Send>>): { send: Send; asked: Parameters<Send>[0][] } {
  const asked: Parameters<Send>[0][] = [];
  return {
    asked,
    send: async (args) => {
      asked.push(args);
      return answer;
    },
  };
}

test('handing a question asks the record by its own method, and nobody leaves the person out', async () => {
  const to = recordThat({ ok: true, value: { id: 'SG4', decider: ADA } });
  assert.deepEqual(await hand('', 'SG4', ADA, undefined, to.send), { from: 'handed', decider: ADA });
  assert.deepEqual(to.asked, [{ id: 'SG4', to: ADA }]);

  const back = recordThat({ ok: true, value: { id: 'SG4', decider: null } });
  assert.deepEqual(await hand('', 'SG4', null, undefined, back.send), { from: 'handed', decider: null });
  assert.deepEqual(back.asked, [{ id: 'SG4' }]);

  /* A RECORD THAT ANSWERS NOTHING ABOUT WHO is taken at the word of what was asked. */
  const quiet = recordThat({ ok: true, value: {} });
  assert.deepEqual(await hand('', 'SG4', BEN, undefined, quiet.send), { from: 'handed', decider: BEN });
});

test('a refusal is kept in the record’s own words', async () => {
  const fix = 'Dee Marsh cannot decide here. Name somebody who can, or nobody.';
  const no = recordThat({ ok: false, refusal: { fix } });
  assert.deepEqual(await hand('', 'SG4', 'p_dee', undefined, no.send), { from: 'refused', fix });
  const moved = recordThat({ ok: false, conflict: {} });
  const out = await hand('', 'SG4', ADA, undefined, moved.send);
  assert.equal(out.from, 'refused');
  if (out.from === 'refused') assert.match(out.fix, /^Somebody changed this first\./u);
  /* A CLIENT WITHOUT THE METHOD YET is refused in a sentence, and nothing is sent. */
  let sent = 0;
  const io = (async () => {
    sent++;
    return new Response('{}');
  }) as never;
  const old = await hand('https://record.example.test', 'SG4', ADA, io);
  if (old.from === 'refused') assert.match(old.fix, /\S/u);
  if (old.from === 'refused' && /not in this build/u.test(old.fix)) assert.equal(sent, 0);
});

test('the part draws who decides in one line, its picker only for an owner, a refusal under it, 44px targets', () => {
  const svelte = readFileSync(fileURLToPath(new URL('./Decider.svelte', import.meta.url)), 'utf8');
  assert.match(svelte, /deciderLine\(/u);
  assert.match(svelte, /\{#if owns && \(open \|\| refused !== ''\)\}/u);
  assert.match(svelte, /whoCanDecide\(/u);
  assert.match(svelte, /role="alert"/u);
  assert.match(svelte, /min-height: 44px/u);
  assert.doesNotMatch(svelte, /box-shadow|border:\s*1px|gradient|—/u);
  /* FOLDED BEHIND THE "⋯" AT THE RIGHT OF THE TITLE, never a row of its own above the question (20 Oct walk). */
  const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
  assert.match(page, /actions=\{asking && me\.owner \? whoMore : undefined\}/u);
  /* `asking` IS STILL OPEN (a closed question has no more to ask either): nobody is handed the picker on a settled one. */
  assert.match(page, /const asking = \$derived\(!settled && !\(from === 'live' && live\?\.closed\)\);/u);
  assert.match(page, /bind:open=\{whoOpen\}/u);
});
