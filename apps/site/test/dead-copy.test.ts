/**
 * Every sentence the site types is read by something that draws a page (batch 103b).
 *
 *   node --test apps/site/test/dead-copy.test.ts
 *
 * `tools/gates/dead-copy.mjs` READS apps/web ONLY, so a sentence the site stopped drawing stayed in `copy/`, shipped
 * nowhere and still read as a feature to anyone reviewing the file. Batch 103 replaced the old Slash and pricing
 * pages and left their words behind. This test walks `site` to its leaves (a string, a figure, a function or a whole
 * array) and asks that each one be read under `src`, outside `copy/` and the tests.
 *
 * WHAT COUNTS AS A READ: a chain from the area object (or `site`, or the local name an import gave either) down to the
 * leaf; or a chain that stops at a key with `[` after it, which reads everything under it; or a chain that hands a
 * whole object on, as `home.plans` given to a component, when the leaf's own name is then written somewhere that reads.
 *
 * A HELD PAGE KEEPS ITS WORDS, named below with the address `launch.ts` holds. It answers 404 today and comes back on
 * a flag, so its sentences wait for it rather than going.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { site } from '../src/lib/copy.ts';
import { HELD } from '../src/lib/launch.ts';

const SRC = new URL('../src/', import.meta.url);

/** Words kept for a held page: the top of the path each one hangs from, and the held address it waits for. */
const HELD_WORDS = new Map<string, (typeof HELD)[number]>([
  ['changelog', '/changelog'],
  ['meta.changelog', '/changelog'],
  ['packs', '/plugins'],
  ['meta.packs', '/plugins'],
]);

/** The area files `copy.ts` spreads into `site`, by the name each exports. */
const AREAS = ['shell', 'home', 'cases', 'pricing', 'agents', 'packs', 'forPages', 'trust', 'changelog'];

/** Every file that could draw a page: under `src`, not a copy file and not a test. Comments are blanked. */
const readers = (): { file: string; text: string }[] =>
  (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.(ts|svelte|js)$/.test(f) && !/\.test\.ts$/.test(f) && !/^lib[\\/]copy([\\/]|\.ts$)/.test(f))
    .map((file) => ({
      file,
      text: readFileSync(new URL(file, SRC), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1'),
    }));

/** The local names a file gives `site` and the area objects, from its imports of `copy.ts` and `copy/*.ts`. */
const rootsOf = (text: string): string[] => {
  const out: string[] = [];
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*copy(?:\.ts)?|[^'"]*copy\/[a-z]+(?:\.ts)?)['"]/g))
    for (const named of (m[1] ?? '').split(',')) {
      const [name = '', local = name] = named.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      if (name === 'site' || AREAS.includes(name)) out.push(local.trim());
    }
  return out;
};

type Chain = { path: string[]; open: boolean };

const ID = String.raw`[A-Za-z_$][\w$]*`;
const quote = (name: string) => name.replace(/\$/g, '\\$');

/** The static keys of one chain's text (`.a?.b['c'][d]`), and `open` when a `[` the walk cannot read follows them. */
const keysOf = (steps: string): Chain => {
  const path: string[] = [];
  for (const step of steps.matchAll(/\??\.([A-Za-z_$][\w$]*)|\[\s*(?:'([^']*)'|"([^"]*)"|([^\]]*))\s*\]/g)) {
    const key = step[1] ?? step[2] ?? step[3];
    if (key === undefined) return { path, open: true };
    path.push(key);
  }
  return { path, open: false };
};

/**
 * Every access chain from one of `roots`, by its static keys. A name bound to part of one (`const w = cases.drawn`)
 * is a root too, at that part, and a destructure (`const { hero, plans } = home`) reads each name it takes.
 */
const chainsOf = (text: string, roots: string[]): Chain[] => {
  const out: Chain[] = [];
  const queue = roots.map((name) => ({ name, at: [] as string[] }));
  for (let next = queue.shift(); next; next = queue.shift()) {
    const { name, at } = next;
    const chain = String.raw`(?<![\w$.])${quote(name)}((?:\??\.${ID}|\[[^\]]*\])*)`;
    for (const m of text.matchAll(new RegExp(chain, 'g'))) {
      const { path, open } = keysOf(m[1] ?? '');
      if (path.length > 0 || open) out.push({ path: [...at, ...path], open });
    }
    for (const m of text.matchAll(new RegExp(String.raw`(?:const|let|var)\s+(${ID})\s*=\s*${chain}\s*[;\n]`, 'g')))
      if (m[1] && m[1] !== name) queue.push({ name: m[1], at: [...at, ...keysOf(m[2] ?? '').path] });
    for (const m of text.matchAll(new RegExp(String.raw`(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${chain}\s*[;\n]`, 'g')))
      for (const taken of (m[1] ?? '').split(',')) {
        const key = taken.trim().split(/\s*[:=]/)[0];
        if (key) out.push({ path: [...at, ...keysOf(m[2] ?? '').path, key], open: false });
      }
  }
  return out;
};

/** Every leaf of `value` as its path of keys: an object is walked, anything else (an array too) is one leaf. */
const leaves = (value: unknown, path: string[] = []): string[][] =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]))
    : [path];

const startsWith = (path: string[], prefix: string[]) => prefix.every((k, i) => path[i] === k);

/** The leaves of `site` nothing under `src` reads, each as its dotted path. */
const deadLeaves = (): string[] => {
  const files = readers();
  const chains = files.flatMap(({ text }) => chainsOf(text, rootsOf(text)));
  const all = files.map(({ text }) => text).join('\n');
  return leaves(site)
    .filter((leaf) => {
      for (const { path, open } of chains) {
        /* A chain that goes on past the leaf calls something on it (`home.hero.title.split(...)`), so it has read it. */
        if (path.length > leaf.length && startsWith(path, leaf)) return false;
        if (!startsWith(leaf, path) || path.length === 0) continue;
        if (path.length === leaf.length || open) return false;
        const key = quote(leaf[path.length] ?? '');
        if (new RegExp(String.raw`\??\.${key}(?![\w$])|\[\s*['"]${key}['"]\s*\]|\{[^}]*(?<![\w$])${key}(?![\w$])[^}]*\}\s*=`).test(all)) return false;
      }
      return true;
    })
    .map((leaf) => leaf.join('.'));
};

const heldFor = (leaf: string) => [...HELD_WORDS.keys()].find((top) => leaf === top || leaf.startsWith(`${top}.`));

test('every leaf of the site copy is read by something under src, or waits for a held page', () => {
  const dead = deadLeaves().filter((leaf) => heldFor(leaf) === undefined);
  assert.deepEqual(dead, [], `typed in copy/ and drawn nowhere:\n${dead.join('\n')}`);
});

test('each held page named here is still held, so its words are not kept for a page that is back', () => {
  for (const [top, page] of HELD_WORDS) assert.ok((HELD as readonly string[]).includes(page), `${top} waits for ${page}, which is no longer held`);
});

test('the walk finds leaves and reads chains, so a green result is not a walk that saw nothing', () => {
  assert.ok(leaves(site).length > 100, 'the walk found almost nothing in site');
  assert.deepEqual(chainsOf("x = home.plans.title; y = shell.nav[key]; z = s['meta'].home", ['home', 'shell', 's']), [
    { path: ['plans', 'title'], open: false },
    { path: ['nav'], open: true },
    { path: ['meta', 'home'], open: false },
  ]);
});
