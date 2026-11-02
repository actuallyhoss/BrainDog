<!--
  THE ROW'S TIMELINE: one composer, then what happened to the row and what people said about it, newest first, by day.

  It replaced two groups beside the row: Comments (`Thread.svelte`, its own box at its foot) and History (a note box at
  its head), each with its own heading and its own way of drawing who did what. A person now writes in one place, and
  reads one list where an edit and the comment about it sit side by side (`timeline.ts`).

  THE COMPOSER WRITES A COMMENT. A comment asks only that the row can be read, so everybody who sees the row can say
  something about it, a Reads colleague included, and the record answers for who may resolve one. Replies stay one level
  deep and a resolved comment folds to one line, as they do in a thread anywhere else.

  THE TILE AND THE HISTORY'S REFUSAL ARE THE PAGE'S: this is the inside of the tile, so the page decides where it sits.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { actor, handlesSaid } from '$lib/record/names.ts';
  import { commentWords, COMMENT_MOST, overBy, readMentionable, readThread, resolveComment, sayComment, threadsOf, WAYS, type Heard, type Line, type Mentionable, type Way } from '$lib/record/comments.ts';
  import type { Line as Event } from '$lib/record/history-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import MentionPicker from '$lib/ui/MentionPicker.svelte';
  import { runOf } from '$lib/ui/face.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { agoSaid, daysOf, whenSaid } from './said.ts';
  import { lineWhole, momentsOf, noteSaid, timelineWords as words } from './timeline.ts';

  let {
    on,
    history,
    now,
    me = null,
    people = new Map(),
    onnames,
    again = 0,
  }: {
    /** The row, as the record takes it: `obligations#1`. */
    on: string;
    /** What happened to the row, newest first, as the page read it. */
    history: readonly Event[];
    now: number;
    me?: string | null | undefined;
    people?: ReadonlyMap<string, string> | undefined;
    /** Asked when somebody other than the reader has commented, so the page reads the record's names once. */
    onnames?: (() => void) | undefined;
    /** Moved by the page when the record changed under the row: the thread is asked again in place (collab pass 2). */
    again?: number | undefined;
  } = $props();

  const uid = $props.id();

  let heard = $state<Heard | null>(null);
  let body = $state('');
  let replyingTo = $state<string | null>(null);
  let replyText = $state('');
  let resolving = $state<string | null>(null);
  let way = $state<Way>('addressed');
  let why = $state('');
  let writing = $state(false);

  const threads = $derived(heard?.from === 'live' ? threadsOf(heard.lines) : []);
  const days = $derived(daysOf(momentsOf(history, threads), now));
  const over = $derived(overBy(body));
  const replyOver = $derived(overBy(replyText));

  let asked = '';

  async function read(target: string) {
    asked = target;
    const got = await readThread(apiBase(), target);
    if (asked === target) heard = got;
  }

  $effect(() => {
    const target = on;
    untrack(() => {
      heard = null;
      replyingTo = null;
      resolving = null;
      void read(target);
    });
  });

  /* AND AGAIN WHEN THE PAGE SAYS THE RECORD MOVED, IN PLACE: what somebody else just said arrives without a reload, and
     nothing drawn is cleared while it is asked. A reply or a resolution being typed is left as it is. */
  let heardAgain = untrack(() => again);
  $effect(() => {
    const n = again;
    if (n === heardAgain) return;
    heardAgain = n;
    untrack(() => void read(on));
  });

  /* A COLLEAGUE'S COMMENT IS SAID BY NAME, so the page is asked for the names once somebody else has spoken. */
  $effect(() => {
    if (heard?.from === 'live' && heard.lines.some((l) => /^p_/u.test(l.by) && l.by !== me)) untrack(() => onnames?.());
  });

  const who = (by: string) => actor(by, me || null, people);

  /* WHO AN "@" OFFERS (`MentionPicker`): the people the record says may see this row, less the reader, asked the first
     time a box is entered (`readMentionable`), by the check a mention rings by, so no name is offered that stays quiet. */
  let newField = $state<HTMLTextAreaElement | null>(null);
  let replyField = $state<HTMLTextAreaElement | null>(null);
  let mentionable = $state<Mentionable[]>([]);
  let mentionsFor = '';
  function entered() {
    onnames?.();
    const target = on;
    if (mentionsFor === target) return;
    mentionsFor = target;
    void readMentionable(apiBase(), target).then((got) => {
      if (mentionsFor === target) mentionable = got;
    });
  }

  /** One write, then the thread again, whose new line is the answer, so a write that lands needs no toast. */
  async function send(write: () => ReturnType<typeof sayComment>): Promise<boolean> {
    if (writing) return false;
    const target = on;
    writing = true;
    const out = await write();
    writing = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    if (asked === target) await read(target);
    return true;
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const said = body.trim();
    if (!said || over > 0) return;
    if ((await send(() => sayComment(apiBase(), { on, body: said }))) && body.trim() === said) body = '';
  }

  /* ENTER SENDS, AND SHIFT ENTER STARTS A NEW LINE, as every composer does. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.defaultPrevented) return;
    e.preventDefault();
    (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
  }

  async function reply(e: SubmitEvent, to: string) {
    e.preventDefault();
    const said = replyText.trim();
    if (!said || replyOver > 0) return;
    if (await send(() => sayComment(apiBase(), { on, body: said, reply_to: to }))) {
      replyText = '';
      replyingTo = null;
    }
  }

  async function resolve(e: SubmitEvent, id: string) {
    e.preventDefault();
    const because = why.trim();
    if (!because) return;
    if (await send(() => resolveComment(apiBase(), { id, as: way, why: because }))) {
      why = '';
      resolving = null;
    }
  }

  function openReply(id: string) {
    resolving = null;
    replyText = '';
    replyingTo = id;
  }

  function openResolve(id: string) {
    replyingTo = null;
    way = 'addressed';
    why = '';
    resolving = id;
  }
</script>

{#snippet said(line: Line)}
  {@const w = who(line.by)}
  <Face name={w.name} kind={w.kind} run={runOf(line.by)} size="s" />
  <div class="body">
    <p class="head"><span class="by">{w.name}</span> <time class="when" datetime={line.at}>{whenSaid(line.at, now)}</time></p>
    <p class="words" dir="auto">{line.body}</p>
  </div>
{/snippet}

<form class="composer" onsubmit={add}>
  <label class="vh" for="{uid}-new">{words.composer}</label>
  <textarea id="{uid}-new" class="composer-input" rows="1" autocomplete="off" placeholder={words.composer} bind:value={body} bind:this={newField} onfocus={entered} {onkeydown}></textarea>
  <MentionPicker field={newField} people={mentionable} />
  {#if body.trim()}
    <div class="composer-acts">
      {#if over > 0}<p class="over" role="status">{commentWords.tooLong(over)}</p>{/if}
      <Button weight="primary" size="sm" type="submit" disabled={over > 0 || writing}>{words.send}</Button>
    </div>
  {/if}
</form>

{#if heard?.from === 'unreachable'}
  <div class="quiet-line">
    <p class="quiet">{copy.readOffline}</p>
    <Button weight="bare" size="sm" onclick={() => void read(on)}>{copy.readRetry}</Button>
  </div>
{:else if heard?.from === 'refused'}
  <p class="quiet">{heard.fix}</p>
{/if}

{#if days.length === 0}
  {#if heard !== null}<p class="quiet">{words.empty}</p>{/if}
{:else}
  {#each days as d (d.key)}
    <h3 class="day">{d.said}</h3>
    <ol class="moments">
      {#each d.lines as m, i (i)}
        {#if m.kind === 'event'}
          <!-- WHO, BY `actor`, SO THE FACE IS DRAWN BY KIND: a rule wears the automations glyph and BrainDog its mark,
               and an agent's line wears its run. -->
          {@const w = who(m.event.by)}
          {@const whole = m.event.settled ? null : lineWhole(m.event.by, m.event.note)}
          <li class="event">
            <Face name={w.name} kind={w.kind} run={runOf(m.event.by)} size="s" />
            <p class="event-line">{#if whole}{whole}{:else}<span class="by">{m.event.settled ?? w.name}</span> {noteSaid(handlesSaid(m.event.note, m.event.by), m.event)}{/if}</p>
            <time class="when" datetime={m.event.at}>{whenSaid(m.event.at, now)}</time>
          </li>
        {:else if m.thread.comment.resolved}
          <!-- FOLDED: the line says how it ended, and opening it shows the whole of it. -->
          {@const c = m.thread.comment}
          {@const r = m.thread.comment.resolved}
          <li class="folded">
            <details>
              <summary class="folded-head tap">
                <Icon name="check" size="s" />
                <span>{commentWords.resolvedAs(r.as, who(r.by).name, agoSaid(r.at, now))}</span>
              </summary>
              <div class="comment">{@render said(c)}</div>
              {#each m.thread.replies as rp (rp.id)}<div class="comment reply">{@render said(rp)}</div>{/each}
              <p class="quiet folded-why" dir="auto">{r.why}</p>
            </details>
          </li>
        {:else}
          {@const c = m.thread.comment}
          <li class="thread">
            <div class="comment">{@render said(c)}</div>
            {#each m.thread.replies as rp (rp.id)}<div class="comment reply">{@render said(rp)}</div>{/each}
            {#if replyingTo === c.id}
              <form class="box" onsubmit={(e) => reply(e, c.id)}>
                <label class="vh" for="{uid}-reply">{commentWords.replyLabel(who(c.by).name)}</label>
                <textarea id="{uid}-reply" class="composer-input" rows="1" autocomplete="off" placeholder={commentWords.replyLabel(who(c.by).name)} bind:value={replyText} bind:this={replyField} onfocus={entered}></textarea>
                <MentionPicker field={replyField} people={mentionable} />
                {#if replyOver > 0}<p class="over" role="status">{commentWords.tooLong(replyOver)}</p>{/if}
                <div class="box-acts">
                  <Button weight="primary" size="sm" type="submit" disabled={!replyText.trim() || replyOver > 0 || writing}>{commentWords.addReply}</Button>
                  <Button weight="bare" size="sm" onclick={() => (replyingTo = null)}>{commentWords.cancel}</Button>
                </div>
              </form>
            {:else if resolving === c.id}
              <form class="box" onsubmit={(e) => resolve(e, c.id)}>
                <label class="box-label" for="{uid}-way">{commentWords.resolveLegend}</label>
                <select id="{uid}-way" class="box-input" bind:value={way}>
                  {#each WAYS as w (w)}<option value={w}>{commentWords.ways[w]}</option>{/each}
                </select>
                <label class="box-label" for="{uid}-why">{commentWords.why}</label>
                <input id="{uid}-why" class="box-input" type="text" autocomplete="off" maxlength={COMMENT_MOST} bind:value={why} />
                <div class="box-acts">
                  <Button weight="primary" size="sm" type="submit" disabled={!why.trim() || writing}>{commentWords.resolveAction}</Button>
                  <Button weight="bare" size="sm" onclick={() => (resolving = null)}>{commentWords.cancel}</Button>
                </div>
              </form>
            {:else}
              <div class="acts">
                <button type="button" class="act tap" onclick={() => openReply(c.id)}>{commentWords.reply}</button>
                <button type="button" class="act tap" onclick={() => openResolve(c.id)}>{commentWords.resolve}</button>
              </div>
            {/if}
          </li>
        {/if}
      {/each}
    </ol>
  {/each}
{/if}

<style>
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── the composer ──────────────────────────────────────────────────── */

  /* ONE BOX AT THE HEAD OF THE TILE, growing with what is typed, and its button only once there is something to send. */
  .composer,
  .box {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .composer-input,
  .box-input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 40px;
    padding: 9px var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    /* 16px IN EVERY BOX, because a phone zooms the page when a smaller one takes focus. */
    font-size: var(--fs-body);
    line-height: 22px;
    resize: none;
    field-sizing: content;
    max-block-size: 240px;
    transition: background var(--d-state) var(--ease-out);
  }

  /* UNDER 640 THE BOX IS A THUMB'S TARGET, 44 tall (motion F17). */
  @media (width < 640px) {
    .composer-input {
      min-block-size: var(--tap);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .composer-input:hover,
    .box-input:hover {
      background: var(--tile-2);
    }
  }

  .composer-acts,
  .box-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .box-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .over {
    flex: 1 1 12rem;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .quiet-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  /* ── the days ──────────────────────────────────────────────────────── */

  .day {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .moments {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CHANGE IS ONE LINE: who, what, and when at the trailing edge, the face in a 24px column every line shares. */
  .event {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
  }

  .event-line {
    min-inline-size: 0;
    margin: 0;
    padding-block-start: 2px;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .by {
    color: var(--ink);
    font-weight: 500;
  }

  .when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .event > .when {
    padding-block-start: 4px;
  }

  /* A COMMENT: the face, then who and when over the words at the body size. */
  .thread,
  .folded {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .comment {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  /* A REPLY SITS UNDER ITS COMMENT, set in by the face's column, since there is only ever one level. */
  .reply {
    margin-inline-start: 36px;
  }

  .body {
    min-inline-size: 0;
  }

  .head {
    margin: 0;
    padding-block-start: 2px;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .words {
    margin: 2px 0 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .acts {
    display: flex;
    gap: var(--sp-3);
    margin-inline-start: 36px;
  }

  .act {
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .act:hover {
      color: var(--ink);
    }
  }

  .thread > .box {
    margin-inline-start: 36px;
  }

  .folded details > * + * {
    margin-block-start: var(--sp-2);
  }

  .folded-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 20px;
    cursor: pointer;
  }

  .folded-why {
    margin-inline-start: 36px;
  }
</style>
