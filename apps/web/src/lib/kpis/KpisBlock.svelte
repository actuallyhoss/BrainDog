<!--
  A `kpis` BLOCK ON A PAGE (the KPI plan of 21 October, 2.5 and 2.8): the record's answer drawn by the renderer's
  `Kpis.svelte`, and the ways in to each number. `BlockSlot.svelte` draws it for every `kpis` block, so a project's Key
  numbers and Today's rows are the same host.

  A NUMBER IS PRESSED TO CHANGE IT: its name is the button and the press covers the tile or the row, and it opens the
  sheet (`KpiSheet.svelte`) on that number, wherever it is drawn. Its menu says the two ways it is not on Today and
  "Lead the card with this" (`block-menu.ts` `kpiActionsFor`), each one press through the app's row writer at the
  version each row was read at, with a line over Undo. On a project's page the foot adds one, and no number is drawn
  large: the hero says the one the card leads with (`ProjectPart.svelte`), so here it is the first tile, marked.

  WHAT WAS SUGGESTED AND NOT KEPT is on the project's page only, under its numbers: each by name with Keep and Not this.
  Every form of the block leaves drafts out (`sources/kpis.ts`), so this is the one place they are seen; Keep is the
  row's `draft` turned off and Not this the row put away, both with Undo.

  A STALE NUMBER OFFERS ITS FIX under "Not updated since", here and on Today's rows (`stale-fix.ts`): one an agent keeps
  says "Ask Claude to report it", which tells that kind of agent on the number's project which number and since when,
  with Undo taking it back; one nobody's agent keeps, or a reader who tells no agents, says "Add a reading", which opens
  a one-field sheet (`ReadingSheet.svelte`) writing one reading into Numbers.

  ON TODAY, "All numbers" under the rows opens the list they are kept in, which the record names on the block
  (`kpi_list`), so the web writes no list of its own here.

  THE LIST IS FOUND BY ITS SHAPE (`kpi-rows.ts`), never named. On a project's page its rows are read as the block is
  drawn, since the suggestions need them; on Today only once a number is pressed or its menu opened. A reader who may not
  write is drawn the numbers and nothing to press. The sheet is loaded on the first press, so the page pays nothing for
  it until then.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn, springy } from '$lib/motion/index.ts';
  import { page as route } from '$app/state';
  import { createClient } from '@braindog/client';
  import { Kpis, type KpiInput, type KpiView } from 'braindog-render/svelte';
  import { untrack } from 'svelte';
  import { apiBase, at as inApp } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { kpiActionsFor, kpiSaidOf, kpiWritesOf, rowIcon, runKpiWrites, undoKpiWrites, type KpiAction, type KpiDone, type KpiWrite } from '$lib/page/block-menu.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { KpiAnswered } from '$lib/page/kpis-in.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { spokenOf } from '$lib/record/row-href.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { may } from '$lib/record/may.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import { rowWriter, type RowWriter, type Wrote } from '$lib/record/rows-write.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import { MENU_AT, type MenuAt } from '$lib/ui/context-menu.ts';
  import { numberMenus } from './cell-menu.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { draftsOf, findKpiList, findReadingList, keptOf, projectsOf, readKpis, rowOf, type Reads } from './kpi-rows.ts';
  import { staleFixOf, type ReadingFor, type StaleFix } from './stale-fix.ts';

  let {
    block,
    kpis,
    writes,
    param,
    now,
    href,
  }: {
    block: LiveBlock;
    /** The block's key numbers as the drawer takes them (`kpis-in.ts` `kpisIn`). */
    kpis: readonly KpiAnswered[];
    /** The page's writes, or `null` where it is inert: then nothing is pressed. */
    writes: { reread: () => Promise<void> } | null;
    /** The row the page is drawn for: the project, on its own page. */
    param: { register: string; seq: number; title: string } | undefined;
    now: number;
    /** Where a number opens for a reader who may not change it: its project's page. */
    href?: ((kpi: KpiAnswered) => string | null) | undefined;
  } = $props();

  const uid = $props.id();
  const shell = $derived(route.data as unknown as Partial<Shell>);
  const form = $derived<'project' | 'today'>((block as { for?: unknown }).for === 'today' ? 'today' : 'project');
  /* WHAT THE DRAWER LEAVES OUT AND THE MENU READS before the rows are: whether it shows on Today, and its project's id. */
  const raw = $derived.by((): Record<string, unknown>[] => {
    const held = (block as { kpis?: unknown }).kpis;
    return Array.isArray(held) ? held.filter((k): k is Record<string, unknown> => typeof k === 'object' && k !== null) : [];
  });
  const rawOf = (id: string | undefined): Record<string, unknown> | undefined => (id ? raw.find((r) => r.kpi === id) : undefined);
  /* "ALL NUMBERS" UNDER TODAY'S ROWS opens the list they are kept in, as the record names it on the block (`kpi_list`),
     never a list written here; drawn only while Today shows one. */
  const allNumbers = $derived.by((): string | null => {
    const at = (block as { kpi_list?: unknown }).kpi_list;
    return form === 'today' && kpis.length > 0 && typeof at === 'string' && at !== '' ? at : null;
  });

  let list = $state<string | null>(null);
  let rows = $state.raw<Entry[] | null>(null);
  let project = $state<string | null>(null);
  let unread = $state(false);
  let busy = $state(false);

  const writable = $derived(writes !== null && shell.me !== undefined && may(shell as Pick<Shell, 'me'>, 'write', list ?? undefined));
  /* ONLY THE RECORD'S OWNER TELLS AGENTS (`instruct`), so anyone else is offered the reading instead. */
  const tells = $derived(writes !== null && shell.me !== undefined && may(shell as Pick<Shell, 'me'>, 'owner'));
  const adds = $derived(form === 'project' && writable && param !== undefined);
  const drafts = $derived(form === 'project' && writable && rows && project ? draftsOf(rows, project) : []);

  const reads = (): Reads => createClient({ base: apiBase() }) as unknown as Reads;
  let own: RowWriter | undefined;
  const writer = (): RowWriter => (own ??= rowWriter(apiBase()));

  /** The list and its rows, read once and again after each write. `false` where the record would not say. */
  let reading: Promise<boolean> | null = null;
  function ready(fresh = false): Promise<boolean> {
    if (reading && !fresh) return reading;
    reading = (async () => {
      const c = reads();
      list ??= await findKpiList(c, (shell.index?.registers ?? []).map((r) => r.id), param?.register ?? null);
      if (!list) return false;
      const got = await readKpis(c, list);
      unread = got === null;
      if (got) rows = got;
      return got !== null;
    })();
    return reading;
  }

  /* THE PROJECT'S OWN ROW ID, which its numbers point at: from a number of it, else asked of the record once. */
  async function projectOf(): Promise<void> {
    const thing = raw.find((k) => typeof k.thing === 'string')?.thing;
    if (typeof thing === 'string') return void (project = thing);
    if (!param) return;
    const got = await createClient({ base: apiBase() }).get(param.register, param.seq);
    const id = got.ok ? (got.value as { id?: unknown } | null)?.id : null;
    if (typeof id === 'string') project = id;
  }

  /* ON A PROJECT'S PAGE THE ROWS ARE READ AS IT IS DRAWN, for what was suggested; on Today only when a number is pressed. */
  $effect(() => {
    if (form !== 'project' || writes === null || !param) return;
    untrack(() => {
      void ready().then((ok) => (ok ? projectOf() : undefined));
    });
  });

  /** Reads the rows again and the page under them, after a write or its Undo. */
  async function after(): Promise<void> {
    await ready(true);
    await writes?.reread();
  }

  /* ── the sheet ── */

  let sheetOn = $state(false);
  let sheetOpen = $state(false);
  let sheetKpi = $state.raw<Entry | null>(null);
  let sheetProject = $state<{ seq: number; name: string }>({ seq: 0, name: '' });

  async function openKpi(input: KpiInput): Promise<void> {
    if (!(await ready()) || !list) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    const row = rowOf(rows ?? [], input.kpi);
    if (!row) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    sheetKpi = row;
    const spoken = (input as KpiAnswered).spoken;
    sheetProject = { seq: (spoken ? spokenOf(spoken)?.seq : undefined) ?? param?.seq ?? 0, name: input.project ?? param?.title ?? '' };
    sheetOn = true;
    sheetOpen = true;
  }

  async function addKpi(): Promise<void> {
    if (!param) return;
    if (!(await ready()) || !list) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    sheetKpi = null;
    sheetProject = { seq: param.seq, name: param.title };
    sheetOn = true;
    sheetOpen = true;
  }

  /* ── a number's menu ── */

  /** What the menu offers: from its row once read, and from what the block answered until then. */
  function actionsOf(k: Pick<KpiView, 'input'>): KpiAction[] {
    const row = rowOf(rows ?? [], k.input.kpi);
    const held = rawOf(k.input.kpi);
    const fields: Fields = row?.fields ?? { today: typeof held?.today === 'string' ? held.today : 'auto', headline: form === 'today' ? held?.headline === true : false };
    return kpiActionsFor({ fields }, writable);
  }

  async function press(a: KpiAction, k: Pick<KpiView, 'input' | 'name'>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (!(await ready(true)) || !list) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
      const row = rowOf(rows ?? [], k.input.kpi);
      if (!row) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
      /* TODAY SHOWS FOUR AT MOST, so a fifth pin is a choice of which: the chooser says so and holds the four. */
      if (a.id === 'kpi-pin' && (rows ?? []).filter((r) => r.fields.today === 'pinned' && r.fields.state !== 'retired' && r.fields.draft !== true).length >= 4) {
        toasts.push(copy.kpiChooseFull);
        return void openChooser();
      }
      const thing = typeof row.fields.thing === 'string' ? row.fields.thing : String(row.fields.thing ?? '');
      const w = writer();
      const at = list;
      const out = await runKpiWrites(w, at, kpiWritesOf(a.id, row, keptOf(rows ?? [], thing)));
      if (!out.ok) {
        /* HALF A PRESS IS PUT BACK, so no two numbers lead one card. */
        if (out.done.length) await undoKpiWrites(w, at, out.done);
        toasts.push(out.fix, { intent: 'bad' });
      } else if (out.done.length) toasts.push(kpiSaidOf(a.id, k.name), { undo: () => void undo(w, at, out.done) });
      await after();
    } finally {
      busy = false;
    }
  }

  async function undo(w: RowWriter, at: string, done: readonly KpiDone[]): Promise<void> {
    const out = await undoKpiWrites(w, at, done);
    toasts.push(out.ok ? copy.kpiUndone : out.fix, out.ok ? {} : { intent: 'bad' });
    await after();
  }

  /* ── what was suggested ── */

  async function settle(write: Promise<Wrote>, said: string, back: (version: number) => Promise<Wrote>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const out = await write;
      if (!out.ok) toasts.push(out.fix, { intent: 'bad' });
      else
        toasts.push(said, {
          undo: () =>
            void back(out.entry.version).then(async (b) => {
              toasts.push(b.ok ? copy.kpiUndone : b.fix, b.ok ? {} : { intent: 'bad' });
              await after();
            }),
        });
      await after();
    } finally {
      busy = false;
    }
  }

  const nameOf = (row: Entry): string => (typeof row.fields.name === 'string' ? row.fields.name : '');
  const keep = (row: Entry, at: string) =>
    settle(writer().update(at, row.seq, { draft: false }, row.version), copy.kpiKept(nameOf(row)), (v) => writer().update(at, row.seq, { draft: true }, v));
  const turnDown = (row: Entry, at: string) =>
    settle(writer().archive(at, row.seq, row.version), copy.kpiTurnedDown(nameOf(row)), (v) => writer().restore(at, row.seq, v));

  /* ── a stale number's fix (`stale-fix.ts`) ── */

  const fixOf = (k: KpiView): StaleFix | null => staleFixOf(k.input as KpiAnswered, { tell: tells, add: writable }, { now });

  async function runFix(f: StaleFix, k: KpiView): Promise<void> {
    if (busy) return;
    if (f.kind === 'add') return void openReading(k);
    busy = true;
    try {
      /* THE AGENTS' DOOR ON THE PRESS (`instruct.ts`), so a drawn tile does not carry it. */
      const io = (await import('$lib/record/instruct.ts')).control(apiBase());
      const out = await io.send(f.args);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'bad' });
      const id = out.value.id;
      toasts.push(copy.kpiAsked(f.agent, f.name), {
        undo: () => void io.takeBack(id).then((b) => toasts.push(b.ok ? copy.kpiAskTakenBack : b.fix, b.ok ? {} : { intent: 'bad' })),
      });
    } finally {
      busy = false;
    }
  }

  let readingOn = $state(false);
  let readingOpen = $state(false);
  let readingList = $state<string | null>(null);
  let readingKpi = $state.raw<ReadingFor>({ name: '' });
  let readingProject = $state<{ seq: number; name: string }>({ seq: 0, name: '' });

  async function openReading(k: KpiView): Promise<void> {
    if (!(await ready()) || !list) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    const row = rowOf(rows ?? [], k.input.kpi);
    readingList ??= await findReadingList(reads(), (shell.index?.registers ?? []).map((r) => r.id), projectsOf(list));
    if (!readingList) return void toasts.push(copy.kpiReadingNoList, { intent: 'bad' });
    if (!row) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    const f = row.fields;
    readingKpi = { name: k.name, measure: typeof f.measure === 'string' ? f.measure : null, unit: typeof f.unit === 'string' ? f.unit : (k.input.unit ?? null) };
    const spoken = (k.input as KpiAnswered).spoken;
    readingProject = { seq: (spoken ? spokenOf(spoken)?.seq : undefined) ?? param?.seq ?? 0, name: k.input.project ?? param?.title ?? '' };
    readingOn = true;
    readingOpen = true;
  }

  let tileAt = $state.raw<{ x: number; y: number; height: number } | null>(null);
  /* THE TILE IS A HOST FOR WHO MAY CHOOSE; for anybody else a press is left unclaimed, and the block around it answers. */
  const tileHost = (node: HTMLElement) => {
    if (writes === null) return;
    node.setAttribute('data-menu-host', 'self');
    const on = (e: Event) => {
      if (!writable) return;
      e.preventDefault();
      tileAt = (e as CustomEvent<MenuAt>).detail;
    };
    node.addEventListener(MENU_AT, on);
    return () => node.removeEventListener(MENU_AT, on);
  };

  /* A FIGURE ON THE PROJECT'S NUMBERS TILE ASKS HERE (`cell-menu.svelte.ts`). One the tile drew from readings alone is no key
     number yet, so it has only what the tile has. */
  let cellAt = $state.raw<{ x: number; y: number; height: number } | null>(null);
  let cellKpi = $state.raw<KpiAnswered | null>(null);
  $effect(() => {
    if (form !== 'project' || !writable) return;
    numberMenus.open = (name, at) => {
      const k = name === null ? undefined : kpis.find((x) => x.name === name);
      if (k) {
        cellKpi = k;
        cellAt = at;
      } else tileAt = at;
    };
    return () => {
      numberMenus.open = null;
    };
  });

  /* THE BLOCK MAY BE HELD UNSEEN, AND A SHEET INSIDE IT WOULD BE TOO, so its sheets, and the menus a phone draws as sheets,
     are drawn at the end of the page. */
  const toBody = (node: HTMLElement) => {
    document.body.appendChild(node);
    return () => node.remove();
  };

  /* ── what shows on Today, chosen (`KpiChooser.svelte`) ── */

  let chooserOn = $state(false);
  let chooserOpen = $state(false);
  let projectNames = $state.raw<ReadonlyMap<string, string>>(new Map());

  async function openChooser(): Promise<void> {
    if (!(await ready(true)) || !list) return void toasts.push(copy.kpiNotRead, { intent: 'bad' });
    const projects = projectsOf(list);
    const title = projects ? (REGISTERS[projects] as { title?: string } | undefined)?.title : undefined;
    const names = new Map<string, string>();
    if (projects && title) {
      const got = await readKpis(reads(), projects).catch(() => null);
      for (const p of got ?? []) if (p.id) names.set(p.id, String(p.fields[title] ?? ''));
    }
    projectNames = names;
    chooserOn = true;
    chooserOpen = true;
  }

  async function chosen(writes: readonly KpiWrite[]): Promise<void> {
    if (!list) return;
    const w = writer();
    const at = list;
    const out = await runKpiWrites(w, at, writes);
    if (!out.ok) {
      if (out.done.length) await undoKpiWrites(w, at, out.done);
      toasts.push(out.fix, { intent: 'bad' });
    } else if (out.done.length) toasts.push(copy.kpiChooseSaved, { undo: () => void undo(w, at, out.done) });
    await after();
  }

  let menus = $state<Record<string, boolean>>({});
  /* THE ROWS ARE READ AS A MENU OPENS on Today, so its press has its version in hand. */
  $effect(() => {
    if (Object.values(menus).some(Boolean)) untrack(() => void ready());
  });
