/**
 * THE CONNECT DOOR (`/agents`, `lib/connect/`): every app's way in is the one address, said in one plain line, drawn
 * whole in the HTML, and the page's words keep to docs/54-WRITING.md.
 *
 * The source checks run anywhere. The last one reads the served page, so it waits for a build that is newer than the
 * page (`built.ts`): a build older than the page is someone else's page, and reading it would test nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { markOf } from '@braindog/skin/agent-marks.ts';
import { CONNECT, CONNECT_WORDS, hintParts, hintText } from '../src/lib/connect/apps.ts';
import { agents } from '../src/lib/copy/agents.ts';
import { APP_NAMES, APPS_AND } from '../src/lib/agents.ts';
import { APP, CLI_INSTALL, MCP } from '../src/lib/links.ts';
import { BUILD, missing, when } from './built.ts';

registerHooks({
  load(url, context, next) {
    if (!url.endsWith('.svelte')) return next(url, context);
    const filename = fileURLToPath(url);
    const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
    return { format: 'module', source: js.code, shortCircuit: true };
  },
});

/* By URL, so the type checker, which reads no Svelte here, does not look for the file. */
const { default: ConnectBox } = (await import(new URL('../src/lib/connect/ConnectBox.svelte', import.meta.url).href)) as {
  default: Component<{ tone?: 'night' }>;
};

/* Spelled by code point, so this file holds none. */
const EM_DASH = String.fromCharCode(0x2014);

/** docs/54-WRITING.md's words that never reach prose a person reads. */
const NEVER = /\b(rows?|list items?|entity|entities|register|schema|slug|mcp|packs?|credentials?|snapshots?)\b/iu;

/** Every string under a value, in order. */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

