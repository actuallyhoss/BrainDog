/**
 * THE CONTROL ROOM'S THREE PARTS, drawn on the server (`svelte/Instruct.svelte`, `Presence.svelte`, `Instructions.svelte`;
 * agents and MCP plan §7.1): each draws what the host worded and nothing it did not, a control only where the host can
 * act on it, Send never greyed, the honest line under a run he can stop, and red only for Needs you.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import type { InstructView, PresenceView, ThreadView } from '../svelte/types.ts';

/* `parity.test.ts`'s hook, so the components can be drawn on the server here. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const load = async (path: string) => ((await import(new URL(path, import.meta.url).href)) as { default: Component<Record<string, unknown>> }).default;
const draw = async (path: string, props: Record<string, unknown>) => render(await load(path), { props }).body.replace(/<!--[^>]*-->/gu, '');

const VIEW: InstructView = {
  to: [
    { key: 'anyone', label: 'Whoever’s next' },
    { key: 'agent:claude', label: 'Claude' },
  ],
  toKey: 'agent:claude',
  on: [
    { key: '', label: 'Any project' },
    { key: 'things#1', label: 'Kiln' },
  ],
  onKey: 'things#1',
  onFixed: false,
  when: ['now', 'next'],
  whenKey: 'now',
  next: 'Goes to Claude on Kiln, working now.',
  agent: 'claude',
  busy: false,
  fault: null,
};

const noop = () => {};

test('THE COMPOSER: one field, To, On and When said as words, Send never greyed, and what happens next', async () => {
  const html = await draw('../svelte/Instruct.svelte', { view: VIEW, onto: noop, onon: noop, onwhen: noop, onsend: noop });
  assert.match(html, /<textarea[^>]*placeholder="Tell an agent what to do…"/u);
  assert.match(html, /<span class="ins-key">To<\/span>/u);
  assert.match(html, /<option value="agent:claude"[^>]*>Claude<\/option>/u);
  assert.match(html, /role="radio" aria-checked="true"[^>]*>Now<\/button>/u);
  assert.match(html, /Goes to Claude on Kiln, working now\./u);
  assert.doesNotMatch(html, /<button class="ins-send"[^>]*disabled/u, 'Send is greyed');
  /* ONE WHEN IS A WORD, NOT A CONTROL, and a run's project is words too. */
  const one = await draw('../svelte/Instruct.svelte', { view: { ...VIEW, when: ['next'], whenKey: 'next', onFixed: true }, onto: noop, onon: noop, onwhen: noop, onsend: noop });
  assert.doesNotMatch(one, /role="radiogroup"/u);
  assert.match(one, /<span class="ins-value">Next start<\/span>/u);
  assert.match(one, /<span class="ins-value">Kiln<\/span>/u);
  /* A REFUSAL IS SAID UNDER THE FIELD, in red, as an alert. */
  const refused = await draw('../svelte/Instruct.svelte', { view: { ...VIEW, fault: 'Say what the agent should do.' }, onto: noop, onon: noop, onwhen: noop, onsend: noop });
  assert.match(refused, /<p class="ins-fault" role="alert">Say what the agent should do\.<\/p>/u);
  /* NO MACHINE OR PROFILE TO CHOOSE, none drawn. */
  assert.doesNotMatch(html, /<span class="ins-key">(?:Machine|Profile)<\/span>/u);
});

test('MACHINE AND PROFILE ARE CHOICES ONLY WHEN THE HOST OFFERS THEM, each by name, "Any" first', async () => {
  const view: InstructView = {
    ...VIEW,
    machine: [
      { key: '', label: 'Any machine' },
      { key: 'kiln-mbp', label: 'kiln-mbp' },
      { key: 'kiln-studio', label: 'kiln-studio' },
    ],
    machineKey: 'kiln-mbp',
    seat: [
      { key: '', label: 'Any profile' },
      { key: 'harbour', label: 'harbour' },
      { key: 'default', label: 'default' },
    ],
    seatKey: '',
  };
  const html = await draw('../svelte/Instruct.svelte', { view, onto: noop, onon: noop, onwhen: noop, onmachine: noop, onseat: noop, onsend: noop });
  assert.match(html, /<span class="ins-key">Machine<\/span>/u);
  assert.match(html, /<option value="kiln-studio"[^>]*>kiln-studio<\/option>/u);
  assert.match(html, /<span class="ins-key">Profile<\/span>/u);
  assert.match(html, /<option value=""[^>]*>Any profile<\/option>/u);
  assert.match(html, /<option value="harbour"[^>]*>harbour<\/option>/u);
});

