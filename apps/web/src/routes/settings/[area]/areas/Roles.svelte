<!--
  Settings > Who can do what (collab pass, 2 Nov).

  THE ROLES SIDE BY SIDE, IN THE WORDS EVERY INVITE AND SHARE USES (`lib/sharing/roles.ts`): one card a role with what it
  lets somebody do and what it does not, then the grid of the things a person does here against the five roles, then
  the four rungs a share gives on part of the BrainDog. It reads nothing from the record and changes nothing, so every
  person may open it: a colleague reads what their own role is beside the others, marked "You".

  A TABLE ON A DESK, A LIST ON A PHONE. Five columns and thirteen rows do not fit 390px, so below 720px each thing is a
  row with the roles that may do it said in words under it, which is the same fact read one line at a time.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { MATRIX, ROLES, ROLE_ORDER, RUNG_LINES, RUNG_NAMES, RUNG_ORDER } from '$lib/sharing/roles.ts';
  import type { Level } from '$lib/record/schema.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE READER'S OWN ROLE, marked on its card and its column; somebody holding only some lists has none to mark. */
  const mine = $derived<Level | null>(shell.me.lists === null && Object.hasOwn(ROLES, shell.me.level) ? (shell.me.level as Level) : null);

  const words = {
    roles: 'Roles',
    rolesLead: 'A role is what somebody can do across all of this BrainDog. You pick one when you invite them, and change it in People and sharing.',
    grid: 'Side by side',
    shares: 'Sharing part of it',
    sharesLead: 'A share gives somebody one project, one list or some rows, for as long as you say. They see nothing else here.',
    you: 'You',
    can: 'Can',
    cant: "Can't",
    yes: 'Yes',
    no: 'No',
    whoMay: (who: string[]) => (who.length === 0 ? 'Nobody' : who.join(', ')),
    people: 'People and sharing',
  } as const;

  /** A cell, said: Yes, No, or the limit. */
  const said = (v: boolean | string): string => (v === true ? words.yes : v === false ? words.no : v);
  /** The roles that may do one thing, by name, a limit kept beside its role ("Can decide (not owners)"). */
  const whoMay = (holds: Readonly<Record<Level, boolean | string>>): string[] =>
    ROLE_ORDER.every((l) => holds[l] !== false) && new Set(ROLE_ORDER.filter((l) => typeof holds[l] === 'string').map((l) => holds[l])).size === 1
      ? [`Everyone (${String(ROLE_ORDER.map((l) => holds[l]).find((v) => typeof v === 'string')).toLowerCase()})`]
      : ROLE_ORDER.filter((l) => holds[l] !== false).map((l) => (typeof holds[l] === 'string' ? `${ROLES[l].name} (${(holds[l] as string).toLowerCase()})` : ROLES[l].name));
</script>

