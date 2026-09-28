<!--
  The hub's Scheduled tab: every call, poll and pull the record makes on a clock, in the words "Runs on" uses.

  READ ONLY, AS THE PAGE BLOCK IS. Resuming a paused action belongs to "Runs on" on its project's page, and a key the
  action is missing is added in the Vault, so a row whose sentence asks for a key carries the link that adds it and
  nothing else. New opens the scheduled-action sheet through the address (`?new=action`), as any page may.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { openActions, stateOf, whatOf, type ActionRow } from '$lib/record/actions.ts';
  import { humanize } from '$lib/record/names.ts';
  import HubRows from './HubRows.svelte';
  import { hubWords as w, type HubRow } from './hub.ts';

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<ActionRow[]>([]);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await openActions((url, init) => fetch(url, init), apiBase());
    closed(out.first.ok || out.absent, at);
    if (out.first.ok) {
      rows = out.first.value;
      from = 'ready';
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

  const now = Date.now();

  const shown = $derived(
    rows.map((r): HubRow => {
      const said = stateOf(r, now);
      return {
        key: r.ingest,
        /* ITS ID IN WORDS, NEVER THE ID. An action declares no title, and a slug in a list of named automations one
           tab over read as a different product (`loop/finish/design.md` 2.7 and SYS-3). */
        name: humanize(r.ingest),
        what: whatOf(r),
        said: said.line,
        /* ONLY A PAUSE TAKES A DOT. A failed fetch retries on its own and its sentence says there is nothing to do, so
           a red dot beside it would ask for a look the sentence says is not needed. */
        dot: said.tone === 'warn' ? 'warn' : null,
        path: null,
        ...(said.reconnect ? { fix: { path: said.reconnect.href, label: said.reconnect.label } } : {}),
      };
    }),
  );
</script>

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent'}
  <!-- NO BUTTON OF ITS OWN, EITHER WAY: the heading's "New scheduled action" is above it, and two read as two things. -->
  <Empty kind="no-data-yet" title={w.scheduledAbsent} body={w.scheduledAbsentHow} />
{:else if from === 'ready' && rows.length === 0}
  <Empty kind="no-data-yet" title={w.scheduledNone} body={w.scheduledWhy} agentPrompt={w.scheduledPrompt} />
{:else if from === 'ready'}
  <HubRows rows={shown} />
{/if}
