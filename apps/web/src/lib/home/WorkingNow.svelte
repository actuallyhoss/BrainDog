<!--
  Working now: the agents working this minute, each with its project and what it says it is doing (Today as the desk).

  FROM `boot`'S ANSWER AT THE FIRST PAINT, so the count is the rail's and the header's and the tile stands at once. THEN
  FROM `presence` (agents and MCP plan §4.4, §7.2), read once it has drawn, again when the record moves, when a stop or a
  tell is sent (`told`), and every fifteen seconds, since "for 32 min" is a clock: what each run says it is doing, for
  how long, what he told it that it holds, and whether he paused or stopped it. A read that fails keeps what is drawn.

  TELL, PAUSE AND STOP ARE ONE PRESS AWAY for the owner: the row's end opens the run's sheet (`RunSheet.svelte`), which
  is the Agents page's own run row and composer scoped to that run, so nothing here words a stop a second time.

  A project the desk draws a card for lends its colour to the dot before its name. Four are named and the rest are
  counted. NOTHING IS DRAWN FOR NOBODY: no agents, no tile. Loaded only as it is used, so the front door carries none of
  the control room: `instruct.ts` and the sheet arrive when the tile asks for them.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import type { LiveRun, Thread } from '$lib/record/instruct.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { WORKING_MOST, liveRows, type WorkingRow } from './desk.ts';

  let { rows }: { rows: readonly WorkingRow[] } = $props();

  const words = {
    title: 'Working now',
    open: 'All agents',
    more: (n: number) => `and ${n} more`,
    quiet: 'gone quiet',
    controls: (agent: string) => `Tell, pause or stop ${agent}`,
    on: (agent: string, project: string | null) => (project ? `${agent} on ${project}` : agent),
  } as const;

  /* HIS ALONE: only a person signed in as the owner tells, pauses or stops a run. */
  const owner = $derived((page.data as unknown as Partial<Shell> | undefined)?.me?.owner === true);

  /* WHAT `presence` LAST SAID, and the clock its "for 32 min" is read against. `null` until it has answered. */
  let live = $state.raw<{ rows: LiveRun[]; threads: Thread[]; at: number } | null>(null);

  async function read(): Promise<void> {
    try {
      const m = await import('$lib/record/instruct.ts');
      const io = m.control(apiBase());
      const [p, t] = await Promise.all([io.presence(), owner ? io.threads(20) : Promise.resolve(null)]);
      if (!p.ok) return;
      live = { rows: p.value, threads: t?.ok ? t.value : (live?.threads ?? []), at: recordNow() };
    } catch {
      /* What is drawn stands. */
    }
  }

  onMount(() => {
    void read();
    let off = (): void => {};
    void import('$lib/record/instruct.ts').then((m) => (off = m.told.on(() => void read())));
    const clock = setInterval(() => void (document.hidden || read()), 15_000);
    return () => {
      off();
      clearInterval(clock);
    };
  });

  listen(read, () => sheetOpen);

  const drawn = $derived(live ? liveRows(rows, live.rows, live.threads, live.at) : rows);
  const shown = $derived(drawn.slice(0, WORKING_MOST));

  /* THE RUN WHOSE SHEET IS OPEN, and the sheet itself, fetched on the first press. */
  let sheet = $state<{ run: string; title: string } | null>(null);
  let sheetOpen = $state(false);
  let Sheet = $state.raw<typeof import('./RunSheet.svelte').default | null>(null);

  async function openFor(r: WorkingRow): Promise<void> {
    Sheet ??= (await import('./RunSheet.svelte')).default;
    sheet = { run: r.run, title: words.on(r.agent, r.project) };
    sheetOpen = true;
  }

  /* A SHEET CLOSED MAY HAVE PAUSED, STOPPED OR TOLD: the rows are read again as it goes. */
  let wasOpen = false;
  $effect(() => {
    if (wasOpen && !sheetOpen) void read();
    wasOpen = sheetOpen;
  });
</script>

{#if drawn.length > 0}
  <Tile icon="session" tone="live" title={words.title} count={drawn.length} href="/p/agents" hrefLabel={words.open} data-working>
    <ol class="runs">
      {#each shown as r (r.key)}
        <li class="run" data-held={r.held ?? undefined}>
          <span class="r-face"><AgentFace agent={r.agent} run={r.run} live={r.live} size="s" /></span>
          <span class="r-who">
            <b class="r-name">{r.agent}</b>
            {#if r.project}
              <span class="r-project"><span class="r-dot" style={r.slot === null ? undefined : `--dot:var(--cat-${r.slot})`} aria-hidden="true"></span>{r.project}</span>
            {/if}
          </span>
          {#if r.doing}<span class="r-doing" dir="auto">{r.doing}</span>{/if}
          {#if r.holds}<span class="r-holds" dir="auto">On your word: “{r.holds}”</span>{/if}
          <span class="r-time num" data-live={r.live === 'working' && r.began && !r.word ? '' : undefined}>{r.word ?? (r.live === 'quiet' ? words.quiet : r.began)}</span>
          {#if owner && /^S[1-9][0-9]*$/u.test(r.run)}
            <button type="button" class="r-do tap" aria-label={words.controls(r.agent)} aria-haspopup="dialog" onclick={() => void openFor(r)}><Icon name="more" size="s" /></button>
          {/if}
        </li>
      {/each}
    </ol>
    {#if drawn.length > shown.length}<p class="r-more">{words.more(drawn.length - shown.length)}</p>{/if}
  </Tile>
{/if}

{#if Sheet && sheet}
  <Sheet bind:open={sheetOpen} run={sheet.run} title={sheet.title} />
{/if}

<style>
  .runs {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE AGENT, TWO LINES, AT EVERY WIDTH (Today polish 4): the face, who and the project, and how long at that line's
     end; what it is on under it in the second ink, the whole width of the words, so a phone does not wrap it. What he
     told it that it holds is a third line, only while it holds one. The owner's press sits at the row's far end. */
  .run {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'face who time do'
      'face doing doing do'
      'face holds holds do';
    align-items: baseline;
    column-gap: var(--sp-3);
    row-gap: 2px;
    padding-block: var(--sp-3);
  }

  .run:first-child {
    padding-block-start: 0;
  }

  .run:last-child {
    padding-block-end: 0;
  }

  .run + .run {
    border-block-start: 1px solid var(--rule);
  }

  .r-face {
    grid-area: face;
    align-self: start;
    display: flex;
    padding-block-start: 2px;
  }

  .r-who {
    grid-area: who;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    min-inline-size: 0;
  }

  .r-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .r-project {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .r-dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    /* THE PROJECT'S SLOT, as its card draws it (SPEC 1.3); no card, the quiet ink. */
    background: var(--dot, var(--ink-3));
  }

  .r-doing,
  .r-holds {
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .r-doing {
    grid-area: doing;
  }

  .r-holds {
    grid-area: holds;
    color: var(--ink-3);
  }

  .r-time {
    grid-area: time;
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  /* PAUSED OR STOPPED BY HIM: said in the second ink in the time's place, never in red (red is late and needs you). */
  .run[data-held] .r-time {
    color: var(--ink-2);
    font-weight: 500;
  }

  /* WORKING THIS MINUTE: a still live dot before how long (frame F22: one pulse on a change, never a loop). */
  .r-time[data-live]::before {
    content: '';
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  /* THE OWNER'S PRESS: a quiet 28px glyph button, a thumb's 44 to press (`.tap`), the row's whole height. */
  .r-do {
    grid-area: do;
    align-self: start;
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-block-start: -3px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink-3);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .r-do:hover,
  .r-do:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .r-more {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
