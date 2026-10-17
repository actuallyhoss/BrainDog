<!--
  The second white card: Slash, named by its key (§48: the / key with "Slash" beside it, over "Press / and ask
  anything."), then the bar opened up into an answer (`lib/slash/Scene.svelte`, whose first Ask is answered in the
  HTML), then the way to the Slash page. The words are `copy/home.ts`.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import Scene from '$lib/slash/Scene.svelte';
  import { home } from '$lib/copy/home.ts';

  const words = home.cards.slash;
</script>

<article class="card paper reveal slash-card" aria-labelledby="slash-title">
  <div class="head">
    <p class="name"><span class="keycap" aria-hidden="true">/</span>{words.name}</p>
    <h2 id="slash-title">{words.title}</h2>
    <p class="say">{words.say}</p>
  </div>
  <Scene />
  <p class="center"><a class="more" href="/slash">{words.more}<Icon name="arrow-right" size="s" /></a></p>
</article>

<style>
  .head {
    display: grid;
    justify-items: center;
    text-align: center;
    margin-block-end: 44px;
  }

  .head h2 {
    max-width: 14ch;
  }

  .head .say {
    margin-inline: auto;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 28px;
    font: 600 26px/1 var(--head);
    letter-spacing: -0.03em;
  }

  .name .keycap {
    margin: 0;
  }

  .center {
    text-align: center;
    margin: 0;
  }

  @media (max-width: 760px) {
    .head {
      margin-block-end: 28px;
    }
  }
</style>
