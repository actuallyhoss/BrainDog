<!--
  The desk's Needs you: the two things Maya's Today names, each as its question with what it comes from, and its two
  answers; beside them, what she has answered today, each with an undo.

  THE ASKS ARE THE DESK'S (`needs.svelte.ts`), shared with Today's tile, the tab's count and Today's line. Yes moves an
  ask across with its done line and an Undo; Not now drops it with none; Undo puts it back in its first place. The
  answer buttons work only with scripting, so they are left out of the page a reader gets without it.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { EVIDENCE, NEEDS } from '../demo/maya.ts';
  import { needs } from './needs.svelte.ts';
  import { DESK } from './words.ts';

  const byId = new Map(NEEDS.map((n) => [n.id, n]));
  const open = $derived(needs.open.map((id) => byId.get(id)!).filter(Boolean));
  const done = $derived(needs.done.map((id) => byId.get(id)!).filter(Boolean));
</script>

<div class="grid">
  <section class="t s7" aria-label={DESK.needs.title}>
    <p class="thd"><span class="well"><Icon name="inbox" /></span>{DESK.needs.title}<span class="r num">{open.length}</span></p>
    {#each open as n (n.id)}
      {@const ev = EVIDENCE[n.evidence]}
      <div class="q">
        <p class="ask">{n.ask}</p>
        <p class="why">{n.why}</p>
        <div class="facts">
          <p class="fh">{DESK.behind} · {ev.head}</p>
          {#each ev.rows as [label, value]}<p><span>{label}</span><b class="num">{value}</b></p>{/each}
        </div>
        <div class="acts desk-js">
          <button type="button" class="dbtn ink" onclick={() => needs.answer(n.id, true)}>{n.yes}</button>
          <button type="button" class="dbtn" onclick={() => needs.answer(n.id, false)}>{n.no}</button>
        </div>
      </div>
    {:else}
      <p class="sub">{DESK.needs.empty}</p>
    {/each}
  </section>

  <section class="t s5 hide-phone" aria-label={DESK.needs.answered}>
    <p class="thd"><span class="well"><Icon name="check" /></span>{DESK.needs.answered}<span class="r num">{done.length}</span></p>
    {#each done as n (n.id)}
      <div class="li">
        <div class="grow">{n.done}</div>
        <button type="button" class="undo desk-js" onclick={() => needs.undo(n.id)}>{DESK.needs.undo}</button>
      </div>
    {/each}
  </section>
</div>

<style>
  .q {
    display: grid;
    gap: 8px;
    padding: 16px 0;
    border-block-start: 1px solid var(--rule);
  }

  .q:first-of-type {
    border-block-start: 0;
    padding-block-start: 0;
  }

  p {
    margin: 0;
  }

  .ask {
    font-size: var(--t-site-16);
    font-weight: 600;
  }

  .why {
    color: var(--ink2);
    font-size: var(--t-site-14);
  }

  .facts {
    display: grid;
    padding: 8px 12px;
    background: var(--board);
    border-radius: 8px;
  }

  .facts p {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    font-size: var(--t-site-13);
  }

  .facts span {
    color: var(--muted);
  }

  .facts .fh {
    color: var(--muted);
    font-weight: 500;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
