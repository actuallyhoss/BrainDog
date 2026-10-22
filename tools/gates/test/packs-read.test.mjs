/**
 * THE TEXT GATES READ `packs/`, OR SAY WHY THEY DO NOT, ASKED OF A SEEDED TREE PER GATE.
 *
 *   node --test "tools/gates/test/*.test.mjs"
 *
 * WHY THIS FILE EXISTS. `packs/` became the third workspace root on 24 September (`pnpm-workspace.yaml`),
 * and every text gate that walks workspaces had `packages`
 * and `apps` written into it. An audit found `em-dash`, `secret-grep`, `graph` and
 * `shell-words` each hard-coded the pair, so a pack could carry a spaced em dash in the summary a
 * stranger reads before installing it, log a plaintext, or be imported by the core, and all four
 * read green because none of them had opened the directory. A gate that does not look is not a
 * gate that passed.
 *
 * ONE SEEDED ROOT PER GATE, SPAWNED RATHER THAN IMPORTED. Each gate is aimed at its tree with
 * `BRAINDOG_GATE_ROOT`, the handle `self-test` uses, so what is asserted here is the exit code and the
 * lines an operator would see, not a return value the runner happens to read.
 *
 * `shell-words` IS THE ONE THAT STAYS OUT, AND ITS CASE BELOW PINS THAT AS A DECISION. Its words are
 * the use cases the core must not name, and a pack is exactly where a use case belongs: the gate's
 * own `OUT` table exempts `packages/seed` whole for the same reason. Measured on 24 September with
 * the gate's own `hitsIn` over `packs/`: its reading (code, tests out) finds 2 files and 0 hits,
 * because `packs/mercury` has no script yet; the pack file it would grow one beside names `mercury`
 * 11 times, which is the Mercury pack naming itself. Reading `packs/` would be green today and red
 * the first time that pack gained a script, on the one thing that is correct. So the case asserts
 * that a use-case word under `packs/` stays green while the same word in a core package goes red, and
 * the pair is what says the scope is chosen rather than forgotten. It passed before this change as
 * well as after, which is the point: it is a decision pinned, not a repair.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const gates = join(import.meta.dirname, '..');

/** A root holding exactly `files`, each a path under it and its text. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-packs-'));
  for (const [at, body] of Object.entries(files)) {
    const full = join(root, at);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

/** The gate run as a script at `root`, with what it printed on both streams. */
function run(gate, root) {
  const r = spawnSync(process.execPath, [join(gates, `${gate}.mjs`)], {
    env: { ...process.env, BRAINDOG_GATE_ROOT: root },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.replace(/\\/g, '/') };
}

/* BUILT FROM ITS CODE POINT, so the glyph appears only in the seeded files and a search of this tree for
   it does not land on this test. */
const DASH = String.fromCharCode(0x2014);

const manifest = (name) => JSON.stringify({ name, version: '1.0.0', private: true, type: 'module' });

/**
 * THE PACK FILE IS THE PROSE, NOT ONLY ITS SCRIPT. What a stranger reads before pressing install is
 * the `summary`, the `fill` hints and the labels in `<id>.pack.json`, and a pack has no `src` for a
 * rule shaped around `packages/*\/src` to find. The test beside it is quoted too and must stay green,
 * for the reason the gate already gives for `test` directories.
 */
test('em-dash reads a pack file and a pack script, and not the pack test', () => {
  const root = tree({
    'packs/demo/package.json': manifest('@braindog/pack-demo'),
    'packs/demo/demo.pack.json': JSON.stringify({ pack: 'demo', summary: `Reads the balance ${DASH} every hour.` }, null, 2),
    'packs/demo/fill.ts': `export const hint = 'The label of the key ${DASH} never the key itself.';\n`,
    'packs/demo/demo.test.ts': `const quoted = 'Reads the balance ${DASH} every hour.';\n`,
  });
  try {
    const { code, out } = run('em-dash', root);
    assert.equal(code, 1, out);
    assert.match(out, /packs\/demo\/demo\.pack\.json:\d+/);
    assert.match(out, /packs\/demo\/fill\.ts:1/);
    assert.doesNotMatch(out, /demo\.test\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A PACK'S SCRIPT HOLDS A GRANT'S LABEL AND RUNS WHERE A KEY IS OPENED, so it is the file most
 * likely to log one. Tests included, as for `packages`: a fixture that carried a real credential is
 * one committed to a public repository.
 */
test('secret-grep reads a pack script', () => {
  const root = tree({
    'packs/demo/package.json': manifest('@braindog/pack-demo'),
    'packs/demo/fill.ts': "export const pull = (plaintext) => console.log('pulled with', plaintext);\n",
  });
  try {
    const { code, out } = run('secret-grep', root);
    assert.equal(code, 1, out);
    assert.match(out, /packs\/demo\/fill\.ts:1\s+a plaintext reaches a log/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A PACK SITS ABOVE THE WHOLE ORDER AND IS NOT A ROW OF IT. The core importing a pack is the core
 * knowing a use case by name, which the core never does; a pack reaching into a package through a
 * relative path is the escape layer 3 exists for, whoever does it. And a pack needs no rank in
 * `31 §2`, so asking for one would have been a finding per pack with no repair but a table row
 * that means nothing.
 */
test('graph refuses the core importing a pack and a pack escaping by path, and ranks no pack', () => {
  const root = tree({
    'docs/31-STACK.md': '| # | Package |\n| --- | --- |\n| 1 | `kernel` |\n',
    'packages/kernel/package.json': JSON.stringify({
      name: '@braindog/kernel',
      dependencies: { '@braindog/pack-demo': 'workspace:*' },
    }),
    'packages/kernel/src/index.ts': "import { demo } from '@braindog/pack-demo';\nexport const k = demo;\n",
    'packs/demo/package.json': manifest('@braindog/pack-demo'),
    'packs/demo/fill.ts': "import { k } from '../../packages/kernel/src/index.ts';\nexport const demo = k;\n",
    'packs/demo/demo.test.ts': "import { k } from '../../packages/kernel/src/index.ts';\nvoid k;\n",
  });
  try {
    const { code, out } = run('graph', root);
    assert.equal(code, 1, out);
    /* THE MANIFEST LINE, because an edge is reported at the first place it is known and the manifests
       are read before the source: declared and imported, the repair starts with the declaration. */
    assert.match(out, /packages\/kernel\/package\.json:1\s+edge into a pack: @braindog\/kernel → @braindog\/pack-demo/);
    assert.match(out, /packs\/demo\/fill\.ts:1\s+cross-package relative import/);
    assert.doesNotMatch(out, /demo\.test\.ts/);
    assert.doesNotMatch(out, /unknown package/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/*
 * THE WORD SITS AT THE PACK'S ROOT AND UNDER A `src` BESIDE IT, because this gate walks `<member>/src`.
 * With only the root file, adding `'packs'` to `WORKSPACES` walked `packs/demo/src`, found nothing
 * and stayed green: measured on 24 September by making exactly that edit, so the case pinned the
 * decision against a change nobody would make and not against the one they would.
 */
test('shell-words leaves a use case in a pack alone and names the same word in the core', () => {
  const inPack = tree({
    'packages/kernel/src/index.ts': 'export const k = 1;\n',
    'packs/demo/fill.ts': "export const bank = 'mercury';\n",
    'packs/demo/src/fill.ts': "export const bank = 'mercury';\n",
  });
  const inCore = tree({
    'packages/kernel/src/index.ts': "export const bank = 'mercury';\n",
  });
  try {
    const pack = run('shell-words', inPack);
    assert.equal(pack.code, 0, pack.out);
    const core = run('shell-words', inCore);
    assert.equal(core.code, 1, core.out);
    assert.match(core.out, /packages\/kernel\/src\/index\.ts:1\s+mercury/);
  } finally {
    rmSync(inPack, { recursive: true, force: true });
    rmSync(inCore, { recursive: true, force: true });
  }
});
