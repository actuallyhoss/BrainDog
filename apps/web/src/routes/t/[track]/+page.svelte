<!--
  A track: the thread you are in the middle of, and everything that has happened on it.

  It is deliberately NOT a declared page. A declared page is a row that a person arranges, and there
  is one of those per page; tracks are created and finished continuously, and a page declaration per
  track would put a schema change behind every "I am going to start looking at X". The blocks here
  are the same three questions every track asks: what has been said, which agents are on it, what is
  still open. They are the same for every track by design.

  AGENTS ARE THE RUNS ON THE THREAD'S PROJECT. A run in the kernel's `session` register carries a
  project and no thread, so the tile names the project rather than claiming the thread.

  THE LOOK. The title row says where the thread stands in one line: the newest update's health as a
  dot and its word, then who said it and when. The main lane is a list-and-lane screen: the composer is a tile at its
  head, where the update it writes will appear, and the thread follows on the ground with no box. The side lane holds
  the one figure this screen has, the agents' time over the last day as swimlanes with the one line saying what they
  mean, and the open tasks as a group on the ground, since an open count alone is no chart. Below 1100 the side lane
  stacks under the thread, so on a phone the composer comes first.

  The update thread is FIRST. The health in the title row is derived from the newest row of it, so
  putting the runs or the tasks above it would separate the claim from its evidence by a screen.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { since } from 'braindog-render';
  import { CapLine } from 'braindog-render/svelte';
  import { page as route } from '$app/state';

  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import {
    DOM_CAP,
    actorOf,
    display,
    healthLabel,
    healthTone,
    healthOf,
    labelOf,
    runsIn,
    updatesIn,
    workingAt,
  } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import type { Entry } from '$lib/record/schema.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Opened } from '$lib/record/track-live.ts';
  import type { RowWriter } from '$lib/record/rows-write.ts';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { liveOf } from '$lib/ui/face.ts';
  import { actor } from '$lib/record/names.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Swimlanes from '$lib/viz/Swimlanes.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, opened } from '../../../lib/ui/screen.svelte.ts';
  import { healthChoices, healthSaid } from './health.ts';
  import { lanesOf, lanesSaid } from './lanes.ts';

  /**
   * THIS THREAD IS THE RECORD'S, and nothing of the sample is mixed into it.
   *
   * Every block on this screen used to come from the built-in sample whatever record was open, so
   * somebody signed into their own record read another business's updates under their own thread's
   * name, with nothing on the page to doubt. The five registers it draws from are all readable
   * already: `tracks`, `updates`, `tasks` and `things` are declared, and `session` is the kernel's.
   *
   * A REFUSAL IS THE RECORD'S OWN SENTENCE, whichever it is. A read that found no record drew the
   * sample's thread here until the sample was taken away; it is a refusal like any other now.
   *
   * THE READ IS FOR THE WHOLE RECORD RATHER THAN FOR ONE THREAD, so moving between threads on one
   * record costs nothing and the component is not re-read when the address changes.
   */
  let got = $state<Opened | null>(null);
  const fromRecord = $derived(got?.from === 'live');
  const refused = $derived(got?.from === 'refused' ? got.fix : null);
  /** Nothing is drawn until the record has answered. */
  const answered = $derived(got !== null);
  const rows: Record<string, Entry[] | undefined> = $derived(got?.from === 'live' ? got.thread : {});
  /* THE CLOCK THE AGES ARE READ AGAINST: the reader's, as of the read. An update's staleness and
     whether a run is working now are both measured from it. */
  const clock = $derived(got?.from === 'live' ? got.now : Date.now());

  const seq = $derived(Number(route.params.track ?? 0));
  const track = $derived((rows.tracks ?? []).find((t) => t.seq === seq));

  const health = $derived(healthOf(track, rows.updates ?? [], seq, clock));
  const updates = $derived(updatesIn(rows.updates ?? [], seq));
  /* The thread's project, and the runs placed in it by the project's spoken id, `things#1`. */
  const project = $derived((rows.things ?? []).find((t) => track !== undefined && t.seq === Number(track.fields.thing)));
  const runs = $derived(project ? runsIn(rows.session ?? [], `things#${project.seq}`) : []);
  /**
   * The tasks on this track that are STILL OPEN, which is what the heading says.
   *
   * IT FILTERED ON THE TRACK AND NOT ON THE STATE. The section is titled "Still open" and carried
   * every task pointing at the track — `done` and `dropped` among them — with the count beside the
   * heading counting those too. A heading that claims a predicate the list does not apply is worse
   * than no heading: somebody reads three and believes three are outstanding.
   */
  const tasks = $derived(
    (rows.tasks ?? []).filter(
      (t) => Number(t.fields.track) === seq && t.fields.state !== 'done' && t.fields.state !== 'dropped',
    ),
  );

  /**
   * THE AGENTS' LAST DAY ON THE PROJECT, AS LANES: each run from when its row was written to when it was last heard from,
   * a run working now reaching the now line (`lanes.ts`). Read off the rows already in hand; nothing else is asked.
   */
  const lanes = $derived(
    lanesOf(
      runs.map((s) => ({
        agent: String(s.fields.agent ?? ''),
        created: s.created,
        lastSeen: String(s.fields.last_seen ?? ''),
        working: workingAt(s, clock),
      })),
      clock,
    ),
  );

  /**
   * THE SCREEN SAYING IT HAS SETTLED, and on a live record that is the read coming back.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. The claim is bracketed by `opened()` and `closed()`: a
   * call still out takes the attribute away, which is the line the old comment here promised would be
   * honoured the day this screen started asking. The sample's synchronous claim went with it.
   */
  $effect(() => {
    /* UNTRACKED, or the effect reads the pending count it writes, and every answer opens the read again. */
    const at = untrack(opened);
    let ok = false;
    void import('$lib/record/track-live.ts')
      .then((m) => m.trackReader(apiBase()).read())
      .then((out) => {
        got = out;
        ok = out.from !== 'refused';
      })
      .finally(() => closed(ok, at));
  });

  /**
   * POSTING AN UPDATE, THE ONE WRITE THIS SCREEN HAS.
   *
   * IT WRITES, OR IT DOES NOTHING. The thread is drawn only once the record has answered, so the
   * button is only ever pressed over a record's thread; the sample's "would be posted" toast went
   * with the sample.
   *
   * THE READER STAYS READ-ONLY. `track-live.ts` is a `TrackReader` by design, so this goes through
   * `rows-write.ts`, the module the list and the row already write through, rather than widening a
   * reader to carry a verb one screen needs.
   *
   * THE BOX ASKS FOR TWO OF THE FOUR PARTS. `updates` declares prose, a health, an author and a
   * date, and only the first two are anybody's to say: the author is whoever is signed in and the
   * date is now. A health is asked for rather than chosen on somebody's behalf, because the
   * declaration's own rule is that prose without a health is not an update.
   *
   * THE BOX IS ALWAYS THERE, as the tile at the head of the thread, so saying where a thread stands is never behind a
   * press; its Post is the screen's one primary.
   */
  const bodyField = REGISTERS.updates?.fields.find((f) => f.id === 'body');
  const healthField = REGISTERS.updates?.fields.find((f) => f.id === 'health');
  let draft = $state('');
  let draftHealth = $state(String(healthField?.values?.[0] ?? ''));
  let form = $state<HTMLFormElement>();

  /* THIS SCREEN'S OWN WORDS. `working` is the word beside a working run's face, so its ring is never the only
     sign; `said` is the title row's line after the health. */
  const trackWords = {
    working: 'Working now',
    say: 'Say where it stands',
    said: (ago: string, who: string) => `said ${ago} by ${who}`,
    unsaid: 'Nobody has said where this stands yet.',
  };
  let posting = $state(false);
  let writer: RowWriter | null = null;

  async function post(e: SubmitEvent) {
    e.preventDefault();
    const words = draft.trim();
    if (!words || posting || !fromRecord) return;
    /* The thread it is about, read before the write goes, so an update lands on the thread it was
       typed on even if the address moves while the record is answering. */
    const on = seq;
    posting = true;
    const m = await import('$lib/record/rows-write.ts');
    writer ??= m.rowWriter(apiBase());
    const out = await writer.create('updates', {
      body: words,
      health: draftHealth,
      track: on,
      by: 'you',
      at: new Date().toISOString(),
    });
    posting = false;
    /* THE RECORD'S OWN SENTENCE, whichever of the three readings it is, and the typed words stay
       where they were: a refusal that empties the box costs somebody the thing they wrote. */
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    /**
     * THE ROW THE RECORD WROTE, PUT INTO THE THREAD IT WAS WRITTEN TO, rather than reading again.
     *
     * `create` answers with the row AS STORED, through the same `entryOf` the reader's own rows go
     * through, so it draws exactly like one that was read. That is the list screen's argument for
     * landing a written row where it stands, and it holds here for one more reason: this screen's
     * read is of the whole record, so reading again would walk five registers to learn one line
     * this answer already carries.
     *
     * NOTHING SAYS SO IN A TOAST. The update appearing in the thread, with the health in the title
     * row moving to agree with it, is the receipt, which is why a note on a row has none either.
     */
    const held = got;
    if (held?.from === 'live')
      got = { ...held, thread: { ...held.thread, updates: [out.entry, ...held.thread.updates] } };
    draft = '';
  }

  /* ⌘↵ POSTS FROM THE BOX, the chord every other composer in the product takes. On the field, not the window: it acts
     only on what is being typed here. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey) {
      e.preventDefault();
      form?.requestSubmit();
    }
  }
</script>

<!-- THE REGISTER'S OWN NAME. Both of these were the literal `Tracks`, so the rename to Threads
     changed the list and the rail and left this screen, which is a row OF that list, saying the
     word the rest of the product had stopped using. -->
<svelte:head><title>{titleOf(track && String(track.fields.name), REGISTERS.tracks?.name ?? '')}</title></svelte:head>

<!-- THE TITLE ROW'S LINE: the health as its dot and word, and who said it and when. The health is a CLAIM SOMEBODY MADE
     rather than a computed status, and the thread below says in full who said so. AND ONLY ONCE SOMEBODY HAS SAID ONE:
     with no update the chip read "Update missing", a capsule standing for a value nobody gave. Off track is
     the one that needs him, so it alone takes the red. -->
{#snippet standing()}
  {#if health.health}<span class="standing" data-needs={health.health === 'off_track' ? '' : undefined}><Chip label={healthLabel(health, REGISTERS.updates)} tone={healthTone(health.health)} /></span><span class="standing-by">{trackWords.said(since(String(health.asOf), clock), actorOf(String(health.by)))}</span>{:else}{trackWords.unsaid}{/if}
{/snippet}

{#if refused !== null}
  <div class="page gone">
    <!-- THE RECORD'S OWN SENTENCE. A record without the work pack has no `tracks` at all, and being
         told so is the honest answer to an address that names one. -->
    <Empty kind="error" heading title={refused} />
  </div>
{:else if !answered}
  <!-- Bars until the record has answered. -->
  <Waiting head />
{:else if !track}
  <div class="page gone">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <!-- AND SO DID THE REFUSAL AND THE WAY OUT OF IT. Four literals below the comment above said
         `track` while the head and the kicker beside them read the declaration and said Thread.
         Both of these are read from the declaration now: `one` is the word for a single row and
         `name` is the word for the list, so neither can drift from the register again. The word
         behind the `??` is only ever reached by a record with no such list, where every noun for
         it is a guess and the row it names cannot exist either. -->
    <Empty kind="error" heading title={copy.noSuch(REGISTERS.tracks?.one ?? 'thread', String(route.params.track))}>
      {#snippet actions()}
        <Button weight="primary" href="/r/tracks">{copy.openUnfiltered(REGISTERS.tracks?.name ?? '')}</Button>
      {/snippet}
    </Empty>
  </div>
{:else}
  <PageHead
    kicker={REGISTERS.tracks?.name ?? ''}
    back="/r/tracks"
    title={String(track.fields.name)}
    icon="rows"
    sentence={health.health || health.state === 'missing' ? standing : undefined}
  />

  <div class="page">
    <section class="lane">
      <!-- AT THE HEAD OF THE THREAD, WHERE THE UPDATE IT WRITES WILL APPEAR, so the gesture and its outcome are in one
           place on the screen. The two labels are the declaration's own, which is how the rest of this screen names
           things: a renamed field renames them. -->
      <Tile icon="edit" title={trackWords.say} lead>
        <form class="composer" bind:this={form} onsubmit={post}>
          <label class="field-label" for="update-body">{bodyField ? labelOf(bodyField) : ''}</label>
          <textarea id="update-body" class="c-area" rows="3" dir="auto" bind:value={draft} {onkeydown}></textarea>
          <!-- THE HEALTH AS PILLS, NOT THE BROWSER'S MENU: the choices are few and
               declared, so every one is on screen and the chosen one is `[data-on]`, as every segmented control is. -->
          <div class="c-line">
            <div class="c-health">
              <p class="field-label" id="update-health">{healthField ? labelOf(healthField) : ''}</p>
              <div class="segmented" role="group" aria-labelledby="update-health">
                {#each healthChoices(REGISTERS.updates) as [v, said] (v)}
                  <button type="button" class="segment" aria-pressed={draftHealth === v} data-on={draftHealth === v ? '' : undefined} onclick={() => (draftHealth = v)}>{said}</button>
                {/each}
              </div>
            </div>
            <Button type="submit" weight="primary" kbd="⌘↵" disabled={posting || draft.trim() === ''}>
              {posting ? copy.writeMarkSaving : copy.post}
            </Button>
          </div>
        </form>
      </Tile>

      <Section title="What has been said" count={updates.length}>
      {#if updates.length === 0}
        <!-- Not an error, and not styled as one. Nobody has written about this thread yet, which is
             the ordinary state of one somebody started this morning. -->
        <Empty kind="no-data-yet" title="No update yet" body={copy.threadNoUpdate} />
      {:else}
        <ol class="thread">
          {#each updates.slice(0, DOM_CAP) as u (u.seq)}
            {@const who = actorOf(String(u.fields.by))}
            <li class="update">
              <!-- WHO SAID IT, AS A FACE, so an update reads as somebody speaking rather than a log
                   line; the health stays on the chip. -->
              <div class="u-head">
                <Face name={who} you={who === 'you'} kind={actor(String(u.fields.by)).kind} />
                <span class="u-by">{who.charAt(0).toUpperCase() + who.slice(1)}</span>
                <Chip
                  label={healthSaid(REGISTERS.updates, String(u.fields.health))}
                  tone={healthTone(String(u.fields.health) as never)}
                />
                <span class="u-at">{since(String(u.fields.at), clock)}</span>
              </div>
              <p class="u-body" dir="auto">{u.fields.body}</p>
            </li>
          {/each}
        </ol>
        <CapLine shown={Math.min(updates.length, DOM_CAP)} total={updates.length} />
        <p class="foot">
          Updates are never edited. A correction is a new update that replaces the one before it, so the
          thread stays the record of what was believed and when.
        </p>
      {/if}
      </Section>
    </section>

    <aside class="side">
      <!-- A thread on no project has no agents to name, so the tile is not drawn. -->
      {#if project}
      <Tile icon="session" title="Agents on {project.fields.name}" count={runs.length}>
      {#if runs.length === 0}
        <p class="reading">No agent has worked on {project.fields.name}.</p>
      {:else}
        <!-- THE ONE FIGURE ON THIS SCREEN, AND ITS LINE: who was busy when over the last day, the now
             line in `live`, and what that adds up to in words. Runs older than the day are still listed under it. -->
        {#if lanes.lanes.length > 0}
          <Swimlanes lanes={lanes.lanes} start={lanes.start} end={lanes.end} now={clock} subject="Agents on {project.fields.name}" />
        {/if}
        <p class="reading">{lanesSaid(lanes, String(project.fields.name))}</p>
        <ul class="ledger ledger-lead">
          {#each runs.slice(0, DOM_CAP) as s (s.seq)}
            {@const working = workingAt(s, clock)}
            <!-- NO DOOR TO A RUN'S JOB. Nothing answers with a run's tool calls, so a run on a record
                 has no transcript to open; the door was drawn only on the sample's worked examples. The face names no
                 run, so it is not a second door inside the row's own. -->
            <li>
              <a class="line line-tall" href={at(`/r/session/${s.seq}`)}>
                <span class="line-mark"><AgentFace agent={String(s.fields.agent ?? '')} run="" live={liveOf(s.fields.state, !working)} /></span>
                <span class="line-main">
                  <span class="line-title" dir="auto">{s.fields.doing}</span>
                  <!-- THE RING'S WORD BESIDE IT: a mark never stands alone. -->
                  <span class="line-detail">{working ? `${trackWords.working} · ` : ''}{s.fields.agent} · {since(String(s.fields.last_seen), clock)}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
        <CapLine shown={Math.min(runs.length, DOM_CAP)} total={runs.length} />
      {/if}
      </Tile>
      {/if}

      <!-- A GROUP ON THE GROUND AND NOT A TILE: an open count on its own is no chart, and the done ones are not in hand
           to draw progress against. Each task leads with its round check, drawn and not pressed: the row is the way to
           the task, where it is ticked. -->
      <Section title="Still open" count={tasks.length}>
      {#if tasks.length === 0}
        <!-- `points at` is the schema's word for a `ref`, and the second half reassured the reader
             that nothing was wrong — the product explaining itself rather than saying the fact. -->
        <p class="quiet">{copy.threadNoTasks}</p>
      {:else}
        <ul class="ledger ledger-lead">
          {#each tasks as t (t.seq)}
            <li>
              <a class="line line-tall" href={at(`/r/tasks/${t.seq}`)}>
                <span class="line-mark"><span class="line-check" aria-hidden="true"></span></span>
                <span class="line-main">
                  <span class="line-title" dir="auto">{t.fields.what}</span>
                  <span class="line-detail">{display('tasks', 'by', t.fields.by) ?? 'no date'}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
      </Section>
    </aside>
  </div>
{/if}

<style>
  /* THE WORK UNDER THE TITLE ROW: the page's gutter, and 12 between the lanes and between what stands in each. */
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-6) var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1560px;
  }

  /* THE SIDE LANE FROM 1100: 360 beside the thread, both from the same top edge. */
  @media (width >= 1100px) {
    .page:not(.gone) {
      grid-template-columns: minmax(0, 1fr) 360px;
    }
  }

  .gone {
    padding-block-start: var(--inset);
  }

  .lane,
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  /* ── The title row's line ──────────────────────────────────────────────── */

  .standing {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: -1px;
  }

  /* THE HEALTH READS AT THE SENTENCE'S SIZE, and off track, the one that needs him, reads in red. */
  .standing :global(.chip) {
    color: var(--ink);
    font-size: var(--t-md);
    line-height: 24px;
  }

  .standing[data-needs] :global(.chip) {
    color: var(--danger);
  }

  .standing-by {
    color: var(--ink2);
  }

  /* ── The composer ──────────────────────────────────────────────────────── */

  .composer {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  /* A FIELD: the `--s1` fill, radius 12 and no border, the ink ring when focused (`controls.css`). 16PX AT
     EVERY WIDTH, so a phone does not zoom into it, and it scrolls clear of the keyboard with the health and Post under
     it still in view. */
  .c-area {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: calc(var(--row-h-2) * 2);
    padding: var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
    scroll-margin-block: calc(var(--sticky) + var(--sp-4)) var(--sp-9);
  }

  .c-area:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .c-area::placeholder {
    color: var(--dim);
  }

  /* THE HEALTH AND POST ON ONE LINE UNDER THE FIELD, Post at the end; they wrap to two under a thumb. */
  .c-line {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  .c-health {
    min-inline-size: 0;
  }

  .c-health .field-label {
    margin-block-start: 0;
  }

  /* NO KEY CAP UNDER A THUMB: there is no keyboard to press it with. */
  @media (pointer: coarse) {
    .composer :global(.btn-kbd) {
      display: none;
    }

    .composer :global(.btn:has(.btn-kbd)) {
      padding-inline-end: var(--sp-4);
    }
  }

  /* ── The thread ────────────────────────────────────────────────────────── */

  .thread {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* UNBOXED. Each update was a card with its health painted down the leading edge, so a thread read
     as a stack of panels. Now they follow one another with a hairline between, and the health is
     said once, on the chip. */
  .update {
    padding-block: var(--sp-3) var(--sp-4);
  }

  .update + .update {
    border-block-start: 1px solid var(--rule);
  }

  /* THE HEAD OF AN UPDATE IS A ROW'S: the face, the author at the row's size, the health's dot and word, and the time
     in meta at the end. */
  .u-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-block-size: var(--well-l);
    margin-block-end: var(--sp-1);
  }

  .u-by {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
  }

  .u-at {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  /* Under the name rather than under the face, so the words line up with who said them: the 24px face `Face` draws at
     its default size, and the head's 12 after it. */
  .u-body {
    margin: 0;
    padding-inline-start: calc(24px + var(--sp-3));
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .foot {
    margin-block: var(--sp-4) 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* ── The side lane ─────────────────────────────────────────────────────── */

  /* THE LINE UNDER THE LANES: what the chart means, in the second ink. */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    text-wrap: pretty;
  }

  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE RUNS INSIDE THE TILE KEEP TO THE TILE'S OWN WIDTH, so a row's wash stays inside the tile's padding. */
  .side :global(.tile .ledger) {
    margin-inline: calc(-1 * var(--sp-2));
  }

  .side :global(.tile .ledger .line) {
    padding-inline: var(--sp-2);
  }

  /* THE `live` RING ON A RUN'S FACE: solid while it works, dashed once it has gone quiet. `AgentFace` draws
     the ring only on a face that is a door to its run, and this one is not, because the whole row is that door. */
  .line-mark :global(.agent-face:is([data-live='working'], [data-live='quiet'])) {
    border-color: var(--live);
    box-shadow: inset 0 0 0 1px var(--bg);
  }

  /* On a phone the lanes are rows of 60 through `rows.css`, and the update's text reads at 16. */
  @media (width < 900px) {
    .u-body {
      font-size: var(--t-md);
      line-height: 24px;
    }
  }
</style>
