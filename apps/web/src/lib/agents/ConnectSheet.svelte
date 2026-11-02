<!--
  CONNECT AN AGENT: one sheet, opened from Settings, Agents, with the ways in as flat tiles, one open
  at a time. Each line has its own Copy. The open tile ends in a live row that asks the record every two seconds and
  turns from "Waiting for its first call" to "Connected: Claude Code on MacBook, called 3 seconds ago".

  LOADED ONLY WHEN ASKED FOR. Settings imports this with `import()`, so the entry carries none of it (`connect.ts`
  holds its words for the same reason).

  NO KEY IS SHOWN BUT THE ONE A PERSON JUST MADE, in the script tile, from `minted`, which Done, closing the sheet and
  leaving the area all empty. Every other line is a command or the address, and none carries a key.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { TONES } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { step } from '$lib/funnel.ts';
  import { OSES, osOf, type Os } from '$lib/device.ts';
  import { LABEL_MAX, TOKEN_DAYS, headerLine, type ConnectLines } from '$lib/record/device.ts';
  import { mintAgent } from '$lib/record/settings-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { markOf, type AppMark, type MarkedAgent } from '@braindog/skin/agent-marks.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { CONNECT_TILES, connectWords, copyOf, heardOf, lineOf, liveRow, poll, type Heard, type KeyHeard, type TileId } from './connect.ts';

  let {
    open = $bindable(false),
    lines,
    listen,
    code,
    onchanged,
    start,
  }: {
    open?: boolean;
    /** The record's lines (`connectLines`). */
    lines: ConnectLines;
    /** One ask of the record: the newest runs, and the keys when a key was just made. `null` when it could not answer. */
    listen: (keys: boolean) => Promise<{ rows: readonly unknown[]; keys: readonly KeyHeard[] } | null>;
    /** The six-digit field, which `braindog setup` asks for, drawn under the setup line; absent while it is drawn above. */
    code?: Snippet | undefined;
    /** Something changed the connected list: a key was made. */
    onchanged?: (() => void) | undefined;
    /** The way in open when the sheet opens, where the caller offered one by name (Today's "Connect Claude"). */
    start?: TileId | undefined;
  } = $props();

  /* EACH WAY IN WEARS ITS APP'S MARK, as Connect your agent's segments do; the two with no maker wear a glyph. */
  const MARKS: Record<TileId, MarkedAgent | AppMark | null> = {
    'claude-code': 'claude',
    'claude-web': 'claude',
    chatgpt: 'chatgpt',
    vscode: 'vscode',
    cursor: 'cursor',
    codex: 'codex',
    other: null,
    script: null,
  };

  /* ONE TILE OPEN AT A TIME, and when it opened, which is the moment its live row waits for a call after. */
  let openId = $state<TileId | null>(null);
  let openedAt = $state(0);
  /* THE WAY IN THE CALLER NAMED, open each time the sheet opens. */
  $effect(() => {
    if (open && start !== undefined) untrack(() => {
      openId = start;
      openedAt = Date.now();
    });
  });
  let heard = $state<Heard[]>([]);
  let now = $state(Date.now());
  let os = $state<Os>(osOf(globalThis.navigator));

  function pick(id: TileId) {
    openId = openId === id ? null : id;
    openedAt = Date.now();
  }

  /* THE BEARER LIVES HERE AND NOWHERE ELSE, and only until Done, the sheet closing, or leaving the area. */
  let minted = $state<{ id: string | null; bearer: string } | null>(null);
  let made = $state<string | null>(null);
  let mintLabel = $state('');
  let mintInbox = $state(false);
  let minting = $state(false);
  let mintRefusal = $state('');

  async function makeKey(e: SubmitEvent) {
    e.preventDefault();
    const label = mintLabel.trim().slice(0, LABEL_MAX);
    if (!label || minting) return;
    minting = true;
    mintRefusal = '';
    const busy = opened();
    /* THE BEARER IS SHOWN ONCE, from this answer, and never stored, logged or written anywhere else. */
    const out = await mintAgent(apiBase(), { label, inbox: mintInbox, days: TOKEN_DAYS });
    closed(true, busy);
    minting = false;
    if (!out.ok) {
      mintRefusal = out.fix;
      return;
    }
    minted = { id: out.value.id, bearer: out.value.bearer };
    made = out.value.id;
    openedAt = Date.now();
    mintLabel = '';
    mintInbox = false;
    onchanged?.();
  }

  /* ONE ASK AT A TIME: a record slower than two seconds is not asked again before it answers. */
  let asking = false;
  async function tick() {
    now = Date.now();
    if (asking) return;
    asking = true;
    const said = await listen(made !== null);
    asking = false;
    if (said) heard = heardOf(said.rows, said.keys, made);
    now = Date.now();
  }

  /* ASKED WHILE THE SHEET IS OPEN WITH A TILE OPEN, and the tab is shown (`poll`); closing it stops the asking and
     drops the key that was shown. */
  $effect(() => {
    if (!open) {
      minted = null;
      return;
    }
    if (openId === null) return;
    /* `untrack`: an ask reads the key just made, and the poll is not started again for it. */
    return poll(() => untrack(() => void tick()));
  });

  /* THE SCRIPT TILE WAITS FOR NOTHING until a key is made: an app's call is not the script's. */
  const row = $derived(openId === null || (openId === 'script' && made === null) ? null : liveRow(heard, openId, now, openedAt));
  const mark = $derived(row?.state === 'connected' ? TONES.good : TONES.info);

  /* A LINE IS COPIED WITH ITS OWN SENTENCE, and the line is never quoted in the toast: the key is one of them. */
  const put = (line: string, said: string): void => {
    step('copied_line');
    void clipboard.put(line, line, said);
  };

  /* THE FUNNEL: the sheet was seen, and the first call heard (the live row turning "Connected"). Each told once. */
  $effect(() => {
    if (open) step('saw_connect');
  });
  $effect(() => {
    if (row?.state === 'connected') step('agent_connected');
  });
