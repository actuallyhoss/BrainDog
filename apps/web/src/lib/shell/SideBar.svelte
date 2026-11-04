<!--
  The sidebar: every place, on the nav's own surface beside the work, the window's full height. One sidebar, on the left.

  A 56px head on the bar's line: BrainDog's mark and name (`Brand.svelte`) and the button that hides it.
  Then the places, Today, Needs you and the record's own (Work, Money, Agents, People), each with its count, the red one
  only for what needs you and a live dot for an agent at work. PROJECTS IS A PLACE LIKE THEM (Sam, 4 Nov: "it's confusing
  in the sidebar without having things pinned, make it look like a page"): its row opens the portfolio page, its count is
  what is in play, "+" comes up on the row under a pointer, and UNDER IT STAND ONLY THE PROJECTS PINNED HERE (`nav.pins`,
  Pin to sidebar on a project's page and on Projects), by name, each with its late count and live dot. The lists that
  belong to the projects (Stages, Numbers, Key numbers) unfold under it while you are there, as Money's do. Every other
  project is on the Projects page. Then whatever has no place, folded under More lists from three. At the foot what the
  record is run with: the inbox, add-ons, usage, suggested changes when any, and Settings.

  EACH LIST LIVES UNDER THE PLACE IT BELONGS TO (`side.ts` `homesOf`) and unfolds when you are in that place, so Money's
  lists show on Money and on each of them. EXACTLY ONE ROW IS LIT ON EVERY PAGE (`litOf`), the one the page is on most
  closely; the open project's parts show under it, the one in view in ink and never lit as well.

  THREE SHAPES. `full`, the column beside the work from 1,280. `rail`, 56 wide, the places as their glyphs, when the
  window is narrower or the sidebar is hidden: never nothing. `phone`, the Menu tab: the same rows as a page, in tiles.

  GENERIC: whatever projects and lists the record holds (`side-read.ts`), found by what each declares; nothing here
  names one. ITS OWN CHUNK, loaded when the shell draws it (`+layout.svelte`), so the shell's entry carries none of it.
-->
<script lang="ts">
  import { litSlide } from '../motion/lit.ts';
  import { tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import { markOf } from 'braindog-render';
  import { at, here as inside } from '../at.ts';
  import { slotStyle } from '../home/project-cards.ts';
  import Count from '../ui/Count.svelte';
  import Icon from '../ui/Icon.svelte';
  import { isGlyph, type IconName } from '../ui/icons.ts';
  import PageHead from '../ui/PageHead.svelte';
  import { titleOf } from '../title.ts';
  import { drew, rested } from '../ui/screen.svelte.ts';
  import { knowProjects } from '../page/known-project.ts';
  import { keepOrder } from './project-order.ts';
  import { navPrefs } from '../nav-prefs.svelte.ts';
  import { isPinnedAt, togglePin } from './pin-project.ts';
  import { frame } from './frame.svelte.ts';
  import Brand from './Brand.svelte';
  import { glide, ms, opens as opening, placeIn } from '$lib/motion/index.ts';
  import {
    COUNTS_KEY,
    SIDE_MAX,
    SIDE_MIN,
    byWeek,
    countsEntry,
    countsKept,
    factOf,
    leadOf,
    shownName,
    splitOf,
    widthOf,
    type SideLink,
    type SideModel,
    type SidePlace,
    type SideProject,
  } from './side.ts';
  import { keepWeek, keptRead, keptWeek, readFolk, readOpenWork, readSide, readWeek, type SideRead, type SideRow, type Week } from './side-read.ts';
  import { keptPerson } from './side-copy.ts';
  import { settle } from '../ui/same.ts';

  let {
    base,
    lists,
    model,
    lit = null,
    working = [],
    version = null,
    width = 248,
    mode = 'full',
    shown = true,
    pen = null,
    placed = true,
    onwidth,
    tabbed = [],
    ontoggle,
    panel = false,
  }: {
    /** Where the record answers. */
    base: string;
    /** The record's lists, as `boot` names them, for finding the projects list by what it declares. */
    lists: readonly { id: string }[];
    /** Every row the sidebar draws (`side.ts` `sideModel`). */
    model: SideModel;
    /** The one row lit, by its address (`litOf`). */
    lit?: string | null;
    /** The projects an agent is at work on now, by name. */
    working?: readonly (string | null)[];
    /** The record's version, so the sidebar reads again when something changed. */
    version?: number | null;
    /** The width it is drawn at on a desk. */
    width?: number;
    mode?: 'full' | 'rail' | 'phone';
    /** Whether the full column is shown (the hide button's state); the rail is the hidden column. */
    shown?: boolean;
    /** Suggested changes waiting, said as one line, and where they are reviewed. */
    pen?: { label: string; href: string } | null;
    /**
     * Whether every list is in its home yet. Until then More lists is not drawn: on a first visit every list stood
     * under it ("More lists 18") and stepped out as the read placed them, and the row's count jumped to "1".
     */
    placed?: boolean;
    /** Told of a width dragged, and whether the drag is over (then it is kept). */
    onwidth?: ((n: number, done: boolean) => void) | undefined;
    /** Hide or show the full column (`[` does the same). */
    ontoggle?: (() => void) | undefined;
    /** Drawn as the "One button" navigation's panel: its head closes it, and it has no edge to drag. */
    panel?: boolean;
    /** On the phone's Menu: the places the tab bar already carries, by address. */
    tabbed?: readonly string[];
  } = $props();

  const phone = $derived(mode === 'phone');
  /* THE PHONE'S MENU LISTS WHAT THE TAB BAR DOES NOT (ui-perfect, 3 Nov): Today and Needs you stood in the Menu right above
     their own tabs. A tab's place that has places under it (Money's lists) stays, as the way to them. */
  const menuPlaces = $derived(phone ? model.places.filter((p) => !(tabbed.includes(p.href) && p.kids.length === 0)) : model.places);
  /** What in the rail moves to make room for a place arriving: each row, the head of Projects, and the rule. */
  const ROWS = '.s-list, li, .s-tile';

  const words = {
    title: 'Projects',
    nav: 'Places',
    side: 'Sidebar',
    menu: 'Menu',
    close: 'Close',
    add: 'Add a project',
    late: 'late',
    working: 'An agent is at work',
    pin: (name: string) => `Pin ${name} to the sidebar`,
    unpin: (name: string) => `Take ${name} out of the sidebar`,
    parts: (name: string) => `${name}, its parts`,
    resize: 'Sidebar width',
    none: 'No projects yet.',
    more: 'More lists',
    moreOf: 'More',
    hide: 'Hide the sidebar',
    show: 'Show the sidebar',
    open: (name: string) => `${name}, what is under it`,
    needs: (n: number) => `${n.toLocaleString('en-GB')} need you`,
  } as const;

  /* THE READ: the projects first, then their week. Asked again when the record's version moves, a moment after. DRAWN AT
     ONCE FROM THE LAST LIST THIS DEVICE DREW (`side-copy.ts`), so no screen shows the heading alone while it is read, and
     kept when a read is not answered; until either, a still outline of rows (scope 2026-10-24 E1). */
  let read = $state.raw<SideRead | null>(untrack(() => keptRead(base)));
  /** The record the drawn list is of. */
  let readFor = untrack(() => base);
  /* ON A PHONE THIS IS THE SCREEN, so it says it drew once its first read has answered, as a route does (`data-screen`). */
  let answered = $state(false);
  $effect(() => {
    if (phone && answered) drew('ready');
  });
  /** The outline's rows, by how far each bar reaches. */
  const OUTLINE = ['62%', '48%', '56%'] as const;
  /* THE WEEK THIS DEVICE LAST DREW, at once, as the list is (`keptWeek`), so a project's "late" is on every screen. */
  let week = $state.raw<Week>(untrack(() => keptWeek(base)));

  /* THE COUNTS THE SIDEBAR READS ITSELF (Work's open tasks, the people a list keeps), BY PLACE. While a read is out the
     row says the number this device last drew, never nothing. */
  const counting = $derived(model.places.filter((p) => p.list !== undefined));
  let counts = $state<Record<string, number>>({});
  /* KEPT FOR ONE RECORD AND ONE PERSON, beside the shell this browser keeps for them (`countsKept`, review 3 P1): the
     next person to sign in on a shared device is never drawn the last one's counts, and an entry of the old shape, or
     another person's, is dropped at the first read. */
  const keptCounts = (b: string): Record<string, number> => {
    try {
      const kept = countsKept(localStorage.getItem(COUNTS_KEY), b, keptPerson(b));
      if (kept === null) {
        localStorage.removeItem(COUNTS_KEY);
        return {};
      }
      const places = new Set(untrack(() => counting).map((p) => p.key));
      return Object.fromEntries(Object.entries(kept).filter(([key]) => places.has(key)));
    } catch {
      /* Nothing kept. */
      return {};
    }
  };
  counts = untrack(() => keptCounts(base));
  function keepCounts(b: string, now: Record<string, number>): void {
    try {
      const person = keptPerson(b);
      if (person === null) return;
      localStorage.setItem(COUNTS_KEY, countsEntry(localStorage.getItem(COUNTS_KEY), b, person, now));
    } catch {
      /* A browser that keeps nothing draws the shell's count until the read lands. */
    }
  }
  /* WHICH LIST EACH PLACE COUNTS, and whether it keeps people, said as one word so the counts are asked again only when
     that changes, never each time the model is drawn again. */
  const countedKey = $derived(JSON.stringify(counting.map((p) => [p.key, p.list, frame.facts[p.list!]?.folk === true])));
  let countAsk = 0;
  $effect(() => {
    void version;
    const b = base;
    const counted = JSON.parse(countedKey) as [string, string, boolean][];
    if (counted.length === 0) return;
    const n = ++countAsk;
    /* EACH PLACE'S COUNT, BY WHAT ITS LIST DECLARES: the people for a list that keeps them, else the work taken on. */
    const t = setTimeout(() => {
      void Promise.all(counted.map(async ([key, list, folk]) => [key, folk ? await readFolk(b, list) : await readOpenWork(b, list)] as const)).then((got) => {
        if (n !== countAsk) return;
        const now = Object.fromEntries(got.filter((g): g is readonly [string, number] => g[1] !== null));
        /* THE SAME COUNTS ARE NOT DRAWN AGAIN (`same.ts`): every move of the record asked them, and each answer redrew the rows. */
        counts = settle(counts, { ...counts, ...now });
        keepCounts(b, now);
      });
    }, 0);
    return () => clearTimeout(t);
  });

  let asked = 0;
  $effect(() => {
    void version;
    const b = base;
    const l = lists;
    const n = ++asked;
    /* ANOTHER RECORD DRAWS ITS OWN KEPT LIST, never the last one's. */
    if (b !== readFor) {
      readFor = b;
      read = keptRead(b);
      answered = false;
      counts = keptCounts(b);
      week = keptWeek(b);
    }
    const go = (): void => {
      void readSide(b, l)
        .then(async (got) => {
          if (n !== asked) return;
          /* AN ANSWER THAT SAYS WHAT THE DRAWN ONE SAYS LEAVES IT DRAWN (`same.ts`), so a poll redraws no project row. */
          read = settle(read, got);
          answered = true;
          if (got === null) return;
          /* EACH PROJECT'S PAGE CAN NOW OPEN IN ITS OWN SHAPE (`known-project.ts`), its way back the Projects place. */
          knowProjects(b, got.rows, model.projects?.href ?? null);
          const play = splitOf(got.rows, got.lanes).play;
          /* THE WEEK WAITS FOR THE SCREEN'S OWN READS (`rested`): a money figure a project, asked first, held every one
             of them up behind it in the record's one thread. */
          await rested();
          if (n !== asked) return;
          const w = await readWeek(b, got.list, play, Date.now(), untrack(() => week), untrack(() => lists.some((x) => x.id === 'transactions')));
          if (n !== asked) return;
          week = settle(week, w);
          keepWeek(b, w);
        })
        /* NOT ANSWERED AFTER ITS TRIES (`readSide`): what is drawn stays, and the next move of the record asks again. */
        .catch(() => {
          if (n === asked) answered = true;
        });
    };
    /* THE FIRST READ AT ONCE, over the kept list too; a re-read waits for the page that moved the version to have its own
       reads out first. */
    const t = setTimeout(go, untrack(() => answered) ? 1200 : 0);
    return () => clearTimeout(t);
  });

  /* THE PINS ARE THE PERSON'S (`nav.pins`, kept by the record and on every device), and ONLY A PINNED PROJECT IS LISTED
     HERE (Sam, 3 Nov: "i dont need all of our projects to show in the sidebar, only the starred/pinned ones,
     everything else is under projects page"). The rest are on the Projects page the heading leads to. */
  const pins = $derived(navPrefs.pins);
  /* THE PIN IS OUT OF THE TAB ORDER (audit Q57: a stop beside every project doubled the walk to the page): the arrow
     toward the row's end reaches it from its row, and the arrow back returns. */
  function toPin(e: KeyboardEvent): void {
    const pinButton = (e.currentTarget as HTMLElement).nextElementSibling;
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === 'rtl';
    if (e.key !== (rtl ? 'ArrowLeft' : 'ArrowRight') || !(pinButton instanceof HTMLElement)) return;
    e.preventDefault();
    pinButton.focus();
  }
  function fromPin(e: KeyboardEvent): void {
    const row = (e.currentTarget as HTMLElement).previousElementSibling;
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === 'rtl';
    if (e.key !== (rtl ? 'ArrowRight' : 'ArrowLeft') || !(row instanceof HTMLElement)) return;
    e.preventDefault();
    row.focus();
  }
  function pin(p: SideProject): void {
    void togglePin(p.href, shownName(p.name), p.key);
  }

  const busy = $derived(new Set(working.filter((w): w is string => typeof w === 'string' && w !== '')));
  const full = (r: SideRow): SideProject => {
    const w = week.get(r.key);
    return { ...r, late: w?.late ?? 0, moved: w?.moved ?? false, working: busy.has(r.name), pinned: pins.length > 0 && isPinnedAt(r.href, r.key) };
  };
  const split = $derived(read ? splitOf(read.rows.map(full), read.lanes) : null);
  const play = $derived(split ? byWeek(split.play) : []);
  /* WHAT THE SIDEBAR LISTS: the pinned projects, whatever their lane, by name. */
  const pinned = $derived(split ? byWeek([...split.play, ...split.parked, ...split.finished].filter((p) => p.pinned)) : []);
  /* ONE ORDER EVERYWHERE: the order drawn here is the one Today's projects are drawn in (`project-order.ts`). */
  $effect(() => {
    if (answered) keepOrder(base, play.map((p) => p.key));
  });

  /* THE OPEN PROJECT: the one whose page the address is on. */
  const path = $derived(inside(page.url.pathname));
  const openOf = (p: { href: string }): boolean => path === p.href || path.startsWith(`${p.href}/`);
  const opened = $derived(play.find(openOf) ?? null);
  /* THE LIT ROW: the shell's, else the open project where the shell could not name it. */
  const projectLit = $derived(lit === null || lit === model.projects?.href ? (split ? [...split.play, ...split.parked, ...split.finished].find(openOf)?.href : undefined) : undefined);
  const isLit = (href: string): boolean => (projectLit !== undefined ? href === projectLit : href === lit);

  /* WHICH FOLDS ARE OPEN. Parked and Finished are shut on every load, and open by themselves on a project of theirs. */
  /** Each place's own More, opened or shut by a press; `null` follows the row in view. */
  let placeMore = $state<Record<string, boolean | null>>({});
  let folds = $state<{ more: boolean | null }>({ more: null });
  /* OPEN ON THE PHONE'S MENU (audit 31 Oct m, AM13): the Menu is a page with room, and an add-on just installed (Pad,
     Reading) sat shut inside More lists, so Menu read as though it had no way in. A press still shuts it. */
  const moreOpen = $derived(folds.more ?? (phone || model.more.some((l) => isLit(l.href))));
  /* A PLACE'S OWN ROWS SHOW WHILE YOU ARE THERE; on a phone each opens by its own button. */
  let opens = $state<Record<string, boolean>>({});
  const placeOpen = (p: SidePlace): boolean => (phone ? (opens[p.key] ?? false) : isLit(p.href) || p.kids.some((k) => isLit(k.href)));

  /* THE COUNT A PLACE SAYS: what the sidebar read for it, else the shell's. */
  const countOf = (p: SidePlace): number | null => {
    const n = counts[p.key] ?? p.count ?? null;
    return n !== null && n > 0 ? n : null;
  };

  /**
   * THE OPEN PROJECT'S PARTS, as its page draws them: every tile that says it is a part (`data-part`), with its count or
   * its live dot, read once the page has drawn and again as it fills. Nothing for a page that is not a project's.
   */
  type Part = { id: string; label: string; icon: IconName; count: string | null; live: boolean };
  let parts = $state.raw<Part[]>([]);
  let inView = $state<string | null>(null);
  /** The part last pressed in the rail, which wins over a part beside it on the same row. */
  let picked: string | null = null;
  $effect(() => {
    if (mode !== 'full' || opened === null) return void (parts = []);
    void path;
    picked = null;
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
    /* WHICH PART IS IN VIEW: the lowest whose top has reached the page's top, else the first. TWO SIDE BY SIDE ARE ONE
       ROW, and the first of them is the one meant: Money beside Overview was lit on a project's first screen (recheck,
       low notes). */
    const spy = (): void => {
      if (!main) return;
      const top = main.getBoundingClientRect().top + 96;
      let at: string | null = null;
      let atTop = -Infinity;
      for (const p of untrack(() => parts)) {
        const el = document.getElementById(p.id);
        const y = el?.getBoundingClientRect().top;
        if (y !== undefined && y <= top && y > atTop + 1) (at = p.id), (atTop = y);
      }
      /* A PART PRESSED IN THE RAIL STAYS LIT while it shares the row that is in view. */
      const was = picked === null ? undefined : document.getElementById(picked)?.getBoundingClientRect().top;
      if (picked !== null && was !== undefined && Math.abs(was - atTop) <= 1) at = picked;
      inView = at ?? untrack(() => parts)[0]?.id ?? null;
    };
    let frameAsk = 0;
    const onscroll = (): void => {
      cancelAnimationFrame(frameAsk);
      frameAsk = requestAnimationFrame(spy);
    };
    const start = setTimeout(take, 0);
    document.addEventListener('scroll', onscroll, { capture: true, passive: true });
    return () => {
      clearTimeout(start);
      clearTimeout(wait);
      cancelAnimationFrame(frameAsk);
      seen.disconnect();
      document.removeEventListener('scroll', onscroll, { capture: true });
    };
  });

  function toPart(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    inView = id;
    picked = id;
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* A MARK: the glyph the row names where it may be one, else the name's first letter (`ProjectWell`'s rule). */
  const markFor = (p: Pick<SideProject, 'mark' | 'name'>): { glyph?: IconName; letter?: string } => {
    const m = markOf(p.mark, shownName(p.name));
    return m !== null && m.length > 1 && isGlyph(m) ? { glyph: m as IconName } : { letter: m ?? shownName(p.name).slice(0, 1) };
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

  /* A PAGE ROW NOW, SO IT IS THERE WITH NO PROJECT YET (4 Nov): it is how the first one gets made, and the rail shows it too. */
  const showProjects = $derived(model.projects !== null);
  /* THE PAGE IDEAS ARE A ROW OF THEIR OWN AFTER THE PLACES (plan F1): in the foot beside Settings, "2 page ideas / Review"
     read like a setting, and as a quiet line under Projects they read as the projects' (4 Nov), which they are not: they
     are about the whole record's pages. They stay in the foot only where no projects are drawn, and wait for the first
     read to say which, so the row never starts in the foot and moves up. */
  const penUnder = $derived(pen !== null && showProjects && read !== null && split !== null);
  /* THE PROJECTS' ROW: lit on the page, and on a project not pinned here, whose way back it is. A pinned project lights its
     own row under it. Its own lists stand open while you are in them, or on the phone once its button was pressed. */
  const projectsLit = $derived.by(() => {
    if (!model.projects?.href) return false;
    if (isLit(model.projects.href)) return true;
    /* THE SHELL LIGHTS A PROJECT'S OWN ADDRESS WHERE ITS PAGE IS AMONG THE PROJECTS' THINGS, AND ELSE LEAVES IT TO `projectLit`. */
    const onProject = projectLit !== undefined || model.projects.things.some((t) => isLit(t.href));
    return onProject && !pinned.some((p) => isLit(p.href));
  });
  const projectsOpen = $derived(
    phone ? (opens['#projects'] ?? false) : model.projects !== null && ((model.projects.href !== null && isLit(model.projects.href)) || model.projects.kids.some((k) => isLit(k.href))),
  );
  /* MORE LISTS FOLDS ONLY WHAT IS WORTH A FOLD (plan F2): one or two lists stand in the rail as rows of their own, and a
     fold that opened on one row is a press for one thing. From three they fold as before. */
  const MORE_FOLDS = 3;

  /* A PLACE ARRIVING MAKES ROOM ON TRANSFORM ALONE (audit 11-01, AP14): the rows are measured before the rail draws what
     changed and the ones that moved glide from where they stood (`glide`), while the new one slides in (`placeIn`). Its
     height opening shifted the whole rail, frame by frame. */
  let rows = $state<HTMLElement | null>(null);
  /* THE RAIL FILLING IN AS IT OPENS IS NO ARRIVAL: its lists and projects land from their own reads, which on a slow
     open come after the screen's first second, and slid in then on a plain open. Its first `SETTLING_MS`, and until its
     first read has answered, draw still. */
  const SETTLING_MS = 2500;
  const born = typeof performance === 'undefined' ? 0 : performance.now();
  const settling = (): boolean => !untrack(() => answered) || performance.now() - born < SETTLING_MS;
  /* A FOLD PRESSED OPEN OR SHUT (skills pass, 2 Nov): the rows are measured before it changes and glide to their new
     places after, while what opened comes in on `opens`; the rail is never laid out frame by frame. */
  function turn(change: () => void): void {
    const go = glide(rows, ROWS, { step: ms('--d-rows', 180) });
    change();
    void tick().then(go);
  }
  $effect.pre(() => {
    void model;
    void play;
    void showProjects;
    if (settling()) return;
    const go = glide(untrack(() => rows), ROWS);
    void tick().then(go);
  });
</script>

{#snippet mark(p: SideProject)}
  {@const m = markFor(p)}
  <span class="s-pm" style={slotStyle(p.hue)} aria-hidden="true">{#if m.glyph}<Icon name={m.glyph} size="s" />{:else}{m.letter}{/if}</span>
{/snippet}

{#snippet project(p: SideProject)}
  {@const here = isLit(p.href)}
  {@const name = shownName(p.name)}
  <li class="s-item" in:placeIn={{ hold: settling() }}>
    <a class="s-row s-proj tap" href={at(p.href)} aria-current={here ? 'page' : undefined} aria-keyshortcuts={phone ? undefined : 'ArrowRight'} onkeydown={phone ? undefined : toPin}>
      {@render mark(p)}
      {#if phone}
        <!-- ITS STATE ONLY ON THE PHONE (plan F8): "1 late", "Paid this month". The next step, cut to "Settle how Kiln
             is licensed, …" under the name, lives on the project's own page. -->
        {@const f = factOf(p)}
        <span class="s-name">{name}</span>
        {#if f}<span class="s-fact" data-tone={f.tone}>{f.text}</span>{/if}
        {#if p.working && f?.tone !== 'live'}<span class="s-dot" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
      {:else}
        <span class="s-name">{name}</span>
        <!-- HOW MANY ARE LATE, "1 late" (AG19): a bare "late" beside the name read as the project being late. -->
        {#if p.late > 0}<span class="s-late">{p.late.toLocaleString('en-GB')} {words.late}</span>{/if}
        {#if p.working}<span class="s-dot" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
      {/if}
    </a>
    {#if !phone}
      <button type="button" class="s-pin tap" tabindex="-1" onkeydown={fromPin} data-on={p.pinned ? '' : undefined} aria-pressed={p.pinned} aria-label={p.pinned ? words.unpin(name) : words.pin(name)} title={p.pinned ? words.unpin(name) : words.pin(name)} onclick={() => pin(p)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.75h6l-1 5.5 3.25 3.5H6.75L10 10.25zM12 13.75v5.5" /></svg>
      </button>
    {/if}
    {#if openOf(p) && mode === 'full' && parts.length > 0}
      <ul class="s-parts" aria-label={words.parts(name)}>
        {#each parts as part (part.id)}
          <li>
            <button type="button" class="s-part tap" aria-current={inView === part.id ? 'location' : undefined} onclick={() => toPart(part.id)}>
              <span class="s-name">{part.label}</span>
              {#if part.live}<span class="s-dot" aria-hidden="true"></span>{:else if part.count}<span class="s-count num">{part.count}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet link(l: SideLink, nested: boolean)}
  <li in:placeIn={{ hold: settling() }}>
    <a class="s-row s-link tap" data-nested={nested ? '' : undefined} href={at(l.href)} aria-current={isLit(l.href) ? 'page' : undefined}>
      {#if !nested}<Icon name={l.icon as IconName} size="m" />{/if}<span class="s-name">{l.label}</span>
      {#if l.count}<span class="s-count num">{l.count.toLocaleString('en-GB')}</span>{/if}
    </a>
  </li>
{/snippet}

{#snippet place(p: SidePlace)}
  {@const n = countOf(p)}
  {@const open = placeOpen(p)}
  <!-- A PLACE THAT COMES INTO THE RAIL (an add-on turned on, a list with its first row) slides in and opens its row,
       and the places under it move down to make room (`placeIn`, the record forming). Never on the rail's first draw. -->
  <li class="s-item" in:placeIn={{ hold: settling() }}>
    <a class="s-row s-place tap" href={at(p.href)} aria-current={isLit(p.href) ? 'page' : undefined}>
      <Icon name={p.icon as IconName} size="m" /><span class="s-name">{p.label}</span>
      {#if p.key === 'decide'}
        {#if n}<Count n={n} label={words.needs(n)} />{/if}
      {:else}
        {#if p.live}<span class="s-dot" title={words.working}><span class="sr-only">{words.working}</span></span>{/if}
        {#if n}<span class="s-count num">{n.toLocaleString('en-GB')}</span>{/if}
      {/if}
    </a>
    {#if phone && p.kids.length > 0}
      <button type="button" class="s-open tap" aria-expanded={open} aria-label={words.open(p.label)} onclick={() => turn(() => (opens[p.key] = !open))}>
        <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
      </button>
    {/if}
    {#if open && p.kids.length > 0}
      {@const lead = leadOf(p)}
      {@const rest = p.kids.slice(lead)}
      {@const restOpen = placeMore[p.key] ?? rest.some((k) => isLit(k.href))}
      <!-- OPENS BY ITS HEIGHT ONLY WHEN ITS OWN BUTTON WAS PRESSED (the phone's Menu): a place opening on the desk because
           you went there is core navigation, and the rail does not make you watch it. -->
      <ul class="s-list s-nested" in:opening={{ when: phone }}>
        {#each p.kids.slice(0, lead) as k (k.href)}{@render link(k, true)}{/each}
        {#if rest.length > 0}
          <!-- ITS OTHER LISTS UNDER ONE MORE (Money's Snapshots, Books, rates, Categories), open while one of them is. -->
          <li>
            <button type="button" class="s-row s-link s-more-kids tap" data-nested="" aria-expanded={restOpen} onclick={() => turn(() => (placeMore[p.key] = !restOpen))}>
              <span class="s-name">{words.moreOf}</span>
              <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
            </button>
            {#if restOpen}
              <ul class="s-list s-nested s-nested-more" in:opening>
                {#each rest as k (k.href)}{@render link(k, true)}{/each}
              </ul>
            {/if}
          </li>
        {/if}
      </ul>
    {/if}
  </li>
{/snippet}

<!-- A STILL OUTLINE OF ROWS while the first read is out and this device has no list kept: no motion, nothing to read, and
     not a wait the screen is held for (no `aria-busy`), so a screen is never drawn with the heading alone. -->
{#snippet outline()}
  <ul class="s-list s-still" aria-hidden="true">
    {#each OUTLINE as w (w)}
      <li class="s-row"><span class="s-pm"></span><span class="s-still-bar" style:inline-size={w}></span></li>
    {/each}
  </ul>
{/snippet}

{#snippet projectsPart()}
  {#if showProjects && model.projects}
    {@const kids = projectsOpen ? model.projects.kids : []}
    <li class="s-item s-projects" in:placeIn={{ hold: settling() }}>
      <a class="s-row s-place tap" href={at(model.projects.href ?? '/')} aria-current={projectsLit ? 'page' : undefined}>
        <Icon name="projects" size="m" /><span class="s-name">{model.projects.label}</span>
        {#if split && split.play.length > 0}<span class="s-count num">{split.play.length.toLocaleString('en-GB')}</span>{/if}
      </a>
      {#if read && !phone}
        <a class="s-add tap" href={at(`/r/${read.list}?new=1`)} aria-label={words.add} title={words.add}><Icon name="plus" size="s" /></a>
      {/if}
      {#if phone && model.projects.kids.length > 0}
        <button type="button" class="s-open tap" aria-expanded={projectsOpen} aria-label={words.open(model.projects.label)} onclick={() => turn(() => (opens['#projects'] = !projectsOpen))}>
          <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
        </button>
      {/if}
      {#if read && split}
        {#if pinned.length > 0 || kids.length > 0}
          <ul class="s-list s-nested">
            {#each pinned as p (p.key)}{@render project(p)}{/each}
            {#each kids as k (k.href)}{@render link(k, true)}{/each}
          </ul>
        {/if}
      {:else if !answered && pins.length > 0}
        <div class="s-nested">{@render outline()}</div>
      {/if}
    </li>
  {/if}
{/snippet}

{#snippet penPart()}
  {#if penUnder && pen}
    <ul class="s-list">
      <li in:placeIn={{ hold: settling() }}>
        <a class="s-row s-link tap" href={at(pen.href)} aria-current={isLit(pen.href) ? 'page' : undefined}><Icon name="alert" size="m" /><span class="s-name">{pen.label}</span></a>
      </li>
    </ul>
  {/if}
{/snippet}

{#snippet morePart()}
  {#if !placed}
    <!-- HELD UNTIL THE LISTS ARE PLACED, so the row is drawn once with its true count. -->
  {:else if model.more.length > 0 && model.more.length < MORE_FOLDS}
    <ul class="s-list">
      {#each model.more as l (l.href)}{@render link(l, false)}{/each}
    </ul>
  {:else if model.more.length > 0}
    <ul class="s-list">
      <li>
        <button type="button" class="s-row s-fold tap" aria-expanded={moreOpen} onclick={() => turn(() => (folds.more = !moreOpen))}>
          <Icon name="rows" size="m" /><span class="s-name">{words.more}</span><span class="s-count num">{model.more.length}</span>
          <span class="s-fold-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
        </button>
        {#if moreOpen}
          <ul class="s-list s-nested" in:opening>
            {#each model.more as l (l.href)}{@render link(l, true)}{/each}
          </ul>
        {/if}
      </li>
    </ul>
  {/if}
{/snippet}

{#snippet footPart()}
  <ul class="s-list s-end">
    {#each model.foot as l (l.href)}
      {#if l.href === '/settings' && pen && answered && !penUnder}
        <li>
          <a class="s-row s-link tap" href={at(pen.href)} aria-current={isLit(pen.href) ? 'page' : undefined}><Icon name="alert" size="m" /><span class="s-name">{pen.label}</span></a>
        </li>
      {/if}
      {@render link(l, false)}
    {/each}
  </ul>
{/snippet}

<!-- THE MENU IS A SCREEN ON A PHONE, so it names the tab as every screen does. -->
<svelte:head>{#if phone}<title>{titleOf(words.menu)}</title>{/if}</svelte:head>

{#if mode === 'phone'}
  <PageHead title={words.menu} headless />
  <!-- THE PAGE'S NAME FOR A SCREEN READER: the bar says it for the eye. -->
  <h1 class="sr-only" tabindex="-1">{words.menu}</h1>
  <div class="s-phone" bind:this={rows}>
    {#if menuPlaces.length > 0 || showProjects}
      <nav class="s-tile" aria-label={words.nav}>
        <ul class="s-list">
          {#each menuPlaces as p (p.key)}{@render place(p)}{/each}
          {@render projectsPart()}
        </ul>
      </nav>
    {/if}
    {#if (placed && model.more.length > 0) || penUnder}
      <div class="s-tile">
        {@render morePart()}
        {@render penPart()}
      </div>
    {/if}
    <!-- THE RECORD'S TOOLS AND SETTINGS IN A SHORT TILE OF THEIR OWN AT THE FOOT (plan F9), not run on after More lists. -->
    <div class="s-tile s-tile-foot">
      {@render footPart()}
    </div>
  </div>
{:else if mode === 'rail'}
  <!-- THE NARROW RAIL: the places as their glyphs, each named on hover and to a screen reader, never nothing. -->
  <nav class="s-rail" aria-label={words.nav} {@attach litSlide('.s-ricon[aria-current="page"]')}>
    <div class="s-rhead">
      <Brand bare />
    </div>
    <ul class="s-list s-rlist">
      {#each model.places as p (p.key)}
        {@const n = countOf(p)}
        <li>
          <a class="s-ricon tap" href={at(p.href)} aria-current={isLit(p.href) || p.kids.some((k) => isLit(k.href)) ? 'page' : undefined} aria-label={p.label} title={p.label}>
            <Icon name={p.icon as IconName} size="m" />
            {#if p.key === 'decide' && n}<span class="s-rbadge"><Count n={n} size="s" label={words.needs(n)} /></span>{:else if p.live}<span class="s-rdot" aria-hidden="true"></span>{/if}
          </a>
        </li>
      {/each}
      {#if model.projects?.href}
        <li>
          <a class="s-ricon tap" href={at(model.projects.href)} aria-current={isLit(model.projects.href) || projectLit !== undefined || model.projects.things.some((t) => isLit(t.href)) || model.projects.kids.some((k) => isLit(k.href)) ? 'page' : undefined} aria-label={model.projects.label} title={model.projects.label}>
            <Icon name="projects" size="m" />
          </a>
        </li>
      {/if}
    </ul>
    <ul class="s-list s-rlist s-rfoot">
      <li>
        <button type="button" class="s-ricon tap" aria-pressed={shown} aria-keyshortcuts="[" aria-label={words.show} title={`${words.show} ([)`} onclick={() => ontoggle?.()}>
          <svg class="s-side-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" /><path d="M9.25 4.75v14.5" /></svg>
        </button>
      </li>
      {#each model.foot.filter((l) => l.href === '/settings') as l (l.href)}
        <li>
          <a class="s-ricon tap" href={at(l.href)} aria-current={isLit(l.href) ? 'page' : undefined} aria-label={l.label} title={l.label}><Icon name={l.icon as IconName} size="m" /></a>
        </li>
      {/each}
    </ul>
  </nav>
{:else}
  <aside class="s-side" data-panel={panel ? '' : undefined} aria-label={panel ? words.menu : words.side}>
    <!-- THE HEAD, ON THE BAR'S LINE: the product's mark and name, and the button that hides the column. -->
    <div class="s-shead">
      <Brand />
      {#if panel}
        <button type="button" class="s-hide tap" aria-keyshortcuts="[ Escape" aria-label={words.close} title={words.close} onclick={() => ontoggle?.()}><Icon name="close" size="m" /></button>
      {:else}
        <button type="button" class="s-hide tap" aria-pressed={shown} aria-keyshortcuts="[" aria-label={shown ? words.hide : words.show} title={`${shown ? words.hide : words.show} ([)`} onclick={() => ontoggle?.()}>
          <svg class="s-side-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" /><path d="M9.25 4.75v14.5" /></svg>
        </button>
      {/if}
    </div>
    <nav class="s-scroll" aria-label={words.nav} bind:this={rows} {@attach litSlide('.s-row[aria-current="page"]', { fill: 'var(--chosen)' })}>
      <ul class="s-list">
        {#each model.places as p (p.key)}{@render place(p)}{/each}
        {@render projectsPart()}
      </ul>
      {@render morePart()}
      {@render penPart()}
      {@render footPart()}
    </nav>
    {#if !panel}
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
    {/if}
  </aside>
{/if}

<style>
  /* ON THE NAV'S SURFACE, the bar's, the window's full height, a hairline at its end edge, scrolling by itself. */
  .s-side {
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    /* A FLOATING GLASS CARD (ops 4.31, 3 Nov): the chrome film over the ambient ground, radius 20, 8px inside. */
    padding: 4px var(--sp-2) var(--sp-2);
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow: var(--glass-edge), var(--elev-chrome);
    border-radius: var(--r-chrome);
    border-inline-end: 0;
  }

  /* AS THE ONE BUTTON'S PANEL IT FLOATS OVER THE WORK, so it is solid, with a sheet's shadow: nothing behind it reads
     through its rows, not even as a blur. */
  .s-side[data-panel] {
    background: var(--tile);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: var(--glass-edge), var(--elev-modal);
  }

  /* THE HEAD: 56 tall, its hairline on the bar's, the switcher at the start and the hide button at the end. */
  .s-shead {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    flex: none;
    block-size: 48px;
    padding: 0 var(--sp-1) 0 max(var(--sp-2), calc(var(--shell-lead, 0px) - var(--window-inset)));
    border-block-end: 0;
  }

  .s-hide {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--ctl-panel);
    block-size: var(--ctl-panel);
    margin-inline-start: auto;
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-pill);
    color: var(--ink-3);
    cursor: pointer;
  }

  .s-side-glyph {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* A COLUMN, so the foot (the inbox, add-ons, usage, Settings) sits at the bottom when the rest is short. */
  .s-scroll {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-block-size: 0;
    min-inline-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--sp-2) var(--sp-2) var(--sp-3);
    /* A THIN, QUIET SCROLLBAR (2 Nov, his word: "just make the scrollbar thinner"). With a mouse plugged in a Mac draws
       a classic 15px bar, always on, that crowded the counts. Now it is the thin one, its gutter kept so a count never
       sits under it, its track clear, and its thumb shows only while the pointer or the keyboard is in the rail. */
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: transparent transparent;
  }

  .s-scroll:hover,
  .s-scroll:focus-within {
    scrollbar-color: color-mix(in oklab, var(--ink) 22%, transparent) transparent;
  }

  /* Safari before scrollbar-width: the same bar drawn the old way. */
  .s-scroll::-webkit-scrollbar {
    inline-size: 8px;
  }

  .s-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .s-scroll::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: var(--r-round);
    background-clip: padding-box;
    background-color: transparent;
  }

  .s-scroll:hover::-webkit-scrollbar-thumb,
  .s-scroll:focus-within::-webkit-scrollbar-thumb {
    background-color: color-mix(in oklab, var(--ink) 22%, transparent);
  }

  /* "+" ON THE PROJECTS' ROW, AT ITS END: comes up under a pointer or on focus, and the count gives it the room. Never
     under a thumb, where the Projects page's own Add is the way. */
  .s-add {
    position: absolute;
    inset-block-start: 5px;
    inset-inline-end: 5px;
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--r-xs);
    color: var(--ink-3);
    opacity: 0;
  }

  .s-add:focus-visible,
  .s-projects:has(> .s-add:focus-visible) > .s-add {
    opacity: 1;
  }

  .s-projects:has(> .s-add:focus-visible) > .s-row .s-count {
    visibility: hidden;
  }

  @media (hover: hover) and (pointer: fine) {
    .s-projects:has(> .s-row:hover, > .s-add:hover) > .s-add {
      opacity: 1;
    }

    .s-projects:has(> .s-row:hover, > .s-add:hover) > .s-row .s-count {
      visibility: hidden;
    }
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

  /* THE STILL OUTLINE: a row's mark and a bar, in the faint ink a wait draws in (`Waiting.svelte`), and no pointer. */
  .s-still .s-row {
    cursor: default;
  }

  .s-still .s-pm {
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .s-still-bar {
    block-size: 10px;
    border-radius: var(--r-xs);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  /* A ROW: 30 tall, a 16px glyph or the project's 20px mark, the name at 14/500, then its count, "late" or the dot at its end. */
  .s-row,
  .s-part {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    /* THE OPS SIDEBAR ROW: 36 tall (34 here, BrainDog's rail is longer), radius 10, 14/400, 2px apart. */
    min-block-size: var(--side-row, 34px);
    /* 2 apart, so a row's pitch is 36 (rhythm, 3 Nov: it was 35, the margins collapsing to 1). */
    margin-block: var(--sp-0);
    padding-inline: calc(10px * var(--dense, 1));
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: calc(14px * var(--type, 1));
    font-weight: var(--fw-regular);
    line-height: var(--lead-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .s-row :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  /* A PLACE'S GLYPH AT 16, AS A ROW'S IS EVERYWHERE (Look B), centred in the 20 a project's mark takes, so every name in
     the rail starts on one edge. At 12 in the quiet ink they read as specks. */
  .s-row > :global(.icon:first-child) {
    margin-inline: 2px;
  }

  /* ROOM FOR THE PIN, which shows at the row's end under a pointer or on focus. */
  .s-proj {
    padding-inline-end: calc(var(--sp-2) + 20px);
  }

  /* THE ONE LIT ROW: the nav's chosen fill, the words in ink at 600. */
  .s-row[aria-current='page'] {
    background: var(--chosen);
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  .s-row[aria-current='page'] :global(.icon) {
    color: var(--ink);
  }

  /* A NAME SOMEBODY TYPED takes its direction from its own first letter, as `dir="auto"` did, but from the sheet: the
     attribute made Svelte write `dir` again on every redraw of the row (ui-perfect, 3 Nov: a write per row per poll). */
  .s-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    unicode-bidi: plaintext;
  }

  /* A ROW UNDER ITS PLACE: in under the place's name, a step smaller, no glyph. */
  .s-nested .s-row {
    min-block-size: var(--side-sub, 28px);
    padding-inline-start: calc(var(--sp-2) + var(--icon-s, 16px) + var(--sp-2));
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
  }

  /* A PROJECT PINNED UNDER PROJECTS: its mark on the edge the lists under a place start on, its name a step down from the
     place's, as tall as its mark needs. */
  .s-nested .s-proj {
    min-block-size: calc(var(--side-sub, 28px) + 2px);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-regular);
  }

  .s-nested .s-row[aria-current='page'] {
    font-weight: var(--fw-semi);
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
    color: inherit;
  }

  /* IN THE DARK THE MARKS GO ONE STEP QUIETER (plan F4): the slot's tint and colour read louder than the place glyphs
     beside them, so each leans toward the quiet ink, and the well toward the board's neutral black. Leaned toward the
     crimson nav, a yellow or a lime well took its red and read brown (colour lane, 2 Nov). ON THE SCHEME THE PERSON
     CHOSE (dark grey lane, 2 Nov): this read `data-theme`, which only ever says high contrast, so a dark pick on a light
     device kept the loud wells and a light pick on a dark device took the dark ones. */
  :global(html[data-scheme='dark']) .s-pm:not(:empty) {
    background: color-mix(in oklab, var(--ph-tint) 80%, var(--board));
    color: color-mix(in oklab, var(--ph) 70%, var(--ink-3));
  }

  @media (prefers-color-scheme: dark) {
    :global(html:not([data-scheme])) .s-pm:not(:empty) {
      background: color-mix(in oklab, var(--ph-tint) 80%, var(--board));
      color: color-mix(in oklab, var(--ph) 70%, var(--ink-3));
    }
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

  .s-count {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
  }

  /* THE PIN: a 24 square at the row's end, quiet; a pinned row shows it at rest. */
  .s-pin {
    position: absolute;
    inset-block-start: 3px;
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

  .s-item:has(> .s-row:focus-visible) > .s-pin,
  .s-pin:focus-visible {
    opacity: 1;
  }

  /* HOVER ONLY UNDER A POINTER THAT HOVERS (skills pass follow-up, 2 Nov): a tap on a row in the phone's drawer latched
     the hover, showed the pin and hid the row's late count. */
  @media (hover: hover) and (pointer: fine) {
    .s-item:hover > .s-pin {
      opacity: 1;
    }

    .s-item:hover:has(> .s-row .s-late, > .s-row .s-dot) > .s-row .s-late,
    .s-item:hover:has(> .s-row .s-late, > .s-row .s-dot) > .s-row .s-dot {
      visibility: hidden;
    }
  }

  /* EVERY PROJECT HERE IS PINNED NOW (3 Nov), so a pin drawn on each row said nothing: it shows under the pointer only,
     as the way to take the project out of the sidebar. */

  /* THE OPEN PROJECT'S PARTS: under its name, a hairline at their start, the one in view in ink. Never lit: the
     project is the page's one lit row. */
  .s-parts {
    margin-block: 2px var(--sp-1);
    margin-inline-start: calc(18px * var(--dense, 1));
    padding-inline-start: var(--sp-2);
    border-inline-start: 1px solid var(--rule);
  }

  .s-part {
    min-block-size: var(--side-sub, 28px);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
  }

  .s-part[aria-current='location'] {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .s-fold-caret {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
    transition: rotate var(--d-state) var(--ease-out);
  }

  .s-fold[aria-expanded='false'] .s-fold-caret,
  .s-open[aria-expanded='false'] .s-fold-caret,
  .s-more-kids[aria-expanded='false'] .s-fold-caret {
    rotate: -90deg;
  }

  .s-fold[aria-expanded='false'] .s-fold-caret:dir(rtl),
  .s-open[aria-expanded='false'] .s-fold-caret:dir(rtl),
  .s-more-kids[aria-expanded='false'] .s-fold-caret:dir(rtl) {
    rotate: 90deg;
  }

  /* A PLACE'S OWN MORE: a row like the ones over it, its name in the third ink, a button across the row. */
  .s-more-kids {
    inline-size: 100%;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .s-nested-more {
    margin: 0;
    padding: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .s-row:not([aria-current='page']):hover,
    .s-part:hover,
    .s-add:hover,
    .s-pin:hover,
    .s-hide:hover,
    .s-ricon:not([aria-current='page']):hover {
      background: var(--row-wash);
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

  .s-grip:focus-visible::after,
  .s-grip:active::after {
    background: var(--rule-strong);
  }

  @media (hover: hover) and (pointer: fine) {
    .s-grip:hover::after {
      background: var(--rule-strong);
    }
  }

  /* A PART SCROLLED TO STOPS UNDER THE PAGE'S STICKY NAME ROW. */
  :global(#main [data-part]) {
    scroll-margin-block-start: 80px;
  }

  /* THE FOOT: the record's tools and Settings, a hairline over them, at the bottom of the column. */
  .s-end {
    margin-block-start: auto;
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  /* AND NEVER RIGHT UNDER WHAT COMES BEFORE IT, however long the column runs. */
  .s-scroll > :has(+ .s-end) {
    margin-block-end: var(--sp-5);
  }

  /* ── The narrow rail ── */
  .s-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    background: var(--glass-chrome);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow: var(--glass-edge), var(--elev-chrome);
    border-radius: var(--r-chrome);
    border-inline-end: 0;
  }

  .s-rhead {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    flex: none;
    inline-size: 100%;
    block-size: 52px;
    border-block-end: 0;
  }

  /* IN THE MAC APP THE RAIL'S HEAD IS WHERE THE TRAFFIC LIGHTS STAND (`--shell-lead`), so the mark gives them its place;
     the bar after it takes the rest of their room (`AppFrame.svelte`). */
  :global(:root[data-shell='mac']) .s-rhead > :global(*) {
    visibility: hidden;
  }

  .s-rlist {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    padding-block: var(--sp-2);
  }

  .s-rfoot {
    margin-block-start: auto;
  }

  .s-ricon {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 36px;
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
  }

  .s-ricon[aria-current='page'] {
    background: var(--chosen);
    color: var(--ink);
  }

  .s-rbadge {
    position: absolute;
    inset-block-start: -2px;
    inset-inline-end: -4px;
    display: flex;
  }

  .s-rdot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 7px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--live);
    outline: 2px solid var(--nav);
  }

  /* ── The phone's Menu ── */
  .s-phone {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
    padding: var(--sp-3) var(--gutter) var(--sp-5);
  }

  .s-phone .s-tile {
    padding: var(--sp-2);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  /* THE FOOT TILE carries no hairline of its own: the tile is the separation. */
  .s-phone .s-tile-foot .s-end {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .s-phone .s-row {
    min-block-size: var(--tap);
    gap: var(--sp-3);
    padding-inline: var(--sp-2);
    font-size: var(--fs-body);
  }

  .s-phone .s-place {
    padding-inline-end: calc(var(--tap) + var(--sp-1));
  }

  .s-phone .s-nested .s-row {
    padding-inline-start: calc(var(--sp-2) + var(--icon-s, 16px) + var(--sp-3));
    font-size: var(--fs-ctl);
  }

  .s-phone .s-nested .s-proj {
    padding-inline-start: var(--sp-5);
    font-size: var(--fs-body);
  }

  .s-phone .s-pm {
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    font-size: var(--fs-ctl);
  }

  /* THE BUTTON THAT OPENS A PLACE'S OWN ROWS ON THE PHONE, a 44 square at the row's end. */
  .s-open {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
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

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (forced-colors: active) {
    .s-row[aria-current='page'],
    .s-ricon[aria-current='page'] {
      outline: 1px solid CanvasText;
    }
  }
</style>
