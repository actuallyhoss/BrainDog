<!--
  Scripts: `/scripts`, every installed script and where it stands, as a declared page (24 October).

  A PAGE BODY LIKE ANY OTHER. Its blocks are `page.scripts`, the People add-on's (`packages/seed/src/modules/scripts.ts`):
  one line and a table of every script over the kernel's `scripts` source, drawn by the one page reader through
  `PageView`, as Decide's are. The record's own `page.scripts` is read where it holds one, so a page he changed by saying
  so is the page drawn; a record that holds none is drawn the same body by `previewPage`, and keeping a change to it is
  its first write (`home-arrange.ts`, as Today and Decide are kept). `braindog page pull scripts` reads what it holds.

  THE TITLE ROW SAYS HOW MANY, HOW MUCH THEY RAN THIS MONTH, AND WHAT HAS STOPPED, from the rows the page drew
  (`reading.ts` `sentenceOf`): the month is the sum of each row's own count, never recounted from history, and the red
  phrases are a paused script and a refused last run. So the page's own line is the head's, and is not drawn again as a
  tile under it.

  A ROW OPENS THE SCRIPT, where its facts, recent runs, versions and Resume are (`ScriptCard`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { SCRIPTS_PAGES } from '@braindog/seed/packs/scripts';
  import { apiBase } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import { scriptOf, words } from '$lib/record/scripts.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import { typing } from '$lib/a11y/keys.svelte.ts';
  import PageView from '$lib/page/PageView.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { copy } from '$lib/copy.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { sentenceOf, troubleOf } from './reading.ts';
  import HubTabs from '../automations/HubTabs.svelte';
  import { MediaQuery } from 'svelte/reactivity';

  /* THE HUB'S TABS, AS ON AUTOMATIONS: beside the name at a desk's width, under the
     sentence on a phone, with Scripts the one marked. */
  const phone = new MediaQuery('(width < 900px)', false);

  let { data }: { data: Shell } = $props();

  const SLUG = 'scripts';
  /** The body the record draws while it holds no `page.scripts`: the add-on's own, as it installs it. */
  const BUILT = (({ pack: _pack, ...body }) => body)(SCRIPTS_PAGES[SLUG]!);

  const shell = $derived(route.data as unknown as Shell);
  /* THE RECORD'S OWN PAGE, ONCE IT HOLDS ONE: the add-on installs it, and a change kept on the preview writes it. */
  const held = $derived((shell.pages ?? []).includes(SLUG));

  /** The record's answer for the page; `null` while it is out. */
  let got = $state.raw<Opened | null>(null);
  let reading = false;
  let started = 0;

  async function readPage(stored: boolean): Promise<Opened> {
    if (stored) {
      const { pageReader } = await import('$lib/record/page-live.ts');
      return pageReader(apiBase()).read(SLUG, {});
    }
    const m = await import('../decide/[id]/proposed.ts');
    const out = await m.drawnOf(BUILT, apiBase());
    if (out.from === 'refused') return { from: 'refused', fix: out.fix };
    if (out.from === 'none') return { from: 'refused', fix: copy.screenFailed };
    return m.openedOf(BUILT, SLUG, String(BUILT.title), out.blocks, out.now);
  }

  async function read(): Promise<boolean> {
    reading = true;
    const mine = ++started;
    try {
      const out = await readPage(held);
      /* A REFUSAL AFTER A PAGE WAS DRAWN KEEPS THE PAGE, until the record answers again. */
      if (mine === started && (out.from === 'live' || got === null || got.from !== 'live')) got = out;
      return out.from === 'live';
    } finally {
      reading = false;
    }
  }

  $effect(() => {
    void held;
    untrack(() => {
      const at = opened();
      void read()
        .then((ok) => closed(ok, at))
        .catch(() => closed(false, at));
    });
  });

  async function reread() {
    await read().catch(() => undefined);
  }

  /* A NEW VERSION OF THE RECORD READS THE PAGE AGAIN without blanking it: a script installed or paused elsewhere arrives. */
  listen(reread, () => reading || typing());

  const live = $derived(got?.from === 'live' ? got : null);
  /* THE SCRIPTS THE PAGE DREW, read back off its `scripts` block, which the head counts and speaks of. */
  const listed = $derived(live?.page.blocks.find((b) => b.source === 'scripts') ?? null);
  const now = $derived(live?.now ?? recordNow());
  const rows = $derived(
    (listed?.entries ?? []).map((e) => {
      const s = scriptOf(e.fields, now);
      const month = typeof e.fields.month === 'number' ? e.fields.month : 0;
      return {
        title: s.title,
        status: e.fields.status === 'paused' ? ('paused' as const) : ('on' as const),
        last: typeof e.fields.last_at === 'string' ? { at: e.fields.last_at, version: null, outcome: typeof e.fields.last === 'string' ? e.fields.last : '', say: '' } : null,
        month: { runs: month, ok: 0, refused: 0 },
        /* WHAT STARTS IT, so the head says what started the runs it counts (`reading.ts` `startedBy`). */
        runs: {
          every: typeof e.fields.every === 'string' ? e.fields.every : null,
          at: typeof e.fields.at === 'string' ? e.fields.at : null,
          door: typeof e.fields.door === 'string' ? e.fields.door : null,
          rule: e.fields.rule === true,
        },
      };
    }),
  );
  const told = $derived(live && rows.length > 0 ? sentenceOf(rows) : null);
  /* THE PAGE'S OWN LINE IS THE HEAD'S, so it is not drawn again as a tile under it. */
  /* THE ONES THAT RAN COME FIRST, the latest on top, and "Not run yet" closes the list. */
  const ranAt = (e: { fields: Record<string, unknown> }): number => (typeof e.fields.last_at === 'string' ? Date.parse(e.fields.last_at) || 0 : 0);
  /* AND WHAT HAS STOPPED COMES BEFORE THEM ALL: a refused last run, then a paused script,
     the ones the head names in red. The refused one sat ninth, under "9 more". */
  const trouble = (e: { fields: Record<string, unknown> }): number => troubleOf(e.fields);
  const drawn = $derived<Opened | null>(
    live
      ? {
          ...live,
          page: {
            ...live.page,
            blocks: live.page.blocks.map((b) =>
              b.kind === 'note' && (b as { lead?: unknown }).lead === true
                ? { ...b, drawn: false }
                : b.source === 'scripts' && b.entries
                  ? { ...b, entries: [...b.entries].sort((x, y) => trouble(x) - trouble(y) || ranAt(y) - ranAt(x)) }
                  : b,
            ),
          },
        }
      : got,
  );
  const none = $derived(live !== null && listed !== null && listed.refusals.length === 0 && rows.length === 0);

  $effect(() => {
    if (live) drew('ready');
  });

  /* AN AGENT WRITES THESE AS READILY AS A PERSON ACCEPTS THEM, so the empty list says what to ask one,
     in the form every other empty state's prompt takes. An example a person reads and replaces. */
  const agentPrompt = 'read my BrainDog, then propose a script that fetches the US dollar in euros from api.example.com every hour and files it in my record';
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

<!-- THE SENTENCE IN ITS PIECES, the paused count and a refused last run in red. One line of markup, so no space is set
     between a piece and its punctuation. -->
{#snippet sentence()}{#each told ?? [] as p, i (i)}{#if p.tone === 'needs'}<span data-needs>{p.text}</span>{:else}{p.text}{/if}{/each}{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<!-- THE COUNT IS THE SENTENCE'S FIRST WORDS ("24 scripts ran..."), so the title does not say it again beside the name. -->
<PageHead icon="code" title={words.heading} count={live && !told ? rows.length : undefined} sentence={told ? sentence : undefined} heldLines={1}>
  {#snippet actions()}
    <!-- THE ONE PRIMARY: its word, and on a phone the 44px button with the plus. -->
    <Button weight="primary" href="/scripts/new" aria-label={words.newScript} data-circle><Icon name="plus" size="s" /><span class="new-word">{words.newScript}</span></Button>
  {/snippet}
  <!-- THE TABS UNDER THE SENTENCE AT EVERY WIDTH, as the hub's layout draws them: beside it they broke it in two. -->
  {#snippet below()}<HubTabs here="scripts" full={phone.current} />{/snippet}
</PageHead>
<div class="page">
  {#if none}
    <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
  {:else}
    <!-- BARS UNTIL THE RECORD ANSWERS, AND ITS SENTENCE WHERE IT REFUSES, as on every page (`PageView`). -->
    <!-- EVERY SCRIPT, never folded under "N more": the rows are the screen. -->
    <PageView slug={SLUG} got={drawn} mode="home" unfolded {reread} />
  {/if}
</div>

<style>
  /* THE TITLE COLUMN TAKES MOST OF THE ROW, so a long title is whole and not cut at "from what Numbe...". */
  .page :global(.table) {
    --cols: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 0.9fr) !important;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    max-inline-size: var(--page-max);
  }

  /* ON A PHONE THE PRIMARY IS THE 44PX BUTTON WITH THE PLUS: the word goes. */
  @media (width < 640px) {
    .new-word {
      display: none;
    }

    :global(.head-actions .btn[data-circle]) {
      inline-size: var(--tap);
      padding: 0;
    }
  }
</style>
