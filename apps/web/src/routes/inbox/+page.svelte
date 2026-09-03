<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).
-->
<script lang="ts">
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { INBOX, NOW } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let open = $state<string | null>(INBOX[0]?.id ?? null);
</script>

<PageHead
  title={copy.inbox}
  count={INBOX.length}
  subtitle="Arrivals no pattern matched. Everything a rule recognised is already a row."
/>

<div class="page">
  {#if INBOX.length === 0}
    <Empty kind="cleared" title="Nothing unmatched." body="Every arrival since you last looked became a row." />
  {:else}
    <ul class="ledger">
      {#each INBOX as item}
        <li>
          <button
            type="button"
            class="line line-tall"
            aria-expanded={open === item.id}
            onclick={() => (open = open === item.id ? null : item.id)}
          >
            <span class="seq">{item.from.split('@')[1]}</span>
            <span class="line-main">
              <span class="line-title">{item.subject}</span>
              <span class="line-detail">{item.from}</span>
            </span>
            <span class="line-amount"></span>
            <span class="line-when">{relative(item.arrived.slice(0, 10), NOW)}</span>
          </button>

          {#if open === item.id}
            <div class="body">
              <!-- Plain text. Never the renderer, never {@html}, never a link the record made. -->
              <p class="raw">{item.body}</p>

              {#if item.suggestion}
                <div class="pattern">
                  <p class="pattern-head">
                    <Icon name="filter" size="s" />
                    A pattern that would have claimed this
                  </p>
                  <code class="pattern-code">{item.suggestion}</code>
                  <div class="pattern-actions">
                    <Button weight="primary">Make it a rule</Button>
                    <Button weight="bare">Not this one</Button>
                  </div>
                </div>
              {:else}
                <p class="no-pattern">No pattern fits this one. Turn it into a row by hand, or leave it.</p>
              {/if}

              <div class="actions">
                <Button>Create a row</Button>
                <Button weight="bare">Archive</Button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--sp-5) var(--sp-7);
    max-inline-size: 980px;
  }

  .line {
    inline-size: 100%;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .body {
    padding: 0 var(--sp-4) var(--sp-4) calc(12ch + var(--sp-4) * 2);
    background: var(--s1);
  }

  .raw {
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .pattern {
    margin-block-start: var(--sp-3);
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .pattern-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .pattern-code {
    display: block;
    margin-block: var(--sp-2);
    color: var(--accent-text);
    font-family: var(--font-id);
    font-size: var(--t-ui);
  }

  .pattern-actions,
  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .no-pattern {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-3) var(--sp-3) var(--sp-7);
    }

    .body {
      padding-inline-start: var(--sp-4);
    }
  }
</style>
