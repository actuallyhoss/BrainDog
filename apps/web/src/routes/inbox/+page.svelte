<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { INBOX, NOW } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let open = $state<string | null>(INBOX[0]?.id ?? null);
</script>

<svelte:head><title>{titleOf(copy.inbox)}</title></svelte:head>

<PageHead icon="inbox"
  title={copy.inbox}
  count={INBOX.length}
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
            <!-- A row that expands should say so. `aria-expanded` told a screen reader and nothing
                 told anybody else. -->
            <!-- THE DOMAIN, ELLIPSISED AND CARRYING THE WHOLE OF ITSELF. `.seq` is a twelve-character
                 column because a spoken id is `#41`; a domain is not, so `fenwick.example.com`
                 arrived as `fenwick.examp` — hard-cut, with no ellipsis to say it had been. Six
                 senders in a row, each unreadable and each unreadable in the same way, so the column
                 said "example" six times and nothing else. -->
            <span class="seq" data-open={open === item.id ? '' : undefined} title={item.from}>
              <Icon name="chevronDown" size="s" /><span class="host">{item.from.split('@')[1]}</span>
            </span>
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
                  <!-- IT WAS A DSL STRING UNDER THE HIGHEST-EMPHASIS CONTROL ON THE PAGE.
                       `services where provider is Fenwick Cloud → set renews`, in a code block, on
                       day one, beside a red primary button — so the loudest thing on the screen was
                       a language nobody has been taught. `claimed` and `pattern` are the schema's
                       words too; what a person is being offered is a rule that files the next one
                       like this without asking. -->
                  <p class="pattern-head">
                    <Icon name="filter" size="s" />
                    {copy.ruleOffer}
                  </p>
                  <p class="pattern-said">{item.suggestion}</p>
                  <div class="pattern-actions">
                    <Button weight="primary" onclick={() => toasts.push(copy.notWritten('The rule would be written and tested against the last 30 days'), { intent: 'warn' })}>{copy.makeRule}</Button>
                    <Button
                      weight="bare"
                      onclick={() => toasts.push(copy.notWritten('This arrival would be left for a different pattern'))}
                    >{copy.notThisOne}</Button>
                  </div>
                </div>
              {/if}
              <!-- THE PROSE THAT WAS HERE RESTATED THE TWO BUTTONS BELOW IT, and mismapped one:
                   "or leave it" reads as doing nothing, and the control it pointed at was `Archive`,
                   which has a consequence. The buttons are the instruction. -->

              <div class="actions">
                <Button onclick={() => toasts.push(copy.notWritten('A row would be created from this arrival'), { intent: 'warn' })}
                  >{copy.fileIt}</Button
                >
                <Button
                  weight="bare"
                  onclick={() => toasts.push(copy.notWritten('This arrival would be archived, and its bytes kept'))}
                >{copy.archiveArrival}</Button>
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
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 980px;
  }

  .line {
    /* WIDER THAN A SPOKEN ID, because what is in it is a domain. Sixteen characters is most of them
       and the rest ellipsise, which is a truncation somebody can see. */
    grid-template-columns: 16ch minmax(0, 1fr) auto 9ch;
    inline-size: 100%;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .body {
    padding: 0 var(--sp-4) var(--sp-4) calc(16ch + var(--sp-4) * 2);
    background: var(--s1);
  }

  /* AND IT SHRINKS. A grid child's floor is its content unless it is told otherwise, so without this
     the column kept the widest domain's width and the ellipsis never applied — the parent clipped
     instead, which is a cut with nothing to say it happened. */
  .host {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* Ink, not the accent. This is the rule the record is offering to write — a thing to READ and
     agree with — and the accent is spent on the button beside it, which is the part that is
     actually a decision.

     AND NOT MONOSPACE EITHER. It was a `<code>` block carrying `services where provider is Fenwick
     Cloud → set renews`: a language, set in the face this product reserves for ids, under the
     loudest control on the screen, on day one. What it says is a sentence, so it is set as one. */
  .pattern-said {
    display: block;
    margin-block: var(--sp-2);
    color: var(--ink);
    font-size: var(--t-ui);
    line-height: 1.55;
  }

  .pattern-actions,
  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .body {
      padding-inline-start: var(--sp-4);
    }
  }

  /* The chevron turns rather than swapping glyph: one shape, one rotation, and the motion says the
     row opened even when the content below it is off-screen. */
  .seq :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .seq[data-open] :global(svg) {
    transform: rotate(180deg);
  }
</style>
