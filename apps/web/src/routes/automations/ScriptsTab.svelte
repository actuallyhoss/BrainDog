<!--
  The hub's Scripts tab: each script, what starts it, and where it stands, one row each opening that script.

  NO TILES HERE: the scripts screen holds the charts of its runs, and a second copy one tab
  away would drift from the first. The list sits on the ground under its heading, each row with the code glyph.

  THE SCRIPTS SCREEN KEEPS THE DETAIL. What a script may read, write and fetch, its versions, its owner-only log and
  Resume are on `/scripts`, so this tab says where each one stands and points there, rather than drawing a
  second copy of cards that would drift from the first.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { readScripts, startsBy, stateOf, words, type Script } from '$lib/record/scripts.ts';
  import HubRows from './HubRows.svelte';
  import { hubWords as w, type HubRow } from './hub.ts';

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<Script[]>([]);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await readScripts(apiBase());
    const absent = !out.ok && 'refusal' in out && out.refusal.code === 'ROUTE_UNKNOWN';
    closed(out.ok || absent, at);
    if (out.ok) {
      rows = out.value;
      from = 'ready';
    } else if (absent) from = 'absent';
    else {
      fix = 'refusal' in out ? out.refusal.fix : '';
      from = 'refused';
    }
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && rows.length > 0) drew('ready');
  });

  const now = Date.now();

  const shown = $derived(
    rows.map((s): HubRow => {
      const said = stateOf(s, now);
      return {
        key: s.script,
        name: s.title,
        what: startsBy(s),
        said: said.line,
        dot: said.tone === 'bad' ? 'bad' : said.tone === 'warn' ? 'warn' : null,
        path: `/scripts/${encodeURIComponent(s.script)}`,
        icon: 'code',
      };
    }),
  );
</script>

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent' || (from === 'ready' && rows.length === 0)}
  <!-- NO BUTTON OF ITS OWN: the heading's "New script" is above it, and two read as two different things to press. -->
  <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} agentPrompt={w.scriptsPrompt} />
{:else if from === 'ready'}
  <Tile class="section" data-surface="tile" title={w.scripts} count={shown.length || undefined}>
    <div class="section-body">
      <HubRows rows={shown} />
    </div>
  </Tile>
  <p class="more">{w.scriptsMore} <a href={at('/scripts')}>{w.scriptsOpen}</a></p>
{/if}

<style>
  .more {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .more a {
    color: var(--ink);
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  /* UNDER A THUMB THE LINK IS A 44 TARGET (13 §7). It is the one way from this tab to the whole scripts screen, not a
     word in passing, so it stands as a line of its own at the tap height rather than a 17px run of text. */
  @media (pointer: coarse) {
    .more a {
      display: flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }
</style>
