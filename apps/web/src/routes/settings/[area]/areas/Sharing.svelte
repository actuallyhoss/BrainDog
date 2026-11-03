<!--
  Settings > Sharing: who is here and in what role, every share as one sentence grouped by who it is
  with, the shares still waiting for somebody to accept, the groups, and what ended in the last 30 days, with See as at
  the top.

  PEOPLE HERE IS THE PEOPLE AREA AS IT WAS, handed in by the page (`here`) and drawn first: roles, invites and the
  links to single pages are where they were, and `/settings/people` opens this area.

  EVERY SENTENCE IS THE RECORD'S. `sharing` says each share in one line with names in it, and this area only decides
  where each is drawn (`lib/sharing/sharing.ts`, `sharingSections`). Tapping one asks the Share sheet to open on it,
  by an event the sheet listens for (`ShareHost.svelte`, which loads it the first time); Stop asks once, in place, and
  ends it at once. Each person's "Seen and changed" opens in a drawer, read from `shareActivity` when it opens (§2.10).

  AN OWNER'S OR AN ADMIN'S, as the record's methods are. Anybody else here holds shares rather than giving them, so the
  area says what they can see instead (§3.4), from `myShares`, and where their share lets them share it on (the manage
  rung), "Share on" beside it opens the onward sheet (`OnwardSheet.svelte`).
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { day } from 'braindog-render';
  import { untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { may } from '$lib/record/may.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { closedAfter, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import ShareHost from '$lib/sharing/ShareHost.svelte';
  import {
    SHARED_EVENT,
    askSeeAs,
    askSheet,
    endedAt,
    groupMember,
    makeGroup,
    onwardOf,
    readActivity,
    readGroups,
    readMine,
    readSharing,
    retireGroup,
    sharingSections,
    stopShare,
    stopWords,
    type ActivityLine,
    type Bunch,
    type Got,
    type GroupRow,
    type MyShare,
    type SharingRow,
  } from '$lib/sharing/sharing.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import type { Snippet } from 'svelte';
  import Links from '../Links.svelte';

  /* `here` IS PEOPLE HERE, the People area as the page hands it: roles, invites and links (`+page.svelte`). */
  let { shell, here }: AreaProps & { here?: Snippet } = $props();

  const s = settingsState(() => shell);
  /* WHO MAY SHARE HERE: an owner or an Admin, as `sharing` and `share` are guarded (`team`). */
  const team = $derived(!shell.refused && may(shell, 'decide'));
  /* WHO READS THE WHOLE RECORD, and so the people on it (`may` on the record and no list). */
  const whole = $derived(!shell.refused && may(shell, 'read'));
  const client = () => createClient({ base: apiBase() });

  let rows = $state<SharingRow[] | null>(null);
  let groups = $state<GroupRow[] | null>(null);
  let mine = $state<MyShare[] | null>(null);
  let refused = $state<string | null>(null);
  /* A HOST OLDER THAN SHARING HAS NOTHING TO LIST, which is not a refusal: the area keeps People and says nothing more. */
  let unrouted = $state(false);
  /** How many read-only links the Shared card's links part holds, so "Nothing is shared" is said only with none. */
  let linkCount = $state(0);

  async function load(): Promise<void> {
    const at = opened();
    if (team) {
      const [got, gs] = await Promise.all([readSharing(client()), readGroups(client())]);
      unrouted = !got.ok && got.code === 'ROUTE_UNKNOWN';
      /* A TASK LATER, so the links part this answer draws has opened its own read by then (`closedAfter`). */
      closedAfter(got.ok || unrouted, at);
      rows = got.ok ? got.value : null;
      groups = gs.ok ? gs.value : [];
      refused = got.ok || unrouted ? null : got.fix;
    } else {
      const got = await readMine(client());
      unrouted = !got.ok && got.code === 'ROUTE_UNKNOWN';
      closedAfter(got.ok || unrouted, at);
      mine = got.ok ? got.value : null;
      refused = got.ok || unrouted ? null : got.fix;
    }
  }

  $effect(() => {
    void team;
    untrack(() => void load());
  });

  /* THE SHARE SHEET SAYS WHEN IT KEPT ONE, and the lists are read again. */
  $effect(() => {
    const again = () => void load();
    addEventListener(SHARED_EVENT, again);
    return () => removeEventListener(SHARED_EVENT, again);
  });

  /* BY THE RECORD'S CLOCK, which is the one that ends a share (`stateOf`), not this device's. */
  const now = $derived(recordNow());
  const sections = $derived(sharingSections(rows ?? [], now));
  const liveCount = $derived(sections.shared.reduce((n, b) => n + b.rows.length, 0));

  /* ── Share on: the shares that let them, and the sheet opened on one (`OnwardSheet.svelte`) ── */

  const onward = $derived(onwardOf(mine ?? []));
  let onwardOpen = $state(false);
  let onwardWanted = $state(false);
  let onwardFrom = $state<string | undefined>(undefined);

  function shareOn(id: string): void {
    onwardFrom = id;
    onwardWanted = true;
    onwardOpen = true;
  }

  /* ── Stop, asked once and in place ── */

  let asking = $state<string | null>(null);
  let busy = $state(false);

  async function stop(r: SharingRow): Promise<void> {
    if (busy) return;
    busy = true;
    const said = stopWords(r);
    const out = await stopShare(client(), r.id);
    busy = false;
    asking = null;
    toasts.push(out.ok ? said.done : out.fix, { intent: out.ok ? 'good' : 'warn' });
    await load();
  }

  /* ── See as: never an owner, and nobody twice ── */

  const seeable = $derived.by(() => {
    const out = new Map<string, string>();
    for (const p of s.people) if (p.level !== 'owner' && p.id !== shell.me.person) out.set(p.id, p.name);
    for (const r of rows ?? []) if (r.who.kind === 'person' && r.who_name && !out.has(r.who.id)) out.set(r.who.id, r.who_name);
    return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  function seeAs(id: string): void {
    const who = seeable.find((p) => p.id === id);
    if (who) askSeeAs({ person: who.id, name: who.name });
  }

  /* ── Seen and changed: one person's last 30 days, read when their drawer opens (§2.10) ── */

  let seenOf = $state<{ id: string; name: string } | null>(null);
  let seenOpen = $state(false);
  let seen = $state<Got<ActivityLine[]> | null>(null);

  async function openSeen(id: string, name: string): Promise<void> {
    seenOf = { id, name };
    seen = null;
    seenOpen = true;
    const got = await readActivity(client(), id);
    if (seenOf?.id === id) seen = got;
  }

  /* ── groups ── */

  let groupName = $state('');
  let adding = $state<Record<string, string>>({});
  let retiring = $state<string | null>(null);

  async function newGroup(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const name = groupName.trim();
    if (!name || busy) return;
    busy = true;
    const out = await makeGroup(client(), name);
    busy = false;
    toasts.push(out.ok ? copy.sharingGroupMade(out.value.name) : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok) groupName = '';
    await load();
  }

  async function putIn(g: GroupRow): Promise<void> {
    const person = adding[g.id] ?? '';
    const name = seeable.find((p) => p.id === person)?.name;
    if (!person || !name || busy) return;
    busy = true;
    const out = await groupMember(client(), g.id, person, true);
    busy = false;
    toasts.push(out.ok ? copy.sharingGroupAdded(name, g.name) : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok) adding = { ...adding, [g.id]: '' };
    await load();
  }

  async function takeOut(g: GroupRow, p: { id: string; name: string | null }): Promise<void> {
    if (busy) return;
    busy = true;
    const out = await groupMember(client(), g.id, p.id, false);
    busy = false;
    toasts.push(out.ok ? copy.sharingGroupLeft(p.name ?? copy.sharingSomeone, g.name) : out.fix, { intent: out.ok ? 'good' : 'warn' });
    await load();
  }

  async function retire(g: GroupRow): Promise<void> {
    if (busy) return;
    busy = true;
    const out = await retireGroup(client(), g.id);
    busy = false;
    retiring = null;
    toasts.push(out.ok ? copy.sharingGroupRetired(g.name) : out.fix, { intent: out.ok ? 'good' : 'warn' });
    await load();
  }

  const dayOf = (iso: string | null): string => (iso ? day(iso.slice(0, 10)) : '');
</script>

{#snippet bunchOf(b: Bunch, ended: boolean)}
  <li class="bunch">
    <h3 class="bunch-name" dir="auto">
      <Icon name={b.kind === 'group' ? 'people' : 'user-check'} size="s" />
      <span>{b.name}</span>
    </h3>
    <ul class="shares">
      {#each b.rows as r (r.id)}
        {@const said = stopWords(r)}
        <li class="share" data-ended={ended ? '' : undefined} in:lineIn out:dismiss animate:flip={settle()}>
          {#if ended}
            <p class="share-said">{r.sentence}</p>
            <p class="share-when">{copy.sharingEndedOn(dayOf(endedAt(r)))}</p>
          {:else if asking === r.id}
            <!-- THE ONE QUESTION, IN PLACE OF THE SENTENCE IT IS ABOUT: Stop ends it at once, Keep leaves it. -->
            <p class="share-ask" role="alert">{said.ask}</p>
            <div class="share-do">
              <Button weight="primary" tone="bad" disabled={busy} aria-busy={busy} onclick={() => void stop(r)}>{copy.sharingStop}</Button>
              <Button weight="quiet" disabled={busy} onclick={() => (asking = null)}>{copy.sharingKeep}</Button>
            </div>
          {:else}
            <!-- THE SENTENCE IS THE CONTROL: a tap opens the Share sheet on this share. -->
            <button type="button" class="share-open tap" aria-label={copy.sharingChange(r.sentence)} onclick={() => askSheet({ share: r })}>
              <span class="share-said">{r.sentence}</span>
            </button>
            <Button weight="bare" tone="bad" aria-label={said.label} disabled={busy} onclick={() => (asking = r.id)}>{copy.sharingStop}</Button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if b.kind === 'person' && !ended}
      <!-- SEEN AND CHANGED, in a drawer of its own: what this person read and changed, and through which share. -->
      <div class="share-do">
        <Button weight="bare" aria-label={copy.sharingSeenTitle(b.name)} onclick={() => void openSeen(b.key.slice('person:'.length), b.name)}
          ><Icon name="eye" size="s" />{copy.sharingSeen}</Button
        >
      </div>
    {/if}
  </li>
{/snippet}

{#if team && seeable.length > 0}
  <!-- SEE AS, AT THE TOP: the record as one person sees it, never an owner. The sheet's partner listens for the ask. -->
  <div class="see-as">
    <label class="see-as-label" for="see-as">{copy.sharingSeeAs}</label>
    <div class="field field-lg see-as-pick">
      <select
        class="field-input"
        id="see-as"
        aria-describedby="see-as-hint"
        value=""
        onchange={(e) => {
          seeAs(e.currentTarget.value);
          e.currentTarget.value = '';
        }}
      >
        <option value="" disabled>{copy.sharingSeeAsPick}</option>
        {#each seeable as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
    <p class="hint" id="see-as-hint">{copy.sharingSeeAsHint}</p>
  </div>
{/if}

<!-- THE PEOPLE AREA'S OWN TILES: roles, invites and links, as the People area drew them, under no heading of their own,
     since each tile names itself and the page's title already says People. NOT FOR A GUEST WHO HOLDS SHARES AND NOT THE
     WHOLE RECORD: the record refuses them the list of people, so their page is what they can see here, not a refusal. -->
{#if team || whole || !(mine?.length)}
  {@render here?.()}
{/if}

{#if unrouted}
  <!-- A host with no sharing: People is the whole of it, and the read-only links, an owner's, are a card of their own. -->
  {#if team && shell.me.owner}<Links />{/if}
{:else if !team}
  {#if refused !== null}
    <Tile icon="eye" title={copy.sharingYouCanSee}><Empty kind="error" title={refused} /></Tile>
  {:else if mine !== null && mine.length > 0}
    <Tile icon="eye" title={copy.sharingYouCanSee} count={mine.length}>
      <ul class="shares">
        {#each mine as m (m.id)}
          <li class="share">
            <p class="share-said share-mine">{m.sentence}</p>
            {#if onward.some((o) => o.id === m.id)}
              <!-- SHARE ON, where their share lets them: the onward sheet opens on this one. -->
              <Button weight="quiet" aria-label={copy.shareOnwardLabel(m.sentence)} onclick={() => shareOn(m.id)}><Icon name="user-plus" size="s" />{copy.shareOnward}</Button>
            {/if}
          </li>
        {/each}
      </ul>
    </Tile>
    {#if onwardWanted}
      <!-- LOADED THE FIRST TIME IT IS ASKED FOR, and kept so it can close the way it came. -->
      {#await import('$lib/sharing/OnwardSheet.svelte') then { default: OnwardSheet }}<OnwardSheet bind:open={onwardOpen} mine={onward} from={onwardFrom} />{/await}
    {/if}
  {/if}
{:else if refused !== null}
  <Tile icon="link" title={copy.sharingShared}><Empty kind="error" title={refused} /></Tile>
{:else if rows !== null}
  <!-- ONE SHARED CARD, FULL WIDTH: the shares, then the read-only links to single pages under
       their own small heading once there is one, and "Nothing is shared" said once while there is neither. It hugged
       its empty state at half the width and left a hole beside it at a desk. -->
  <Tile icon="link" data-wide="" title={copy.sharingShared} count={liveCount + linkCount || undefined}>
    {#snippet actions()}
      <Button weight="quiet" size="sm" onclick={() => askSheet()}><Icon name="plus" size="s" />{copy.sharingShare}</Button>
    {/snippet}
    {#if sections.shared.length === 0 && linkCount === 0}
      <!-- THE STATE, NOT A DESCRIPTION OF THE LIST (ui pass, 3 Nov): "What you share ... is listed here" under a heading
           "Shared" and a "Share something" button said what the card is for three times. -->
      <Empty kind="no-data-yet" compact title="Nothing shared yet." />
    {:else if sections.shared.length > 0}
      <ul class="bunches">{#each sections.shared as b (b.key)}{@render bunchOf(b, false)}{/each}</ul>
    {/if}
    <!-- THE LINKS ARE AN OWNER'S LIST (`shares` is ADMIN), so somebody at Can decide is never sent to ask for it (collab pass 3). -->
    {#if shell.me.owner}<Links inside bind:count={linkCount} />{/if}
  </Tile>

  <!-- WAITING AND ENDED ARE DRAWN ONLY WHILE THEY HOLD SOMETHING: a tile that says "none" is a tile of nothing. -->
  {#if sections.waiting.length > 0}
    <Tile icon="clock" title={copy.sharingWaiting} count={sections.waiting.reduce((n, b) => n + b.rows.length, 0) || undefined}>
      <p class="hint">{copy.sharingWaitingLead}</p>
      <ul class="bunches">{#each sections.waiting as b (b.key)}{@render bunchOf(b, false)}{/each}</ul>
    </Tile>
  {/if}

  <Tile icon="people" title={copy.sharingGroups} count={groups?.length || undefined}>
    {#if (groups ?? []).length === 0}
      <!-- THE LINE RUNS TO THE TILE (G19): the empty title's balanced wrap broke it at half the width on a phone. -->
      <div class="groups-none"><Empty kind="no-data-yet" compact title={copy.sharingNoGroups} /></div>
    {:else}
      <ul class="bunches">
        {#each groups ?? [] as g (g.id)}
          <li class="bunch group" in:lineIn out:dismiss animate:flip={settle()}>
            <h3 class="bunch-name" dir="auto"><Icon name="people" size="s" /><span>{g.name}</span></h3>
            <p class="share-when">{copy.sharingGroupSize(g.people.length)} · {copy.sharingGroupHolds(g.shares)}</p>
            {#if g.people.length > 0}
              <ul class="shares">
                {#each g.people as p (p.id)}
                  <li class="share" in:lineIn out:dismiss animate:flip={settle()}>
                    <span class="share-said" dir="auto">{p.name ?? copy.sharingSomeone}</span>
                    <Button weight="bare" disabled={busy} aria-label={copy.sharingGroupOutLabel(p.name ?? copy.sharingSomeone, g.name)} onclick={() => void takeOut(g, p)}
                      >{copy.sharingGroupOut}</Button
                    >
                  </li>
                {/each}
              </ul>
            {/if}
            <form class="group-add" onsubmit={(e) => { e.preventDefault(); void putIn(g); }}>
              <div class="field field-lg">
                <select class="field-input" aria-label={copy.sharingGroupPersonLabel(g.name)} bind:value={() => adding[g.id] ?? '', (v) => (adding = { ...adding, [g.id]: v })}>
                  <option value="">{copy.sharingGroupPick}</option>
                  {#each seeable.filter((p) => !g.people.some((x) => x.id === p.id)) as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
                </select>
              </div>
              <Button type="submit" weight="quiet" disabled={busy || !(adding[g.id] ?? '')}>{copy.sharingGroupAdd}</Button>
            </form>
            {#if retiring === g.id}
              <p class="share-ask" role="alert">{copy.sharingGroupRetireAsk(g.name)}</p>
              <div class="share-do">
                <Button weight="primary" tone="bad" disabled={busy} aria-busy={busy} onclick={() => void retire(g)}>{copy.sharingGroupRetire}</Button>
                <Button weight="quiet" disabled={busy} onclick={() => (retiring = null)}>{copy.sharingKeep}</Button>
              </div>
            {:else}
              <div class="share-do"><Button weight="bare" tone="bad" disabled={busy} onclick={() => (retiring = g.id)}>{copy.sharingGroupRetire}</Button></div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <form class="group-new" onsubmit={newGroup}>
      <label class="see-as-label" for="group-new">{copy.sharingGroupNameLabel}</label>
      <div class="group-add">
        <div class="field field-lg"><input class="field-input" id="group-new" type="text" autocomplete="off" maxlength="80" bind:value={groupName} /></div>
        <Button type="submit" weight="quiet" disabled={busy || !groupName.trim()}>{copy.sharingGroupMake}</Button>
      </div>
    </form>
  </Tile>

  {#if sections.ended.length > 0}
    <Tile icon="history" title={copy.sharingEnded} count={sections.ended.reduce((n, b) => n + b.rows.length, 0) || undefined}>
      <p class="hint">{copy.sharingEndedLead}</p>
      <ul class="bunches">{#each sections.ended as b (b.key)}{@render bunchOf(b, true)}{/each}</ul>
    </Tile>
  {/if}

  {#if seenOf}
    <Sheet bind:open={seenOpen} title={copy.sharingSeenTitle(seenOf.name)} subtitle={copy.sharingSeenLead}>
      {#if seen === null}
        <p class="none" role="status">{copy.sharingSeenReading}</p>
      {:else if !seen.ok}
        <Empty kind="error" title={seen.fix} />
      {:else if seen.value.length === 0}
        <p class="none">{copy.sharingSeenNone(seenOf.name)}</p>
      {:else}
        <ul class="shares">
          {#each seen.value as l, i (i)}
            <li class="share" data-ended="">
              <p class="share-when">{l.via}</p>
              <p class="share-said">{l.said}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </Sheet>
  {/if}

  <!-- THE SHARE SHEET, ASKED FOR BY EVENT from the lines above, and loaded the first time it is. -->
  <ShareHost />
{/if}

<style>
  /* SEE AS, A LABEL OVER ONE SELECT, 44PX TALL, the width of a phone and no wider than a sentence on a desk. */
  .see-as {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .see-as-label {
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: var(--lead-meta);
  }

  /* A CONTROL'S HEIGHT, which is 44 under a thumb and 36 under a mouse, so the field and its button match the
     area's other fields at a desk instead of standing 44 among 36s. */
  .see-as-pick .field-input,
  .group-add .field-input {
    min-block-size: calc(var(--ctl-h) - 2px);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .see-as .hint {
    margin: 0;
  }

  .bunches,
  .shares {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bunches {
    gap: var(--sp-4);
  }

  .bunch-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  /* ONE SHARE A LINE: the sentence, which opens it, and Stop at the end, with a hairline between lines. Below 640px Stop
     goes under the sentence. */
  .share {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    min-block-size: var(--tap);
    padding-block: var(--sp-1);
  }

  .share + .share::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 1px;
    background: var(--rule);
  }

  .share-open {
    flex: 1 1 16rem;
    min-inline-size: 0;
    min-block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .share-mine {
    flex: 1 1 16rem;
    min-inline-size: 0;
  }

  .share-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  @media (hover: hover) and (pointer: fine) {
    .share-open:hover .share-said {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .share[data-ended] {
    display: grid;
    gap: 2px;
  }

  .share[data-ended] .share-said {
    color: var(--ink-2);
  }

  .share-when {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .share-ask {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .share-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .share :global(.btn),
  .share-do :global(.btn),
  .group-add :global(.btn) {
    min-block-size: var(--ctl-h);
  }

  .group {
    display: grid;
    gap: var(--sp-2);
  }

  .group-add {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }

  .group-add .field {
    flex: 1 1 12rem;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
  }

  .see-as-pick.field {
    min-block-size: var(--ctl-h);
  }

  .group-new {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
    max-inline-size: var(--measure);
  }

  .groups-none :global(.empty-title) {
    text-wrap: pretty;
  }
</style>