const ROW: PresenceView = {
  key: 'S1',
  agent: 'claude',
  name: 'Claude',
  doing: 'Variable axis QA',
  project: { name: 'Kiln', slot: 'blue' },
  meta: 'axis-qa · heard 3 min ago',
  live: 'working',
  holds: null,
  helpers: '+1 helper, on axis-qa-2',
  stopped: null,
  reach: 'Pause and Stop reach Claude at its next tool call, through its hooks.',
  confirm: { stop: 'Stop Claude?', pause: 'Pause Claude?' },
  href: '/r/session/1',
  busy: false,
};

test('A RUN ROW: who, what it said, where, its helpers; Tell, Pause and Stop with the honest line only for him', async () => {
  const his = await draw('../svelte/Presence.svelte', { rows: [ROW], ontell: noop, onstop: noop, onresume: noop });
  assert.match(his, /<a class="pres-name" href="\/r\/session\/1">Claude<\/a>/u);
  assert.match(his, /Variable axis QA/u);
  assert.match(his, /data-slot="blue"/u);
  assert.match(his, /\+1 helper, on axis-qa-2/u);
  assert.match(his, /Pause and Stop reach Claude at its next tool call, through its hooks\./u);
  for (const press of ['Tell', 'Pause', 'Stop']) assert.match(his, new RegExp(`<button[^>]*class="pres-btn"[^>]*>${press}</button>`, 'u'), `no ${press}`);
  assert.doesNotMatch(his, />S1</u, 'the run is said by its handle');
  /* A READER WHO MAY NOT TELL GETS THE ROW AND NO CONTROL AT ALL. */
  const theirs = await draw('../svelte/Presence.svelte', { rows: [ROW] });
  assert.doesNotMatch(theirs, /<button/u);
  assert.doesNotMatch(theirs, /pres-reach/u);
  /* A PAUSED RUN SAYS SO AND OFFERS RESUME. */
  const held = await draw('../svelte/Presence.svelte', { rows: [{ ...ROW, stopped: 'pause' }], ontell: noop, onstop: noop, onresume: noop });
  assert.match(held, /Paused by you/u);
  assert.match(held, />Resume<\/button>/u);
  assert.doesNotMatch(held, />Tell<\/button>/u);
});

const THREAD: ThreadView = {
  key: 'IN4',
  said: 'Merge wave 1, then stop',
  to: 'Claude · Kiln · now',
  agent: 'claude',
  steps: ['done', 'done', 'done', 'done'],
  word: 'Needs you',
  tone: 'needs',
  trail: 'Sent 14:02 · Seen by Claude at 14:02, on its next prompt',
  reply: { by: 'Claude at 14:14', text: 'Merged. Wave 2 waits on the migration.' },
  receipts: { said: '4 changes', names: ['Ship the specimen'], more: null, undo: true, undone: null, commits: 'New commits on axis-qa' },
  takeBack: false,
  close: false,
  sending: false,
  busy: false,
};

test('A THREAD: what he said, to whom, the bar in the agent’s hue, the reply, what changed and Undo all', async () => {
  const html = await draw('../svelte/Instructions.svelte', { threads: [THREAD], ontakeback: noop, onundo: noop });
  assert.match(html, /data-tone="needs"/u);
  assert.match(html, /--told-c:var\(--agent-claude, var\(--ink\)\)/u);
  assert.equal((html.match(/class="told-step"/gu) ?? []).length, 4);
  assert.match(html, /<span class="told-word">Needs you<\/span>/u);
  assert.match(html, /Merged\. Wave 2 waits on the migration\./u);
  assert.match(html, /4 changes<\/span>: Ship the specimen/u);
  assert.match(html, />Undo all<\/button>/u);
  assert.doesNotMatch(html, />Take back<\/button>/u, 'a taken thread offers Take back');
  /* TAKE BACK WHILE NO RUN HAS IT; NOTHING DRAWN WITH NO THREAD. */
  const open = await draw('../svelte/Instructions.svelte', { threads: [{ ...THREAD, tone: 'open', word: 'Sent', reply: null, receipts: null, takeBack: true }], ontakeback: noop });
  assert.match(open, />Take back<\/button>/u);
  assert.equal((await draw('../svelte/Instructions.svelte', { threads: [] })).replace(/<!--[^>]*-->/gu, '').trim(), '');
});
