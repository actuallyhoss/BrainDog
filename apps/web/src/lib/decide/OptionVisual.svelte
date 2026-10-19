<!--
  ONE OPTION'S PICTURE (DIRECTION §45): what it would change, drawn small beside its words by kind (`option-visual.ts`).
  Nothing is drawn for an option with no kind, not even a space.
-->
<script lang="ts">
  import './visual/option-visual.css';
  import type { OptionVisual } from './option-visual.ts';
  import OvChange from './visual/OvChange.svelte';
  import OvDate from './visual/OvDate.svelte';
  import OvFiling from './visual/OvFiling.svelte';
  import OvMerge from './visual/OvMerge.svelte';
  import OvMoney from './visual/OvMoney.svelte';

  let { visual }: { visual: OptionVisual | null } = $props();
</script>

{#if visual?.kind === 'money'}<OvMoney said={visual.said} against={visual.against} basis={visual.basis} share={visual.share} over={visual.over} />
{:else if visual?.kind === 'date'}<OvDate today={visual.today} due={visual.due} days={visual.days} was={visual.was} late={visual.late} />
{:else if visual?.kind === 'change'}<OvChange what={visual.what} before={visual.before} after={visual.after} />
{:else if visual?.kind === 'merge'}<OvMerge names={visual.names} into={visual.into} />
{:else if visual?.kind === 'filing'}<OvFiling list={visual.list} figure={visual.figure} />{/if}
