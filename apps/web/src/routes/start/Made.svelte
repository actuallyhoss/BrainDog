<!--
  The end of the first run, and the first of the five minutes: the BrainDog is made, and the person is shown what to do
  first, in the app, and then, for whoever uses one, how to connect an AI app.

  TODAY LEADS, THE AGENT IS SECOND (first hour audit, E3). The screen opened on "Connect your agent" with Claude Code's
  `curl` install chosen and a small "Skip for now" at its foot, for a bakery, while the site says connecting an AI tool
  is optional and nobody needs to be technical. Now the first tile says what was made and the one thing to do on Today,
  with "Go to Today" as the press; the second tile, under it, is the connect step for people who want it.

  ONE APP AT A TIME (first F1), in the second tile. A segmented control of the five apps, Claude first and chosen,
  each with its maker's mark; under it that app's steps only, numbered where there are two, each step's command or
  address in its own block with its own Copy (`CodeLine`). Under them the live sign: "Waiting for your agent…" beside a
  grey dot until the record hears its first session, then "Connected: Claude Code on MacBook" beside a green one. It asks
  the way the connect sheet does (`listenFor`, `poll`, every two seconds while the tab is shown), and stops asking once
  it has heard. One column of tiles at most 720 wide on a narrow window; two columns across a wide one.

  `.cmd`, NEVER `.line`: the ledger's global `.line` (`rows.css`) is a four-column grid, and it broke every command
  into a 120px column with its Copy a whole window away.

  NO KEY IS SHOWN: an MCP app signs in by OAuth and `braindog setup` signs in itself.

  `addons` are the add-ons a trade in the sentence named ("I rent out six flats" is Landlord, `tradeAddons` in
  `lib/start/offer.ts`): offered by name in a tile of their own under Today's, each a link to its page in the store,
  where it is installed only if the person presses Install (AH8, his call; FB5). The sentence installs none of them.

  `modules` (`made.modules`) is what was just made; nothing here reads it, and the prop stays so `/start`'s call is unchanged.
  `places` are the names of the places made, said in one line over the first step, so the screen first says what
  was built. Claude comes first and chosen at every width (AH25), and a command breaks only at its spaces (`CodeLine`
  `words`).
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { focusWhenDrawn } from '$lib/ui/keep-focus.ts';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { markOf } from '@braindog/skin/agent-marks.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { heardOf, poll, type Heard } from '$lib/agents/connect.ts';
  import { appLines, firstWords, signOf, type AppLine } from '$lib/agents/first-connect.ts';
  import { listenFor } from '$lib/agents/listen.ts';
  import { INSTALL_LINES, osOf } from '$lib/device.ts';
  import { connectLines } from '$lib/record/device.ts';
  import { step } from '$lib/funnel.ts';
  import Button from '$lib/ui/Button.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Swap from '$lib/motion/Swap.svelte';
  import { arrive, settleOn } from '$lib/motion';
  import type { TradeOffer } from '$lib/start/offer.ts';
  import type { SaidMade } from '$lib/start/made.ts';
  import { beginDrafts, draftsFor, firstDrafts } from '$lib/start/first-drafts.svelte.ts';
  import { recordToday } from '$lib/record/zone.ts';
  import { currencyGuessed } from '$lib/start/place-currency.ts';
  import { afterNavigate, goto } from '$app/navigation';

  let made: {
    modules?: readonly string[] | null | undefined;
    places?: readonly string[] | null | undefined;
    addons?: readonly TradeOffer[] | undefined;
    /** The words the BrainDog was made from and what they built: read once more by the model, for drafts on Today. */
    said?: SaidMade | null | undefined;
    /** The AI tools the person named in the conversation ("Claude", "Cursor"): the first one this screen connects is chosen. */
    tools?: readonly string[] | undefined;
  } = $props();

  /* This screen's own words for the connect steps; the titles are `firstWords`. */
  const words = {
    apps: 'Your app',
    install: 'Install BrainDog',
    connect: 'Connect this BrainDog',
    /* THE ADD-ONS A TRADE NAMED, offered and never added. */
    addonsTitle: (n: number) => (n === 1 ? 'A plugin for what you do' : 'Plugins for what you do'),
    addonsSub: 'Nothing is added until you install it.',
    seeAddon: (title: string) => `See ${title}`,
    /* WHAT `braindog setup` DOES NEXT, so the link and the six digits it prints are expected and not a surprise. */
    approve: 'It prints a link and six digits. Open the link, type the digits, and the terminal carries on.',
    /* THE MODEL READING THE WORDS ONCE MORE (1 Nov), and what it found: nothing is added, it waits on Today. */
    drafting: 'Reading what you wrote once more for anything else to keep.',
    drafted: (n: number) => (n === 1 ? 'One more thing from what you wrote waits on Today for your yes.' : `${n} more things from what you wrote wait on Today for your yes.`),
  } as const;

  /* THE MODEL READS THE WORDS ONCE MORE, AS THE OWNER NOW (1 Nov): begun here, drawn on Today as drafts. Nothing waits
     on it; a host with no model says nothing. */
  onMount(() => {
    const base = apiBase();
    draftsFor(base);
    /* TODAY'S CARD AND TELL'S READER, FETCHED NOW, so the drafts draw with Today and do not push it down a beat later. */
    void import('$lib/start/FirstDrafts.svelte').catch(() => undefined);
    void import('$lib/tell/read.ts').catch(() => undefined);
    const s = made.said;
    const boot = page.data.live === true ? page.data.index : null;
    if (!s || !boot) return;
    /* EVERY LIST THE NEW BRAINDOG DECLARES (audit AP1): `index.registers` is the rail's, only the lists that hold
       something, which on a BrainDog a moment old is People and little else, so the model was offered People alone.
       `lists` is every list `boot` declared; and the modules just installed here, where this screen's shell is the one
       from before the build. */
    const declared = (page.data.lists ?? []).filter((l: { kernel?: true }) => l.kernel !== true).map((l: { id: string }) => l.id);
    const held = (boot.registers ?? []).map((r: { id: string }) => r.id);
    void import('$lib/start/lists.ts')
      .then(({ listsOf }) => (made.modules ?? []).flatMap((m) => listsOf(m).map((l) => l.id)))
      .catch(() => [] as string[])
      .then((installed) =>
        beginDrafts({
          base,
          said: s.said,
          built: s.built,
          kind: s.kind ?? null,
          registers: [...new Set([...declared, ...held, ...installed])],
          /* AND THE ONE SIGN-UP SAID, where the record keeps none of its own (AP9). */
          currency: boot.currency ?? boot.record?.currency ?? currencyGuessed(base),
          me: boot.me?.name ?? null,
          today: recordToday(),
        }),
      );
  });
  const drafting = $derived(firstDrafts.now !== null && firstDrafts.now.base === apiBase() ? firstDrafts.now : null);
  /*
   * WHAT WAITS ON TODAY, COUNTED AS TODAY WILL DRAW IT: Tell's own reading of the words on this device, read against the
   * modules' lists, merged with what the model found (`mergeDrafts`), so "It found 3" is the card's three, never just the
   * model's. Worked out once the model has answered, or at once where there is none.
   */
  let waiting = $state<number | null>(null);
  $effect(() => {
    const k = drafting;
    const boot = page.data.live === true ? page.data.index : null;
    if (k === null || k.state === 'reading' || boot === null) return;
    let gone = false;
    void Promise.all([import('$lib/start/first-drafts.ts'), import('$lib/tell/read.ts')]).then(([d, { tellRead }]) => {
      if (gone) return;
      const today = k.begin.today;
      const lists = d.tellListsOf(d.modulesHeld(k.begin.registers), today);
      const opts = { lists, today, currency: k.begin.currency, me: k.begin.me };
      const device = d.draftsFromTold(
        d.clausesOf(k.begin.said).map((c) => ({ said: c.said, told: tellRead(c.text, opts) })),
        lists,
        { built: k.begin.built, me: k.begin.me, today, currency: k.begin.currency },
      );
      waiting = d.mergeDrafts(k.drafts, device).filter((x) => !k.gone.includes(x.key)).length;
    });
    return () => (gone = true);
  });
  /** The line under the lede while the words are read and once something waits; empty, and its place held, otherwise. */
  const draftLine = $derived(drafting === null ? null : drafting.state === 'reading' || waiting === null ? words.drafting : waiting > 0 ? words.drafted(waiting) : '');

  /* ENTER GOES TO TODAY (1 Nov, keyboard first): from anywhere on the screen that is not a control of its own. */
  function enterToday(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('a, button, input, textarea, select, [contenteditable], [role="button"]')) return;
    e.preventDefault();
    void goto(at('/'));
  }

  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  onMount(() => {
    step('signed_up');
    step('saw_connect');
    void tick().then(() => heading?.focus());
  });
  /* AND AGAIN ONCE THE NAVIGATION HAS SETTLED (first-hour audit AH20): after the passkey the router put the focus back on
     the page after this mounted, so a keyboard started from the top. Only where it fell to the page. */
  afterNavigate(() => focusWhenDrawn(() => heading));

  /* THIS RECORD'S LINES: the bare host, and the record's own address where the shell names it. */
  const slug = $derived(page.data.live === true ? (page.data.index?.slug ?? null) : null);
  /* CLAUDE FIRST AT EVERY WIDTH (`appLines`, AH25): the apps with no terminal lead, the coding apps follow. */
  const apps = $derived(appLines(connectLines(page.url.origin, slug), INSTALL_LINES[osOf(typeof navigator === 'undefined' ? undefined : navigator)]));
  /* THE LISTS THIS BRAINDOG KEEPS, which the example on Today's line names (`firstWords.sub`). */
  /* AND BY THE PLACES JUST MADE, since the shell this screen opened on may be the one from before the build. */
  /* AND BY THE PARTS JUST INSTALLED, since a part that waits for its first entry (Work) is no place yet. */
  const lists = $derived([
    ...(page.data.live === true ? (page.data.index?.registers ?? []).map((r: { id: string }) => r.id) : []),
    ...(made.modules ?? []),
    ...(made.places ?? []).map((p) => p.trim().toLowerCase().replace(/\s+/gu, '_')),
  ]);

  /* CLAUDE FIRST AND CHOSEN. */
  let chosenId = $state<string | null>(null);
  /* OR THE FIRST APP THEY SAID THEY USE, where they named one in the conversation (1 Nov). */
  const named = $derived(apps.find((a) => (made.tools ?? []).some((t) => t.trim().toLowerCase() === a.name.toLowerCase()))?.id ?? null);
  const chosen = $derived(apps.find((a) => a.id === (chosenId ?? named)) ?? apps[0]);

  /** An app's steps: install, then connect, where it needs the command line first; else its one place to paste. */
  const stepsOf = (a: AppLine): { said: string; line: string }[] =>
    a.before !== null ? [{ said: words.install, line: a.before }, { said: words.connect, line: a.line }] : [{ said: a.what, line: a.line }];

  /* THE FUNNEL HEARS A COPY, which `CodeLine` does on its own: a press on any Copy in the steps counts once. */
  function countCopies(el: HTMLElement) {
    const on = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('button')) step('copied_line');
    };
    el.addEventListener('click', on);
    return () => el.removeEventListener('click', on);
  }

  let heard = $state<Heard[]>([]);
  const sign = $derived(signOf(heard));
  /* THE YES OR NO ALONE, which the poll hangs on: `signOf` makes a new object each time, and an effect over it ran
     again on every answer. A kept read answers from memory at once, so that loop never let the page paint. */
  const connected = $derived(sign.connected);

  /** The same calls, heard at the same times: a kept read's answer moves nothing. */
  const same = (a: readonly Heard[], b: readonly Heard[]): boolean =>
    a.length === b.length && a.every((h, i) => h.tile === b[i]?.tile && h.app === b[i]?.app && h.machine === b[i]?.machine && h.at === b[i]?.at);

  /* THE LIVE CHANNEL THE CONNECT SHEET USES, and no faster; it stops for good once an agent has been heard. */
  const listen = listenFor(createClient({ base: apiBase() }));
  let asking = false;
  async function ask() {
    if (asking) return;
    asking = true;
    const said = await listen(false);
    asking = false;
    if (!said) return;
    const next = heardOf(said.rows);
    if (same(next, heard)) return;
    heard = next;
    if (signOf(next).connected) step('agent_connected');
  }
  $effect(() => {
    if (connected) return;
    /* `untrack`, as the connect sheet asks: what an ask reads never starts the poll again. */
    return poll(() => untrack(() => void ask()));
  });
