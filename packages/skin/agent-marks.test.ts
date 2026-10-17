/**
 * The agents' marks, held to what the two apps count on.
 *
 * ONE PATH ON A 24 GRID. Both apps draw a mark as a single `<path>` in a `0 0 24 24` box, so a mark with a second
 * subpath outside the box, or a number off the grid, is drawn cut off. Every command is walked and every point it
 * lands on is inside the box.
 *
 * THE IDS ARE THE APP'S OWN NAMES FOR ITS AGENTS. The app tells a named agent from the rest by the list in its
 * `face.ts`, and a run signs in with one of the words the host's header grammar takes. A mark under any other id is a
 * mark nothing ever draws, and an agent in those lists with no mark falls back to a glyph without anybody saying so.
 *
 * `isMarked` AND `markedOf` AGREE: what one calls marked the other names as itself, and every other word `markedOf`
 * answers with is an id that has a mark.
 *
 * THE APPS' MARKS (ChatGPT, VS Code) are drawn on the same grid, under ids no agent has, and `markOf` answers both sets.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENT_MARKS, APP_MARKS, isMarked, markOf, markedOf, type AppMark, type MarkedAgent } from './agent-marks.ts';

const ids = Object.keys(AGENT_MARKS) as MarkedAgent[];
const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/** How many numbers each path command takes, and which of them are x and y on the grid. */
const ARITY: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** The numbers after a command. An arc's two flags are single digits that may run into what follows. */
const numbersOf = (cmd: string, body: string): number[] => {
  const out: number[] = [];
  const num = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/iy;
  let i = 0;
  while (i < body.length) {
    if (/[\s,]/u.test(body[i] ?? '')) { i += 1; continue; }
    const slot = out.length % 7;
    if (cmd === 'a' && (slot === 3 || slot === 4)) {
      assert.match(body[i] ?? '', /[01]/u, 'an arc flag is 0 or 1');
      out.push(Number(body[i]));
      i += 1;
      continue;
    }
    num.lastIndex = i;
    const m = num.exec(body);
    assert.ok(m, `a number at ${i} of "${body}"`);
    out.push(Number(m[0]));
    i = num.lastIndex;
  }
  return out;
};

/** Every point a path's commands land on, walking relative commands from where the pen is. */
const pointsOf = (d: string): Array<[number, number]> => {
  const points: Array<[number, number]> = [];
  let [x, y, startX, startY] = [0, 0, 0, 0];
  for (const [, letter = '', body = ''] of d.matchAll(/([a-z])([^a-z]*)/giu)) {
    const cmd = letter.toLowerCase();
    const rel = letter === cmd;
    const arity = ARITY[cmd];
    assert.ok(arity !== undefined, `"${letter}" is a path command`);
    const nums = numbersOf(cmd, body);
    if (arity === 0) {
      assert.equal(nums.length, 0, 'a close takes no numbers');
      [x, y] = [startX, startY];
      continue;
    }
    assert.ok(nums.length > 0 && nums.length % arity === 0, `"${letter}${body}" is whole sets of ${arity}`);
    for (let i = 0; i < nums.length; i += arity) {
      const [a = 0, b = 0] = nums.slice(i + arity - 2, i + arity);
      if (cmd === 'h') x = rel ? x + (nums[i] ?? 0) : (nums[i] ?? 0);
      else if (cmd === 'v') y = rel ? y + (nums[i] ?? 0) : (nums[i] ?? 0);
      else [x, y] = rel ? [x + a, y + b] : [a, b];
      if (cmd === 'm' && i === 0) [startX, startY] = [x, y];
      points.push([x, y]);
    }
  }
  return points;
};

test('every mark is one path on a 24 grid', () => {
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const { d, rule, tone, maker } = AGENT_MARKS[id];
    assert.match(d, /^M[\d\s.,a-z+-]+z$/iu, `${id}: one path, moved to and closed`);
    assert.ok(!/[<>"']/u.test(d), `${id}: path data and nothing else`);
    const points = pointsOf(d);
    assert.ok(points.length > 8, `${id}: a drawing, not a dot`);
    /* A hair of slack: a traced mark's rounding lands a point a few thousandths past the edge. */
    for (const [x, y] of points) {
      assert.ok(x >= -0.05 && x <= 24.05 && y >= -0.05 && y <= 24.05, `${id}: (${x.toFixed(3)}, ${y.toFixed(3)}) is on the grid`);
    }
    const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
    assert.ok(Math.max(...xs) - Math.min(...xs) > 16, `${id}: fills the box across`);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 12, `${id}: fills the box down`);
    assert.ok(rule === 'evenodd' || rule === 'nonzero', `${id}: a fill rule`);
    assert.ok(tone === 'ink' || tone === id, `${id}: ink, or its maker's own colour`);
    assert.ok(maker.trim().length > 0 && maker === maker.trim(), `${id}: its maker is named`);
  }
});

