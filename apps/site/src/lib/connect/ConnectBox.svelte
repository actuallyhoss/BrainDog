<!--
  Connect your agent in one line: a tab for each app with its maker's mark, the code bar saying where the code goes,
  Copy, the code, and the one line that says what happens next. The steps are `apps.ts`'s; nothing here types one.

  EVERY APP IS IN THE HTML. The tabs are a real tablist (arrows, Home and End move, the chosen one takes focus), and a
  tab shows its own panel. Claude has two ways in, the app's connector address and the terminal line, chosen with
  two small toggles in the code bar. With scripting off, the <noscript> rule lays every app out one under another,
  each headed by its name and each way by where it goes, and hides the tabs, the toggles and Copy, which need a script.

  Copy writes to the clipboard and says Copied for 1.6 s; when the browser refuses, the code is selected instead so
  the reader can copy it by hand.

  ON A TILE (the redo of 2 November): the app's segmented control for the apps, the code in the tile's well in Geist
  Mono, and Copy as a quiet button. A pane chosen after the first draw comes up in place over `--d-swap` with the
  app's 2px settle, so a change of app reads as a change and not a jump.

  `tone="night"` is kept for a caller that still passes it, and draws the same box.

  EACH APP'S NAME IS A HEADING ONE LEVEL UNDER THE BOX'S OWN: `level` says which, 3 under the connect page's h2 and 4
  under the home page's h3 tile, so the outline a screen reader or a search engine reads stays whole.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import { CONNECT, CONNECT_WORDS as W, COPIED_MS, hintParts } from './apps.ts';

  let { tone, level = 3 }: { tone?: 'night'; level?: 3 | 4 } = $props();

  const uid = $props.id();
  let cur = $state(0);
  let way = $state(0);
  /** Whether the reader has chosen an app or a way yet: a pane shown before that is the first draw and is still. */
  let moved = $state(false);
  /** What each way's Copy button says, by `app-way`. */
  let said = $state<Record<string, string>>({});
  const tabs: HTMLButtonElement[] = [];
  const codes: Record<string, HTMLElement> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  const pick = (i: number, focus = false): void => {
    moved = true;
    cur = (i + CONNECT.length) % CONNECT.length;
    way = 0;
    if (focus) tabs[cur]?.focus();
  };

  const onkey = (e: KeyboardEvent): void => {
    const to: Record<string, number> = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 0, End: CONNECT.length - 1 };
    if (!(e.key in to)) return;
    e.preventDefault();
    pick(to[e.key] ?? 0, true);
  };

  const flash = (key: string, words: string): void => {
    clearTimeout(timers[key]);
    said[key] = words;
    timers[key] = setTimeout(() => delete said[key], COPIED_MS);
  };

  const select = (key: string): void => {
    const el = codes[key];
    if (!el) return;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      flash(key, W.selected);
    } catch {}
  };

  const copy = (key: string, text: string): void => {
    try {
      navigator.clipboard.writeText(text).then(
        () => flash(key, W.copied),
        () => select(key),
      );
    } catch {
      select(key);
    }
  };
</script>

<noscript>
  <style>
    .cbox .cbox-pane, .cbox .cbox-way { display: block !important; }
    .cbox .cbox-pane + .cbox-pane { margin-block-start: 28px; }
    .cbox .cbox-name, .cbox .cbox-where { position: static !important; inline-size: auto !important; block-size: auto !important; clip-path: none !important; overflow: visible !important; white-space: normal !important; }
    .cbox .cbox-way + .cbox-way { margin-block-start: 16px; }
    .cbox .ctabs, .cbox .cbox-ways, .cbox .cbox-copy { display: none !important; }
  </style>
</noscript>

