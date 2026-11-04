<!--
  A list of people, grouped by the organisation each is with (`people.ts` `foldPeople`).

  WHO YOU WERE IN TOUCH WITH LAST COMES FIRST, under four quiet headings of how long ago, and an organisation is one line
  where its most recent person stands: its name, how many people, when. That person is drawn under it and the rest are
  folded below them, a press away, so twenty-four colleagues of one company read as one group and not as a page of
  faces. An organisation with one person here is not a group: that person is a line of their own that names it.

  INSIDE THE LIST'S TILE, NO BOX OF THEIR OWN: the rows are `rows.css`'s ledger under quiet headings,
  each a link to its row's page, the person a face of their initials on one neutral tint (the name says who; a column
  of pastel hues said nothing) and the organisation its list's own glyph. Nothing here is an id: an organisation the
  record has not named yet is said as one.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import Swap from '$lib/motion/Swap.svelte';
  import { dismiss, lineIn, listMotion, springy } from '$lib/motion/index.ts';
  import { at } from '$lib/at.ts';
  import { display, iconFor } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import { foldPeople, folds, lastDayOf, letterPeople, meetsOf, orgFieldOf, roleFieldOf, seenWords, type Member } from '../folk.ts';
  import { daySaid, localDay } from '../[seq]/said.ts';
  import { peopleOrder } from './people-order.svelte.ts';

  let {
    register,
    decl,
    entries,
    now,
    names,
    more,
    openCardMenu,
  }: {
    register: string;
    decl: RegisterDecl;
    /** The rows to draw, already cut to `DOM_CAP` by the page. */
    entries: readonly Entry[];
    now: number;
    names: Names | undefined;
    /** There may be another page, so the list ends in a sentinel the page's observer watches. */
    more: boolean;
    /** A person's row menu, the list's own, at the pointer where a right-click or a held thumb opened it. */
    openCardMenu?: ((seq: number, el: HTMLElement, point?: MenuAt) => void) | undefined;
  } = $props();

  /* RECENT OR A TO Z (29 October): by when you last spoke, which is what People is read for most days, or by name, for
     finding somebody you know by name. Chosen in the list's toolbar (`PeopleOrder.svelte`) and the phone's "⋯" Sort. */
  const order = $derived(peopleOrder.value);
  /* YOU ARE THE LIST'S FIRST ROW, MARKED You, AND IN NO GROUP (29 October): the record is yours, so you stand above the
     people you know rather than among them by when you last spoke, and no count of them includes you. */
  const selfPart = $derived(meetsOf(decl)?.self);
  const isYou = (e: Entry): boolean => Boolean(selfPart && e.fields[selfPart] === true);
  const you = $derived.by((): Member | null => {
    const m = meetsOf(decl);
    const e = entries.find(isYou);
    return m && e ? { entry: e, day: lastDayOf(e.fields, m), self: true } : null;
  });
  const others = $derived(entries.filter((e) => !isYou(e)));
  const bands = $derived(foldPeople(others, decl, localDay(now)));
  const letters = $derived(order === 'az' ? letterPeople(others, decl) : []);
  const org = $derived(orgFieldOf(decl));
  const role = $derived(roleFieldOf(decl));
  /* AN ORGANISATION'S GLYPH IS ITS LIST'S, and where that list declares none, this list's own: a group of its people. */
  const orgIcon = $derived(iconFor(org ? REGISTERS[org.to]?.icon : undefined, iconFor(decl.icon, 'rows')));

  /* THE GROUPS SOMEBODY OPENED, by organisation, for as long as they are on the list. */
  let open = $state<ReadonlySet<number>>(new Set());
  const toggle = (o: number) => {
    const next = new Set(open);
    if (next.has(o)) next.delete(o);
    else next.add(o);
    open = next;
  };

  const namedOrg = (o: number): string => (org ? names?.get(`${org.to}#${o}`)?.trim() : '') || '';
  const orgName = (o: number): string => namedOrg(o) || seenWords.unnamedOrg;
  const nameOf = (e: Entry): string => String(e.fields[decl.title] ?? '').trim();
  const roleOf = (e: Entry): string => (role ? (display(register, role, e.fields[role], now, names) ?? '') : '');
  /* WHAT A PERSON IS AND, OUTSIDE A GROUP, WHERE: "Contractor at Brightwell". Inside its group the organisation is the heading,
     and one the record has not named yet is left unsaid rather than said as "At an organisation with no name yet". */
  const detailOf = (m: Member, at: number | null): string => {
    const r = roleOf(m.entry);
    /* A ROLE OF "Other" SAYS NOTHING: "Nordhaven Registry", not "Other at Nordhaven Registry". */
    const other = role ? m.entry.fields[role] === 'other' : false;
    const r1 = r && !other ? r.charAt(0).toUpperCase() + r.slice(1) : '';
    const where = at === null ? '' : namedOrg(at);
    const what = !where ? r1 : r1 ? seenWords.roleAt(r1, where) : seenWords.at(where);
    /* AND WHO THEY ARE, IN THE NOTE'S FIRST SENTENCE (29 October): "Engineer on Otters.gg", "Family", where the line said
       nothing past the name for most people here. One line, cut by the row's width; the whole note is on their page. */
    const said = whoOf(m.entry);
    /* THE ORGANISATION ONCE (1 Nov, L5): "Client at Hart Street Grocer · Buys for Hart Street Grocer" said it twice, so
       a note that names the organisation the role line already names is left for their page. */
    const org_ = at === null ? '' : namedOrg(at);
    const first = org_.split(/\s+/u)[0] ?? '';
    const repeats = org_ !== '' && (said.toLowerCase().includes(org_.toLowerCase()) || (first.length >= 4 && said.toLowerCase().includes(first.toLowerCase())));
    return [what, repeats ? '' : said].filter(Boolean).join(' · ');
  };
  const noteField = $derived(decl.fields.find((f) => f.id === 'note' && !f.retired && (f.type === 'text' || f.type === 'document'))?.id ?? null);
  const whoOf = (e: Entry): string => {
    const raw = noteField ? e.fields[noteField] : null;
    if (typeof raw !== 'string') return '';
    const first = raw.split(/\n/u).map((l) => l.replace(/^[#>*\-\s]+/u, '').trim()).find(Boolean) ?? '';
    const sentence = /^(.+?[.!?])(?:\s|$)/u.exec(first)?.[1] ?? first;
    return sentence.replace(/[.]+$/u, '').replace(/\*\*/gu, '');
  };
  const when = (day: string | null): string => (day ? daySaid(day, now) : '');
  /* WHO A PERSON IS WITH, by the number their organisation part holds, for the A to Z list where nobody is grouped. */
  const orgOf = (m: Member): number | null => {
    const v = org ? m.entry.fields[org.field] : null;
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/u.test(v) ? Number(v) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };
</script>

{#snippet person(m: Member, at_: number | null)}
  {@const name = nameOf(m.entry)}
  {@const detail = detailOf(m, at_)}
  <a class="line line-tall" href={at(`/r/${register}/${m.entry.seq}`)} {@attach openCardMenu && ownMenu((p) => openCardMenu(m.entry.seq, document.body, p))}>
    <span class="line-mark"><Face {name} kind="person" you={m.self} size="m" /></span>
    <span class="line-main">
      <span class="line-title" dir="auto">{name}{#if m.self}<span class="you">{seenWords.you}</span>{/if}</span>
      {#if detail}<span class="line-detail">{detail}</span>{/if}
    </span>
    <span></span>
    <!-- YOUR OWN ROW SAYS NO DAY (3 Nov): "3 Nov" beside your own name read as the last day you were in touch with yourself. -->
    <span class="line-when">{m.self ? '' : when(m.day)}</span>
  </a>
{/snippet}

<div class="people">
  {#if you}
    <ul class="ledger ledger-lead">
      <li>{@render person(you, orgOf(you))}</li>
    </ul>
  {/if}
  <!-- RECENT AND A TO Z ARE TWO DIFFERENT LISTS (bands, then letters), so nobody can slide from one to the other: the old
       one fades out and the new one up in its place (`Swap`, skills pass 2 Nov), where they swapped in one frame. -->
  <Swap key={order}>
  <div class="bands">
  {#if order === 'az'}
    {#each letters as l (l.letter)}
      <section class="band" aria-labelledby="letter-{l.letter}">
        <h2 class="band-head" id="letter-{l.letter}">{l.letter}</h2>
        <ul class="ledger ledger-lead">
          {#each l.members as m (m.entry.seq)}
            <li in:lineIn out:dismiss animate:flip={springy()}>{@render person(m, orgOf(m))}</li>
          {/each}
        </ul>
      </section>
    {/each}
  {:else}
  {#each bands as b (b.band)}
    <section class="band" aria-labelledby="band-{b.band}">
      <h2 class="band-head" id="band-{b.band}">{seenWords.bands[b.band]}</h2>
      <!-- A PERSON OR AN ORGANISATION ARRIVING OR LEAVING HERE moves from the list (`listMotion`): each sits in an `{#if}`. -->
      <ul class="ledger ledger-lead" {@attach listMotion('li')}>
        {#each b.items as item (item.key)}
          {#if item.kind === 'person'}
            <li>{@render person(item.member, item.org)}</li>
          {:else}
            {@const name = orgName(item.org)}
            {@const folded = folds(item.members.length) && !open.has(item.org)}
            {@const shown = folded ? item.members.slice(0, 1) : item.members}
            <li class="group">
              <!-- THE ORGANISATION, WHICH OPENS ITS OWN PAGE: its people, its projects, its money. -->
              <a class="line line-tall" href={org ? at(`/r/${org.to}/${item.org}`) : undefined}>
                <span class="line-mark"><IconWell name={orgIcon} size="l" /></span>
                <span class="line-main">
                  <span class="line-title" dir="auto">{name}</span>
                  <span class="line-detail">{seenWords.people(item.members.length)}</span>
                </span>
                <span></span>
                <span class="line-when">{when(item.day)}</span>
              </a>
              <ul class="ledger ledger-lead members" aria-label={name}>
                {#each shown as m (m.entry.seq)}
                  <li in:lineIn out:dismiss animate:flip={springy()}>{@render person(m, null)}</li>
                {/each}
              </ul>
              {#if folds(item.members.length)}
                <button
                  type="button"
                  class="fold tap"
                  aria-expanded={!folded}
                  aria-label={folded ? seenWords.showAll(item.members.length, name) : seenWords.showFewer(name)}
                  onclick={() => toggle(item.org)}
                >
                  <Icon name={folded ? 'chevronDown' : 'arrowUp'} size="s" />
                  <span>{folded ? seenWords.moreAt(item.members.length - 1) : seenWords.fewer}</span>
                </button>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>
    </section>
  {/each}
  {/if}
  </div>
  </Swap>
</div>

<!-- A SENTINEL MEANS "THERE MAY BE MORE", as it does under the cards: the page's observer asks for the next page. -->
{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  /* THE BANDS, 24 APART, each a quiet heading over its rows. The tile's own padding is the list's edge. */
  /* A STEP OF AIR UNDER THE TOOLBAR, where Recent and A to Z stood as a row of their own (pages polish, 2 Nov). */
  .people {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding-block-start: var(--sp-2);
  }

  .bands {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* TWO COLUMNS OF THE SAME ROWS FROM 1280 (1 Nov, L7): a band was one 1100px column of 56px rows, a name at one end
     and its day 1000px away at the other. Each band's rows now fill two columns, read across; the hairline between rows
     is drawn from the second row of each column on, so the two columns' lines meet. */
  @media (width >= 1280px) {
    .band > .ledger {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--sp-6);
      align-items: start;
    }

    .band > .ledger > li:nth-child(2) > :global(.line::after) {
      display: none;
    }
  }

  .band-head {
    margin: 0 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* A PERSON'S FACE IS THEIR INITIAL ON ONE NEUTRAL TINT, on every row; you keep the ink disc that says it is you. */
  .people :global(.line-mark .face[data-kind='person']) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  /* A GROUP'S PEOPLE SIT UNDER ITS NAME, indented to the name's edge so the organisation reads as their heading. */
  .members {
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
  }

  /* WHO SOMEBODY IS STAYS ONE LINE, so every person is a row of the same height and the list scans down the names. */
  .people :global(.line-tall .line-detail) {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  /* "YOU" IS A QUIET WORD AFTER THE NAME, no pill: the face is already the ink disc that says it. */
  .you {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  /* "23 MORE": a quiet word under the group, at the people's edge, and never a button that looks like a primary. */
  .fold {
    display: inline-flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
    min-block-size: var(--btn-h-sm, 28px);
    padding: 0 var(--ctl-pad-sm, 12px);
    background: none;
    border: 0;
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .fold:hover {
      background: var(--row-wash, var(--hover));
      color: var(--ink);
    }
  }

  @media (width < 640px) {
    /* A PERSON'S DATE ENDS THEIR FIRST LINE, beside the name, as it does at 1440. The phone's card rule (`rows.css`) sends
       a date to a third line under an amount, and a person has no amount, so "2 Sep" stood alone on a line of its own.
       The empty column a wide row keeps for an amount has nothing to hold here. */
    .people :global(.line-when) {
      grid-column: 3;
      grid-row: 1;
    }

    .people :global(.line > span:empty) {
      display: none;
    }

    .members {
      margin-inline-start: var(--sp-4);
    }

    .fold {
      margin-inline-start: var(--sp-4);
    }
  }
</style>
