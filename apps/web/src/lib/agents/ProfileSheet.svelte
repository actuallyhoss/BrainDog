<!--
  One agent's settings, as Settings › Agents opens them (agents and MCP plan §5.3): how far it may go, where it may
  change things, which tools it has, its brief, when it is quiet and when it tells him, its limits, and the stop switch
  and live push.

  ONE SHEET FOR EVERY ROW, Defaults included. What it decides is `profile.ts`; this draws a draft and hands the row it
  would write to `onsave`, which `Agents.svelte` sends as `setAgentProfile` (ADMIN, his browser only).

  SAFE BY DEFAULT, AND SAID SO. New agents start at Suggest; whatever runs without a person (automations, rules,
  add-ons) asks first whatever this sheet says; the projects narrow changes and not reads, until sharing's lens lands;
  the stop switch and live push are Claude Code's only, and live push is a Claude Code preview, off by default.

  SWITCHES ARE THE ONE SWITCH ROW (`settings.css` `.switch-row`), INK WHEN ON, never red; the one primary is Save, in
  the sheet's foot.
-->
<script lang="ts">
  import Sheet from '$lib/ui/Sheet.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { TONES } from 'braindog-render';
  import type { Place } from '$lib/record/scope-move.ts';
  import {
    BRIEF_MOST,
    BUDGET_WORDS,
    CEILINGS,
    CONTEXT_BUDGETS,
    LEVEL_LINES,
    LEVEL_WORDS,
    NOTIFY_BY_WORDS,
    NOTIFY_LINES,
    NOTIFY_WORDS,
    QUIET_START,
    TIMES,
    TOOL_ROWS,
    argsOf,
    faultOf,
    hasHooks,
    kindName,
    sameDraft,
    type AgentRow,
    type Draft,
  } from './profile.ts';
  import type { ProfileCaps, ProfileNotify } from '@braindog/kernel';

  let {
    open = $bindable(false),
    row,
    places,
    lists,
    followers = [],
    keepers = [],
    onsave,
  }: {
    open?: boolean;
    row: AgentRow | null;
    /** The projects it may be held to, or `null` while they could not be read. */
    places: readonly Place[] | null;
    /** The lists it may be held to, by id and name. */
    lists: readonly { id: string; name: string }[];
    /** On Defaults: the agents with no settings of their own, which take these. */
    followers?: readonly string[];
    /** On Defaults: the agents heard from with no settings yet, which are given their own first and keep what they have. */
    keepers?: readonly string[];
    onsave: (args: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; fix: string }>;
  } = $props();

  const GROUPS: readonly (readonly ['read' | 'write', string])[] = [['read', 'Reading'], ['write', 'Changing']];
  const NOTIFY_ONS: readonly ProfileNotify['on'][] = ['off', 'told', 'long'];
  const NOTIFY_BYS: readonly ProfileNotify['by'][] = ['push', 'needs_you'];
  const CAP_FIELDS: readonly (readonly [keyof ProfileCaps, string])[] = [['jobs_day', 'Jobs a day'], ['minutes_day', 'Minutes a day'], ['turns_job', 'Turns a job']];

  const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });
  const clone = (d: Draft): Draft => JSON.parse(JSON.stringify(d)) as Draft;
  const EMPTY: Draft = clone({
    ceiling: 'propose',
    projects: null,
    lists_write: null,
    tools: {},
    brief: '',
    model: '',
    quiet: null,
    caps: {},
    notify: { on: 'told', by: 'push' },
    context: { budget: 700, lines: true },
    enforce: { hooks: true, channel: false },
  });

  let d = $state<Draft>(clone(EMPTY));
  let root = $state<HTMLElement | null>(null);
  let saving = $state(false);
  let said = $state('');

  /* A FRESH DRAFT EACH TIME IT OPENS, from the row as it stands. */
  let was = false;
  $effect(() => {
    const now = open;
    if (now && !was && row) {
      d = clone(row.draft);
      said = '';
      /* IT OPENS AT ITS TOP, ON HOW FAR IT MAY GO. The sheet hands the focus to its first field, which here is the
         brief halfway down, so the focus is moved to the chosen step and the body put back at its start. */
      requestAnimationFrame(() => {
        const body = root?.closest<HTMLElement>('.sheet-body');
        if (body) body.scrollTop = 0;
        root?.querySelector<HTMLElement>('.segment[data-on]')?.focus({ preventScroll: true });
      });
    }
    was = now;
  });

  const isDefault = $derived(row?.key === 'default');
  const hooks = $derived(row ? hasHooks(row) : false);
  const who = $derived(row?.kind ? kindName(row.kind) : 'This agent');

  const subtitle = $derived.by(() => {
    if (!row) return undefined;
    if (isDefault) return 'For any agent without settings of its own.';
    if (row.applies === 'token') return 'Bound to its own key, so this is a hard limit.';
    return `Applies to any app that says it is ${who}.`;
  });

  /* WHAT IS PICKED: a project by its spoken name, matched on anything a stored row may hold. */
  const hasPlace = (p: Place): boolean => (d.projects ?? []).some((q) => q === p.spoken || q === p.id || q.toLowerCase() === p.name.toLowerCase());
  const togglePlace = (p: Place) => {
    const now = d.projects ?? [];
    d.projects = hasPlace(p) ? now.filter((q) => !(q === p.spoken || q === p.id || q.toLowerCase() === p.name.toLowerCase())) : [...now, p.spoken];
  };
  const hasList = (l: { id: string; name: string }): boolean => (d.lists_write ?? []).some((q) => q === l.id || q.toLowerCase() === l.name.toLowerCase());
  const toggleList = (l: { id: string; name: string }) => {
    const now = d.lists_write ?? [];
    d.lists_write = hasList(l) ? now.filter((q) => !(q === l.id || q.toLowerCase() === l.name.toLowerCase())) : [...now, l.id];
  };

  const toolOn = (name: string): boolean => d.tools[name] !== false;
  const flipTool = (name: string) => {
    const next = { ...d.tools };
    if (toolOn(name)) next[name] = false;
    else delete next[name];
    d.tools = next;
  };

  const capOf = (k: keyof ProfileCaps): string => (d.caps[k] === undefined ? '' : String(d.caps[k]));
  const setCap = (k: keyof ProfileCaps, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v);
    const next = { ...d.caps };
    if (n === undefined || Number.isNaN(n)) delete next[k];
    else next[k] = n;
    d.caps = next;
  };

  const pickNotify = (on: ProfileNotify['on']) => {
    d.notify = on === 'long' ? { on, by: d.notify.by, minutes: d.notify.minutes ?? 30 } : { on, by: d.notify.by };
  };

  const briefLeft = $derived(BRIEF_MOST - [...d.brief].length);
  const fault = $derived(faultOf(d));

  async function save() {
    if (!row || saving) return;
    if (fault) {
      said = fault.fix;
      return;
    }
    if (row.stored !== null && sameDraft(d, row.draft)) {
      open = false;
      return;
    }
    saving = true;
    const out = await onsave(argsOf(row, d));
    saving = false;
    if (out.ok) open = false;
    else said = out.fix;
  }

  const ids = $props.id();
