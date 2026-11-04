<!--
  YOUR BRAINDOG, FORMING beside the conversation (1 Nov, "add satisfying animations the way your braindog forms and
  evolves"): one tile of rows, Today first, then each part the answers turned on, in the order they were heard.

  EACH ROW SAYS WHY IT IS THERE in a few words: the part of the answer it came from ("from: a freelance designer in
  Cairo"), or what needs it, or that the person added it. Under a part, the entries the words filled ("Fenwick, a
  client"). A row can be taken out before anything is made (`onremove`), and what was taken out is one quiet line with
  Put back (`onrestore`), so nothing is lost by a wrong press.

  IT SETTLES IN: a row that arrives rises in on `$lib/motion`'s `arrive`, the rows that came with it one after another
  (35 apart, three at most, under 150ms in all), and holds the arrival wash for a second and a half; the rest make room
  on the spring (`animate:flip`). A row taken out fades where it stood (`leave`). Under reduced motion each is a short fade.

  BEFORE A WORD (`ghost`), the four places a BrainDog usually has, greyed, so the tile is a picture from the first second,
  rising in one after another as the screen opens (`data-forming`). THE GREYED ROWS AND THE PARTS ARE ONE LIST (skills
  pass, 2 Nov): the first answer used to swap the whole list at once, so the moment the BrainDog first formed was a cut.
  Now a greyed place the answer turned on moves to its place and comes up to full ink (`--form-in`), the ones it did not
  sink away, and the parts it added rise in under them. An entry the words fill later (a client named in a second
  answer) rises into its part the same way, and the tile settles when it takes its name.

  NOT A LIVE REGION: the conversation says what each answer added, once.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { arrive, depart, settleOn, springy } from '$lib/motion';
  import Icon from '$lib/ui/Icon.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import type { TransitionConfig } from 'svelte/transition';
  import { clauseOf } from '$lib/start/chat.ts';
  import type { Part as PartOf } from './building.ts';

  let {
    parts,
    left = [],
    said,
    title = null,
    ghost = false,
    settled = false,
    bare = false,
    busy = false,
    pages = null,
    locale,
    onremove,
    onrestore,
  }: {
    /** The parts that will be made, in the order they were heard (`stepsOf`). */
    parts: readonly PartOf[];
    /** The parts not on (taken out, or never heard), each one press from being on. */
    left?: readonly { id: string; name: string }[];
    /** Everything said so far, for the words each part came from. */
    said: string;
    /** What the record will be called, where a name was heard. */
    title?: string | null;
    /** Nothing said yet: the usual places, greyed. */
    ghost?: boolean;
    /** The talk is over (sign-up's keep step): it no longer says it is forming. */
    settled?: boolean;
    /** In the phone's sheet (`FormingStrip`), whose head already says its name: the rows on the sheet, no tile round them. */
    bare?: boolean;
    busy?: boolean;
    /** How many pages it will draw, said once at the foot, or `null`. */
    pages?: number | null;
    locale: string;
    /** Take a part out, or `null` where it cannot be (something needs it). */
    onremove?: ((part: PartOf) => void) | undefined;
    onrestore?: ((id: string) => void) | undefined;
  } = $props();

  const words = {
    title: 'Your BrainDog',
    /* SAID ONCE, IN THE HEAD (UI pass, 3 Nov): each greyed row said "fills in as we talk" under its name, three times. */
    forming: 'Forms as we talk',
    today: 'Today',
    todayWhy: 'where each day starts',
    from: 'from',
    needs: (who: string) => `needed by ${who}`,
    byHand: 'added by you',
    takeOut: (name: string) => `Take ${name} out`,
    left: 'Can also keep:',
    putBack: (name: string) => `Put ${name} back`,
    pages: (n: number) => (n === 1 ? 'One page, drawn from what you said.' : `${n} pages, drawn from what you said.`),
  };

  const GHOSTS: readonly { id: string; name: string; icon: IconName }[] = [
    { id: 'money-core', name: 'Money', icon: 'money' },
    { id: 'people', name: 'People', icon: 'people' },
    { id: 'portfolio', name: 'Projects', icon: 'projects' },
  ];

  /* ONE LIST, GREYED OR HEARD, keyed by the part's id, so a greyed place the first answer turns on is the same row. */
  type Row = { key: string; ghost: true; name: string; icon: IconName } | { key: string; ghost: false; part: PartOf };
  const rows = $derived<Row[]>(ghost ? GHOSTS.map((g) => ({ key: g.id, ghost: true, name: g.name, icon: g.icon })) : parts.map((p) => ({ key: p.id, ghost: false, part: p })));

  /**
   * A ROW LEAVING, BY ITS OPACITY ALONE. While it fades Svelte lifts it out of the list (`animate:flip` holds it where it
   * stood with a `translate` of its own), and `depart`'s sink wrote `transform` over that, so a row taken out jumped to
   * the top of the tile, over Today, for as long as it faded. Its timing and curve are `depart`'s.
   */
  const leave = (node: Element): TransitionConfig => ({ ...depart(node), css: (t: number) => `opacity:${t}` });

  /** Why a part is here, in a few words. */
  function why(p: PartOf): { lead: string; words: string } | null {
    /* MADE, BUT ON THE SIDE ONLY ONCE IT HOLDS SOMETHING (`Part.waits`): said so, never as a place made now. */
    if (p.waits) return { lead: '', words: p.waits };
    if (p.why.length > 0) return { lead: words.from, words: clauseOf(said, p.why[0] ?? '') };
    if (p.held) return { lead: '', words: words.needs(p.held) };
    if (p.state === 'hand') return { lead: '', words: words.byHand };
    return null;
  }

  /* WHAT JUST ARRIVED, in the order it came, for the stagger and the wash. The first drawing is not an arrival. */
  let fresh = $state.raw<string[]>([]);
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = parts.map((p) => p.id);
    const was = seen;
    seen = new Set(now);
    if (was === null) return;
    const came = now.filter((id) => !was.has(id));
    if (came.length === 0) return;
    fresh = came;
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = []), 1500);
  });
  $effect(() => () => clearTimeout(fading));

  /** 35ms apart, three at most: a batch is in within 150ms. */
  const delayOf = (id: string): number => Math.min(Math.max(0, fresh.indexOf(id)), 3) * 35;

  function day(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
    } catch {
      return iso;
    }
  }
