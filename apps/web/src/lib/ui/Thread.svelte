<!--
  THE COMMENT THREAD ON ONE THING: a row, a question or a decision (`docs/20-COLLABORATION.md` §5). The row
  page mounts it in its side panel and Decide under the question, each naming the thing as the record takes it.

  ONE LEVEL OF REPLIES. Reply is offered on a comment and never on a reply, and a reply always names the comment that
  opened the thread, because depth is how a discussion becomes unsearchable.

  A RESOLVED COMMENT IS FOLDED, not hidden: one line says how it was resolved, by whom and when, and opening it shows
  what was said, the replies and the reason. The words stay in the record either way, so folding only saves room.

  ANYBODY WHO READS THE THING MAY SAY SOMETHING ABOUT IT, a Reads colleague included, so the boxes are drawn for every
  reader and the record answers for who may resolve. A refusal is the record's own sentence, and a box keeps what was
  typed until the record has it.

  THE READ NEVER SETTLES THE SCREEN. The page around it decides when it is ready; a thread that could not be read says
  so in its own place, with Retry, and is not an error `Empty`, which would mark the whole screen refused.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { since } from 'braindog-render';

  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { actor } from '$lib/record/names.ts';
  import {
    commentWords as words,
    COMMENT_MOST,
    overBy,
    readMentionable,
    readThread,
    resolveComment,
    sayComment,
    threadsOf,
    WAYS,
    type Heard,
    type Line,
    type Mentionable,
    type Way,
  } from '$lib/record/comments.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import MentionPicker from '$lib/ui/MentionPicker.svelte';
  import { runOf } from '$lib/ui/face.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';

  let {
    on,
    me = null,
    people = new Map(),
  }: {
    /** What the thread is on, as the record takes it: `tasks#3`, `suggestion:<id>` or `decision:<id>`. */
    on: string;
    /** The reader's own person id, so her lines say "You". */
    me?: string | null | undefined;
    /** Person ids to names, so a colleague's line says who. */
    people?: ReadonlyMap<string, string> | undefined;
  } = $props();

  /* THE IDS ARE THIS THREAD'S OWN, so two threads on one screen never share a label's target. */
  const uid = $props.id();

  let heard = $state<Heard | null>(null);
  let body = $state('');
  let replyingTo = $state<string | null>(null);
  let replyText = $state('');
  let resolving = $state<string | null>(null);
  let way = $state<Way>('addressed');
  let why = $state('');
  /* ONE WRITE AT A TIME, so a double press sends once. */
  let writing = $state(false);

  const threads = $derived(heard?.from === 'live' ? threadsOf(heard.lines) : []);

  /* WHO AN "@" OFFERS (`MentionPicker`): the people the record says may see what the thread is on, less the reader,
     asked once a box is entered (`readMentionable`), so a name is never offered that the mention would not ring. */
  let newField = $state<HTMLInputElement | null>(null);
  let replyField = $state<HTMLInputElement | null>(null);
  let mentionable = $state<Mentionable[]>([]);
  let mentionsFor = '';
  function askMentionable() {
    const target = on;
    if (mentionsFor === target) return;
    mentionsFor = target;
    void readMentionable(apiBase(), target).then((got) => {
      if (mentionsFor === target) mentionable = got;
    });
  }
  const now = $derived(heard?.from === 'live' ? heard.now : Date.now());
  const over = $derived(overBy(body));
  const replyOver = $derived(overBy(replyText));

  /* THE THREAD ASKED FOR LAST, so an answer for a thing the screen has moved off is dropped rather than drawn. */
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

  const who = (by: string) => actor(by, me || null, people);

  /**
   * SEND ONE WRITE, then read the thread again, whose new line is the answer, so a write that lands needs no toast.
   * The box is emptied by the caller only once the record has the words.
   */
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
  <div class="said">
    <Face name={w.name} kind={w.kind} run={runOf(line.by)} size="s" />
    <span class="said-by">{w.name}</span>
    <span class="said-when">{since(line.at, now)}</span>
  </div>
  <p class="said-body" dir="auto">{line.body}</p>
{/snippet}

