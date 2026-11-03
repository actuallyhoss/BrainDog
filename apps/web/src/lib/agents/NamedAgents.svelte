<!--
  THE AGENTS HE NAMED THAT HAVE NOT CALLED YET, on the Agents page under "Nobody working right now" (1 Nov, a live run:
  "Claude, and Figma" said "That adds Agents", and the Agents page then held no agent). One row an agent: its mark, its
  name, "Not connected yet", and one plain "Connect Claude" that opens the connect sheet on that app's way in, the sheet
  Settings, Agents opens.

  FROM THE RECORD'S OWN AGENT ROWS (`agentProfiles`): each row kept for one kind of agent, which the first run's Make it
  mine writes for every agent named (`keepAgents` in `routes/start/accept.ts`) and the record writes for every kind that
  calls. A row the record has heard from is connected and is not drawn here; nothing is drawn while the rows are read,
  for anyone who is not the owner, or where every agent named has called.

  THE SHEET IS LOADED ON THE FIRST PRESS, as `NextStep.svelte` loads it, and a press that cannot load it goes to
  Settings, Agents.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { isMarked, markOf } from '@braindog/skin/agent-marks.ts';
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { ConnectLines } from '$lib/record/device.ts';
  import type { Listened } from '$lib/agents/listen.ts';
  import type { Approve } from '$lib/agents/code-form.ts';
  import type { TileId } from '$lib/agents/connect.ts';
  import { ownsRecord } from '../../routes/settings/levels.ts';
  import Button from '$lib/ui/Button.svelte';

  const words = {
    label: 'Agents you named',
    waiting: 'Not connected yet',
    /* THE BUTTON SAYS "CONNECT", the row's name beside it says whom (UI pass, 3 Nov): "Claude" over "Connect Claude"
       said the name twice on one line. A screen reader hears the whole of it. */
    connectShort: 'Connect',
    connect: (name: string) => `Connect ${name}`,
  } as const;

  /** The way in the sheet opens on for each kind of agent: Claude's is the app, the one most people use. */
  const START: Readonly<Record<string, TileId>> = { claude: 'claude-web', cursor: 'cursor', codex: 'codex' };

  type Row = { id: string; kind: string; name: string };

  const shell = $derived(page.data as unknown as Partial<Shell>);
  const mayConnect = $derived(shell.me !== undefined && ownsRecord(shell.me));
  let rows = $state.raw<Row[]>([]);

  onMount(() => {
    if (!mayConnect) return;
    const client = createClient({ base: apiBase() }) as unknown as {
      agentProfiles: () => Promise<{ ok: boolean; value?: { id: string; name: string; match?: Record<string, string | undefined>; heard_at?: string | null; retired_at?: string | null }[] }>;
    };
    void client
      .agentProfiles()
      .then((out) => {
        if (!out.ok || !Array.isArray(out.value)) return;
        rows = out.value.flatMap((p) => {
          const m = p.match ?? {};
          const kind = m.kind;
          /* ONE KIND'S OWN ROW, NEVER HEARD FROM, of an agent with a mark of its own. */
          if (!kind || m.token || m.host || m.seat || p.retired_at || p.heard_at || !isMarked(kind)) return [];
          return [{ id: p.id, kind, name: p.name }];
        });
      })
      .catch(() => undefined);
  });

  type Connect = {
    Sheet: typeof import('$lib/agents/ConnectSheet.svelte').default;
    lines: ConnectLines;
    listen: (keys: boolean) => Promise<Listened | null>;
    Form: typeof import('$lib/agents/CodeForm.svelte').default;
    approve: Approve;
  };
  let connect = $state<Connect | null>(null);
  let sheetOpen = $state(false);
  let loading = $state(false);
  let start = $state<TileId | undefined>(undefined);

  async function load(): Promise<Connect | null> {
    const [sheet, device, listen, form, code] = await Promise.all([
      import('$lib/agents/ConnectSheet.svelte'),
      import('$lib/record/device.ts'),
      import('$lib/agents/listen.ts'),
      import('$lib/agents/CodeForm.svelte'),
      import('$lib/agents/code-form.ts'),
    ]).catch(() => [null, null, null, null, null] as const);
    if (sheet === null || device === null || listen === null || form === null || code === null) return null;
    const slug = shell.live === true ? (shell.index?.slug ?? null) : null;
    const client = createClient({ base: apiBase() });
    return { Sheet: sheet.default, lines: device.connectLines(page.url.origin, slug), listen: listen.listenFor(client), Form: form.default, approve: code.approverOf(client) };
  }

  async function openSheet(e: MouseEvent, kind: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (loading) return;
    start = START[kind] ?? 'other';
    if (connect === null) {
      loading = true;
      connect = await load();
      loading = false;
      if (connect === null) return void goto(at('/settings/agents'));
    }
    sheetOpen = true;
  }
</script>

{#if rows.length > 0}
  <ul class="named" aria-label={words.label}>
    {#each rows as r (r.id)}
      {@const m = isMarked(r.kind) ? markOf(r.kind) : null}
      <li class="named-row">
        {#if m}
          <svg class="mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={m.d} fill-rule={m.rule} clip-rule={m.rule} /></svg>
        {/if}
        <span class="named-body">
          <b class="named-name">{r.name}</b>
          <span class="named-said">{words.waiting}</span>
        </span>
        <Button size="sm" href="/settings/agents" aria-label={words.connect(r.name)} aria-busy={loading || undefined} onclick={(e) => void openSheet(e, r.kind)}>{words.connectShort}</Button>
      </li>
    {/each}
  </ul>
{/if}

{#snippet codeField()}
  {#if connect}<connect.Form id="named-agents-user-code" approve={connect.approve} />{/if}
{/snippet}

{#if connect}
  <connect.Sheet bind:open={sheetOpen} lines={connect.lines} listen={connect.listen} code={codeField} {start} />
{/if}

<style>
  .named {
    display: grid;
    gap: var(--sp-2);
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  /* ONE ROW AN AGENT: its mark, its name over "Not connected yet", and Connect at the end, wrapping under on a phone. */
  .named-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .mark {
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    fill: currentColor;
  }

  .mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .named-body {
    display: grid;
    flex: 1 1 12ch;
    min-inline-size: 0;
  }

  /* A ROW'S TITLE AND ITS META LINE, as every list row: 15/20 over 12.5/18, 2 apart. */
  .named-body {
    gap: var(--row-stack);
  }

  .named-name {
    font-size: var(--fs-row);
    font-weight: var(--fw-medium);
    line-height: var(--lead-row);
  }

  .named-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
