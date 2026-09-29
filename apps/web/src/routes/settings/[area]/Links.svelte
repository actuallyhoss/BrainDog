<!--
  Settings, "Links": the read-only links this record opened to single pages, each open one with Close.

  A SECTION, NOT AN AREA. It is mounted by one line in `areas/People.svelte`, beside who can see the record, because a
  link is one more way somebody reads it; it is not an `AREAS` id and has no address of its own.

  NEVER THE LINK ITSELF. `shares` answers what each link opens and when it stops, and no token: the link was shown once,
  to the owner who made it, and nobody keeps it. Closing is for good, so a closed link stays on the list as closed and
  sharing the page again makes a new one.

  OWNERS ONLY, and the area mounts it only for one. The record is the check: anybody else is refused with its sentence.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { since, day } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closeLink, linkState, readLinks, words, type ShareRow } from '$lib/record/share-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  let links = $state<ShareRow[] | null>(null);
  let refused = $state<string | null>(null);
  /** The link whose Close is out, so a second press on it closes it once. */
  let closing = $state<string | null>(null);

  async function load() {
    const at = opened();
    const out = await readLinks(apiBase());
    closed(out.ok, at);
    if (out.ok) {
      links = out.value;
      refused = null;
    } else refused = out.fix;
  }

  $effect(() => {
    untrack(() => void load());
  });

  const now = $derived(Date.now());
  /* OPEN LINKS FIRST, newest first within each, which is the order `shares` answers in: what can still be closed is
     what somebody came here to do. */
  const sorted = $derived(links === null ? [] : [...links].sort((a, b) => Number(linkState(a, now) !== 'open') - Number(linkState(b, now) !== 'open')));
  const openCount = $derived(sorted.filter((l) => linkState(l, now) === 'open').length);

  function stateSaid(l: ShareRow): string {
    const s = linkState(l, now);
    if (s === 'closed') return words.linksClosedOn(day((l.closed_at ?? '').slice(0, 10)));
    if (s === 'ran-out') return words.linksRanOut(day(l.expires_at.slice(0, 10)));
    return words.linksOpenUntil(day(l.expires_at.slice(0, 10)));
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

<Section title={words.linksTitle} count={openCount}>
  <p class="links-lead">{words.linksLead}</p>
  {#if refused !== null}
    <p class="links-refused" role="alert">{refused}</p>
  {:else if links !== null && links.length === 0}
    <Empty kind="no-data-yet" title={words.linksNone} body={words.linksNoneBody} />
  {:else if links !== null}
    <ul class="links">
      {#each sorted as l (l.id)}
        {@const open = linkState(l, now) === 'open'}
        <li class="link" data-open={open ? '' : undefined}>
          <IconWell name="link" size="l" />
          <div class="link-text">
            <span class="link-title">{l.title}</span>
            <span class="link-when">{stateSaid(l)} · {words.linksOpened(since(l.opened_at, now))}</span>
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
  {/if}
</Section>

<style>
  .links-lead {
    margin: 0 0 var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .links-refused {
    margin: 0;
    color: var(--danger);
    font-size: var(--t-sm);
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
    background: var(--line);
  }

  .link-text {
    display: grid;
    flex: 1 1 auto;
    gap: 2px;
    min-inline-size: 0;
  }

  .link-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  /* A CLOSED LINK IS HISTORY: its title steps back to the second ink. */
  .link:not([data-open]) .link-title {
    color: var(--ink2);
  }

  .link-when {
    color: var(--dim);
    font-size: var(--t-sm);
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
