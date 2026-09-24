<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).

  AND IT IS A QUEUE, CLEARED FROM THE KEYBOARD (DESIGN-SYSTEM appendix D). `j` and `k` move a cursor,
  Enter opens the one under it, `e` files it in the chosen list, Delete archives it, `x` selects it so
  several are filed or archived at once, and Esc clears the selection. A row leads with its subject,
  then who sent it and the first words of what they said, then when (rule 7).
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { titleOf } from '$lib/title.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { AGENTS_REGISTERS } from '@braindog/seed';
  import type { InboxItem } from '$lib/record/schema.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /**
   * THE INBOX IS THE RECORD'S, its newest page, and nothing of the sample is mixed into it. Until the
   * page arrives the screen draws no rows and no empty state, and a refusal is the record's own
   * sentence: a read that found no record drew the sample's arrivals here until DIRECTION 26, and
   * says so in the record's words now.
   *
   * `unrouted` IS A HOST OLDER THAN THIS READ: there is a record, and no list to draw from it.
   */
  let live = $state<{ items: InboxItem[]; cursor: number | null } | null>(null);
  let refused = $state<string | null>(null);
  let unrouted = $state(false);
  const INBOX = $derived(live?.items ?? []);
  const shown = $derived(INBOX.slice(0, DOM_CAP));
  const clock = $derived(Date.now());
  const answered = $derived(live !== null);

  let open = $state<string | null>(null);

  $effect(() => {
    /* UNTRACKED, ALL OF IT. The effect read `route.data.live`, so the `invalidateAll` after every filing re-ran the
       read and put the open row and the cursor back on the first arrival. And it reads the pending count it writes.
       It reads no `route.data.live` at all now: a shell that was not live was the sample's, and asking regardless is
       how any shell's Inbox ends in the record's answer or its sentence rather than in bars that never stop. */
    const at = untrack(opened);
    let ok = false;
    void import('$lib/record/inbox-live.ts')
      .then((m) => m.readInbox(apiBase()))
      .then((out) => {
        if (out.from === 'live') {
          live = { items: out.items, cursor: out.cursor };
          open = out.items[0]?.id ?? null;
          ok = true;
        } else if (out.from === 'unrouted') {
          unrouted = true;
          ok = true;
        } else refused = out.fix;
      })
      .finally(() => closed(ok, at));
  });

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. What arrives is added under what is drawn, and a refusal here is
   * said under the list, with the arrivals already drawn left where they are.
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
      const out = await m.readInbox(apiBase(), undefined, had.cursor);
      if (out.from === 'live') live = { items: [...had.items, ...out.items], cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * THE LIST A FILED EMAIL GOES INTO, and the one chosen last time.
   *
   * It opened on the first list in the record, which on a live record is Agent runs (DESIGN-SYSTEM
   * D6), so the likeliest press filed an invoice as an agent's run. The choice is remembered on this
   * device, as a convenience and nothing more: a browser that forgets it opens on the first list again.
   */
  const INTO = 'braindog.inbox.into';
  const lists = $derived<readonly { id: string; name: string }[]>(route.data.lists ?? route.data.index?.registers ?? []);
  let into = $state(untrack(() => {
    try {
      return localStorage.getItem(INTO) ?? '';
    } catch {
      return '';
    }
  }));
  /* AN AGENT'S OWN LISTS ARE NOT WHERE AN EMAIL GOES, so the first list is the first of anybody else's. */
  const AGENTS = new Set(['session', ...Object.keys(AGENTS_REGISTERS)]);
  const target = $derived(lists.some((l) => l.id === into) ? into : (lists.find((l) => !AGENTS.has(l.id)) ?? lists[0])?.id ?? '');
  function choose(id: string) {
    into = id;
    try {
      localStorage.setItem(INTO, id);
    } catch {
      /* A browser that stores nothing opens on the first list next time. */
    }
  }

  /**
   * ON A LIVE RECORD THE TWO GESTURES WRITE. Filing puts the arrival in the chosen list, titled by its
   * subject; archiving keeps its bytes. Either way it leaves the list here, the next one takes its
   * place under the cursor, and the next one opens if this one was open. A refusal is the record's own
   * sentence, and the arrival stays where it is.
   */
  let busy = $state(false);

  /** One arrival through the record: `true` when it left the inbox. */
  async function write(item: InboxItem, gesture: 'file' | 'archive'): Promise<{ ok: boolean; row?: string }> {
    const m = await import('$lib/record/inbox-write.ts');
    const out =
      gesture === 'file' ? await m.fileArrival(apiBase(), item.id, target) : await m.archiveArrival(apiBase(), item.id);
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return { ok: false };
    }
    return { ok: true, ...(out.row ? { row: out.row } : {}) };
  }

  /** Take arrivals off the list here, and keep the cursor and the open row on what comes next. */
  function leave(ids: ReadonlySet<string>) {
    const had = live;
    if (!had) return;
    const at = shown.findIndex((i) => ids.has(i.id));
    const items = had.items.filter((i) => !ids.has(i.id));
    live = { items, cursor: had.cursor };
    if (open !== null && ids.has(open)) open = items[Math.max(0, at)]?.id ?? items[at - 1]?.id ?? null;
    if (cursor >= items.length) cursor = items.length - 1;
  }

  async function settle(item: InboxItem, gesture: 'file' | 'archive') {
    if (busy) return;
    if (gesture === 'file' && target === '') return void toasts.push(copy.inboxNoLists, { intent: 'warn' });
    busy = true;
    try {
      const out = await write(item, gesture);
      if (!out.ok) return;
      leave(new Set([item.id]));
      toasts.push(gesture === 'archive' ? copy.inboxArchived : copy.inboxFiled(out.row ?? target));
      /* AND THE RAIL FOLLOWS, as it does after a decision: its Inbox count, and the list a first row just put on it. */
      void invalidateAll();
      await focusCursor();
    } finally {
      busy = false;
    }
  }

  /* ── the cursor ──────────────────────────────────────────────────────────── */
  let cursor = $state(-1);

  async function focusCursor() {
    await tick();
    const item = shown[cursor];
    if (!item) return;
    const el = document.getElementById(`arrival-${item.id}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  function move(to: number) {
    if (shown.length === 0) return;
    cursor = Math.max(0, Math.min(to, shown.length - 1));
    void focusCursor();
  }

  /* ── a selection ─────────────────────────────────────────────────────────── */
  let picked = $state(new Set<string>());
  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    picked = next;
  }

  async function settlePicked(gesture: 'file' | 'archive') {
    const items = shown.filter((i) => picked.has(i.id));
    if (busy || items.length === 0) return;
    if (gesture === 'file' && target === '') return void toasts.push(copy.inboxNoLists, { intent: 'warn' });
    busy = true;
    const gone = new Set<string>();
    try {
      for (const item of items) if ((await write(item, gesture)).ok) gone.add(item.id);
    } finally {
      busy = false;
    }
    leave(gone);
    picked = new Set([...picked].filter((id) => !gone.has(id)));
    if (gone.size) {
      toasts.push(gesture === 'file' ? copy.inboxBatchFiled(gone.size) : copy.inboxBatchArchived(gone.size));
      void invalidateAll();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    /* A KEY THE SHELL ALREADY TOOK, `g` then a letter, is not this page's too. */
    if (e.defaultPrevented || covered() || typing()) return;
    if (e.metaKey || e.ctrlKey || e.altKey || shown.length === 0) return;
    if (e.key === 'Escape' && picked.size > 0) {
      e.preventDefault();
      picked = new Set();
      return;
    }
    const item = shown[cursor];
    if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
      e.preventDefault();
      void settle(item, 'archive');
      return;
    }
    if (silenced(e)) return;
    if (e.key === 'j') {
      e.preventDefault();
      move(cursor + 1);
    } else if (e.key === 'k') {
      e.preventDefault();
      move(cursor < 0 ? 0 : cursor - 1);
    } else if (e.key === 'e' && item) {
      e.preventDefault();
      void settle(item, 'file');
    } else if (e.key === 'x' && item) {
      e.preventDefault();
      toggle(item.id);
    }
  }

  /** The first words of what was said, for the row's detail line. */
  const firstWords = (body: string) => body.replace(/\s+/gu, ' ').trim();

  /**
   * THE READ ABOVE IS BRACKETED WITH `opened()` AND `closed()`, and a call still out takes the
   * attribute away whatever this line says, so the claim is only made once the answer is in.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.inbox)}</title></svelte:head>
<svelte:window {onkeydown} />

<PageHead icon="inbox"
  title={copy.inbox}
  count={answered && !unrouted && !refused ? INBOX.length : undefined}
  atLeast={live !== null && live.cursor !== null}
/>

{#snippet fileInto()}
  {#if lists.length > 0}
    <label class="file-into">
      <span class="file-label">{copy.inboxFileInto}</span>
      <select class="file-select" value={target} disabled={busy} onchange={(e) => choose(e.currentTarget.value)}>
        {#each lists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

<div class="page">
  {#if refused}
    <Empty kind="error" title={refused}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if !answered || unrouted}
    <!-- Bars before the first answer, and nothing from a host that has no inbox to read. -->
    {#if !answered}<Waiting />{/if}
  {:else if INBOX.length === 0}
    <!--
      AN EMPTY INBOX IS TWO DIFFERENT FACTS. A record with no connector has never had anything arrive,
      and a record that has one has cleared it. A record cannot tell these apart from the inbox alone,
      so it says what is true in both, with the door to a connector; and where something waits on
      Decide, the door there too. Only the sample knew its own sources and drew the two apart.
    -->
    <Empty kind="no-data-yet" glyph="inbox" title={copy.inboxClear} body={copy.inboxClearWhy}>
      {#snippet actions()}
        {#if Number(route.data.open ?? 0) > 0}<Button weight="primary" href="/decide">{copy.inboxOpenDecide}</Button>{/if}
        <Button href="/settings/ingest">{copy.inboxConnect}</Button>
      {/snippet}
    </Empty>
  {:else}
    <ul class="ledger arrivals" data-picking={picked.size > 0 ? '' : undefined}>
      {#each shown as item, i (item.id)}
        <li class="arrival" data-cursor={i === cursor ? '' : undefined} data-open={open === item.id ? '' : undefined}>
          <!-- THE SUBJECT LEADS, then who sent it and the first of what they said, then when. The
               sender's domain led the row in a column of its own and was said again under the
               subject (DESIGN-SYSTEM D5). -->
          <button
            type="button"
            id="arrival-{item.id}"
            class="line line-tall"
            aria-expanded={open === item.id}
            onclick={() => {
              cursor = i;
              open = open === item.id ? null : item.id;
            }}
          >
            <span class="line-main">
              <span class="line-title">{item.subject}</span>
              <span class="line-detail"><span class="from">{item.from}</span>{#if open !== item.id && item.body}<span class="gist">{firstWords(item.body)}</span>{/if}</span>
            </span>
            <span class="line-when">{since(item.arrived, clock)}</span>
          </button>
          <button
            type="button"
            class="pick"
            role="checkbox"
            aria-checked={picked.has(item.id)}
            aria-label={item.subject}
            data-on={picked.has(item.id) ? '' : undefined}
            onclick={() => toggle(item.id)}
          >{#if picked.has(item.id)}<Icon name="check" size="s" />{/if}</button>

          {#if open === item.id}
            <div class="body">
              <!-- Plain text. Never the renderer, never {@html}, never a link the record made. -->
              <p class="raw">{item.body}</p>

              <!-- FILING IS THE PRIMARY, and the rule offer follows it at the ordinary weight. -->
              <div class="actions">
                {@render fileInto()}
                <Button weight="primary" disabled={busy} onclick={() => settle(item, 'file')}>{copy.fileIt}</Button>
                <Button weight="bare" disabled={busy} onclick={() => settle(item, 'archive')}>{copy.archiveArrival}</Button>
              </div>
              <!-- NO RULE OFFER. Only the sample's arrivals carried a `suggestion`, and its two buttons
                   could only say nothing was saved: making a rule needs a pattern the record does not
                   derive yet and a declaration write through the same lint a pack gets. It is not
                   drawn until it can write (`loop/research-no-sample.md` 1e). -->
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <CapLine shown={Math.min(INBOX.length, DOM_CAP)} total={INBOX.length} />
    {#if live && live.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}

    {#if picked.size > 0}
      <!-- THE SELECTION'S BAR, stuck to the foot of the view after the list, so opening it moves nothing. -->
      <div class="batch" role="region" aria-label={copy.inboxSelected(picked.size)}>
        <span class="batch-n">{copy.inboxSelected(picked.size)}</span>
        {@render fileInto()}
        <Button weight="primary" disabled={busy} onclick={() => settlePicked('file')}>{copy.inboxFileSelected(picked.size)}</Button>
        <Button disabled={busy} onclick={() => settlePicked('archive')}>{copy.inboxArchiveSelected(picked.size)}</Button>
        <Button weight="bare" onclick={() => (picked = new Set())}>{copy.clearSelection}</Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max); /* One cap for every list page (DESIGN-SYSTEM 3.1, appendix C12). */
  }

  /* An arrival is its row, the box that selects it, and its body when open. */
  .arrival {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    scroll-margin-block: var(--sp-7);
  }

  .arrivals > li + li {
    border-block-start: 1px solid var(--line);
  }

  .arrivals[data-picking] > li {
    scroll-margin-block-end: var(--sp-9);
  }

  /* The row is a `<button>`, at every width: it opens and closes. */
  .line {
    inline-size: 100%;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    font: inherit;
    cursor: pointer;
  }

  /* SUBJECT AND DETAIL, THEN WHEN. The `seq` column the rows share held the sender's domain here. */
  .arrival .line {
    grid-template-columns: minmax(0, 1fr) 9ch;
  }

  .arrival[data-open] .line-title {
    font-weight: 500;
  }

  /* THE CURSOR IS THE FOCUS RING, and only while it is the keyboard's. */
  .arrival .line:focus-visible {
    outline: 2px solid var(--accent-text);
    outline-offset: -2px;
  }

  .from {
    color: var(--ink2);
  }

  .gist::before {
    content: '·';
    margin-inline: var(--sp-2);
  }

  /* THE SELECTION BOX, at the trailing edge, where it is wanted and keeping its space where it is not. */
  .pick {
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    margin: var(--sp-3) var(--sp-3) 0 0;
    padding: 0;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    cursor: pointer;
    visibility: hidden;
  }

  .pick[data-on] {
    background: var(--accent);
    border-color: var(--accent-edge);
  }

  .arrival:hover .pick,
  .arrival[data-cursor] .pick,
  .pick:focus-visible,
  .arrivals[data-picking] .pick {
    visibility: visible;
  }

  @media (pointer: coarse) {
    .pick {
      display: none;
    }

    .arrival {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE BODY SITS UNDER THE SUBJECT, on the page's own ground: space opens it, not a slab. */
  .body {
    grid-column: 1 / -1;
    padding: 0 var(--sp-3) var(--sp-5);
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

  /* The list a filed email goes into sits beside the button that files it, at the height of every control here. */
  .file-into {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .file-label {
    color: var(--dim);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  /* THE HOUSE FIELD, not the system's grey box. */
  .file-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 100%;
    padding: 0 var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  @media (pointer: coarse) {
    .file-select {
      min-block-size: var(--tap);
    }
  }

  /* THEY WRAP. A row of actions that does not fit is wrapped, never cut. */
  .actions {
    flex-wrap: wrap;
    align-items: center;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .batch {
    position: sticky;
    inset-block-end: var(--sp-4);
    z-index: var(--z-raise);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline-start: auto;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }

  .batch-n {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
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
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .batch {
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
    }
  }

  /* ON A CARD THE TIME SITS BESIDE THE SUBJECT, where the row's first line has room for it. */
  @media (width < 640px) {
    .arrival .line {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .arrival .line-main {
      grid-column: 1;
      grid-row: 1;
    }

    .arrival .line-when {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    .arrival .line-detail {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
  }
</style>
