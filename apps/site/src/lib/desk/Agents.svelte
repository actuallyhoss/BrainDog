<!--
  The desk's Agents, as the app's Agents page draws it: the AI tools Maya has connected, each by its maker's
  mark, name and when it was last seen, beside what is working now. The home page's AI tools band shows the notes and
  the connect line, so this place repeats neither.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import { CONNECTED, TODAY } from '../demo/maya.ts';
  import { DESK } from './words.ts';
</script>

<div class="grid">
  <section class="t s6" aria-label={DESK.agents.connected}>
    <p class="thd"><span class="well"><Icon name="plug" /></span>{DESK.agents.connected}<span class="r num">{CONNECTED.length}</span></p>
    <div class="list">
      {#each CONNECTED as c (c.agent)}
        <div class="li">
          <span class="aface" class:on={c.live}><AgentMark id={c.agent} size={16} /></span>
          <div class="grow"><b>{c.name}</b><span>{c.seen}</span></div>
        </div>
      {/each}
    </div>
  </section>
  <section class="t s6" aria-label={DESK.agents.working}>
    <p class="thd"><span class="well"><Icon name="agent" /></span>{DESK.agents.working}<span class="r num">{TODAY.working.length}</span></p>
    <div class="list">
      {#each TODAY.working as w (w.agent)}
        <div class="li">
          <span class="aface on"><AgentMark id={w.agent} size={16} /></span>
          <div class="grow"><b>{w.what}</b><span>{w.sub}</span></div>
        </div>
      {/each}
    </div>
  </section>
</div>
