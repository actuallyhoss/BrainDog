/**
 * The glyph set is data copied in from Lucide by hand, so everything this file checks is something the
 * copying could have got wrong without any type error saying so.
 *
 * THE ONE THAT WAS MEASURED, NOT GUESSED, is the box. Lucide draws a glyph as several elements, and this
 * set stores it as one `d` string so a renderer draws one `<path>`. Joining them naively breaks any
 * element whose own `d` opens with a lower-case `m`: first in its own `<path>` that `m` is absolute, but
 * after another element it is relative to wherever that element ended. A build that joined them as they
 * came put 48 of the 251 glyphs partly off the 24 box (`x`, `sun`, `pencil`, and `list-todo`, the first
 * glyph Work asks for), and every one of them still parsed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CORE } from './core.ts';
import { SET } from './set.ts';
import { ALIASES, SHELL, canonical } from './aliases.ts';

const ALL: Record<string, string> = { ...CORE, ...SET };

/* ── a path reader, strict enough to say where a path is wrong ─────────────── */

const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Every command with its numbers, or a thrown error naming the offset. Arc flags are read one
    character at a time, because `a1 1 0 011 1` is legal SVG and a number regex reads `011` as eleven. */
function parse(d: string): { cmd: string; args: number[]; repeat: boolean }[] {
  const out: { cmd: string; args: number[]; repeat: boolean }[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number => {
    skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error(`expected a number at ${i} in "${d}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): number => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1') throw new Error(`expected an arc flag at ${i} in "${d}"`);
    i++;
    return Number(c);
  };
  skip();
  while (i < d.length) {
    const cmd = d[i]!;
    const arity = ARITY[cmd.toLowerCase()];
    if (arity === undefined) throw new Error(`unknown command "${cmd}" at ${i} in "${d}"`);
    i++;
    if (arity === 0) {
      out.push({ cmd, args: [], repeat: false });
      skip();
      continue;
    }
    /* A command repeats while numbers follow it, so `M3 17 2 2` is a move and a line. */
    let repeat = false;
    do {
      const args: number[] = [];
      for (let k = 0; k < arity; k++) args.push(cmd.toLowerCase() === 'a' && (k === 3 || k === 4) ? flag() : number());
      out.push({ cmd, args, repeat });
      repeat = true;
      skip();
    } while (i < d.length && /[-+.\d]/.test(d[i]!));
  }
  return out;
}

/** Every absolute point the path names: ends, control points and arc ends. An arc can bulge past its
    end points, so this is a floor on the bounds rather than the bounds. It is enough for what it is here
    to catch, which is a whole element displaced; a radius check was tried and dropped, because Lucide's
    own `globe` draws its meridians with arcs of radius 14.5 that stay well inside the box. */
function points(d: string): [number, number][] {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let first = true;
  for (const { cmd, args, repeat } of parse(d)) {
    const rel = cmd === cmd.toLowerCase() && !(first && cmd === 'm');
    const c = cmd.toLowerCase();
    /* A move's second and later pairs are lines, and keep the move's case: absolute after `M`,
       relative after `m`. Only the first pair starts a subpath `z` returns to. */
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (c === 'z') {
      x = sx;
      y = sy;
    } else if (c === 'h') {
      x = (rel ? x : 0) + args[0]!;
    } else if (c === 'v') {
      y = (rel ? y : 0) + args[0]!;
    } else if (c === 'a') {
      x = ox + args[5]!;
      y = oy + args[6]!;
    } else {
      for (let k = 0; k < args.length; k += 2) pts.push([ox + args[k]!, oy + args[k + 1]!]);
      x = ox + args[args.length - 2]!;
      y = oy + args[args.length - 1]!;
      if (c === 'm' && !repeat) {
        sx = x;
        sy = y;
      }
    }
    pts.push([x, y]);
    first = false;
  }
  return pts;
}

/* ── the data ─────────────────────────────────────────────────────────────── */

test('EVERY PATH PARSES, and opens with an absolute move', () => {
  for (const [name, d] of Object.entries(ALL)) {
    assert.doesNotThrow(() => parse(d), name);
    assert.equal(d[0], 'M', `${name} opens with "${d[0]}"`);
  }
});

test('EVERY GLYPH SITS IN ONE 24 BOX', () => {
  /* Half a unit of grace, because a round cap at the edge is drawn past it anyway and Lucide puts a
     handful of end points on 0 and 24 exactly. */
  const off: string[] = [];
  for (const [name, d] of Object.entries(ALL)) {
    for (const [x, y] of points(d)) {
      if (x < -0.5 || x > 24.5 || y < -0.5 || y > 24.5) {
        off.push(`${name} (${x}, ${y})`);
        break;
      }
    }
  }
  assert.deepEqual(off, []);
});

test('NO FILLS: a filled Lucide dot becomes a zero-length stroke, the way `icons.ts` draws one', () => {
  /* `tag` is one of the two glyphs here that Lucide draws with a `fill="currentColor"` circle. Kept as
     a circle it would draw a ring under a stroke-only renderer, which is a different glyph. */
  assert.match(ALL['tag']!, /M7\.5 7\.5h\.01/);
  for (const [name, d] of Object.entries(ALL)) assert.doesNotMatch(d, /fill/i, name);
});

test('NO NAME IS IN BOTH HALVES', () => {
  const both = Object.keys(CORE).filter((n) => Object.hasOwn(SET, n));
  assert.deepEqual(both, []);
});

test('ABOUT 240 GLYPHS, and every one Work asks for first', () => {
  const n = Object.keys(ALL).length;
  assert.ok(n >= 230 && n <= 260, `${n} glyphs`);
  const work = 'list-todo kanban flag milestone target calendar-days calendar-check hourglass timer repeat bot circle-check circle-dot pause ban';
  for (const name of work.split(' ')) assert.ok(Object.hasOwn(ALL, name), name);
});

/* ── the names ────────────────────────────────────────────────────────────── */

/** The names `apps/web/src/lib/ui/icons.ts` holds today, read from the file and not typed out here, so a
    name added there and forgotten here goes red. Read as text because this package may not import the app. */
function todaysNames(): string[] {
  const src = readFileSync(new URL('../../../../apps/web/src/lib/ui/icons.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export const PATHS'), src.indexOf('} as const'));
  return [...body.matchAll(/^\s+([A-Za-z]+):\s*'/gm)].map((m) => m[1]!);
}

test('EVERY NAME IN icons.ts RESOLVES, and to a glyph in the core, so the shell never waits on the set', () => {
  const names = todaysNames();
  assert.ok(names.length >= 60, `read only ${names.length} names from icons.ts`);
  const missing = names.filter((n) => !Object.hasOwn(CORE, canonical(n)));
  assert.deepEqual(missing, []);
});

test('THE CORE IS WHAT THE SHELL DRAWS AND NOTHING MORE', () => {
  /* The core is the entry chunk's share of the set. A glyph in it that no shell name reaches is weight
     every page pays for and none draws. */
  const reached = new Set(todaysNames().map(canonical));
  assert.deepEqual(Object.keys(CORE).filter((n) => !reached.has(n)), []);
});

test('THE THREE ALIASES THE PLAN NAMES', () => {
  assert.equal(canonical('obligation'), 'receipt');
  assert.equal(canonical('thing'), 'box');
  assert.equal(canonical('session'), 'bot');
});

test('NO ALIAS SHADOWS A GLYPH, and every alias lands on one', () => {
  /* An alias named like a real glyph would give one name two drawings, depending on which table a
     reader looked in first. */
  for (const [from, to] of Object.entries(ALIASES)) {
    assert.ok(!Object.hasOwn(ALL, from), `${from} is both an alias and a glyph`);
    assert.ok(Object.hasOwn(ALL, to), `${from} points at ${to}, which is not in the set`);
  }
  for (const to of Object.values(SHELL)) assert.ok(Object.hasOwn(CORE, to), `${to} is a shell name outside the core`);
});

test('A NAME WITH NO ALIAS COMES BACK AS ITSELF, including one nobody drew', () => {
  assert.equal(canonical('list-todo'), 'list-todo');
  assert.equal(canonical('no-such-glyph'), 'no-such-glyph');
  /* `constructor` is on every object's prototype; a lookup that did not use `hasOwn` would return a
     function here. */
  assert.equal(canonical('constructor'), 'constructor');
});

/* ── the split ────────────────────────────────────────────────────────────── */

test('THE ENTRY REACHES THE SET ONLY THROUGH loadSet', async () => {
  /* A value import of `set.ts` anywhere the entry reaches would put all of it in the shell's chunk and
     change no type. Only the type-only import may name it. */
  for (const file of ['./index.ts', './aliases.ts', './core.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const value = [...src.matchAll(/^(?:import|export)(?! type)[^;]*from '\.\/set\.ts'/gm)];
    assert.deepEqual(value.map((m) => m[0]), [], file);
  }
  const { loadSet } = await import('./index.ts');
  assert.equal((await loadSet())['list-todo'], SET['list-todo']);
});

/* ── the credit ───────────────────────────────────────────────────────────── */

test('THE NOTICE CARRIES LUCIDE\'S LICENCE, AND BOTH DATA FILES SAY WHERE THEIR PATHS CAME FROM', () => {
  const notice = readFileSync(new URL('./NOTICE', import.meta.url), 'utf8');
  assert.match(notice, /ISC License/);
  assert.match(notice, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
  assert.match(notice, /Permission to use, copy, modify, and\/or distribute this software/);
  /* Lucide's own licence carries Feather's MIT notice for the glyphs it inherited, and several of them
     are here (`check`, `x`, `search`), so the notice has to travel with them. */
  assert.match(notice, /Copyright \(c\) 2013-present Cole Bemis/);
  for (const file of ['./core.ts', './set.ts']) {
    const head = readFileSync(new URL(file, import.meta.url), 'utf8').slice(0, 1200);
    assert.match(head, /Path data from Lucide, ISC License/, file);
  }
});
