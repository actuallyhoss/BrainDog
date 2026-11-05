<!--
  @component
  Cloudflare's check on the sign-in link form, drawn as the sign-up form draws it (`../signup/turnstile.ts`). Shown only
  when `/auth/methods` hands a site key. The answer is good once, so `reset()` asks again after a refused send.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import { loadWidget, reopenForCheck, widgetWords, type WidgetState } from '../signup/turnstile.ts';
  import Notice from './Notice.svelte';
  import { words as entryWords } from './words.ts';

  /* `nudged`: Send was pressed before the check answered, so the slot says what is left to do (the label no longer does). */
  let { siteKey, answer = $bindable(null), nudged = false }: { siteKey: string; answer?: string | null; nudged?: boolean } = $props();

  type Turnstile = { render: (el: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
  const turnstileOf = (): Turnstile | null => (globalThis as { turnstile?: Turnstile }).turnstile ?? null;

  /**
   * THE WIDGET'S OWN SLOT, APART FROM THE LINE THAT SAYS IT FAILED. It was drawn into the same box as the failed line and
   * its Try again, so Svelte's markers for that line and Cloudflare's frame shared one parent; and a first load in a
   * background tab, timed out by a throttled clock, left `widgetId` and the box in a state Try again could not undo
   * until a full reload. Now Try again takes away whatever was drawn, empties the slot and draws afresh, any throw
   * says failed again rather than leaving the box blank, and a tab that comes back into view tries by itself.
   */
  let slot = $state<HTMLElement | null>(null);
  let widgetId: string | null = null;
  let phase = $state<WidgetState>('loading');
  let drawing = false;
  let gone = false;
  const words = $derived(widgetWords(phase));

  function drop(t: Turnstile | null): void {
    if (widgetId === null) return;
    try {
      t?.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
    widgetId = null;
  }

  async function draw(): Promise<void> {
    if (drawing || gone) return;
    drawing = true;
    phase = 'loading';
    answer = null;
    try {
      if (reopenForCheck()) return;
      const loaded = await loadWidget({ doc: document });
      const t = turnstileOf();
      const el = slot;
      if (loaded !== 'ready' || !t || !el || !el.isConnected || gone) {
        phase = 'failed';
        return;
      }
      drop(t);
      el.replaceChildren();
      widgetId = t.render(el, {
        sitekey: siteKey,
        size: 'flexible',
        callback: (a: string) => {
          answer = a;
          phase = 'ready';
        },
        'expired-callback': () => (answer = null),
        'error-callback': () => {
          answer = null;
          phase = 'failed';
        },
      });
      phase = 'ready';
    } catch {
      phase = 'failed';
    } finally {
      drawing = false;
    }
  }

  $effect(() => {
    if (slot !== null) void draw();
  });

  /* A CHECK THAT FAILED WHILE THE TAB WAS OUT OF SIGHT IS TRIED AGAIN WHEN IT COMES BACK. */
  $effect(() => {
    const back = (): void => {
      if (document.visibilityState === 'visible' && phase === 'failed') void draw();
    };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  });

  /** Ask the check again, after a send it refused. */
  export function reset(): void {
    answer = null;
    const t = turnstileOf();
    if (t && widgetId !== null) {
      try {
        t.reset(widgetId);
      } catch {
        void draw();
      }
    }
  }

  onDestroy(() => {
    gone = true;
    drop(turnstileOf());
  });
</script>

<!-- THE SLOT HOLDS THE WIDGET'S 65PX FROM THE FIRST FRAME, so nothing under it moves when it arrives; while it loads the
     slot says so in one quiet line, and once it failed it is one notice with Try again at its end (UI pass, 3 Nov: the
     line said "Try again." beside a button that said it again, squeezed into half the column). -->
<div class="human" role="group" aria-label={copy.signupHuman} data-phase={phase}>
  <div class="slot" class:slot-off={phase === 'failed'} bind:this={slot}></div>
  {#if phase === 'loading'}<p class="waiting" aria-hidden="true">{entryWords.checkLoading}</p>{/if}
  {#if phase === 'failed'}
    <Notice tone="bad" role="alert">
      {entryWords.checkFailed}
      {#snippet action()}<Button size="sm" onclick={() => void draw()}>{words.again}</Button>{/snippet}
    </Notice>
  {:else if nudged}
    <p class="nudge" role="status">{entryWords.checkFirst}</p>
  {/if}
</div>

<style>
  /* 8 UNDER THE FIELD: the widget's frame stood flush on the field's edge. */
  .human {
    position: relative;
    display: grid;
    gap: var(--sp-2);
    min-block-size: 65px;
    inline-size: 100%;
    margin-block-start: var(--sp-2);
  }

  .slot {
    min-block-size: 65px;
  }

  .slot-off {
    display: none;
  }

  /* WHILE CLOUDFLARE'S FRAME IS ON ITS WAY: the slot's own soft box with one quiet line, where the frame will stand. */
  .waiting {
    position: absolute;
    inset: 0 0 auto;
    display: flex;
    align-items: center;
    block-size: 65px;
    margin: 0;
    padding-inline: var(--sp-4);
    border-radius: var(--r-field);
    background: var(--soft-fill);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .nudge {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
