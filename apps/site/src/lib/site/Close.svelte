<!--
  The close of a page: one huge centred line, one sentence and "Start free" (DIRECTION §47, "Start your record.").
  It rises into place once as it scrolls in (`reveal.ts`), and is simply there with scripting off or reduced motion.
-->
<script lang="ts">
  import Start from './Start.svelte';

  let { title, body }: { title: string; body: string } = $props();
</script>

<section class="close reveal">
  <div class="wrap">
    <h2 class="huge">{title}</h2>
    <p>{body}</p>
    <div class="go"><Start /></div>
  </div>
</section>

<style>
  .close {
    padding: 170px 0 160px;
    text-align: center;
  }

  .huge {
    font-size: clamp(3.4rem, 10.5vw, 9.2rem);
    line-height: 0.92;
    letter-spacing: -0.055em;
    text-wrap: balance;
  }

  p {
    max-inline-size: 26em;
    margin: 22px auto 0;
    color: var(--ink2);
    font-size: var(--t-site-19);
  }

  .go {
    margin-block-start: 34px;
  }

  @media (max-width: 760px) {
    .close {
      padding: 110px 0 100px;
    }
  }
</style>
