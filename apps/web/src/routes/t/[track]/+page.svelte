<!--
  A track: the thread you are in the middle of, and everything that has happened on it.

  It is deliberately NOT a declared page. A declared page is a row that a person arranges, and there
  is one of those per page; tracks are created and finished continuously, and a page declaration per
  track would put a schema change behind every "I am going to start looking at X". The blocks here
  are the same three questions every track asks: what has been said, which agents are on it, what is
  still open. They are the same for every track by design.

  AGENTS ARE THE RUNS ON THE THREAD'S PROJECT. A run in the kernel's `session` register carries a
  project and no thread, so the section names the project rather than claiming the thread.

  The update thread is FIRST. The health chip in the header is derived from the newest row of it, so
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
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { actor } from '$lib/record/names.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, opened } from '../../../lib/ui/screen.svelte.ts';
  import { healthChoices, healthSaid } from './health.ts';

  /**
   * THIS THREAD IS THE RECORD'S, and nothing of the sample is mixed into it.
   *
   * Every block on this screen used to come from the built-in sample whatever record was open, so
   * somebody signed into their own record read another business's updates under their own thread's
   * name, with nothing on the page to doubt. The five registers it draws from are all readable
   * already: `tracks`, `updates`, `tasks` and `things` are declared, and `session` is the kernel's.
   *
   * A REFUSAL IS THE RECORD'S OWN SENTENCE, whichever it is. A read that found no record drew the
   * sample's thread here until DIRECTION 26 took the sample away; it is a refusal like any other now.
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

  const live = $derived(runs.filter((r) => workingAt(r, clock)).length);

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
   */
  const bodyField = REGISTERS.updates?.fields.find((f) => f.id === 'body');
  const healthField = REGISTERS.updates?.fields.find((f) => f.id === 'health');
  let composing = $state(false);
  let draft = $state('');
  let draftHealth = $state(String(healthField?.values?.[0] ?? ''));

  /* THE WORD BESIDE A WORKING RUN'S DOT (DSN-18), so the dot's colour is never the only sign. */
  const trackWords = { working: 'Working now' };
  let posting = $state(false);
  let writer: RowWriter | null = null;

  function startPost() {
    if (fromRecord) composing = true;
  }

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
     * NOTHING SAYS SO IN A TOAST. The update appearing in the thread, with the health chip in the
     * header moving to agree with it, is the receipt, which is why a note on a row has none either.
     */
    const held = got;
    if (held?.from === 'live')
      got = { ...held, thread: { ...held.thread, updates: [out.entry, ...held.thread.updates] } };
    draft = '';
    composing = false;
  }
</script>

<!-- THE REGISTER'S OWN NAME. Both of these were the literal `Tracks`, so the rename to Threads
     changed the list and the rail and left this screen, which is a row OF that list, saying the
     word the rest of the product had stopped using. -->
<svelte:head><title>{titleOf(track && String(track.fields.name), REGISTERS.tracks?.name ?? '')}</title></svelte:head>

