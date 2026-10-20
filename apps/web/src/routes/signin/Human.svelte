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

  let box = $state<HTMLElement | null>(null);
  let widgetId: string | null = null;
  let phase = $state<WidgetState>('loading');
  const words = $derived(widgetWords(phase));

  async function draw(el: HTMLElement): Promise<void> {
    phase = 'loading';
    const loaded = await loadWidget({ doc: document });
    const t = turnstileOf();
    if (loaded === 'ready' && t && widgetId === null && el.isConnected) {
      widgetId = t.render(el, {
        sitekey: siteKey,
        size: 'flexible',
        callback: (a: string) => (answer = a),
        'expired-callback': () => (answer = null),
        'error-callback': () => (answer = null),
      });
    }
    phase = loaded === 'ready' && t ? 'ready' : 'failed';
  }

  $effect(() => {
    if (box !== null) void draw(box);
  });

  /** Ask the check again, after a send it refused. */
  export function reset(): void {
    answer = null;
    const t = turnstileOf();
    if (t && widgetId !== null) t.reset(widgetId);
  }

  onDestroy(() => {
    try {
      if (widgetId !== null) turnstileOf()?.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
  });
</script>

<div class="human" role="group" aria-label={copy.signupHuman} bind:this={box}>
  {#if phase === 'failed'}
    <div class="failed">
      <p class="human-line" role="alert">{words.line}</p>
      <span class="again"><Button onclick={() => box && void draw(box)}>{words.again}</Button></span>
    </div>
  {/if}
</div>

<style>
  .human {
    min-block-size: 65px;
    inline-size: 100%;
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
