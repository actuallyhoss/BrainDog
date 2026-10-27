/**
 * The controls no row may wear as its mark: the kernel's copy of the list, read directly, and the gate that
 * holds it equal to the renderer's.
 *
 * `marks.ts` imports nothing, so this file stands on it alone. The gate is aimed at a planted tree, a copy of its own
 * `negative/closed-lists` case (one finding of its own) with the two lists added beside it, so the controls check is
 * proved to go red by itself and to stay quiet when the lists agree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openRecord, type Declaration } from '../src/index.ts';
import { CONTROLS, MARK_IS_CONTROL, MARK_IS_CONTROL_SAYS, isControlMark } from '../src/marks.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('A CONTROL IS REFUSED BY EVERY NAME IT ANSWERS TO, in any case and around spaces', () => {
  for (const name of ['close', 'x', 'pencil', 'edit', 'trash-2', 'chevronDown', 'more', ' Close ', 'X', 'slash']) {
    assert.equal(isControlMark(name), true, `${name} is a control`);
  }
});

test('A PICTURE IS NO CONTROL, and neither is a word the set does not draw', () => {
  for (const name of ['cake', 'gift', 'rocket', 'paw', 'music', 'key', 'B', '', 'constructor']) {
    assert.equal(isControlMark(name), false, `${name} may be a mark`);
  }
  assert.equal(isControlMark(null), false);
  assert.equal(isControlMark(7), false);
});

test('THE REFUSAL SAYS WHAT TO DO, in plain words', () => {
  assert.equal(MARK_IS_CONTROL, 'MARK_IS_CONTROL');
  assert.equal(MARK_IS_CONTROL_SAYS, 'Pick a picture that is not a button.');
});

test('THE LIST HAS NO NAME TWICE', () => {
  assert.equal(new Set(CONTROLS).size, CONTROLS.length);
});

/** The gate's output for a planted tree, and what it returned. */
async function gateOn(root: string): Promise<{ out: string; code: number }> {
  const { default: closedLists } = (await import(new URL('../../../tools/gates/closed-lists.mjs', import.meta.url).href)) as {
    default: (root: string) => number | undefined;
  };
  const lines: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    return { code: closedLists(root) ?? 0, out: lines.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** A copy of the gate's own planted case, with both lists written into it as the repository has them. */
function planted(): string {
  const root = mkdtempSync(join(tmpdir(), 'mark-control-'));
  cpSync(join(REPO, 'tools', 'gates', 'negative', 'closed-lists'), root, { recursive: true });
  for (const rel of [['packages', 'render', 'src', 'glyphs', 'names.ts'], ['packages', 'kernel', 'src', 'marks.ts']]) {
    mkdirSync(join(root, ...rel.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...rel), readFileSync(join(REPO, ...rel), 'utf8'));
  }
  return root;
}

test('THE GATE HOLDS THE TWO COPIES EQUAL: quiet when they agree, red by itself when the kernel drops one', async () => {
  const root = planted();
  try {
    const agree = await gateOn(root);
    assert.doesNotMatch(agree.out, /controls a mark may not be differ/u);
    assert.doesNotMatch(agree.out, /NOT checked, the controls/u);

    const at = join(root, 'packages', 'kernel', 'src', 'marks.ts');
    writeFileSync(at, readFileSync(at, 'utf8').replace("'pencil', ", ''));
    const drift = await gateOn(root);
    assert.equal(drift.code, 1);
    assert.match(drift.out, /controls a mark may not be differ .*render alone has pencil/u);

    rmSync(at);
    const gone = await gateOn(root);
    assert.match(gone.out, /glyphs\/names\.ts lists the controls a mark may not be and packages\/kernel\/src\/marks\.ts is not there/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('THE WRITE PATH REFUSES A CONTROL AS A MARK, on the field the list marks its rows by, and takes a picture', async () => {
  const projects: Declaration = {
    id: 'register.projects',
    kind: 'register',
    body: {
      id: 'projects',
      name: 'Projects',
      title: 'name',
      identity: { mark: 'mark' },
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'mark', type: 'text' },
        { id: 'note', type: 'text' },
      ],
    } as never,
  };
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 9, 9, 12)));
  assert.ok((await k.install([projects])).ok);
  const refused = k.create('projects', { name: 'Kiln', mark: 'close' }, { actor: 'p_1' }) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(refused.ok, false);
  assert.deepEqual([refused.refusal?.code, refused.refusal?.fix, refused.refusal?.at], [MARK_IS_CONTROL, MARK_IS_CONTROL_SAYS, 'mark']);
  assert.ok(k.create('projects', { name: 'Kiln', mark: 'cake' }, { actor: 'p_1' }).ok, 'a picture was refused');
  assert.ok(k.create('projects', { name: 'Tallow', note: 'close' }, { actor: 'p_1' }).ok, 'a field that is not the mark was held to it');
});
