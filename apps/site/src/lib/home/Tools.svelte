<!--
  The night band: "Your AI tools share one memory." (site 2a section 4). The notes Maya's AI tools left on Tidepool,
  each beside its maker's mark, and the line that connects yours (`lib/connect/ConnectBox.svelte`). Under them, one
  quiet link for a developer: the only place home names the protocol. The notes are `demo/maya.ts`; the words are
  `copy/home.ts`. Everything here is in the HTML.
-->
<script lang="ts">
  import AgentMark from '$lib/AgentMark.svelte';
  import Icon from '$lib/Icon.svelte';
  import ConnectBox from '$lib/connect/ConnectBox.svelte';
  import { home } from '$lib/copy/home.ts';
  import { NOTES } from '$lib/demo/maya.ts';

  const words = home.tools;
</script>

<section class="band band--tools" aria-labelledby="tools-title">
  <div class="wrap reveal">
    <div class="cols head">
      <h2 id="tools-title" class="band-h2 c7">{words.title}</h2>
      <p class="band-say c5">{words.say}</p>
    </div>
    <div class="cols body">
      <div class="ftile c6">
        <p class="hd">{words.notes}</p>
        <ul class="stream">
          {#each NOTES as note}
            <li class="note">
              <span class="agent"><AgentMark id={note.agent} size={16} /></span>
              <div>
                <p>{note.text}</p>
                <p class="meta">{note.meta}</p>
              </div>
            </li>
          {/each}
        </ul>
      </div>
      <div class="ftile c6 connect">
        <p class="hd">{words.connect}</p>
        <ConnectBox tone="night" />
      </div>
    </div>
    <a class="dev" href={words.devHref}>{words.dev}<Icon name="arrow-right" size="s" /></a>
  </div>
</section>

<style>
  .head {
    align-items: end;
  }

  .head .band-say {
    margin: 0;
  }

  .body {
    margin-block-start: 32px;
  }

  .ftile {
    min-inline-size: 0;
    background: var(--band-ai-tile);
    color: var(--on-night);
  }

  .hd {
    margin: 0 0 16px;
    color: var(--on-night-2);
    font: 500 14px/1.2 var(--ui);
  }

  .stream {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .note {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .note p {
    margin: 0;
    font-size: var(--t-site-15);
  }

  .note .meta {
    margin-block-start: 2px;
    color: var(--on-night-2);
    font-size: var(--t-site-13);
  }

  .agent {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--night-tint-2);
    color: var(--on-night);
  }

  /* THREE NOTES SAY IT on a desk: a fourth would only stretch the tile past the connect box beside it. */
  .note:nth-child(n + 4) {
    display: none;
  }

  .dev {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 32px;
    margin-block-start: 16px;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
    text-decoration: none;
  }

  .dev:hover {
    color: var(--on-night);
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  @media (pointer: coarse) {
    .dev {
      min-block-size: var(--tap);
    }
  }

  @media (max-width: 1059px) {
    .head .band-say {
      margin-block-start: 16px;
    }
  }

  @media (max-width: 760px) {
    .body {
      margin-block-start: 24px;
    }

    /* ON A PHONE, TWO NOTES SAY IT, and the connect line is the hero's button and the /agents page's. */
    .note:nth-child(n + 3),
    .connect {
      display: none;
    }
  }
</style>
