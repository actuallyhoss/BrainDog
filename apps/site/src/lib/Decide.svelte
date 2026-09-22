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

  THE MOTION IS GUARDED IN THE SCRIPT, not in CSS, for the reason `Ledger.svelte` gives: a
  `prefers-reduced-motion` rule can stop a transition and cannot stop a timer. Under that preference
  the scene is never rewound and no timer is made, and turning the preference on mid-play finishes
  the scene there and then. The CSS transitions sit inside `no-preference` as a second guard.

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
  the content test scans it. The only characters the component makes are the avatar initials, and
  they are cut from the names written beside them and hidden from assistive technology.
-->
<script lang="ts">
  type Row = { who: string; what: string; when: string };

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
    <div class="flow">
      <p class="actor agent">
        <span class="face" aria-hidden="true">{initial(scene.agent)}</span>
        <span class="name">{scene.agent}</span>
        <!-- THE TYPING DOTS ARE THE ONLY THING THAT SAYS "DRAFTING", and they need no word: the
             card arriving under them is what the dots were promising. -->
        <span class="typing" aria-hidden="true"><i></i><i></i><i></i></span>
      </p>

      <div class="card">
        <p class="title">{scene.proposal.title}</p>
        <p class="change">
          <span class="plus" aria-hidden="true"></span>
          <span class="change-text">{scene.proposal.change}</span>
        </p>
        <div class="foot">
          <p class="actor person">
            <span class="face" aria-hidden="true">{initial(scene.person)}</span>
            <span class="name">{scene.person}</span>
          </p>
          <!-- THE VERB AND THE STAMP SHARE ONE CELL, so the card is one size before and after the
               press and nothing under it moves. The verb is DRAWN, not a `<button>`: a control on a
               marketing page that does nothing when pressed is a broken control, whatever it
               looks like. -->
          <span class="decision">
            <span class="verb">{scene.verb}</span>
            <span class="stamp">
              <svg class="tick" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
              <span>{scene.accepted}</span>
            </span>
            <svg class="pointer" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 2l10 6.2-4.4 1.1L6.4 14z" />
            </svg>
          </span>
        </div>
      </div>
    </div>

    <ol class="history">
      {#each older as row, i (i)}
        <li class="row">
          <span class="who">{row.who}</span>
          <span class="what">{row.what}</span>
          <span class="when">{row.when}</span>
        </li>
      {/each}
      {#if landing}
        <li class="row landing">
          <span class="who">{landing.who}</span>
          <span class="what">{landing.what}</span>
          <span class="when">{landing.when}</span>
        </li>
      {/if}
    </ol>
  </div>
</figure>

<style>
  /* SEMANTIC TOKENS ONLY, so the scene takes whichever ground its band sets. `app.css` flips a band
     by renaming `--bg`, `--ink`, `--s1` and the rest, and a component that named a colour of its own
     would be the one thing on a flipped band still drawn for the page. The two hues it uses,
     `--info` for the agent and `--earn` for the acceptance, are only ever strokes and rings, never
     text, because neither is solved as a text colour against a flipped ground. */
  .decide {
    --face: 28px;

    margin: 0;
    inline-size: 100%;
  }

  .label {
    margin-block-end: var(--sp-3);
    padding-inline: var(--sp-1);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  /* TWO COLUMNS AT A DESK, the proposal on the left and the history it writes to on the right, so
     the eye goes the way the change does. They stack on a phone, below. */
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: start;
    gap: var(--sp-5);
  }

  .flow {
    display: grid;
    gap: var(--sp-3);
  }

  .actor {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    min-inline-size: 0;
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--face);
    block-size: var(--face);
    background: var(--s1);
    border: 2px solid var(--hue, var(--line));
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .agent {
    --hue: var(--info);
  }

  .person {
    --hue: var(--earn);
  }

  .name {
    color: var(--ink2);
    font-size: var(--t-sm);
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
    background: var(--dim);
    border-radius: var(--r-pill);
  }

  .card {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  /* THE CHANGE IS DRAWN THE WAY A DIFF DRAWS AN ADDED LINE, a bar and the words, because that is
     what it is: something the agent wants to add to the record and has not been allowed to yet. */
  .change {
    display: flex;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .plus {
    flex: none;
    inline-size: 3px;
    background: var(--info);
    border-radius: var(--r-pill);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
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
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill);
    font-size: var(--t-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  /* DRAWN IN INK, as the product's primary actions are (`loop/DIRECTION.md` §19: primary actions in
     ink, the accent spent rarely). `.btn-primary` in `app.css` is the same pair. */
  .verb {
    background: var(--ink);
    color: var(--bg);
    visibility: hidden;
  }

  .stamp {
    color: var(--ink);
  }

  .tick {
    inline-size: var(--icon-s);
    block-size: var(--icon-s);
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

  .history {
    display: grid;
    margin: 0;
    padding: var(--sp-1);
    list-style: none;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    padding-inline: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
    border-radius: var(--r-sm);
  }

  .row:last-child {
    border-block-end-color: transparent;
  }

  .who {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .what {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  /* THE LANDING ROW, washed, and its quiet cell stepped up to `--ink2`. `Ledger.svelte` measured why:
     `--dim` on `--s1` under the 6 per cent wash is 4.19:1 on the dark scheme's flipped band, under the
     4.5 floor, and `--ink2` there is 6.18:1. This row sits on the same two surfaces. */
  .landing {
    background: var(--hover-wash);
    box-shadow: inset 3px 0 0 var(--info);
  }

  .landing .when {
    color: var(--ink2);
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
    transform: translateY(var(--sp-2));
  }

  /* ── Only when motion is welcome ──────────────────────────────────── */

  @media (prefers-reduced-motion: no-preference) {
    .card,
    .landing {
      transition:
        opacity var(--d-enter) var(--ease-spring),
        transform var(--d-enter) var(--ease-spring);
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

    /* THE DOTS ONLY MOVE WHILE THEY ARE SHOWN. An infinite animation on an invisible element is
       still a compositor frame every tick, for the whole life of the page. */
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

  /* ── The phone: the proposal over the history ─────────────────────── */

  /* RANGE SYNTAX, TO MATCH THE PAGE. `+page.svelte` breaks its grid at `width < 640px`, and
     `Ledger.svelte` found that `max-width: 640px` disagreed with it at exactly 640. */
  @media (width < 640px) {
    .stage {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
    }

    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'who when'
        'what what';
      gap: var(--sp-1) var(--sp-2);
      padding-block: var(--sp-2);
    }

    .who {
      grid-area: who;
    }

    .what {
      grid-area: what;
      white-space: normal;
    }

    .when {
      grid-area: when;
    }
  }
</style>
