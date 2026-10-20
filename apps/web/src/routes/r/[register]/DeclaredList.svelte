<!--
  A list as a page the record composes (PGS-A23), drawn at `/r/<list>?declared` while the screen as it was stays put.

  THE BODY IS THE KERNEL'S AND THE DRAWING IS THE RECORD'S. `listPage` composes a page from the list's own declaration
  (`declared.ts`), the record draws it as it draws an installed one and writes nothing (`previewPage`, through
  `drawnOf`), and the one renderer lays it out (`PageBody`), as `SourceView` draws a page from its text. No table, card
  or board is drawn by this file, and nothing in it knows a list.

  WHY `PageBody` AND NOT `PageView`. `PageView`'s preview is inert, so no row on it opens, and its page mode draws Share,
  Change this page and Edit layout, each of which writes to an installed page's address; this one is installed nowhere
  until the record answers `page({ list })`. So the body is hosted here: the panel every declared page opens
  (`RowPanel`), through the host a list screen makes (`listHost`), which keeps the open row in the address as `?row=`.

  WHAT IT DOES NOT DO YET, which the screen as it was does: Add, search, narrowing by a chip, choosing several, and
  changing a cell in place. A row is changed in the panel. The line under the page is the way back.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  /* WHAT ONLY A DECLARED PAGE DRAWS, with the screen that draws it, in the order `PageView` loads them. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import '$lib/page/kinds/styles.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { iconFor } from '$lib/record/api.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { may } from '$lib/record/may.ts';
  import type { LiveBlock, LivePageDecl } from '$lib/record/page-live.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import { liveArrivals } from '$lib/data/optimistic.svelte.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import { emptyHidden } from '$lib/page/home.ts';
  import { leadIndex } from '$lib/page/lead.ts';
  import PageBody from '$lib/page/PageBody.svelte';
  import { heldNone, pageWrites, type Held } from '$lib/page/page-writes.ts';
  import { judgedWith } from '$lib/page/panels.ts';
  import { listHost } from '$lib/page/row-host.svelte.ts';
  import RowPanel from '$lib/page/RowPanel.svelte';
  import RowVerbMenu from '$lib/page/RowVerbMenu.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { bodyFor, classicHref, drawnRows, words } from './declared.ts';

  let {
    register,
    decl,
    count = null,
    refused = null,
  }: {
    /** The list's id, as the address says it. */
    register: string;
    /** The list's declaration, absent until the record has answered it for this list. */
    decl: RegisterDecl | undefined;
    /** How many the list holds, where the screen has read it: the number the page's opening line says. */
    count?: number | null;
    /** The record's own sentence for a list it would not read, or `null` where it refused nothing. */
    refused?: string | null;
  } = $props();

  const shell = $derived(page.data as unknown as Partial<Shell>);

  /** The page the kernel composes for this list, and the text it is told apart by. */
  const body = $derived(bodyFor(decl, count));
  const spoken = $derived(body ? JSON.stringify(body) : null);

  /** What the record drew: the page, its refusal, or `none` from a record that cannot draw a page before it is kept. */
  type Asked = { list: string; of: string };
  type Got = Asked & ({ from: 'live'; page: LivePageDecl; blocks: LiveBlock[]; now: number } | { from: 'refused'; fix: string } | { from: 'none' });
  let got = $state.raw<Got | null>(null);
  /** Each read's turn, so an answer that lands after a newer question is dropped rather than drawn over it. */
  let asked = 0;

  async function draw(list: string, text: string): Promise<Got> {
    const asks = { list, of: text };
    try {
      /* FETCHED WHEN THE PAGE IS ASKED FOR, as Home fetches it for Today: the list as it was never loads it. */
      const m = await import('../../decide/[id]/proposed.ts');
      const head = JSON.parse(text) as Record<string, unknown>;
      const out = await m.drawnOf(head, apiBase());
      if (out.from === 'refused') return { ...asks, from: 'refused', fix: out.fix };
      if (out.from === 'none') return { ...asks, from: 'none' };
      const title = typeof head.title === 'string' ? head.title : (decl?.name ?? '');
      const opened = m.openedOf(head, `list:${list}`, title, out.blocks, out.now);
      return { ...asks, from: 'live', page: opened.page.page, blocks: opened.page.blocks, now: opened.now };
    } catch {
      return { ...asks, from: 'none' };
    }
  }

  /* READ WHEN THE BODY CHANGES AND NOT WHEN THE DECLARATION IS ANSWERED AGAIN: the same list read twice composes the
     same page. ANOTHER LIST IS ANOTHER SCREEN, so what the last one drew goes at once; the same list with a new count
     in its line keeps what is drawn until the new drawing lands. */
  $effect(() => {
    const text = spoken;
    const list = register;
    if (text === null) return;
    untrack(() => {
      if (got?.list === list && got.of === text) return;
      if (got?.list !== list) got = null;
      const mine = ++asked;
      void draw(list, text).then((out) => {
        if (mine === asked) got = out;
      });
    });
  });

  /** After a write: the page drawn again in place, kept as it is where the record now says no. */
  async function reread() {
    const text = spoken;
    if (text === null) return;
    const mine = ++asked;
    const out = await draw(register, text);
    if (mine === asked && out.from === 'live') got = out;
  }

  /** The drawing for the list on screen now, and never the one before it while its own is read. */
  const live = $derived(got?.from === 'live' && got.list === register ? got : null);
  const blocks = $derived(live?.blocks ?? []);
  /** Whether the page opens on its sentence, which the body then draws under the name and not as a tile (`lead.ts`). */
  const led = $derived(leadIndex(judgedWith(blocks, null, (bs) => emptyHidden(bs))) >= 0);

  /* ── the open row ──────────────────────────────────────────────────────────
     THE SAME PANEL, AND THE SAME ADDRESS FOR IT, as on the screen as it was: `?row=7`, beside `?declared`, which the
     host writes around (it changes `row` and nothing else). The rows it opens and walks are the list's as this page
     drew them (`drawnRows`). */
  const host = listHost({
    register: () => register,
    rows: () => drawnRows(blocks, register),
    address: {
      read: () => page.url,
      /* OPENING AND CLOSING ARE STEPS BACK CAN UNDO; walking from one open row to the next is not a step each. */
      write: (to) =>
        void goto(at(`${to.pathname}${to.search}${to.hash}`), {
          replaceState: page.url.searchParams.has('row') && to.searchParams.has('row'),
          noScroll: true,
          keepFocus: true,
        }),
    },
    base: () => apiBase(),
    now: () => live?.now ?? Date.now(),
    reread: () => reread(),
    toasts,
    may: (list) => may(shell as Shell, 'write', list),
    who: () => ({ me: shell.me?.person ?? null, names: new Map(Object.entries(shell.names ?? {})) }),
  });

  /* KEPT IN STEP WITH THE ROWS AND THE ADDRESS, as the list screen keeps its own: a row that left closes the panel, a
     link or Back moves it, and a panel that closed itself is closed on the host, which takes the row out of the address. */
  $effect(() => {
    void blocks;
    void page.url.href;
    const shut = host.opened === null;
    untrack(() => {
      if (shut) host.close();
      host.sync();
    });
  });

  /* ── the writes ────────────────────────────────────────────────────────────
     THE PAGE'S OWN, as on any declared page (`page-writes.ts`): a tick, a moved card. Held under the name the host
     keeps Just changed by, which no installed page is called. */
  let held = $state.raw<Held>(heldNone());
  const writes = pageWrites({
    slug: () => `list:${register}`,
    now: () => live?.now ?? null,
    blocks: () => blocks,
    base: () => apiBase(),
    reread: () => reread(),
    toasts,
    state: { get: () => held, set: (next) => (held = next) },
    arrivals: liveArrivals(),
    ask: openPaletteWith,
    touched: (ref, mark, title) => host.host.note(ref, mark, title),
  });
  $effect.pre(() => {
    const on = `list:${register}`;
    untrack(() => writes.forPage(on));
  });
  $effect(() => {
    if (live) untrack(() => writes.warm());
  });
