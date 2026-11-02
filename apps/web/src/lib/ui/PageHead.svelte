<!--
  The page header: the page's name with its icon, its count, the actions at the right of the
  name, and under them the one sentence that says what is true today.

  A HEADER, NOT A HERO. The sentence is said once, at 17 in body text, under a 28px name: figures in it a step heavier and
  only the phrase that needs the reader in the red. No card round any of it.

  The title is `page.title` else `register.name`, NEVER an id. NOR DOES AN ID FOLLOW IT: a person reads a name here, and
  an id lives in a row's Details and in "Copy link" (19 §9). The count says `n of N`, and the `+` when it is a floor.

  THE ACTIONS ARE THE PAGE'S OWN: one primary, and the rest behind its "⋯", which the page hands over as `actions`. The
  "⋯" is always drawn and always named ("More"), 32 square from 900px and 44 on a phone, and a phone's primary is its
  glyph alone in a 44px red square. They stay on the name's row and never wrap under it.

  TWO SHAPES, ONE ON EACH SIDE OF 900px.

  FROM 900px UP the name's row sits on the board and stays at the top once the page scrolls, in the board's colour with a
  hairline under it. THE NAME KEEPS ITS SIZE AND NOTHING IS LAID OUT AGAIN: once something has scrolled under the row a
  separate one-line title at 17/600 fades in where the name was, and the name fades out, over `--d-swap`. The name used
  to animate its own font size, which laid the head out on every frame.

  BELOW 900px THE HEAD IS A PHONE'S, THREE ROWS. The bar is always a row of its own, 56 under the notch, and stays, ONE
  SHAPE ON EVERY PAGE: BrainDog's mark (or a back chevron where the page has a parent), where you are in words (the
  shell's lit row, `frame.here`), then Ask, the bell and the face, each 44 square. Under it the kicker when there is one,
  then the name at 22/28, two lines at most, with its count inline and the page's actions at the end; then the
  sentence. The bar says the title on one line once the name has gone under it, fading in over where you are.

  FROM 900px UP THE BAR'S CRUMB IS THE WAY BACK (`frame.crumbed`), so the kicker's link and a headless head's back link
  are not drawn a second time over the name.

  THE SENTENCE HOLDS ITS ROOM WHILE IT IS ON ITS WAY (motion F2.2): until the screen settles a page that has not said one
  yet keeps an empty line (two on a phone), so the tiles under the head never jump down when it lands.

  THE NAME TAKES FOCUS AFTER A MOVE (motion F5.1): the `h1` is focusable by script (`tabindex="-1"`), so the layout puts a
  keyboard there after every link, and a pointer never sees a ring on it.

  A NAME BREAKS BETWEEN ITS WORDS, never inside one: "Invoice 2026-041" broke after the hyphen, as "2026-" and "041".

  `well` DRAWS AN ICON WELL IN PLACE OF THE GLYPH (a project's page), and `headless` DRAWS NO NAME ROW at all, only the
  back link and the actions, for a page whose own hero holds the `h1`. Below 900px a headless head is not drawn: the bar
  holds the way back, and the actions sit in the bar before the search button.

  `tiled` HANDS THE NAME ROW TO THE PAGE'S LEAD TILE (`PageBody`'s `leadHead`): the name, its count and the page's own
  buttons are drawn inside the tile its sentence opens, as on the Bento boards, and the head keeps only the phone's bar.
  What `actions` still holds (the arranging controls, which only show while a page is arranged) stays in the page, in
  no box of its own, so nothing it holds is mounted twice.

  THE BAR SAYS THE NAME, AND THE PAGE DOES NOT SAY IT AGAIN (29 October: "the title showing twice"). Wherever a bar is
  drawn (the desk's top bar, the phone's head) the name is the bar's, with the count as a quiet figure after it, and the
  `h1` stays here unseen for a screen reader and for the focus a move puts on it. The sentence takes the name's row, the
  page's actions at its end. `named` is the exception: a page whose name is its content (a question, a row, a run) keeps
  its name as its heading, and the bar's crumb ends at the place it sits in.

  IN THE IPHONE APP THE PHONE'S BAR IS NATIVE'S (`inIosApp`, `shell.ts`): the page's name goes to the native nav bar
  (`shellTitle`, from the frame), which also holds the way back, the bell and the face, so the bar here is not drawn, a
  headless head keeps its actions in its own row, and the name's row opens 12 under native's bar. The `h1` stays, unseen
  where the bar says the name, for a screen reader and the focus a move lands.

  `below` IS WHAT GOES UNDER THE SENTENCE: the line a task is typed into on a phone, or a page-level switch, full width.
  `led` AND `over` ARE KEPT FOR THE PAGES THAT PASS THEM, and change nothing: the header is the same on every page.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { slotOf } from './face.ts';
  import Define from './Define.svelte';
  import { at, here } from '../at.ts';
  import { copy } from '../copy.ts';
  import { openPalette } from '../palette/open.svelte.ts';
  import { inIosApp } from '../shell.ts';
  import Bell from '../shell/Bell.svelte';
  import HereFaces from '$lib/shell/HereFaces.svelte';
  import { barTitled, frame, narrow } from '../shell/frame.svelte.ts';
  import Brand from '../shell/Brand.svelte';
  import YouMenu from '../shell/YouMenu.svelte';
  import { partsOf, stopped } from '../shell/headline.ts';
  import { settled } from './screen.svelte.ts';
  import { page } from '$app/state';
  import type { Noun } from '$lib/define.svelte.ts';
  import type { IconName } from './icons.ts';
  import { untrack, type Snippet } from 'svelte';

  let {
    title,
    count,
    countOf,
    total,
    atLeast,
    kicker,
    back,
    sentence,
    needs,
    actions,
    below,
    icon,
    hue,
    define,
    well,
    headless = false,
    tiled = false,
    named = false,
    heldLines = 2,
    heldText,
  }: {
    title: string;
    /** The glyph the register or page declares, drawn before the name. */
    icon?: IconName | undefined;
    /** The frozen hue of the row this page is about, when it is about one: the glyph is drawn in it. */
    hue?: number | undefined;
    count?: number | undefined;
    /** What the count counts, said after it ("8 changes"), where a bare number beside the name would say nothing. */
    countOf?: ((n: number) => string) | undefined;
    total?: number | undefined;
    /**
     * Whether `count` is a floor rather than the answer: `Matches n of N` is exact when the grid holds the whole answer,
     * else `200+ of N` (50 §5.2). The `+` is the whole of the difference.
     */
    atLeast?: boolean | undefined;
    /** The parent's name on a detail page, or the section a page sits in. */
    kicker?: string | undefined;
    /** Where the kicker's parent is, as an app path. Given, the kicker is a link there and the phone bar's back link. */
    back?: string | undefined;
    /**
     * The screen's one sentence under the name: words, or a snippet whose urgent phrase is marked `data-needs`. "Four
     * things need you, and the backup vendor is 2 days late."
     */
    sentence?: string | Snippet | undefined;
    /** The phrase inside a `sentence` given as words that needs him, drawn in the red. */
    needs?: string | undefined;
    /**
     * A load-bearing noun this heading is the first sight of, explained once and never again, UNDER the `h1` and never
     * inside it (19 §6).
     */
    define?: Noun | undefined;
    /** The actions at the right of the name: one primary, the rest in the page's overflow. */
    actions?: Snippet | undefined;
    /** What sits under the sentence, the gutter's width: one line a thing, such as the line a task is typed into on a phone. */
    below?: Snippet | undefined;
    /** An icon well drawn before the name in place of the glyph (a project's own page). */
    well?: Snippet | undefined;
    /** No name row: the back link and the actions only, for a page whose own hero holds the `h1`. */
    headless?: boolean | undefined;
    /** The name row is the lead tile's: only the phone's bar is drawn here, and `actions` without a box. */
    tiled?: boolean | undefined;
    /** The name is the page's content (a question, a row, a run): it stays here as the heading, and the bar ends at its place. */
    named?: boolean | undefined;
    /** How many lines a sentence on its way holds on a phone: Today's says three things, so it holds three. */
    heldLines?: number | undefined;
    /**
     * The words the sentence on its way is most like, where a page knows them before its read: set in the held line,
     * unseen, so it holds the room those words take at this width, and never less than `heldLines`.
     */
    heldText?: string | undefined;
    /** Kept for the pages that pass it: the header is drawn the same way with or without it. */
    led?: boolean | undefined;
    /** Kept for the pages that pass it: the header is drawn the same way with or without it. */
    over?: boolean | undefined;
  } = $props();

  /* THE COMPACT TITLE ARRIVES ONCE SOMETHING HAS SCROLLED UNDER THE HEAD. A zero-height mark where the head starts leaves
     the scroller the moment the head sticks, which is the moment the compact title starts meaning something. */
  let mark = $state<HTMLElement>();
  let under = $state(false);

  $effect(() => {
    if (!mark) return;
    const io = new IntersectionObserver((seen) => {
      const last = seen.at(-1);
      if (last) under = !last.isIntersecting;
    });
    io.observe(mark);
    return () => io.disconnect();
  });

  /**
   * WHETHER THE NAME HAS GONE UNDER THE PHONE'S BAR, which is when the bar says the title. The root is the screen less
   * the bar's own height at its top, and only a name that left upwards counts. From 900px up the bar is not drawn, its
   * height is zero and nothing reads `past`.
   */
  let bar = $state<HTMLElement>();
  let heading = $state<HTMLElement>();
  let past = $state(false);

  $effect(() => {
    if (!bar || !heading) return;
    const io = new IntersectionObserver(
      (seen) => {
        const last = seen.at(-1);
        if (last) past = !last.isIntersecting && last.boundingClientRect.top < (last.rootBounds?.top ?? 0);
      },
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` },
    );
    io.observe(heading);
    return () => io.disconnect();
  });

  /* A HEADLESS HEAD'S ACTIONS RIDE IN THE PHONE'S BAR. Below 900px the bar already holds the way back, so the head had
     nothing left but Share and the "⋯", a row of their own over an empty start (Kiln at 390). They go in the bar
     instead, before the search button, the same bare 44 squares, and the head is not drawn. */
  const barred = $derived(headless && narrow.current && !inIosApp);

  /* THE SEARCH BUTTON IS NOT DRAWN ON `/search`, which is the search: two ways to one place side by side read as two. */
  const searching = $derived(here(page.url.pathname) === '/search');

  /* THE KICKER OVER THE TITLE IS DROPPED WHEN IT SAYS THE TITLE AGAIN: "Work" over "Work" names where you already are.
     The phone's back link keeps it, since that is a way out. */
  const crumb = $derived(kicker && kicker.trim().toLowerCase() !== title.trim().toLowerCase() ? kicker : undefined);

  /* THE NAME, A WORD AT A TIME: each is drawn as one piece, so a line never ends inside one (a hyphen is a place a
     browser may break at), and one longer than the row still breaks inside itself rather than running off the screen. */
  const nameWords = $derived(title.split(/\s+/u).filter((w) => w !== ''));

  /* WHETHER THE PHONE'S BAR HAS A WAY BACK IN IT; without one it carries BrainDog's mark. */
  const wayBack = $derived(Boolean(kicker && back));

  const counted = $derived(Boolean(count || total));

  /* THE PAGE'S NAME AND ITS COUNT, FOR THE BAR'S CRUMB: said while this head is drawn, and taken back when it goes. A
     named page says neither, so the crumb ends at the place it sits in. */
  const figure = $derived(
    counted ? `${(count ?? 0).toLocaleString('en')}${atLeast ? '+' : ''}${total !== undefined && (atLeast || total !== count) ? ` of ${total.toLocaleString('en')}` : ''}` : '',
  );
  $effect(() => {
    if (named) return;
    const said = title;
    const fig = figure;
    frame.title = said;
    frame.figure = fig;
    return () => {
      if (frame.title === said) frame.title = '';
      if (frame.figure === fig) frame.figure = '';
    };
  });
  /* A NAMED PAGE'S WAY BACK IS THE CRUMB'S TRAIL where no sidebar row is lit (`crumbOf`'s `up`). */
  $effect(() => {
    if (!named || !kicker || !back) return;
    const up = { label: kicker, href: back };
    frame.up = up;
    return () => {
      if (frame.up === up) frame.up = null;
    };
  });

  /* WHETHER THE BAR SAYS THIS PAGE'S NAME, so the name row here is the sentence and the actions, and the `h1` unseen. */
  const titled = $derived(!named && !headless && !tiled && barTitled());

  /* ON A DESK WITH THE CRUMB IN THE BAR, the head draws no way back of its own. */
  const crumbed = $derived(frame.crumbed && !narrow.current);
  /* A HEAD IS DRAWN, so on a phone the banners are this head's to draw under its bar and not the shell's (collab pass 2). */
  $effect(() => {
    untrack(() => (frame.heads += 1));
    return () => untrack(() => (frame.heads -= 1));
  });
  /* WHERE YOU ARE, IN THE PHONE'S BAR: the shell's lit row, else this page's name. */
  const where = $derived(frame.here || title);

  /* A GREETING THAT DOES NOT FIT THE PHONE'S BAR LOSES ITS "GOOD" (audit 31 Oct o, AO15): "Good morning, Nad…" cut a
     five-letter name at 390, where "Morning, Nadia" says it whole. Only when the whole line overflows, read off the bar
     itself, so a short name keeps "Good morning", and the width it needed is kept so a wider bar takes it back. */
  let whereEl = $state<HTMLElement | null>(null);
  let tight = $state(false);
  const shortGreeting = (s: string): string | null => {
    const m = /^Good (morning|afternoon|evening)(, .+)$/u.exec(s);
    return m ? `${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)}${m[2]!}` : null;
  };
  const whereShown = $derived(tight ? (shortGreeting(where) ?? where) : where);
  $effect(() => {
    const el = whereEl;
    const said = where;
    tight = false;
    if (!el || shortGreeting(said) === null || typeof ResizeObserver === 'undefined') return;
    let needs = 0;
    const fit = () => {
      if (!tight && el.scrollWidth > el.clientWidth) {
        needs = el.scrollWidth;
        tight = true;
      } else if (tight && el.clientWidth >= needs) tight = false;
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  });

  /* THE SENTENCE AS WORDS, cut into its figures and the phrase that needs him (`shell/headline.ts`). */
  const parts = $derived(typeof sentence === 'string' ? partsOf(stopped(sentence), needs) : null);

  /* A SENTENCE ON ITS WAY HOLDS ITS ROOM, and only while the screen is still reading: a page that settles with nothing
     to say gives the line back. */
  const held = $derived(sentence === undefined && settled() === undefined);

</script>

<div bind:this={mark} aria-hidden="true"></div>
<!--
  THE PHONE'S BAR, hidden from 900px up. It is not inside the header because it has to stay when the header scrolls
  away, and a sticky element sticks only inside its parent's box. Its title repeats the `h1` for the eye once the `h1`
  has gone, so it is hidden from a screen reader, which has already met the heading.
-->
{#if !inIosApp}
<div class="head-bar" bind:this={bar} data-under={under ? '' : undefined} data-past={past && !titled ? '' : undefined}>
  {#if wayBack}
    <a class="back tap" href={at(back!)} aria-label={kicker}>
      <span class="back-mark"><Icon name="chevron" size="l" /></span>
    </a>
  {:else}
    <span class="bar-mark"><Brand bare size={22} /></span>
  {/if}
  <div class="bar-lead" data-greets={shortGreeting(where) !== null ? '' : undefined}>
    <!-- WHERE YOU ARE, the same words the desk's crumb ends on, and over it the page's name once it has scrolled away. -->
    <p class="bar-where" dir="auto" bind:this={whereEl}>{whereShown}{#if titled && figure}<span class="bar-figure num">{figure}</span>{/if}</p>
    <p class="bar-title" dir="auto" aria-hidden="true">{title}</p>
  </div>
  <span class="bar-end">
    {#if barred && actions}<span class="head-actions bar-actions">{@render actions()}</span>{/if}
    {#if !searching}
      <button type="button" class="find tap" data-palette-from aria-label={copy.paletteLabel} onclick={openPalette}>
        <Icon name="search" size="l" />
      </button>
    {/if}
    <HereFaces />
    <Bell phone />
    <YouMenu phone />
  </span>
</div>
{/if}
<!-- THE SHELL'S BANNERS, UNDER THE BAR ON A PHONE (collab pass 2, 2 Nov): drawn by the shell over the page, they sat above
     this bar and pushed it half a screen down. On a desk the shell draws them over the work, as before. In the iPhone app
     there is no web bar, and they head the page under native's. -->
{#if narrow.current && frame.banners}<div class="head-banners">{@render frame.banners()}</div>{/if}
{#if crumb && !headless && !tiled && !crumbed && !titled}
  <!-- Over the name and scrolling with the page: the row that stays is the name's. -->
  {#if back}
    <a class="kicker kicker-link tap" href={at(back)}>{crumb}</a>
  {:else}
    <p class="kicker">{crumb}</p>
  {/if}
{/if}
{#if !barred}
<header class="page-head" data-titled={titled ? '' : undefined} data-under={under ? '' : undefined} data-kicked={crumb && !headless && !titled ? '' : undefined} data-headless={headless ? '' : undefined} data-tiled={tiled ? '' : undefined}>
  <div class="head-main">
    {#if tiled}
      <!-- THE NAME IS THE LEAD TILE'S. -->
    {:else if headless}
      {#if back && kicker && !crumbed && !inIosApp}
        <a class="head-back tap" href={at(back)}><span class="back-mark"><Icon name="chevron" size="m" /></span>{kicker}</a>
      {/if}
    {:else if titled}
      <!-- THE NAME IS THE BAR'S: the `h1` is here for a screen reader and the focus a move lands, and the sentence stands
           in the name's row. -->
      <h1 class="name-unseen" tabindex="-1" dir="auto">{title}</h1>
      {#if sentence}
        <p class="page-said head-said">{@render said()}</p>
      {:else if held}
        <p class="page-said head-said" data-held aria-hidden="true" style:--held-lines={heldLines}>{#if heldText}<span class="held-words">{heldText}</span>{/if}</p>
      {/if}
    {:else}
      <!-- The `dir="auto"` is on a SPAN around the title, not on the `h1`: the title came from whoever typed it, the glyph
           beside it is ours, and the attribute on the `h1` would resolve the direction of our own glyph too. -->
      <div class="name-row">
        <h1 class="page-name" tabindex="-1" bind:this={heading}
          >{#if well}<span class="name-well">{@render well()}</span
            >{:else if icon}<span class="name-icon" style={hue === undefined ? undefined : `--slot-ink:var(--cat-${slotOf(hue)})`} data-hue={hue === undefined ? undefined : ''}
              ><Icon name={icon} size="xl" /></span
            >{/if}<span class="name-words" dir="auto">{#each nameWords as word, n}{n > 0 ? ' ' : ''}<span class="word">{word}</span>{/each}</span>
        </h1>
        <!--
          A COUNT OF NOTHING OVER AN EMPTY STATE IS THE SAME FACT TWICE, so a bare zero goes and a zero with a total beside
          it stays: `0 of 38` is a filter that matched nothing over a list that holds thirty-eight rows (19 §6).
        -->
        {#if counted}
          <p class="count num">
            {(count ?? 0).toLocaleString('en')}{#if countOf}{' '}{countOf(count ?? 0)}{/if}{#if atLeast}<span class="more-sign">+</span>{/if}{#if total !== undefined && (atLeast || total !== count)}<span
                class="of">&nbsp;of {total.toLocaleString('en')}</span
              >{/if}
          </p>
        {/if}
        <!-- THE COMPACT TITLE, over the name's place once the page has scrolled under the row: a separate line, so the
             name never changes size. Hidden from a screen reader, which has met the `h1`. -->
        <p class="head-title" dir="auto" aria-hidden="true">{title}{#if counted}<span class="head-title-count num">{(count ?? 0).toLocaleString('en')}</span>{/if}</p>
      </div>
    {/if}
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>
{/if}
{#snippet said()}
  {#if parts}{#each parts as part}{#if part.needs}<span class="needs" data-needs>{part.text}</span>{:else if part.fig}<span class="fig">{part.text}</span>{:else}{part.text}{/if}{/each}{:else if typeof sentence !== 'string' && sentence}{@render sentence()}{/if}
{/snippet}
{#if titled}
  <!-- SAID IN THE NAME'S ROW. -->
{:else if sentence && !tiled}
  <p class="page-said">{@render said()}</p>
{:else if held && !tiled}
  <p class="page-said" data-held aria-hidden="true" style:--held-lines={heldLines}>{#if heldText}<span class="held-words">{heldText}</span>{/if}</p>
{/if}
<!--
  THE DEFINITION IS READ ONCE, SO IT DOES NOT RIDE IN THE STICKY HEAD: read where it is met, it scrolls away with the
  list, and it still shows once and never again.
-->
{#if define}<p class="head-define"><Define noun={define} /></p>{/if}
{#if below}<div class="head-below">{@render below()}</div>{/if}

<style>
  /* Same size as the figure, dimmed: it modifies the number rather than being part of it. */
  .more-sign {
    color: var(--ink-3);
  }

  /* No margin of its own: it is either there or it is not. */
  .head-define {
    margin: 0;
    padding: var(--sp-2) var(--gutter) 0;
    max-inline-size: calc(var(--measure) + var(--gutter) * 2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE PHONE'S BAR IS A PHONE'S. The rule below 900px draws it. */
  .head-bar {
    display: none;
  }

  /* The section or the parent over the name, in meta: 13 in the quiet ink, sentence case. */
  .kicker {
    display: block;
    inline-size: fit-content;
    margin: 0;
    padding: var(--sp-4) var(--gutter) 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    line-height: calc(18 / 13);
    text-decoration: none;
  }

  /* A LINK IN THE KICKER'S OWN VOICE: quiet until it is pointed at, when it says it goes somewhere. */
  @media (hover: hover) and (pointer: fine) {
    .kicker-link:hover {
      color: var(--red);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /**
   * THE NAME'S ROW: 20 from the top of the work, 44 tall, and sticky. Sticky, and `--sticky` is what
   * `scroll-padding-block` is set from, so keyboard focus never lands underneath it (WCAG 2.4.11). The full width of
   * the work, as every tile under it is.
   */
  /**
   * TWO TITLES IN ONE PLACE HAND OVER, THEY NEVER CROSS (audit 31 Oct, B10). The name and the compact title, and on a
   * phone where you are and the page's name, used to cross-fade over the same `--d-swap`, so for most of it both were
   * half there and read as one word drawn over another ("Needs you" through "Wildcard certificate…"), which a picture
   * taken just after a scroll caught every time. Now the one going fades out first, over half the swap, and the one
   * coming starts only once it has gone: at any moment at most one of them is showing. Under reduced motion every fade
   * is forced to the whole `--d-swap` (`skin/a11y.css`), so the wait is the whole of it there.
   */
  .head-bar,
  .page-head {
    --swap-out: calc(var(--d-swap) / 2);
  }

  @media (prefers-reduced-motion: reduce) {
    .head-bar,
    .page-head {
      --swap-out: var(--d-swap);
    }
  }

  .page-head {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sheet);
    box-sizing: border-box;
    /* The Mac app's title bar sits above the head; --shell-inset is 0 in a browser. */
    padding: calc(20px + var(--shell-inset, 0px)) var(--gutter) 0;
    /* And in the Mac app, a head drawn with no frame round it starts after the traffic lights (`--shell-lead`). */
    padding-inline-start: max(var(--gutter), var(--shell-lead, 0px));
  }

  /* THE NAME ROW IS THE LEAD TILE'S: no box here, and what `actions` keeps is drawn in the page's flow, which while it
     is not being arranged is nothing but closed sheets. */
  .page-head[data-tiled],
  .page-head[data-tiled] .head-main,
  .page-head[data-tiled] .head-actions {
    display: contents;
  }

  .page-head[data-tiled]::before {
    display: none;
  }

  /* A kicker already stands between the row and the top of the work. A titled head draws no kicker (the bar holds the
     way), so it keeps the full gap (AH34: Today's first line sat 4 under the bar's rule). */
  .page-head[data-kicked] {
    padding-block-start: calc(var(--sp-1) + var(--shell-inset, 0px));
  }

  /* THE COMPACT ROW: the board's own colour behind the row and a hairline under it, there at rest, invisible, and
     arriving over `--d-swap`. The row itself never changes height. Opaque, so a tile passing under it is not read
     through it. */
  .page-head::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--board);
    border-block-end: 1px solid var(--rule);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--d-swap) var(--ease-out);
  }

  .page-head[data-under]::before {
    opacity: 1;
  }

  .head-main {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: 44px;
  }

  .name-row {
    position: relative;
    display: flex;
    flex: 1;
    align-items: baseline;
    column-gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* 28/34 at 600 in the display face. A BLOCK AND NOT A FLEX ROW, so a name that wraps is text that wraps, with its glyph
     inline before the first word. It never changes size: the compact title is another line. */
  .page-name {
    display: block;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    /* Look B: page names wear Lexend, text stays Geist. */
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: var(--fw-semi);
    line-height: calc(34 / 28);
    letter-spacing: -0.02em;
    text-wrap: balance;
    /* Coming back, it waits for the compact title to go. */
    transition: opacity var(--swap-out) var(--ease-out) var(--swap-out);
  }

  /* FOCUSED BY THE LAYOUT AFTER A MOVE, for a keyboard and a screen reader; a pointer never sees a ring here. */
  .page-name:focus:not(:focus-visible) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  /* ONE WORD, ONE PIECE (`nameWords`): a box of its own breaks only when it is wider than the row, and then inside itself. */
  .word {
    display: inline-block;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
  }

  /* THE PAGE'S GLYPH, 24 before the name and 12 from it, in the second ink; a page about one thing wears its colour. */
  .name-icon,
  .name-well {
    display: inline-grid;
    place-items: center;
    margin-inline-end: var(--sp-3);
    vertical-align: -0.12em;
    color: var(--ink-2);
  }

  .name-well {
    vertical-align: middle;
  }

  /* A PAGE ABOUT ONE THING WEARS ITS SLOT'S COLOUR (domains lane, 2 Nov), the colour its well and its dot wear, and not
     its hue at the mark's lightness, which drew a project at hue 30 red here and pink everywhere else. */
  .name-icon[data-hue] {
    color: var(--slot-ink, var(--ink-2));
  }

  /* Beside the name on its baseline, at the sentence's size in the quiet ink. */
  .count {
    flex: none;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-head);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    transition: opacity var(--swap-out) var(--ease-out) var(--swap-out);
  }

  /* THE SPACE IS A CHARACTER, AND IT HAS TO BE: a margin reads `10of 38` to a screen reader and a copy-paste. */
  .of {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE COMPACT TITLE: one line at 17/600 over the name's place, invisible until the page scrolls under the row. */
  .head-title {
    position: absolute;
    inset-block-start: 50%;
    inset-inline: 0;
    display: block;
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: calc(24 / 17);
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0;
    pointer-events: none;
    translate: 0 -50%;
    transition: opacity var(--swap-out) var(--ease-out);
  }

  .head-title-count {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
  }

  @media (width >= 900px) {
    /* A HEAD WITH NO NAME OF ITS OWN SCROLLS WITH THE PAGE (AG22). Its name is the bar's, so stuck it was a band of
       board colour holding Share and More over the tiles passing under it, which read as grey covering the page. */
    .page-head:is([data-headless], [data-titled]) {
      position: relative;
    }

    .page-head:is([data-headless], [data-titled])::before {
      display: none;
    }

    .page-head[data-under] .page-name,
    .page-head[data-under] .count {
      opacity: 0;
      transition-delay: 0s;
    }

    /* Arriving, it waits for the name to go. */
    .page-head[data-under] .head-title {
      opacity: 1;
      transition-delay: var(--swap-out);
    }
  }

  /* THE ACTIONS, 8 apart at the right of the name, on its row, never wrapping under it. A FLEX CHILD DOES NOT SHRINK
     BELOW ITS CONTENT UNLESS IT IS TOLD TO, and without the floor the row pushed the header off a 320px window. */
  .head-actions {
    display: flex;
    flex: none;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin-inline-start: auto;
  }

  /* A QUIET CONTROL BESIDE THE NAME IS A TILE-COLOURED RECTANGLE ON THE BOARD: no glass, no edge, no shadow. */
  .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
  .head-actions :global(.segmented) {
    background: var(--tile);
    border-color: transparent;
    box-shadow: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass']):hover:not(:disabled)) {
      background: var(--hover);
    }
  }

  /* THE PAGE'S "⋯", ALWAYS DRAWN: 32 square, quiet, its glyph in the second ink, on the tile's fill like any quiet
     control beside the name (frame F18). */
  .head-actions :global(.head-more) {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    opacity: 1;
    visibility: visible;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .head-actions :global(.menu-trigger:hover .head-more) {
      background: var(--hover);
    }
  }

  .head-actions :global(:is(.btn, .capture-open, .head-more, .menu-trigger)) {
    flex: none;
  }

  /* A PAGE WHOSE HERO HOLDS THE NAME: the back link and the actions only, on one 32px row. */
  .page-head[data-headless] .head-main {
    min-block-size: var(--ctl-h);
  }

  .head-back {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  .back-mark {
    display: inline-grid;
    flex: none;
    scale: -1 1;
  }

  .back-mark:dir(rtl) {
    scale: none;
  }

  /**
   * THE SENTENCE: once, 17/24 at 400 in body text, 8 under the name and lined up with it. The figures in it at 500 and
   * the phrase that needs him in the red at 500. A reading measure, so a long line wraps where an eye can follow it.
   */
  .page-said {
    box-sizing: border-box;
    margin: var(--sp-2) 0 0;
    padding: 0 var(--gutter);
    max-inline-size: calc(75ch + var(--gutter) * 2);
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-regular);
    line-height: calc(24 / 17);
    text-wrap: pretty;
  }

  /* ITS ROOM HELD WHILE IT IS ON ITS WAY: one line from 640px up, two below, where the sentence is two lines. */
  .page-said[data-held] {
    min-block-size: 1lh;
  }

  @media (width < 640px) {
    .page-said[data-held] {
      min-block-size: calc(var(--held-lines, 2) * 1lh);
    }
  }

  /* THE WORDS IT IS LIKELY TO SAY, set and unseen, so the room held is theirs. */
  .held-words {
    visibility: hidden;
  }

  .page-said :global(.fig) {
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  .page-said :global([data-needs]) {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  /* THE NAME THE BAR SAYS, kept for a screen reader and the focus a move lands, and drawn nowhere. */
  .name-unseen {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE NAME'S ROW WITHOUT THE NAME: the sentence, and the actions at its end. Nothing in it stays at the top, since the
     bar above already says where you are. */
  .page-head[data-titled] {
    position: static;
    z-index: auto;
  }

  .page-head[data-titled]::before {
    display: none;
  }

  .page-head[data-titled] .head-main {
    min-block-size: 0;
  }

  /* A SENTENCE WITH NO BUTTONS BESIDE IT STANDS WHERE ONE WITH BUTTONS DOES (AH34): Today's first line sat 16 under the
     bar's rule while every page with actions had the row's height to sit in. */
  .page-head[data-titled]:has(.head-actions > :not(dialog), .head-said) .head-main {
    min-block-size: var(--ctl-h);
  }

  /* A HEAD WITH NOTHING TO SAY BUT ITS NAME draws no room of its own. A closed sheet the actions hold (the arranging
     controls' "Which list to show") is not something to say: the buttons gone to the sentence's row (`PageView`'s
     `besideLead`) left a 52px band of nothing over the page for it. */
  .page-head[data-titled]:not(:has(.head-said, .head-actions > :not(dialog))) {
    padding-block-start: 0;
  }

  .page-said.head-said {
    flex: 1 1 auto;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    max-inline-size: 75ch;
  }

  /* UNDER THE SENTENCE, in the gutter, a step below it. */
  .head-below {
    padding: var(--sp-3) var(--gutter) 0;
  }

  @media (width < 900px) {
    /**
     * THE BAR: its own row, 56 under the notch, sticky, and nothing sticky on a phone is taller. The notch is paid here,
     * once, as padding, so the bar fills the notch strip the way a native screen does. 12 at each end, so the search
     * button and the face sit just inside the gutter.
     */
    .head-bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sheet);
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      box-sizing: border-box;
      block-size: calc(56px + env(safe-area-inset-top));
      padding: env(safe-area-inset-top) var(--sp-3) 0;
    }

    /* ON THE NAV'S SURFACE WITH A HAIRLINE UNDER IT, as the docked tab bar is at the bottom and the desk's bar is at the
       top: flat and opaque, no glass and no blur, the same on every page. */
    .head-bar::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: var(--nav);
      box-shadow: inset 0 -1px 0 var(--rule);
      pointer-events: none;
    }

    /* WHERE YOU ARE, AND OVER IT THE TITLE ONCE THE NAME HAS GONE UNDER THE BAR: one cell, two pieces, a cross-fade
       and no layout. */
    .bar-lead {
      display: grid;
      flex: 1 1 0;
      align-items: center;
      min-inline-size: 0;
    }

    .bar-lead > * {
      grid-area: 1 / 1;
      min-inline-size: 0;
    }

    /* THE RECORD'S MARK, or the back chevron in its place: one 44 slot at the bar's start on every page. */
    .bar-mark,
    .back {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: var(--tap);
      block-size: var(--tap);
      margin-inline-start: calc(-1 * var(--sp-2));
      color: var(--ink);
      text-decoration: none;
    }

    /* A NAME TOO LONG FOR ONE LINE TAKES TWO (skills pass follow-up, 2 Nov): "Defaults for new agents" was cut to
       "Defaults for new ag…" at 390, and on a phone the bar is the only place the page's name is drawn. Two lines at 17
       on a 1.2 line are 41 of the bar's 56; past two it is cut, which no page name in the app reaches. */
    .bar-where,
    .bar-title {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: var(--ink);
      font-family: var(--font-display);
      font-size: var(--fs-head);
      font-weight: var(--fw-semi);
      line-height: 1.2;
      text-wrap: balance;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      /* Showing waits for the other to go; going does not wait. */
      transition: opacity var(--swap-out) var(--ease-out) var(--swap-out);
    }

    /* TODAY'S GREETING STAYS ON ONE LINE: it has a shorter form of its own it changes to when it does not fit. */
    .bar-lead[data-greets] > :is(.bar-where, .bar-title) {
      display: block;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bar-title {
      opacity: 0;
      transition-delay: 0s;
    }

    /* THE PAGE'S COUNT AFTER ITS NAME, quiet. */
    .bar-figure {
      margin-inline-start: var(--sp-2);
      color: var(--ink-3);
      font-family: var(--font-ui);
      font-weight: var(--fw-medium);
      font-variant-numeric: tabular-nums;
    }

    .head-bar[data-past] .bar-where {
      opacity: 0;
      transition-delay: 0s;
    }

    .head-bar[data-past] .bar-title {
      opacity: 1;
      transition-delay: var(--swap-out);
    }

    /* ASK, THE BELL AND THE FACE AT THE END, 44 square each and touching: three targets in the room of three. */
    .bar-end {
      display: inline-flex;
      align-items: center;
      gap: 0;
      flex: none;
      margin-inline-start: auto;
    }

    .find {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-ctl);
      color: var(--ink);
      cursor: pointer;
    }

    /* THE NAME AND WHAT GOES WITH IT SCROLL AWAY WITH THE PAGE; only the bar stays. 12 under the bar, or 4 under the
       kicker that took those 12. */
    .page-head {
      position: static;
      z-index: auto;
      padding: var(--sp-3) var(--gutter) 0;
    }

    .page-head[data-kicked] {
      padding-block-start: var(--sp-1);
    }

    .page-head::before,
    .head-title {
      display: none;
    }

    .kicker {
      padding-block-start: var(--sp-3);
    }

    /* The phone's name, 22/28, wrapped in full and never cut (a cut question loses its meaning; the audit's Q20 found
       one cut mid-word). THE GLYPH AND THE WORDS IN A GRID (today F9, which the question page
       drew for itself), so a second line starts under the first and not under the glyph, and the glyph sits on the
       first line. */
    .page-name {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      font-size: var(--fs-page-phone);
      line-height: calc(28 / 22);
      letter-spacing: -0.015em;
    }

    .page-name:has(> :is(.name-icon, .name-well)) {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .page-name > :is(.name-icon, .name-well) {
      block-size: 1lh;
    }

    .name-words {
      display: block;
      min-inline-size: 0;
    }

    .count {
      font-size: var(--fs-head);
    }

    /* THE NAME KEEPS AT LEAST TWO FIFTHS OF THE ROW; the actions keep their width at its end and never wrap. */
    .name-row {
      flex: 1 1 0;
      flex-wrap: nowrap;
      min-inline-size: 40%;
    }

    .head-main {
      gap: var(--sp-2);
    }

    /* The bar carries the way back on a phone, so the kicker's link is not said twice. */
    .kicker-link {
      display: none;
    }

    /* A BUTTON WITH A GLYPH IS THE GLYPH ALONE, in a 44px square, and the page's primary is red with a white glyph: its
       words stay in it at no size, so they are still its name to a screen reader. A page's "+" and "⋯" take the same
       square, one size with the search button and the face in the bar above (motion F17). */
    /* NEVER INSIDE A SHEET THE HEAD HOLDS (AH29): Share's sheet is a child of this row, and its Copy the link was a
       red bar with the glyph alone. */
    .head-actions :global(.btn:has(.icon):not(dialog *)) {
      inline-size: var(--tap);
      min-inline-size: var(--tap);
      min-block-size: var(--tap);
      padding: 0;
      gap: 0;
      font-size: 0em;
    }

    .head-actions :global(.btn) {
      min-block-size: var(--tap);
    }

    /* THE PAGE'S "+" IS A STEP SMALLER THAN THE BAR'S SQUARES: 36 with its 16px glyph, its
       hit box still the 44 of `.tap`. A red 44 square beside the title was the loudest thing on the phone's first
       screen, louder than the sentence that says what the page holds. */
    .head-actions :global(.btn[data-weight='primary']:has(.icon):not(dialog *)) {
      inline-size: 36px;
      min-inline-size: 36px;
      min-block-size: 36px;
    }

    .head-actions :global(.btn[data-weight='primary']:has(.icon):not(dialog *) .icon[data-size]) {
      inline-size: var(--icon-m);
      block-size: var(--icon-m);
    }

    .head-actions :global(:is(.capture-open, .head-more)) {
      inline-size: var(--tap);
      block-size: var(--tap);
    }

    /* A QUIET GLYPH AND THE PAGE'S "⋯" ARE ONE PAIR, drawn as the bar's search button is: a bare 44 square, a 20px
       glyph in the ink, no fill. Share was a white tile with a 16px glyph beside a bare 32px "⋯" (Kiln at 390). */
    .head-actions :global(.btn:has(.icon):is([data-weight='quiet'], [data-weight='glass']):not(dialog *)),
    .head-actions :global(.head-more) {
      background: none;
      color: var(--ink);
    }

    .head-actions :global(.change-more) {
      inline-size: var(--tap);
      min-block-size: var(--tap);
      color: var(--ink);
    }

    .head-actions :global(:is(.btn[data-weight='quiet'], .btn[data-weight='glass'], .change-more, .head-more) .icon[data-size]) {
      inline-size: var(--icon-l);
      block-size: var(--icon-l);
    }

    /* IN THE BAR, 4 apart, as search and the face are. */
    .bar-actions {
      gap: var(--sp-1);
    }

    /* AND THE SHORTCUT HINT GOES, because below 900px there is no keyboard to press it with. */
    .head-actions :global(kbd) {
      display: none;
    }
  }

  /**
   * ON A PHONE THE PAGE'S ⋯ HAS A PLACE AT THE END OF THE HEAD'S LAST ROW (look fault N). Home's body brings its own
   * menu (`PageView`'s `.home-tools`), and where the head ends on its sentence that screen raises it to the sentence's
   * end. Where the head ends on `below` (the line a task is typed into, the default Today), there was no room: the ⋯
   * kept a row of its own, about 60px of nothing over the first tile. So that row keeps a tap's room at its end, and
   * the ⋯ is raised into it: over the body's top by the `--sp-4` a page leaves under its head, level with the row.
   *
   * ONLY WHERE A MENU IS THERE TO TAKE IT, and not while the page is being arranged, when the mode's controls are a
   * row of their own. From 601px a touch screen keeps the row it had: the head has the width for it.
   */
  @media (hover: none) and (width <= 600px) {
    :global(.head-below:has(+ .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools :is(button, a))) {
      padding-inline-end: calc(var(--gutter) + var(--tap) + var(--sp-2));
    }

    :global(.head-below + .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools) {
      position: absolute;
      margin: 0;
      inset-block-end: calc(100% + var(--sp-4));
    }

    /* AND WHERE THE PAGE'S BODY IS THE PAGE ITSELF (Scripts under its tabs, L49): the same raise, into the tabs' row. */
    :global(.head-below:has(+ .page > .home-page:first-child:not([data-arranging]) > .home-tools :is(button, a))) {
      padding-inline-end: calc(var(--gutter) + var(--tap) + var(--sp-2));
    }

    :global(.head-below + .page > .home-page:first-child:not([data-arranging]) > .home-tools) {
      position: absolute;
      margin: 0;
      inset-block-end: calc(100% + var(--sp-4));
    }
  }

  /* FORCED COLOURS KEEP THE COMPACT ROW'S EDGE, so it is told from the work under it. */
  @media (forced-colors: active) {
    .page-head::before {
      border-block-end-color: CanvasText;
    }
  }
</style>
