<!--
  The bell, on the desk's bar and the phone's head alike, and what it opens: what happened on the record since the reader
  last looked that wants them. What was asked is Needs you's, not the bell's.

  ONLY WHAT WANTS HIM (9 Nov, his words: "i want really good stuff only"): what somebody else or an agent did that
  concerns him, what went wrong, and a notice something raised on purpose. Rules, scripts and doors at work (a match, a
  balance, a mail looked at, a Read time) and a run keeping its own row are in Activity alone (`bellWorthy` in the
  kernel), and the record sends the bell its own lines (`boot`'s `bell`), so none of them fills it or counts on the
  badge. A line is read once what it is about is opened, with no press (`bell-open.ts`).

  THE NOTIFICATIONS, CALM (29 October, his word: "fix the notification center, it looks shit"). One panel, no boxes in
  it: a head with its name and "Mark all read" as a quiet text button, then the lines by day (Today, Yesterday, Earlier),
  each one plain sentence with a small glyph for what it is about, the whole row a link to that thing, and how long ago
  at its end. An unread line has a small dot at its start and its words in the ink; a read one is a step quieter. Nothing
  new is said as nothing new. "See all activity" is its foot.

  THE BADGE IS A COUNT, AND ONLY OF WHAT IS UNREAD: no badge at zero. In the ink and not the red, cut out of the bar by a
  ring of the nav, because the red count is Needs you's (`Count.svelte`) and the bell is what happened, not what asks.

  TWO FORMS. From 640px a panel hung from the bell, 400 wide, as tall as what it holds up to the window less its bar, its
  list scrolling inside it. Below 640px, or under a coarse pointer, THE SHEET (`Sheet.svelte`), as tall as the screen.

  A DIALOG, NOT A MENU: it holds a heading, a button and links by day, which a menu's role cannot. Esc closes it and puts
  focus back on the bell; the arrows walk its lines (Home and End to the ends); Tab walks out of it and closes it; a press
  outside closes it. It opens from .98 of its size at the corner it hangs from and closes faster than it opens, a fade
  alone where motion is reduced.

  SENT LEADS IT: what was handed to an agent and is still in flight (`send/SentTray.svelte`), fetched the first time the
  bell opens so none of it is on a screen's first load, and read only while the panel is open.
-->
<script lang="ts">
  import { ownMenu } from '../ui/context-menu.ts';
  import Menu from '../ui/Menu.svelte';
  import { VERB_ICONS } from '../things/verbs.ts';
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { apiBase, at } from '../at.ts';
  import { agoOf, bellDays, bellLines, kindOf, unreadIn, type BellLine, type Day } from './alerts.ts';
  import Icon from '../ui/Icon.svelte';
  import { isGlyph, type IconName } from '../ui/icons.ts';
  import { REGISTERS } from '../record/held.ts';
  import Sheet from '../ui/Sheet.svelte';
  import { settled } from '../ui/panel.ts';
  import { frame } from './frame.svelte.ts';
  import type SentTrayView from '../send/SentTray.svelte';
  import { dismiss, lineIn, pop as popIn } from '$lib/motion/index.ts';

  /** A list's own glyph, as its declaration gives it, for a line that opens it (`kindOf`). */
  const glyphOf = (list: string): IconName | undefined => {
    const icon = REGISTERS[list]?.icon;
    return icon && isGlyph(icon) ? icon : undefined;
  };

  let { phone = false }: { phone?: boolean } = $props();
  const uid = $props.id();

  const words = {
    title: 'Notifications',
    forYou: 'For you',
    named: (n: number) => (n === 0 ? 'Notifications' : `Notifications, ${n.toLocaleString('en')} new`),
    none: 'Nothing new',
    noneWhy: 'Comments, finished work, due dates and anything that fails show up here.',
    markAll: 'Mark all read',
    all: 'See all activity',
    days: { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' } satisfies Record<Day, string>,
    times: (n: number) => `${n} times`,
    unread: 'New: ',
    now: 'Now',
    asks: (n: number) => (n === 1 ? '1 thing needs you' : `${n.toLocaleString('en')} things need you`),
    came: (n: number) => (n === 1 ? '1 thing came in today' : `${n.toLocaleString('en')} things came in today`),
  } as const;

  /**
   * WHAT IS TRUE NOW, ABOVE WHAT HAPPENED (Q22 of 29 October): the bell said "Nothing new" while three bank lines were
   * filed that day and four things waited on him. What waits is Needs you's count, which the shell already holds
   * (`frame.asks`), and what came in today is read from the Inbox when the bell opens; a reader the Inbox refuses is told
   * nothing about it. Neither is counted on the badge, which stays what is unread.
   */
  let cameToday = $state<number | null>(null);
  async function readToday(): Promise<void> {
    try {
      const { createClient } = await import('@braindog/client');
      const out = await createClient({ base: apiBase() }).inbox({ state: 'all', limit: 50 });
      if (!out.ok) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      cameToday = out.value.arrivals.filter((a) => Date.parse(a.ts) >= start.getTime()).length;
    } catch {
      /* Not read: the line is not drawn. */
    }
  }
  const nowLines = $derived([
    ...(frame.asks > 0 ? [{ text: words.asks(frame.asks), href: '/decide', icon: 'decide' as const }] : []),
    ...(cameToday !== null && cameToday > 0 ? [{ text: words.came(cameToday), href: '/inbox', icon: 'inbox' as const }] : []),
  ]);

  /**
   * WHAT WAS ALREADY READ STAYS, A STEP QUIETER (recheck of 30 October, N6). The record's `whatsNew` answers what came after
   * the read mark, so once "Mark all read" was pressed the bell held one line, "8 things need you", and nothing of what
   * had happened. When it opens it reads the record's latest history too, and draws what is not already new as read
   * lines under it: the badge and Mark all read still count only what is new.
   */
  let before = $state<BellLine[]>([]);
  async function readBefore(): Promise<void> {
    try {
      const [{ createClient }, { bellOnly, newsOf }] = await Promise.all([import('@braindog/client'), import('../record/boot-live.ts')]);
      /* THE BELL'S OWN HISTORY (9 Nov), what wants him read or not, and never the rules and scripts at work that were most
         of any forty lines of the log; a host older than `bell` answers every line, which `bellOnly` sifts here. */
      const out = await createClient({ base: apiBase() }).recentHistory({ limit: 40, bell: true });
      if (!out.ok) return;
      /* BY NAME, AS WHAT IS NEW IS (collab pass 2, 2 Nov): the names `boot` told this reader. Without them every older line
         by a colleague said "Someone you share with" under the same person's name in the new lines above it. */
      const said = (page.data as { names?: Record<string, string> } | undefined)?.names ?? {};
      before = bellLines(others(newsOf(bellOnly(out.value.events), frame.actor === '' ? null : frame.actor, new Map(Object.entries(said))))).slice(0, BEFORE_SHOWN);
    } catch {
      /* Not read: only what is new is drawn. */
    }
  }
  const BEFORE_SHOWN = 12;

  /* WHAT HE DID HIMSELF IS NOT THE BELL'S (audit 31 Oct o, AO8): a fresh Founder's bell said "4 new", each a thing he had
     done a moment before ("Added Tallow", "You shared Money with a link"). The bell is for what other people and agents
     did that concerns him, what went wrong and what was raised for him; Activity keeps his own, as Arrivals on Today
     leaves them out (AN20). */
  const others = <N extends { by: string }>(items: readonly N[]): N[] => items.filter((n) => n.by !== 'you');
  const news = $derived(bellLines(others(frame.news)));
  /* NEW IS AFTER MARK ALL READ AND NOT YET OPENED (9 Nov): a line whose page he opened is read, here and on every device
     (`bell-open.ts`), and the badge drops with it. */
  const unread = $derived(unreadIn(frame.readTo, frame.opened));
  const fresh = $derived(news.filter(unread).length);
  const seenBefore = $derived(before.filter((b) => !news.some((n) => n.text === b.text && n.at === b.at)).map((b) => ({ ...b, old: true as const })));
  const told = $derived<(BellLine & { old?: true })[]>([...news, ...seenBefore]);
  /* READ ONCE EACH TIME IT OPENS, so "5m" is the time when he looked. */
  let now = $state(Date.now());
  /* WHAT IS YOURS, FIRST AND ONCE: kept out of the days below so it is not said twice. */
  /* ONE LINE A THING: what is new and what was read before can both carry it, said by two names for one person. */
  const forYou = $derived(told.filter((l, i) => l.you !== undefined && told.findIndex((o) => o.you !== undefined && o.href === l.href && o.at === l.at) === i).slice(0, 8));
  const days = $derived(bellDays(told.filter((l) => l.you === undefined), new Date(now)));

  /**
   * EACH LINE KEYED BY WHAT IT SAYS AND WHEN (the record growing, 9 Nov): a line that comes in while the bell is open rises
   * into its day and wears the arrival wash, and one that goes lets go, its room opening and closing so the rest glide
   * (`lineIn`, `dismiss`). No `animate:flip` beside them: the lines never trade places, and a flip measured before the new
   * line's room is shut played the rest from a line too low, so they jumped up over it first. Keyed by place, every line
   * under a new one changed its words instead. Two alike are told apart by count.
   */
  const keyed = <L extends BellLine>(lines: readonly L[]): { l: L; key: string }[] => {
    const seen = new Map<string, number>();
    return lines.map((l) => {
      const k = `${l.at}|${l.href}|${l.text}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { l, key: n === 0 ? k : `${k}#${n}` };
    });
  };

  let open = $state(false);
  /** On the page, which is longer than open: from the opening to the end of its close. */
  let shown = $state(false);
  let leaving = $state(false);
  /** The sheet form, chosen as it opens and kept until it closes. */
  let sheet = $state(false);

  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let pop = $state<HTMLElement>();
  let stay: (() => void) | null = null;

  /** Somebody who may only add is refused `boot`, and with it every line a bell would say. */
  const addOnly = $derived((page.data as { refused?: { at?: string } | null } | undefined)?.refused?.at === 'level.append');

  let SentTray = $state<typeof SentTrayView | null>(null);
  $effect(() => {
    /* WHAT WAS SENT IS AN OWNER'S READ (`sentList`), so a colleague's bell never asks for it (collab pass 3: a 403 on every
       open of the bell at Can edit). */
    const owner = (page.data as { me?: { owner?: unknown } } | undefined)?.me?.owner === true;
    if (open && owner && SentTray === null) void import('../send/SentTray.svelte').then((m) => (SentTray = m.default));
  });

  async function show() {
    now = Date.now();
    void readToday();
    void readBefore();
    stay?.();
    stay = null;
    leaving = false;
    sheet = matchMedia('(width < 640px), (pointer: coarse)').matches;
    open = true;
    if (sheet) return;
    shown = true;
    await tick();
    pop?.focus();
  }

  function close(refocus = true) {
    if (!open) return;
    open = false;
    if (refocus) button?.focus();
    if (sheet || !pop) {
      shown = false;
      return;
    }
    leaving = true;
    stay = settled(pop, () => {
      stay = null;
      shown = false;
      leaving = false;
    });
  }

  /* THE SHEET CLOSES ITSELF (Esc, its Close, a pull down, the scrim); the bell takes the focus back. */
  function sheetClosed() {
    open = false;
    button?.focus();
  }

  const items = (): HTMLElement[] => [...((sheet ? document.querySelector(`[data-bell-sheet="${uid}"]`) : pop)?.querySelectorAll<HTMLElement>('[data-bell-item]:not(:disabled)') ?? [])];

  /** The arrows walk the lines, Home and End go to the ends, and Esc closes and gives the bell its focus back. */
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (sheet) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const all = items();
    if (all.length === 0) return;
    const n = all.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? (n + 1) % all.length : e.key === 'ArrowUp' ? (n <= 0 ? all.length - 1 : n - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    e.stopPropagation();
    all[to]?.focus();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' || open) return;
    e.preventDefault();
    void show().then(() => items()[0]?.focus());
  }

  /** Pointerdown, not click: a press elsewhere closes this and presses that. */
  function onPointerDown(e: PointerEvent) {
    if (!open || sheet) return;
    if (!root?.contains(e.target as Node)) close(false);
  }

  /** Tab walking out of the panel closes it, as a press outside does. */
  function onFocusOut(e: FocusEvent) {
    if (!open || sheet) return;
    const next = e.relatedTarget as Node | null;
    if (next && !root?.contains(next)) close(false);
  }

  /** A line opened is the end of the panel. */
  function onClick(e: MouseEvent) {
    if ((e.target as Element).closest('a[href]')) {
      if (sheet) open = false;
      else close(false);
    }
  }

  /**
   * MARK ALL READ: the lines go quiet at once, and the record is told up to the newest line the shell was handed. Where
   * the record refuses, they come back as they were, so nothing reads as read that the record still holds as new.
   */
  async function markRead() {
    const was = frame.readTo;
    const newest = news.reduce((m, l) => (Date.parse(l.at) > Date.parse(m) || m === '' ? l.at : m), '');
    frame.readTo = newest;
    if (frame.upTo === null) return;
    const { markAll } = await import('../record/mark-read.ts');
    const ok = await markAll(apiBase(), frame.upTo).catch(() => false);
    if (!ok && frame.readTo === newest) frame.readTo = was;
  }
  /* THE BELL AT THE POINTER: open it, or go to what it says and how. */
  let bellMenu = $state.raw<{ x: number; y: number; height: number } | null>(null);
  const bellWords = { open: 'Open notifications', settings: 'Notification settings' } as const;
</script>

<!-- THE SHEET IS A MODAL OF ITS OWN, focused on its Close as it opens, so its arrows are heard from the window. -->
<svelte:window onpointerdown={onPointerDown} onkeydown={(e) => open && sheet && e.key !== 'Escape' && onKey(e)} />

{#snippet body(inSheet: boolean)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bell-body" data-bell-body={uid} onclick={onClick}>
    {#if SentTray}<SentTray />{/if}
    {#if forYou.length > 0}
      <!-- FOR YOU LEADS (collab pass, 2 Nov): a row somebody gave you, a comment that names you. -->
      <section class="bell-day" aria-labelledby="{uid}-you">
        <div class="bell-day-row"><h3 class="bell-day-head" id="{uid}-you">{words.forYou}</h3></div>
        <ul class="bell-lines">
          {#each keyed(forYou) as { l, key } (key)}
            {@const isNew = l.old !== true && unread(l)}
            <li in:lineIn out:dismiss>
              <a class="bell-row" data-bell-item data-unread={isNew ? '' : undefined} data-you="" href={at(l.href)}>
                <span class="bell-new" aria-hidden="true"></span>
                <span class="bell-kind" aria-hidden="true"><Icon name={l.you === 'mentioned' ? 'ask' : 'user-check'} size="m" /></span>
                <span class="bell-said" dir="auto">{#if isNew}<span class="sr-only">{words.unread}</span>{/if}{l.text}</span>
                <time class="bell-ago num" datetime={l.at}>{agoOf(l.at, now)}</time>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if nowLines.length > 0}
      <section class="bell-day" aria-labelledby="{uid}-now">
        <div class="bell-day-row"><h3 class="bell-day-head" id="{uid}-now">{words.now}</h3></div>
        <ul class="bell-lines">
          {#each nowLines as l (l.href)}
            <li>
              <a class="bell-row" data-bell-item href={at(l.href)}>
                <span class="bell-new" aria-hidden="true"></span>
                <span class="bell-kind" aria-hidden="true"><Icon name={l.icon} size="m" /></span>
                <span class="bell-said">{l.text}</span>
                <span></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#each days as d, k (d.day)}
      <section class="bell-day" aria-labelledby="{uid}-{d.day}">
        <div class="bell-day-row">
          <h3 class="bell-day-head" id="{uid}-{d.day}">{words.days[d.day]}</h3>
          <!-- IN THE SHEET, WHOSE HEAD IS ITS OWN, "Mark all read" stands at the end of the first day's row. -->
          {#if inSheet && k === 0 && fresh > 0}<button type="button" class="bell-mark" onclick={() => void markRead()}>{words.markAll}</button>{/if}
        </div>
        <ul class="bell-lines">
          {#each keyed(d.lines) as { l, key } (key)}
            {@const isNew = l.old !== true && unread(l)}
            <li in:lineIn out:dismiss>
              <a class="bell-row" data-bell-item data-unread={isNew ? '' : undefined} href={at(l.href)}>
                <span class="bell-new" aria-hidden="true"></span>
                <span class="bell-kind" aria-hidden="true"><Icon name={kindOf(l.href, l.tone, glyphOf)} size="m" /></span>
                <span class="bell-said" dir="auto">{#if isNew}<span class="sr-only">{words.unread}</span>{/if}{l.text}{#if l.n > 1}<span class="bell-times">{` · ${words.times(l.n)}`}</span>{/if}</span>
                <time class="bell-ago num" datetime={l.at}>{agoOf(l.at, now)}</time>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      {#if nowLines.length === 0 && forYou.length === 0}
      <div class="bell-none">
        <span class="bell-none-mark" aria-hidden="true"><Icon name="bell" size="m" /></span>
        <p class="bell-none-said">{words.none}</p>
        <p class="bell-none-why">{words.noneWhy}</p>
      </div>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet foot()}
  <footer class="bell-foot">
    <a class="bell-all" data-bell-item href={at('/audit')} onclick={() => (sheet ? (open = false) : close(false))}>{words.all}<Icon name="arrow" size="s" /></a>
  </footer>
{/snippet}

<Menu label={words.named(fresh)} open={bellMenu !== null} at={bellMenu} onclose={() => (bellMenu = null)}>
  <button role="menuitem" type="button" onclick={() => void show()}><Icon name="bell" size="s" /><span class="mi-name">{bellWords.open}</span></button>
  <a role="menuitem" href={at('/settings/notifications')}><Icon name={VERB_ICONS.settings} size="s" /><span class="mi-name">{bellWords.settings}</span></a>
</Menu>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- NO BELL FOR SOMEBODY WHO MAY ONLY ADD (collab pass 3): the record refuses her its news, and an open bell asked for it. -->
{#if !addOnly}
<div class="bell" data-phone={phone ? '' : undefined} bind:this={root} onfocusout={onFocusOut} {@attach ownMenu((a) => (bellMenu = a))}>
  <button
    bind:this={button}
    type="button"
    class="bell-trigger tap"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls={shown ? uid : undefined}
    aria-label={words.named(fresh)}
    onclick={() => (open ? close() : void show())}
    onkeydown={onTriggerKey}
  >
    <span class="bell-face">
      <Icon name="bell" size={phone ? 'l' : 'm'} />
      <!-- THE BADGE COMES ON WITH A SWELL (`popIn`), and swells again as the count goes up (`count.ts`). -->
      {#if fresh > 0}<span class="bell-count num" aria-hidden="true" in:popIn>{fresh > 9 ? '9+' : fresh}</span>{/if}
    </span>
  </button>

  {#if shown && !sheet}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={pop}
      id={uid}
      class="bell-pop"
      role="dialog"
      aria-labelledby="{uid}-title"
      tabindex="-1"
      data-leaving={leaving ? '' : undefined}
      inert={leaving}
      onkeydown={onKey}
    >
      <header class="bell-head">
        <h2 class="bell-title" id="{uid}-title">{words.title}</h2>
        {#if fresh > 0}<button type="button" class="bell-mark" onclick={() => void markRead()}>{words.markAll}</button>{/if}
      </header>
      <div class="bell-scroll">{@render body(false)}</div>
      {@render foot()}
    </div>
  {/if}

  {#if sheet}
    <Sheet title={words.title} bind:open onclose={sheetClosed}>
      <div class="bell-in-sheet" data-bell-sheet={uid}>
        {@render body(true)}
        {@render foot()}
      </div>
    </Sheet>
  {/if}
</div>
{/if}

<style>
  .bell {
    position: relative;
    flex: none;
  }

  /* THE BUTTON: the bell in a 32 square on a desk and a 44 one on a phone, nothing drawn round it until it is pointed at. */
  .bell-trigger {
    display: block;
    padding: 0;
    /* A GLASS CIRCLE on a desk (ops 4.1, 3 Nov); bare on a phone's bar. */
    background: var(--g-fill);
    -webkit-backdrop-filter: var(--g-bf);
    backdrop-filter: var(--g-bf);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    border: 0;
    border-radius: var(--r-pill);
    color: inherit;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .bell[data-phone] .bell-trigger {
    background: none;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .bell-trigger:hover {
      background-color: var(--g-fill-hover);
    }
  }

  .bell-trigger[aria-expanded='true'] {
    background-image: linear-gradient(var(--g-on), var(--g-on));
  }

  .bell-face {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-page);
    block-size: var(--ctl-page);
    color: var(--ink);
  }

  .bell[data-phone] .bell-face {
    inline-size: var(--tap);
    block-size: var(--tap);
    color: var(--ink);
  }

  /* THE COUNT OF WHAT IS UNREAD: 16 tall, 11 at 600, in the ink with the board's colour for its figure, cut out of the
     bar by a ring of the nav. Never the red, which is Needs you's. */
  /* THE BADGE KEEPS TO THE BELL'S OWN SQUARE, its end at the square's end and growing back over the bell: grown from the
     middle, "9+" ran onto the face beside it (30 October). */
  /* AND IT STANDS ON THE SQUARE'S CORNER, half out of it (2 Nov): at 2px in, "9+" covered the bell's whole top and only its
     clapper showed. Out by 6 it leaves the bell's shape whole; the bar has the room, as the face is 12 away. */
  .bell-count {
    position: absolute;
    inset-block-start: -3px;
    inset-inline-end: -7px;
    box-sizing: border-box;
    min-inline-size: 16px;
    block-size: 16px;
    padding-inline: var(--sp-1);
    background: var(--ink);
    border-radius: var(--r-round);
    box-shadow: 0 0 0 2px var(--nav);
    color: var(--board);
    font-family: var(--font-ui);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
    line-height: calc(16px * var(--type, 1));
    text-align: center;
  }

  .bell[data-phone] .bell-count {
    inset-block-start: 3px;
    inset-inline-end: -1px;
  }

  /* ── the panel ─────────────────────────────────────────────── */

  /**
   * HUNG FROM THE BELL'S END: 400 wide (never wider than the window less its gutters), as tall as what it holds up to the
   * window less the bar, the tile's surface with one edge, radius 12. Its list scrolls inside it and the page under it
   * does not move.
   */
  .bell-pop {
    position: absolute;
    inset-block-start: calc(100% + var(--sp-2));
    inset-inline-end: 0;
    z-index: var(--z-palette);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    inline-size: min(400px, calc(100dvw - 2 * var(--sp-3)));
    max-block-size: min(560px, calc(100dvh - 72px));
    /* GLASS, READ ON (ops 2.7.5 regular), radius 16, the popover's elevation. */
    background: var(--glass-regular);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow: var(--glass-edge), var(--elev-popover);
    border: 0;
    border-radius: var(--r-tile);
    color: var(--ink);
    transform-origin: 100% 0;
    transition-property: transform, opacity;
    transition-duration: var(--d-swap);
    transition-timing-function: var(--ease-out);
  }

  :global([dir='rtl']) .bell-pop {
    transform-origin: 0 0;
  }

  .bell-pop:focus {
    /* focus-ok: the panel takes focus as it opens so the arrows and Esc reach it; its lines carry the ring. */
    outline: none;
  }

  @starting-style {
    .bell-pop {
      transform: translateY(-4px) scale(0.98);
      opacity: 0;
    }
  }

  .bell-pop[data-leaving] {
    transform: scale(0.985);
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-exit);
    transition-timing-function: var(--ease-in);
  }

  @media (prefers-reduced-motion: reduce) {
    @starting-style {
      .bell-pop {
        transform: none;
      }
    }

    .bell-pop[data-leaving] {
      transform: none;
    }
  }

  /* THE HEAD: its name at 15/600 and the quiet button at its end, on one line, with a hairline under it. */
  .bell-head {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: 48px;
    padding-inline: var(--sp-4) var(--sp-2);
    border-block-end: 1px solid var(--rule);
  }

  /* THE ONE FACE, AS EVERY TILE'S AND SHEET'S HEADING IS. */
  .bell-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
  }

  /* MARK ALL READ: words in the second ink, no fill, the hover under the pointer. */
  .bell-mark {
    min-block-size: 32px;
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .bell-mark:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .bell-mark:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .bell-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .bell-body {
    flex: 1 1 auto;
    padding: var(--sp-1) var(--sp-2) var(--sp-2);
  }

  /* ── the days and their lines ──────────────────────────────── */

  .bell-day + .bell-day {
    margin-block-start: var(--sp-2);
  }

  .bell-day-row {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .bell-day-head {
    margin: 0;
    padding-block: var(--sp-3) var(--sp-1);
    padding-inline: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .bell-lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /**
   * ONE LINE: the dot's slot, the glyph, the sentence (two lines at most) and how long ago at the end, 14 on 20, 8 from
   * each other. The whole row is the link. A line read is a step quieter than one that is new.
   */
  .bell-row {
    display: grid;
    grid-template-columns: 6px 28px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-1);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    line-height: calc(20px * var(--type, 1));
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .bell-row[data-unread] {
    color: var(--ink);
  }

  @media (hover: hover) and (pointer: fine) {
    .bell-row:hover {
      background: var(--hover);
    }
  }

  .bell-row:focus-visible {
    background: var(--hover);
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  /* NEW IS A DOT, 6 round in the ink, level with the first line; read is the same slot empty. Never the red, which is
     for what is late or failing, and the count on the bell is ink too. */
  .bell-new {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
  }

  .bell-row[data-unread] .bell-new {
    background: var(--ink);
  }

  /* THE GLYPH IN ITS WELL, as a row's is everywhere else (1 Nov): bare 16px marks in the quiet ink read as specks,
     and the panel as a list of loose lines. Neutral: what a line means is in its words. */
  .bell-kind {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .bell-said {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow-wrap: anywhere;
  }

  .bell-times {
    color: var(--ink-3);
    white-space: nowrap;
  }

  .bell-ago {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── nothing new ───────────────────────────────────────────── */

  .bell-none {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    padding: var(--sp-6) var(--sp-5);
    text-align: center;
  }

  .bell-none-mark {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    margin-block-end: var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
  }

  .bell-none-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
  }

  .bell-none-why {
    max-inline-size: 30ch;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-wrap: balance;
  }

  /* ── the foot ──────────────────────────────────────────────── */

  .bell-foot {
    flex: none;
    padding: var(--sp-1) var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  .bell-all {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    min-block-size: 36px;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .bell-all :global(.icon) {
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .bell-all:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .bell-all:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  /* ── the phone's sheet ─────────────────────────────────────── */

  /* AS TALL AS THE SCREEN: the bell's sheet is a place to read, not a short choice. */
  @media (width < 900px) {
    :global(dialog.sheet:has(.bell-in-sheet)) {
      block-size: calc(100dvh - env(safe-area-inset-top) - var(--sp-3));
      max-block-size: calc(100dvh - env(safe-area-inset-top) - var(--sp-3));
    }
  }

  .bell-in-sheet {
    display: flex;
    flex-direction: column;
    min-block-size: 100%;
    margin-inline: calc(-1 * var(--sp-2));
  }

  .bell-in-sheet .bell-row {
    padding-block: calc(10px * var(--dense, 1));
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  .bell-in-sheet .bell-new {
    margin-block-start: var(--sp-2);
  }

  .bell-in-sheet .bell-foot {
    margin-block-start: auto;
    border-block-start: 0;
  }

  /* UNDER A THUMB EVERY LINE AND THE FOOT'S LINK ARE 44 TALL, as every target on a phone is. */
  .bell-in-sheet .bell-row {
    min-block-size: var(--tap);
  }

  .bell-in-sheet .bell-all,
  .bell-in-sheet .bell-mark {
    min-block-size: var(--tap);
  }

  @media (forced-colors: active) {
    .bell-pop {
      border-color: CanvasText;
    }

    .bell-row[data-unread] .bell-new,
    .bell-count {
      background: CanvasText;
      color: Canvas;
    }
  }
</style>
