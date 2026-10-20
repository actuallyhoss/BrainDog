<!--
  WHAT A TASK CHANGED, WHEN IT IS DONE, AND WHAT IT WILL, WHILE IT IS OPEN (`task-effects.ts` picks both). Nothing is
  drawn, not even a gap, when there is nothing to say. The log is read only for a finished task, once per record
  version (`kept.ts` through `read`).
-->
<script lang="ts">
  import '../decide/visual/option-visual.css';
  import OvChange from '../decide/visual/OvChange.svelte';
  import { apiBase } from '../at.ts';
  import { read } from '../data/read.svelte.ts';
  import { doneEffects, plannedEffects, windowOf, type Ev } from './task-effects.ts';

  let {
    register,
    seq,
    stateField,
    done,
    finished,
    description = null,
  }: {
    register: string;
    seq: number;
    /** The field that holds the task's status, and the values that mean finished: the list's own words. */
    stateField: string | null;
    done: readonly string[];
    /** Whether the task is finished now. */
    finished: boolean;
    description?: unknown;
  } = $props();

  const log = read<{ task: Ev[]; recent: Ev[] }>(
    () => (finished && stateField ? `${register}#${seq}` : null),
    async () => {
      const { createClient } = await import('@braindog/client');
      const client = createClient({ base: apiBase() });
      const [task, recent] = await Promise.all([client.history(register, seq), client.recentHistory({ limit: 200, everything: true })]);
      if (!task.ok) return task;
      if (!recent.ok) return recent;
      return { ok: true, value: { task: task.value as Ev[], recent: recent.value.events as Ev[] } };
    },
    { kept: 'task-effects' },
  );

  const effects = $derived(
    finished
      ? log.value
        ? doneEffects({ register, seq }, windowOf(log.value.task, stateField, done), log.value.recent)
        : []
      : plannedEffects(description),
  );
</script>

{#if effects.length > 0}
  <ul class="te" aria-label={finished ? 'What it changed' : 'What it will change'}>
    {#each effects as e (e.what)}
      <li>
        <span class="te-what" dir="auto">{e.what}</span>
        {#if e.before !== null}<OvChange what={e.what} before={e.before} after={e.after} />{:else}<span class="te-will">→ <span dir="auto">{e.after}</span></span>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .te {
    list-style: none;
    margin: 0 0 var(--sp-3);
    padding: 0;
    display: grid;
    gap: var(--sp-1);
    font-size: var(--fs-meta);
  }

  .te li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: baseline;
  }

  .te-what {
    color: var(--ink2);
  }

  .te-will {
    color: var(--ink);
  }
</style>
