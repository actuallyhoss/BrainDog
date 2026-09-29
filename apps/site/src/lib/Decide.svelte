<!--
  An agent proposes, a person decides, and the record keeps who did which. Drawn, not photographed.

  THE APP'S `decide` SCREEN IS THE PRODUCT'S MOST DISTINCTIVE IDEA AND THE PAGE NEVER SHOWED IT.
  `loop/research-site-now.md` (change 2) measured what stood in its place: a five-row table of
  records with ids in it, `tasks#12` among them, under a paragraph about registers. That proved
  "every change carries a name" to somebody who already reads ledgers. This proves it to everybody
  else in one movement: the agent drafts, the draft lands as a proposal card, a person accepts it,
  and the row that appears in history carries the AGENT'S name, not the person's and not an id.

  THE FINISHED SCENE IS THE ONE IN THE MARKUP. The site is prerendered and reads with JavaScript off,
  so the server writes the last frame (`data-phase="done"`), and the motion is the browser taking
  the scene back to its first frame and playing it forward once. The alternative, prerendering the
  first frame and relying on a script to finish it, shows a reader without script an agent typing
  forever over a proposal nobody accepted, which is the opposite of the claim.

  IT PLAYS ONCE, ON ENTRY, AND ONLY FROM BELOW THE FOLD. An `IntersectionObserver` starts it the
  first time the scene is a third on screen, then disconnects. If the scene is already on screen when
  the script arrives, it is left finished: rewinding something a reader is looking at would blank
  a card under their eyes and replay it, which is worse than no motion at all.

  THE MOTION IS GUARDED IN THE SCRIPT, not in CSS: a `prefers-reduced-motion` rule can stop a
  transition and cannot stop a timer. Under that preference the scene is never rewound and no timer
  is made. The query is listened to as well as read, because reading it once at mount leaves the
  timers running for somebody who turns motion off with the page already open, which is exactly when
  a person reaches for that switch; so turning the preference on mid-play finishes the scene there
  and then. The CSS transitions sit inside `no-preference` as a second guard.

  THE WHOLE PLAY IS UNDER FIVE SECONDS, and that number is the WCAG 2.2.2 one. This is moving
  content that starts by itself, and the criterion exempts motion that lasts five seconds or less.
  Unlike the ledger it is not auto-updating information (nothing new arrives; the finished scene
  was in the markup all along), so the five-second exception is honest here where it was not there,
  and no stop control is owed.

  THE WORDS STAY IN THE ACCESSIBILITY TREE THROUGHOUT. The frames hide by opacity and never by
  `display` or `visibility`, except the verb and the stamp, which share one cell and swap. A screen
  reader therefore reads the finished scene, which is what the markup says, and there is no live
  region: announcing a four-step animation of text it has already read would be noise.

  NO DEFAULT STRINGS. Every word is a prop, because all of this site's copy lives in `copy.ts` where
  the content test scans it. The only characters the component makes are the faces' initials, cut from
  the names written beside them, drawn by the stylesheet from a data attribute and hidden from
  assistive technology, so they are never words in the markup.

  TWO TILES, AS THE NEW APP DRAWS THEM (SYSTEM §6, 29 September): the question on the left, with an icon
  well on its heading, the agent that asks, the proposal and the verb; and the history on the right, the
  landing row arriving in the arrive wash. The figure is not a tile: it lays its two tiles in its own
  grid, so no tile holds another. Its glyphs are drawn inline from `icons.ts`'s set, because the
  server-render test compiles this file alone.