</script>

<svelte:window onkeydown={enterToday} />

<!-- THE TILES RISE ON THEIR OWN, never inside a wrapper rising too (AP12): two fades multiplied left the screen blank
     for the first quarter second. -->
<section class="made" aria-labelledby="made-h">
  <div class="made-lead">
  <div class="made-tile" data-forming="made-first">
    <header class="head">
      <!-- TITLE FIRST, ONE LINE UNDER IT (T40): "Your BrainDog is made, with …" over it was a third level before the press. -->
      <h1 class="entry-title" id="made-h" tabindex="-1" bind:this={heading}>{firstWords.title}</h1>
      <p class="entry-lede">{firstWords.sub(lists)}</p>
      <!-- NOTHING TO SAY IS NO LINE (AP11): the held line left a hole over Go to Today on the common screen. THE REGION
           IS THERE FROM THE FIRST DRAW, empty and out of the flow (`:empty`), so a screen reader hears the words when
           they come; one mounted with its words may never be read (skills pass, 2 Nov). The words hand over in place with
           a short rise. -->
      <p class="draft-line" role="status" data-forming="drafts-line" data-state={drafting?.state}>{#if draftLine}{#key draftLine}<span class="draft-words" in:arrive={{ rise: 4, from: 1 }}>{draftLine}</span>{/key}{/if}</p>
    </header>
    <div class="go">
      <Button weight="primary" href="/" kbd="↵">{firstWords.go}</Button>
    </div>
  </div>

  {#if (made.addons ?? []).length > 0}
    {@const addons = made.addons ?? []}
    <section class="made-tile" aria-labelledby="addons-h" data-forming="made-addons">
      <header class="head">
        <h2 class="agent-h" id="addons-h">{words.addonsTitle(addons.length)}</h2>
        <p class="agent-sub">{words.addonsSub}</p>
      </header>
      <ul class="addons">
        {#each addons as a (a.id)}
          <li class="addon">
            <div class="addon-said">
              <p class="addon-title">{a.title}</p>
              {#if a.summary}<p class="agent-sub">{a.summary}</p>{/if}
            </div>
            <Button href={`/plugins/${encodeURIComponent(a.id)}`}>{words.seeAddon(a.title)}</Button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  </div>

  <section class="made-tile agent" aria-labelledby="agent-h" data-forming="made-agent">
    <header class="head">
      <h2 class="agent-h" id="agent-h">{firstWords.agentTitle}</h2>
      <p class="agent-sub">{firstWords.agentSub}</p>
    </header>

    <Segmented full role="group" aria-label={words.apps}>
      {#each apps as a (a.id)}
        {@const m = markOf(a.mark)}
        {@const on = a.id === chosen?.id}
        <button type="button" class="segment" data-on={on ? '' : undefined} aria-pressed={on} onclick={() => (chosenId = a.id)}>
          <span class="seg-label"
            ><svg class="mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
              ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule} /></svg
            >{a.name}</span
          >
        </button>
      {/each}
    </Segmented>

    <!-- ONE APP'S STEPS HANDING OVER TO THE NEXT IN PLACE (skills pass, 2 Nov): the old fade out over `--d-exit`, the
         new up with a 4px rise over `--d-swap`, in one cell so the sign under them does not jump. -->
    <Swap key={chosen?.id}>
      {#if chosen}
        {@const steps = stepsOf(chosen)}
        <ol class="steps" data-numbered={steps.length > 1 ? '' : undefined} {@attach countCopies}>
          {#each steps as s, i (s.said)}
            <li class="cmd-step">
              <p class="cmd-said">
                {#if steps.length > 1}<span class="cmd-n" aria-hidden="true">{i + 1}</span>{/if}{s.said}
              </p>
              <div class="cmd"><CodeLine text={s.line} label={s.said} words /></div>
              {#if s.line.startsWith('braindog setup')}<p class="cmd-then">{words.approve}</p>{/if}
            </li>
          {/each}
        </ol>
      {/if}
    </Swap>

    <!-- CONNECTED SETTLES WHERE IT IS: the line gives a little and comes back on the spring the moment the agent is
         heard, once, never on the first draw. -->
    <p class="sign" role="status" data-on={sign.connected ? '' : undefined} {@attach settleOn(sign.connected)}><span class="dot" aria-hidden="true"></span>{sign.said}</p>
  </section>
</section>

<style>
  /* ONE COLUMN UP TO 1100, the tiles at most 720 on the frame's start edge; WIDER, TWO COLUMNS ACROSS THE FRAME (1 Nov, a
     live run: at 1568 both tiles sat in the left 40% and the rest of the window was empty). Today's step and the add-ons
     at the left, the connect step at the right, their tops level, across the same width the conversation and its build
     took on the screen before. */
  .made {
    display: grid;
    grid-template-columns: minmax(0, min(720px, 100%));
    align-items: start;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .made-lead {
    display: grid;
    align-content: start;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  @media (width >= 1100px) {
    .made {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    }
  }

  /* ONE TILE, THE WIDTH OF ITS COLUMN: 24 in, 20 on a phone. */
  .made-tile {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  @media (width < 640px) {
    .made-tile {
      padding: 20px;
    }
  }

  .head {
    display: grid;
    gap: var(--sp-2);
  }

  /* THE MODEL'S LINE (1 Nov): one line, while it reads and once something waits; none otherwise. */
  .draft-line {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    text-wrap: pretty;
  }

  /* EMPTY, OUT OF THE FLOW: no gap held over Go to Today, and the live region still there for its first words. */
  .draft-line:empty {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* A BOX, so the line's handover rise moves it (a transform does not move an inline run). */
  .draft-words {
    display: inline-block;
  }

  .draft-line[data-state='ready'] {
    color: var(--ink-2);
  }

  /* THE SECOND STEP READS AS ONE: a heading in the head size, under the page's title, never a second page title. */
  /* THE HEADING TAKES THE FOCUS SO A KEYBOARD STARTS HERE, AND WEARS NO RING (AP11): it is no control, and the ring drew
     a hard square box round the screen's title. */
  .entry-title[tabindex='-1']:focus {
    outline: none;
  }

  .agent-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
    text-wrap: balance;
  }

  .agent-sub {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    text-wrap: pretty;
  }

  /* THE ADD-ONS A TRADE NAMED: each its name and line, its press beside them, under them on a phone. */
  .addons {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .addon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .addon-said {
    display: grid;
    flex: 1 1 280px;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .addon-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(22px * var(--type, 1));
  }

  /* THE APP'S MARK BEFORE ITS NAME in the segment, 16 at the label's ink, or its maker's colour. */
  .seg-label {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .mark {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    fill: currentColor;
  }

  .mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .steps {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cmd-step {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .cmd-said {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: calc(22px * var(--type, 1));
  }

  /* THE STEP'S NUMBER in a 24 well of the quiet fill: a count of steps is not an alarm, so never red. */
  .cmd-n {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .cmd {
    min-inline-size: 0;
  }

  .cmd-then {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-wrap: pretty;
  }

  /* WAITING IN THE QUIET INK beside a grey dot; connected in ink beside the live green one. */
  .sign {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--ink-3);
    transition: background var(--d-state) var(--ease-out);
  }

  .sign[data-on] {
    color: var(--ink);
    font-weight: 600;
  }

  .sign[data-on] .dot {
    background: var(--live);
  }

  .go :global(.btn) {
    min-block-size: max(40px, var(--ctl-h));
  }

  @media (forced-colors: active) {
    .mark {
      fill: CanvasText;
    }
  }

  /* FIVE APPS ON A PHONE ARE ONE ROW THAT SCROLLS (UI pass 1 Nov), as a page's own tabs do: wrapped, they stood as three
     rows of two, two and one, Cursor alone and centred under them, which read as a grid of buttons and not one choice. */
  @media (width < 640px) {
    .agent :global(.segmented[data-full][data-wrap]) {
      flex-wrap: nowrap;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      padding-inline-end: var(--sp-4);
      mask-image: linear-gradient(to right, var(--ink) calc(100% - 24px), transparent);
    }

    .agent :global(.segmented[data-full][data-wrap]::-webkit-scrollbar) {
      display: none;
    }

    .agent :global(.segmented[data-full][data-wrap] > .segment) {
      flex: none;
    }
  }
</style>