{#if refused !== null}
  <div class="page">
    <!-- THE RECORD'S OWN SENTENCE. A record without the work pack has no `tracks` at all, and being
         told so is the honest answer to an address that names one. -->
    <Empty kind="error" heading title={refused} />
  </div>
{:else if !answered}
  <!-- Bars until the record has answered. -->
  <Waiting head />
{:else if !track}
  <div class="page">
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
  <PageHead kicker={REGISTERS.tracks?.name ?? ''} back="/r/tracks" title={String(track.fields.name)} icon="rows">
    {#snippet actions()}
      <!-- The health, and it is a CLAIM SOMEBODY MADE rather than a computed status: the chip says
           what the newest update said, and the thread below it says who said so and when. -->
      <!-- AND ONLY ONCE SOMEBODY HAS SAID ONE (DSN-18). With no update the chip read "Update missing" beside the primary,
           a capsule standing for a value nobody gave; the thread below says there is none yet, once. -->
      {#if health.health}<Chip label={healthLabel(health, REGISTERS.updates)} tone={healthTone(health.health)} />{/if}
      <Button weight="primary" onclick={startPost}>
        <Icon name="plus" size="s" />
        {copy.postUpdate}
      </Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <section class="lane">
      <Section title="What has been said" count={updates.length}>
      {#if composing}
        <!-- AT THE HEAD OF THE THREAD, WHERE THE UPDATE IT WRITES WILL APPEAR, so the gesture and
             its outcome are in one place on the screen. The two labels are the declaration's own,
             which is how the rest of this screen names things: a renamed field renames them. -->
        <form class="composer" onsubmit={post}>
          <label class="c-label" for="update-body">{bodyField ? labelOf(bodyField) : ''}</label>
          <textarea id="update-body" class="c-area" rows="4" dir="auto" bind:value={draft}></textarea>
          <!-- THE HEALTH AS PILLS, NOT THE BROWSER'S MENU (DSN-18, design brief §11.10): the choices are few and
               declared, so every one is on screen and the chosen one is `[data-on]`, as every segmented control is. -->
          <p class="c-label" id="update-health">{healthField ? labelOf(healthField) : ''}</p>
          <div class="segmented" role="group" aria-labelledby="update-health">
            {#each healthChoices(REGISTERS.updates) as [v, said] (v)}
              <button type="button" class="segment" aria-pressed={draftHealth === v} data-on={draftHealth === v ? '' : undefined} onclick={() => (draftHealth = v)}>{said}</button>
            {/each}
          </div>
          <div class="c-line">
            <Button type="submit" weight="primary" disabled={posting || draft.trim() === ''}>
              {posting ? copy.writeMarkSaving : copy.post}
            </Button>
            <Button weight="bare" onclick={() => (composing = false)}>{copy.editCancel}</Button>
          </div>
        </form>
      {/if}
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
      <!-- A thread on no project has no agents to name, so the section is not drawn. -->
      {#if project}
      <Section title="Agents on {project.fields.name}" count={runs.length}>
      {#if runs.length === 0}
        <p class="quiet">No agent has worked on {project.fields.name}.</p>
      {:else}
        <ul class="rows">
          {#each runs.slice(0, DOM_CAP) as s (s.seq)}
            <!-- NO DOOR TO A RUN'S JOB. Nothing answers with a run's tool calls, so a run on a record
                 has no transcript to open; the door was drawn only on the sample's worked examples. -->
            <li>
              <a class="row" href={at(`/r/session/${s.seq}`)}>
                <span class="dot" data-live={workingAt(s, clock)}></span>
                <span class="row-main">
                  <span class="row-title" dir="auto">{s.fields.doing}</span>
                  <!-- THE DOT'S WORD BESIDE IT: a dot never stands alone (design brief §5, Status). -->
                  <span class="row-sub">{workingAt(s, clock) ? `${trackWords.working} · ` : ''}{s.fields.agent} · {since(String(s.fields.last_seen), clock)}</span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
        <CapLine shown={Math.min(runs.length, DOM_CAP)} total={runs.length} />
        {#if live}<p class="quiet">{live} working right now.</p>{/if}
      {/if}
      </Section>
      {/if}

      <Section title="Still open" count={tasks.length}>
      {#if tasks.length === 0}
        <!-- `points at` is the schema's word for a `ref`, and the second half reassured the reader
             that nothing was wrong — the product explaining itself rather than saying the fact. -->
        <p class="quiet">{copy.threadNoTasks}</p>
      {:else}
        <ul class="rows">
          {#each tasks as t (t.seq)}
            <li>
              <a class="row" href={at(`/r/tasks/${t.seq}`)}>
                <span class="row-main">
                  <span class="row-title" dir="auto">{t.fields.what}</span>
                  <span class="row-sub">{display('tasks', 'by', t.fields.by) ?? 'no date'}</span>
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
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    align-items: start;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1560px;
  }

  @media (width < 1000px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .lane,
  .side {
    min-inline-size: 0;
  }

  .thread {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* UNBOXED. Each update was a card with its health painted down the leading edge, so a thread read
     as a stack of panels. Now they follow one another with a hairline between, and the health is
     said once, on the chip, which is the last thing on a thread that should be shouted. */
  .update {
    padding-block: var(--sp-4);
  }

  .update + .update {
    border-block-start: 1px solid var(--line-soft);
  }

  .u-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-end: var(--sp-2);
  }

  .u-by {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .u-at {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* Under the name rather than under the face, so the words line up with who said them. `28px` is
     the disc `Face` draws at its default size. */
  .u-body {
    padding-inline-start: calc(28px + var(--sp-3));
    color: var(--ink);
    font-size: var(--t-ui);
    line-height: var(--lh-body);
    max-inline-size: var(--measure);
  }

  .foot {
    margin-block-start: var(--sp-4);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: var(--lh-body);
  }

  /* UNBOXED, like every other list: rows on the page with a hairline between, reaching a step past
     the text column so a row's words line up with the heading and its hover has room. */
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--sp-3)) var(--sp-4);
    padding: 0;
    list-style: none;
  }

  .rows li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* A ROW AT THE HEIGHT OF A TWO-LINE ROW, the whole of it the target, and a wash only under a mouse. */
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--hover-wash);
    }
  }

  .row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .row-title {
    font-size: var(--t-base);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-sub {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A run working now is the only one that gets the accent. An idle run is not news and a finished
     one is history; painting all of them would make the colour mean "a run" rather than "working now". */
  .dot {
    inline-size: var(--dot);
    block-size: var(--dot);
    flex: none;
    border-radius: var(--r-pill);
    background: var(--edge);
  }

  .dot[data-live='true'] {
    background: var(--earn-fill);
  }

  .quiet {
    margin-block-end: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* Unboxed, like the updates under it: a hairline between the box and the thread rather than a
     card floating over a list that has none. */
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block: var(--sp-4);
    border-block-end: 1px solid var(--line-soft);
  }

  .c-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* 16PX IN THE FIELD AT EVERY WIDTH, so a phone does not zoom into it, and it scrolls clear of the keyboard with the
     health and Post under it still in view. */
  .c-area {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
    scroll-margin-block: calc(var(--sticky) + var(--sp-4)) var(--sp-9);
  }

  .c-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }
</style>
