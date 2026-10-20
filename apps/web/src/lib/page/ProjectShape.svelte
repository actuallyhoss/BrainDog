<!--
  A project's one shape (`project.ts`) at the top of a declared page scoped to the project's row: the hero band, its path
  and money, then people, agents and what it runs on, the blocks the row's own page draws (`ProjectBlocks`).

  THE HERO BAND (the plan of 20 October, batch 3a) is the project's own colour at a low tint over the tile: its mark in a
  48px well, where it stands ("Earning · At risk"), two or three plain sentences with each amount a step heavier and
  only the late phrase in the red (`heroOf`), and three figures on the right: what it pays, its open work as a ring of
  how much an agent holds, and who is on it now. Never the next step, which the page's own sentence says once. Then row
  2, its path and its money (`ProjectVisuals`), and under them what the hero does not say.

  READ FOR THE ROW IT IS GIVEN, in parallel and outside the page's own read: the row, what points at it, its history, its
  three money figures and its open work. It draws nothing for a row that is not a project's and nothing for a project with
  nothing to say, so a page about any other row is unchanged. While the reads are out and the list is known to be a
  projects list, a little height is held so the page's own blocks do not jump when the shape lands, and held as the bars
  every read waits in (`Waiting`), busy, never a blank band under the head (the audit of 20 October).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { workingNow } from '$lib/home/waits.svelte.ts';
  import { decl as fieldDecl, homeCurrency, labelOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { figureReader, viaOf, type FigureReader, type OpenWork } from '../../routes/r/[register]/[seq]/figures.ts';
  import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
  import { readHistory } from '$lib/record/history-live.ts';
  import { linkReader } from '$lib/record/links-live.ts';
  import { handFor } from '$lib/record/hand.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { rowScreen } from '$lib/record/row-href.ts';
  import { HERO_WORDS, blocksOf, heroOf, isProject, shapeOf, type Block, type Figure } from '$lib/record/project.ts';
  import { figureOf, hueOf } from '$lib/home/project-cards.ts';
  import { rowReader } from '$lib/record/row-live.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { money } from 'braindog-render';
  import ProjectBlocks from './ProjectBlocks.svelte';
  import ProjectVisuals from './ProjectVisuals.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { Ring } from '$lib/viz/index.ts';
  import type { Listing, Months } from '$lib/record/visuals.ts';

  let {
    register,
    seq,
    onshape,
  }: {
    register: string;
    seq: number;
    /** What the shape draws, the row it drew it for, and whether its reads are back: until they are, nothing it may say is known. */
    onshape: (blocks: readonly Block[], row: Readonly<Record<string, unknown>> | null, known: boolean) => void;
  } = $props();

  type Read = {
    key: string;
    fields: Readonly<Record<string, unknown>>;
    incoming: Parameters<typeof shapeOf>[0]['incoming'];
    history: Parameters<typeof shapeOf>[0]['history'];
    money: { in: Figure | null; out: Figure | null; owed: Figure | null };
    inByMonth: Months | null;
    outByMonth: Months | null;
    listings: Listing[];
    open: OpenWork | null;
    /** What the open work is called, in the plural and lower case. */
    noun: string;
  };
  let read = $state.raw<Read | null>(null);
  /* THE KEY WHOSE READ HAS ENDED, however it ended: the hold lasts only while its own read is out, never past it. */
  let settled = $state('');
  let figures: FigureReader | null = null;

  $effect(() => {
    const r = register;
    const n = seq;
    const key = `${r}#${n}`;
    untrack(() => {
      read = null;
      void load(r, n, key).finally(() => {
        settled = key;
      });
    });
  });

  /* A read that fails is a read that said nothing: the blocks it feeds go without it and the others still draw. */
  const quiet = <T,>(p: Promise<T>, none: T): Promise<T> => p.catch(() => none);

  async function load(r: string, n: number, key: string) {
    try {
      const base = apiBase();
      const linked = linkReader(base);
      const [row, told, links] = await Promise.all([
        rowReader(base).read(r, n),
        quiet<Awaited<ReturnType<typeof readHistory>> | null>(readHistory(base, r, n), null),
        quiet<Awaited<ReturnType<ReturnType<typeof linkReader>['read']>> | null>(linked.read(r, n), null),
      ]);
      if (key !== `${register}#${seq}` || row.from !== 'live' || !row.entry || !isProject(REGISTERS[r])) return;
      const decl = REGISTERS[r]!;
      const name = String(row.entry.fields[decl.title] ?? '').trim();
      const incoming = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], name: g.name, rows: g.rows })) : [];
      /* AN ID IS NOT A NAME: a line by someone the page has not named is shown without its byline. */
      const history = (told?.from === 'live' ? told.lines : []).map((l) => ({ note: l.note, by: /^p_/u.test(l.by) ? '' : l.by, at: l.at }));
      figures ??= figureReader(base);
      const f = figures;
      /* THE OPEN WORK IS THE FIRST LIST POINTING HERE THAT SAYS WHO HOLDS ITS ROWS, as the row's own page counts it. What
         points here comes a page at a time, so a later page is asked while none has said so yet, three at most. */
      const holds = (list: string): boolean => handFor(REGISTERS[list]) !== null && viaOf(REGISTERS[list], r) !== null;
      let work = links?.from === 'live' ? links.groups.map((g) => g.register).find(holds) : undefined;
      let cursor = links?.from === 'live' ? links.cursor : null;
      for (let more = 0; work === undefined && cursor !== null && more < 3; more++) {
        const page = await quiet(linked.read(r, n, cursor), null);
        cursor = page?.from === 'live' ? page.cursor : null;
        if (page?.from === 'live') work = page.groups.map((g) => g.register).find(holds);
      }
      const via = work ? viaOf(REGISTERS[work], r) : null;
      const [i, o, w, open] =
        name === ''
          ? [null, null, null, null]
          : await Promise.all([
              ...['project-in-month', 'project-out-month', 'project-owed'].map((m) => quiet(f.scalar(m, name), null)),
              work && via ? quiet(f.openWork(work, via, `${r}#${n}`, localDay(recordNow())), null) : Promise.resolve(null),
            ]);
      /* THE MONTH-BY-MONTH SERIES AND THE STORED ROWS, for the visuals; a read that says nothing leaves its visual out. */
      const [inByMonth, outByMonth] = name === '' ? [null, null] : await Promise.all([quiet(f.moneyIn(name), null), quiet(f.moneyOut(name), null)]);
      const listings = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], rows: g.raw ?? [] })) : [];
      if (key !== `${register}#${seq}`) return;
      read = {
        key,
        fields: row.entry.fields,
        incoming,
        history,
        money: { in: (i as Figure | null) ?? null, out: (o as Figure | null) ?? null, owed: (w as Figure | null) ?? null },
        inByMonth,
        outByMonth,
        listings,
        open: (open as OpenWork | null) ?? null,
        noun: (work ? (REGISTERS[work]?.name ?? '') : '').toLowerCase(),
      };
    } catch {
      /* Nothing to draw: the page goes on without the shape, and the hold is let go by the caller. */
    }
  }

  const shape = $derived(
    read && isProject(REGISTERS[register])
      ? shapeOf({ fields: read.fields, title: REGISTERS[register]!.title, incoming: read.incoming, history: read.history, money: read.money, working: workingNow() })
      : null,
  );
  const said = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), true);

  /* ── the hero ── */
  const decl = $derived(REGISTERS[register]);
  const hue = $derived(read && decl ? hueOf(decl as Parameters<typeof hueOf>[0], read.fields) : null);
  const lead = $derived.by(() => {
    if (!read || !decl) return null;
    const fig = figureOf(decl, read.fields);
    const f = fig ? fieldDecl(register, fig.field) : undefined;
    return fig ? { minor: fig.minor, currency: fig.currency, label: f ? labelOf(f) : '' } : null;
  });
  const hero = $derived(shape && read ? heroOf({ facts: shape.facts, figure: lead, open: read.open, noun: read.noun, format: said }) : null);
  /* WHERE IT STANDS, in the list's own words: its lane, then how it is going where the list keeps that. */
  const status = $derived.by(() => {
    if (!read || !decl) return [];
    const out: string[] = [];
    for (const id of [decl.state, 'health']) {
      const fd = id ? decl.fields.find((x) => x.id === id) : undefined;
      const v = fd && id ? read.fields[id] : undefined;
      if (fd && typeof v === 'string' && v.trim() !== '') out.push(valueSaid(fd as Parameters<typeof valueSaid>[0], v));
    }
    return out;
  });
  const name = $derived(read && decl ? String(read.fields[decl.title] ?? '').trim() : '');
  const mark = $derived(read && decl?.identity ? String(read.fields[decl.identity.mark] ?? '') : '');
  const drawsHero = $derived(!!hero && (hero.sentences.length > 0 || hero.figures.length > 0));

  /* WHAT THE SHAPE DRAWS, said to the page so a declared block that repeats one is left out (`repeatOf`). */
  $effect(() => onshape(shape ? blocksOf(shape.facts) : [], shape && read ? read.fields : null, read !== null || settled === `${register}#${seq}`));
  /* A PROJECTS LIST KNOWN BEFORE ITS ROW ANSWERS holds a little height, so the declared blocks wait where they will be. */
  const holds = $derived(read === null && settled !== `${register}#${seq}` && isProject(REGISTERS[register]));
  /* THE HERO SAYS THE BRIEF, THE PAGE'S SENTENCE THE NEXT STEP, ROW 2 THE MONEY: the blocks under them say the rest. */
  const omit = $derived<Block[]>(drawsHero ? ['brief', 'next', 'money'] : ['next', 'money']);
  const below = $derived(shape ? blocksOf(shape.facts).filter((b) => !omit.includes(b)) : []);
