<!--
  The sidebar (frame A, 23 October): what you own, under the top bar, on the board. One sidebar, on the left only.

  A head ("Projects", how many are in play, and "+" to add one), then each project in play as a row, by this week (pins
  on top, then late, then an agent at work, then money in), with its own colour and one mark: a red "late" or a green
  working dot. The open project shows its parts under it, the tiles its page draws (`data-part`), the one in view
  marked. Parked and Finished fold under them. Then Lists, grouped as the More sheet read them and each group folded
  until opened, with counts (`groupsOf`); at the foot suggested changes when any, then Settings.

  GENERIC: whatever projects the record holds (`side-read.ts`), found by what its list declares; nothing here names one.

  ON A PHONE (`phone`) IT IS THE PROJECTS TAB: the page's head, one sentence, and the same rows with one fact each in
  place of the dot, in a tile, with the same folds, then the lists.

  ITS OWN CHUNK, loaded when the frame asks for it (`+layout.svelte`), so the shell's entry carries none of it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { markOf } from 'braindog-render';
  import { at, here as inside } from '../at.ts';
  import { placeOf } from '../nav.ts';
  import { slotStyle } from '../home/project-cards.ts';
  import Icon from '../ui/Icon.svelte';
  import { isGlyph, type IconName } from '../ui/icons.ts';
  import PageHead from '../ui/PageHead.svelte';
  import { drew } from '../ui/screen.svelte.ts';
  import { REGISTERS } from '../record/held.ts';
  import { PINS_KEY, SIDE_MAX, SIDE_MIN, byWeek, factOf, groupsOf, pinsKept, playSaid, splitOf, widthOf, type SideGroup, type SideHeads, type SideLink, type SideList, type SideProject } from './side.ts';
  import { readSide, readWeek, type SideRead, type SideRow, type Week } from './side-read.ts';
  import { knowProjects } from '../page/known-project.ts';

  let {
    base,
    lists,
    working = [],
    version = null,
    projects = null,
    width = 248,
    phone = false,
    places = [],
    owned = [],
    views = [],
    tools = [],
    heads,
    pen = null,
    onwidth,
  }: {
    /** Where the record answers. */
    base: string;
    /** The record's lists, as `boot` names them, for finding the projects list by what it declares. */
    lists: readonly { id: string }[];
    /** The projects an agent is at work on now, by name. */
    working?: readonly (string | null)[];
    /** The record's version, so the sidebar reads again when something changed. */
    version?: number | null;
    /** Where the Projects place opens, for the head's name. */
    projects?: string | null;
    /** The width it is drawn at on a desk. */
    width?: number;
    phone?: boolean;
    /** The places the bar leaves out (Work, People), each a row under Lists. */
    places?: readonly SideLink[];
    /** The record's lists that hold something, the kernel's own marked; money's is read from each declaration. */
    owned?: readonly Omit<SideList, 'money'>[];
    /** The places' own views (Board under Work), drawn with the saved views. */
    views?: readonly SideLink[];
    /** The record's tools (automations, the vault and the rest). */
    tools?: readonly SideLink[];
    /** The words each group is drawn under. */
    heads?: SideHeads | undefined;
    /** Suggested changes waiting, said as one line, and where they are reviewed. */
    pen?: { label: string; href: string } | null;
    /** Told of a width dragged, and whether the drag is over (then it is kept). */
    onwidth?: ((n: number, done: boolean) => void) | undefined;
  } = $props();

  const words = {
    title: 'Projects',
    inPlay: (n: number) => `${n.toLocaleString('en-GB')} in play`,
    add: 'Add a project',
    late: 'late',
    working: 'An agent is at work',
    pin: (name: string) => `Keep ${name} on top`,
    unpin: (name: string) => `Stop keeping ${name} on top`,
    parts: (name: string) => `${name}, its parts`,
    resize: 'Sidebar width',
    none: 'No projects yet.',
    lists: 'Lists',
    review: 'Review',
    settings: 'Settings',
  } as const;

  /* THE READ: the projects first, then their week. Asked again when the record's version moves, a moment after. */
  let read = $state.raw<SideRead | null>(null);
  /* ON A PHONE THIS IS THE SCREEN, so it says it drew once its first read has answered, as a route does (`data-screen`). */
  let answered = $state(false);
  $effect(() => {
    if (phone && answered) drew('ready');
  });
  let week = $state.raw<Week>(new Map());
  let asked = 0;
  $effect(() => {
    void version;
    const b = base;
    const l = lists;
    const n = ++asked;
    const go = (): void =>
      void readSide(b, l)
        .then(async (got) => {
          if (n !== asked) return;
          read = got;
          answered = true;
          if (got === null) return;
          /* EACH PROJECT'S PAGE CAN NOW OPEN IN ITS OWN SHAPE (`known-project.ts`), its way back the Projects place. */
          knowProjects(b, got.rows, projects);
          const play = splitOf(got.rows, got.lanes).play;
          const w = await readWeek(b, got.list, play);
          if (n === asked) week = w;
        })
        .catch(() => {
          if (n === asked) answered = true;
        });
    /* THE FIRST READ AT ONCE; a re-read waits for the page that moved the version to have its own reads out first. */
    const t = setTimeout(go, untrack(() => read) === null ? 0 : 1200);
    return () => clearTimeout(t);
  });

  /* THE PINS ON THIS DEVICE (pick 3), by address. */
  let pins = $state<string[]>([]);
  $effect(() => {
    try {
      pins = pinsKept(localStorage.getItem(PINS_KEY));
    } catch {
      pins = [];
    }
  });
  function pin(href: string): void {
    pins = pins.includes(href) ? pins.filter((h) => h !== href) : [...pins, href];
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    } catch {
      /* A browser that keeps nothing keeps the pin for this tab only. */
    }
  }

  const busy = $derived(new Set(working.filter((w): w is string => typeof w === 'string' && w !== '')));
  const full = (r: SideRow): SideProject => {
    const w = week.get(r.key);
    return { ...r, late: w?.late ?? 0, moved: w?.moved ?? false, working: busy.has(r.name), pinned: pins.includes(r.href) };
  };
  const split = $derived(read ? splitOf(read.rows.map(full), read.lanes) : null);
  const play = $derived(split ? byWeek(split.play) : []);

  /* THE OPEN PROJECT: the one whose page the address is on. */
  const path = $derived(inside(page.url.pathname));
  const openOf = (p: { href: string }): boolean => path === p.href || path.startsWith(`${p.href}/`);

  /* WHICH FOLDS ARE OPEN. Shut on every load: they hold what is not in play. */
  let folds = $state({ parked: false, finished: false });

  /**
   * THE OPEN PROJECT'S PARTS, as its page draws them: every tile that says it is a part (`data-part`), with its count or
   * its live dot, read once the page has drawn and again as it fills. Nothing for a page that is not a project's.
   */
  type Part = { id: string; label: string; icon: IconName; count: string | null; live: boolean };
  let parts = $state.raw<Part[]>([]);
  let inView = $state<string | null>(null);
  const opened = $derived(play.find(openOf) ?? null);
  $effect(() => {
    if (phone || opened === null) return void (parts = []);
    void path;
    let main: HTMLElement | null = null;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const take = (): void => {
      const now = main?.isConnected ? main : document.getElementById('main');
      if (now !== main) {
        seen.disconnect();
        main = now;
        if (main) seen.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-part-count', 'data-part-live'] });
      }
      const next = main
        ? [...main.querySelectorAll<HTMLElement>('[data-part]')].map((el) => ({
            id: el.id,
            label: el.dataset.part ?? '',
            icon: (el.dataset.partIcon ?? 'doc') as IconName,
            count: el.dataset.partCount ?? null,
            live: el.dataset.partLive !== undefined,
          }))
        : [];
      if (JSON.stringify(next) !== JSON.stringify(untrack(() => parts))) parts = next.filter((p) => p.id !== '' && p.label !== '');
      spy();
    };
    const seen = new MutationObserver(() => {
      clearTimeout(wait);
      wait = setTimeout(take, 120);
    });
    /* WHICH PART IS IN VIEW: the last whose top has reached the page's top, else the first. */
    const spy = (): void => {
      if (!main) return;
      const top = main.getBoundingClientRect().top + 96;
      let at: string | null = null;
      for (const p of untrack(() => parts)) {
        const el = document.getElementById(p.id);
        if (el && el.getBoundingClientRect().top <= top) at = p.id;
      }
      inView = at ?? untrack(() => parts)[0]?.id ?? null;
    };
    let frame = 0;
    const onscroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(spy);
    };
    const start = setTimeout(take, 0);
    document.addEventListener('scroll', onscroll, { capture: true, passive: true });
    return () => {
      clearTimeout(start);
      clearTimeout(wait);
      cancelAnimationFrame(frame);
      seen.disconnect();
      document.removeEventListener('scroll', onscroll, { capture: true });
    };
  });

  function toPart(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    inView = id;
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* A MARK: the glyph the row names where it may be one, else the name's first letter (`ProjectWell`'s rule). */
  const markFor = (p: Pick<SideProject, 'mark' | 'name'>): { glyph?: IconName; letter?: string } => {
    const m = markOf(p.mark, p.name);
    return m !== null && m.length > 1 && isGlyph(m) ? { glyph: m as IconName } : { letter: m ?? p.name.slice(0, 1) };
  };

  /* THE WIDTH, DRAGGED FROM THE EDGE BETWEEN 220 AND 320 (pick 5), or moved by the arrows a step at a time. */
  function drag(e: PointerEvent): void {
    if (e.button !== 0) return;
    const grip = e.currentTarget as HTMLElement;
    const rtl = getComputedStyle(grip).direction === 'rtl';
    const from = e.clientX;
    const start = width;
    let now = start;
    grip.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => {
      now = widthOf(start + (rtl ? from - m.clientX : m.clientX - from));
      onwidth?.(now, false);
    };
    const up = (): void => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      onwidth?.(now, true);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }
  function nudge(e: KeyboardEvent): void {
    const step = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : e.key === 'Home' ? -999 : e.key === 'End' ? 999 : 0;
    if (step === 0) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === 'rtl';
    onwidth?.(widthOf(width + (rtl && Math.abs(step) === 16 ? -step : step)), true);
  }

  const sentence = $derived(read && split ? playSaid(split.play, read.label) : undefined);

  /* THE LISTS' GROUPS, once the read has learnt every list's declaration: a list is money's by a money field it declares. */
  const groups = $derived.by((): SideGroup[] => {
    if (!answered || heads === undefined) return [];
    const money = (id: string): boolean => REGISTERS[id]?.fields.some((f) => f.type === 'money') ?? false;
    return groupsOf(places, owned.map((l) => ({ ...l, money: money(l.id) })), views, tools, heads);
  });
  const spot = $derived(placeOf(path, page.url.searchParams));
  const under = (href: string): boolean => spot === href || spot.startsWith(`${href}/`);
  /* A GROUP IS FOLDED UNTIL OPENED, and the one holding the page you are on is open. */
  let unfolded = $state<Record<string, boolean>>({});
  const isOpen = (g: SideGroup): boolean => unfolded[g.key] ?? g.items.some((i) => under(i.href));