-->
<script lang="ts">
  /** `rule` marks a row a rule wrote, drawn with no face: faces are for agents and people. */
  type Row = { who: string; what: string; when: string; rule?: boolean };

  let {
    scene,
  }: {
    /** `site.decide`. The LAST history row is the landing row: the one the accepted proposal writes. */
    scene: {
      /** The scene's name, drawn as its caption and used as the figure's accessible name. */
      label: string;
      /** Who drafts the change, and whose name the landing row carries. */
      agent: string;
      /** Who accepts it. */
      person: string;
      proposal: { title: string; change: string };
      /** The word on the drawn button the person presses. */
      verb: string;
      /** What the card says once it has been pressed. */
      accepted: string;
      /** Oldest first, and the last one lands when the proposal is accepted. */
      history: readonly Row[];
      /** The two tiles' headings, and the history's order. Absent, the tiles draw no words of their own. */
      heads?: { ask: string; history: string; order?: string };
      /** The one line under the history. */
      undo?: string;
    };
  } = $props();

  const uid = $props.id();

  /**
   * The four frames. `done` is the prerendered one and the one every guard falls back to.
   *
   *   draft     the agent is typing and the card has not arrived
   *   proposed  the card has landed with its button, and the person's pointer is on its way
   *   pressed   the button is down
   *   done      the card says accepted and the landing row is in history
   */
  type Phase = 'draft' | 'proposed' | 'pressed' | 'done';
  let phase = $state<Phase>('done');

  /* THE STEPS, in milliseconds from the moment the observer fires. The last one lands at 2.9s and
     its transition runs `--d-enter` past it, which keeps the whole play inside WCAG 2.2.2's five
     seconds with room to spare. */
  const STEPS: readonly [number, Phase][] = [
    [900, 'proposed'],
    [2100, 'pressed'],
    [2500, 'done'],
  ];

  let root = $state<HTMLElement | null>(null);

  const initial = (name: string) => name.trim().slice(0, 1);
  const older = $derived(scene.history.slice(0, -1));
  const landing = $derived(scene.history.at(-1));

  $effect(() => {
    const el = root;
    if (!el) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers: ReturnType<typeof setTimeout>[] = [];
    let seen: IntersectionObserver | undefined;

    function finish() {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
      seen?.disconnect();
      seen = undefined;
      phase = 'done';
    }

    /* A PREFERENCE TURNED ON MID-PLAY ENDS THE PLAY. Turning it back off does nothing: the scene has
       been seen finished, and replaying it on a settings change would be motion nobody asked for. */
    function onchange() {
      if (calm.matches) finish();
    }
    calm.addEventListener('change', onchange);

    /* ALREADY ON SCREEN, OR NO OBSERVER, OR MOTION REFUSED: the scene stays as the server wrote it. */
    const box = el.getBoundingClientRect();
    const visible = box.top < window.innerHeight && box.bottom > 0;
    if (!calm.matches && !visible && typeof IntersectionObserver === 'function') {
      phase = 'draft';
      seen = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          seen?.disconnect();
          seen = undefined;
          for (const [at, next] of STEPS) timers.push(setTimeout(() => (phase = next), at));
        },
        { threshold: 0.35 },
      );
      seen.observe(el);
    }

    return () => {
      calm.removeEventListener('change', onchange);
      for (const t of timers) clearTimeout(t);
      seen?.disconnect();
    };
  });
</script>