</script>

{#if bare}
  <div class="bare">{@render body()}</div>
{:else}
  <Tile icon="home" title={title ?? words.title} meta={settled ? undefined : words.forming} data-build {@attach settleOn(title)}>
    {@render body()}
  </Tile>
{/if}

{#snippet body()}
  <ol class="places">
    <li class="place" data-forming="today">
      <span class="well"><Icon name="sun" size="m" /></span>
      <span class="main">
        <span class="name">{words.today}</span>
        <span class="why">{words.todayWhy}</span>
      </span>
    </li>
    {#each rows as r (r.key)}
      <!-- ONE ELEMENT FOR THE ROW WHETHER GREYED OR HEARD: a greyed place the answer turns on keeps its element and comes
           up to full ink, rather than being thrown away and drawn again. -->
      <li
        class="place"
        data-ghost={r.ghost ? '' : undefined}
        data-forming={r.ghost ? 'ghost' : undefined}
        data-arrived={!r.ghost && fresh.includes(r.key) ? '' : undefined}
        in:arrive={{ delay: delayOf(r.key), rise: 8 }}
        out:leave
        animate:flip={springy()}
      >
        {#if r.ghost}
          <span class="well"><Icon name={r.icon} size="m" /></span>
          <span class="main">
            <span class="name">{r.name}</span>
          </span>
        {:else}
          {@const p = r.part}
          {@const w = why(p)}
          <span class="well"><Icon name={p.icon} size="m" /></span>
          <span class="main">
            <span class="name">{p.name}</span>
            {#if w}<span class="why">{#if w.lead}<span class="lead">{w.lead}:</span>{' '}{/if}{w.words}</span>{/if}
            {#if p.entries.length > 0}
              <ul class="entries">
                {#each p.entries as e (e.key)}
                  <li class="entry" in:arrive={{ rise: 4, from: 1 }}>
                    <span class="entry-main">{e.title}{#if e.detail}<span class="entry-detail">, {e.detail.toLowerCase()}{#if e.due}, {day(e.due)}{/if}</span>{/if}</span>
                    {#if e.amount}<span class="num"><Money minor={e.amount.minor} currency={e.amount.currency} home={e.amount.currency} /></span>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </span>
          {#if onremove && !p.held}
            <button type="button" class="out" disabled={busy} aria-label={words.takeOut(p.name)} title={words.takeOut(p.name)} onclick={() => onremove?.(p)}>
              <Icon name="close" size="s" />
            </button>
          {/if}
        {/if}
      </li>
    {/each}
  </ol>
  {#if left.length > 0 && onrestore}
    <p class="left" in:arrive={{ rise: 4, from: 1, delay: 120 }}>
      {words.left}
      {#each left as l, i (l.id)}
        <button type="button" class="back" disabled={busy} aria-label={words.putBack(l.name)} onclick={() => onrestore?.(l.id)}>{l.name}<Icon name="plus" size="s" /></button>{i < left.length - 1 ? ' ' : ''}
      {/each}
    </p>
  {/if}
  {#if pages !== null && pages > 0}<p class="pages" in:arrive={{ rise: 4, from: 1, delay: 160 }}>{words.pages(pages)}</p>{/if}
{/snippet}

<style>
  .bare {
    display: grid;
    min-inline-size: 0;
  }

  .places {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW: a 32px well, the name and why, and the quiet ✕ at the end. Told apart by air, never a rule (ops: no hairline
     between rows anywhere). */
  .place {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-2);
    margin-inline: calc(-1 * var(--sp-2));
    border-radius: var(--r-ctl);
    transition: background-color 1500ms var(--ease-out);
  }

  .place[data-arrived] {
    background: var(--arrived);
    transition: none;
  }

  /* A GREYED PLACE COMING UP TO FULL INK: its name's colour and its well, where it stands. */
  .name,
  .well {
    transition:
      color var(--form-in) var(--ease-out),
      opacity var(--form-in) var(--ease-out);
  }

  /* GREYED UNTIL HEARD, IN THE QUIET INK, NOT SEE-THROUGH: at 45% opacity the name read at 3:1 and its line at 1.9:1
     (axe, skills pass 2 Nov). The words take `--ink-3` (4.5:1 on the tile) and the well fades back; a place the answer
     turns on comes up to full ink over `--form-in` where it stands. */
  .place[data-ghost] .name {
    color: var(--ink-3);
  }

  .place[data-ghost] .well {
    opacity: 0.5;
  }

  .well {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-pill);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .main {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
    padding-block-start: 1px;
  }

  /* A GREYED ROW HAS NO SECOND LINE, so its name sits on the well's middle (32 well, 20 line: 6 down). */
  .name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lead-ui);
  }

  .place[data-ghost] .main {
    padding-block-start: calc(6px * var(--dense, 1));
  }

  .why {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  .lead {
    color: var(--ink-2);
  }

  .entries {
    display: grid;
    gap: 2px;
    margin: var(--sp-1) 0 0;
    padding: 0;
    list-style: none;
  }

  .entry {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  .entry-detail {
    color: var(--ink-3);
  }

  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* TAKE IT OUT: quiet until the pointer or the focus is on its row, always there under a thumb. */
  .out {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border: 0;
    border-radius: var(--r-pill);
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  @media (hover: hover) {
    .out:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .out {
      opacity: 0;
    }

    .place:hover .out,
    .out:focus-visible {
      opacity: 1;
    }
  }

  @media (pointer: coarse) {
    .out {
      inline-size: 44px;
      block-size: 44px;
      margin: -6px -6px -6px 0;
    }
  }

  .left,
  .pages {
    margin: var(--sp-3) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE PARTS IT CAN ALSO KEEP WRAP AS CAPSULES, 6 apart, never a 28px chip riding a 20px line of text. */
  .left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-block-size: 28px;
    padding: 0 10px 0 var(--sp-3);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pill);
    background: var(--tile);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  /* UNDER A THUMB, PUT BACK IS AS TALL AS THE ANSWERS TO TAP BESIDE IT (44, Look B's phone target). After the rule
     above, which it overrides. */
  @media (pointer: coarse) {
    .back {
      min-block-size: 36px;
    }
  }

  @media (hover: hover) {
    .back:hover {
      color: var(--ink);
      border-color: var(--ink-3);
    }
  }
</style>
