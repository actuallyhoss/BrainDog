<!--
  Settings, "Links": the read-only links this record opened to single pages, each open one with Close.

  A SECTION, NOT AN AREA. It is not an `AREAS` id and has no address of its own.

  INSIDE THE SHARED CARD: "Links: No page is shared" and "Shared: Nothing is shared" were two
  cards for one idea, so `Sharing.svelte` draws the links in its Shared card (`inside`), under a small heading and only
  once there is one, and tells the card how many there are (`count`) so its empty state is said once. Drawn alone, as a
  tile, it is a host with no sharing's, where People & sharing has no Shared card.

  NEVER THE LINK ITSELF. `shares` answers what each link opens and when it stops, and no token: the link was shown once,
  to the owner who made it, and nobody keeps it. Closing is for good, so a closed link stays on the list as closed and
  sharing the page again makes a new one.

  OWNERS ONLY, and the area mounts it only for one. The record is the check: anybody else is refused with its sentence.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { since, dateSaid } from 'braindog-render';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { untrack } from 'svelte';
  import { closeLink, linkState, readLinks, words, type ShareRow } from '$lib/record/share-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  let { inside = false, count = $bindable(0) }: { inside?: boolean; count?: number } = $props();

  let links = $state<ShareRow[] | null>(null);
  let refused = $state<string | null>(null);
  /* A HOST WITH NO SUCH READ has no links to list, which is not a refusal: `ROUTE_UNKNOWN` is a host older than the read,
     as People reads it for `members`, and the section is left out rather than printing the client's sentence. */
  let unrouted = $state(false);
  /** The link whose Close is out, so a second press on it closes it once. */
  let closing = $state<string | null>(null);

  async function load() {
    const at = opened();
    const out = await readLinks(apiBase());
    now = recordNow();
    unrouted = !out.ok && out.code === 'ROUTE_UNKNOWN';
    closed(out.ok || unrouted, at);
    if (out.ok) {
      links = out.value;
      refused = null;
    } else if (!unrouted) refused = out.fix;
  }

  $effect(() => {
    untrack(() => void load());
  });

  /* THE RECORD'S CLOCK, as the share sheet's: a link made a minute ago on a record whose today is 3 Sep reads "Open until
     3 Oct · opened just now", not ran out by this browser's date (one clock, audit A12). Days in the reader's year say no
     year, as every other day on screen. */
  let now = $state(recordNow());
  /* OPEN LINKS FIRST, newest first within each, which is the order `shares` answers in: what can still be closed is
     what somebody came here to do. */
  const sorted = $derived(links === null ? [] : [...links].sort((a, b) => Number(linkState(a, now) !== 'open') - Number(linkState(b, now) !== 'open')));
  const openCount = $derived(sorted.filter((l) => linkState(l, now) === 'open').length);
  $effect(() => {
    count = links?.length ?? 0;
  });

  function stateSaid(l: ShareRow): string {
    const s = linkState(l, now);
    if (s === 'closed') return words.linksClosedOn(dateSaid((l.closed_at ?? '').slice(0, 10), now));
    if (s === 'ran-out') return words.linksRanOut(dateSaid(l.expires_at.slice(0, 10), now));
    return words.linksOpenUntil(dateSaid(l.expires_at.slice(0, 10), now));
  }

  async function close(l: ShareRow) {
    if (closing !== null) return;
    closing = l.id;
    try {
      const out = await closeLink(apiBase(), l.id);
      if (out.ok) {
        toasts.push(words.linksClosed(l.title));
        links = (links ?? []).map((x) => (x.id === l.id ? { ...x, closed_at: out.value.closed_at } : x));
      } else {
        toasts.push(out.fix, { intent: 'warn' });
        if (out.raced) await load();
      }
    } finally {
      closing = null;
    }
  }
</script>

{#snippet rowsOf()}
  <ul class="links">
    {#each sorted as l (l.id)}
      {@const open = linkState(l, now) === 'open'}
      <li class="link" data-open={open ? '' : undefined}>
        <IconWell name="link" size="l" />
        <div class="link-text">
          <span class="link-title">{l.title}</span>
          <span class="link-when">{stateSaid(l)} · {words.linksMoney(l.money === true)} · {words.linksOpened(since(l.opened_at, now))}</span>
        </div>
        {#if open}
          <Button
            tone="bad"
            disabled={closing !== null}
            aria-busy={closing === l.id ? 'true' : undefined}
            aria-label={words.linksClose(l.title)}
            onclick={() => void close(l)}>{words.linksCloseShort}</Button
          >
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if inside}
  {#if links !== null && links.length > 0}
    <section class="links-inside" aria-labelledby="links-inside-h">
      <h3 class="links-h" id="links-inside-h">{words.linksTitle}</h3>
      <p class="links-lead">{words.linksLead}</p>
      {@render rowsOf()}
    </section>
  {/if}
{:else if !unrouted}
<Tile icon="link" class="section" data-surface="tile" title={words.linksTitle} count={openCount || undefined}>
  <div class="section-body">
    <p class="links-lead">{words.linksLead}</p>
    {#if refused !== null}
      <p class="links-refused" role="alert">{refused}</p>
    {:else if links !== null && links.length === 0}
      <Empty kind="no-data-yet" title={words.linksNone} body={words.linksNoneBody} />
    {:else if links !== null}
      {@render rowsOf()}
    {/if}
  </div>
</Tile>
{/if}

<style>
  /* INSIDE THE SHARED CARD: a heading at the card's row weight, over the lead and the links, after the shares. */
  .links-inside {
    display: grid;
    gap: var(--sp-1);
    margin-block-start: var(--sp-4);
  }

  .links-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .links-lead {
    margin: 0 0 var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .links-refused {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .links {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  /* ONE LINK TO A ROW ON THE GROUND: its well, the page it opens and when it stops, and its Close at the
     end, with a hairline between rows from the words' edge. Below 640px the button drops under the words. */
  .link {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .link + .link::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--well-l) + var(--sp-3)) 0;
    block-size: 1px;
    background: var(--rule);
  }

  .link-text {
    display: grid;
    flex: 1 1 auto;
    gap: 2px;
    min-inline-size: 0;
  }

  .link-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  /* A CLOSED LINK IS HISTORY: its title steps back to the second ink. */
  .link:not([data-open]) .link-title {
    color: var(--ink-2);
  }

  .link-when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .link :global(.btn) {
    min-block-size: var(--tap);
  }

  @media (width < 640px) {
    .link {
      flex-wrap: wrap;
    }

    .link-text {
      flex-basis: calc(100% - var(--well-l) - var(--sp-3));
    }

    .link :global(.btn) {
      margin-inline-start: calc(var(--well-l) + var(--sp-3));
    }
  }
</style>
