<!--
  A project's one shape (`project.ts`) at the top of a declared page scoped to the project's row: the brief, the next
  step, money, people, agents and what it runs on, the same blocks the row's own page draws (`ProjectBlocks`).

  READ FOR THE ROW IT IS GIVEN, in parallel and outside the page's own read: the row, what points at it, its history and
  its three figures. It draws nothing for a row that is not a project's and nothing for a project with nothing to say, so
  a page about any other row is unchanged. While the reads are out and the list is known to be a projects list, a little
  height is held so the page's own blocks do not jump when the shape lands.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { workingNow } from '$lib/home/waits.svelte.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { figureReader, type FigureReader } from '../../routes/r/[register]/[seq]/figures.ts';
  import { readHistory } from '$lib/record/history-live.ts';
  import { linkReader } from '$lib/record/links-live.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { blocksOf, isProject, shapeOf, type Block, type Figure } from '$lib/record/project.ts';
  import { rowReader } from '$lib/record/row-live.ts';
  import { money } from 'braindog-render';
  import ProjectBlocks from './ProjectBlocks.svelte';

  let { register, seq, onshape }: { register: string; seq: number; onshape: (blocks: readonly Block[]) => void } = $props();

  type Read = {
    key: string;
    fields: Readonly<Record<string, unknown>>;
    incoming: Parameters<typeof shapeOf>[0]['incoming'];
    history: Parameters<typeof shapeOf>[0]['history'];
    money: { in: Figure | null; out: Figure | null; owed: Figure | null };
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
      const [row, told, links] = await Promise.all([
        rowReader(base).read(r, n),
        quiet<Awaited<ReturnType<typeof readHistory>> | null>(readHistory(base, r, n), null),
        quiet<Awaited<ReturnType<ReturnType<typeof linkReader>['read']>> | null>(linkReader(base).read(r, n), null),
      ]);
      if (key !== `${register}#${seq}` || row.from !== 'live' || !row.entry || !isProject(REGISTERS[r])) return;
      const decl = REGISTERS[r]!;
      const name = String(row.entry.fields[decl.title] ?? '').trim();
      const incoming = links?.from === 'live' ? links.groups.map((g) => ({ decl: REGISTERS[g.register], rows: g.rows })) : [];
      /* AN ID IS NOT A NAME: a line by someone the page has not named is shown without its byline. */
      const history = (told?.from === 'live' ? told.lines : []).map((l) => ({ note: l.note, by: /^p_/u.test(l.by) ? '' : l.by, at: l.at }));
      figures ??= figureReader(base);
      const f = figures;
      const [i, o, w] =
        name === ''
          ? [null, null, null]
          : await Promise.all(['project-in-month', 'project-out-month', 'project-owed'].map((m) => quiet(f.scalar(m, name), null)));
      if (key !== `${register}#${seq}`) return;
      read = { key, fields: row.entry.fields, incoming, history, money: { in: i ?? null, out: o ?? null, owed: w ?? null } };
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
  /* WHAT THE SHAPE DRAWS, said to the page so a declared block that repeats one is left out (`repeatOf`). */
  $effect(() => onshape(shape ? blocksOf(shape.facts) : []));
  /* A PROJECTS LIST KNOWN BEFORE ITS ROW ANSWERS holds a little height, so the declared blocks wait where they will be. */
  const holds = $derived(read === null && settled !== `${register}#${seq}` && isProject(REGISTERS[register]));
</script>

{#if shape && blocksOf(shape.facts).length > 0}
  <div><ProjectBlocks facts={shape.facts} data={shape.data} nextHref={shape.nextHref} format={said} /></div>
{:else if holds}
  <div class="held" aria-hidden="true"></div>
{/if}

<style>
  .held {
    min-block-size: 160px;
  }
</style>
