<!--
  Scripts: `/scripts`, every installed script and where it stands.

  THE TITLE ROW SAYS HOW MANY, HOW MUCH THEY RAN THIS MONTH, AND WHAT HAS STOPPED. The month is the sum of each row's
  own count, never recounted from history, and the red phrases are a paused script and a refused last run.

  ONE TILE OF ROWS, the Automations row shape (`HubRows`): the code glyph in its well, the script's name on up to two
  lines, and one meta line of what starts it and where it stands ("Runs every day and when an automation starts it ·
  Not run yet"). A dot and its word lead the second half only when it is paused or its last run was refused. The whole
  row opens the script, where its facts, recent runs, versions and Resume are (`ScriptCard`): eleven tiles each with a
  six-field table were a page to scroll, not a list to scan.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { readScripts, rowOf, words } from '$lib/record/scripts.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import HubRows from '../automations/HubRows.svelte';
  import type { HubRow } from '../automations/hub.ts';
  import { sentenceOf } from './reading.ts';

  /* THE RECORD'S ADDRESS IS THE QUESTION, so moving to another record under the same route asks again rather than
     drawing the last record's scripts under the new one's name. */
  const scripts = read(
    () => apiBase(page.url),
    () => readScripts(apiBase(page.url)),
    { empty: (v) => v.length === 0 },
  );

  const rows = $derived(scripts.value ?? []);
  const told = $derived(scripts.state === 'ready' ? sentenceOf(rows) : null);

  /* THE RECORD'S CLOCK (SF3), read once when the list is drawn. */
  const now = recordNow();

  const shown = $derived(
    rows.map((s): HubRow => {
      const r = rowOf(s, now);
      return {
        key: s.script,
        name: s.title,
        what: r.what,
        said: r.said,
        dot: r.tone ?? null,
        path: `/scripts/${encodeURIComponent(s.script)}`,
        icon: 'code',
      };
    }),
  );

  /* AN AGENT WRITES THESE AS READILY AS A PERSON ACCEPTS THEM, so the empty list says what to ask one,
     in the form every other empty state's prompt takes. An example a person reads and replaces. */
  const agentPrompt = 'read my record, then propose a script that fetches the US dollar in euros from api.example.com every hour and files it in my record';
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

<!-- THE SENTENCE IN ITS PIECES, the paused count and a refused last run in red. One line of markup, so no space is set
     between a piece and its punctuation. -->
{#snippet sentence()}{#each told ?? [] as p, i (i)}{#if p.tone === 'needs'}<span data-needs>{p.text}</span>{:else}{p.text}{/if}{/each}{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<PageHead icon="code" title={words.heading} count={scripts.state === 'ready' ? rows.length : undefined} sentence={told ? sentence : undefined}>
  {#snippet actions()}
    <!-- THE ONE PRIMARY: its word, and on a phone the 44px button with the plus. -->
    <Button weight="primary" href="/scripts/new" aria-label={words.newScript} data-circle><Icon name="plus" size="s" /><span class="new-word">{words.newScript}</span></Button>
  {/snippet}
</PageHead>
<div class="page">
  {#if scripts.state === 'waiting' || scripts.state === 'refused' || scripts.state === 'offline'}
    <ReadState state={scripts.state} refusal={scripts.refusal} onretry={scripts.reread} />
  {:else if rows.length === 0}
    <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
  {:else}
    <Tile>
      <HubRows rows={shown} />
    </Tile>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
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
