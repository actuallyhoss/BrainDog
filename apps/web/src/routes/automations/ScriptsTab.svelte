<!--
  The hub's Scripts tab: each script, what starts it, and where it stands, one row each opening that script.

  THE SCRIPTS SCREEN KEEPS THE DETAIL. What a script may read, write and fetch, its versions, its owner-only log and
  Resume are on `/scripts` (SCR-2), so this tab says where each one stands and points there, rather than drawing a
  second copy of cards that would drift from the first.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Empty from '$lib/ui/Empty.svelte';
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
  <HubRows rows={shown} />
  <p class="more">{w.scriptsMore} <a href={at('/scripts')}>{w.scriptsOpen}</a></p>
{/if}

<style>
  .more {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .more a {
    color: var(--ink);
  }
</style>
