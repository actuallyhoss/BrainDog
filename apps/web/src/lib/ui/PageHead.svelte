<!--
  The page header (DIRECTION §39): the page's name with its icon, its count, the actions at the right of the name, and
  under them the one sentence that says what is true today.

  A HEADER, NOT A HERO. The sentence used to be a 40px headline in a white card that took the top fifth of every screen
  and pushed the work below the fold. It is now said once, at 17 in body text, under a 28px name: figures in it a step
  heavier and only the phrase that needs the reader in the red. No card round any of it, and about 96 tall at 1,512.

  The title is `page.title` else `register.name`, NEVER an id. NOR DOES AN ID FOLLOW IT: a person reads a name here, and
  an id lives in a row's Details and in "Copy link" (19 §9).

  The count says `n of N`, and when examples are in the figure it says so (19 §6).

  THE ACTIONS ARE THE PAGE'S OWN: one primary, and the rest behind its "⋯", which the page hands over as `actions`.
  ON A PHONE THEY STAY ON THE TITLE ROW and never wrap under it: a button with a glyph is the glyph alone in a 36px
  square, its words still its name to a screen reader, and the name beside them wraps in its own column.

  TWO SHAPES, ONE ON EACH SIDE OF 900px.

  From 900px up the name's row sits on the board, and once the page scrolls it stays where it is as a compact bar in the
  board's own colour with a hairline under it: the name steps down to 17 and the row keeps its height, so the page under
  it never jumps. The sentence scrolls away with the page.

  Below 900px the head is a phone's. A `--sticky` (52px) bar stays at the top: the back link on a detail page, the
  title on one line once the large one has scrolled away, a 44px search button, and the person's face, which opens the
  More sheet: Work, People, Settings and every other place the five tabs leave out (his call 2, 20 October). Under it
  the name at 22 and the sentence scroll away with the page. A PAGE WITH NO WAY BACK HAS NO ROW FOR THE BAR: it lies
  over the head's first row, so the search button and the face sit at the end of the name's row (or of the line over
  it) and no empty row opens the page.

  A NAME BREAKS BETWEEN ITS WORDS, never inside one: "Invoice 2026-041" broke after the hyphen, as "2026-" and "041".

  `below` IS WHAT GOES UNDER THE SENTENCE: the line a task is typed into on a phone (`home/HeadCapture.svelte`), which
  stood between the name and its sentence when it wrapped out of the name's row. On a phone that row keeps a tap's room
  at its end for the ⋯ of the page under it, where the page has one.

  `led` AND `over` ARE KEPT FOR THE PAGES THAT PASS THEM, and change nothing: the header is the same on every page.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import Define from './Define.svelte';
  import { at, here } from '../at.ts';
  import { copy } from '../copy.ts';
  import { palette } from '../palette/open.svelte.ts';
  import { openMore } from '../shell/more.svelte.ts';
  import { partsOf } from '../shell/headline.ts';
  import { page } from '$app/state';
  import type { Noun } from '$lib/define.svelte.ts';
  import type { IconName } from './icons.ts';
  import type { Snippet } from 'svelte';

  let {
    title,
    count,
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
  }: {
    title: string;
    /** The glyph the register or page declares, drawn before the name. */
    icon?: IconName | undefined;
    /** The frozen hue of the row this page is about, when it is about one: the glyph is drawn in it. */
    hue?: number | undefined;
    count?: number | undefined;
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
    /** Kept for the pages that pass it: the header is drawn the same way with or without it. */
    led?: boolean | undefined;
    /** Kept for the pages that pass it: the header is drawn the same way with or without it. */
    over?: boolean | undefined;
  } = $props();

  /* THE COMPACT BAR ARRIVES ONCE SOMETHING HAS SCROLLED UNDER THE HEAD. A zero-height mark where the head starts leaves
     the scroller the moment the head sticks, which is the moment the bar starts meaning something. */
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
   * WHETHER THE LARGE TITLE HAS GONE UNDER THE PHONE'S BAR, which is when the bar says the title. The root is the screen
   * less the bar's own height at its top, and only a title that left upwards counts. From 900px up the bar is not
   * drawn, its height is zero and nothing reads `past`.
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

  /* THE SEARCH BUTTON IS NOT DRAWN ON `/search`, which is the search: two ways to one place side by side read as two. */
  const searching = $derived(here(page.url.pathname) === '/search');

  /* THE KICKER OVER THE TITLE IS DROPPED WHEN IT SAYS THE TITLE AGAIN: "Work" over "Work" names where you already are.
     The phone's back link keeps it, since that is a way out. */
  const crumb = $derived(kicker && kicker.trim().toLowerCase() !== title.trim().toLowerCase() ? kicker : undefined);

  /* THE NAME, A WORD AT A TIME: each is drawn as one piece, so a line never ends inside one (a hyphen is a place a
     browser may break at), and one longer than the row still breaks inside itself rather than running off the screen. */
  const named = $derived(title.split(/\s+/u).filter((w) => w !== ''));

  /* WHETHER THE PHONE'S BAR HAS A WAY BACK IN IT. Without one it holds only the search button, and takes no row. */
  const wayBack = $derived(Boolean(kicker && back));

  /* AND WHETHER IT THEN LIES OVER THE NAME ITSELF, with no line over the name to lie over instead. The name is under
     the bar from the start, so the bar says the title as soon as anything has scrolled under it (`under`), which is
     when it stops being clear: waiting for the name to leave the screen left a bar with nothing in it for a moment. */
  const overName = $derived(!wayBack && !crumb);
  const titled = $derived(overName ? under : past);

  /* THE PERSON'S FACE ON A PHONE: the first letter of the name the record told them, else of "You", as the top bar's. */
  const face = $derived.by(() => {
    const d = page.data as { me?: { person?: string }; names?: Record<string, string> } | undefined;
    const id = d?.me?.person;
    const name = id && d?.names && Object.hasOwn(d.names, id) ? (d.names[id] ?? '').trim() : '';
    return (name || 'You').slice(0, 1).toUpperCase();
  });

  /* THE SENTENCE AS WORDS, cut into its figures and the phrase that needs him (`shell/headline.ts`). */
  const parts = $derived(typeof sentence === 'string' ? partsOf(sentence, needs) : null);
