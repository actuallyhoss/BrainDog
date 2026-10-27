/**
 * OPENING AN AUTOMATION SENDS NO WRITE.
 *
 * WHAT WAS WRONG. The live look of his record blocked `checkAutomation` three times on an automation's page
 * (`automations-id`): the page checks the body it draws, the route table
 * marked the check a write, and a reader seeing as somebody, or a read-only token, was refused it. It installs nothing,
 * as `automationSentence` keeps nothing, so both are reads sent as a POST (`postRead`), as `previewPage` is. A try
 * writes inside its rehearsal, and stays a write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES as OWN } from '../src/routes/automations.ts';

const row = (name: string) => OWN.find((r) => r.name === name);

test('checking a body and reading a sentence are reads sent as a POST', () => {
  for (const name of ['checkAutomation', 'automationSentence']) {
    assert.equal(row(name)?.writes, true, `${name} is no longer sent as a POST`);
    assert.equal(row(name)?.postRead, true, `${name} is refused as a write to a reader`);
    assert.equal(row(name)?.group, 'READ+');
  }
});

test('a try, a switch and a retry are still writes', () => {
  for (const name of ['tryAutomation', 'setAutomation', 'retryRun']) assert.notEqual(row(name)?.postRead, true, `${name} became a read`);
});
