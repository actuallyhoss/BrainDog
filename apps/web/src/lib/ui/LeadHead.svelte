<!--
  The head of a screen's lead tile, 900px and wider: a quiet line saying when this is, the keys or a control at its
  end, and the screen's one sentence as the headline, with the phrase that needs the reader in the alert colour.

  IT IS THE PAGE'S `h1` ON A WIDE SCREEN. `PageHead` with `led` draws nothing there, so the outline has one heading at
  every width. Below 900px this draws nothing and the phone's head is `PageHead`'s.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    meta,
    sentence,
    needs,
    aside,
  }: {
    /** The quiet line over the headline: the day, and what the screen counts. */
    meta?: string | undefined;
    sentence: string;
    /** The phrase inside `sentence` that needs the reader. */
    needs?: string | undefined;
    aside?: Snippet | undefined;
  } = $props();

  const said = $derived.by(() => {
    const at = needs ? sentence.indexOf(needs) : -1;
    return at < 0 || !needs ? { before: sentence, needs: '', after: '' } : { before: sentence.slice(0, at), needs, after: sentence.slice(at + needs.length) };
  });
</script>

<header class="lead-head">
  <div class="lead-top">
    {#if meta}<p class="lead-meta">{meta}</p>{/if}
    {#if aside}<div class="lead-aside">{@render aside()}</div>{/if}
  </div>
  <h1 class="lead-said">{said.before}{#if said.needs}<span class="lead-needs">{said.needs}</span>{/if}{said.after}</h1>
</header>

<style>
  .lead-head {
    display: none;
  }

  @media (width >= 900px) {
    .lead-head {
      display: grid;
      gap: var(--sp-2);
      min-inline-size: 0;
      padding: var(--sp-1) var(--sp-2) var(--sp-4);
    }

    .lead-top {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      min-block-size: 28px;
    }

    .lead-meta {
      margin: 0;
      color: var(--ink2);
      font-size: var(--t-sm);
    }

    .lead-aside {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      margin-inline-start: auto;
    }

    .lead-said {
      max-inline-size: 22em;
      margin: 0;
      color: var(--ink);
      font-family: var(--font-ui);
      font-size: var(--t-3xl);
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.03em;
      text-wrap: balance;
    }

    .lead-needs {
      color: var(--danger-text);
    }
  }
</style>
