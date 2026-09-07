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
  import * as clipboard from '../clipboard.ts';
  import type { Snippet } from 'svelte';

  import Icon from './Icon.svelte';
  import type { IconName } from './icons.ts';

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
    lines,
    compact = false,
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
    /** One line per thing that was wrong, each already a whole sentence. */
    lines?: string[] | undefined;
    /**
     * Inside a frame that already has one.
     *
     * A block draws its own border and heading, so the full card here would be a box in a box and a
     * second title under the first. Compact keeps the glyph and the words and drops the frame —
     * the same five designed states rather than a sixth shape that drifts from them.
     */
    compact?: boolean;
  } = $props();

  /* One glyph per kind. Five states were designed as five different things and then drawn as one
     paragraph in five colours, so the difference between "nothing here yet" and "you cannot see
     this" was carried by the sentence alone. */
  const GLYPH: Record<EmptyKind, IconName> = {
    'no-data-yet': 'plus',
    'no-results': 'search',
    cleared: 'check',
    'no-permission': 'lock',
    error: 'alert',
  };
</script>

<div class="empty" data-kind={kind} class:compact>
  <span class="empty-glyph" aria-hidden="true"><Icon name={GLYPH[kind]} size="l" /></span>
  {#if heading}
    <h1 class="empty-title">{title}</h1>
  {:else}
    <p class="empty-title">{title}</p>
  {/if}
  {#if body}<p class="empty-body">{body}</p>{/if}
  {#if lines?.length}
    <ul class="empty-lines">
      {#each lines as line}<li>{line}</li>{/each}
    </ul>
  {/if}
  {#if query}<p class="empty-query"><code>{query}</code></p>{/if}
  <!--
    THE REQUEST ID IS A FACT ABOUT A FAILURE, and it appeared on four `no-results` screens where
    nothing had failed — which teaches a reader that it means nothing, and it is the one thing on
    the screen that has to mean something when it matters. `kind === 'error'` is the only state
    there is a request to look up for: a spoken id that resolves to nothing was never a request.

    AND IT IS COPYABLE, which `13 §5.2` asks for in as many words. One noun and an opaque token
    with no sentence and no affordance is a string somebody transcribes wrong into an email.
  -->
  {#if rid && kind === 'error'}
    <p class="empty-rid">
      If you report this, quote
      <button type="button" class="rid tap" onclick={() => void clipboard.put(rid)}>
        <code>{rid}</code><Icon name="copy" size="s" />
      </button>
    </p>
  {/if}
  {#if agentPrompt}
    <p class="empty-agent">Or from any session:</p>
    <pre class="empty-prompt"><code>{agentPrompt}</code></pre>
  {/if}
  {#if actions}<div class="empty-actions">{@render actions()}</div>{/if}
</div>

<style>
  /* A control, because it is one: the id is there to be taken somewhere else. */
  .rid {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

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
  /* It takes the kind's tone where there is one, and the plain edge where there is not. Absence is
     not an alarm: `no-data-yet` and `no-results` are ordinary and must not arrive in the danger
     colour just because they are empty. */
  .empty-glyph {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    margin-block-end: var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
  }

  .empty[data-kind='error'] .empty-glyph {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--line));
    color: var(--danger);
  }

  .empty[data-kind='cleared'] .empty-glyph {
    border-color: color-mix(in srgb, var(--earn) 40%, var(--line));
    color: var(--earn);
  }

  .empty-title {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  /* The refusals, as a list, because they are several separate facts and a joined sentence reads as
     one. Monospaced: every one of them quotes a clause somebody wrote. */
  .empty-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    list-style: none;
  }

  .empty.compact {
    padding: var(--sp-3) 0 var(--sp-2);
    background: none;
    border: 0;
  }

  .empty.compact .empty-glyph {
    inline-size: 28px;
    block-size: 28px;
    margin-block-end: var(--sp-2);
  }

  .empty.compact .empty-title {
    font-size: var(--t-md);
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