</script>

{#if drawsHero && hero}
  <section class="hero" aria-label={name} data-hued={hue === null ? undefined : ''} style={hue === null ? undefined : `--hue:${hue}`}>
    <div class="h-id">
      <ProjectWell {mark} {name} {hue} size="l" />
      <div class="h-where">
        {#if status.length > 0}<p class="h-status">{status.join(' · ')}</p>{/if}
        <a class="h-fields tap" href={at(rowScreen(register, seq))}><Icon name="edit" size="s" />Details</a>
      </div>
    </div>
    {#if hero.sentences.length > 0}
      <p class="h-say">
        {#each hero.sentences as s, n (n)}{#if n > 0}{' '}{/if}{#each s as part, k (k)}{#if part.figure}<b class="fig num">{part.text}</b>{:else if part.late}<span class="late">{part.text}</span>{:else}{part.text}{/if}{/each}{/each}
      </p>
    {/if}
    {#if hero.figures.length > 0}
      <ul class="h-figs">
        {#each hero.figures as f (f.key)}
          <li class="h-fig">
            <span class="k">{f.label}</span>
            {#if f.key === 'money'}
              <span class="v num">{said(f.minor, f.currency)}</span>
            {:else if f.key === 'open'}
              <span class="v-ring">
                <Ring value={f.agents} max={f.total} size={40} tone="var(--ph)" subject="Held by an agent" />
                <span class="v num">{f.total}{#if f.atLeast}+{/if}</span>
              </span>
              <span class="k">{HERO_WORDS.split(f.total - f.agents, f.agents)}{#if f.late > 0}, <span class="late">{f.late} late</span>{/if}</span>
            {:else}
              <span class="v-ring">
                {#each f.now.slice(0, 3) as w (w.key)}<AgentFace agent={w.agent} run={w.run} live={w.live} size="s" />{/each}
                <span class="v num">{f.now.length}</span>
              </span>
              {#if f.note}<span class="k note" dir="auto">{f.note}</span>{/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
{#if read}
  <ProjectVisuals
    fields={read.fields}
    decl={REGISTERS[register]}
    inByMonth={read.inByMonth}
    outByMonth={read.outByMonth}
    listings={read.listings}
    format={said}
    money={shape?.facts.money ?? []}
    moneyRows={shape?.data.money ?? []}
    {hue}
  />
{/if}
{#if shape && below.length > 0}
  <div class="below"><ProjectBlocks facts={shape.facts} data={shape.data} nextHref={shape.nextHref} format={said} {omit} /></div>
{/if}
{#if !shape && holds}
  <div class="held"><Waiting rows={3} /></div>
{/if}

<style>
  .held {
    min-block-size: 160px;
  }

  .below {
    margin-block-start: var(--inset);
  }

  /* THE PROJECT'S COLOUR AT A LOW TINT OVER THE TILE, never a gradient; in no colour where the project has none. */
  .hero {
    --ph: var(--ink);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    margin-block-end: var(--inset);
    padding: var(--sp-5);
    border-radius: var(--r-lg);
    background: color-mix(in oklab, var(--ph) 4%, var(--tile));
  }

  .hero[data-hued] {
    --ph: oklch(var(--mark-l) var(--mark-c) var(--hue));
    background: color-mix(in oklab, var(--ph) 8%, var(--tile));
  }

  .h-id {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .h-where {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
    min-inline-size: 0;
  }

  .h-status {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .h-fields {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--tap);
    color: var(--dim);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .h-fields:hover {
      color: var(--ink);
    }
  }

  .h-say {
    max-inline-size: 760px;
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-head);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .fig {
    color: var(--ink);
    font-weight: 500;
  }

  .late {
    color: var(--accent-text, var(--danger));
  }

  /* THREE ACROSS AT EVERY WIDTH, so a phone reads the three figures in one row under the sentences. */
  .h-figs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .h-fig {
    display: grid;
    align-content: start;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: var(--tile);
  }

  .k {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .v {
    font-family: var(--font-display);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }

  .v-ring {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .v-ring :global(.viz-ring) {
    flex: none;
    inline-size: 32px;
  }

  @media (width < 640px) {
    .hero {
      padding: var(--sp-4);
    }

    .h-say {
      font-size: var(--fs-body);
    }
  }

  @media (width >= 640px) {
    .h-fig {
      padding: var(--sp-3) var(--sp-4);
    }

    .v {
      font-size: var(--t-xl);
    }

    .v-ring :global(.viz-ring) {
      inline-size: 40px;
    }
  }

  /* FROM 1100px THE FIGURES STAND ON THE RIGHT of the mark and the sentences, as the 19 October look lays them. */
  @media (width >= 1100px) {
    .hero {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }

    .h-id,
    .h-say {
      grid-column: 1;
    }

    .h-figs {
      grid-column: 2;
      grid-row: 1 / span 2;
      grid-template-columns: repeat(3, 9.5rem);
    }
  }
</style>