<figure class="decide" data-phase={phase} bind:this={root} aria-labelledby="{uid}-label">
  <figcaption class="label" id="{uid}-label">{scene.label}</figcaption>

  <div class="stage">
    <div class="tile ask">
      {#if scene.heads}
        <p class="head">
          <span class="well" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 20.5v-6.25L6.25 8.5" /><path d="M12 14.25l5.75-5.75" /><path d="M6.25 13V8.5h4.5" /><path d="M17.75 13V8.5h-4.5" /></svg>
          </span>
          <span class="head-title">{scene.heads.ask}</span>
        </p>
      {/if}

      <div class="flow">
        <p class="actor agent">
          <span class="face" data-initial={initial(scene.agent)} aria-hidden="true"></span>
          <span class="name">{scene.agent}</span>
          <!-- THE TYPING DOTS ARE THE ONLY THING THAT SAYS "DRAFTING", and they need no word: the
               proposal arriving under them is what the dots were promising. -->
          <span class="typing" aria-hidden="true"><i></i><i></i><i></i></span>
        </p>

        <div class="card">
          <p class="title">{scene.proposal.title}</p>
          <p class="change">
            <span class="plus" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 5.25v13.5M5.25 12h13.5" /></svg>
            </span>
            <span class="change-text">{scene.proposal.change}</span>
          </p>
          <div class="foot">
            <p class="actor person">
              <span class="face" data-initial={initial(scene.person)} aria-hidden="true"></span>
              <span class="name">{scene.person}</span>
            </p>
            <!-- THE VERB AND THE STAMP SHARE ONE CELL, so the tile is one size before and after the press
                 and nothing under it moves. The verb is DRAWN, not a `<button>`: a control on a marketing
                 page that does nothing when pressed is a broken control, whatever it looks like. -->
            <span class="decision">
              <span class="verb">{scene.verb}</span>
              <span class="stamp">
                <svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.25 4.25L19 7" /></svg>
                <span>{scene.accepted}</span>
              </span>
              <svg class="pointer" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 2l10 6.2-4.4 1.1L6.4 14z" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="tile past">
      {#if scene.heads}
        <p class="head">
          <span class="well" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M3 12.5h3.75l2.5-6 4.5 11 2.5-5h4.75" /></svg>
          </span>
          <span class="head-title">{scene.heads.history}</span>
          {#if scene.heads.order}<span class="head-meta">{scene.heads.order}</span>{/if}
        </p>
      {/if}

      <!-- NEWEST FIRST, as the app's history reads: the landing row at the top, then the older ones. -->
      <ol class="history">
        {#if landing}
          <li class="row landing">
            <span class="face" data-initial={initial(landing.who)} aria-hidden="true"></span>
            <span class="said">
              <span class="what">{landing.what}</span>
              <span class="meta"><span class="who">{landing.who}</span><span class="dot" aria-hidden="true"></span><span class="when">{landing.when}</span></span>
            </span>
          </li>
        {/if}
        {#each [...older].reverse() as row, i (i)}
          <li class="row">
            {#if row.rule}
              <span class="rule" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M13 3.25 5.25 13.5H12l-1 7.25 7.75-10.25H12z" /></svg>
              </span>
            {:else}
              <span class="face" data-initial={initial(row.who)} aria-hidden="true"></span>
            {/if}
            <span class="said">
              <span class="what">{row.what}</span>
              <span class="meta"><span class="who">{row.who}</span><span class="dot" aria-hidden="true"></span><span class="when">{row.when}</span></span>
            </span>
          </li>
        {/each}
      </ol>

      {#if scene.undo}<p class="reading">{scene.undo}</p>{/if}
    </div>
  </div>
</figure>

<style>
  /* SEMANTIC TOKENS ONLY. Two tiles on the site's ground, each drawn as the app draws a tile. */
  .decide {
    --face: 28px;

    margin: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  /* Named for a screen reader only: the scene says it better than a caption over it. */
  .label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* TWO TILES AT A DESK, the question on the left and the history it writes to on the right, so the eye goes the
     way the change does, one inset apart. They stack below 900. */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    gap: var(--inset);
    block-size: 100%;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: 20px;
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e1);
  }

  /* THE HEADING ROW: an icon well, the title, and a meta line at the end (SYSTEM §6). */
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
  }

  .well,
  .rule {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-well);
    background: var(--s1);
    color: var(--ink2);
  }

  .well svg,
  .rule svg,
  .plus svg {
    inline-size: 18px;
    block-size: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .head-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .head-meta {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .flow {
    display: grid;
    gap: var(--sp-4);
  }

  .actor {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    min-inline-size: 0;
  }

  /* A FACE: a circle in the second ink with the initial in the on-ink colour, drawn from its data attribute. */
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--face);
    block-size: var(--face);
    border-radius: var(--r-pill);
    background: var(--ink2);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .face::before {
    content: attr(data-initial);
  }

  .person .face {
    background: var(--ink);
  }

  .name {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    white-space: nowrap;
  }

  .typing {
    display: inline-flex;
    gap: 3px;
    opacity: 0;
  }

  .typing i {
    inline-size: 5px;
    block-size: 5px;
    background: var(--live);
    border-radius: var(--r-pill);
  }

  /* THE PROPOSAL sits in the tile, not in a box of its own: the question at the group step, the change in a
     second-fill well with its plus, and the person and the verb at its foot. */
  .card {
    display: grid;
    gap: var(--sp-3);
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
    text-wrap: balance;
  }

  .change {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0;
    padding: 10px 12px 10px 10px;
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .plus {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--ink);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-block-start: var(--sp-1);
  }

  .decision {
    position: relative;
    display: grid;
    justify-items: end;
  }

  .verb,
  .stamp {
    grid-area: 1 / 1;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-4);
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  /* DRAWN IN INK, as the product's primary actions are. */
  .verb {
    background: var(--ink);
    color: var(--on-ink);
    visibility: hidden;
  }

  .stamp {
    background: var(--s1);
    color: var(--ink);
  }

  .tick {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: none;
    stroke: var(--earn);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pointer {
    position: absolute;
    inset-block-end: -10px;
    inset-inline-end: 6px;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: var(--ink);
    stroke: var(--bg);
    stroke-width: 1;
    opacity: 0;
    pointer-events: none;
  }

  /* ── The history ──────────────────────────────────────────────────── */

  .history {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 56px;
    padding: var(--sp-2) 10px;
    border-radius: var(--r-md);
  }

  .said {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .what {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 20px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .who {
    color: var(--ink2);
    font-weight: 500;
  }

  .dot {
    inline-size: 3px;
    block-size: 3px;
    border-radius: var(--r-pill);
    background: currentColor;
  }

  /* THE LANDING ROW ARRIVES in the arrive wash, the one fill that says "just now" (SYSTEM §2). Its quiet words step
     up to the second ink, which keeps its contrast on the wash. */
  .landing {
    background: var(--arrived-wash);
  }

  .landing .meta {
    color: var(--ink2);
  }

  .reading {
    margin: auto 0 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* ── The frames. Opacity and transform only, so the box is one size in every frame ─────────── */

  [data-phase='draft'] .typing {
    opacity: 1;
  }

  [data-phase='draft'] .card {
    opacity: 0;
    transform: translateY(var(--sp-3));
  }

  [data-phase='draft'] .verb,
  [data-phase='proposed'] .verb,
  [data-phase='pressed'] .verb {
    visibility: visible;
  }

  [data-phase='draft'] .stamp,
  [data-phase='proposed'] .stamp,
  [data-phase='pressed'] .stamp {
    visibility: hidden;
  }

  [data-phase='pressed'] .verb {
    transform: scale(var(--press-scale));
  }

  [data-phase='proposed'] .pointer,
  [data-phase='pressed'] .pointer {
    opacity: 1;
  }

  [data-phase='draft'] .pointer {
    transform: translate(var(--sp-6), var(--sp-6));
  }

  [data-phase='draft'] .landing,
  [data-phase='proposed'] .landing,
  [data-phase='pressed'] .landing {
    opacity: 0;
    transform: translateY(calc(-1 * var(--sp-2)));
  }

  /* ── Only when motion is welcome ──────────────────────────────────── */

  @media (prefers-reduced-motion: no-preference) {
    .card,
    .landing {
      transition:
        opacity var(--d-enter) var(--ease-out),
        transform var(--d-enter) var(--ease-out);
    }

    .pointer {
      transition:
        opacity var(--d-state) var(--ease-out),
        transform var(--d-enter) var(--ease-out);
    }

    .verb {
      transition: transform var(--d-press) var(--ease-push);
    }

    .typing i {
      animation: typing 900ms var(--ease-out) infinite;
    }

    .typing i:nth-child(2) {
      animation-delay: 150ms;
    }

    .typing i:nth-child(3) {
      animation-delay: 300ms;
    }

    /* THE DOTS ONLY MOVE WHILE THEY ARE SHOWN. An infinite animation on an invisible element is still a
       compositor frame every tick, for the whole life of the page. */
    [data-phase='proposed'] .typing i,
    [data-phase='pressed'] .typing i,
    [data-phase='done'] .typing i {
      animation: none;
    }
  }

  @keyframes typing {
    0%,
    100% {
      opacity: 0.3;
    }

    50% {
      opacity: 1;
    }
  }

  /* ── Narrower: the question over the history ──────────────────────── */

  @media (width < 900px) {
    .stage {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
