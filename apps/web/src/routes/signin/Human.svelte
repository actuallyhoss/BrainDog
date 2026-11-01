<!--
  @component
  Cloudflare's check on the sign-in link form, drawn as the sign-up form draws it (`../signup/turnstile.ts`). Shown only
  when `/auth/methods` hands a site key. The answer is good once, so `reset()` asks again after a refused send.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import { loadWidget, widgetWords, type WidgetState } from '../signup/turnstile.ts';

  let { siteKey, answer = $bindable(null) }: { siteKey: string; answer?: string | null } = $props();

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

<div class="human" role="group" aria-label={copy.signupHuman}>
  <div class="slot" class:slot-off={phase === 'failed'} bind:this={slot}></div>
  {#if phase === 'failed'}
    <div class="failed">
      <p class="human-line" role="alert">{words.line}</p>
      <span class="again"><Button onclick={() => void draw()}>{words.again}</Button></span>
    </div>
  {/if}
</div>

<style>
  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  .slot-off {
    display: none;
  }

  .failed {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 65px;
  }

  .human-line {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .again :global(.btn) {
    min-block-size: 44px;
  }
</style>