</script>

{#if refused !== null}
  <!-- THE RECORD SAID NO TO THE LIST, AND ITS SENTENCE IS THE BODY, as on the screen as it was. -->
  <div class="declared-said">
    <Empty kind="error" heading title={copy.screenFailed} body={refused}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !decl || got === null || got.list !== register}
  <!-- Bars until the record answers: the declaration first, then the page drawn from it. -->
  <div aria-busy="true" aria-label={words.drawing}><Waiting head rows={8} /></div>
{:else if got.from === 'refused'}
  <!-- THE RECORD WOULD NOT DRAW THE PAGE, and says why in its own sentence. -->
  <div class="declared-said">
    <Empty kind="error" heading title={decl.name} body={got.fix} />
  </div>
{:else if got.from === 'none'}
  <div class="declared-said">
    <Empty kind="error" heading title={decl.name} body={words.none} />
  </div>
{:else if live}
  <!-- THE PAGE GIVES UP WHAT THE DOCKED PANEL TAKES, as every hosted page does (`PageView`'s `.hosted`). -->
  <div class="declared-hosted">
    <PageHead icon={iconFor(decl.icon, 'rows')} title={decl.name} />
    <PageBody mode="page" page={live.page} {blocks} now={live.now} {writes} headed={led} host={host.host} />
  </div>
  <RowPanel host={host.host} />
  <RowVerbMenu host={host.host} {reread} />
{/if}

{#if refused === null && decl}
  <!-- THE WAY BACK, one quiet line under whatever was drawn: the same address without the one key. -->
  <p class="declared-back">
    <span>{words.trying}</span>
    <a href={at(classicHref(page.url))}>{words.back}</a>
  </p>
{/if}

<style>
  .declared-hosted {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w, 0px) - var(--gutter)));
    transition: padding-inline-end var(--d-panel) var(--ease-sheet);
  }

  .declared-said {
    padding: var(--sp-5) var(--gutter) var(--sp-4);
    max-inline-size: calc(var(--measure) + 2 * var(--gutter));
  }

  /* ONE LINE, IN THE PAGE'S OWN GUTTER, quieter than anything above it and still body size. */
  .declared-back {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-4) var(--gutter) var(--sp-8);
    padding-inline-end: max(var(--gutter), var(--dock-w, 0px));
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  @media (pointer: coarse) {
    .declared-back a {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }
</style>
