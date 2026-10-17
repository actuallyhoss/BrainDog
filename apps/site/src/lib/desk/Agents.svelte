<!--
  The desk's Agents: Claude's terminal on Tidepool, starting from the brief and leaving a note, beside Tidepool's
  latest notes. The terminal plays again each time the place is opened (`opened` counts the openings); every line
  is in the HTML for a reader without scripting.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { NOTES, PROJECT, PROJECTS, TERM } from '../demo/maya.ts';
  import Term from './Term.svelte';
  import { DESK } from './words.ts';

  let { opened }: { opened: number } = $props();

  const p = PROJECTS[PROJECT.id];
  const latest = NOTES.slice(0, 2);
</script>

<div class="grid">
  <div class="s8">
    {#key opened}<Term lines={TERM} />{/key}
  </div>
  <div class="t s4 note-card hide-phone">
    <p class="th"><span class="pface small" style="--ph:{p.hue}"><Icon name={p.icon} /></span>{p.name} · {DESK.agents.notes}</p>
    {#each latest as n}
      <div class="note">
        <span class="agent"><AgentMark id={n.agent} /></span>
        <div><p>{n.text}</p><div class="meta">{n.meta}</div></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .note-card {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .note {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .note p {
    margin: 0;
    font-size: 14px;
  }

  .meta {
    color: var(--muted);
    font-size: 12px;
    margin-top: 2px;
  }

  .small {
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }
</style>