<div class="cbox" data-tone={tone} data-moved={moved ? '' : undefined}>
  <div class="ctabs" role="tablist" aria-label={W.tabs}>
    {#each CONNECT as app, i (app.id)}
      <button
        type="button"
        role="tab"
        id="{uid}-tab-{app.id}"
        aria-selected={i === cur}
        aria-controls="{uid}-pane-{app.id}"
        tabindex={i === cur ? 0 : -1}
        bind:this={tabs[i]}
        onclick={() => pick(i)}
        onkeydown={onkey}><AgentMark id={app.id} size={14} />{app.name}</button
      >
    {/each}
  </div>

  {#each CONNECT as app, i (app.id)}
    {@const many = app.ways.length > 1}
    <div class="cbox-pane" role="tabpanel" id="{uid}-pane-{app.id}" aria-labelledby="{uid}-tab-{app.id}" hidden={i !== cur}>
      <svelte:element this={`h${level}`} class="cbox-name"><AgentMark id={app.id} size={16} />{app.name}</svelte:element>
      {#each app.ways as w, j (w.where)}
        {@const key = `${app.id}-${j}`}
        <div class="cbox-way" hidden={many && i === cur ? j !== way : false}>
          <div class="code">
            <div class="code-bar">
              {#if many}
                <span class="cbox-ways" role="group" aria-label={W.ways}>
                  {#each app.ways as o, k (o.where)}
                    <button type="button" class="vbtn" aria-pressed={k === j} onclick={() => ((moved = true), (way = k))}>{o.where}</button>
                  {/each}
                </span>
              {/if}
              <span class="cbox-where" class:quiet={many}>{#if w.file}<code>{w.where}</code>{:else}{w.where}{/if}</span>
              <button type="button" class="cbox-copy" onclick={() => copy(key, w.code)}><span aria-live="polite">{said[key] ?? W.copy}</span></button>
            </div>
            <pre bind:this={codes[key]}>{w.code}</pre>
          </div>
          <p class="hint">
            {#each hintParts(w.hint) as part, n (n)}{#if part.code}<code>{part.text}</code>{:else}{part.text}{/if}{/each}
          </p>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .cbox {
    container: cbox / inline-size;
    min-inline-size: 0;
    color: var(--ink);
  }

  /* THE APPS, the app's segmented control: a well's track, the chosen one on the segment's own fill. */
  .ctabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-block-end: var(--sp-3);
    padding: 3px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .ctabs button {
    /* NOT `all: unset`, which would take the a11y layer's focus ring with it. */
    appearance: none;
    margin: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    block-size: 30px;
    padding-inline: 10px;
    border-radius: 6px;
    color: var(--ink-2);
    cursor: pointer;
    font: 500 var(--fs-ctl) / 1 var(--font-ui);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) {
    .ctabs button:hover {
      color: var(--ink);
    }
  }

  .ctabs button[aria-selected='true'] {
    background: var(--segment-on);
    color: var(--ink);
  }

  .cbox-pane[hidden],
  .cbox-way[hidden] {
    display: none;
  }

  /* A PANE CHOSEN AFTER THE FIRST DRAW comes up in place (the app's swap): nothing beside it moves. */
  .cbox[data-moved] .cbox-pane:not([hidden]),
  .cbox[data-moved] .cbox-way:not([hidden]) {
    animation: swap-in var(--d-swap) var(--ease-out) both;
  }

  @media (prefers-reduced-motion: reduce) {
    .cbox[data-moved] .cbox-pane:not([hidden]),
    .cbox[data-moved] .cbox-way:not([hidden]) {
      animation: none;
    }
  }

  .cbox-name {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 600 var(--fs-head) / 1.2 var(--font-ui);
  }

  /* Named in words for a screen reader; the tab already says it on screen. */
  .cbox-name,
  .cbox-where.quiet {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE CODE, in the tile's well: where it goes over it, then the line itself in Geist Mono. */
  .code {
    overflow: hidden;
    border-radius: var(--r-pop);
    background: var(--tile-2);
    color: var(--ink);
  }

  .code-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 14px;
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
    font: 500 var(--fs-meta) / 1 var(--font-ui);
  }

  .cbox-where {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cbox-ways {
    flex: 1;
    display: flex;
    gap: 2px;
  }

  .code-bar code {
    font: 400 var(--fs-meta) / 1 var(--font-mono);
  }

  .vbtn,
  .cbox-copy {
    /* NOT `all: unset`, which would take the a11y layer's focus ring with it. */
    appearance: none;
    margin: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    border-radius: 6px;
    font: 500 var(--fs-meta) / 1 var(--font-ui);
  }

  .vbtn {
    padding: 7px 8px;
    color: var(--ink-2);
  }

  .vbtn[aria-pressed='true'] {
    background: var(--tile);
    color: var(--ink);
  }

  .cbox-copy {
    flex: none;
    padding: 7px 10px;
    background: var(--tile);
    color: var(--ink);
  }

  @media (hover: hover) {
    .cbox-copy:hover {
      background: var(--hover);
    }
  }

  pre {
    margin: 0;
    padding: 14px 16px;
    font: 400 var(--t-site-14) / 1.6 var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .hint {
    margin: 12px 0 0;
    color: var(--ink-2);
    font-size: var(--t-site-14);
    line-height: 1.5;
  }

  .hint code {
    color: var(--ink);
    font: 400 0.92em/1 var(--font-mono);
  }

  @media (pointer: coarse) {
    .ctabs button,
    .vbtn,
    .cbox-copy {
      min-block-size: 44px;
      box-sizing: border-box;
    }
  }

  @media (forced-colors: active) {
    .ctabs button[aria-selected='true'],
    .vbtn[aria-pressed='true'] {
      outline: 2px solid Highlight;
    }
  }

  /* NARROW, THE FOUR APPS TAKE TWO ROWS OF TWO rather than three and one. */
  @container cbox (width < 400px) {
    .ctabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      inline-size: auto;
    }
  }
</style>
