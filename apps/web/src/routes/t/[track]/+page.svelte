<!--
  A track: the thread you are in the middle of, and everything that has happened on it.

  THIS PAGE IS THE REASON THE PIN EXISTS. An agent session is a thing that happened once; pinned to a
  track it becomes part of a thread you can come back to on Tuesday and read in order. Without a
  surface that gathers them, the field on the session row is a field nobody would ever look at.

  It is deliberately NOT a declared page. A declared page is a row that a person arranges, and there
  is one of those per page; tracks are created and finished continuously, and a page declaration per
  track would put a schema change behind every "I am going to start looking at X". The blocks here
  are the same three questions every track asks — what has been said, who is working on it, what is
  still open — and they are the same for every track by design.

  The update thread is FIRST. The health chip in the header is derived from the newest row of it, so
  putting the sessions or the tasks above it would separate the claim from its evidence by a screen.
-->
<script lang="ts">
  import { since } from 'braindog-render';
  import { CapLine } from 'braindog-render/svelte';
  import { page as route } from '$app/state';

  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import {
    DOM_CAP,
    NOW,
    REGISTERS,
    ROWS,
    actorOf,
    display,
    healthLabel,
    healthTone,
    sessionsFor,
    trackHealth,
    updatesFor,
  } from '$lib/record/api.ts';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

  const seq = $derived(Number(route.params.track ?? 0));
  const track = $derived((ROWS.tracks ?? []).find((t) => t.seq === seq));

  const health = $derived(trackHealth(seq));
  const updates = $derived(updatesFor(seq));
  const sessions = $derived(sessionsFor(seq));
  /**
   * The tasks on this track that are STILL OPEN, which is what the heading says.
   *
   * IT FILTERED ON THE TRACK AND NOT ON THE STATE. The section is titled "Still open" and carried
   * every task pointing at the track — `done` and `dropped` among them — with the count beside the
   * heading counting those too. A heading that claims a predicate the list does not apply is worse
   * than no heading: somebody reads three and believes three are outstanding.
   */
  const tasks = $derived(
    (ROWS.tasks ?? []).filter(
      (t) => Number(t.fields.track) === seq && t.fields.state !== 'done' && t.fields.state !== 'dropped',
    ),
  );

  const live = $derived(sessions.filter((s) => s.fields.state === 'live').length);

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<!-- THE REGISTER'S OWN NAME. Both of these were the literal `Tracks`, so the rename to Threads
     changed the list and the rail and left this screen, which is a row OF that list, saying the
     word the rest of the product had stopped using. -->
<svelte:head><title>{titleOf(track && String(track.fields.name), REGISTERS.tracks?.name ?? '')}</title></svelte:head>

{#if !track}
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
  <PageHead kicker={REGISTERS.tracks?.name ?? ''} title={String(track.fields.name)} icon="rows">
    {#snippet actions()}
      <!-- The health, and it is a CLAIM SOMEBODY MADE rather than a computed status: the chip says
           what the newest update said, and the thread below it says who said so and when. -->
      <Chip label={healthLabel(health)} tone={healthTone(health.health)} />
      <Button weight="primary" onclick={() => toasts.push(copy.notWritten('An update would be posted'))}>
        <Icon name="plus" size="s" />
        Post an update
      </Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <section class="lane">
      <Section title="What has been said" count={updates.length}>
      {#if updates.length === 0}
        <!-- Not an error, and not styled as one. Nobody has written about this thread yet, which is
             the ordinary state of one somebody started this morning. -->
        <Empty kind="no-data-yet" title="No update yet." body={copy.threadNoUpdate} />
      {:else}
        <ol class="thread">
          {#each updates.slice(0, DOM_CAP) as u (u.seq)}
            {@const who = actorOf(String(u.fields.by))}
            <li class="update">
              <!-- WHO SAID IT, AS A FACE. The disc Home's feed gives a writer, so an update reads as
                   somebody speaking rather than a log line; the health stays on the chip. -->
              <div class="u-head">
                <span class="face" data-you={who === 'you' ? '' : undefined} aria-hidden="true">{who.charAt(0).toUpperCase()}</span>
                <span class="u-by">{who.charAt(0).toUpperCase() + who.slice(1)}</span>
                <Chip
                  label={String(u.fields.health).replace(/_/g, ' ')}
                  tone={healthTone(String(u.fields.health) as never)}
                />
                <span class="u-at">{since(String(u.fields.at), NOW)}</span>
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
      <Section title="Working on this" count={sessions.length}>
      {#if sessions.length === 0}
        <!-- `pinned` appeared nowhere else in the product and nothing pins anything. -->
        <p class="quiet">Nobody is working on this.</p>
      {:else}
        <ul class="rows">
          {#each sessions.slice(0, DOM_CAP) as s (s.seq)}
            <li>
              <a class="row" href="/r/sessions/{s.seq}">
                <span class="dot" data-state={s.fields.state}></span>
                <span class="row-main">
                  <span class="row-title" dir="auto">{s.fields.doing}</span>
                  <span class="row-sub">{s.fields.agent} · {since(String(s.fields.last_seen), NOW)}</span>
                </span>
              </a>
              <!-- A SESSION SAYS WHAT IT IS DOING; THE RUN IS WHAT IT IS DOING IT WITH — the tool
                   calls in order, with what each one answered. The two existed and there was no way
                   to get from one to the other, so the run screen was reachable from nowhere in the
                   product at all. Only on a session that carries one: an ended session kept its
                   transcript and its run is over. -->
              {#if s.fields.job}
                <a class="row-run tap" href="/jobs/{s.fields.job}">{copy.watchRun}</a>
              {/if}
            </li>
          {/each}
        </ul>
        <CapLine shown={Math.min(sessions.length, DOM_CAP)} total={sessions.length} />
        {#if live}<p class="quiet">{live} working right now.</p>{/if}
      {/if}
      </Section>

      <Section title="Still open" count={tasks.length}>
      {#if tasks.length === 0}
        <!-- `points at` is the schema's word for a `ref`, and the second half reassured the reader
             that nothing was wrong — the product explaining itself rather than saying the fact. -->
        <p class="quiet">{copy.threadNoTasks}</p>
      {:else}
        <ul class="rows">
          {#each tasks as t (t.seq)}
            <li>
              <a class="row" href="/r/tasks/{t.seq}">
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
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
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
    border-block-start: 1px solid var(--line);
  }

  .u-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-end: var(--sp-2);
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: var(--hold-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 650;
  }

  .face[data-you] {
    background: var(--accent-wash);
    color: var(--accent-text);
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

  /* Under the name rather than under the face, so the words line up with who said them. */
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
    border-block-start: 1px solid var(--line);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .row:hover {
    background: var(--hover-wash);
  }

  .row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .row-title {
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-sub {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* Its own line under the row rather than inside it: the row is a link to the session and a link
     inside a link is not a thing HTML has. */
  .row-run {
    display: block;
    padding: 0 var(--sp-3) var(--sp-2) var(--sp-6);
    font-size: var(--t-xs);
  }

  /* Live is the only state that gets the accent. An idle session is not news and an ended one is
     history; painting all three would make the colour mean "a session" rather than "working now". */
  .dot {
    inline-size: 7px;
    block-size: 7px;
    flex: none;
    border-radius: 999px;
    background: var(--edge);
  }

  .dot[data-state='live'] {
    background: var(--earn-fill);
  }

  .quiet {
    margin-block-end: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
