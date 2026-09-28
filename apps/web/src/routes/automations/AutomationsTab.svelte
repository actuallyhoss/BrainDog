<!--
  The hub's Automations tab: every rule, the ones an agent wrote and the ones a pack installed, one row each.

  AN AUTOMATION IS A RULE THAT GREW A TRIGGER AND STEPS rather than a kind of its own, so a rule installed before this
  screen existed is an automation whose trigger is a change, and it opens on the same canvas.

  A RECORD WITHOUT THE READ STILL OFFERS NEW. Listing needs the `automations` method; drawing one and sending it needs
  only `propose`, which every record has. So a record that cannot list says so, and the heading keeps its button.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import { openAutomations, rowLine, rowTrigger, type AutomationRow } from '$lib/flow/source.ts';
  import HubRows from './HubRows.svelte';
  import type { HubRow } from './hub.ts';

  let { oncount }: { oncount: (n: number) => void } = $props();

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<AutomationRow[]>([]);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await openAutomations((url, init) => fetch(url, init), apiBase());
    closed(out.first.ok || out.absent, at);
    if (out.first.ok) {
      rows = out.first.value;
      from = 'ready';
      oncount(rows.length);
    } else if (out.absent) from = 'absent';
    else {
      fix = out.first.refusal.fix;
      from = 'refused';
    }
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && rows.length > 0) drew('ready');
  });

  /* THIS BROWSER'S CLOCK, read once when the tab is drawn. */
  const now = Date.now();

  /* AN AGENT SETS THESE UP AS READILY AS A PERSON (DIRECTION §22), so the empty list says what to ask one. An example a
     person reads and replaces, not a feature the code ships. */
  const agentPrompt = 'read my record, then propose an automation that fetches the US dollar in euros from api.example.com every hour and tells me when it is over 0.95';

  /* OFF FIRST: a turned-off automation's last run is history, and its line says "Turned off." */
  const shown = $derived(
    rows.map(
      (r): HubRow => ({
        key: r.id,
        name: r.name,
        what: rowTrigger(r),
        said: rowLine(r, now),
        dot: !r.enabled ? 'off' : r.last?.state === 'failed' ? 'bad' : null,
        path: `/automations/${encodeURIComponent(r.id)}`,
      }),
    ),
  );
</script>

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent'}
  <Empty kind="no-data-yet" title={words.absent} body={words.absentHow} />
{:else if from === 'ready' && rows.length === 0}
  <!-- NO BUTTON OF ITS OWN. The heading's "New automation" is above it on every width, and a second one under it read as
       two different things to press (`loop/finish/design.md` 2.7). -->
  <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
{:else if from === 'ready'}
  <HubRows rows={shown} />
{/if}
