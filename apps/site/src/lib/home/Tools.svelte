<!--
  Your AI tools share one memory (the redo of 2 November): the loop an AI tool runs on BrainDog, drawn on Maya's
  made-up record, then the line that connects yours and BrainDog's own, Slash.

  FOUR TILES. What Claude reads first (the brief its session opens on, word for word as `braindog · context` prints it,
  in the app's mono), the notes the tools left on Tidepool in their own names, Slash answering one of three questions
  (pressing another changes the answer in place over the app's swap step), and the connect box. The makers are named
  under the heading, each with its own mark.

  EVERY ANSWER IS IN THE HTML: with scripting off the first question's answer is drawn, every app's connect lines are
  laid out one under another (`ConnectBox`), and nothing waits on a script to be read.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import ConnectBox from '../connect/ConnectBox.svelte';
  import { agents } from '../copy/agents.ts';
  import { home } from '../copy/home.ts';
  import { NOTES, TERM, ASKS } from '../demo/maya.ts';
  import Answer from '../slash/Answer.svelte';
  import Tries from '../slash/Tries.svelte';

  const t = home.tools;
  /* THE THREE STEPS ARE THE CONNECT PAGE'S OWN, said once in `copy/agents.ts`. */
  const steps = agents.agents.steps;

  /* THE BRIEF: the context block of the agent's terminal, its heading and its lines, as the session prints them. */
  const start = TERM.findIndex((l) => l.text.includes('braindog · context'));
  const brief = TERM.slice(start + 1).filter((l, i, all) => i < all.findIndex((x) => x.text === '') || all.findIndex((x) => x.text === '') < 0);
  const lines = brief.filter((l) => l.text.trim() !== '').map((l) => l.text.trim());

  let at = $state(0);
  let moved = $state(false);
  const pick = (i: number): void => {
    moved = true;
    at = i;
  };
</script>

<section class="section" id="tools" aria-labelledby="tools-title">
  <div class="wrap">
    <div class="section-head">
      <h2 id="tools-title">{t.title}</h2>
      <p>{t.say}</p>
      <p class="makers">
        {#each home.hero.makers as maker (maker.id)}<span class="maker"><AgentMark id={maker.id} size={18} />{maker.name}</span>{/each}
      </p>
    </div>

    <div class="tiles">
      <section class="tile span-5 reveal desk-only" aria-labelledby="brief-title">
        <h3 class="tile-head">
          <span class="well"><AgentMark id="claude" size={16} /></span>
          <span class="tile-title" id="brief-title">{t.brief}</span>
        </h3>
        <p class="tile-say">{t.briefSay}</p>
        <div class="brief">
          <p class="brief-head">braindog · context</p>
          {#each lines as line (line)}<p>{line}</p>{/each}
        </div>
      </section>

      <section class="tile span-7 reveal desk-only" aria-labelledby="notes-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="message" /></span>
          <span class="tile-title" id="notes-title">{t.notes}</span>
        </h3>
        <p class="tile-say">{t.notesSay}</p>
        <ul class="notes">
          {#each NOTES as n (n.text)}
            <li>
              <span class="face"><AgentMark id={n.agent} size={16} /></span>
              <span class="note"><span class="text">{n.text}</span><span class="meta">{n.meta}</span></span>
            </li>
          {/each}
        </ul>
      </section>

      <section class="tile span-7 slash-tile reveal" aria-labelledby="slash-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="slash" /></span>
          <span class="tile-title" id="slash-title">{t.slash.title}</span>
          <span class="kbd key">⌘J</span>
        </h3>
        <p class="tile-say">{t.slash.say}</p>
        <div class="slash">
          <Tries mode="ask" pressed={at} onpick={pick} />
          <!-- ONE LIVE REGION THAT STAYS, so a screen reader hears the new answer: a region drawn anew with each answer
               is not announced. -->
          <div class="answer" aria-live="polite">
            <p class="bar"><span class="sl" aria-hidden="true">/</span>{ASKS[at]?.q}</p>
            {#key at}
              <div class:swap-in={moved}>
                <Answer mode="ask" {at} />
              </div>
            {/key}
          </div>
        </div>
        <a class="onward" href="/slash">{t.slash.more}<Icon name="arrow-right" size="s" /></a>
      </section>

      <section class="tile span-5 reveal" aria-labelledby="connect-title">
        <h3 class="tile-head">
          <span class="well"><Icon name="plug" /></span>
          <span class="tile-title" id="connect-title">{t.connect}</span>
        </h3>
        <p class="tile-say">{t.approve}</p>
        <ConnectBox level={4} />
        <ol class="steps" aria-label={steps.title}>
          {#each steps.items as step, i (step)}
            <li><span class="n num" aria-hidden="true">{i + 1}</span><span>{step}</span></li>
          {/each}
        </ol>
        <a class="onward" href={t.devHref}>{t.dev}<Icon name="arrow-right" size="s" /></a>
      </section>
    </div>
  </div>
</section>

<style>
  .makers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: var(--sp-2) 0 0;
  }

  .maker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink);
    font-size: var(--t-site-15);
    font-weight: 500;
  }

  /* THE BRIEF: the terminal's own words, in the app's mono on the tile's well. */
  .brief {
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border-radius: var(--r-pop);
    background: var(--tile-2);
    font: 400 var(--t-site-13-5) / 1.55 var(--font-mono);
  }

  .brief p {
    margin: 0;
    color: var(--ink);
  }

  .brief .brief-head {
    color: var(--ink-3);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notes li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding-block: 10px;
  }

  .notes li + li {
    border-block-start: 1px solid var(--rule);
  }

  /* A WHO IS ROUND: the maker's mark in a round face. */
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-round);
    background: var(--tile-2);
    color: var(--ink);
  }

  .note {
    display: grid;
    min-inline-size: 0;
  }

  .text {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  .note .meta {
    font-size: var(--t-site-13);
  }

  .key {
    margin-inline-start: auto;
  }

  /* SLASH: the questions to try beside the bar and its answer, side by side while the tile has the room (a container
     query on the tile, so a wide tablet keeps the pair and a narrow desk column stacks it). */
  .slash-tile {
    container: slashtile / inline-size;
  }

  .slash {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: var(--sp-4);
    align-items: start;
  }

  .answer {
    min-inline-size: 0;
    padding-inline-start: var(--sp-4);
    border-inline-start: 1px solid var(--rule);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 8px;
    padding: 10px 12px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--t-site-15);
  }

  .sl {
    color: var(--ink-3);
    font: 600 16px/1 var(--font-display);
  }

  .tile > .onward {
    align-self: flex-start;
    margin-block-start: auto;
  }

  /* THE THREE STEPS under the box, numbered in a well each, a hairline over them. */
  .steps {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-4) 0 0;
    border-block-start: 1px solid var(--rule);
    list-style: none;
  }

  .steps li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .n {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
    font-size: var(--t-site-13);
    font-weight: 600;
  }

  /* STACKED, THE QUESTION PRESSED IN THE LIST ABOVE IS THE ONE ASKED, so the bar would say it twice: the answer follows
     the list under a hairline. */
  @container slashtile (width < 560px) {
    .slash {
      grid-template-columns: minmax(0, 1fr);
    }

    .answer {
      padding-block-start: var(--sp-4);
      padding-inline-start: 0;
      border-block-start: 1px solid var(--rule);
      border-inline-start: 0;
    }

    .bar {
      display: none;
    }
  }

  /* ON A PHONE THE BRIEF AND THE NOTES STEP ASIDE (2 Nov): the home page ran 8,237px at 390 once every section showed
     the real product; Slash and the connect box carry the point there, and a desk shows all four. */
  @media (width < 700px) {
    .desk-only {
      display: none;
    }
  }
</style>
