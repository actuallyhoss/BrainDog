/**
 * The "agent proposes, you decide" scene, rendered the way the prerender renders it.
 *
 * WHY THE SERVER RENDER AND NOT A BROWSER. The site is prerendered and has to read with JavaScript
 * off, so the markup the server writes IS the scene for a reader with no script, for a reader under
 * `prefers-reduced-motion`, and for a screen reader before the observer has fired. Whatever this
 * component draws in motion, that markup must already be the finished picture, carry every string it
 * was given, and carry nothing it was not given.
 *
 * IT SITS IN `src/lib` FOR THE SAME REASON `claims.test.ts` DOES: `test/` belongs to another agent in
 * this run, and the package's `test` script globs `test/*.test.ts`, so run it as
 * `node --test --experimental-strip-types "apps/site/src/lib/*.test.ts"`.
 *
 * THE COMPILED MODULE IS WRITTEN TO THE TEMP DIRECTORY with its `svelte/...` imports rewritten to the
 * files this package resolves, because a module in the temp directory has no `node_modules` above it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = new URL('./', import.meta.url);
const SOURCE = new URL('Decide.svelte', HERE);

/** Sentinel strings, each one unmistakable, so a string the component invented shows up as a stranger. */
const scene = {
  label: 'SCENE-LABEL',
  agent: 'AGENT-NAME',
  person: 'PERSON-NAME',
  proposal: { title: 'PROPOSAL-TITLE', change: 'PROPOSAL-CHANGE' },
  verb: 'VERB-WORD',
  accepted: 'ACCEPTED-WORD',
  history: [
    { who: 'OLDER-WHO', what: 'OLDER-WHAT', when: 'OLDER-WHEN' },
    { who: 'AGENT-NAME', what: 'LANDING-WHAT', when: 'LANDING-WHEN' },
  ],
} as const;

async function render(props: unknown): Promise<string> {
  const { compile } = await import(import.meta.resolve('svelte/compiler', HERE.href));
  const dir = mkdtempSync(join(tmpdir(), 'decide-'));

  /* EACH COMPONENT IT DRAWS IS COMPILED BESIDE IT, and each plain module it imports is read from its source: `Decide`
     draws an agent's mark with `AgentMark`, which reads the marks both apps share, `@braindog/skin/agent-marks.ts`.
     That name is resolved here as `svelte` is, because the temp directory has no `node_modules` above it. */
  const build = (name: string) => {
    const { js } = compile(readFileSync(new URL(`${name}.svelte`, HERE), 'utf8'), { generate: 'server', filename: `${name}.svelte` });
    const code = (js.code as string)
      .replace(/from ['"]((?:svelte|@braindog\/skin\/)[^'"]*)['"]/g, (_: string, spec: string) => `from '${import.meta.resolve(spec, HERE.href)}'`)
      .replace(/from ['"]\.\/([A-Za-z]+)\.svelte['"]/g, (_: string, dep: string) => `from './${dep}.js'`)
      .replace(/from ['"]\.\/([A-Za-z-]+\.ts)['"]/g, (_: string, mod: string) => `from '${new URL(mod, HERE).href}'`);
    writeFileSync(join(dir, `${name}.js`), code);
  };
  build('AgentMark');
  build('Decide');
  const file = join(dir, 'Decide.js');

  const { default: Decide } = await import(pathToFileURL(file).href);
  const { render: ssr } = await import(import.meta.resolve('svelte/server', HERE.href));
  return ssr(Decide, { props }).body as string;
}

/** The words a reader is shown: tags, comments and Svelte's hydration markers stripped out. */
function words(html: string): string[] {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

test('the prerendered scene is the finished one', async () => {
  /* WITH NO SCRIPT THERE IS NO SECOND CHANCE. A scene that prerenders at its first frame shows a
     reader without JavaScript an agent typing forever and a proposal nobody accepted. */
  const html = await render({ scene });
  assert.match(html, /data-phase="done"/);
});

test('every string of the scene is in the markup', async () => {
  const html = await render({ scene });
  const all = [
    scene.label,
    scene.agent,
    scene.person,
    scene.proposal.title,
    scene.proposal.change,
    scene.verb,
    scene.accepted,
    ...scene.history.flatMap((h) => [h.who, h.what, h.when]),
  ];
  for (const s of all) assert.ok(html.includes(s), `${s} is missing from the rendered scene`);
});

test('the component says nothing of its own', async () => {
  /* ALL COPY LIVES IN `copy.ts`. Every visible word must be one of the sentinels; the only other
     things allowed are the initials of the two avatars, which are cut from the names they sit by. */
  const html = await render({ scene });
  const known = new Set<string>([
    scene.label,
    scene.agent,
    scene.person,
    scene.proposal.title,
    scene.proposal.change,
    scene.verb,
    scene.accepted,
    ...scene.history.flatMap((h) => [h.who, h.what, h.when]),
    'A',
    'P',
  ]);
  const strangers = words(html).filter((w) => !known.has(w));
  assert.deepEqual(strangers, [], 'the scene rendered words nobody passed it');
});

test('no record address is drawn, whatever the copy says', async () => {
  const html = await render({ scene });
  assert.doesNotMatch(words(html).join(' '), /\b[a-z]+#\d+\b/i);
});

test('the real scene in copy.ts draws no record address and lands on the agent', async (t) => {
  /* THE SENTINELS PROVE THE COMPONENT ADDS NO ID; THIS PROVES THE COPY GIVES IT NONE. `site.decide`
     is written by another change in this run, so until it exists there is nothing to hold. */
  const { site } = (await import('./copy.ts')) as { site: Record<string, unknown> };
  const real = site.decide as typeof scene | undefined;
  if (!real) return t.skip('site.decide is not in copy.ts yet');

  const html = await render({ scene: real });
  assert.doesNotMatch(words(html).join(' '), /\b[a-z]+#\d+\b/i);
  assert.equal(real.history.at(-1)?.who, real.agent, 'the row the proposal lands as must carry the agent');
});

test('the last history row is the landing row', async () => {
  const html = await render({ scene });
  const landing = html.match(/<li[^>]*class="[^"]*\blanding\b[^"]*"[^>]*>([\s\S]*?)<\/li>/);
  assert.ok(landing, 'no row is marked as the landing row');
  const cells = landing[1] ?? '';
  assert.ok(cells.includes('LANDING-WHAT'), 'the landing row is not the last row given');
  assert.ok(!cells.includes('OLDER-WHAT'));
});

test('the motion is started by an observer and refused under reduced motion', () => {
  const src = readFileSync(SOURCE, 'utf8');
  const script = src.slice(src.indexOf('<script'), src.indexOf('</script>'));
  assert.match(script, /new IntersectionObserver\(/);
  assert.match(script, /prefers-reduced-motion: reduce/);
});
