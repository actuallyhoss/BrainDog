<!--
  Settings > Who can do what (collab pass, 2 Nov).

  THE ROLES SIDE BY SIDE, IN THE WORDS EVERY INVITE AND SHARE USES (`lib/sharing/roles.ts`): the grid of the things a person
  does here against the five roles, the reader's own column marked, then the four rungs a share gives on part of the BrainDog. It reads nothing from the record and changes nothing, so every
  person may open it: a colleague reads what their own role is beside the others, marked "You".

  A TABLE ON A DESK, A LIST ON A PHONE. Five columns and thirteen rows do not fit 390px, so below 720px each thing is a
  row with the roles that may do it said in words under it, which is the same fact read one line at a time.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { MATRIX, ROLES, ROLE_ORDER, RUNG_LINES, RUNG_NAMES, RUNG_ORDER } from '$lib/sharing/roles.ts';
  import type { Level } from '$lib/record/schema.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE READER'S OWN ROLE, marked on its column; somebody holding only some lists has none to mark. */
  const mine = $derived<Level | null>(shell.me.lists === null && Object.hasOwn(ROLES, shell.me.level) ? (shell.me.level as Level) : null);

  const words = {
    roles: 'Roles',
    rolesLead: (mine: Level | null) => (mine ? `Your role is ${ROLES[mine].name}. Pick one for each person you invite.` : 'Pick one for each person you invite.'),
    shares: 'Sharing part of it',
    sharesLead: 'One project or part of your things, for as long as you say. Nothing else here.',
    you: 'You',
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

<!-- ONE TABLE, NOT CARDS AND A TABLE (ui pass, 3 Nov): five cards said in sentences what each role can and can't do,
     and the table under them said the same thing again as ticks. The table stays; the reader's own column is marked
     "You" in its head, and the line over it says which role that is. -->
<Tile icon="user-check" title={words.roles}>
  <p class="lead">{words.rolesLead(mine)}</p>
  <!-- A NARROW DESK MAY STILL SCROLL IT SIDEWAYS, so the box takes the keyboard and says what it holds. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="matrix-wrap" role="region" aria-label={words.roles} tabindex="0">
    <table class="matrix">
      <thead>
        <tr>
          <td></td>
          {#each ROLE_ORDER as level (level)}<th scope="col" data-mine={mine === level ? '' : undefined}
              >{ROLES[level].name}{#if mine === level}<span class="you">{words.you}</span>{/if}</th
            >{/each}
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
  <a class="to-people" href={at('/settings/people')}>{words.people}<Icon name="arrow" size="s" /></a>
</Tile>

<style>
  .lead {
    margin: 0 0 var(--sp-4);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    max-inline-size: var(--measure);
    text-wrap: pretty;
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
    line-height: var(--lead-meta);
  }
  .matrix th,
  .matrix td {
    block-size: var(--table-row-h, 44px);
    padding: 0 var(--sp-2);
    text-align: center;
    vertical-align: middle;
  }
  /* THE TABLE RULE (ops 6): an 11px caps head over one hairline, rows told apart by air and the hover wash. */
  .matrix thead th {
    block-size: auto;
    padding-block: 0 var(--sp-2);
    font: var(--t-caps, 500 11px/16px var(--font-ui));
    letter-spacing: var(--track-caps, 0.025em);
    text-transform: uppercase;
    color: var(--ink-3);
    white-space: nowrap;
    border-block-end: 1px solid var(--sep, var(--rule));
  }
  .matrix thead td {
    border-block-end: 1px solid var(--sep, var(--rule));
  }
  .matrix thead th[data-mine] {
    color: var(--ink);
  }
  .you {
    display: block;
    margin-block-start: 2px;
    font-size: var(--fs-cap);
    line-height: var(--lead-cap);
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink-2);
  }
  .matrix tbody th {
    padding-inline-start: var(--title-inset, 12px);
    text-align: start;
    font-weight: var(--fw-regular);
    color: var(--ink);
    /* THE THING'S NAME WRAPS BEFORE A ROLE IS PUSHED OFF: at 1280, 220 held Can view behind a sideways scroll. */
    min-inline-size: 11rem;
    text-wrap: pretty;
  }
  @media (hover: hover) and (pointer: fine) {
    .matrix tbody tr:hover > * {
      background: var(--row-wash);
    }
    .matrix tbody tr:hover > :first-child {
      border-start-start-radius: var(--r-ctl);
      border-end-start-radius: var(--r-ctl);
    }
    .matrix tbody tr:hover > :last-child {
      border-start-end-radius: var(--r-ctl);
      border-end-end-radius: var(--r-ctl);
    }
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
    gap: var(--row-stack, 2px);
    padding-block: var(--sp-2);
  }
  .phone-thing {
    color: var(--ink);
  }
  .phone-who {
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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
    line-height: var(--lead-meta);
    text-wrap: pretty;
  }
  .to-people {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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
