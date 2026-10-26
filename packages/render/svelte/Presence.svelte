<!--
  The runs open now (agents and MCP plan §4.4, §7.1), each as the UI pass's one run row (review item 7): the agent's
  face with its live dot, its name and what it said it is doing, then where it is and when it was last heard; what it
  holds from him and its helpers when it has any; and, for the owner, Tell, Pause and Stop.

  AN HONEST LINE UNDER EVERY ROW HE CAN STOP (§2.4). Claude Code with our hooks is stopped at its next tool call;
  anything else keeps editing until its next BrainDog call, where it is refused and told. The host words it per run
  (`PresenceView.reach`), and Stop and Pause each say it again before they are pressed, so nobody presses Stop believing
  an agent halts mid-edit when it cannot.

  A STOP OR A PAUSE ASKS ONCE, IN PLACE. The press opens a line under the row with what it will do and a field for why,
  which the agent reads in his words; the second press sends it. Nothing is a modal. A paused or stopped run says so in
  words and offers Resume.

  IT READS NOTHING AND HOLDS NO RUN'S HANDLE AS A WORD: each row's `key` is handed back to the host's callbacks, and
  the run's page is the host's `href`. With no `ontell` the row draws no controls at all, for a reader who may not.

  ONE LINE A RUN WHERE THE HOST ASKS (`line`, the Agents page): the face, the agent and what it said on one line, the
  project and how long it has run at its end, and Tell, Pause and Stop behind one "More" press that the host opens as
  its own menu (`onmenu`) at the button. The honest line is then the host's to say once under the list, not once a row,
  and the menu's Pause or Stop asks here, in place, as a press on the row always did (`ask`).

  WHAT IT IS DOING LEADS WHERE THE HOST SAYS HOW IT STANDS (`stands`, the Agents page of 23 October): the row is the
  agent's mark, what it is doing, then its project as a chip, how long it has run and how it stands, and the agent's name
  is said to a screen reader only, since the mark says it and "Claude  Claude in BrainDog" said it twice.
-->
<script lang="ts">
  import { agentMarkFill } from '../src/index.ts';
  import type { ControlMark, PresenceView } from './types.ts';

  let {
    rows,
    mark,
    ontell,
    onstop,
    onresume,
    line = false,
    onmenu,
  }: {
    rows: readonly PresenceView[];
    mark?: ((agent: string) => ControlMark | null) | undefined;
    /** Aims the composer at this run. Absent for a reader who may not tell agents: then no control is drawn. */
    ontell?: ((key: string) => void) | undefined;
    /** Stop or pause this run, with why in his words (empty when he gave none). */
    onstop?: ((key: string, kind: 'stop' | 'pause', why: string) => void) | undefined;
    onresume?: ((key: string) => void) | undefined;
    /** One line a run, the presses behind one button. */
    line?: boolean;
    /** Opens the host's menu for this run at the button that asked, by the button's rect. */
    onmenu?: ((key: string, at: { x: number; y: number; height: number }) => void) | undefined;
  } = $props();

  const uid = $props.id();
  const LIVE: Record<PresenceView['live'], string> = { working: 'Working', thinking: 'Thinking', waiting: 'Waiting' };

  /** The row asking before a stop or a pause, and which; one at a time. */
  let asking = $state<{ key: string; kind: 'stop' | 'pause' } | null>(null);
  let why = $state('');

  const ask = (key: string, kind: 'stop' | 'pause') => {
    asking = { key, kind };
    why = '';
  };

  /** Asks before a stop or a pause of this run, in place under its row: the host's menu presses it. */
  export function confirm(key: string, kind: 'stop' | 'pause'): void {
    ask(key, kind);
  }

  const rectOf = (e: MouseEvent): { x: number; y: number; height: number } => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.top, height: r.height };
  };

  const hue = (agent: string | null): string => (agent && /^[a-z]+$/u.test(agent) ? `--pres-c:var(--agent-${agent}, var(--ink))` : '--pres-c:var(--ink)');
</script>

