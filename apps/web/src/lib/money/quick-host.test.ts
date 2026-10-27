/**
 * A quick-add host joins from an `$effect`, so joining and leaving read the list of hosts untracked: a tracked read made
 * the effect depend on the list it writes and loop until Svelte gave up (`effect_update_depth_exceeded`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./quick.svelte.ts', import.meta.url), 'utf8');
const body = (name: string): string => new RegExp(`${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`).exec(SOURCE)![1]!;

test('JOINING AND LEAVING READ THE HOSTS UNTRACKED', () => {
  for (const name of ['join', 'leave']) {
    const text = body(name);
    assert.match(text, /untrack\(\(\) => this\.#hosts\)/u, `${name} reads #hosts without untrack`);
    assert.doesNotMatch(text.replace(/untrack\(\(\) => this\.#hosts\)/gu, ''), /this\.#hosts(?!\s*=)/u, `${name} reads #hosts outside untrack`);
  }
});