</script>

{#snippet numberItems(k: Pick<KpiView, 'input' | 'name'>, acts: readonly KpiAction[])}
  <!-- OPEN: the number's sheet for who may change it, its project's page for who may only read. -->
        {#if writable}
          <button type="button" class="kb-item" role="menuitem" onclick={() => void openKpi(k.input)}><Icon name="arrow" size="s" />{copy.kpiMenuOpen}</button>
        {:else if href?.(k.input as KpiAnswered)}
          <a class="kb-item" role="menuitem" data-link-verb href={href(k.input as KpiAnswered)}><Icon name="arrow" size="s" />{copy.kpiMenuOpen}</a>
        {/if}
        {#each acts as a (a.id)}
          <button type="button" class="kb-item" role="menuitem" onclick={() => void press(a, k)}><Icon name={rowIcon(a.id)} size="s" />{a.label}</button>
        {/each}
        {#if writable}
          <hr />
          <button type="button" class="kb-item" role="menuitem" onclick={() => void openChooser()}><Icon name="grid" size="s" />{copy.kpiMenuChoose}</button>
        {/if}
{/snippet}

{#snippet menu(k: KpiView)}
  {@const acts = actionsOf(k)}
  {#if acts.length || (writes !== null && (writable || href?.(k.input as KpiAnswered)))}
    <span class="kb-menu" data-open={menus[k.key] ? '' : undefined}>
      <Menu label={copy.kpiMenu(k.name)} align="end" bind:open={() => menus[k.key] === true, (v) => (menus[k.key] = v)}>
        {#snippet trigger()}<span class="kb-mark"><Icon name="more" size="s" /><span class="kb-hidden">{copy.kpiMenu(k.name)}</span></span>{/snippet}
        {@render numberItems(k, acts)}
      </Menu>
    </span>
  {/if}
{/snippet}

{#snippet fix(k: KpiView)}
  {@const f = fixOf(k)}
  {#if f}<button type="button" class="kpi-fix" disabled={busy} onclick={() => void runFix(f, k)}>{f.label}</button>{/if}
{/snippet}

{#snippet foot()}
  <Button size="sm" onclick={() => void addKpi()}><Icon name="plus" size="s" />{copy.kpiAddNumber}</Button>
{/snippet}

<div class="kb" aria-busy={busy ? 'true' : undefined} {@attach tileHost}>
  {#if kpis.length === 0}
    <p class="kb-none">{unread ? copy.kpiNotRead : copy.kpiNoneYet}</p>
  {/if}
  <Kpis {kpis} {form} lead={form !== 'project'} leads={copy.kpiLeads} home={homeCurrency()} {now} onopen={writable ? (k) => void openKpi(k) : undefined} href={href ? (k) => href(k as KpiAnswered) : undefined} menu={writable ? menu : undefined} {fix} add={adds ? foot : undefined} />

  {#if allNumbers}
    <a class="kb-all tap" href={inApp(`/r/${encodeURIComponent(allNumbers)}`)}>{copy.kpiAllNumbers}<Icon name="arrow" size="s" /></a>
  {/if}

  {#if drafts.length && list}
    {@const at = list}
    <section class="kb-suggested" aria-labelledby="{uid}-suggested">
      <h3 class="kb-head" id="{uid}-suggested">{copy.kpiSuggested}</h3>
      <ul class="kb-drafts">
        {#each drafts as d (d.seq)}
          <li class="kb-draft" in:lineIn out:dismiss animate:flip={springy()}>
            <span class="kb-draft-text">
              <span class="kb-draft-name">{nameOf(d)}</span>
              {#if typeof d.fields.measures === 'string' && d.fields.measures.trim() !== ''}<span class="kb-draft-line">{d.fields.measures}</span>{/if}
            </span>
            <span class="kb-draft-acts">
              <Button size="sm" disabled={busy} onclick={() => void keep(d, at)}>{copy.kpiKeepOne}</Button>
              <Button size="sm" weight="bare" disabled={busy} onclick={() => void turnDown(d, at)}>{copy.kpiNotThis}</Button>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<div class="kb-sheets" {@attach toBody}>
{#if cellKpi}
  {@const k = { input: cellKpi as KpiInput, name: cellKpi.name }}
  <Menu label={copy.kpiMenu(k.name)} open={cellAt !== null} at={cellAt} onclose={() => (cellAt = null)}>
    {@render numberItems(k, actionsOf(k))}
  </Menu>
{/if}

<!-- THE TILE AROUND ITS NUMBERS: what shows on Today, a right-click away from anywhere in it. -->
{#if writable}
  <Menu label={copy.kpiMenuChoose} open={tileAt !== null} at={tileAt} onclose={() => (tileAt = null)}>
    <button type="button" class="kb-item" role="menuitem" onclick={() => void openChooser()}><Icon name="grid" size="s" />{copy.kpiMenuChoose}</button>
    {#if allNumbers}<a class="kb-item" role="menuitem" href={inApp(`/r/${encodeURIComponent(allNumbers)}`)}><Icon name="rows" size="s" />{copy.kpiAllNumbers}</a>{/if}
  </Menu>
{/if}
{#if chooserOn && list}
  {#await import('./KpiChooser.svelte') then { default: KpiChooser }}
    <KpiChooser bind:open={chooserOpen} rows={rows ?? []} names={projectNames} showing={form === 'today' ? kpis.map((k) => k.kpi) : []} onsave={chosen} />
  {/await}
{/if}

{#if readingOn && readingList && list}
  {#await import('./ReadingSheet.svelte') then { default: ReadingSheet }}
    <ReadingSheet bind:open={readingOpen} list={readingList} projects={projectsOf(list)} project={readingProject} kpi={readingKpi} now={recordNow} onsaved={() => void after()} />
  {/await}
{/if}

{#if sheetOn && list}
  {#await import('./KpiSheet.svelte') then { default: KpiSheet }}
    <KpiSheet bind:open={sheetOpen} {list} project={sheetProject} kpi={sheetKpi} onsaved={() => void after()} />
  {/await}
{/if}
</div>

<style>
  .kb-sheets {
    display: contents;
  }
  .kb {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* "ALL NUMBERS →" UNDER TODAY'S ROWS, a tile's door in its look (`BlockSlot.svelte` `a.block-all`): 13/500 in the
     second ink with its arrow, no underline, as wide as its words. */
  .kb-all {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    justify-self: start;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .kb-all:hover {
    color: var(--ink);
  }

  .kb-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  /* THE MENU'S MARK, as a block's is: 24 square with a pointer and waiting for the KPI's hover, 44 under a thumb. */
  .kb-mark {
    display: grid;
    place-items: center;
    inline-size: var(--sp-5);
    block-size: var(--sp-5);
    border-radius: var(--r-pill, 999px);
    color: var(--ink-3);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .kb-mark:hover,
  .kb-menu:has(:focus-visible) .kb-mark,
  .kb-menu[data-open] .kb-mark {
    background: var(--row-wash, var(--hover));
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .kb-menu {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.kpi:is(:hover, :focus-within)) .kb-menu,
    .kb-menu[data-open] {
      opacity: 1;
    }
  }

  @media not ((hover: hover) and (pointer: fine)) {
    .kb-mark {
      inline-size: 44px;
      block-size: 44px;
      margin-block: calc(-10px * var(--dense, 1));
    }
  }

  /* THE MENU'S NAME, for a screen reader only: no global rule backs `.sr-only`, so this one is the component's own. */
  .kb-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .kb-item {
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .kb-item:hover,
  .kb-item:focus-visible {
    background: var(--row-wash, var(--hover));
    color: var(--ink);
  }

  /* ── what was suggested: a hairline over it, a small heading, and one row a number ── */

  .kb-suggested {
    display: grid;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .kb-head {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: calc(18px * var(--type, 1));
  }

  .kb-drafts {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kb-draft {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    padding-block: var(--sp-2);
  }

  .kb-draft + .kb-draft {
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .kb-draft-text {
    display: grid;
    min-inline-size: 0;
  }

  .kb-draft-name {
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: calc(20px * var(--type, 1));
  }

  .kb-draft-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .kb-draft-acts {
    display: flex;
    flex: none;
    gap: var(--sp-2);
  }
</style>
