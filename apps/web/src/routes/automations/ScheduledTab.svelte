<!--
  The hub's Scheduled tab: every call, poll and pull the record makes on a clock, in the words "Runs on" uses.

  A TILE, THEN THE LIST ON THE GROUND (SCREENS, Automations). "Next up" is the next fourteen days with a dot on each day
  an action is due, from each one's next turn on its own clock (`hub.ts` `nextWeek`), and the line under it says which
  is next and when. A paused action has no turns to draw; it leads the list, in its own group, because it is the one
  that needs a look.

  READ ONLY, AS THE PAGE BLOCK IS. Resuming a paused action belongs to "Runs on" on its project's page, and a key the
  action is missing is added in the Vault, so a row whose sentence asks for a key carries the link that adds it and
  nothing else. New opens the scheduled-action sheet through the address (`?new=action`), as any page may.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { WeekStrip } from '$lib/viz/index.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { openActions, stateOf, whatOf, type ActionRow } from '$lib/record/actions.ts';
  import { humanize } from '$lib/record/names.ts';
  import HubRows from './HubRows.svelte';
  import { channelIcon, hubWords as w, nextReading, nextWeek, type HubRow } from './hub.ts';

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

  const rowOf = (r: ActionRow): HubRow => {
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
      icon: channelIcon(r.channel),
      ...(said.reconnect ? { fix: { path: said.reconnect.href, label: said.reconnect.label } } : {}),
    };
  };

  const paused = $derived(rows.filter((r) => r.state === 'paused').map(rowOf));
  const clocked = $derived(rows.filter((r) => r.state !== 'paused').map(rowOf));
  const week = $derived(nextWeek(rows, now));
</script>

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent'}
  <!-- NO BUTTON OF ITS OWN, EITHER WAY: the heading's "New scheduled action" is above it, and two read as two things. -->
  <Empty kind="no-data-yet" title={w.scheduledAbsent} body={w.scheduledAbsentHow} />
{:else if from === 'ready' && rows.length === 0}
  <Empty kind="no-data-yet" title={w.scheduledNone} body={w.scheduledWhy} agentPrompt={w.scheduledPrompt} />
{:else if from === 'ready'}
  {#if week.due.length > 0}
    <Tile icon="calendar" title={w.nextUp} meta={w.nextUpMeta(week.days.length)}>
      <WeekStrip days={week.days} today={week.today} subject={w.nextUpSubject} />
      <p class="reading">{nextReading(week.due, now, week.days.length)}</p>
    </Tile>
  {/if}
  {#if paused.length > 0}
    <Section title={w.paused} count={paused.length}>
      <HubRows rows={paused} />
    </Section>
  {/if}
  {#if clocked.length > 0}
    <Section title={w.onClock} count={clocked.length}>
      <HubRows rows={clocked} />
    </Section>
  {/if}
{/if}

<style>
  /* THE ONE LINE UNDER THE CHART that says what it means (SYSTEM §6), at body size in ink. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }
</style>
