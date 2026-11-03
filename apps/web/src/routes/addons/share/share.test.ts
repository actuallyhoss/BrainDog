import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { publishWords } from '../../../lib/market/publish.ts';
import { words } from './share.ts';

test('SHARE THIS SETUP IN TWO STEPS: numbered, the skills behind one counted line, and no "Kennel"', () => {
  assert.match(words.about, /^1\. /u);
  assert.match(words.send, /^2\. /u);
  assert.equal(words.skillsPicked(3, 35), 'Skills to include: 3 of 35');
  assert.equal(words.signals(['founder', 'startup', 'saas', 'mrr', 'runway', 'launch']), 'Include the words that suggest it: founder, startup and 4 more');
  assert.equal(words.signals(['founder', 'startup']), 'Include the words that suggest it: founder, startup');
  for (const said of [publishWords.publish, publishWords.listed('Solo founder', '3.0.1'), publishWords.unreached, publishWords.unread])
    assert.doesNotMatch(said, /Kennel/u, said);

  /* THE SKILLS ARE SHUT UNTIL OPENED: a list of thirty-five made the page 3,206 tall. */
  const page = readFileSync(new URL('../../plugins/share/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /<details class="skills-pick">\s*<summary[^>]*>\{words\.skillsPicked\(/u);
});