</script>

{#snippet sw(on: boolean, label: string, flip: () => void, disabled = false, describedby: string | undefined = undefined)}
  <button type="button" class="switch" role="switch" aria-checked={on} aria-label={label} aria-describedby={describedby} {disabled} onclick={flip}
    ><span class="switch-track"></span></button
  >
{/snippet}

{#snippet foot()}
  <Button weight="quiet" onclick={() => (open = false)}>Cancel</Button>
  <Button weight="primary" disabled={saving} onclick={() => void save()}>Save</Button>
{/snippet}

<Sheet bind:open title={row?.name ?? ''} {subtitle} footer={foot}>
  {#if row}
    <div class="prof" data-profile-sheet={row.key} bind:this={root}>
      {#if isDefault && (followers.length > 0 || keepers.length > 0)}
        <p class="pf-note">
          {#if keepers.length > 0}{LIST.format(keepers)} {keepers.length === 1 ? 'keeps' : 'keep'} what {keepers.length === 1 ? 'it has' : 'they have'} now: saving gives {keepers.length === 1 ? 'it settings of its own' : 'each settings of its own'} first.{/if}
          {#if followers.length > 0}{LIST.format(followers)} {followers.length === 1 ? 'has' : 'have'} no settings of {followers.length === 1 ? 'its' : 'their'} own, so these apply to {followers.length === 1 ? 'it' : 'them'}.{/if}
        </p>
      {:else if row.follows === 'defaults'}
        <p class="pf-note">It follows Defaults for new agents now. Saving here gives it settings of its own.</p>
      {:else if row.follows === 'key'}
        <p class="pf-note">Nothing is set for it yet, so its key decides. Write here means as far as its key allows.</p>
      {/if}

      <!-- HOW FAR IT MAY GO -->
      <section class="part" aria-labelledby="{ids}-may">
        <h3 class="part-title" id="{ids}-may">How far it may go</h3>
        <Segmented role="group" aria-labelledby="{ids}-may" full>
          {#each CEILINGS as c (c)}
            <button type="button" class="segment" aria-pressed={d.ceiling === c} data-on={d.ceiling === c ? '' : undefined} onclick={() => (d.ceiling = c)}>{LEVEL_WORDS[c]}</button>
          {/each}
        </Segmented>
        <p class="pf-level">{LEVEL_LINES[d.ceiling]}</p>
        <p class="pf-quiet">Automations, rules and add-ons always ask you first, whatever this says.</p>
      </section>

      <!-- WHERE -->
      <section class="part" aria-labelledby="{ids}-where">
        <h3 class="part-title" id="{ids}-where">Where it may change things</h3>
        {#if d.ceiling !== 'write'}
          <p class="pf-quiet">{d.ceiling === 'read' ? 'At Read it changes nothing, anywhere.' : 'At Suggest every change waits for you, wherever it is.'}</p>
        {:else}
          <div class="switch-row">
            <div class="switch-row-words">
              <span class="switch-row-title">Every project</span>
              <p class="switch-row-line" id="{ids}-proj-line">It still reads every project. Changes outside the ones you pick come to you as questions.</p>
            </div>
            {@render sw(d.projects === null, 'Every project', () => (d.projects = d.projects === null ? [] : null), false, `${ids}-proj-line`)}
          </div>
          {#if d.projects !== null}
            {#if places === null}
              <p class="pf-quiet">The projects could not be read just now.</p>
            {:else if places.length === 0}
              <p class="pf-quiet">There are no projects yet.</p>
            {:else}
              <fieldset class="picks form-checks">
                <legend class="group-title pf-legend">Projects it may change</legend>
                {#each places as p (p.id)}
                  <label class="pick"><input type="checkbox" checked={hasPlace(p)} onchange={() => togglePlace(p)} /><span dir="auto">{p.name}</span></label>
                {/each}
              </fieldset>
              {#if d.projects.length === 0}<p class="pf-quiet">None picked, so every change is asked.</p>{/if}
            {/if}
          {/if}
          <div class="switch-row">
            <div class="switch-row-words">
              <span class="switch-row-title">Every list</span>
              <p class="switch-row-line" id="{ids}-list-line">Changes to lists you leave out come to you as questions.</p>
            </div>
            {@render sw(d.lists_write === null, 'Every list', () => (d.lists_write = d.lists_write === null ? [] : null), false, `${ids}-list-line`)}
          </div>
          {#if d.lists_write !== null}
            <fieldset class="picks form-checks">
              <legend class="group-title pf-legend">Lists it may change</legend>
              {#each lists as l (l.id)}
                <label class="pick"><input type="checkbox" checked={hasList(l)} onchange={() => toggleList(l)} /><span dir="auto">{l.name}</span></label>
              {/each}
            </fieldset>
            {#if d.lists_write.length === 0}<p class="pf-quiet">None picked, so every change is asked.</p>{/if}
          {/if}
        {/if}
      </section>

      <!-- TOOLS -->
      <section class="part" aria-labelledby="{ids}-tools">
        <h3 class="part-title" id="{ids}-tools">Tools</h3>
        <p class="pf-quiet">Its briefing and what you tell it are always on. A tool you turn off is hidden from it.</p>
        {#each GROUPS as [group, title] (group)}
          <h4 class="group-title">{title}</h4>
          {#if group === 'write' && d.ceiling === 'read'}<p class="pf-quiet">At Read it has none of these.</p>{/if}
          <div class="tools">
            {#each TOOL_ROWS.filter((t) => t.group === group && !t.always) as t (t.name)}
              <div class="switch-row tool">
                <span class="switch-row-title">{t.label}</span>
                {@render sw(toolOn(t.name) && !(group === 'write' && d.ceiling === 'read'), t.label, () => flipTool(t.name), group === 'write' && d.ceiling === 'read')}
              </div>
            {/each}
          </div>
        {/each}
      </section>

      <!-- BRIEF -->
      <section class="part" aria-labelledby="{ids}-brief">
        <h3 class="part-title" id="{ids}-brief"><label for="{ids}-brief-text">Its brief</label></h3>
        <p class="pf-quiet" id="{ids}-brief-help">Every run of {isDefault ? 'a new agent' : who} reads this first.</p>
        <textarea
          id="{ids}-brief-text"
          class="pf-text"
          rows="4"
          aria-describedby="{ids}-brief-help"
          placeholder="Work in small commits. Ask before touching billing."
          aria-invalid={briefLeft < 0}
          bind:value={d.brief}
        ></textarea>
        {#if briefLeft < 500}<p class="pf-count" data-over={briefLeft < 0 ? '' : undefined}>{briefLeft < 0 ? `${-briefLeft} over` : `${briefLeft} left`}</p>{/if}
      </section>

      <!-- WHEN -->
      <section class="part" aria-labelledby="{ids}-when">
        <h3 class="part-title" id="{ids}-when">When</h3>
        <div class="switch-row">
          <div class="switch-row-words">
            <span class="switch-row-title">Quiet hours</span>
            <p class="switch-row-line" id="{ids}-quiet-line">Its jobs do not start, and what it would tell you waits.</p>
          </div>
          {@render sw(d.quiet !== null, 'Quiet hours', () => (d.quiet = d.quiet === null ? { ...QUIET_START } : null), false, `${ids}-quiet-line`)}
        </div>
        {#if d.quiet !== null}
          <div class="times">
            <label class="time"><span>From</span>
              <select class="pickf" bind:value={d.quiet.from}>{#each TIMES as t (t)}<option value={t}>{t}</option>{/each}</select>
            </label>
            <label class="time"><span>to</span>
              <select class="pickf" bind:value={d.quiet.to}>{#each TIMES as t (t)}<option value={t}>{t}</option>{/each}</select>
            </label>
          </div>
        {/if}
        <h4 class="group-title" id="{ids}-finish">Tell me when it finishes</h4>
        <Segmented role="group" aria-labelledby="{ids}-finish" full>
          {#each NOTIFY_ONS as on (on)}
            <button type="button" class="segment" aria-pressed={d.notify.on === on} data-on={d.notify.on === on ? '' : undefined} onclick={() => pickNotify(on)}>{NOTIFY_WORDS[on]}</button>
          {/each}
        </Segmented>
        <p class="pf-quiet">{NOTIFY_LINES[d.notify.on]}</p>
        {#if d.notify.on === 'long'}
          <label class="inline-field">
            <span>Runs over</span>
            <input class="pickf form-number" type="number" min="1" max="1440" inputmode="numeric" value={d.notify.minutes ?? ''} oninput={(e) => (d.notify = { ...d.notify, minutes: Number(e.currentTarget.value) })} />
            <span>minutes</span>
          </label>
        {/if}
        {#if d.notify.on !== 'off'}
          <h4 class="group-title" id="{ids}-by">How</h4>
          <Segmented role="group" aria-labelledby="{ids}-by" full>
            {#each NOTIFY_BYS as by (by)}
              <button type="button" class="segment" aria-pressed={d.notify.by === by} data-on={d.notify.by === by ? '' : undefined} onclick={() => (d.notify = { ...d.notify, by })}>{NOTIFY_BY_WORDS[by]}</button>
            {/each}
          </Segmented>
        {/if}
      </section>

      <!-- LIMITS -->
      <section class="part" aria-labelledby="{ids}-limits">
        <h3 class="part-title" id="{ids}-limits">Cost and limits</h3>
        <p class="pf-quiet">Jobs it runs with nobody at the terminal stop at these, so it cannot run up a bill. Empty means no limit.</p>
        <div class="caps">
          {#each CAP_FIELDS as [k, label] (k)}
            <label class="cap"><span class="field-label">{label}</span>
              <input class="pickf form-number" type="number" min="0" inputmode="numeric" placeholder="No limit" value={capOf(k)} oninput={(e) => setCap(k, e.currentTarget.value)} />
            </label>
          {/each}
        </div>
        <label class="inline-field">
          <span>In a terminal, ask it to wrap up after</span>
          <input class="pickf form-number" type="number" min="0" max="72" inputmode="numeric" value={capOf('wrap_hours')} oninput={(e) => setCap('wrap_hours', e.currentTarget.value)} />
          <span>hours</span>
        </label>
      </section>

      <!-- STOP AND LIVE PUSH -->
      <section class="part" aria-labelledby="{ids}-stop">
        <h3 class="part-title" id="{ids}-stop">Stop and live push</h3>
        <div class="switch-row">
          <div class="switch-row-words">
            <span class="switch-row-title">Stop switch</span>
            <p class="switch-row-line" id="{ids}-hooks-line">
              {#if hooks}When you press Stop, Claude Code is blocked from its next step on your machine. Off, Stop only refuses its changes to BrainDog.{:else}Only Claude Code can be stopped on the machine. {who} is stopped at BrainDog: its changes are refused.{/if}
            </p>
          </div>
          {@render sw(hooks && d.enforce.hooks, 'Stop switch', () => (d.enforce = { ...d.enforce, hooks: !d.enforce.hooks }), !hooks, `${ids}-hooks-line`)}
        </div>
        <div class="switch-row">
          <div class="switch-row-words">
            <span class="switch-row-title">Live push</span>
            <p class="switch-row-line" id="{ids}-channel-line">
              {#if hooks}Sends what you tell it into Claude Code while it works, not at its next step. This is a Claude Code preview: it has to be started with a development flag, and asks you to confirm.{:else}Only Claude Code takes live push. {who} hears you at its next step.{/if}
            </p>
          </div>
          {@render sw(hooks && d.enforce.channel, 'Live push', () => (d.enforce = { ...d.enforce, channel: !d.enforce.channel }), !hooks, `${ids}-channel-line`)}
        </div>
        <div class="switch-row">
          <div class="switch-row-words">
            <span class="switch-row-title">News on its answers</span>
            <p class="switch-row-line" id="{ids}-lines-line">A line on its answers when something changes for it, like a new instruction.</p>
          </div>
          {@render sw(d.context.lines, 'News on its answers', () => (d.context = { ...d.context, lines: !d.context.lines }), false, `${ids}-lines-line`)}
        </div>
        <h4 class="group-title" id="{ids}-budget">How much it reads when a run starts</h4>
        <Segmented role="group" aria-labelledby="{ids}-budget" full>
          {#each CONTEXT_BUDGETS as b (b)}
            <button type="button" class="segment" aria-pressed={d.context.budget === b} data-on={d.context.budget === b ? '' : undefined} onclick={() => (d.context = { ...d.context, budget: b })}>{BUDGET_WORDS[b]}</button>
          {/each}
        </Segmented>
        <label class="model"><span class="field-label">Model</span>
          <input class="pickf" type="text" maxlength="200" placeholder="Sonnet for small fixes, Opus for design" aria-describedby="{ids}-model-help" bind:value={d.model} />
        </label>
        <p class="pf-quiet" id="{ids}-model-help">Its runner jobs use this. In a terminal it is advice.</p>
      </section>

      <p class="pf-said" role="alert">
        {#if said}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {said}{/if}
      </p>
    </div>
  {/if}
</Sheet>

<style>
  .prof {
    display: grid;
    gap: var(--sp-6);
  }

  .part {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .part + .part {
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--rule);
  }

  .part-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .part-title label {
    cursor: text;
  }

  .group-title {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .pf-level {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .pf-quiet,
  .pf-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* THE NOTE AT THE TOP: what applies to this agent now, on the inner fill so it reads as about the sheet. */
  .pf-note {
    padding: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* THE SWITCH ROWS IN A SHEET: `settings.css` draws them; in here they run the sheet's width with no top rule
     on the first. */
  .prof :global(.switch-row) {
    padding-block: var(--sp-2);
  }

  /* A TOOL IS ONE LINE: its name, then its switch. */
  /* TWO COLUMNS WHERE A NAME AND ITS SWITCH FIT TWICE, so fourteen switches are seven lines; one on a phone. */
  .tools {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    column-gap: var(--sp-6);
  }

  .prof .tools > :global(.switch-row) {
    border-block-start: 1px solid var(--rule);
  }

  .tool {
    align-items: center;
  }

  .prof .tool > :global(.switch) {
    margin-block: 0;
  }

  .picks {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .pf-legend {
    padding: 0;
    margin-block-end: var(--sp-1);
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .pf-text {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 22px;
    resize: vertical;
  }

  .pf-text::placeholder,
  .pickf::placeholder {
    color: var(--ink-3);
  }

  .pf-text:focus-visible,
  .pickf:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .pf-count {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .pf-count[data-over] {
    color: var(--red);
  }

  /* A SMALL FIELD: a time, a number, a line of text, on the inner fill with no border. */
  .pickf {
    box-sizing: border-box;
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
  }

  .times,
  .inline-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .time {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .caps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--sp-3);
  }

  .cap,
  .model {
    display: grid;
    gap: 0;
  }

  .cap .pickf {
    inline-size: 100%;
  }

  .model .pickf {
    inline-size: 100%;
  }

  .pf-said {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .pf-said:empty {
    display: none;
  }

  @media (pointer: coarse) {
    .pickf {
      min-block-size: var(--tap);
    }
  }
</style>
