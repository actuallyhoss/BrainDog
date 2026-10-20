<!--
  The projects that are live, as cards on the desk, each in its own colour (Today as the desk).

  ONE CARD EVERYWHERE: each live project is `ui/ProjectCard.svelte`, the card Projects draws too, and the whole card opens
  the project's page. Only a draft the record formed is drawn here, with its two presses. A project with no hue of its
  own is drawn in no colour, not a made-up one.

  THE COLOUR IS THE THEME'S: the hue goes through `oklch(var(--mark-l) var(--mark-c) var(--hue))` as every identity
  hue does, so it clears contrast in light and in dark. NOTHING IS DRAWN FOR NOTHING: no cards, no section.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { decl, labelOf } from '$lib/record/api.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ProjectCard from '$lib/ui/ProjectCard.svelte';
  import { apiBase } from '$lib/at.ts';
  import { rowWriter } from '$lib/record/rows-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { agentsOn, takenBackFree, type ProjectCard as Card } from './project-cards.ts';
  import { projectKept } from '$lib/funnel.ts';

  let {
    cards,
    more,
    list,
    name,
    working = [],
  }: { cards: readonly Card[]; more: number; list: string; name: string; working?: readonly { agent: string; project: string | null }[] } = $props();

  const words = {
    formed: "Formed from your agent's first run.",
    keep: 'Keep it',
    notOne: 'Not a project',
    all: (n: number) => `${n} more`,
  } as const;

  /* The lane as a word: its first letter up, since a list keeps it lower case. */
  const laneSaid = (lane: string): string => (lane === '' ? '' : lane.charAt(0).toUpperCase() + lane.slice(1));

  /* THE TWO PRESSES ON A DRAFT. Keep clears the mark and the card is an ordinary one from then on. "Not a project" takes
     back a row the record made a few minutes ago with no question; an older draft opens its page, where deleting asks
     as it does for any row. The desk reads again when the record moves, so a local note hides the card at once. */
  let gone = $state<ReadonlySet<number>>(new Set());
  let failed = $state<string | null>(null);
  const writer = $derived(rowWriter(apiBase()));
  const hide = (seq: number) => (gone = new Set([...gone, seq]));
  async function keep(c: Card) {
    failed = null;
    const out = await writer.update(list, c.seq, { draft: false });
    if (out.ok) {
      hide(c.seq);
      projectKept();
    } else failed = out.fix;
  }
  async function notOne(c: Card) {
    failed = null;
    const out = await writer.archive(list, c.seq);
    if (out.ok) hide(c.seq);
    else failed = out.fix;
  }
  const shown = $derived(cards.filter((c) => !gone.has(c.seq) || !c.draft));
  const label = (c: Card): string => {
    const f = c.figure ? decl(list, c.figure.field) : undefined;
    return f ? labelOf(f) : '';
  };
</script>

{#if shown.length > 0}
  <section class="projects" aria-labelledby="desk-projects">
    <header class="p-head">
      <h2 id="desk-projects" class="p-title">{name}</h2>
      {#if more > 0}<a class="p-more tap" href={at(`/r/${list}`)}>{words.all(more)}<Icon name="arrow" size="s" /></a>{/if}
    </header>
    <ul class="cards">
      {#each shown as c (c.key)}
        <li>
          {#if c.draft}
            <div class="card draft" data-hued={c.hue === null ? undefined : ''} style={c.hue === null ? undefined : `--hue:${c.hue}`}>
              <a class="d-open" href={at(c.href)}>
                <span class="c-top">
                  <IdentityMark identity={{ mark: c.mark, hue: c.hue ?? 0, name: c.name, retired: c.hue === null }} size="md" />
                </span>
                <span class="d-said">{words.formed}</span>
                {#if c.brief}<span class="c-brief" dir="auto">{c.brief}</span>{/if}
              </a>
              <span class="d-acts">
                <Button onclick={() => keep(c)}>{words.keep}</Button>
                {#if takenBackFree(c, Date.now())}
                  <button type="button" class="d-quiet tap" onclick={() => notOne(c)}>{words.notOne}</button>
                {:else}
                  <a class="d-quiet tap" href={at(c.row)}>{words.notOne}</a>
                {/if}
              </span>
              {#if failed}<span class="d-fail" role="alert">{failed}</span>{/if}
            </div>
          {:else}
            <ProjectCard card={c} label={label(c)} agents={agentsOn(c.name, working)} />
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .draft {
    display: grid;
    gap: var(--sp-3);
  }

  .d-open {
    display: grid;
    gap: var(--sp-2);
    color: inherit;
    text-decoration: none;
  }

  .d-said {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .d-acts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .d-quiet {
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    text-decoration: underline;
    cursor: pointer;
  }

  .d-fail {
    color: var(--danger);
    font-size: var(--t-sm);
  }

  .projects {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .p-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .p-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .p-more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  /* ONE COLUMN ON A PHONE, and as many as hold 15rem on a wider screen. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    --ph: var(--dim);
    position: relative;
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    block-size: 100%;
    padding: var(--sp-4);
    overflow: hidden;
    background: var(--bg);
    border-radius: var(--r-lg);
    color: var(--ink);
    text-decoration: none;
  }

  .card[data-hued] {
    --ph: oklch(var(--mark-l) var(--mark-c) var(--hue));
    background: color-mix(in oklab, var(--ph) 8%, var(--bg));
  }

  /* THE BAR ACROSS THE TOP is the project's colour at rest, as the prototype draws it. */
  .card::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    block-size: 3px;
    background: var(--ph);
  }

  .card:focus-within {
    background: color-mix(in oklab, var(--ph) 14%, var(--bg));
  }

  .c-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
    min-inline-size: 0;
    font-size: var(--t-row);
    font-weight: 600;
  }

  .c-brief {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

</style>
