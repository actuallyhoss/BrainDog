<!--
  The agents working now on the Agents page (`panel: presence`, agents and MCP plan §4.4, §7.1): one run row each, a
  helper folded under the run it works for, and for the owner Tell, Pause and Stop with the honest line about what
  reaches each run.

  THE HOST'S HALF ONLY. braindog-render's `Presence` draws; `$lib/record/instruct.ts` words each row and makes the
  writes. Tell aims the composer above (`aim`); a stop, a pause or a resume is an instruction the record applies at once,
  and the other panel is told to read again (`told`).

  READ BY ANYONE WHO READS THE RUNS (`level: read`); the presses are drawn for the owner alone, since only a person
  signed in as the owner can instruct. With nothing open the tile is left out, heading and all, so it never stands over
  nothing: the page's line says nobody is working.

  SCOPED WHERE ANOTHER SCREEN HOLDS IT (plan §7.2): `run` draws that one run (Today's run sheet), `project` the runs on
  that project (a project's "Working here now"), and `oncount` tells the host how many it draws, for its heading.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Presence, type ControlMark, type PresenceView } from 'braindog-render/svelte';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { listen } from '../listen.svelte.ts';
  import { aim, control, presenceOf, scopedLeads, told, type LiveRun, type Project, type Thread } from '$lib/record/instruct.ts';

  let {
    owner = false,
    run = null,
    project = null,
    oncount,
  }: {
    owner?: boolean;
    /** Draw this run alone, by handle (`S883`). */
    run?: string | null;
    /** Draw the runs on this project alone, by handle (`things#1`). */
    project?: string | null;
    /** How many runs it draws, each time that changes. */
    oncount?: ((n: number) => void) | undefined;
  } = $props();

  const io = control(apiBase());
  let rows = $state.raw<LiveRun[]>([]);
  let threads = $state.raw<Thread[]>([]);
  let projects = $state.raw<Map<string, Project>>(new Map());
  let pressing = $state.raw<Set<string>>(new Set());

  const mark = (agent: string): ControlMark | null => (isMarked(agent) ? AGENT_MARKS[agent] : null);

  async function load(): Promise<void> {
    const [p, t] = await Promise.all([io.presence(), owner ? io.threads(20, run ?? undefined) : Promise.resolve({ ok: false as const, fix: '' })]);
    if (p.ok) rows = p.value;
    if (t.ok) threads = t.value;
    if (projects.size === 0 || rows.some((r) => r.project !== null && !projects.has(r.project))) projects = await io.projects(rows);
  }

  onMount(() => {
    void load();
    const off = told.on(() => void load());
    /* "HEARD 3 MIN AGO" IS A CLOCK, and a pulse moves no version, so the rows are read again every fifteen seconds too. */
    const clock = setInterval(() => void load(), 15_000);
    return () => {
      off();
      clearInterval(clock);
    };
  });

  listen(load, () => pressing.size > 0);

  const views = $derived(
    scopedLeads(rows, { run, project }).map((r): PresenceView => {
      const v = presenceOf(r, rows, projects, threads);
      return { ...v, href: v.href ? at(v.href) : null, busy: pressing.has(r.run) };
    }),
  );

  $effect(() => oncount?.(views.length));

  async function hold(run: string, kind: 'stop' | 'pause' | 'resume', why: string): Promise<void> {
    pressing = new Set([...pressing, run]);
    try {
      const out = await io.hold(run, kind, why);
      if (!out.ok) toasts.push(out.fix, { intent: 'warn' });
    } finally {
      pressing = new Set([...pressing].filter((x) => x !== run));
    }
    told.say();
  }
</script>

{#if views.length === 0}
  <!-- NOTHING OPEN, OR NOT READ YET: the tile is left out whole, heading and all (`BlockSlot.svelte`'s rule for a panel
       that drew nothing), since the page's line already says nobody is working. -->
  <span data-seen-none hidden></span>
{:else}
  <Presence
    rows={views}
    {mark}
    ontell={owner ? (key) => aim.say(key) : undefined}
    onstop={owner ? (key, kind, why) => void hold(key, kind, why) : undefined}
    onresume={owner ? (key) => void hold(key, 'resume', '') : undefined}
  />
{/if}
