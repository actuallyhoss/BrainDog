<!--
  The BrainDog building beside the words, before there is an account: sign-up's half of describe-then-build (use case 6,
  step 2).

  ONE TILE, HEADED BY WHAT THE RECORD WILL BE CALLED (`Proposal.title`, "Mariam's Candles"), or "Your BrainDog" before a
  name is heard. Under it the places it will have, Today first, each with its own glyph (`placeIcon`) and empty: the
  only things drawn in a place are the entries the person's own sentence filled. No count, no bar, no "N of M", and no
  part that is off: a part left off is not a step behind. What each phrase became is said beside the words, on
  the sign-up page itself, so it is not said twice here.

  NOT A LIVE REGION WHILE TYPING, or a screen reader would be told on every key: the places are a plain list, read when
  the person goes looking.

  WHAT JUST CAME ON takes the arrival tint for a second and a half, as on /start.

  WHO READ IT IS SAID UNDER THE PLACES (`readBy`): where the reading is the rules', for any cause (no model on
  this host, no press yet, a refusal, a silence), one quiet line says so, and where the month's asks are spent it says
  that instead (`firstRun.readByRules`). A model's reading says nothing more, and neither does a screen with no reading.

  `settled` FROM THE KEEP STEP ON (first F9): the words are no longer being typed, so neither "builds as you type" nor
  the line inviting her to tell it more is true, and both go.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { firstRun } from '$lib/first-run.ts';
  import { railPlaces, waitsForFirst, type Place, type Proposal } from '$lib/start/propose.ts';
  import { placeIcon, placesFrom, words, type Part as PartOf } from './building.ts';

  let {
    parts,
    title = null,
    places,
    locale,
    readBy = null,
    meta = words.asYouType,
    empty = words.startsEmpty,
    settled = false,
  }: {
    /** The parts as read (`partsOf`): only the entries the sentence filled are read off them, under their place. */
    parts: readonly PartOf[];
    /** What the record is called, from what was heard, or `null` before a name. */
    title?: string | null | undefined;
    /** Where things will be kept, Today first (`Proposal.places`). Absent, Today and each part that is on. */
    places?: readonly Place[] | undefined;
    locale: string;
    /** Who read the words (`Proposal.by`, and `fell` where a model was asked and the rules answered), or `null` before a reading. */
    readBy?: Pick<Proposal, 'by' | 'fell'> | null | undefined;
    /** The tile's line beside its title: 'builds as you type' on the start page, the agent's word where one proposed it. */
    meta?: string | undefined;
    /** The line under the places before anything is in them. */
    empty?: string | undefined;
    /** The words are kept and no longer typed: the lines about typing and telling it more go. */
    settled?: boolean | undefined;
  } = $props();

  /** The line about the rules, where they read it: the month spent has its own, and any other cause the plain one. */
  const rulesLine = $derived(
    settled || readBy === null || readBy === undefined || (readBy.by !== undefined && readBy.by !== 'rules')
      ? null
      : readBy.fell === 'SLASH_BUDGET_SPENT'
        ? firstRun.readByRules
        : firstRun.readByRulesAny,
  );

  const entriesOf = (place: Place) => (place.kind === 'module' ? (parts.find((p) => p.on && p.id === place.id)?.entries ?? []) : []);
  /* THE PLACES AS THE RAIL WILL HOLD THEM (`railPlaces`, AM10): a part that waits for its first entry is drawn once the
     words fill it. */
  /* AND A PART THE WORDS NAMED, THOUGH NOTHING FILLS IT YET (1 Nov): What I heard said "my projects → Projects" while this
     left Projects out. It is drawn as forming, quieter, with when it reaches the sidebar, so the two agree and the rail
     still holds only what has something in it. */
  const named = (p: Place): boolean => p.phrase !== null && waitsForFirst(p);
  const shown = $derived(railPlaces(placesFrom(places, parts), (p) => entriesOf(p).length > 0 || named(p)));
  const forming = (p: Place): boolean => named(p) && entriesOf(p).length === 0;

  /** "1 Oct", in the person's own order of day and month. */
  function day(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
    } catch {
      return iso;
    }
  }

  let fresh = $state.raw<Set<string>>(new Set());
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = new Set(shown.map((p) => `${p.kind}:${p.id}`));
    const was = seen;
    seen = now;
    if (was === null) return;
    const came = [...now].filter((k) => !was.has(k));
    if (came.length === 0) return;
    fresh = new Set([...fresh, ...came]);
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = new Set()), 1500);
  });
  $effect(() => () => clearTimeout(fading));
</script>

<div class="building">
  <Tile icon="home" title={title ?? words.yours} meta={settled ? undefined : meta} data-build>
    <ol class="places">
      {#each shown as place (`${place.kind}:${place.id}`)}
        <li class="place" data-forming="place" data-place={place.id} data-waits={forming(place) ? '' : undefined} data-arrived={fresh.has(`${place.kind}:${place.id}`) ? '' : undefined}>
          <span class="place-head">
            <Icon name={placeIcon(place)} size="m" />
            <span class="place-name">{place.name}</span>
          </span>
          {#if forming(place)}<span class="waits">{words.forming}</span>{/if}
          {#each entriesOf(place) as e (e.key)}
            <span class="entry" data-forming="entry" data-entry={e.key}>
              <span class="entry-main">{e.title}<span class="entry-detail">, {e.detail.toLowerCase()}{#if e.due}, {words.due(day(e.due))}{/if}</span></span>
              {#if e.amount}<span class="num"><Money minor={e.amount.minor} currency={e.amount.currency} home={e.amount.currency} /></span>{/if}
            </span>
          {/each}
        </li>
      {/each}
    </ol>
    <p class="reading">{empty}</p>
    {#if rulesLine}<p class="reading" data-read-by="rules">{rulesLine}</p>{/if}
  </Tile>
</div>

<style>
  .building {
    display: grid;
    min-inline-size: 0;
  }

  /* THE PLACES, AS THE RAIL WILL HOLD THEM: Today first in the selection fill, the rest plain, each one line tall. */
  .places {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .place {
    display: grid;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: 8px;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    min-inline-size: 0;
  }

  /* THE ARRIVAL WASH FADES OVER A SECOND AND A HALF, the one long motion, and only for a reader who has not asked for less. */
  @media (prefers-reduced-motion: no-preference) {
    .place {
      transition: background-color 1500ms var(--ease-out);
    }
  }

  .place:first-child {
    background: var(--tile-2);
    color: var(--ink);
    font-weight: 500;
  }

  .place[data-arrived] {
    background: var(--arrived);
    transition: none;
  }

  .place-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .place-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A PLACE STILL FORMING: its name in the quiet ink, and when it reaches the sidebar under it. */
  .place[data-waits] {
    color: var(--ink-3);
  }

  .waits {
    padding-inline-start: calc(var(--icon-s) + var(--sp-3));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* AN ENTRY THE SENTENCE FILLED, under its place and in line with its name. */
  .entry {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    padding-inline-start: calc(var(--icon-s) + var(--sp-3));
    color: var(--ink);
    font-weight: 400;
    min-inline-size: 0;
  }

  .entry-main {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .entry-detail {
    color: var(--ink-3);
  }

  .num {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .reading {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }
</style>
