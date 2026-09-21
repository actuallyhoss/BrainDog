<!--
  The ledger, out of the bento and into the hero, with a clock behind it.

  THE COMPONENT THIS REPLACED, `bento/History.svelte`, drew this same list as a decoration: a loop,
  `aria-hidden`, four rows pushed around a keyframe, in a grid of seven such miniatures. It went
  with the rest of the bento. This is the same rows with the one difference that matters: the
  arrivals are REAL. A row appears every four seconds, the sequence number on it is higher than the
  one before, and when the last event has landed the thing stops. It does not loop, it does not
  remove a row, and it does not invent a sixth event to keep the motion going. An append-only log
  that secretly recycles its rows is a picture of a lie, and this component's whole job is to be
  the proof of the claim beside it.

  THE BOX IS RESERVED BEFORE THE FIRST ROW ARRIVES. Five rows tall at a desk, three on a phone,
  fixed either way, so nothing below the hero moves while somebody is reading it. On the phone the
  box therefore holds fewer rows than there are events, so it SCROLLS rather than clips: the rows
  that have already arrived stay reachable, which is the point, and the box carries `tabindex` so a
  keyboard can reach them too.

  THE INTERVAL IS GUARDED IN THE SCRIPT, not in CSS. A `prefers-reduced-motion` rule can stop a
  transition; it cannot stop a `setInterval`. Under that preference every row is on screen at once
  and no timer is ever created, and the preference is listened to rather than read once, so
  turning motion off with the page already open finishes the list there and then.

  THE ARRIVALS ARE ANNOUNCED, not only drawn. A component whose whole job is to prove that nothing
  is overwritten cannot make that proof visual only: without a live region a screen reader gets the
  first two rows and then twelve seconds of silence. The choice was between a live region and
  putting all five rows in the markup from the start with only the motion suppressed. The second
  was rejected, because it would have the markup say five while the eye sees two, which trades one
  mismatch for the opposite one, and because it would turn a real append into a CSS reveal, which
  is precisely the decoration this component was written to replace.

  So the box is the live region. `polite` waits for a pause rather than cutting in, and it has an
  end: three announcements, then nothing, because the log does not loop. `aria-atomic="false"` is
  spelled out rather than left to the default, because the thing that must be read is the row that
  just landed and not all five rows again on every tick. The region is in the prerendered markup,
  already holding its first two rows, which is the condition for a later addition to it being
  announced at all: a live region that arrives already full is the shape screen readers are worst
  at.

  IT IS THE BOX AND NOT THE `<ol>`, deliberately. The `<ol>` is the nearer parent of the rows, but
  live regions on list elements have a long bug history (NVDA 5762 and 11410: appended `<li>`s not
  voiced), and the `<ol>` has a job of its own here, which is to tell a reader this is a list of
  five items they can walk. The wrapper is already a named region, so hanging `aria-live` on it
  costs nothing and leaves the list semantics alone. `aria-relevant` is left unset on purpose: its
  default is `additions text`, which is already what this needs, and its support is the least
  reliable of the live-region attributes.
