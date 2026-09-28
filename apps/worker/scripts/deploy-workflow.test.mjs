/**
 * The order of `deploy.yml`'s steps that make a red deploy undoable, read off the workflow file.
 *
 *   node --test apps/worker/scripts/deploy-workflow.test.mjs
 *
 * THE ORDER IS THE WHOLE MECHANISM. What was live can only be recorded before `wrangler deploy` replaces it; a rollback
 * step only runs after a red step when it sits after that step and carries `failure()`; and a step marked
 * `continue-on-error` never turns the run red, so a Parity or Smoke carrying it would make `failure()` false and the
 * rollback unreachable. None of that is visible to `rollback.test.mjs`, which holds the decision, so it is held here.
 *
 * THE FILE IS READ AS GITHUB'S STEP LIST, ONE STEP PER `- ` AT THE STEPS' INDENT. No YAML parser is a dependency of
 * this workspace, and the shape read here is the one the file is written in: a step's keys at eight spaces under a
 * dash at six.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './provision-check.mjs';

const text = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Each step as `{ name, id, if, uses, body }`, in the order the job runs them. */
function steps(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^ {4}steps:\s*$/.test(line));
  assert.ok(start !== -1, 'deploy.yml has no steps list at four spaces');
  const blocks = [];
  for (const line of lines.slice(start + 1)) {
    /* A COMMENT BELONGS TO NO STEP: the one above a step would otherwise be read as the body of the step before it. */
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    if (/^\S/.test(line)) break;
    if (/^ {6}- /.test(line)) blocks.push([line.replace(/^ {6}- /, '        ')]);
    else if (blocks.length > 0 && /^ {8}/.test(line)) blocks.at(-1).push(line);
  }
  const key = (block, name) => {
    const found = block.map((line) => new RegExp(`^ {8}${name}:\\s*(.*)$`).exec(line)).find((m) => m !== null);
    return found ? found[1].trim() : null;
  };
  return blocks.map((block) => ({ name: key(block, 'name'), id: key(block, 'id'), if: key(block, 'if'), uses: key(block, 'uses'), body: block.join('\n') }));
}

const all = steps(text);
const at = (name) => {
  const index = all.findIndex((step) => step.name === name);
  assert.ok(index !== -1, `deploy.yml has no step named "${name}"`);
  return index;
};
const step = (name) => all[at(name)];

test('what is live is recorded before Deploy, with the host its build id is read from', () => {
  assert.ok(at('Record what is live') < at('Deploy'), 'the record step runs after the deploy, when what was live is gone');
  const record = step('Record what is live');
  assert.match(record.body, /node apps\/worker\/scripts\/rollback\.mjs record /);
  assert.match(record.body, /wrangler deployments status --json --env production/);
  assert.match(record.body, /DEPLOY_HOST: \$\{\{ vars\.DEPLOY_HOST \}\}/);
});

test('the rollback follows Smoke under failure(), and reads which of Parity and Smoke went red', () => {
  assert.equal(step('Parity').id, 'parity');
  assert.equal(step('Smoke').id, 'smoke');
  const decide = step('Decide whether to roll back');
  assert.ok(at('Decide whether to roll back') > at('Smoke'), 'the rollback decision runs before Smoke has answered');
  assert.equal(decide.id, 'rollback');
  assert.match(decide.if ?? '', /^failure\(\) && \(steps\.parity\.outcome == 'failure' \|\| steps\.smoke\.outcome == 'failure'\)$/);
  assert.match(decide.body, /node apps\/worker\/scripts\/rollback\.mjs decide/);
  assert.match(decide.body, /HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);

  for (const [name, output] of [['Roll the app back', 'app'], ['Roll the site back', 'site']]) {
    const roll = step(name);
    assert.ok(at(name) > at('Decide whether to roll back'), `${name} runs before the decision`);
    assert.equal(roll.if, `failure() && steps.rollback.outputs.${output} != ''`);
    assert.match(roll.body, /wrangler rollback "\$VERSION" --env production/);
  }
});

test('Parity and Smoke can turn the run red, or failure() never fires', () => {
  for (const name of ['Deploy', 'Parity', 'Deploy the marketing site', 'Smoke']) assert.doesNotMatch(step(name).body, /continue-on-error/, `${name} is continue-on-error`);
});

test('the checkout holds the history the rollback diffs', () => {
  const checkout = all.find((s) => (s.uses ?? '').startsWith('actions/checkout@'));
  assert.ok(checkout, 'deploy.yml checks nothing out');
  assert.match(checkout.body, /fetch-depth: 0/);
  assert.ok(all.indexOf(checkout) < at('Record what is live'));
});

test('only production\'s smoke is handed the canary token', () => {
  assert.match(step('Smoke').body, /SMOKE_TOKEN: \$\{\{ secrets\.SMOKE_TOKEN \}\}/);
  assert.match(step('Smoke').body, /SMOKE_SLUG: \$\{\{ vars\.SMOKE_SLUG \}\}/);
  assert.doesNotMatch(step('Smoke alpha').body, /SMOKE_TOKEN/);
});

test('the Sandbox smoke follows Smoke, cannot go unnoticed, and reads its canary from wrangler.jsonc (SCR-4)', () => {
  assert.ok(at('Sandbox smoke') > at('Smoke'), 'the sandbox smoke runs before Smoke has answered');
  const sandbox = step('Sandbox smoke');
  assert.doesNotMatch(sandbox.body, /continue-on-error/, 'Sandbox smoke is continue-on-error');
  assert.match(sandbox.body, /SMOKE_TOKEN: \$\{\{ secrets\.SMOKE_TOKEN \}\}/);
  assert.match(sandbox.body, /DEPLOY_HOST: \$\{\{ vars\.DEPLOY_HOST \}\}/);
  assert.match(sandbox.body, /wranglerConfig\(\)/);
  assert.match(sandbox.body, /OPS_RECORD/);
});
