<!--
  The Slash band (site 2a section 5): two columns and no drawn app behind them. On the left the "/ Slash" name,
  the title, the line and three questions to try; on the right Slash's bar and the answer attached
  under it at the same width, one plain tile with a hairline (plan F17: the red ring was the only red outline on the
  site; red is kept for the one ask).

  THE FIRST QUESTION IS ANSWERED IN THE HTML, so a reader with scripting off, or one who asked for less motion, has the
  finished picture. Pressing a try types it into the bar and answers it (`slash/typing.ts`). The answer is Slash's own
  drawing (`slash/Answer.svelte`), the same the desk's bar and the Slash page use; every figure is Maya's.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { home } from '$lib/copy/home.ts';
  import { slashDrawing } from '$lib/copy/slash.ts';
  import { ASKS } from '$lib/demo/maya.ts';
  import Answer from '$lib/slash/Answer.svelte';
  import { typeInto, type Phase } from '$lib/slash/typing.ts';

  const words = home.slash;
  const think = slashDrawing.modes.ask.think;
  /* The tries in the order the band says them: what I owe, who hasn't paid, how Tidepool is doing. */
  const ORDER = [0, 2, 1].filter((i) => ASKS[i] !== undefined);

  let at = $state(0);
  let typed = $state(ASKS[0]?.q ?? '');
  let phase: Phase = $state('answer');
  /* Set by the first pick, so an answer settles in only when a reader asked for it, never on the page's first draw. */
  let picked = $state(false);
  let stop = () => {};

  function pick(i: number) {
    stop();
    picked = true;
    at = i;
    stop = typeInto(ASKS[i]?.q ?? '', (f) => ((typed = f.typed), (phase = f.phase)), { think });
  }

  $effect(() => () => stop());
</script>

<section class="band band--slash" aria-labelledby="slash-title">
  <div class="wrap reveal cols">
    <div class="c5 words">
      <p class="name"><span class="key" aria-hidden="true">/</span>{words.name}</p>
      <h2 id="slash-title" class="band-h2">{words.title}</h2>
      <p class="band-say">{words.say}</p>
      <div class="tries" role="group" aria-label={words.tries}>
        {#each ORDER as i (i)}
          <button type="button" class="try" aria-pressed={at === i} onclick={() => pick(i)}>{ASKS[i]!.q}</button>
        {/each}
      </div>
      <p class="on"><a class="onward" href="/slash">{words.more}<Icon name="arrow-right" size="s" /></a></p>
    </div>
    <div class="c7 open">
      <div class="bar">
        <span class="sl" aria-hidden="true">/</span>
        <span class="typed">{typed}</span><span class="caret" aria-hidden="true"></span>
      </div>
      <div class="drop" class:picked aria-live="polite" aria-busy={phase !== 'answer'}>
        {#if phase === 'thinking' && think}
          <p class="thinking"><i></i>{think}</p>
        {:else if phase === 'answer'}
          {#key at}<Answer mode="ask" {at} />{/key}
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .cols {
    align-items: start;
  }

  @media (width >= 1060px) {
    .cols {
      column-gap: 48px;
    }
  }

  .words {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
    font: 600 20px/1 var(--head);
    letter-spacing: -0.02em;
  }

  .key {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 50%;
    background: var(--soft-fill);
    color: var(--red);
    font: 600 20px/1 var(--head);
  }

  .tries {
    display: grid;
    gap: 8px;
    margin-block-start: 24px;
    inline-size: 100%;
  }

  .try {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: flex;
    align-items: center;
    min-block-size: 44px;
    padding: 0 18px;
    border-radius: 999px;
    background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--sep), var(--shadow-raised);
    color: var(--ink);
    font-size: var(--t-site-15);
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) {
    .try:hover {
      background: linear-gradient(var(--row-wash), var(--row-wash)) var(--tile);
    }
  }

  .try[aria-pressed='true'] {
    box-shadow: inset 0 0 0 1.5px var(--ink), var(--shadow-raised);
  }

  .try:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* THE WAY ON TO THE SLASH PAGE, the site's one (`.onward`), a tile's gap under the tries. */
  .on {
    margin: 24px 0 0;
  }

  /* THE BAR AND ITS ANSWER: the app's palette, one card radius 20 with the popover's lift, the answer under the bar. */
  .open {
    --tile: var(--desk-tile);
    --board: var(--desk-board);
    --soft: var(--desk-tile-2);
    --rule2: var(--desk-rule);
    --muted: var(--desk-ink-3);
    border: 1px solid var(--card-edge);
    border-radius: 21px;
    box-shadow: var(--elev-popover);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    block-size: 52px;
    padding: 0 18px;
    border-radius: 20px 20px 0 0;
    background: var(--tile);
    box-shadow: inset 0 -1px 0 var(--sep);
    font-size: var(--t-site-16);
  }

  .sl {
    color: var(--red);
    font: 600 18px/1 var(--head);
  }

  .typed {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .caret {
    flex: none;
    inline-size: 1.5px;
    block-size: 20px;
    background: var(--ink);
    /* IT BLINKS FOR A FEW SECONDS AND THEN HOLDS STILL: a caret blinking for as long as the page is open pulled the eye
       back to a picture that had already said its piece. Four blinks, under the five seconds after which anything that
       blinks on its own needs a way to stop it. */
    animation: blink 1s steps(2) 4;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .drop {
    display: grid;
    gap: 10px;
    align-content: start;
    padding: 16px;
    background: var(--board);
    border-radius: 0 0 20px 20px;
  }

  /* AN ANSWER THE READER ASKED FOR SETTLES IN: each tile fades up 4px over the swap step as it arrives, so the new
     answer reads as the one to that question and not a page that jumped. The first, in the HTML, is simply there. */
  @media (prefers-reduced-motion: no-preference) {
    .drop.picked > :global(*) {
      animation: settle var(--d-swap) var(--ease-out) both;
    }
  }

  @keyframes settle {
    from {
      opacity: 0;
      translate: 0 4px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }

  .thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 12px 4px;
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .thinking i {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--muted);
  }

  @media (max-width: 1059px) {
    .open {
      margin-block-start: 24px;
    }
  }

  /* ON A PHONE the bar shows the question being answered, so the tries give way to it. */
  @media (max-width: 760px) {
    .tries {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
    }
  }
</style>
