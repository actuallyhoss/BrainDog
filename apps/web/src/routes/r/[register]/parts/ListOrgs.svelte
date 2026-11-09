<!--
  A list of organisations, grouped by kind (`folk.ts` `foldOrgs`), with how many people are with each.

  SINCE 29 OCTOBER ("i dont understand why is there organizations under people (4) and organizations page, showing (17)").
  This list is the one place organisations are, and its count is the one the sidebar and People say. So nothing is
  hidden here: the companies, clients and vendors by kind, then the shops a card text named, then any put away, each
  group under a quiet heading with its count, so the groups add up to the number at the top.

  THE SAME LEDGER AS PEOPLE (`ListPeople.svelte`): rows without boxes, a square mark of the name's initial on one
  neutral tint (a thing, where a person is a circle), or its logo where it keeps one (People 4.8.0), the name, what it
  is and who is with it, and the last day it was seen. Each row opens its organisation's page.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { createClient } from '@braindog/client';
  import { display } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn, springy } from '$lib/motion/index.ts';
  import Face from '$lib/ui/Face.svelte';
  import { pictureOfRow } from '$lib/picture/picture.ts';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import { foldOrgs, orgFieldOf, orgNameSaid, orgRoleOf, orgsCounted, meetsOf, seenWords, type OrgGroup } from '../folk.ts';
  import { daySaid } from '../[seq]/said.ts';

  let {
    register,
    decl,
    entries,
    now,
    more,
    openCardMenu,
  }: {
    register: string;
    decl: RegisterDecl;
    entries: readonly Entry[];
    now: number;
    more: boolean;
    openCardMenu?: ((seq: number, el: HTMLElement, point?: MenuAt) => void) | undefined;
  } = $props();

  const role = $derived(orgRoleOf(decl));
  const groups = $derived(foldOrgs(entries, decl));
  /* THE SAME LINE PEOPLE SAYS: how many you work with, and how many are shops a card text named. */
  const counted = $derived(orgsCounted(groups));

  /* HOW MANY PEOPLE ARE WITH EACH, from the list of people whose organisation part points here, counted once by the
     record (`countBy`), people folded into another left out. A record whose people list is not learnt yet says none. */
  let people = $state<ReadonlyMap<number, number>>(new Map());
  $effect(() => {
    const here = register;
    const list = Object.entries(REGISTERS).find(([, d]) => orgFieldOf(d)?.to === here);
    if (!list) return;
    const [id, d] = list;
    const by = orgFieldOf(d)!.field;
    const merged = meetsOf(d)?.merged_into;
    let gone = false;
    void createClient({ base: apiBase() })
      .countBy({ register: id, by, ...(merged ? { where: { toJSON: () => `${merged} is empty` } } : {}) })
      .then((out) => {
        if (gone || !out.ok) return;
        const m = new Map<number, number>();
        for (const c of out.value.counts) {
          const n = typeof c.value === 'number' ? c.value : Number(c.value);
          if (Number.isInteger(n) && n > 0) m.set(n, c.n);
        }
        people = m;
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  });

  const nameOf = (e: Entry): string => orgNameSaid(String(e.fields[role?.name ?? decl.title] ?? e.fields[decl.title] ?? '').trim());
  const headOf = (g: OrgGroup): string => {
    if (g.rest === 'texts') return seenWords.fromTexts;
    if (g.rest === 'unsorted') return seenWords.noKind;
    if (g.rest === 'away') return seenWords.putAway;
    const label = role?.kind ? (display(register, role.kind, g.kind, now, undefined) ?? g.kind ?? '') : (g.kind ?? '');
    return seenWords.kindsOf(label.charAt(0).toUpperCase() + label.slice(1));
  };
  /* WHO IS WITH IT AND WHERE IT LIVES ON THE WEB: "2 people · halden.example". Nothing for a shop nobody is with. */
  const detailOf = (e: Entry): string => {
    const n = people.get(e.seq) ?? 0;
    const site = role?.domain ? String(e.fields[role.domain] ?? '').trim() : '';
    return [n > 0 ? seenWords.people(n) : '', site].filter(Boolean).join(' · ');
  };
</script>

<div class="orgs">
  <!-- THE COUNT ONLY WHEN IT SAYS MORE THAN THE TITLE (3 Nov): "12 organisations you work with." stood under "Organisations
       12" and a sentence that said 12 again. Shops a card text named are the news it carries, so it stays for them. -->
  {#if counted.shops > 0}<p class="orgs-said">{seenWords.orgsSaid(counted.known, counted.shops)}</p>{/if}
  {#each groups as g (g.key)}
    <section class="band" aria-labelledby="org-{g.key}">
      <h2 class="band-head" id="org-{g.key}">{headOf(g)} <span class="band-n">{g.items.length}</span></h2>
      <ul class="ledger ledger-lead">
        {#each g.items as item (item.entry.seq)}
          {@const name = nameOf(item.entry)}
          {@const detail = detailOf(item.entry)}
          <!-- AN ORGANISATION ADDED, MOVED OR GONE, as a person is in their list: it rises in, the rest close the gap. -->
          <li in:lineIn out:dismiss animate:flip={springy()}>
            <a
              class="line line-tall"
              href={at(`/r/${register}/${item.entry.seq}`)}
              {@attach openCardMenu && ownMenu((p) => openCardMenu(item.entry.seq, document.body, p))}
            >
              <span class="line-mark"><Face {name} of="project" size="m" picture={pictureOfRow(register, item.entry.fields)} row="{register}#{item.entry.seq}" /></span>
              <span class="line-main">
                <span class="line-title" dir="auto">{name}</span>
                {#if detail}<span class="line-detail">{detail}</span>{/if}
              </span>
              <span></span>
              <span class="line-when">{item.day ? daySaid(item.day, now) : ''}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

{#if more}
  <div class="sentinel" aria-hidden="true"></div>
{/if}

<style>
  .orgs {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding-block-start: var(--sp-2);
  }

  .orgs-said {
    margin: 0;
    color: var(--ink-2);
  }

  /* TWO COLUMNS FROM 1280, as People's bands (1 Nov, L7): one 1100px column put each name a whole tile away from its day. */
  @media (width >= 1280px) {
    .band > .ledger {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--sp-6);
      align-items: start;
    }
  }

  .band-head {
    margin: 0 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .band-n {
    margin-inline-start: var(--sp-1);
    font-variant-numeric: tabular-nums;
  }

  /* ONE NEUTRAL TINT FOR EVERY MARK, as people's faces: the name says which, and a column of hues said nothing. */
  .orgs :global(.line-mark .face) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  @media (width < 640px) {
    .orgs :global(.line-when) {
      grid-column: 3;
      grid-row: 1;
    }

    .orgs :global(.line > span:empty) {
      display: none;
    }
  }
</style>