</script>

{#snippet mark(p: SideProject)}
  {@const m = markFor(p)}
  <span class="s-pm" style={slotStyle(p.hue)} aria-hidden="true">{#if m.glyph}<Icon name={m.glyph} size="s" />{:else}{m.letter}{/if}</span>
{/snippet}

{#snippet row(p: SideProject, fact: boolean)}
  {@const here = openOf(p)}
  <li class="s-item" data-open={here && !phone ? '' : undefined}>
    <a class="s-row tap" href={at(p.href)} aria-current={here ? 'page' : undefined}>
      {#if !phone}<span class="s-caret" aria-hidden="true"><Icon name={here ? 'chevronDown' : 'chevron'} size="s" /></span>{/if}
      {@render mark(p)}
      <span class="s-name" dir="auto">{p.name}</span>
      {#if fact}
        {@const f = factOf(p)}
        {#if f}<span class="s-fact" data-tone={f.tone}>{f.text}</span>{/if}
        {#if p.working && f?.tone !== 'live'}<span class="s-dot" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
      {:else}
        {#if p.late > 0}<span class="s-late">{words.late}</span>{/if}
        {#if p.working}<span class="s-dot" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
      {/if}
    </a>
    {#if !phone}
      <button type="button" class="s-pin tap" data-on={p.pinned ? '' : undefined} aria-pressed={p.pinned} aria-label={p.pinned ? words.unpin(p.name) : words.pin(p.name)} title={p.pinned ? words.unpin(p.name) : words.pin(p.name)} onclick={() => pin(p.href)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.75h6l-1 5.5 3.25 3.5H6.75L10 10.25zM12 13.75v5.5" /></svg>
      </button>
    {/if}
    {#if here && !phone && parts.length > 0}
      <ul class="s-parts" aria-label={words.parts(p.name)}>
        {#each parts as part (part.id)}
          <li>
            <button type="button" class="s-part tap" aria-current={inView === part.id ? 'location' : undefined} onclick={() => toPart(part.id)}>
              <Icon name={part.icon} size="s" /><span class="s-name">{part.label}</span>
              {#if part.live}<span class="s-dot" aria-hidden="true"></span>{:else if part.count}<span class="s-count num">{part.count}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet fold(key: 'parked' | 'finished', list: SideProject[], label: string, icon: IconName)}
  {#if list.length > 0}
    <button type="button" class="s-fold tap" aria-expanded={folds[key]} onclick={() => (folds[key] = !folds[key])}>
      <Icon name={icon} size="s" /><span class="s-name">{label}</span><span class="s-count num">{list.length}</span>
      <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
    </button>
    {#if folds[key]}
      <ul class="s-list">
        {#each list as p (p.key)}{@render row(p, phone)}{/each}
      </ul>
    {/if}
  {/if}
{/snippet}

{#snippet link(l: SideLink, nested: boolean)}
  <li>
    <a class="s-row s-link tap" data-nested={nested ? '' : undefined} href={at(l.href)} aria-current={under(l.href) ? 'page' : undefined}>
      <Icon name={l.icon as IconName} size="s" /><span class="s-name">{l.label}</span>
      {#if l.count}<span class="s-count num">{l.count.toLocaleString('en-GB')}</span>{/if}
    </a>
  </li>
{/snippet}

{#snippet listed()}
  {#if groups.length > 0}
    <h2 class="s-title s-lists">{words.lists}</h2>
    <ul class="s-list">
      {#each groups as g (g.key)}
        {#if g.items.length === 1 && g.items[0]}
          {@render link(g.items[0], false)}
        {:else}
          {@const open = isOpen(g)}
          <li>
            <button type="button" class="s-fold s-group tap" aria-expanded={open} onclick={() => (unfolded[g.key] = !open)}>
              <Icon name={g.icon as IconName} size="s" /><span class="s-name">{g.label}</span><span class="s-count num">{g.items.length}</span>
              <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
            </button>
            {#if open}
              <ul class="s-list">
                {#each g.items as l (l.href)}{@render link(l, true)}{/each}
              </ul>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet end()}
  <ul class="s-list s-end">
    {#if pen}
      <li>
        <a class="s-row s-link tap" href={at(pen.href)}><Icon name="alert" size="s" /><span class="s-name">{pen.label}</span><span class="s-count">{words.review}</span></a>
      </li>
    {/if}
    {@render link({ href: '/settings', label: words.settings, icon: 'settings' }, false)}
  </ul>
{/snippet}

{#if phone}
  <PageHead title={words.title} {sentence} />
  <div class="s-phone">
    {#if read && split}
      {#if play.length > 0}
        <ul class="s-list s-tile">
          {#each play as p (p.key)}{@render row(p, true)}{/each}
        </ul>
      {:else}
        <p class="s-none">{words.none}</p>
      {/if}
      <div class="s-foot">
        {@render fold('parked', split.parked, read.label('parked'), 'archive')}
        {@render fold('finished', split.finished, read.label([...read.lanes.finished][0] ?? 'retired'), 'check')}
      </div>
    {/if}
    {#if groups.length > 0}
      <div class="s-tile s-phone-lists">{@render listed()}</div>
    {/if}
  </div>
{:else}
  <aside class="s-side" aria-label={words.title}>
    <div class="s-scroll">
      <div class="s-head">
        {#if projects}<a class="s-title" href={at(projects)}>{words.title}</a>{:else}<span class="s-title">{words.title}</span>{/if}
        {#if split}<span class="s-count">{words.inPlay(split.play.length)}</span>{/if}
        {#if read}
          <a class="s-add tap" href={at(`/r/${read.list}?new=1`)} aria-label={words.add} title={words.add}><Icon name="plus" size="m" /></a>
        {/if}
      </div>
      {#if read && split}
        <ul class="s-list">
          {#each play as p (p.key)}{@render row(p, false)}{/each}
        </ul>
        {#if split.parked.length > 0 || split.finished.length > 0}
          <div class="s-foot">
            {@render fold('parked', split.parked, read.label('parked'), 'archive')}
            {@render fold('finished', split.finished, read.label([...read.lanes.finished][0] ?? 'retired'), 'check')}
          </div>
        {/if}
      {/if}
      {@render listed()}
      {#if answered}{@render end()}{/if}
    </div>
    <!-- THE EDGE, DRAGGED. A separator with its value is a widget, so it takes focus and the arrows move it too. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="s-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={words.resize}
      aria-valuemin={SIDE_MIN}
      aria-valuemax={SIDE_MAX}
      aria-valuenow={width}
      tabindex="0"
      onpointerdown={drag}
      onkeydown={nudge}
    ></div>
  </aside>
{/if}

<style>
  /* ON THE BOARD, the work's own ground, a hairline at its end edge, scrolling by itself under the bar. */
  .s-side {
    position: relative;
    display: flex;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    border-inline-end: 1px solid var(--rule);
  }

  /* A COLUMN, so the foot (suggested changes, Settings) sits at the bottom when the rest is short. */
  .s-scroll {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-inline-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--sp-5) var(--sp-3) var(--sp-6);
  }

  .s-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-inline: var(--sp-3) 0;
    margin-block-end: var(--sp-3);
  }

  .s-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    text-decoration: none;
  }

  .s-head .s-count {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .s-add {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-inline-start: auto;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
  }

  .s-list,
  .s-parts {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .s-item {
    position: relative;
  }

  /* A ROW: 32 tall, a caret in its gutter, the mark at 20, the name at 14/500, then "late" and the dot at its end. */
  .s-row,
  .s-part,
  .s-fold {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 32px;
    padding-inline: var(--sp-1) var(--sp-3);
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  /* ROOM FOR THE PIN, which shows at the row's end under a pointer or on focus. */
  .s-row {
    padding-inline-end: calc(var(--sp-3) + 20px);
  }

  .s-row[aria-current='page'] {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .s-caret {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 12px;
    color: var(--ink-3);
    opacity: 0;
  }

  .s-row[aria-current='page'] .s-caret {
    opacity: 1;
  }

  .s-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE PROJECT'S MARK: 20 square, its slot's tint with the glyph or letter in its slot's colour. */
  .s-pm {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    border-radius: 6px;
    background: var(--ph-tint);
    color: var(--ph);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  .s-pm :global(.icon[data-size]) {
    inline-size: 13px;
    block-size: 13px;
  }

  .s-late {
    flex: none;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .s-dot {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  /* THE PIN: a 24 square at the row's end, quiet; a pinned row shows it at rest. */
  .s-pin {
    position: absolute;
    inset-block-start: 4px;
    inset-inline-end: var(--sp-1);
    display: grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-xs);
    color: var(--ink-3);
    cursor: pointer;
    opacity: 0;
  }

  .s-pin svg {
    inline-size: 14px;
    block-size: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .s-pin[data-on] svg {
    fill: currentColor;
  }

  .s-item:hover > .s-pin,
  .s-pin:focus-visible {
    opacity: 1;
  }

  /* A PINNED ROW KEEPS ITS PIN IN VIEW only where nothing else sits at its end. */
  .s-item:has(> .s-row .s-late, > .s-row .s-dot) > .s-pin[data-on]:not(:focus-visible) {
    opacity: 0;
  }

  .s-item:not(:has(> .s-row .s-late, > .s-row .s-dot)) > .s-pin[data-on] {
    opacity: 1;
  }

  .s-item:hover:has(> .s-row .s-late, > .s-row .s-dot) > .s-row .s-late,
  .s-item:hover:has(> .s-row .s-late, > .s-row .s-dot) > .s-row .s-dot {
    visibility: hidden;
  }

  /* THE OPEN PROJECT'S PARTS: under its name, a hairline at their start, the one in view on the soft fill. */
  .s-parts {
    margin-block: 2px var(--sp-1);
    margin-inline-start: 28px;
    padding-inline-start: var(--sp-2);
    border-inline-start: 1px solid var(--rule);
  }

  .s-part {
    min-block-size: 30px;
    padding-inline: var(--sp-2) var(--sp-3);
    font-weight: var(--fw-regular);
  }

  .s-part :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  .s-part[aria-current='location'] {
    background: var(--nav-selected);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .s-part .s-count,
  .s-fold .s-count {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
  }

  /* PARKED AND FINISHED, FOLDED AT THE FOOT, a hairline over them. */
  .s-foot {
    margin-block-start: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .s-fold {
    padding-inline-start: var(--sp-3);
    color: var(--ink-3);
  }

  .s-fold :global(.icon) {
    flex: none;
  }

  .s-fold-caret {
    display: inline-grid;
    color: var(--ink-3);
    transition: rotate var(--d-state) var(--ease-out);
  }

  .s-fold[aria-expanded='false'] .s-fold-caret {
    rotate: -90deg;
  }

  .s-foot .s-list {
    margin-block: var(--sp-1);
  }

  @media (hover: hover) and (pointer: fine) {
    .s-row:hover,
    .s-part:hover:not([aria-current]),
    .s-fold:hover,
    .s-add:hover,
    .s-pin:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* THE GRIP: 6 wide on the end edge, the resize cursor, and the edge darkens while it is held or focused. */
  .s-grip {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    inline-size: 6px;
    cursor: col-resize;
    touch-action: none;
  }

  .s-grip::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    inline-size: 2px;
    background: transparent;
    transition: background var(--d-state) var(--ease-out);
  }

  .s-grip:hover::after,
  .s-grip:focus-visible::after,
  .s-grip:active::after {
    background: var(--rule-strong);
  }

  /* A PART SCROLLED TO STOPS UNDER THE PAGE'S STICKY NAME ROW. */
  :global(#main [data-part]) {
    scroll-margin-block-start: 80px;
  }

  /* LISTS: a heading like the projects', then a row or a folded group each, a glyph where a project has its mark. */
  .s-lists {
    display: block;
    margin: var(--sp-5) 0 var(--sp-2);
    padding-inline: var(--sp-3) 0;
  }

  .s-link {
    padding-inline-start: var(--sp-3);
  }

  .s-link[data-nested] {
    padding-inline-start: calc(var(--sp-3) + 20px + var(--sp-2));
  }

  .s-link :global(.icon),
  .s-group :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  .s-link[aria-current='page'] {
    background: var(--nav-selected);
  }

  .s-link .s-count,
  .s-group .s-count {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
  }

  .s-group {
    color: var(--ink-2);
  }

  /* THE FOOT: suggested changes when any, then Settings, a hairline over them, at the bottom of the column. */
  .s-end {
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  /* AND NEVER RIGHT UNDER WHAT COMES BEFORE IT, however long the column runs. */
  .s-scroll > :has(+ .s-end) {
    margin-block-end: var(--sp-5);
  }

  /* ── The phone's Projects tab ── */
  .s-phone {
    padding: 0 var(--gutter) var(--sp-5);
  }

  .s-phone .s-tile {
    margin-block-start: var(--sp-4);
    padding: var(--sp-2);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .s-phone .s-row {
    min-block-size: 52px;
    gap: var(--sp-3);
    padding-inline: var(--sp-3);
    font-size: var(--fs-body);
  }

  .s-phone .s-pm {
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-ctl);
    font-size: var(--fs-body);
  }

  .s-phone .s-pm :global(.icon[data-size]) {
    inline-size: 18px;
    block-size: 18px;
  }

  .s-fact {
    flex: none;
    max-inline-size: 50%;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .s-fact[data-tone='late'] {
    color: var(--red);
    font-weight: var(--fw-semi);
  }

  .s-fact[data-tone='live'] {
    color: var(--good);
  }

  .s-phone .s-fold {
    min-block-size: 44px;
  }

  .s-phone-lists {
    margin-block-start: var(--sp-4);
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .s-phone-lists .s-lists {
    margin-block-start: var(--sp-2);
  }

  /* A FOLD AND A ROW SHARE ONE LINE OF GLYPHS AND NAMES. */
  .s-phone .s-link,
  .s-phone .s-group {
    gap: var(--sp-3);
    min-block-size: 44px;
    padding-inline-start: var(--sp-3);
    font-size: var(--fs-body);
  }

  .s-none {
    margin: 0;
    color: var(--ink-3);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