<Tile icon="user-check" title={words.roles}>
  <p class="lead">{words.rolesLead}</p>
  <ul class="cards">
    {#each ROLE_ORDER as level (level)}
      <li class="card" data-mine={mine === level ? '' : undefined}>
        <p class="card-head">
          <span class="card-name">{ROLES[level].name}</span>
          {#if mine === level}<span class="card-you">{words.you}</span>{/if}
        </p>
        <p class="card-line"><Icon name="check" size="s" /><span><span class="sr">{words.can}: </span>{ROLES[level].can}</span></p>
        <p class="card-line cant"><Icon name="ban" size="s" /><span><span class="sr">{words.cant}: </span>{ROLES[level].cant}</span></p>
      </li>
    {/each}
  </ul>
</Tile>

<Tile icon="grid" title={words.grid}>
  <!-- A NARROW DESK MAY STILL SCROLL IT SIDEWAYS, so the box takes the keyboard and says what it holds. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="matrix-wrap" role="region" aria-label={words.grid} tabindex="0">
    <table class="matrix">
      <thead>
        <tr>
          <td></td>
          {#each ROLE_ORDER as level (level)}<th scope="col" data-mine={mine === level ? '' : undefined}>{ROLES[level].name}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each MATRIX as row (row.thing)}
          <tr>
            <th scope="row">{row.thing}</th>
            {#each ROLE_ORDER as level (level)}
              {@const v = row.holds[level]}
              <td data-mine={mine === level ? '' : undefined} data-v={v === true ? 'yes' : v === false ? 'no' : 'some'}>
                {#if v === true}<Icon name="check" size="s" /><span class="sr">{words.yes}</span>
                {:else if v === false}<span class="dash" aria-hidden="true"></span><span class="sr">{words.no}</span>
                {:else}<span class="some">{said(v)}</span>{/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <!-- ON A PHONE: each thing, and who may do it, in words. -->
  <ul class="phone">
    {#each MATRIX as row (row.thing)}
      <li><span class="phone-thing">{row.thing}</span><span class="phone-who">{words.whoMay(whoMay(row.holds))}</span></li>
    {/each}
  </ul>
</Tile>

<Tile icon="link" title={words.shares}>
  <p class="lead">{words.sharesLead}</p>
  <ul class="rungs">
    {#each RUNG_ORDER as rung (rung)}
      <li><span class="rung-name">{RUNG_NAMES[rung]}</span><span class="rung-line">{RUNG_LINES[rung]}</span></li>
    {/each}
  </ul>
  <a class="to-people" href="/settings/people">{words.people}<Icon name="arrow" size="s" /></a>
</Tile>

<style>
  .lead {
    margin: 0 0 var(--sp-4);
    color: var(--ink-2);
    max-inline-size: var(--measure);
    text-wrap: pretty;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: var(--sp-3);
  }
  .card {
    display: grid;
    align-content: start;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }
  .card[data-mine] {
    background: var(--tile);
    box-shadow: inset 0 0 0 1.5px var(--ink);
  }
  .card p {
    margin: 0;
  }
  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .card-name {
    font-weight: var(--fw-semi);
    color: var(--ink);
  }
  .card-you {
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }
  .card-line {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-2);
    align-items: start;
    font-size: var(--fs-meta);
    line-height: 1.45;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .card-line :global(svg) {
    margin-block-start: 2px;
    color: var(--good);
  }
  .card-line.cant :global(svg) {
    color: var(--ink-3);
  }
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .matrix-wrap {
    overflow-x: auto;
    border-radius: var(--r-ctl);
  }
  .matrix {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-meta);
  }
  .matrix th,
  .matrix td {
    padding: var(--sp-2) var(--sp-2);
    border-block-end: 1px solid var(--rule);
    text-align: center;
    vertical-align: middle;
  }
  .matrix thead th {
    font-weight: var(--fw-semi);
    color: var(--ink);
    white-space: nowrap;
  }
  .matrix tbody th {
    text-align: start;
    font-weight: var(--fw-regular);
    color: var(--ink);
    /* THE THING'S NAME WRAPS BEFORE A ROLE IS PUSHED OFF: at 1280, 220 held Can view behind a sideways scroll. */
    min-inline-size: 11rem;
    text-wrap: pretty;
  }
  .matrix tbody tr:last-child th,
  .matrix tbody tr:last-child td {
    border-block-end: 0;
  }
  .matrix [data-mine] {
    background: var(--tile-2);
  }
  .matrix td[data-v='yes'] :global(svg) {
    color: var(--good);
    inline-size: 16px;
    block-size: 16px;
    stroke-width: 2.25;
  }
  .matrix td :global(svg) {
    display: inline-block;
    vertical-align: middle;
  }
  .dash {
    display: inline-block;
    inline-size: 10px;
    block-size: 2px;
    border-radius: 1px;
    background: var(--ink-3);
    vertical-align: middle;
  }
  .some {
    color: var(--ink-2);
    white-space: nowrap;
  }
  .phone {
    display: none;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .phone li {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--rule);
  }
  .phone li:last-child {
    border-block-end: 0;
  }
  .phone-thing {
    color: var(--ink);
  }
  .phone-who {
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }
  @media (max-width: 720px) {
    .matrix-wrap {
      display: none;
    }
    .phone {
      display: block;
    }
  }
  .rungs {
    list-style: none;
    margin: 0 0 var(--sp-4);
    padding: 0;
    display: grid;
    gap: var(--sp-2);
  }
  .rungs li {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: var(--sp-3);
    align-items: baseline;
  }
  .rung-name {
    font-weight: var(--fw-semi);
    color: var(--ink);
  }
  .rung-line {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    text-wrap: pretty;
  }
  .to-people {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }
  /* A 44PX TARGET UNDER A THUMB (design pass 2 Nov): its words alone were 20 tall. */
  @media (pointer: coarse) {
    .to-people {
      min-block-size: var(--tap);
    }
  }
  .to-people:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