</script>

<!-- A LINE TO COPY: the text in the code face, breaking anywhere so a long line never pushes the sheet sideways. -->
{#snippet copyable(line: string, button: string, said: string)}
  <div class="copy-line">
    <code class="mono">{line}</code>
    <Button onclick={() => put(line, said)}>{button}</Button>
  </div>
{/snippet}

<Sheet bind:open title={connectWords.sheetTitle} subtitle={connectWords.sheetSub}>
  <ul class="ways">
    {#each CONNECT_TILES as t (t.id)}
      {@const on = openId === t.id}
      <li class="way" data-on={on ? '' : undefined}>
        <h3 class="way-head">
          <button type="button" class="way-pick" aria-expanded={on} aria-controls={on ? `way-${t.id}` : undefined} onclick={() => pick(t.id)}
            ><span class="way-mark" aria-hidden="true"
              >{#if MARKS[t.id] !== null}{@const m = markOf(MARKS[t.id]!)}<svg class="mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
                  ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule} /></svg
                >{:else}<Icon name={t.id === 'script' ? 'code' : 'session'} size="m" />{/if}</span
            ><span class="way-title">{t.title}</span><span class="way-chev" aria-hidden="true"><Icon name="chevron" size="s" /></span></button
          >
        </h3>
        {#if on}
          <div class="way-body" id="way-{t.id}">
            <p class="hint">{t.hint}</p>
            {#each t.lines as id (id)}
              <p class="step">{connectWords.step[id]}</p>
              {#if id === 'install'}
                <Segmented role="group" aria-label={copy.doorOs}>
                  {#each OSES as o (o)}
                    <button type="button" class="segment" aria-pressed={os === o} data-on={os === o ? '' : undefined} onclick={() => (os = o)}>{copy.osNames[o]}</button>
                  {/each}
                </Segmented>
              {/if}
              {@render copyable(lineOf(id, lines, os), copyOf(id), copy.lineCopied)}
              {#if id === 'setup' && code}{@render code()}{/if}
            {/each}
            {#if t.key}
              <!-- HOW LONG A KEY LASTS AND WHAT IT CAN DO, under the sentence that says what a key is for. -->
              {#if !minted}<p class="hint">{copy.doorKeyHint}</p>{/if}
              {#if minted}
                {@const bearer = minted.bearer}
                <div class="minted" role="status">
                  <p class="step">{copy.tokenOnce}</p>
                  {@render copyable(bearer, copy.copyKey, copy.keyCopied)}
                  <p class="step">{copy.doorKeyHeader}</p>
                  {@render copyable(headerLine(bearer), copy.copyHeader, copy.lineCopied)}
                  <div class="row-actions">
                    <Button weight="bare" onclick={() => (minted = null)}>{copy.connectDone}</Button>
                  </div>
                </div>
              {:else}
                <form class="field-row" onsubmit={makeKey}>
                  <label class="field-row-label" for="agent-label">{copy.doorKeyLabel}</label>
                  <div class="field-row-controls">
                    <div class="field">
                      <input class="field-input" id="agent-label" type="text" maxlength={LABEL_MAX} bind:value={mintLabel} aria-describedby="agent-label-said" />
                    </div>
                    <Button weight="primary" type="submit" disabled={minting || mintLabel.trim() === ''}>{copy.doorKeyGo}</Button>
                  </div>
                  <!-- THE INBOX IS ONE THING ON OR OFF, the switch the rest of Settings uses, and it starts off. -->
                  <div class="setting-row">
                    <p class="hint">{copy.connectInboxHint}</p>
                    <button
                      type="button"
                      class="switch"
                      role="switch"
                      aria-checked={mintInbox}
                      aria-label={copy.connectInbox}
                      onclick={() => (mintInbox = !mintInbox)}><span class="switch-track"></span></button
                    >
                  </div>
                  <p class="said" id="agent-label-said" role="status" data-intent={mintRefusal ? 'bad' : undefined}>
                    {#if mintRefusal}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {mintRefusal}{/if}
                  </p>
                </form>
              {/if}
            {/if}
            <!-- THE LIVE ROW, its state said by its mark as well as its words, never by colour alone. -->
            {#if row}
              <p class="live" role="status" data-state={row.state}>
                <span role="img" aria-label={mark.label}>{mark.glyph}</span>
                {row.said}
              </p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</Sheet>

<style>
  /* SIX FLAT TILES ON THE SHEET: the board's colour inside the sheet's tile surface, radius 16, no border, no shadow,
     a gap between each. The open one names itself in the accent; its lines follow under its name. */
  .ways {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .way {
    min-inline-size: 0;
    background: var(--board);
    border-radius: var(--r-tile);
  }

  .way-head {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* THE WHOLE HEAD IS THE CONTROL, at 44px or more under any pointer. */
  .way-pick {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 44px;
    padding: var(--sp-3) var(--sp-4);
    border: 0;
    border-radius: var(--r-tile);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .way[data-on] .way-pick {
    color: var(--red);
  }

  /* THE APP'S MARK IN A 28 WELL OF THE SHEET'S OWN SURFACE, then the name, then the chevron that turns as it opens. */
  .way-pick {
    gap: var(--sp-3);
  }

  .mark {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: currentColor;
  }

  .mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  @media (forced-colors: active) {
    .mark {
      fill: CanvasText;
    }
  }

  .way-mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink);
  }

  /* THE SIX BOXES UNDER THE SETUP LINE take the lines' own surface, since the way they sit in is the board's colour and
     the boxes' usual fill would vanish into it. */
  .way-body :global(.code-box) {
    background: var(--tile);
  }

  .way-title {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .way-chev {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
    transition: transform var(--d-state) var(--ease-standard);
  }

  .way[data-on] .way-chev {
    transform: rotate(90deg);
  }

  .way-pick:focus-visible {
    outline: 2px solid var(--on);
    outline-offset: -2px;
  }

  .way-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: 0 var(--sp-4) var(--sp-4);
  }

  .hint {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .step {
    margin: var(--sp-1) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* A LINE AND ITS COPY on one row where both fit, the button under the line where they do not. */
  .copy-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE ONE PLACE A MONOSPACE FACE IS RIGHT: a command or a key is compared character by character, and breaks anywhere
     so a 43-character key never pushes the sheet sideways. On the tile's own surface, inside the board-coloured tile. */
  .mono {
    flex: 1 1 24ch;
    min-inline-size: 0;
    padding-block: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .minted {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  /* THE LIVE ROW: a mark and its sentence, the mark in the accent once it is connected; the words carry it either way. */
  .live {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .live[data-state='connected'] {
    color: var(--ink);
  }

  .live[data-state='connected'] > span {
    color: var(--red);
  }
</style>
