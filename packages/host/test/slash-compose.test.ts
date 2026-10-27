/**
 * What the model is told when it composes a page (ENG-B09 job 6): `SLASH_COMPOSE_INSTRUCTIONS`, which took the place of
 * the headline instructions on both adapters. The record refuses a line with a typed digit from here on, so the
 * instructions say the rule the check holds the model to: a number is written as its hole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { anthropicModel, endpointModel, SLASH_COMPOSE_INSTRUCTIONS, SLASH_HEADLINE_INSTRUCTIONS } from '../src/slash.ts';

const FAKE_KEY = 'fake-key-for-tests-only';

const INPUT = {
  today: '2026-10-14',
  pages: [{ page: 'bake', title: 'Bake', rules: '3 orders to bake.', figures: [{ id: 'orders-open', value: '3', change: '+1' }] }],
};
const LINES = { lines: { bake: '{{orders-open}} orders to bake, {{orders-open.change}} on yesterday.' } };

test('EACH NUMBER IS WRITTEN AS ITS HOLE AND NEVER AS A DIGIT', () => {
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /\{\{<figure id>\}\}/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Never type a digit/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /nor a number in words/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /\{\{<figure id>\.change\}\}/u);
  /* AND THE OLD RULE IS GONE: nothing tells the model it may write a number as it is given. */
  assert.doesNotMatch(SLASH_COMPOSE_INSTRUCTIONS, /written exactly as it is given/u);
  /* THE EXAMPLES IT GIVES KEEP THE RULE THEMSELVES: no digit outside a limit it is told to keep. */
  assert.doesNotMatch(SLASH_COMPOSE_INSTRUCTIONS, /such as "[^"]*\d[^"]*"/u);
});

test('IT KEEPS THE RULE FOR CALM: leave out what the page already does well', () => {
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /give back the rules line/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave `order` out when the page already leads with what matters/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave `lead` out/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave `hide` out/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave `next` out when nothing on the page wants doing/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave out whatever the page already does well/u);
});

test('THE ANSWER’S SHAPE HOLDS lead, order, hide, next AND group, and a bare line is still an answer', () => {
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /\{"lines":\{"<page id>":"<the line>"\}\}/u);
  assert.match(
    SLASH_COMPOSE_INSTRUCTIONS,
    /\{"headline":"<the line>","lead":"<key>","order":\["<key>"\],"hide":\["<key>"\],"next":\{"row":"<handle>","text":"<the phrase>"\},"group":\{"<key>":"<field>"\}\}/u,
  );
  /* AND THE THIRD LEVER: a field it was handed for that part, and none where nothing is long. */
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /only a field handed in that part's `group`/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Leave `group` out when nothing is long/u);
  /* WHAT THE RECORD'S CHECKS HOLD EACH PART TO, said first. */
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /each key once, only keys it was handed, and the lead line first/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /the handle of one of its rows exactly as handed/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /Never hide the lead line/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /140 characters/u);
  assert.match(SLASH_COMPOSE_INSTRUCTIONS, /at most 80 characters/u);
  assert.ok(!SLASH_COMPOSE_INSTRUCTIONS.includes('—') && !SLASH_COMPOSE_INSTRUCTIONS.includes('–'), 'no dash as punctuation');
});

test('THE OLD NAME SAYS THE NEW INSTRUCTIONS, so a caller not yet moved tells the model the same rule', () => {
  assert.equal(SLASH_HEADLINE_INSTRUCTIONS, SLASH_COMPOSE_INSTRUCTIONS);
});

test('BOTH ADAPTERS SEND THEM: a chat-completions endpoint as the system message, Anthropic as `system`', async () => {
  const sent: Record<string, unknown>[] = [];
  const send = (answer: unknown) => async (_url: URL, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  const open = endpointModel({
    url: 'http://localhost:11434/v1/chat/completions',
    model: 'small',
    key: async () => FAKE_KEY,
    send: send({ choices: [{ message: { role: 'assistant', content: JSON.stringify(LINES) } }] }),
  });
  assert.deepEqual(await open.headline(INPUT), LINES);
  assert.equal((sent[0]!.messages as { role: string; content: string }[])[0]!.content, SLASH_COMPOSE_INSTRUCTIONS);

  const claude = anthropicModel({
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-x',
    key: async () => FAKE_KEY,
    send: send({ content: [{ type: 'text', text: JSON.stringify(LINES) }], usage: { input_tokens: 90, output_tokens: 30 } }),
  });
  assert.deepEqual(await claude.headline(INPUT), LINES);
  assert.equal(sent[1]!.system, SLASH_COMPOSE_INSTRUCTIONS);
});
