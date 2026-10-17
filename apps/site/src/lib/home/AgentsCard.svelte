<!--
  The black card: "Your agents share one memory." The notes Maya's agents left on Tidepool, each beside its maker's
  mark, and the line that connects yours (`lib/connect/ConnectBox.svelte`, the connect page's own box on the night
  ground). The notes are `demo/maya.ts`; the words are `copy/home.ts`. Everything here is in the HTML.
-->
<script lang="ts">
  import AgentMark from '$lib/AgentMark.svelte';
  import ConnectBox from '$lib/connect/ConnectBox.svelte';
  import { home } from '$lib/copy/home.ts';
  import { NOTES } from '$lib/demo/maya.ts';

  const words = home.cards.agents;
</script>

<article class="card dark reveal agents-card" aria-labelledby="agents-title">
  <div class="top-head">
    <h2 id="agents-title">{words.title}</h2>
    <p class="say">{words.say}</p>
  </div>
  <div class="body">
    <div class="tile">
      <p class="th">{words.notes}</p>
      <ul class="stream">
        {#each NOTES as note}
          <li class="note">
            <span class="agent"><AgentMark id={note.agent} size={15} /></span>
            <div>
              <p>{note.text}</p>
              <p class="meta">{note.meta}</p>
            </div>
          </li>
        {/each}
      </ul>
    </div>
    <div class="tile">
      <p class="th">{words.connect}</p>
      <ConnectBox tone="night" />
    </div>
  </div>
</article>

<style>
  .top-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 40px;
    margin-block-end: 40px;
    flex-wrap: wrap;
  }

  .top-head .say {
    margin: 0;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
  }

  .tile {
    background: var(--night-2);
    border-radius: 18px;
    padding: 22px;
    min-width: 0;
    color: var(--on-night);
  }

  .th {
    margin: 0 0 10px;
    font: 500 12.5px/1.2 var(--ui);
    color: var(--on-night-2);
  }

  .stream {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
  }

  .note {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .note p {
    margin: 0;
    font-size: var(--t-site-15);
    color: var(--on-night);
  }

  .note .meta {
    margin-block-start: 2px;
    font-size: var(--t-app-xs);
    color: var(--on-night-2);
  }

  .agent {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    background: var(--night-tint);
    color: var(--on-night);
  }

  @media (max-width: 1060px) {
    .body {
      grid-template-columns: 1fr;
      gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .tile {
      padding: 16px;
    }

    .top-head {
      gap: 18px;
      margin-block-end: 28px;
    }
  }
</style>
