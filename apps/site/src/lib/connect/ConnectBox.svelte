<!--
  Connect your agent in one line: a tab for each app with its maker's mark, the code bar saying where the code goes,
  Copy, the code, and the one line that says what happens next. The steps are `apps.ts`'s; nothing here types one.

  EVERY APP IS IN THE HTML. The tabs are a real tablist (arrows, Home and End move, the chosen one takes focus), and a
  tab shows its own panel. Claude has two ways in, the app's connector address and the terminal line, chosen with
  two small toggles in the code bar. With scripting off, the <noscript> rule lays every app out one under another,
  each headed by its name and each way by where it goes, and hides the tabs, the toggles and Copy, which need a script.

  Copy writes to the clipboard and says Copied for 1.6 s; when the browser refuses, the code is selected instead so
  the reader can copy it by hand.

  `tone="night"` is for a black card that already draws the dark tile (the home page's): the box drops its own.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import { CONNECT, CONNECT_WORDS as W, COPIED_MS, hintParts } from './apps.ts';

  let { tone }: { tone?: 'night' } = $props();

  const uid = $props.id();
  let cur = $state(0);
  let way = $state(0);
  /** What each way's Copy button says, by `app-way`. */
  let said = $state<Record<string, string>>({});
  const tabs: HTMLButtonElement[] = [];
  const codes: Record<string, HTMLElement> = {};
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  const pick = (i: number, focus = false): void => {
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

<div class="cbox" data-tone={tone}>
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
      <h2 class="cbox-name"><AgentMark id={app.id} size={16} />{app.name}</h2>
      {#each app.ways as w, j (w.where)}
        {@const key = `${app.id}-${j}`}
        <div class="cbox-way" hidden={many && i === cur ? j !== way : false}>
          <div class="code">
            <div class="code-bar">
              {#if many}
                <span class="cbox-ways" role="group" aria-label={W.ways}>
                  {#each app.ways as o, k (o.where)}
                    <button type="button" class="vbtn" aria-pressed={k === j} onclick={() => (way = k)}>{o.where}</button>
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
    min-inline-size: 0;
    padding: 22px;
    border-radius: 16px;
    background: var(--night-2);
    color: var(--on-night);
  }

  .cbox[data-tone='night'] {
    padding: 0;
    background: none;
  }

  .ctabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-block-end: 12px;
  }

  .ctabs button {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border-radius: 8px;
    font: 500 14px/1 var(--ui);
    color: var(--on-night-2);
    cursor: pointer;
  }

  .ctabs button[aria-selected='true'] {
    color: var(--on-night);
  }

  @media (hover: hover) {
    .ctabs button:hover {
      color: var(--on-night);
    }
  }

  .ctabs button[aria-selected='true'] {
    background: var(--night-tint-2);
  }

  .cbox-pane[hidden],
  .cbox-way[hidden] {
    display: none;
  }

  .cbox-name {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 600 17px/1.2 var(--head);
    letter-spacing: -0.024em;
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

  .code {
    overflow: hidden;
    border-radius: 12px;
    background: var(--term);
    color: var(--term-ink);
  }

  .code-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-block-end: 1px solid var(--night-rule);
    color: var(--on-night-2);
    font: 500 13px/1 var(--ui);
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
    font: 400 13px/1 var(--mono);
  }

  .vbtn,
  .cbox-copy {
    all: unset;
    cursor: pointer;
    border-radius: 8px;
    font: 500 13px/1 var(--ui);
  }

  /* The secondary light of the night, not the terminal's dim grey: that grey is 4.45 to 1 on the dark terminal. */
  .vbtn {
    padding: 6px 8px;
    color: var(--on-night-2);
  }

  .vbtn[aria-pressed='true'] {
    background: var(--night-tint-2);
    color: var(--on-night);
  }

  .cbox-copy {
    flex: none;
    padding: 6px 10px;
    background: var(--night-2);
    color: var(--on-night);
  }

  pre {
    margin: 0;
    padding: 15px 16px;
    font: 400 14px/1.6 var(--mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .hint {
    margin: 12px 0 0;
    font-size: var(--t-site-15);
    line-height: 1.45;
    color: var(--on-night-2);
  }

  .hint code {
    font: 400 0.92em/1 var(--mono);
    color: var(--on-night);
  }

  /* THE SITE'S ONE RING, the night's ink on the night (`--focus`): it was red here, the start button's colour. */
  .ctabs button:focus-visible,
  .vbtn:focus-visible,
  .cbox-copy:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    .ctabs button,
    .vbtn,
    .cbox-copy {
      min-block-size: 44px;
      box-sizing: border-box;
    }
  }

  @media (max-width: 760px) {
    .cbox:not([data-tone='night']) {
      padding: 16px;
    }
  }

  /* FOUR TOOLS, TWO BY TWO ON A PHONE: in one wrapping row the last one was left alone on a second line. */
  @media (max-width: 520px) {
    .ctabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (forced-colors: active) {
    .ctabs button[aria-selected='true'],
    .vbtn[aria-pressed='true'] {
      outline: 2px solid Highlight;
    }
  }
</style>
