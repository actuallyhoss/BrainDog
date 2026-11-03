<!--
  A STATUS LINE INSIDE A CARD OR A FORM, AS A FULL-WIDTH BANNER (ui-perfect, 3 Nov). Sam saw "Google is connected. Mail,
  events and contacts arrive within a few minutes." squeezed into a 100px column under two buttons, one or two words a
  line, and still there long after the card said "Connected". This is the one shape for a line like that:

    <Notice tone="good">Google is connected. Mail arrives within a few minutes.</Notice>
    <Notice tone="bad" icon="alert">Could not reach Google. <a href="...">Try again</a></Notice>
    <Notice tone="good" for={4000}>Saved.</Notice>               goes by itself after four seconds
    <Notice tone="warn" onclose={() => (said = null)}>...</Notice>   a Close the reader presses

  IT ALWAYS TAKES THE WHOLE ROW, in any parent: a block, a flex row of buttons (`flex: 1 0 100%`, so it wraps under them
  rather than sharing their line), a grid (`grid-column: 1 / -1`). Never a shrunken column.

  SAY IT ONCE. A line that reports what just happened ("Connected", "Saved", "Sent") is a toast (`toasts.push` in
  `toast.svelte.ts`) when the screen already shows the new state, or a Notice with `for` that goes by itself. A Notice
  that stays is for a state the screen shows nowhere else (a failure, a step still to take).

  Tones: `good` (the `--good` glyph on its tint), `warn`, `bad` (`--red`), `note` (the soft fill, `--ink-2` glyph). The
  words are 14/20 in ink, the glyph 16 on the first line's middle. 12 by 12 in, radius 12. Polite: `role="status"`,
  except `bad`, which is `role="alert"`.
-->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

  let {
    tone = 'note',
    icon,
    for: lasts,
    onclose,
    children,
    actions,
  }: {
    tone?: 'good' | 'warn' | 'bad' | 'note' | undefined;
    /** The glyph; each tone has its own when absent (`check`, `alert`, `alert`, `info`). */
    icon?: IconName | undefined;
    /** Milliseconds it stays before it goes by itself. Absent, it stays until its state does. */
    for?: number | undefined;
    /** Draws a Close at the end; called when it is pressed (and when `for` runs out). */
    onclose?: (() => void) | undefined;
    children: Snippet;
    /** One or two small buttons or links at the end edge. */
    actions?: Snippet | undefined;
  } = $props();

  const GLYPH: Record<'good' | 'warn' | 'bad' | 'note', IconName> = { good: 'check', warn: 'alert', bad: 'alert', note: 'info' };

  let gone = $state(false);
  onMount(() => {
    if (lasts === undefined || lasts <= 0) return;
    const t = setTimeout(() => {
      gone = true;
      onclose?.();
    }, lasts);
    return () => clearTimeout(t);
  });
</script>

{#if !gone}
  <div class="notice" data-tone={tone} role={tone === 'bad' ? 'alert' : 'status'}>
    <span class="notice-glyph" aria-hidden="true"><Icon name={icon ?? GLYPH[tone]} size="s" /></span>
    <span class="notice-words">{@render children()}</span>
    {#if actions}<span class="notice-actions">{@render actions()}</span>{/if}
    {#if onclose}
      <button type="button" class="notice-close tap" aria-label="Close" onclick={() => ((gone = true), onclose?.())}><Icon name="close" size="s" /></button>
    {/if}
  </div>
{/if}

<style>
  /* THE WHOLE ROW, WHATEVER HOLDS IT. */
  .notice {
    display: flex;
    flex: 1 0 100%;
    grid-column: 1 / -1;
    align-items: flex-start;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-field, 12px);
    background: var(--notice-fill);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui, 20px);
    text-wrap: pretty;
  }

  .notice[data-tone='good'] {
    --notice-fill: var(--good-tint, color-mix(in oklab, var(--good) 12%, var(--tile)));
    --notice-glyph: var(--good);
  }

  .notice[data-tone='warn'] {
    --notice-fill: var(--warn-tint, color-mix(in oklab, var(--warn) 12%, var(--tile)));
    --notice-glyph: var(--warn);
  }

  .notice[data-tone='bad'] {
    --notice-fill: var(--red-tint, color-mix(in oklab, var(--red) 10%, var(--tile)));
    --notice-glyph: var(--red);
  }

  .notice[data-tone='note'] {
    --notice-fill: var(--soft-fill, var(--tile-2));
    --notice-glyph: var(--ink-2);
  }

  /* THE GLYPH ON THE FIRST LINE'S MIDDLE: a box one line tall, the 16 icon centred in it. */
  .notice-glyph {
    display: flex;
    flex: none;
    align-items: center;
    block-size: var(--lead-ui, 20px);
    color: var(--notice-glyph);
  }

  .notice-words {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow-wrap: break-word;
  }

  .notice-words :global(a) {
    color: inherit;
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .notice-actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .notice-close {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-3);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .notice-close:hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  @media (forced-colors: active) {
    .notice {
      border: 1px solid CanvasText;
    }
  }
</style>