</script>

<div bind:this={mark} aria-hidden="true"></div>
<!--
  THE PHONE'S BAR, hidden from 900px up. It is not inside the header because it has to stay when the header scrolls
  away, and a sticky element sticks only inside its parent's box. Its title repeats the `h1` for the eye once the `h1`
  has gone, so it is hidden from a screen reader, which has already met the heading.
-->
<div class="head-bar" bind:this={bar} data-under={under ? '' : undefined} data-past={titled ? '' : undefined} data-solo={wayBack ? undefined : ''}>
  {#if kicker && back}
    <a class="back tap" href={at(back)}>
      <span class="back-mark"><Icon name="chevron" size="l" /></span><span class="back-name">{kicker}</span>
    </a>
  {/if}
  <p class="bar-title" dir="auto" aria-hidden="true">{title}</p>
  {#if !searching}
    <button type="button" class="find tap" data-palette-from aria-label={copy.paletteLabel} onclick={() => (palette.open = true)}>
      <Icon name="search" size="l" />
    </button>
  {/if}
  <button type="button" class="me tap" aria-haspopup="dialog" aria-label={copy.more} title={copy.more} onclick={openMore}>
    <span class="me-face" aria-hidden="true">{face}</span>
  </button>
</div>
{#if crumb}
  <!-- Over the name and scrolling with the page: the row that stays is the name's. -->
  {#if back}
    <a class="kicker kicker-link tap" href={at(back)}>{crumb}</a>
  {:else}
    <p class="kicker">{crumb}</p>
  {/if}
{/if}
<header class="page-head" data-under={under ? '' : undefined} data-kicked={crumb ? '' : undefined}>
  <div class="head-main">
    <!-- The `dir="auto"` is on a SPAN around the title, not on the `h1`: the title came from whoever typed it, the glyph
         beside it is ours, and the attribute on the `h1` would resolve the direction of our own glyph too. -->
    <div class="name-row">
      <h1 class="page-name" bind:this={heading}>
        {#if icon}
          <span class="name-icon" style={hue === undefined ? undefined : `--hue:${hue}`} data-hue={hue === undefined ? undefined : ''}>
            <Icon name={icon} size="xl" />
          </span>
        {/if}
        <span dir="auto">{#each named as word, n}{n > 0 ? ' ' : ''}<span class="word">{word}</span>{/each}</span>
      </h1>
      <!--
        A COUNT OF NOTHING OVER AN EMPTY STATE IS THE SAME FACT TWICE, so a bare zero goes and a zero with a total beside
        it stays: `0 of 38` is a filter that matched nothing over a list that holds thirty-eight rows (19 §6).
      -->
      {#if count || total}
        <p class="count num">
          {(count ?? 0).toLocaleString('en')}{#if atLeast}<span class="more-sign">+</span>{/if}{#if total !== undefined && (atLeast || total !== count)}<span
              class="of">&nbsp;of {total.toLocaleString('en')}</span
            >{/if}
        </p>
      {/if}
    </div>
    {#if actions}<div class="head-actions">{@render actions()}</div>{/if}
  </div>
</header>
{#if sentence}
  <p class="page-said">
    {#if parts}{#each parts as part}{#if part.needs}<span class="needs" data-needs>{part.text}</span>{:else if part.fig}<span class="fig">{part.text}</span>{:else}{part.text}{/if}{/each}{:else if typeof sentence !== 'string'}{@render sentence()}{/if}
  </p>
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
    color: var(--dim);
  }

  /* No margin of its own: it is either there or it is not. */
  .head-define {
    margin: 0;
    padding: var(--sp-2) var(--gutter) 0;
    max-inline-size: calc(var(--measure) + var(--gutter) * 2);
    color: var(--dim);
    font-size: var(--fs-meta);
  }

  /* THE PHONE'S BAR IS A PHONE'S. The rule below 900px draws it. */
  .head-bar {
    display: none;
  }

  /* The section or the parent over the name, in meta: 13 in `--dim`, sentence case. */
  .kicker {
    display: block;
    inline-size: fit-content;
    margin: 0;
    padding: var(--sp-4) var(--gutter) 0;
    color: var(--dim);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    text-decoration: none;
  }

  /* A LINK IN THE KICKER'S OWN VOICE: quiet until it is pointed at, when it says it goes somewhere. */
  @media (hover: hover) and (pointer: fine) {
    .kicker-link:hover {
      color: var(--link);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /**
   * THE NAME'S ROW: 20 from the top of the work, 44 tall, and sticky. Sticky, and `--sticky` is what
   * `scroll-padding-block` is set from, so keyboard focus never lands underneath it (WCAG 2.4.11). The full width of
   * the work, as every tile under it is.
   */
  .page-head {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sheet);
    box-sizing: border-box;
    /* The Mac app's title bar sits above the head; --shell-inset is 0 in a browser. */
    padding: calc(20px + var(--shell-inset, 0px)) var(--gutter) 0;
  }

  /* A kicker already stands between the row and the top of the work. */
  .page-head[data-kicked] {
    padding-block-start: calc(2px + var(--shell-inset, 0px));
  }

  /* THE COMPACT BAR: the board's own colour behind the row and a hairline under it, there at rest, invisible, and
     arriving over `--d-move`. The row itself never changes height. Opaque, so a tile passing under it is not read
     through it. */
  .page-head::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--board);
    border-block-end: 1px solid var(--line);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--d-move) var(--ease-out);
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
    display: flex;
    flex: 1;
    align-items: baseline;
    column-gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* 28/34 at 600, and 17 in the compact bar. A BLOCK AND NOT A FLEX ROW, so a name that wraps is text that wraps, with
     its glyph inline before the first word. */
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
    transition: font-size var(--d-move) var(--ease-out);
  }

  /* ONE WORD, ONE PIECE (`named`): a box of its own breaks only when it is wider than the row, and then inside itself. */
  .word {
    display: inline-block;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
  }

  .page-head[data-under] .page-name {
    overflow: hidden;
    font-size: var(--fs-head);
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ON THE COMPACT ROW'S ONE LINE A WORD IS TEXT AGAIN, so a name too long for the row is cut at a letter with its
     ellipsis: a box that does not fit is dropped whole, and a name of one long word would be the ellipsis alone. */
  .page-head[data-under] .word {
    display: inline;
  }

  /* THE PAGE'S GLYPH, 24 before the name, in `--ink2`; a page about one thing wears that thing's own colour. */
  .name-icon {
    display: inline-grid;
    place-items: center;
    margin-inline-end: 10px;
    vertical-align: -0.12em;
    color: var(--ink2);
    transition: scale var(--d-move) var(--ease-out);
  }

  .name-icon[data-hue] {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .page-head[data-under] .name-icon {
    scale: 0.75;
  }

  /* Beside the name on its baseline, at the sentence's size in `--dim`. */
  .count {
    flex: none;
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-head);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    transition: font-size var(--d-move) var(--ease-out);
  }

  .page-head[data-under] .count {
    font-size: var(--fs-body);
  }

  /* THE SPACE IS A CHARACTER, AND IT HAS TO BE: a margin reads `10of 38` to a screen reader and a copy-paste. */
  .of {
    color: var(--dim);
    font-size: var(--fs-meta);
  }

  /* THE ACTIONS, 8 apart at the right of the name. A FLEX CHILD DOES NOT SHRINK BELOW ITS CONTENT UNLESS IT IS TOLD
     TO, and without the floor the row pushed the header off a 320px window. */
  .head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A QUIET CONTROL BESIDE THE NAME IS A TILE-COLOURED RECTANGLE ON THE BOARD: no glass, no edge, no shadow. */
  .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass'])),
  .head-actions :global(.segmented) {
    background: var(--tile);
    border-color: transparent;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .head-actions :global(.btn:is([data-weight='quiet'], [data-weight='glass']):hover:not(:disabled)) {
      background: color-mix(in srgb, var(--ink) 5%, var(--tile));
    }
  }

  /**
   * THE SENTENCE: once, 17 at 400 in body text, under the name and lined up with it. The figures in it at 500 and the
   * phrase that needs him in the red at 500. A reading measure, so a long line wraps where an eye can follow it.
   */
  .page-said {
    box-sizing: border-box;
    margin: 6px 0 0;
    padding: 0 var(--gutter);
    max-inline-size: calc(75ch + var(--gutter) * 2);
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-regular);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .page-said :global(.fig) {
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  .page-said :global([data-needs]) {
    color: var(--danger-text);
    font-weight: var(--fw-medium);
  }

  /* UNDER THE SENTENCE, in the gutter, a step below it. */
  .head-below {
    padding: var(--sp-3) var(--gutter) 0;
  }

  @media (width < 900px) {
    /**
     * THE BAR: `--sticky` tall below the notch, and nothing sticky on a phone is taller. The notch is paid here, once,
     * as padding, so the bar fills the notch strip the way a native screen does.
     */
    .head-bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sheet);
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      block-size: calc(var(--sticky) + env(safe-area-inset-top));
      /* A gutter less 4px at each end, so the search button's edge sits just inside the gutter line. */
      padding: env(safe-area-inset-top) calc(var(--gutter) - var(--sp-1)) 0;
    }

    /* CLEAR OVER THE BOARD, AND THE BOARD ITSELF WITH A HAIRLINE UNDER IT ONCE ANYTHING HAS SCROLLED UNDER IT, as the
       docked tab bar is at the bottom (DIRECTION §39): flat and opaque, no glass and no blur, so the one-line title in
       it reads over whatever passes and a tile under it is never read through it. */
    .head-bar::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: var(--board);
      box-shadow: inset 0 -1px 0 var(--line);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--d-move) var(--ease-out);
    }

    .head-bar[data-under]::before {
      opacity: 1;
    }

    /* The back link: a chevron and the parent's name, 44px tall. IT TAKES THE ROOM THERE IS: while the bar's title is
       not showing, the title holds no room (below), so the name is cut only where it would reach the search button.
       It was held to two fifths of the bar at all times, and read "Bills and invoi…" beside 200px of nothing. ONCE
       THE TITLE SHOWS it is two fifths again and does not give way: shrinkable beside a long title, it was squeezed
       to "D." on a question at 390, so it keeps its own width up to the cap and the name inside it is what ellipses. */
    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      flex: 0 1 auto;
      min-inline-size: 0;
      min-block-size: var(--tap);
      padding-inline-end: var(--sp-2);
      color: var(--ink);
      font-size: var(--t-md);
      font-weight: var(--fw-medium);
      text-decoration: none;
    }

    /* The shared chevron points on; a back link points the other way, in the reading direction. */
    .back-mark {
      display: inline-grid;
      flex: none;
      scale: -1 1;
    }

    .back-mark:dir(rtl) {
      scale: none;
    }

    .head-bar[data-past] .back {
      flex: none;
      max-inline-size: 40%;
    }

    .back-name {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* The title on one line at 17, and only once the large one has gone under the bar. Until then it asks for no
       room of its own, only what the back link leaves. */
    .bar-title {
      flex: 1 1 0;
      min-inline-size: 0;
      margin: 0;
      overflow: hidden;
      font-size: var(--fs-head);
      font-weight: var(--fw-semi);
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0;
      transition: opacity var(--d-move) var(--ease-out);
    }

    .head-bar[data-past] .bar-title {
      flex-basis: auto;
      opacity: 1;
    }

    /**
     * NO WAY BACK, NO ROW. The bar lies over the head's first row, giving back the height it stands in, and the row
     * under it keeps the bar's height and the search button's room at its end: the name's row, or the line over the
     * name where there is one. It was an empty row holding one search icon over every such page. At rest a press
     * falls through the bar to that row; once anything has scrolled under it the bar is the board again, and a
     * press on it reaches nothing passing beneath.
     */
    .head-bar[data-solo] {
      margin-block-end: calc(-1 * var(--sticky));
    }

    .head-bar[data-solo]:not([data-under]) {
      pointer-events: none;
    }

    .head-bar[data-solo] :is(.find, .me) {
      pointer-events: auto;
    }

    .head-bar[data-solo] + .kicker {
      display: flex;
      align-items: center;
      box-sizing: border-box;
      inline-size: auto;
      min-block-size: var(--sticky);
      padding-inline-end: calc(var(--gutter) + var(--tap) * 2);
    }

    .head-bar[data-solo] + .page-head .head-main {
      min-block-size: var(--sticky);
      padding-inline-end: calc(var(--tap) * 2 + var(--sp-1));
    }

    /* SEARCH, AS A PHONE HOLDS IT: a 44px square target at the top right with the glyph in it, no disc round it. */
    .find,
    .me {
      display: grid;
      place-items: center;
      flex: none;
      margin-inline-start: auto;
      inline-size: var(--tap);
      block-size: var(--tap);
      padding: 0;
      background: none;
      border: 0;
      border-radius: var(--r-ctl);
      color: var(--ink);
      cursor: pointer;
    }

    .find + .me {
      margin-inline-start: 0;
    }

    /* THE FACE: the person's letter in a 30px circle, the control's quiet fill. */
    .me-face {
      display: grid;
      place-items: center;
      inline-size: 30px;
      block-size: 30px;
      background: var(--field);
      border-radius: var(--r-round);
      font-size: var(--t-sm);
      font-weight: var(--fw-semi);
    }

    /* THE NAME AND WHAT GOES WITH IT SCROLL AWAY WITH THE PAGE; only the bar stays. */
    .page-head {
      position: static;
      z-index: auto;
      padding: 0 var(--gutter);
    }

    .page-head::before {
      display: none;
    }

    .kicker {
      padding-block-start: 0;
    }

    /* The phone's name, 22/28. It is never the compact one: that is the bar's. */
    .page-name,
    .page-head[data-under] .page-name {
      overflow: visible;
      font-size: var(--fs-page-phone);
      line-height: calc(28 / 22);
      letter-spacing: -0.015em;
      white-space: normal;
    }

    .page-head[data-under] .word {
      display: inline-block;
    }

    .name-icon,
    .page-head[data-under] .name-icon {
      margin-inline-end: var(--sp-2);
      scale: 0.84;
    }

    .count,
    .page-head[data-under] .count {
      font-size: var(--fs-body);
    }

    .page-said {
      margin-block-start: var(--sp-1);
      font-size: var(--t-md);
    }

    /* The bar carries the way back on a phone, so the kicker's link is not said twice. */
    .kicker-link {
      display: none;
    }

    /* THE ACTIONS STAY ON THE TITLE ROW (batch 5c): the name wraps in its own column and the actions keep their width at
       its end. They used to wrap under the name and float half way across the second line. */
    .head-main {
      flex-wrap: nowrap;
      gap: var(--sp-2);
    }

    .name-row {
      flex: 1 1 0;
      flex-wrap: wrap;
    }

    /* LEVEL WITH THE SEARCH BUTTON AND THE FACE: the actions keep to the bar's band at the top of the row, however many
       lines the name beside them takes. */
    .head-actions {
      flex: none;
      flex-wrap: nowrap;
      align-self: flex-start;
      min-block-size: var(--sticky);
      margin-inline-start: auto;
    }

    /* A BUTTON WITH A GLYPH IS THE GLYPH ALONE, in a 36px square: its words stay in it at no size, so they are still its
       name to a screen reader, and `.tap` keeps the 44px target round it. A page's "+" and "⋯" take the same square. */
    .head-actions :global(.btn:has(.icon)) {
      inline-size: 36px;
      min-block-size: 36px;
      padding: 0;
      gap: 0;
      font-size: 0em;
    }

    .head-actions :global(:is(.capture-open, .head-more)) {
      inline-size: 36px;
      block-size: 36px;
    }

    .head-actions :global(:is(.btn, .capture-open, .head-more, .menu-trigger)) {
      flex: none;
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
  }

  /* FORCED COLOURS KEEP THE COMPACT BAR'S EDGE, so it is told from the work under it. */
  @media (forced-colors: active) {
    .page-head::before {
      border-block-end-color: CanvasText;
    }
  }
</style>
