<!--
  "When you want more": the next steps a first Today offers once something real is in (use case 6, step 6; planner-45,
  the onboarding target). The two offers the first run made once, at `/start#made` (`madeOffers`), here where she comes
  back to, in the order her one answer puts them (`madeSteps`, `first-today.ts` `wantMore`), with Hide.

  A TILE OF LINES, NOT A GALLERY (DIRECTION §39): one line a step, its glyph, what it is, what it would do, and one quiet
  rectangle that goes there. Hide is the heading's own word, and it is kept (`pref.ts` `nextStepsHidden`), so a hidden
  tile stays hidden on the next visit.

  ITS WORDS ARE ITS OWN, in `say` below and not in `copy.ts`, as `first-run.ts` keeps the first run's: this is read by
  one screen, for a few days, and the entry chunk every screen waits for does not carry it. What each step would find is
  the first run's own sentence, said from the lists this record keeps.
-->
<script lang="ts">
  import { write } from '$lib/pref.ts';
  import type { MadeStep } from '$lib/start/made.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let {
    steps,
    onhide,
  }: {
    /** The next steps, in order (`wantMore`); none draws nothing. */
    steps: readonly MadeStep[];
    /** After Hide is kept, so the page can let the tile go from its own reading too. */
    onhide?: (() => void) | undefined;
  } = $props();

  /** The tile's own words. */
  const say = {
    title: 'When you want more',
    hide: 'Hide',
    hideLabel: 'Hide these next steps',
    agent: (name: string) => `Connect ${name}`,
    agentGo: 'Connect',
    bank: "Forward your bank's texts",
    mail: 'Forward your mail',
    file: 'Bring in a file from another app',
    /* WHAT FORWARDING DOES, said under its own name. The first run's sentence ("Forward it here, and…") was written
       under "Your bank's mail", and under "Forward your bank's texts" it said forward twice and called the texts "it". */
    bankDoes: 'Money fills itself from them.',
    mailDoes: 'The people who write to you fill in from it.',
    sourceGo: 'How',
    fileGo: 'Bring it in',
  };

  /** One step as its line draws it: the glyph, the name, what it would do, and where its button goes. */
  type Line = { key: string; icon: IconName; name: string; does: string; go: string; href: string };

  const lineOf = (s: MadeStep): Line =>
    s.kind === 'agent'
      ? { key: 'agent', icon: 'plug', name: say.agent(s.agent.name), does: s.agent.finds, go: say.agentGo, href: '/settings/agents' }
      : {
          key: s.source.kind,
          icon: s.source.kind === 'bank' ? 'money' : s.source.kind === 'mail' ? 'inbox' : 'download',
          name: say[s.source.kind],
          does: s.source.kind === 'bank' ? say.bankDoes : s.source.kind === 'mail' ? say.mailDoes : s.source.finds,
          go: s.source.kind === 'file' ? say.fileGo : say.sourceGo,
          href: s.source.href,
        };

  const lines = $derived(steps.map(lineOf));

  /* HIDDEN AT ONCE, whether or not the page reads the preference again: the press is the answer. */
  let hidden = $state(false);

  function hide() {
    write({ nextStepsHidden: true });
    hidden = true;
    onhide?.();
  }
</script>

{#if !hidden && lines.length > 0}
  <Tile icon="more" title={say.title} class="want-more" data-want-more>
    {#snippet actions()}
      <Button weight="bare" size="sm" aria-label={say.hideLabel} onclick={hide}>{say.hide}</Button>
    {/snippet}
    <ul class="want-more-lines">
      {#each lines as line (line.key)}
        <li class="want-more-line" data-step={line.key}>
          <IconWell name={line.icon} />
          <span class="want-more-words">
            <span class="want-more-name">{line.name}</span>
            <span class="want-more-does">{line.does}</span>
          </span>
          <Button size="sm" href={line.href}>{line.go}</Button>
        </li>
      {/each}
    </ul>
  </Tile>
{/if}

<style>
  /* ONE LINE A STEP: the well, the words taking what is left, the button at the end. On a phone the words wrap and the
     button stays on the line, since both steps are short. */
  .want-more-lines {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .want-more-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: center;
  }

  .want-more-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .want-more-name {
    font-size: var(--fs-body);
    font-weight: 500;
    color: var(--ink);
  }

  .want-more-does {
    font-size: var(--fs-body);
    color: var(--ink2);
  }
</style>