test("the ids are the app's own names for its agents", () => {
  const list = (text: string, what: string): string[] => {
    assert.ok(text, `${what} is where it was`);
    return [...text.matchAll(/[a-z]+/gu)].map((m) => m[0]);
  };
  const known = /const KNOWN = \[([^\]]+)\]/u.exec(source('../../apps/web/src/lib/ui/face.ts'))?.[1] ?? '';
  assert.deepEqual([...ids].sort(), list(known, "the app's list of named agents").sort());

  const grammar = /agent: \{[^}]*grammar: \/\^\(\?:([a-z|]+)\)\$\//u.exec(source('../host/src/session.ts'))?.[1] ?? '';
  const signs = list(grammar, "the host's agent header grammar").filter((word) => word !== 'other');
  assert.deepEqual([...ids].sort(), signs.sort());
});

test('isMarked and markedOf agree', () => {
  for (const id of ids) {
    assert.ok(isMarked(id));
    assert.equal(markedOf(id), id);
    assert.equal(markedOf(`  ${id.toUpperCase()} `), id, 'case and the space round a name do not matter');
    assert.equal(markedOf(`agent:${id}`), id, 'an agent signs as agent:<name>');
  }
  for (const word of ['', 'other', 'runner', 'slash', 'toString', 'constructor', '__proto__', 'a person']) {
    assert.equal(isMarked(word), false, `"${word}" has no mark`);
    assert.equal(markedOf(word), null, `"${word}" names no marked agent`);
  }
  for (const [word, id] of [['Claude Code', 'claude'], ['claude-code', 'claude'], ['Anthropic', 'claude'], ['codex-cli', 'codex'], ['OpenAI', 'codex'], ['GitHub Copilot', 'copilot']] as const) {
    assert.equal(isMarked(word), false, `"${word}" is another word for an agent, not an id`);
    const said = markedOf(word);
    assert.equal(said, id);
    assert.ok(said !== null && isMarked(said));
  }
});

/** The alias table a file declares, as its words and the agents they name. */
const aliasesIn = (path: string): Record<string, string> => {
  const body = /const ALIASES\b[^=]*=\s*\{([^}]*)\}/u.exec(source(path))?.[1] ?? '';
  return Object.fromEntries([...body.matchAll(/^\s*(?:'([^']+)'|([a-z][a-z0-9]*)):\s*'([a-z]+)',?\s*$/gmu)].map((m) => [m[1] ?? m[2], m[3]]));
};

test('the skin and the app know the same agents by the same other words', () => {
  const skin = aliasesIn('./agent-marks.ts');
  const app = aliasesIn('../../apps/web/src/lib/ui/face.ts');
  assert.ok(Object.keys(app).length > 0, 'face.ts declares its aliases');
  assert.deepEqual(Object.entries(skin).sort(), Object.entries(app).sort());
  for (const [word, kind] of Object.entries(app)) assert.equal(markedOf(word), kind, word);
});

const apps = Object.keys(APP_MARKS) as AppMark[];

test("every app's mark is one path on a 24 grid, in ink or its maker's colour", () => {
  assert.deepEqual([...apps].sort(), ['chatgpt', 'vscode']);
  for (const id of apps) {
    const { d, rule, maker } = APP_MARKS[id];
    assert.match(d, /^M[\d\s.,a-z+-]+z$/iu, `${id}: one path, moved to and closed`);
    assert.ok(!/[<>"']/u.test(d), `${id}: path data and nothing else`);
    const points = pointsOf(d);
    assert.ok(points.length > 8, `${id}: a drawing, not a dot`);
    for (const [x, y] of points) {
      assert.ok(x >= -0.05 && x <= 24.05 && y >= -0.05 && y <= 24.05, `${id}: (${x.toFixed(3)}, ${y.toFixed(3)}) is on the grid`);
    }
    const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
    assert.ok(Math.max(...xs) - Math.min(...xs) > 16, `${id}: fills the box across`);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 12, `${id}: fills the box down`);
    assert.ok(rule === 'evenodd' || rule === 'nonzero', `${id}: a fill rule`);
    assert.ok(maker.trim().length > 0 && maker === maker.trim(), `${id}: its maker is named`);
  }
  assert.deepEqual(
    { chatgpt: [APP_MARKS.chatgpt.tone, APP_MARKS.chatgpt.rule, APP_MARKS.chatgpt.maker], vscode: [APP_MARKS.vscode.tone, APP_MARKS.vscode.rule, APP_MARKS.vscode.maker] },
    { chatgpt: ['ink', 'evenodd', 'ChatGPT'], vscode: ['vscode', 'nonzero', 'VS Code'] },
  );
});

test("the apps' ids are no agent's, and markOf answers both sets", () => {
  for (const id of apps) {
    assert.ok(!Object.hasOwn(AGENT_MARKS, id), `${id} is not an agent's id`);
    assert.equal(isMarked(id), false, `${id} is not a marked agent`);
    assert.equal(markedOf(id), null, `${id} names no agent`);
    assert.equal(markOf(id), APP_MARKS[id]);
  }
  for (const id of ids) assert.equal(markOf(id), AGENT_MARKS[id]);
  assert.equal(markedOf('OpenAI'), 'codex', 'openai still names Codex, not ChatGPT');
});