{#snippet face(r: PresenceView, m: ControlMark | null)}<span class="pres-face" aria-hidden="true"
    >{#if m}<svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" fill="currentColor" style={agentMarkFill(m.tone) ?? undefined}
        ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
      >{:else}<span class="pres-initial">{r.name.slice(0, 1)}</span>{/if}<span class="pres-dot" data-live={r.stopped ? 'held' : r.live}></span></span
  >{/snippet}

{#snippet askForm(r: PresenceView, open: { key: string; kind: 'stop' | 'pause' })}
  {#if onstop}
    <form class="pres-ask" aria-label={open.kind === 'stop' ? `Stop ${r.name}` : `Pause ${r.name}`} onsubmit={(e) => (e.preventDefault(), onstop(r.key, open.kind, why.trim()), (asking = null))}>
      <p class="pres-sure" role="status">{open.kind === 'stop' ? r.confirm.stop : r.confirm.pause}</p>
      <label class="pres-why" for="{uid}-{r.key}-why">Why, if you want to say (it reads this)</label>
      <input id="{uid}-{r.key}-why" class="pres-input" type="text" bind:value={why} autocomplete="off" enterkeyhint="send" maxlength="400" />
      <div class="pres-do">
        <button type="button" class="pres-btn" onclick={() => (asking = null)}>Keep it going</button>
        <button type="submit" class="pres-btn" data-weight="primary">{open.kind === 'stop' ? 'Stop it' : 'Pause it'}</button>
      </div>
    </form>
  {/if}
{/snippet}

{#if line}
  <ul class="pres" data-line="" aria-label="Agents at work">
    {#each rows as r (r.key)}
      {@const m = r.agent && mark ? mark(r.agent) : null}
      {@const open = asking?.key === r.key ? asking : null}
      <li class="pres-row" data-live={r.live} data-stopped={r.stopped ?? undefined} style={hue(r.agent)}>
        {@render face(r, m)}
        <div class="pres-body">
          {#if r.stands !== undefined && r.last}
            <!-- ITS NAME LEADS THE ROW AND THE LAST THING IT DID IS UNDER IT, where the host says both. -->
            <p class="pres-head" title={r.name}>
              {#if r.href}<a class="pres-what" href={r.href}>{r.name}</a>{:else}<span class="pres-what">{r.name}</span>{/if}{#if r.helpers}<span class="pres-helpers">{r.helpers}</span>{/if}
            </p>
            <p class="pres-last" title={r.last}>{r.last}</p>
          {:else if r.stands !== undefined}
            <!-- WHAT IT IS DOING LEADS THE ROW, the agent said by its mark and to a screen reader by name, never twice. -->
            <p class="pres-head" title={r.doing ?? r.name}>
              <span class="pres-who">{r.name}: </span>{#if r.href}<a class="pres-what" href={r.href}>{r.doing ?? r.name}</a>{:else}<span class="pres-what">{r.doing ?? r.name}</span>{/if}{#if r.helpers}<span class="pres-helpers">{r.helpers}</span>{/if}
            </p>
          {:else}
            <p class="pres-head">
              {#if r.href}<a class="pres-name" href={r.href}>{r.name}</a>{:else}<span class="pres-name">{r.name}</span>{/if}{#if r.doing}<span class="pres-doing">{r.doing}</span>{/if}{#if r.helpers}<span class="pres-helpers">{r.helpers}</span>{/if}
            </p>
          {/if}
          {#if r.holds}<p class="pres-holds">{r.holds}</p>{/if}
          {#if open}{@render askForm(r, open)}{/if}
        </div>
        <p class="pres-where">
          {#if r.project}<span class="pres-proj" data-chip={r.stands !== undefined ? '' : undefined}><span class="pres-pdot" data-slot={r.project.slot}></span>{r.project.name}</span>{/if}{#if r.stands !== undefined}{#if r.time}<span class="pres-time num">{r.time}</span>{/if}<span class="pres-stands" data-live={r.stopped ? 'held' : r.live}>{r.stands}</span>{:else}<span class="pres-time num"
            >{r.stopped === 'stop' ? 'Stopped by you' : r.stopped === 'pause' ? 'Paused by you' : (r.time ?? LIVE[r.live])}</span
          >{/if}
        </p>
        {#if onmenu}
          <button type="button" class="pres-more" aria-haspopup="menu" aria-label="Tell, pause or stop {r.name}" disabled={r.busy} onclick={(e) => onmenu(r.key, rectOf(e))}
            ><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.25" /><circle cx="8" cy="8" r="1.25" /><circle cx="12.5" cy="8" r="1.25" /></svg></button
          >
        {/if}
      </li>
    {/each}
  </ul>
{:else}
<ul class="pres" aria-label="Agents working now">
  {#each rows as r (r.key)}
    {@const m = r.agent && mark ? mark(r.agent) : null}
    {@const open = asking?.key === r.key ? asking : null}
    <li class="pres-row" data-live={r.live} data-stopped={r.stopped ?? undefined} style={hue(r.agent)}>
      <span class="pres-face" aria-hidden="true"
        >{#if m}<svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" fill="currentColor" style={agentMarkFill(m.tone) ?? undefined}
            ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
          >{:else}<span class="pres-initial">{r.name.slice(0, 1)}</span>{/if}<span class="pres-dot" data-live={r.stopped ? 'held' : r.live}></span></span
      >
      <div class="pres-body">
        <p class="pres-head">
          {#if r.href}<a class="pres-name" href={r.href}>{r.name}</a>{:else}<span class="pres-name">{r.name}</span>{/if}{#if r.doing}<span class="pres-doing">{r.doing}</span>{/if}
        </p>
        <p class="pres-meta">
          {#if r.project}on <span class="pres-proj"><span class="pres-pdot" data-slot={r.project.slot}></span>{r.project.name}</span><span class="pres-sep">{' · '}</span>{/if}<span class="pres-live"
            >{r.stopped === 'stop' ? 'Stopped by you' : r.stopped === 'pause' ? 'Paused by you' : LIVE[r.live]}</span
          ><span class="pres-sep">{' · '}</span>{r.meta}
        </p>
        {#if r.holds}<p class="pres-holds">{r.holds}</p>{/if}
        {#if r.helpers}<p class="pres-meta">{r.helpers}</p>{/if}
        {#if ontell}<p class="pres-reach">{r.reach}</p>{/if}
        {#if open && onstop}
          <form class="pres-ask" aria-label={open.kind === 'stop' ? `Stop ${r.name}` : `Pause ${r.name}`} onsubmit={(e) => (e.preventDefault(), onstop(r.key, open.kind, why.trim()), (asking = null))}>
            <p class="pres-sure" role="status">{open.kind === 'stop' ? r.confirm.stop : r.confirm.pause}</p>
            <label class="pres-why" for="{uid}-{r.key}-why">Why, if you want to say (it reads this)</label>
            <input id="{uid}-{r.key}-why" class="pres-input" type="text" bind:value={why} autocomplete="off" enterkeyhint="send" maxlength="400" />
            <div class="pres-do">
              <button type="button" class="pres-btn" onclick={() => (asking = null)}>Keep it going</button>
              <button type="submit" class="pres-btn" data-weight="primary">{open.kind === 'stop' ? 'Stop it' : 'Pause it'}</button>
            </div>
          </form>
        {/if}
      </div>
      {#if ontell && !open}
        <div class="pres-do pres-acts" role="group" aria-label="What to do with {r.name}">
          {#if r.stopped}
            <button type="button" class="pres-btn" disabled={r.busy} onclick={() => onresume?.(r.key)}>Resume</button>
            {#if r.stopped === 'pause'}<button type="button" class="pres-btn" disabled={r.busy} onclick={() => ask(r.key, 'stop')}>Stop</button>{/if}
          {:else}
            <button type="button" class="pres-btn" onclick={() => ontell(r.key)}>Tell</button>
            <button type="button" class="pres-btn" disabled={r.busy} onclick={() => ask(r.key, 'pause')}>Pause</button>
            <button type="button" class="pres-btn" disabled={r.busy} onclick={() => ask(r.key, 'stop')}>Stop</button>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>
{/if}
