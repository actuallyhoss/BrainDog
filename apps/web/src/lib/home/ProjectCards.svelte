<!--
  The projects that are live, as cards on the desk, each in its own colour (Today as the desk).

  A CARD IS ITS PROJECT'S: the row's own hue tints the ground a little and draws the bar across the top, and its mark
  and name lead. Then the clean brief line, the next step, and one small figure where the project has money. The whole
  card is the link to the project's page. A project with no hue of its own is drawn in no colour, not a made-up one.

  THE COLOUR IS THE THEME'S: the hue goes through `oklch(var(--mark-l) var(--mark-c) var(--hue))` as every identity
  hue does, so it clears contrast in light and in dark. NOTHING IS DRAWN FOR NOTHING: no cards, no section.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { decl, labelOf } from '$lib/record/api.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Money from '$lib/ui/Money.svelte';
  import { apiBase } from '$lib/at.ts';
  import { rowWriter } from '$lib/record/rows-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { takenBackFree, type ProjectCard } from './project-cards.ts';
  import { projectKept } from '$lib/funnel.ts';

  let { cards, more, list, name }: { cards: readonly ProjectCard[]; more: number; list: string; name: string } = $props();

  const words = {
    formed: "Formed from your agent's first run.",
    keep: 'Keep it',
    notOne: 'Not a project',
    next: 'Next step',
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
  async function keep(c: ProjectCard) {
    failed = null;
    const out = await writer.update(list, c.seq, { draft: false });
    if (out.ok) {
      hide(c.seq);
      projectKept();
    } else failed = out.fix;
  }
  async function notOne(c: ProjectCard) {
    failed = null;
    const out = await writer.archive(list, c.seq);
    if (out.ok) hide(c.seq);
    else failed = out.fix;
  }
  const shown = $derived(cards.filter((c) => !gone.has(c.seq) || !c.draft));
  const label = (c: ProjectCard): string => {
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
                  <a class="d-quiet tap" href={at(c.href)}>{words.notOne}</a>
                {/if}
              </span>
              {#if failed}<span class="d-fail" role="alert">{failed}</span>{/if}
            </div>
          {:else}
          <a class="card" href={at(c.href)} data-hued={c.hue === null ? undefined : ''} style={c.hue === null ? undefined : `--hue:${c.hue}`}>
            <span class="c-top">
              <IdentityMark identity={{ mark: c.mark, hue: c.hue ?? 0, name: c.name, retired: c.hue === null }} size="md" />
              {#if c.lane}<span class="c-lane">{laneSaid(c.lane)}</span>{/if}
            </span>
            {#if c.brief}<span class="c-brief" dir="auto">{c.brief}</span>{/if}
            {#if c.figure}
              <span class="c-fig">
                <span class="c-fig-num"><Money minor={c.figure.minor} currency={c.figure.currency} weight="strong" /></span>
                {#if label(c)}<span class="c-fig-label">{label(c)}</span>{/if}
              </span>
            {/if}
            {#if c.next}
              <span class="c-next"><Icon name="arrow" size="s" /><span class="sr">{words.next}: </span><span dir="auto">{c.next}</span></span>
            {/if}
          </a>
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

  .card:hover,
  .card:focus-visible {
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

  .c-lane {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
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

  .c-fig {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
  }

  .c-fig-num {
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.035em;
  }

  .c-fig-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .c-next {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.4;
  }

  .c-next :global(.icon) {
    flex: none;
    color: var(--dim);
    transform: translateY(2px);
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
