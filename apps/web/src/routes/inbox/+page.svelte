<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { titleOf } from '$lib/title.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { DOM_CAP, INBOX as SAMPLE, NOW, SOURCES } from '$lib/record/api.ts';
  import type { InboxItem } from '$lib/record/schema.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /**
   * ON A LIVE RECORD THE INBOX IS THE RECORD'S, its newest page, and nothing of the sample is mixed
   * into it. Until the page arrives the screen draws no rows and no empty state, and a refusal is
   * the record's own sentence: the inbox is an owner's, so anybody else is told so by the record.
   *
   * `sampled` IS A LIVE SHELL WHOSE READ FOUND NO RECORD, which draws the sample as before.
   * `unrouted` IS A HOST OLDER THAN THIS READ: there is a record, so the sample would be a lie about
   * it, and there is no list to draw from it either.
   */
  let live = $state<{ items: InboxItem[]; cursor: number | null } | null>(null);
  let refused = $state<string | null>(null);
  let unrouted = $state(false);
  let sampled = $state(false);
  const fromRecord = $derived(route.data.live && !sampled);
  const INBOX = $derived(fromRecord ? (live?.items ?? []) : SAMPLE);
  const clock = $derived(fromRecord ? Date.now() : NOW);
  const answered = $derived(!fromRecord || live !== null);

  let open = $state<string | null>(route.data.live ? null : (SAMPLE[0]?.id ?? null));

  $effect(() => {
    if (!route.data.live) return;
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    void import('$lib/record/inbox-live.ts')
      .then((m) => m.readInbox(location.origin))
      .then((out) => {
        if (out.from === 'live') {
          live = { items: out.items, cursor: out.cursor };
          open = out.items[0]?.id ?? null;
          ok = true;
        } else if (out.from === 'sample') {
          sampled = true;
          open = SAMPLE[0]?.id ?? null;
          ok = true;
        } else if (out.from === 'unrouted') {
          unrouted = true;
          ok = true;
        } else refused = out.fix;
      })
      .finally(() => closed(ok, at));
  });

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. An inbox longer than one page says so with a control instead of
   * stopping at two hundred without a word. What arrives is added under what is drawn, and a refusal
   * here is said under the list, with the arrivals already drawn left where they are.
   */
  let older = $state(false);
  let olderFix = $state<string | null>(null);
  async function loadOlder() {
    const had = live;
    if (!had || had.cursor === null || older) return;
    older = true;
    olderFix = null;
    try {
      const m = await import('$lib/record/inbox-live.ts');
      const out = await m.readInbox(location.origin, undefined, had.cursor);
      if (out.from === 'live') live = { items: [...had.items, ...out.items], cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * THE SAMPLE COMPUTES ITS CONTENT SYNCHRONOUSLY, AND A LIVE RECORD DOES NOT.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. On the sample this claim is true as the screen mounts. On
   * a live record the read above is bracketed with `opened()` and `closed()`, and a call still out
   * takes the attribute away whatever this line says, so the claim is only made once the answer is in.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.inbox)}</title></svelte:head>

<PageHead icon="inbox"
  title={copy.inbox}
  count={answered && !unrouted && !refused ? INBOX.length : undefined}
  atLeast={fromRecord && live !== null && live.cursor !== null}
/>

<div class="page">
  {#if refused}
    <Empty kind="error" title={refused} />
  {:else if !answered || unrouted}
    <!-- Nothing before the first answer, and nothing from a host that has no inbox to read. -->
  {:else if INBOX.length === 0}
    <!--
      AN EMPTY INBOX IS TWO DIFFERENT FACTS AND THIS DREW ONE OF THEM, WRONGLY.

      `<Empty kind="cleared" title="Nothing unmatched." body="Every arrival since you last looked
      became a row." />`. The check glyph means *you finished*, and it was the day-one state of a
      record with no connector: nothing had ever come in, nothing could until one existed, and the
      screen that makes one is `/settings/ingest`, to which this page had no link. So a first-time
      reader got a green tick and the impression the feature was working.

      The body asserted a history that had not happened, and it said `arrival`, which is the word
      `copy.ts` argues against directly above the button eight lines below. Both sentences were
      typed here rather than in `copy.ts`, which is precisely why the rename that produced
      `archiveArrival` never reached them.

      A LIVE RECORD CANNOT TELL THESE APART FROM THE INBOX ALONE, so it draws the sentence that is
      true in both, without the tick, and with the door to a connector.
    -->
    {#if fromRecord}
      <Empty kind="no-data-yet" title={copy.inboxClear} body={copy.inboxClearWhy}>
        {#snippet actions()}<Button href="/settings/ingest">{copy.inboxConnect}</Button>{/snippet}
      </Empty>
    {:else if SOURCES.length === 0}
      <Empty kind="no-data-yet" title={copy.inboxNothingYet} body={copy.inboxNothingYetWhy}>
        {#snippet actions()}<Button href="/settings/ingest">{copy.inboxConnect}</Button>{/snippet}
      </Empty>
    {:else}
      <Empty kind="cleared" title={copy.inboxClear} body={copy.inboxClearWhy} />
    {/if}
  {:else}
    <ul class="ledger">
      {#each INBOX.slice(0, DOM_CAP) as item (item.id)}
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
                 said "example" six times and nothing else. An arrival with no address, a webhook
                 or a paste, shows the channel it came in on. -->
            <span class="seq" data-open={open === item.id ? '' : undefined} title={item.from}>
              <Icon name="chevronDown" size="s" /><span class="host">{item.from.split('@')[1] ?? item.from}</span>
            </span>
            <span class="line-main">
              <span class="line-title">{item.subject}</span>
              <span class="line-detail">{item.from}</span>
            </span>
            <span class="line-amount"></span>
            <span class="line-when">{since(item.arrived, clock)}</span>
          </button>

          {#if open === item.id}
            <div class="body">
              <!-- Plain text. Never the renderer, never {@html}, never a link the record made. -->
              <p class="raw">{item.body}</p>

              <!-- THIS ONE FIRST, AND THEN THE NEXT ONE LIKE IT. The rule offer sat above these two, and
                   its `Make it a rule` was the card's primary: measured at 390 on the first card,
                   which opens expanded, a filled red button at y 479 and `File it as a row` in the
                   outline weight at y 600. So the loudest thing on the inbox asked a stranger to
                   automate a kind of email before they had dealt with one. The comments that put it
                   there argued about the rule's SENTENCE, that it be read as a sentence and not as
                   a language; none argued that a standing rule outranks filing the email in front
                   of you. Filing is the primary now, and the offer follows it at the ordinary
                   weight, where "would have filed this" reads as the follow-up it is. -->
              <!-- THE PROSE THAT WAS HERE RESTATED THE TWO BUTTONS BELOW IT, and mismapped one:
                   "or leave it" reads as doing nothing, and the control it pointed at was `Archive`,
                   which has a consequence. The buttons are the instruction. -->

              <div class="actions">
                <Button weight="primary" onclick={() => toasts.push(copy.notWritten(copy.inboxFileIt), { intent: 'warn' })}
                  >{copy.fileIt}</Button
                >
                <Button
                  weight="bare"
                  onclick={() => toasts.push(copy.notWritten(copy.inboxArchiveIt))}
                >{copy.archiveArrival}</Button>
              </div>

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
                    <Button onclick={() => toasts.push(copy.notWritten('The rule would be written and tested against the last 30 days'), { intent: 'warn' })}>{copy.makeRule}</Button>
                    <Button
                      weight="bare"
                      onclick={() => toasts.push(copy.notWritten(copy.inboxLeaveIt))}
                    >{copy.notThisOne}</Button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <CapLine shown={Math.min(INBOX.length, DOM_CAP)} total={INBOX.length} />
    {#if fromRecord && live && live.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}
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

  /* The row is a `<button>`, at every width: it opens and closes. Only the TRACKS belong to the
     desktop, and they are below. */
  .line {
    inline-size: 100%;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  /**
   * THE ONE LEDGER SCREEN THAT WAS MISSING ITS WIDTH GUARD.
   *
   * `rows.css` turns a row into a two-line card below 640px. This override said nothing about
   * width, and a component `<style>` is unlayered, so it beat `@layer components` at every size:
   * the children took their card placements and the parent kept four desktop tracks underneath
   * them. Every sibling ledger carries this guard with its own measurement beside it, and each
   * comment says the same thing — `+page.svelte:369`, `audit:474`, `decide:486`, `packs:220`,
   * `vault:151`. This screen had none.
   *
   * Measured against the shipped build at 390, in a 324px row: the tracks computed to
   * `144px 63px 0px 81px`. The card places `.line-main` across all four and `.line-when` in
   * column 2, so **the third and fourth tracks hold nothing at all: 81px of a 324px row, plus the
   * 12px gap that goes with them, is dead** — and the sender's domain, which is what this screen's
   * first column exists for, is held to 144px while it sits there. With the guard the card's own
   * `minmax(0, 1fr) auto` applies and the domain gets 275.8px, which is 92% more of the row for
   * the only thing on it a person is scanning.
   *
   * It never overflowed either. A collapsed track and an unoccupied one both stay inside the
   * viewport, and `layout.mjs` counts a right edge.
   */
  @media (width >= 640px) {
    /* WIDER THAN A SPOKEN ID, because what is in it is a domain. Sixteen characters is most of them
       and the rest ellipsise, which is a truncation somebody can see. */
    .line {
      grid-template-columns: 16ch minmax(0, 1fr) auto 9ch;
    }
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
    /* A body is text somebody else wrote, line breaks included, and one unbroken token must not
       push the card wider than the screen. */
    white-space: pre-line;
    overflow-wrap: anywhere;
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
     agree with. The accent was spent on the button beside it, which was argued as the part that is
     actually a decision; it is spent on `File it as a row` now, and the markup says why.

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

  /* THEY WRAP. `.ledger` is `overflow: hidden`, so a row of actions that does not fit is CUT rather
     than scrolled: at 320 "Leave it for another rule" ended at x=381 in a 320px viewport and read
     `Leave it for ano`. Half the inbox's verbs, on the screen that asks you to make a standing rule.
     At 390 it still spilled 8px past its own card. */
  .pattern-actions,
  .actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* The page below is one control, the height every control is on this pointer. */
  .older {
    display: flex;
    justify-content: center;
  }

  .older :global(.btn) {
    min-block-size: var(--ctl-h);
  }

  .foot {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: center;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .body {
      padding-inline-start: var(--sp-4);
    }
  }

  /**
   * ON A CARD THE TIME SITS BESIDE THE SENDER, WHERE IT HAD A LINE OF ITS OWN.
   *
   * `rows.css` puts `.line-when` in row 3 of a card, under the title and its detail, because on a
   * register the first line is the id and the amount. Here row 1's second cell is the empty
   * `.line-amount` this screen draws for the desktop track, so `3h ago` took a third line to say
   * five characters: measured at 390, the domain at y 182, the subject and sender to y 247, and
   * the time alone at y 251, in a 111px row. Beside the domain it costs nothing.
   *
   * AND THE DOMAIN SHRINKS NOW, because it has a neighbour. The card gives `.seq`
   * `min-inline-size: max-content` so a spoken id is never cut; a domain is not a spoken id, and
   * `.host` inside it carries its own ellipsis for exactly this.
   */
  @media (width < 640px) {
    .line-when {
      grid-row: 1;
    }

    .seq {
      min-inline-size: 0;
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
