<!--
  One shape, five states. Collapsing them into a single "Nothing here yet" is the failure.

  The record is empty on day one, and that is the likeliest recorded cause of death — an empty TYPED
  register is less legible than an empty notes app, because the columns advertise what you have not
  done. So an empty state is a class of designed thing, not an afterthought (13 §5).

  Three rules the copy obeys: be specific about what WILL be here; a CTA is Verb + Noun, never
  "Get Started"; and the CTA is a real button or link, so it joins the tab order.

  `cleared` has no action, because nobody manufactures work.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  export type EmptyKind = 'no-data-yet' | 'no-results' | 'cleared' | 'no-permission' | 'error';

  let {
    kind,
    title,
    body,
    query,
    rid,
    actions,
    agentPrompt,
    heading = false,
  }: {
    kind: EmptyKind;
    title: string;
    /**
     * `true` when this empty state IS the page.
     *
     * A not-found route renders nothing but this, so its title is the page's only heading and has
     * to be the `h1` — a document with no level-one heading gives a screen reader nothing to jump
     * to and nothing to announce, and every one of these pages was a `<p>`. Inside a block or a
     * section it stays a paragraph, because the block already has the heading and a second `h1`
     * halfway down the page is worse than none.
     */
    heading?: boolean;
    body?: string | undefined;
    /** Quoted VERBATIM. "38 rows, none matching `overdue`" is the whole of the state. */
    query?: string | undefined;
    /** A copyable request id, always. One sentence in the house voice, never a stack trace. */
    rid?: string | undefined;
    actions?: Snippet | undefined;
    /** The highest-value line in the product: the buyer already has agents, and an empty register is
        the right place to say so. */
    agentPrompt?: string | undefined;
  } = $props();
</script>

<div class="empty" data-kind={kind}>
  {#if heading}
    <h1 class="empty-title">{title}</h1>
  {:else}
    <p class="empty-title">{title}</p>
  {/if}
  {#if body}<p class="empty-body">{body}</p>{/if}
  {#if query}<p class="empty-query"><code>{query}</code></p>{/if}
  {#if rid}<p class="empty-rid">Request <code>{rid}</code></p>{/if}
  {#if agentPrompt}
    <p class="empty-agent">Or from any session:</p>
    <pre class="empty-prompt"><code>{agentPrompt}</code></pre>
  {/if}
  {#if actions}<div class="empty-actions">{@render actions()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 56ch;
    padding: var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  /* Nothing is centred: centring one line in a row of left-aligned ones is worse than not marking
     it at all, and a tight empty state inside a block's own frame keeps the page's shape (19 §6). */
  .empty-title {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  .empty-body,
  .empty-agent {
    color: var(--dim);
    max-inline-size: var(--measure);
  }

  .empty-query code,
  .empty-rid code {
    padding: 2px 6px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .empty-rid {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .empty-prompt {
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .empty[data-kind='cleared'] .empty-title {
    color: var(--earn);
  }

  .empty[data-kind='error'] .empty-title {
    color: var(--danger);
  }
</style>
