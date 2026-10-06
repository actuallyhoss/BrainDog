<!--
  A list of people, grouped by the organisation each is with (`people.ts` `foldPeople`).

  WHO YOU WERE IN TOUCH WITH LAST COMES FIRST, under four quiet headings of how long ago, and an organisation is one line
  where its most recent person stands: its name, how many people, when. That person is drawn under it and the rest are
  folded below them, a press away, so twenty-four colleagues of one company read as one group and not as a page of
  faces. An organisation with one person here is not a group: that person is a line of their own that names it.

  ON THE GROUND, NO BOX: the rows are `rows.css`'s ledger, each a link to its row's page, the person a face and the
  organisation its list's own glyph. Nothing here is an id: an organisation the record has not named yet is said as one.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { display, iconFor } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { foldPeople, folds, orgFieldOf, roleFieldOf, seenWords, type Member } from '../people.ts';
  import { daySaid, localDay } from '../[seq]/said.ts';

  let {
    register,
    decl,
    entries,
    now,
    names,
    more,
  }: {
    register: string;
    decl: RegisterDecl;
    /** The rows to draw, already cut to `DOM_CAP` by the page. */
    entries: readonly Entry[];
    now: number;
    names: Names | undefined;
    /** There may be another page, so the list ends in a sentinel the page's observer watches. */
    more: boolean;
  } = $props();

  const bands = $derived(foldPeople(entries, decl, localDay(now)));
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
  /* WHAT A PERSON IS AND, OUTSIDE A GROUP, WHERE: "Contractor at Encore". Inside its group the organisation is the heading,
     and one the record has not named yet is left unsaid rather than said as "At an organisation with no name yet". */
  const detailOf = (m: Member, at: number | null): string => {
    const r = roleOf(m.entry);
    const r1 = r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
    const where = at === null ? '' : namedOrg(at);
    if (!where) return r1;
    return r1 ? seenWords.roleAt(r1, where) : seenWords.at(where);
  };
  const when = (day: string | null): string => (day ? daySaid(day, now) : '');
</script>

{#snippet person(m: Member, at_: number | null)}
  {@const name = nameOf(m.entry)}
  {@const detail = detailOf(m, at_)}
  <a class="line line-tall" href={at(`/r/${register}/${m.entry.seq}`)}>
    <span class="line-mark"><Face {name} kind="person" you={m.self} size="m" /></span>
    <span class="line-main">
      <span class="line-title" dir="auto">{name}{#if m.self}<span class="you">{seenWords.you}</span>{/if}</span>
      {#if detail}<span class="line-detail">{detail}</span>{/if}
    </span>
    <span></span>
    <span class="line-when">{when(m.day)}</span>
  </a>
{/snippet}

<div class="people">
  {#each bands as b (b.band)}
    <section class="band" aria-labelledby="band-{b.band}">
      <h2 class="band-head" id="band-{b.band}">{seenWords.bands[b.band]}</h2>
      <ul class="ledger ledger-lead">
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
                  <li>{@render person(m, null)}</li>
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
</div>

<!-- A SENTINEL MEANS "THERE MAY BE MORE", as it does under the cards: the page's observer asks for the next page. -->
{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  /* THE BANDS, 32 APART, each a quiet heading over its rows. The page's own gutter is the list's edge. */
  .people {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  .band-head {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  /* A GROUP'S PEOPLE SIT UNDER ITS NAME, indented to the name's edge so the organisation reads as their heading. */
  .members {
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
  }

  /* "YOU" IS A QUIET WORD AFTER THE NAME, no pill: the face is already the ink disc that says it. */
  .you {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  /* "23 MORE": a quiet word under the group, at the people's edge, and never a button that looks like a primary. */
  .fold {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-start: calc(var(--well-l) + var(--sp-3));
    padding: var(--sp-1) var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .fold:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  @media (width < 640px) {
    .members {
      margin-inline-start: var(--sp-4);
    }

    .fold {
      margin-inline-start: var(--sp-4);
    }
  }
</style>
