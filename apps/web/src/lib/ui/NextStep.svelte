<!--
  THE ONE NEXT STEP OF AN EMPTY STATE, as its button.

  WHILE NO AGENT HAS BEEN HEARD FROM, IT IS "Connect your agent", and the press opens the connect sheet in place
  (`lib/agents/ConnectSheet.svelte`, loaded with `import()` on the first press as Today's step loads it). Once one has called, it is the
  place's own first action (`own`), or nothing where the screen already has its add control beside the title.

  ASKED ONCE, when the empty state is drawn, and a read that fails or an answer that has a run in it both mean the place's own step.
  Nothing is drawn while the first answer is on its way, so the button never changes under a finger. Only the record's
  owner makes keys (`ownsRecord`), so anybody else gets the place's own step.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { createClient } from '@braindog/client';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { ConnectLines } from '$lib/record/device.ts';
  import type { Listened } from '$lib/agents/listen.ts';
  import type { Approve } from '$lib/agents/code-form.ts';
  import { ownsRecord } from '../../routes/settings/levels.ts';
  import Button from './Button.svelte';

  let {
    own,
  }: {
    /** The place's own first action, offered once an agent has been heard. Absent where the screen has one beside it. */
    own?: { label: string; href: string } | undefined;
  } = $props();

  const words = { connect: 'Connect your agent' };

  const shell = $derived(page.data as unknown as Partial<Shell>);
  const mayConnect = $derived(shell.me !== undefined && ownsRecord(shell.me));

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
  /* null while the first answer is on its way; true when no agent has called yet. */
  let unheard = $state<boolean | null>(null);

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
    return {
      Sheet: sheet.default,
      lines: device.connectLines(page.url.origin, slug),
      listen: listen.listenFor(client),
      Form: form.default,
      approve: code.approverOf(client),
    };
  }

  onMount(() => {
    if (!mayConnect) {
      unheard = false;
      return;
    }
    const client = createClient({ base: apiBase() });
    void import('$lib/agents/listen.ts')
      .then((m) => m.listenFor(client)(false))
      .then((got) => (unheard = got !== null && got.rows.length === 0))
      .catch(() => (unheard = false));
  });

  async function openSheet(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (loading) return;
    if (connect === null) {
      loading = true;
      connect = await load();
      loading = false;
      if (connect === null) return void goto(at('/settings/agents'));
    }
    sheetOpen = true;
  }
</script>

{#if unheard === true}
  <Button weight="primary" href="/settings/agents" aria-busy={loading || undefined} onclick={(e) => void openSheet(e)}>{words.connect}</Button>
{:else if unheard === false && own}
  <Button weight="primary" href={own.href}>{own.label}</Button>
{/if}

{#snippet codeField()}
  {#if connect}<connect.Form id="next-step-user-code" approve={connect.approve} />{/if}
{/snippet}

{#if connect}
  <connect.Sheet bind:open={sheetOpen} lines={connect.lines} listen={connect.listen} code={codeField} />
{/if}
