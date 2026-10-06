<!--
  The end of the first run: the BrainDog is made, and one agent and one source are offered before Home.

  ONE OF EACH, EACH SAYING WHAT IT WOULD FIND HERE (`lib/start/made.ts`), as two rows under one quiet heading, no box
  round either. The agent wears its maker's mark (DIRECTION §34) and copies the one command that connects it; the source
  opens where it is set up. Neither is required and neither is ink: the one ink button is Open my BrainDog.

  THEN THE PASSKEY, for a person who has none (`PasskeyFirst` draws nothing for anybody else), so a first sign-in by
  email is not the only way back in.

  `modules` IS WHAT WAS JUST MADE when this follows Make it mine on the same screen. Arriving at `/start#made` from
  sign-up, it is read from the record's packs once.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { createClient } from '@braindog/client';
  import { apiBase, slugOf } from '$lib/at.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { firstRun } from '$lib/first-run.ts';
  import { connectLines } from '$lib/record/device.ts';
  import { madeOffers, modulesOn } from '$lib/start/made.ts';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PasskeyFirst from './PasskeyFirst.svelte';

  let { modules = null }: { modules?: readonly string[] | null } = $props();

  let read = $state.raw<string[] | null>(null);
  let heading = $state<HTMLHeadingElement | undefined>(undefined);

  onMount(() => {
    void tick().then(() => heading?.focus());
    if (modules !== null) return;
    void (async () => {
      const out = (await createClient({ base: apiBase() })
        .packs()
        .catch(() => null)) as { ok: true; value: { id: string; disabled_at: string | null }[] } | { ok: false } | null;
      read = out?.ok ? modulesOn(out.value) : [];
    })();
  });

  const offers = $derived(madeOffers(modules ?? read ?? []));

  function copyAgent() {
    /* THE MCP ADDRESS IS AT THE HOST'S ROOT, under no slug, so the origin of this record's own address. */
    const lines = connectLines(new URL(apiBase()).origin, slugOf());
    void clipboard.put(lines.claude, firstRun.agentName, firstRun.agentCopied);
  }
</script>

<section class="made" aria-labelledby="made-h">
  <header class="made-head">
    <h1 class="made-title" id="made-h" tabindex="-1" bind:this={heading}>{firstRun.madeTitle}</h1>
    <p class="made-lede">{firstRun.madeLede}</p>
  </header>

  <section class="next" aria-labelledby="next-h">
    <h2 class="next-h" id="next-h">{firstRun.madeNext}</h2>
    <ul class="offers">
      <li class="offer">
        <span class="mark" aria-hidden="true"><AgentMark kind="claude" size="l" /></span>
        <div class="offer-main">
          <p class="offer-name">{offers.agent.name}</p>
          <p class="offer-finds">{offers.agent.finds}</p>
        </div>
        <div class="offer-go">
          <Button size="sm" onclick={copyAgent}>{firstRun.agentCopy}</Button>
          <Button weight="bare" size="sm" href="/settings/agents">{firstRun.agentOthers}</Button>
        </div>
      </li>
      <li class="offer">
        <IconWell name={offers.source.kind === 'file' ? 'doc' : 'inbox'} size="l" />
        <div class="offer-main">
          <p class="offer-name">{offers.source.name}</p>
          <p class="offer-finds">{offers.source.finds}</p>
        </div>
        <div class="offer-go">
          <Button size="sm" href={offers.source.href}>{offers.source.go}</Button>
        </div>
      </li>
    </ul>
  </section>

  <PasskeyFirst />

  <div class="home">
    <Button weight="primary" href="/">{firstRun.openHome}</Button>
  </div>
</section>

<style>
  /* ONE COLUMN, LEFT ALIGNED UNDER THE BRAND, as wide as the rows read well: the rows carry a sentence each. */
  .made {
    display: grid;
    gap: var(--sp-6);
    max-inline-size: 760px;
    min-inline-size: 0;
    animation: made-in var(--d-page) var(--ease-out) both;
  }

  @keyframes made-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .made {
      animation: none;
    }
  }

  .made-head {
    display: grid;
    gap: var(--sp-2);
  }

  .made-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-title);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    text-wrap: balance;
  }

  .made-title:focus {
    /* focus-ok: `tabindex="-1"` moves focus here for a screen reader when the BrainDog is made; it is never in the tab order. */
    outline: none;
  }

  .made-lede {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  /* A QUIET HEADING OVER ROWS ON THE GROUND, no tile: a list without boxes (DIRECTION §37). */
  .next-h {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
  }

  .offers {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .offer {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
  }

  .offer + .offer {
    border-block-start: 1px solid var(--line);
  }

  /* THE MAKER'S MARK IN A WELL THE SIZE OF THE ICON WELL BESIDE IT, so the two rows line up. */
  .mark {
    display: inline-grid;
    place-items: center;
    inline-size: var(--well-l);
    block-size: var(--well-l);
    border-radius: var(--r-well);
    background: var(--s1);
    color: var(--ink);
  }

  .offer-main {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .offer-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  .offer-finds {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .offer-go {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .home :global(.btn) {
    min-block-size: var(--tap);
  }

  /* ON A PHONE THE PRESSES GO UNDER THE WORDS, at a thumb's height, and Home rides the bottom edge. */
  @media (width < 640px) {
    .offer {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }

    .offer-go {
      grid-column: 2;
      justify-content: flex-start;
    }

    .offer-go :global(.btn) {
      min-block-size: var(--tap);
    }

    .home {
      position: sticky;
      inset-block-end: calc(var(--sp-4) + env(safe-area-inset-bottom));
    }

    .home :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