{#snippet replies(list: Line[])}
  {#if list.length}
    <ul class="replies" aria-label={words.replies(list.length)}>
      {#each list as r (r.id)}<li class="reply">{@render said(r)}</li>{/each}
    </ul>
  {/if}
{/snippet}

<section class="thread" aria-labelledby="{uid}-title">
  <h2 class="thread-title" id="{uid}-title">{words.heading}</h2>

  {#if heard === null}
    <p class="thread-quiet" role="status">{words.reading}</p>
  {:else if heard.from === 'unreachable'}
    <div class="thread-failed">
      <p class="thread-quiet">{copy.readOffline}</p>
      <Button onclick={() => void read(on)}>{copy.readRetry}</Button>
      {#if heard.why}
        <details class="thread-details">
          <summary class="tap">{copy.readDetails}</summary>
          <p class="thread-quiet">{heard.why}</p>
        </details>
      {/if}
    </div>
  {:else if heard.from === 'refused'}
    <p class="thread-quiet">{heard.fix}</p>
  {:else}
    <!-- AN EMPTY THREAD IS ITS FIELD ALONE: "No comments yet" over "Add a comment" said one thing twice. -->
    {#if threads.length > 0}
      <ol class="comments">
        {#each threads as t (t.comment.id)}
          {@const c = t.comment}
          {#if c.resolved}
            <!-- FOLDED: the line says how it ended, and opening it shows the whole of it. -->
            {@const r = c.resolved}
            <li class="comment" data-resolved="">
              <details class="folded">
                <summary class="folded-head tap">
                  <Icon name="check" size="s" />
                  <span class="folded-said">{words.resolvedAs(r.as, who(r.by).name, since(r.at, now))}</span>
                </summary>
                <div class="folded-body">
                  {@render said(c)}
                  {@render replies(t.replies)}
                  <p class="folded-why" dir="auto">{r.why}</p>
                </div>
              </details>
            </li>
          {:else}
            <li class="comment">
              {@render said(c)}
              {@render replies(t.replies)}
              {#if replyingTo === c.id}
                <form class="box" onsubmit={(e) => reply(e, c.id)}>
                  <label class="box-label" for="{uid}-reply">{words.replyLabel(who(c.by).name)}</label>
                  <div class="box-line">
                    <input id="{uid}-reply" class="box-input" type="text" autocomplete="off" bind:value={replyText} bind:this={replyField} onfocus={askMentionable} />
                    <MentionPicker field={replyField} people={mentionable} />
                    <Button weight="ink" type="submit" disabled={!replyText.trim() || replyOver > 0 || writing}>{words.addReply}</Button>
                    <Button weight="bare" onclick={() => (replyingTo = null)}>{words.cancel}</Button>
                  </div>
                  {#if replyOver > 0}<p class="box-over" role="status">{words.tooLong(replyOver)}</p>{/if}
                </form>
              {:else if resolving === c.id}
                <form class="box" onsubmit={(e) => resolve(e, c.id)}>
                  <label class="box-label" for="{uid}-way">{words.resolveLegend}</label>
                  <select id="{uid}-way" class="box-input" bind:value={way}>
                    {#each WAYS as w (w)}<option value={w}>{words.ways[w]}</option>{/each}
                  </select>
                  <label class="box-label" for="{uid}-why">{words.why}</label>
                  <div class="box-line">
                    <input id="{uid}-why" class="box-input" type="text" autocomplete="off" maxlength={COMMENT_MOST} bind:value={why} />
                    <Button weight="ink" type="submit" disabled={!why.trim() || writing}>{words.resolveAction}</Button>
                    <Button weight="bare" onclick={() => (resolving = null)}>{words.cancel}</Button>
                  </div>
                </form>
              {:else}
                <div class="acts">
                  <Button weight="bare" onclick={() => openReply(c.id)}>{words.reply}</Button>
                  <Button weight="bare" onclick={() => openResolve(c.id)}>{words.resolve}</Button>
                </div>
              {/if}
            </li>
          {/if}
        {/each}
      </ol>
    {/if}

    <form class="box" onsubmit={add}>
      <!-- THE FIELD SAYS WHAT IT IS FOR INSIDE ITSELF (its placeholder), and the label stays for a screen reader only:
           "Add a comment" over an empty box said the same thing twice, a line apart (UI pass 20 Oct, W2-A). -->
      <label class="sr-only" for="{uid}-new">{words.addLabel}</label>
      <div class="box-line">
        <input id="{uid}-new" class="box-input" type="text" autocomplete="off" placeholder={words.addLabel} bind:value={body} bind:this={newField} onfocus={askMentionable} />
        <MentionPicker field={newField} people={mentionable} />
        {#if body.trim()}<Button weight="ink" type="submit" disabled={over > 0 || writing}>{words.add}</Button>{/if}
      </div>
      {#if over > 0}<p class="box-over" role="status">{words.tooLong(over)}</p>{/if}
    </form>
  {/if}
</section>

<style>
  .thread {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block: var(--sp-5);
  }

  .thread-title {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: var(--lead-meta);
  }

  .thread-quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .thread-failed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .thread-details summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .comments,
  .replies {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .comments {
    gap: var(--sp-4);
  }

  /* A REPLY SITS UNDER ITS COMMENT, set in by a rule rather than by depth, since there is only ever one level. */
  .replies {
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    padding-inline-start: var(--sp-3);
    border-inline-start: 2px solid var(--rule);
  }

  .comment {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .said {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .said-by {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .said-when {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .said-body {
    margin-block: var(--sp-1) 0;
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .folded-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .folded-said {
    min-inline-size: 0;
  }

  .folded-body {
    display: flex;
    flex-direction: column;
    padding-block-end: var(--sp-2);
  }

  .folded-why {
    margin-block: var(--sp-2) 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  /* A BOX AND ITS BUTTONS ON ONE LINE WHERE THEY FIT, and the box the full width on its own line where they do not,
     which is what a phone gets, so the words being typed are never squeezed beside a button. */
  .box {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .box-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .box-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .box-input {
    flex: 1 1 18ch;
    min-inline-size: 0;
    min-block-size: max(40px, var(--ctl-h));
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  @media (hover: hover) and (pointer: fine) {
    .box-input:hover {
      background: var(--tile-2);
    }
  }

  .box-input::placeholder {
    color: var(--ink-3);
  }

  /* The new comment's label, for a screen reader: the field's placeholder says it to the eye. */
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .box-over {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }
</style>