-->
<script lang="ts">
  /** One line of the history, as `copy.ts` writes it. */
  type Entry = { seq: string | number; who: string; what: string; age: string };

  let {
    events,
    head,
    only,
    all,
  }: {
    /** `site.ledger.events`, oldest first. Rendered in the order given. */
    events: readonly Entry[];
    head: string;
    only: string;
    /** The control that ends the wait. Required, because a label is copy and copy lives in one file. */
    all: string;
  } = $props();

  const uid = $props.id();

  /** How many rows are there before anything ticks, and how long a tick is. */
  const FIRST = 2;
  const EVERY = 4000;

  let shown = $state(FIRST);
  /**
   * WCAG 2.2.2, Pause Stop Hide, and it applies here whatever the stopwatch says.
   *
   * These rows are auto-updating information that starts by itself and runs beside other content,
   * and the Understanding document closes the obvious escape: *there is no five second exception
   * for auto-updating since it makes little sense to auto-update for a few seconds and then stop*.
   * Twelve seconds of a list growing next to a paragraph somebody is trying to read is exactly
   * what the criterion is about, and a marketing page cannot claim the updating is essential.
   *
   * `prefers-reduced-motion` is a mitigation and not the mechanism: it asks the reader to have
   * already decided, system-wide, before arriving. The criterion asks for something to press. So
   * there is something to press, it is one word, and pressing it is final: the list finishes and
   * the timer is cleared for good. It does not toggle, because an append-only log with a rewind
   * button would be the same lie the looping version told.
   */
  let forced = $state(false);
  let box = $state<HTMLDivElement | null>(null);

  /* `slice` clamps, so a shorter list than `FIRST` needs no arithmetic here. */
  const rows = $derived(events.slice(0, shown));

  /**
   * The tick. It lives here rather than at the module top level because the site is prerendered:
   * on the server there is no clock, and the first paint is the two rows the markup already has.
   */
  $effect(() => {
    const total = events.length;
    if (total <= FIRST) {
      shown = total;
      return;
    }

    /* ASKED IN THE SCRIPT, AND KEPT ASKED. A `prefers-reduced-motion` rule can stop a transition;
       it cannot stop a `setInterval`, so the preference is read here and the whole timer is what
       hangs off it. Reading it once at mount would have left the timer running for somebody who
       turns motion off with the page already open, which is exactly when a person reaches for that
       switch, so the query is listened to as well as read.

       Turning the preference ON finishes the list at once and clears the timer. Turning it back
       off does not rewind: `done` is the record that the last event has landed, and an append-only
       log that replays itself on a settings change would be the same lie the loop version told. */
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let tick: ReturnType<typeof setInterval> | undefined;
    let done = false;

    function stop() {
      if (tick !== undefined) clearInterval(tick);
      tick = undefined;
    }

    /* `shown` is read inside the callback and never in the effect body, so the effect does not
       take a dependency on it and the interval is built once rather than rebuilt every tick. */
    function apply() {
      if (calm.matches || forced) {
        done = true;
        stop();
        shown = total;
        return;
      }

      if (done || tick !== undefined) return;

      tick = setInterval(() => {
        shown = Math.min(shown + 1, total);
        if (shown >= total) {
          done = true;
          stop();
        }
      }, EVERY);
    }

    apply();
    calm.addEventListener('change', apply);

    return () => {
      calm.removeEventListener('change', apply);
      stop();
    };
  });

  /* On a narrow box the newest row is below the fold the moment it lands, so the box follows it. */
  $effect(() => {
    void shown;
    if (box) box.scrollTop = box.scrollHeight;
  });
</script>

