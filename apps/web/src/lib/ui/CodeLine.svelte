<!--
  A line somebody copies and pastes somewhere else: an agent prompt, a terminal command, a key's name.

  THE BLOCK: `--tile-2`, radius 8, 8 by 12 in, the line at 13/20 in the app's mono face and in ink, wrapping anywhere
  so a long command never pushes the page sideways at 320. One Copy at its trailing edge, a quiet small button; pressed,
  it says "Copied" with a tick for a second and a half, and that is the whole receipt: no toast says it again. A copy the
  browser refuses is said once, in the toast, because the button cannot say it.

  WHOLE WORDS (`words`): a command breaks only at its spaces, and a word longer than the block scrolls inside it, so
  "install.sh" is never read as "instal / l.sh". While it scrolls it is a tab stop, so a keyboard can scroll it too.

  INLINE (`inline`): a name in a sentence, 13px mono on `--tile-2` at radius 4, 2 by 6 in, no button.
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { toasts } from './toast.svelte.ts';

  let { text, inline = false, label, words: whole = false }: { text: string; inline?: boolean; label?: string | undefined; words?: boolean } = $props();

  /* This part's own words, in a `words` object in the module that draws them. */
  const words = { copy: 'Copy', copied: 'Copied' } as const;

  /** How long "Copied" stands before the button says Copy again. */
  const SAID = 1_500;
  /** A clipboard that has not answered in this long is not going to (`clipboard.ts` measured why). */
  const DEADLINE = 1_000;

  let copied = $state(false);
  let back: ReturnType<typeof setTimeout> | null = null;

  async function take() {
    let wrote = false;
    try {
      wrote = await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), DEADLINE)),
      ]);
    } catch {
      wrote = false;
    }
    if (!wrote) {
      toasts.push(copy.copyRefused, { intent: 'warn' });
      return;
    }
    copied = true;
    if (back !== null) clearTimeout(back);
    back = setTimeout(() => (copied = false), SAID);
  }

  $effect(() => () => {
    if (back !== null) clearTimeout(back);
  });

  /**
   * A WORD TOO LONG FOR THE BLOCK SCROLLS, AND THE KEYBOARD CAN SCROLL IT (skills pass, 2 Nov; axe
   * `scrollable-region-focusable` on Made at 320): only while it overflows, the block takes a tab stop and its label, so
   * the arrow keys move along it; a command that fits is no stop at all.
   */
  function reachable(el: HTMLElement): () => void {
    const fit = () => {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.tabIndex = 0;
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', label ?? text);
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    };
    fit();
    const seen = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    seen?.observe(el);
    return () => seen?.disconnect();
  }
</script>

{#if inline}
  <code class="code-inline">{text}</code>
{:else}
  <div class="code-line">
    {#if whole}
      <code class="code-text" data-words {@attach reachable}>{text}</code>
    {:else}
      <code class="code-text">{text}</code>
    {/if}
    <span class="code-copy">
      <Button size="sm" weight="quiet" onclick={() => void take()} aria-label={label ? `${words.copy} ${label}` : undefined}>
        <Icon name={copied ? 'check' : 'copy'} size="m" /><span aria-live="polite">{copied ? words.copied : words.copy}</span>
      </Button>
    </span>
  </div>
{/if}

<style>
  /* THE WORDS LEVEL WITH COPY (G25): at the top they sat 6 to 8px above the middle of the button that copies them,
     whatever its height (32 on a desk, 40 or 44 elsewhere). A command that wraps keeps Copy at its middle. */
  .code-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .code-text {
    flex: 1;
    min-inline-size: 0;
    padding-block: var(--sp-1);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: 20px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .code-text[data-words] {
    overflow-wrap: normal;
    overflow-x: auto;
  }

  /* THE BUTTON ON THE BLOCK'S OWN FILL takes the tile's colour, so it reads as a control on the grey. */
  .code-copy {
    flex: none;
    display: flex;
  }


  .code-line .code-copy :global(.btn[data-weight]) {
    --btn-fill: var(--tile);
  }

  .code-inline {
    padding: 2px 6px;
    background: var(--tile-2);
    border-radius: var(--r-xs);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }
</style>
