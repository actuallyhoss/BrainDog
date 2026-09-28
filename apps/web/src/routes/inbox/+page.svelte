<!--
  The Inbox is what the RULES DID NOT CLAIM: raw arrivals that matched no pattern, with the time
  they arrived.

  Nothing here is rendered through the markdown renderer. An `inbox_raw` body is untrusted text from
  outside the record, and the quarantine is structural rather than a sanitiser: it is drawn as plain
  text nodes, never parsed (50 §8).

  AND IT IS A QUEUE, CLEARED FROM THE KEYBOARD (DESIGN-SYSTEM appendix D). `j` and `k` move a cursor,
  Enter opens the one under it, `e` files it in the chosen list, Delete archives it, `x` selects it so
  several are filed or archived at once, and Esc clears the selection. A row leads with its subject,
  then who sent it and the first words of what they said, then when (rule 7).

  ARRIVALS THAT ARE ALIKE ARE DRAWN TOGETHER, by the kernel's own shape (`shapes.ts`), and at three or more
  alike the group offers to ask Slash for a pattern, which files a `pattern` proposal on Decide. The cursor
  walks the rows in the order they are drawn, so `j` never jumps between groups.

  AND WHAT LEFT IT IS STILL HERE. Waiting, Filed and Archived are one series of the same arrivals, led by the record's
  "Filed by rules this week" line, with the pattern proposals that wait on Decide above what waits. Every filing and
  archiving, a person's or an agent's, names who did it and can be put back, through `triage`'s `back` (MOD-26).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { titleOf } from '$lib/title.ts';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { DOM_CAP } from '$lib/record/api.ts';
  import { firstPartyModule as moduleOf } from '@braindog/seed/packs/modules';
  import type { InboxItem } from '$lib/record/schema.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { ALIKE, SAMPLES_MOST, groupsOf, type Group } from './shapes.ts';
  import { builderPath } from '$lib/pattern/draft.ts';
  import { words as patternWords } from '$lib/pattern/words.ts';
  import Section from '$lib/ui/Section.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { actor, listName } from '$lib/record/names.ts';
  import type { Pattern, Series, SettledItem, Tally } from './series.ts';

  /**
   * THIS UNIT'S OWN WORDS, beside the one screen that says them. The press's cost is not named: the door meters it, and a
   * sentence here that named the allowance would be wrong the day the door moves it.
   */
  const words = {
    alike: (n: number) => `${n} alike`,
    askPattern: 'Ask Slash for a pattern',
    asking: 'Slash is drafting a pattern',
    unfiled: 'Slash drafted nothing to decide from these.',
    unreached: 'BrainDog could not reach Slash. Nothing was drafted.',
    tally: (ruled: number, waiting: number) => `Filed by rules this week: ${ruled} · waiting: ${waiting}`,
    series: 'Show',
    waiting: 'Waiting',
    filed: 'Filed',
    archived: 'Archived',
    patterns: 'Patterns to decide',
    putBack: 'Put back',
    putBackDone: 'Put back in the inbox.',
    filedIn: 'Filed in',
    by: (who: string) => `by ${who}`,
    filedBy: (who: string) => `Filed by ${who}`,
    byRule: 'Filed by a rule',
    archivedBy: (who: string) => `Archived by ${who}`,
    archivedPlain: 'Archived',
    noneFiled: 'Nothing has been filed yet',
    noneFiledWhy: 'What you or an agent files from the inbox, and what a rule files as it arrives, is listed here.',
    noneArchived: 'Nothing has been archived',
    noneArchivedWhy: 'What you or an agent archives from the inbox is kept here, and can be put back.',
  };

  /**
   * THE INBOX IS THE RECORD'S, its newest page, and nothing of the sample is mixed into it. Until the
   * page arrives the screen draws no rows and no empty state, and a refusal is the record's own
   * sentence: a read that found no record drew the sample's arrivals here until DIRECTION 26, and
   * says so in the record's words now.
   *
   * `unrouted` IS A HOST OLDER THAN THIS READ: there is a record, and no list to draw from it.
   */
  let live = $state<{ items: InboxItem[]; cursor: number | null } | null>(null);
  let refused = $state<string | null>(null);
  let unrouted = $state(false);
  const INBOX = $derived(live?.items ?? []);
  /* THE SHAPE OF EVERY ARRIVAL READ, by id, replaced whole so that the groups follow it. `shown` is the rows in the order
     the groups draw them, which is the order the cursor walks and the next row opens in. */
  let shapes = $state.raw<ReadonlyMap<string, string>>(new Map());
  const groups = $derived(groupsOf(INBOX.slice(0, DOM_CAP), shapes));
  const shown = $derived(groups.flatMap((g) => g.items));
  const place = $derived(new Map(shown.map((item, i) => [item.id, i])));
  const clock = $derived(Date.now());
  const answered = $derived(live !== null);

  let open = $state<string | null>(null);

  $effect(() => {
    /* UNTRACKED, ALL OF IT. The effect read `route.data.live`, so the `invalidateAll` after every filing re-ran the
       read and put the open row and the cursor back on the first arrival. And it reads the pending count it writes.
       It reads no `route.data.live` at all now: a shell that was not live was the sample's, and asking regardless is
       how any shell's Inbox ends in the record's answer or its sentence rather than in bars that never stop. */
    const at = untrack(opened);
    let ok = false;
    void import('./shapes.ts')
      .then((m) => m.readShaped(apiBase()))
      .then(({ read: out, shapes: read }) => {
        if (out.from === 'live') {
          shapes = read;
          live = { items: out.items, cursor: out.cursor };
          open = out.items[0]?.id ?? null;
          ok = true;
        } else if (out.from === 'unrouted') {
          unrouted = true;
          ok = true;
        } else refused = out.fix;
      })
      .finally(() => closed(ok, at));
    /* THE TALLY AND THE PATTERNS ARE READ BESIDE THE ARRIVALS AND OUTSIDE THEIR BRACKET: the arrivals are the screen, and
       a record that answers neither of these still draws them. */
    void retally();
    void import('./series.ts')
      .then((m) => m.readPatterns(apiBase()))
      .then((read) => (patterns = read));
  });

  /**
   * THE SERIES AND THE TALLY. What waits is the screen's first series; filed and archived are the record's `matched` and
   * `ignored`, read when chosen, so an Inbox opened to clear it pays for nothing more than what waits.
   */
  type View = 'waiting' | Series;
  let view = $state<View>('waiting');
  let tally = $state<Tally | null>(null);
  let patterns = $state<Pattern[]>([]);
  let series = $state<{ state: Series; items: SettledItem[]; cursor: number | null } | null>(null);
  let seriesFix = $state<string | null>(null);
  let seriesOlder = $state(false);
  const me = $derived(String(route.data.me?.person ?? ''));
  /* THE THREE SEGMENTS, each with the record's count for it once the tally is in. */
  const segments = $derived<readonly { v: View; label: string; n: number | undefined }[]>([
    { v: 'waiting', label: words.waiting, n: tally?.waiting },
    { v: 'matched', label: words.filed, n: tally?.filed },
    { v: 'ignored', label: words.archived, n: tally?.archived },
  ]);

  async function retally() {
    const m = await import('./series.ts');
    const read = await m.readTally(apiBase());
    if (read) tally = read;
  }

  async function show(next: View) {
    if (next === view) return;
    view = next;
    series = null;
    seriesFix = null;
    if (next === 'waiting') return;
    try {
      const m = await import('./series.ts');
      const out = await m.readSeries(apiBase(), next);
      /* A SERIES CHOSEN WHILE THIS ONE WAS READ is the one drawn, and this answer is dropped. */
      if (view !== next) return;
      if (out.from === 'live') {
        series = { state: next, items: out.items, cursor: out.cursor };
        if (out.tally) tally = out.tally;
      } else if (out.from === 'refused') seriesFix = out.fix;
      else series = { state: next, items: [], cursor: null };
    } catch {
      if (view === next) seriesFix = copy.recordNotReached;
    }
  }

  async function loadOlderSeries() {
    const had = series;
    if (!had || had.cursor === null || seriesOlder) return;
    seriesOlder = true;
    try {
      const m = await import('./series.ts');
      const out = await m.readSeries(apiBase(), had.state, had.cursor);
      if (out.from === 'live' && series?.state === had.state) series = { ...had, items: [...had.items, ...out.items], cursor: out.cursor };
      else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      seriesOlder = false;
    }
  }

  /** A list as a person says it: the name the shell holds for it, or its id in words. */
  const listOf = (id: string): string => lists.find((l) => l.id === id)?.name ?? listName(id);

  /**
   * PUT BACK, through `triage`'s `back` and the kernel's `returnArrival`. A filing names the version of the row it made,
   * so a row somebody edited since is the record's conflict and nothing moves; an archiving has no row.
   *
   * ONE AT A TIME, as every write here is: a second press while the first is out would be a second return.
   */
  let backing = $state<string | null>(null);
  async function putBack(id: string, version: number | null) {
    if (backing !== null) return;
    backing = id;
    try {
      const m = await import('$lib/record/inbox-write.ts');
      const out = await m.putBack(apiBase(), id, version);
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      toasts.push(words.putBackDone);
      if (series) series = { ...series, items: series.items.filter((i) => i.id !== id) };
      await rereadWaiting();
      void retally();
      void invalidateAll();
    } finally {
      backing = null;
    }
  }

  /** What waits, read again from its first page, so an arrival put back is drawn where it arrived. */
  async function rereadWaiting() {
    const m = await import('./shapes.ts');
    const { read: out, shapes: read } = await m.readShaped(apiBase());
    if (out.from !== 'live') return;
    shapes = read;
    live = { items: out.items, cursor: out.cursor };
    if (open !== null && !out.items.some((i) => i.id === open)) open = null;
  }

  /**
   * THE PAGE BELOW, WHEN ASKED FOR. What arrives is added under what is drawn, and a refusal here is
   * said under the list, with the arrivals already drawn left where they are.
   */
  let older = $state(false);
  let olderFix = $state<string | null>(null);
  async function loadOlder() {
    const had = live;
    if (!had || had.cursor === null || older) return;
    older = true;
    olderFix = null;
    try {
      const m = await import('./shapes.ts');
      const { read: out, shapes: read } = await m.readShaped(apiBase(), had.cursor);
      if (out.from === 'live') {
        shapes = new Map([...shapes, ...read]);
        live = { items: [...had.items, ...out.items], cursor: out.cursor };
      } else if (out.from === 'refused') olderFix = out.fix;
    } finally {
      older = false;
    }
  }

  /**
   * THE LIST A FILED EMAIL GOES INTO, and the one chosen last time.
   *
   * It opened on the first list in the record, which on a live record is Agent runs (DESIGN-SYSTEM
   * D6), so the likeliest press filed an invoice as an agent's run. The choice is remembered on this
   * device, as a convenience and nothing more: a browser that forgets it opens on the first list again.
   */
  const INTO = 'braindog.inbox.into';
  const lists = $derived<readonly { id: string; name: string }[]>(route.data.lists ?? route.data.index?.registers ?? []);
  let into = $state(untrack(() => {
    try {
      return localStorage.getItem(INTO) ?? '';
    } catch {
      return '';
    }
  }));
  /* AN AGENT'S OWN LISTS ARE NOT WHERE AN EMAIL GOES, so the first list is the first of anybody else's. They were read off
     the seed's root, which is the whole sample, for four names the Agents module carries (`modules.ts`). */
  const AGENTS = new Set(['session', ...(moduleOf('agents')?.registers ?? [])]);
  const target = $derived(lists.some((l) => l.id === into) ? into : (lists.find((l) => !AGENTS.has(l.id)) ?? lists[0])?.id ?? '');
  function choose(id: string) {
    into = id;
    try {
      localStorage.setItem(INTO, id);
    } catch {
      /* A browser that stores nothing opens on the first list next time. */
    }
  }

  /**
   * ON A LIVE RECORD THE TWO GESTURES WRITE. Filing puts the arrival in the chosen list, titled by its
   * subject; archiving keeps its bytes. Either way it leaves the list here, the next one takes its
   * place under the cursor, and the next one opens if this one was open. A refusal is the record's own
   * sentence, and the arrival stays where it is.
   */
  let busy = $state(false);

  /** One arrival through the record: `true` when it left the inbox. */
  async function write(item: InboxItem, gesture: 'file' | 'archive'): Promise<{ ok: boolean; row?: string; version?: number }> {
    const m = await import('$lib/record/inbox-write.ts');
    const out =
      gesture === 'file' ? await m.fileArrival(apiBase(), item.id, target) : await m.archiveArrival(apiBase(), item.id);
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return { ok: false };
    }
    return { ok: true, ...(out.row ? { row: out.row } : {}), ...(out.version === undefined ? {} : { version: out.version }) };
  }

  /** Take arrivals off the list here, and keep the cursor and the open row on what comes next. */
  function leave(ids: ReadonlySet<string>) {
    const had = live;
    if (!had) return;
    const at = shown.findIndex((i) => ids.has(i.id));
    /* THE NEXT ONE IS THE NEXT DRAWN, which inside a group is the next alike and not the next to arrive. */
    const rest = shown.filter((i) => !ids.has(i.id));
    const items = had.items.filter((i) => !ids.has(i.id));
    live = { items, cursor: had.cursor };
    if (open !== null && ids.has(open)) open = rest[Math.max(0, at)]?.id ?? rest[at - 1]?.id ?? null;
    if (cursor >= items.length) cursor = items.length - 1;
  }

  async function settle(item: InboxItem, gesture: 'file' | 'archive') {
    if (busy) return;
    if (gesture === 'file' && target === '') return void toasts.push(copy.inboxNoLists, { intent: 'warn' });
    busy = true;
    try {
      const out = await write(item, gesture);
      if (!out.ok) return;
      leave(new Set([item.id]));
      /* EVERY FILING AND ARCHIVING CAN BE PUT BACK FROM ITS TOAST. A filing is put back at the version its row was made
         at, so a host too old to send one offers no Undo rather than one the record would refuse. */
      const version = gesture === 'archive' ? null : (out.version ?? undefined);
      const text = gesture === 'archive' ? copy.inboxArchived : copy.inboxFiled(out.row ?? target);
      toasts.push(text, version === undefined ? {} : { undo: () => void putBack(item.id, version) });
      /* AND THE RAIL FOLLOWS, as it does after a decision: its Inbox count, and the list a first row just put on it. */
      void retally();
      void invalidateAll();
      await focusCursor();
    } finally {
      busy = false;
    }
  }

  /* ── the cursor ──────────────────────────────────────────────────────────── */
  let cursor = $state(-1);

  async function focusCursor() {
    await tick();
    const item = shown[cursor];
    if (!item) return;
    const el = document.getElementById(`arrival-${item.id}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }

  function move(to: number) {
    if (shown.length === 0) return;
    cursor = Math.max(0, Math.min(to, shown.length - 1));
    void focusCursor();
  }

  /* ── a selection ─────────────────────────────────────────────────────────── */
  let picked = $state(new Set<string>());
  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    picked = next;
  }

  async function settlePicked(gesture: 'file' | 'archive') {
    const items = shown.filter((i) => picked.has(i.id));
    if (busy || items.length === 0) return;
    if (gesture === 'file' && target === '') return void toasts.push(copy.inboxNoLists, { intent: 'warn' });
    busy = true;
    const gone = new Set<string>();
    try {
      for (const item of items) if ((await write(item, gesture)).ok) gone.add(item.id);
    } finally {
      busy = false;
    }
    leave(gone);
    picked = new Set([...picked].filter((id) => !gone.has(id)));
    if (gone.size) {
      toasts.push(gesture === 'file' ? copy.inboxBatchFiled(gone.size) : copy.inboxBatchArchived(gone.size));
      void retally();
      void invalidateAll();
    }
  }

  /**
   * ASK SLASH FOR A PATTERN FROM ONE GROUP. The newest alike go as the samples, as many as the door takes, and the record
   * reads them itself: nothing a stranger wrote is sent from here. What comes back is a `pattern` proposal filed on
   * Decide, which is where this goes next; nothing is installed until it is accepted there.
   *
   * ONE PRESS AT A TIME, across every group: a second press while a draft is out would be a second model call for the
   * same question. The door meters the press and refuses it in its own sentence when the month is spent.
   */
  let asking = $state<string | null>(null);
  async function askPattern(group: Group) {
    if (asking !== null) return;
    asking = group.shape;
    try {
      const { createClient } = await import('@braindog/client');
      const out = await createClient({ base: apiBase() }).slashPattern(group.items.slice(0, SAMPLES_MOST).map((i) => i.id));
      if (!out.ok) return void toasts.push('refusal' in out ? out.refusal.fix : words.unreached, { intent: 'warn' });
      if (out.value.filed === null) return void toasts.push(words.unfiled, { intent: 'warn' });
      await goto(at(`/decide/${encodeURIComponent(out.value.filed)}`));
    } catch {
      toasts.push(words.unreached, { intent: 'warn' });
    } finally {
      asking = null;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    /* A KEY THE SHELL ALREADY TOOK, `g` then a letter, is not this page's too. */
    if (e.defaultPrevented || covered() || typing()) return;
    /* THE QUEUE'S KEYS ARE FOR WHAT WAITS. Filed and archived are read, and each is put back by its own button. */
    if (view !== 'waiting') return;
    if (e.metaKey || e.ctrlKey || e.altKey || shown.length === 0) return;
    if (e.key === 'Escape' && picked.size > 0) {
      e.preventDefault();
      picked = new Set();
      return;
    }
    const item = shown[cursor];
    if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
      e.preventDefault();
      void settle(item, 'archive');
      return;
    }
    if (silenced(e)) return;
    if (e.key === 'j') {
      e.preventDefault();
      move(cursor + 1);
    } else if (e.key === 'k') {
      e.preventDefault();
      move(cursor < 0 ? 0 : cursor - 1);
    } else if (e.key === 'e' && item) {
      e.preventDefault();
      void settle(item, 'file');
    } else if (e.key === 'x' && item) {
      e.preventDefault();
      toggle(item.id);
    }
  }

  /** The first words of what was said, for the row's detail line. */
  const firstWords = (body: string) => body.replace(/\s+/gu, ' ').trim();

  /**
   * THE READ ABOVE IS BRACKETED WITH `opened()` AND `closed()`, and a call still out takes the
   * attribute away whatever this line says, so the claim is only made once the answer is in.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(said('inbox'))}</title></svelte:head>
<svelte:window {onkeydown} />

<PageHead icon="inbox"
  title={said('inbox')}
  count={answered && !unrouted && !refused ? INBOX.length : undefined}
  atLeast={live !== null && live.cursor !== null}
/>

{#snippet fileInto()}
  {#if lists.length > 0}
    <label class="file-into">
      <span class="file-label">{copy.inboxFileInto}</span>
      <select class="file-select" value={target} disabled={busy} onchange={(e) => choose(e.currentTarget.value)}>
        {#each lists as list (list.id)}<option value={list.id}>{list.name}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

<div class="page">
  {#if refused}
    <Empty kind="error" title={refused}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if !answered || unrouted}
    <!-- Bars before the first answer, and nothing from a host that has no inbox to read. -->
    {#if !answered}<Waiting />{/if}
  {:else}
    <!-- THE ONE LINE OF CONTEXT, the record's own numbers: what the rules did this week without anybody, and what waits
         on somebody. Absent until the record answers with them, never a guessed zero. -->
    {#if tally && tally.ruled !== null}<p class="tally">{words.tally(tally.ruled, tally.waiting)}</p>{/if}

    <!-- FILED AND UNFILED AS ONE SERIES, three states of the same arrivals, so what was filed stays where it can be
         seen and put back rather than vanishing from the screen it left. -->
    <div class="segmented series" role="group" aria-label={words.series}>
      {#each segments as s (s.v)}
        <button
          type="button"
          class="segment"
          aria-pressed={view === s.v}
          data-on={view === s.v ? '' : undefined}
          onclick={() => show(s.v)}
        >{s.label}{#if s.n}<span class="segment-n">{s.n}</span>{/if}</button>
      {/each}
    </div>

    {#if view !== 'waiting'}
      {@render settledSeries()}
    {:else}
      {#if patterns.length > 0}
        <!-- PATTERNS FIRST: one accepted pattern files every arrival like its samples from then on, so it is worth
             more than any one arrival below it. Each opens its question on Decide, where it is accepted or not. -->
        <Section title={words.patterns} count={patterns.length}>
          <ul class="ledger">
            {#each patterns as p (p.id)}
              <li>
                <a class="line pattern" href={at(`/decide/${encodeURIComponent(p.id)}`)}>
                  <span class="line-main"><span class="line-title">{p.title}</span></span>
                  <Icon name="decide" size="s" />
                </a>
              </li>
            {/each}
          </ul>
        </Section>
      {/if}
      {@render waitingSeries()}
    {/if}
  {/if}
</div>

{#snippet settledSeries()}
  {#if seriesFix}
    <Empty kind="error" compact title={seriesFix} />
  {:else if series === null}
    <Waiting />
  {:else if series.items.length === 0}
    {#if series.state === 'matched'}
      <Empty kind="no-data-yet" compact title={words.noneFiled} body={words.noneFiledWhy} />
    {:else}
      <Empty kind="no-data-yet" compact title={words.noneArchived} body={words.noneArchivedWhy} />
    {/if}
  {:else}
    <ul class="ledger arrivals">
      {#each series.items as item (item.id)}
        {@const s = item.settled}
        {@const who = s ? actor(s.by, me || null) : null}
        <!-- WHO SETTLED IT, IN PLACE: the face and the name of the person or the agent's run that filed or archived it,
             and the list a filing went into, linked to its row. A rule's filing is said to be a rule's and offers no Put
             back, since the record keeps a rule's filing to its list. -->
        <li class="arrival">
          <div class="line line-tall settled-line">
            <span class="line-main">
              <span class="line-title">{item.subject}</span>
              <span class="line-detail settled-detail">
                {#if who}<Face name={who.name} you={who.kind === 'you'} kind={who.kind} size="s" />{/if}
                {#if series.state === 'matched'}
                  {#if s?.row}
                    <span>{words.filedIn}
                      {#if s.row.seq !== null && !s.row.archived}<a class="settled-list" href={at(`/r/${encodeURIComponent(s.row.register)}/${s.row.seq}`)}>{listOf(s.row.register)}</a>{:else}{listOf(s.row.register)}{/if}
                      {words.by(who?.name ?? '')}</span>
                  {:else}
                    <span>{who ? words.filedBy(who.name) : words.byRule}</span>
                  {/if}
                {:else}
                  <span>{who ? words.archivedBy(who.name) : words.archivedPlain}</span>
                {/if}
                <span class="from">{item.from}</span>
              </span>
            </span>
            <span class="line-when">{since(s?.at ?? item.arrived, clock)}</span>
          </div>
          {#if s}
            <div class="settled-actions">
              <Button disabled={backing !== null} onclick={() => putBack(item.id, s.row?.version ?? null)}>{words.putBack}</Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if series.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlderSeries} disabled={seriesOlder}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}
  {/if}
{/snippet}

{#snippet waitingSeries()}
  {#if INBOX.length === 0}
    <!--
      AN EMPTY INBOX IS TWO DIFFERENT FACTS. A record with no connector has never had anything arrive,
      and a record that has one has cleared it. A record cannot tell these apart from the inbox alone,
      so it says what is true in both, with the door to a connector; and where something waits on
      Decide, the door there too. Only the sample knew its own sources and drew the two apart.

      NEITHER DOOR IS INK. An empty inbox is good news, and the filled pill was the loudest shape on it (design.md 2.4),
      so both are the quiet secondary.
    -->
    <Empty kind="no-data-yet" glyph="inbox" title={said('inbox_clear')} body={copy.inboxClearWhy}>
      {#snippet actions()}
        {#if Number(route.data.open ?? 0) > 0}<Button href="/decide">{copy.inboxOpenDecide}</Button>{/if}
        <Button href="/settings/ingest">{copy.inboxConnect}</Button>
      {/snippet}
    </Empty>
  {:else}
    <ul class="ledger arrivals" data-picking={picked.size > 0 ? '' : undefined}>
      {#each groups as group (group.shape)}
        <!-- A GROUP OF ONE IS DRAWN AS A ROW AND NOTHING MORE. Two or more alike are led by who they are from and how
             many there are, and the rows follow. -->
        {#if group.items.length > 1}
          <li class="shape">
            <span class="shape-from">{group.items[0]?.from}</span>
            <span class="shape-n">{words.alike(group.items.length)}</span>
          </li>
        {/if}
        {#each group.items as item (item.id)}
        {@const i = place.get(item.id) ?? -1}
        <li class="arrival" data-cursor={i === cursor ? '' : undefined} data-open={open === item.id ? '' : undefined}>
          <!-- THE SUBJECT LEADS, then who sent it and the first of what they said, then when. The
               sender's domain led the row in a column of its own and was said again under the
               subject (DESIGN-SYSTEM D5). -->
          <button
            type="button"
            id="arrival-{item.id}"
            class="line line-tall"
            aria-expanded={open === item.id}
            onclick={() => {
              cursor = i;
              open = open === item.id ? null : item.id;
            }}
          >
            <span class="line-main">
              <span class="line-title">{item.subject}</span>
              <span class="line-detail"><span class="from">{item.from}</span>{#if open !== item.id && item.body}<span class="gist">{firstWords(item.body)}</span>{/if}</span>
            </span>
            <span class="line-when">{since(item.arrived, clock)}</span>
          </button>
          <button
            type="button"
            class="pick"
            role="checkbox"
            aria-checked={picked.has(item.id)}
            aria-label={item.subject}
            data-on={picked.has(item.id) ? '' : undefined}
            onclick={() => toggle(item.id)}
          >{#if picked.has(item.id)}<Icon name="check" size="s" />{/if}</button>

          {#if open === item.id}
            <div class="body">
              <!-- Plain text. Never the renderer, never {@html}, never a link the record made. -->
              <p class="raw">{item.body}</p>

              <!-- FILING IS THE PRIMARY, and the rule offer follows it at the ordinary weight. -->
              <div class="actions">
                {@render fileInto()}
                <Button weight="primary" disabled={busy} onclick={() => settle(item, 'file')}>{copy.fileIt}</Button>
                <Button weight="bare" disabled={busy} onclick={() => settle(item, 'archive')}>{copy.archiveArrival}</Button>
              </div>
              <!-- NO RULE OFFER ON ONE ARRIVAL. A rule is made from alike messages, so it is offered on the
                   group's row below, which opens the pattern builder with the group as its samples. -->
            </div>
          {/if}
        </li>
        {/each}
        <!-- THE GROUP'S OWN ROW OF ACTIONS, under its last arrival. Asking Slash waits for the record's threshold for a
             pattern, since it spends a model call; making the rule by hand (PLT-10, contracts X43) is offered for any
             group, because pointing at two alike messages costs nothing and already shows what the rule would read. -->
        {#if group.items.length > 1}
          <li class="shape-actions">
            {#if group.items.length >= ALIKE}
              <Button disabled={asking !== null} onclick={() => askPattern(group)}>
                {asking === group.shape ? words.asking : words.askPattern}
              </Button>
            {/if}
            <Button weight="quiet" href={builderPath(group.items.slice(0, SAMPLES_MOST).map((i) => i.id))}>{patternWords.fromInbox}</Button>
          </li>
        {/if}
      {/each}
    </ul>
    <CapLine shown={Math.min(INBOX.length, DOM_CAP)} total={INBOX.length} />
    {#if live && live.cursor !== null}
      <div class="older">
        <Button weight="quiet" onclick={loadOlder} disabled={older}>{copy.olderEntries}</Button>
      </div>
    {/if}
    {#if olderFix}<p class="foot">{olderFix}</p>{/if}

    {#if picked.size > 0}
      <!-- THE SELECTION'S BAR, stuck to the foot of the view after the list, so opening it moves nothing. -->
      <div class="batch" role="region" aria-label={copy.inboxSelected(picked.size)}>
        <span class="batch-n">{copy.inboxSelected(picked.size)}</span>
        {@render fileInto()}
        <Button weight="primary" disabled={busy} onclick={() => settlePicked('file')}>{copy.inboxFileSelected(picked.size)}</Button>
        <Button disabled={busy} onclick={() => settlePicked('archive')}>{copy.inboxArchiveSelected(picked.size)}</Button>
        <Button weight="bare" onclick={() => (picked = new Set())}>{copy.clearSelection}</Button>
      </div>
    {/if}
  {/if}
{/snippet}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max); /* One cap for every list page (DESIGN-SYSTEM 3.1, appendix C12). */
  }

  /* THE ONE LINE OF CONTEXT under the head: quiet, and the numbers in it keep their width as they change. */
  .tally {
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  /* THE SERIES SITS AT ITS OWN WIDTH, a set of three pills and not a bar across the page. */
  .series {
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment-n {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  /* A pattern is a row that opens its question: the title, and the glyph of where it goes. */
  .pattern {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--ink);
    text-decoration: none;
  }

  .pattern .line-main {
    flex: 1;
    min-inline-size: 0;
  }

  /* A FILED OR ARCHIVED ARRIVAL IS READ, NOT OPENED: its row is text, and Put back is the one thing it does. */
  .settled-line {
    display: grid;
    cursor: default;
  }

  .settled-detail {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
  }

  .settled-list {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }

  .settled-actions {
    display: flex;
    align-items: center;
    padding: var(--sp-2) var(--sp-3) 0;
  }

  /* An arrival is its row, the box that selects it, and its body when open. */
  .arrival {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    scroll-margin-block: var(--sp-7);
  }

  .arrivals > li + li {
    border-block-start: 1px solid var(--line);
  }

  /* A GROUP'S HEAD IS A QUIET LABEL, not a row: it opens nothing, so it is not drawn as one. */
  .shape {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    padding: var(--sp-4) var(--sp-3) var(--sp-2);
    font-size: var(--t-xs);
  }

  .shape-from {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink2);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shape-n {
    flex: none;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  /* A group reads as one block: no rule between its head and its first row, or between its last row and its actions. */
  .arrivals > .shape + li,
  .arrivals > li + .shape-actions {
    border-block-start: 0;
  }

  /* THE GROUP'S ACTIONS WRAP as the open row's do, and on a phone each is a full-width button under its group. */
  .shape-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-4);
  }

  .arrivals[data-picking] > li {
    scroll-margin-block-end: var(--sp-9);
  }

  /* The row is a `<button>`, at every width: it opens and closes. */
  .line {
    inline-size: 100%;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    font: inherit;
    cursor: pointer;
  }

  /* SUBJECT AND DETAIL, THEN WHEN. The `seq` column the rows share held the sender's domain here. */
  .arrival .line {
    grid-template-columns: minmax(0, 1fr) 9ch;
  }

  .arrival[data-open] .line-title {
    font-weight: 500;
  }

  /* THE CURSOR IS THE FOCUS RING, and only while it is the keyboard's. */
  .arrival .line:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: -2px;
  }

  .from {
    color: var(--ink2);
  }

  .gist::before {
    content: '·';
    margin-inline: var(--sp-2);
  }

  /* THE SELECTION BOX, at the trailing edge, where it is wanted and keeping its space where it is not. */
  .pick {
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    margin: var(--sp-3) var(--sp-3) 0 0;
    padding: 0;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    cursor: pointer;
    visibility: hidden;
  }

  .pick[data-on] {
    background: var(--on);
    border-color: var(--on);
  }

  .arrival:hover .pick,
  .arrival[data-cursor] .pick,
  .pick:focus-visible,
  .arrivals[data-picking] .pick {
    visibility: visible;
  }

  @media (pointer: coarse) {
    .pick {
      display: none;
    }

    .arrival {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE BODY SITS UNDER THE SUBJECT, on the page's own ground: space opens it, not a slab. */
  .body {
    grid-column: 1 / -1;
    padding: 0 var(--sp-3) var(--sp-5);
  }

  .raw {
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
    /* A body is text somebody else wrote, line breaks included, and one unbroken token must not
       push the card wider than the screen. */
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  /* The list a filed email goes into sits beside the button that files it, at the height of every control here. */
  .file-into {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .file-label {
    color: var(--dim);
    font-size: var(--t-xs);
    white-space: nowrap;
  }

  /* THE HOUSE FIELD, not the system's grey box. */
  .file-select {
    min-block-size: var(--ctl-h);
    max-inline-size: 100%;
    padding: 0 var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  @media (pointer: coarse) {
    .file-select {
      min-block-size: var(--tap);
    }
  }

  /* THEY WRAP. A row of actions that does not fit is wrapped, never cut. */
  .actions {
    flex-wrap: wrap;
    align-items: center;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .batch {
    position: sticky;
    inset-block-end: var(--sp-4);
    z-index: var(--z-raise);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-inline-start: auto;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }

  .batch-n {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* The page below is one control, the height every control is on this pointer. */
  .older {
    display: flex;
    justify-content: center;
  }

  .older :global(.btn) {
    min-block-size: var(--ctl-h);
  }

  .foot {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: center;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .batch {
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
    }
  }

  /* ON A CARD THE TIME SITS BESIDE THE SUBJECT, where the row's first line has room for it. */
  @media (width < 640px) {
    .shape-actions {
      flex-direction: column;
    }

    .shape-actions :global(.btn) {
      inline-size: 100%;
    }

    /* AT 390 AN ARRIVAL IS ONE CARD, and File and Archive are full-width pills under what it said, with the list it
       files into as a full-width field above them: a thumb reaches every one without aiming. */
    .actions {
      flex-direction: column;
      align-items: stretch;
    }

    .actions :global(.btn),
    .settled-actions :global(.btn) {
      inline-size: 100%;
    }

    .file-into {
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    .file-select {
      inline-size: 100%;
    }

    .settled-actions {
      padding: var(--sp-2) var(--sp-3) var(--sp-3);
    }

    .arrival .line {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .arrival .line-main {
      grid-column: 1;
      grid-row: 1;
    }

    .arrival .line-when {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
    }

    .arrival .line-detail {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
  }
</style>