<div class="ledger">
  <p class="head" id="{uid}-head">
    <span class="lab">{head}</span>
    <span class="sep" aria-hidden="true">·</span>
    <span class="lab">{only}</span>
    <!-- IT LEAVES WHEN IT HAS NOTHING TO DO. Once every row is shown the control would be a button
         that changes nothing, which is worse than no button: a reader presses it to find out. -->
    {#if shown < events.length}
      <button class="all" type="button" onclick={() => (forced = true)}>{all}</button>
    {/if}
  </p>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region is a keyboard focus stop under WCAG 2.1.1, and this one is named) -->
  <div
    class="box"
    bind:this={box}
    tabindex="0"
    role="group"
    aria-labelledby="{uid}-head"
    aria-live="polite"
    aria-atomic="false"
  >
    <ol class="rows">
      {#each rows as e, i (e.seq)}
        <li class="row" class:newest={i === rows.length - 1}>
          <span class="seq">{e.seq}</span>
          <span class="who">{e.who}</span>
          <span class="what">{e.what}</span>
          <span class="age">{e.age}</span>
        </li>
      {/each}
    </ol>
  </div>
</div>

<style>
  .ledger {
    /* The row height and how many of them the box reserves. The narrow override changes both. */
    --row: 44px;
    --cap: 5;

    inline-size: 100%;
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    padding-inline: var(--sp-1);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .lab {
    min-inline-size: 0;
  }

  /* A LINK'S WEIGHT AND A BUTTON'S TARGET. It sits in a `--t-xs` heading line, so it is drawn as
     quietly as the words beside it, and `--tap` keeps the thing a thumb has to hit the size the
     rest of this repository keeps them. */
  .all {
    margin-inline-start: auto;
    min-block-size: var(--tap);
    padding-inline: var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .all:hover {
    color: var(--ink);
  }

  .sep {
    color: var(--dim);
  }

  /* RESERVED UP FRONT. The height is the row height times the capacity plus the box's own padding,
     so it is the same box before the first row and after the last one. */
  .box {
    block-size: calc(var(--row) * var(--cap) + var(--sp-2));
    padding-block: var(--sp-1);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 5ch auto minmax(0, 1fr) auto;
    grid-template-areas: 'seq who what age';
    align-items: center;
    gap: var(--sp-3);
    block-size: var(--row);
    padding-inline: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
    border-radius: var(--r-sm);
  }

  .row:last-child {
    border-block-end-color: transparent;
  }

  /* The one row that just landed. It is also the row at the end of the list, so the wash is the
     second thing that says so rather than the only one. */
  .newest {
    background: var(--hover-wash);
  }

  /**
   * AND THE TWO QUIET CELLS STEP UP ON THAT ONE ROW, because `--dim` runs out of contrast three
   * surfaces down.
   *
   * `--flip-dim` is solved against the flipped band's GROUND, which `app.css` states and measures at
   * 5.73:1 in the dark scheme. These rows are not on the ground: they are on `--s1`, which is 4.74:1,
   * and this row adds a 6 per cent wash under them, which is 4.19:1 and under the 4.5 body floor.
   * The `a11y` gate found it on `.newest > .seq` and `.newest > .age`, in dark at 1440 and at 390,
   * and nowhere else, because light lands at 4.94:1 and clears.
   *
   * THE TOKEN IS NOT THE THING THAT IS WRONG. Raising `--flip-dim` until it clears on this surface
   * needs 68 per cent, and `--flip-ink2` is 76: the quiet role and the secondary role would be eight
   * points apart and read as one colour, which is a worse product than a legible number. So the call
   * site that stacked two surfaces under a token solved for one pays for it, in `--ink2`, which
   * measures 6.18:1 here. `.who` and `.what` are already `--ink2` and `--ink` and were never in it.
   */
  .newest .seq,
  .newest .age {
    color: var(--ink2);
  }

  .seq {
    grid-area: seq;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .who {
    grid-area: who;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .what {
    grid-area: what;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .age {
    grid-area: age;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  /* ── The two things that only happen when they are welcome ──────────── */

  @media (prefers-reduced-motion: no-preference) {
    .row {
      animation: arrive var(--d-enter) var(--ease-spring) both;
    }

    .box {
      scroll-behavior: smooth;
    }
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(var(--sp-2));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ── The phone: two lines a row, three rows of box ───────────────────── */

  /* RANGE SYNTAX, TO MATCH THE PAGE. `+page.svelte` breaks its grid at `width < 640px`, which
     excludes exactly 640; `max-width: 640px` includes it. At a viewport of exactly 640 the page
     therefore kept its desk grid while this box dropped to three two-line rows. The page owns the
     number, so this file follows it. */
  @media (width < 640px) {
    .ledger {
      --row: 58px;
      --cap: 3;
    }

    .row {
      grid-template-columns: 5ch minmax(0, 1fr) auto;
      grid-template-areas:
        'seq who age'
        '.   what what';
      align-content: center;
      gap: var(--sp-1) var(--sp-2);
    }
  }
</style>