/** The text a person reads in a page: tags, scripts, styles, and code in <pre> or <code> taken out. */
const prose = (html: string): string =>
  html
    .replace(/<(script|style|pre|code|noscript)\b[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&[a-z#0-9]+;/giu, ' ');

test('every app has its maker mark, the address in its code, and one plain line of hint', () => {
  assert.deepEqual(
    CONNECT.map((a) => a.name),
    APP_NAMES,
  );
  for (const app of CONNECT) {
    const mark = markOf(app.id);
    assert.ok(mark.d.length > 0, `${app.name} has no mark`);
    assert.equal(mark.maker, app.name, `${app.name} wears ${mark.maker}'s mark`);
    for (const way of app.ways) {
      assert.ok(way.code.trim() !== '', `${app.name}, ${way.where}: no code`);
      /* THE ADDRESS, OR THE COMMAND LINE'S SETUP AGAINST THE APP (Claude in a terminal, 29 October), which registers it. */
      assert.ok(way.code.includes(MCP) || way.code.includes(`braindog setup ${APP}/`), `${app.name}, ${way.where}: the code does not hold ${MCP}`);
      assert.ok(way.hint.trim() !== '' && !/\n/u.test(way.hint), `${app.name}, ${way.where}: the hint is not one line`);
      assert.ok(!way.hint.includes(EM_DASH) && !way.where.includes(EM_DASH), `${app.name}, ${way.where}: an em dash`);
      assert.equal(way.hint.split('`').length % 2, 1, `${app.name}, ${way.where}: a backtick opens code and never closes it`);
    }
  }
});

test("Claude's tab holds both ways in: the app's connector address and the command line's setup", () => {
  const claude = CONNECT.find((a) => a.id === 'claude');
  assert.ok(claude);
  assert.deepEqual(
    claude.ways.map((w) => w.code),
    [MCP, `${CLI_INSTALL}\nbraindog setup https://app.brain.dog/<your-record>`],
  );
  assert.ok(!strings({ CONNECT, agents }).some((s) => /claude code/iu.test(s)), "the site says 'Claude', never 'Claude Code'");
});

test('a hint keeps its code apart from its words', () => {
  assert.deepEqual(hintParts('Then run `codex mcp login braindog` once.'), [
    { text: 'Then run ', code: false },
    { text: 'codex mcp login braindog', code: true },
    { text: ' once.', code: false },
  ]);
  assert.equal(hintText('type `/mcp` here'), 'type /mcp here');
});

test("the page's words hold no em dash and no never-word outside code", () => {
  /* THE ROW FOR DEVELOPERS NAMES THE PROTOCOL ON PURPOSE (site 2b, 20 October): it is the one place on the page a
     developer is sent to, so its words are held to the em dash rule and not to the never-words. */
  const { dev, ...rest } = agents.agents;
  for (const s of strings(dev)) assert.ok(!s.includes(EM_DASH), `an em dash in "${s}"`);
  const words = [
    ...strings(rest),
    ...strings(CONNECT_WORDS),
    ...CONNECT.flatMap((a) => [a.name, ...a.ways.flatMap((w) => [...(w.file ? [] : [w.where]), ...hintParts(w.hint).filter((p) => !p.code).map((p) => p.text)])]),
  ];
  for (const s of words) {
    assert.ok(!s.includes(EM_DASH), `an em dash in "${s}"`);
    assert.doesNotMatch(s, NEVER, `a never-word in "${s}"`);
  }
  assert.equal(agents.agents.lead.startsWith(`${APPS_AND} can read your BrainDog`), true);
  assert.ok(!('address' in agents.agents.dev), 'the address is the box\'s alone, said once (plan F18)');
});

test('the box draws every app and every way in the HTML, so it reads with scripting off', () => {
  for (const props of [{}, { tone: 'night' as const }]) {
    const { body } = render(ConnectBox, { props });
    assert.equal((body.match(/role="tab"/gu) ?? []).length, CONNECT.length, 'a tab for each app');
    assert.equal((body.match(/role="tabpanel"/gu) ?? []).length, CONNECT.length, 'a panel for each app');
    assert.equal((body.match(/<pre\b/gu) ?? []).length, CONNECT.flatMap((a) => a.ways).length, 'a <pre> for each way in');
    for (const app of CONNECT) {
      assert.ok(body.includes(`>${app.name}</h2>`), `${app.name} is headed by its name`);
      const escaped = (code: string): string => code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      for (const way of app.ways)
        assert.ok([way.code, way.code.replaceAll('"', '&quot;'), escaped(way.code), escaped(way.code).replaceAll('&gt;', '>')].some((c) => body.includes(c)), `${app.name}: its code`);
    }
    assert.match(body, /aria-selected="true"[^>]*>[\s\S]*?Claude/u, 'Claude is the chosen tab');
    assert.match(body, /<noscript>[\s\S]*cbox-copy[\s\S]*display: none/u, 'with scripting off, Copy is hidden');
  }
});

const PAGE = fileURLToPath(new URL('../src/routes/agents/+page.svelte', import.meta.url));
const SERVED = new URL('agents.html', BUILD);
/** Missing, or older than the page: either way the build is not this page's. */
const unbuilt = (): string | null => {
  const absent = missing(['agents.html'], 'this reads the connect page as served');
  if (absent) return absent;
  return statSync(SERVED).mtimeMs < statSync(PAGE).mtimeMs ? 'apps/site/build/agents.html is older than the page; build the site first' : null;
};

test('the served connect page: one h1, the five names, every way in a <pre>, no MCP in prose', when(unbuilt()), () => {
  const html = readFileSync(SERVED, 'utf8');
  assert.equal((html.match(/<h1\b/gu) ?? []).length, 1, 'one h1');
  const text = prose(html);
  for (const app of CONNECT) assert.ok(text.includes(app.name), `${app.name} is named`);
  assert.equal((html.match(/<pre\b/gu) ?? []).length, CONNECT.flatMap((a) => a.ways).length, 'a <pre> for each way in');
  /* Outside the row for developers, which names it on purpose (site 2b). */
  const outside = prose(html.replace(/<section class="wrap dev[\s\S]*?<\/section>/u, ''));
  assert.doesNotMatch(outside, /\bMCP\b/u, 'MCP in prose');
  assert.match(text, /For developers/u, 'the row for developers is on the page');
  assert.ok(!html.includes(EM_DASH), 'an em dash in the served page');
});
