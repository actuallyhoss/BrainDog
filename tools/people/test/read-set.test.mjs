/**
 * The forty sentences of `sets/read-set.json`, each read the way the first screen reads it (the rules in
 * `apps/web/src/lib/start/propose.ts`, then the one question of `start/question.ts`), and held to the reading written
 * beside it.
 *
 * A SENTENCE MARKED `until` names the unit that makes it true. It may read wrong until then, and its line says what it
 * read. Once it reads right while still marked, this goes red, so the mark is lifted the day the unit lands and the
 * sentence guards it from then on. One with no mark that reads wrong is red at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { propose } from '../../../apps/web/src/lib/start/propose.ts';
import { answer, oneQuestion } from '../../../apps/web/src/lib/start/question.ts';

const SET = JSON.parse(readFileSync(new URL('../sets/read-set.json', import.meta.url), 'utf8'));
const TRAPS = ['a country and no currency', '"pounds" alone', '"$40"', 'an instruction inside the answer', 'a name in lower case', 'an answer in Arabic'];

/** What the rules read: the use case, the modules, the name, the currency, and the one question due as typed. */
export function readOf(entry, ctx = SET.ctx) {
  let p = propose(entry.said, ctx);
  const asked = oneQuestion(p, entry.said);
  if (entry.answer) p = answer(p, entry.answer.about, entry.answer.value, entry.said);
  return { usecase: p.usecase ?? 'none', modules: [...p.modules].sort(), name: p.name, currency: p.currency, question: asked?.about ?? null };
}

/** Where the reading differs from the one written, one phrase each; empty when it reads right. */
export function differs(want, got) {
  const out = [];
  for (const key of ['usecase', 'name', 'currency', 'question']) if (want[key] !== got[key]) out.push(`${key} ${JSON.stringify(got[key])}, not ${JSON.stringify(want[key])}`);
  if (want.modules !== undefined && JSON.stringify([...want.modules].sort()) !== JSON.stringify(got.modules)) out.push(`modules ${got.modules.join(', ') || 'none'}, not ${want.modules.join(', ') || 'none'}`);
  return out;
}

test('forty sentences, six of them the traps the brief names', () => {
  assert.equal(SET.sentences.length, 40);
  assert.deepEqual(SET.sentences.filter((s) => s.trap).map((s) => s.trap).sort(), [...TRAPS].sort());
  for (const s of SET.sentences) {
    assert.equal(typeof s.said, 'string', JSON.stringify(s));
    for (const key of ['usecase', 'name', 'currency', 'question']) assert.ok(key in s.reads, `"${s.said}" has no reading for ${key}`);
    if (s.until !== undefined) assert.match(s.until, /^USE-[AB]\d\d$/u, `"${s.said}" waits on "${s.until}", not a unit`);
    if (s.answer !== undefined) assert.equal(s.answer.about, s.reads.question, `"${s.said}" answers a question it is not asked`);
  }
});

test('each person file has its plain and hard sentence in the set', () => {
  const said = new Set(SET.sentences.map((s) => s.said));
  for (const id of ['layla', 'omar', 'sam', 'nour', 'mona', 'yara', 'salma']) {
    const p = JSON.parse(readFileSync(new URL(`../${id}.json`, import.meta.url), 'utf8'));
    assert.ok(said.has(p.says.plain), `${p.name}'s plain sentence is not in the set`);
    assert.ok(said.has(p.says.hard), `${p.name}'s hard sentence is not in the set`);
    assert.equal(p.said, p.says.plain, `${p.name}'s said is not her plain sentence`);
    /* The brief's fields check-files does not hold yet (its line is in this unit's blocked): refused here meanwhile. */
    assert.match(p.expects ?? '', /^([a-z][a-z-]*|none)$/u, `${p.name}'s expects is not a use case or none`);
    assert.equal(p.standing, !['yara', 'salma'].includes(id), `${p.name}'s standing is wrong`);
    assert.equal(p.answers?.name, p.name, `${p.name}'s answers carry no name`);
    assert.match(p.answers?.currency ?? '', /^[A-Z]{3}$/u, `${p.name}'s answers carry no currency`);
    assert.equal(typeof p.file?.text === 'string', ['omar', 'nour'].includes(id), `${p.name}'s file is wrong`);
  }
});

for (const [i, s] of SET.sentences.entries()) {
  const label = `${String(i + 1).padStart(2, '0')}${s.trap ? ` (trap: ${s.trap})` : ''}${s.until ? ` [until ${s.until}]` : ''}: ${s.said}`;
  test(label, (t) => {
    const wrong = differs(s.reads, readOf(s));
    if (s.until === undefined) {
      assert.deepEqual(wrong, [], `reads ${wrong.join('; ')}`);
      return;
    }
    assert.ok(wrong.length > 0, `reads right while marked until ${s.until}: lift the mark`);
    t.diagnostic(`waits on ${s.until}: ${wrong.join('; ')}`);
  });
}
