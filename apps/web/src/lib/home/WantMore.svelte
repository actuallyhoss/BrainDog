<!--
  "When you want more": the next steps a first Today offers once something real is in (use case 6, step 6; planner-45,
  the onboarding target). The two offers the first run made once, at `/start#made` (`madeOffers`), here where she comes
  back to, in the order her one answer puts them (`madeSteps`, `first-today.ts` `wantMore`), with Hide.

  A TILE OF LINES, NOT A GALLERY (DIRECTION §39): one line a step, its glyph, what it is, what it would do, and one quiet
  rectangle that goes there. Hide is the heading's own word, and it is kept (`pref.ts` `nextStepsHidden`), so a hidden
  tile stays hidden on the next visit.

  ITS WORDS ARE ITS OWN, in `say` below and not in `copy.ts`, as `first-run.ts` keeps the first run's: this is read by
  one screen, for a few days, and the entry chunk every screen waits for does not carry it. What each step would find is
  the first run's own sentence, said from the lists this record keeps.

  CONNECT OPENS THE CONNECT SHEET HERE (AGT-A07, "offered by the first run"): the one command and the live row that says
  when the agent has called, so the first agent is connected without leaving Today. The sheet is a chunk of its own,
  loaded with `import()` on the first press as Settings, Agents loads it, so Home carries none of it. Its `listen` is the
  one Settings hands it (`agents/listen.ts`). The step is still a link to Settings, Agents: a press with a modifier, a
  sheet that cannot load, and a reader who is not the record's owner (who may not make keys, `ownsRecord`, the rule
  Agents.svelte holds as `anOwner`) all go there.

  THE SIX DIGITS ARE TYPED HERE TOO (first-run-connect-91): `braindog setup` shows a code to approve, and the sheet draws
  the field under its setup line (`CodeForm.svelte`, the one Settings, Agents draws), loaded in the same chunk as the
  sheet. So the setup line, then the six digits, then "Connected", all without leaving Home; once a code is approved the
  step reads as done.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { write } from '$lib/pref.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { ConnectLines } from '$lib/record/device.ts';
  import type { Listened } from '$lib/agents/listen.ts';
  import type { Approve } from '$lib/agents/code-form.ts';
  import type { MadeStep } from '$lib/start/made.ts';
  import { createClient } from '@braindog/client';
  import { ownsRecord } from '../../routes/settings/levels.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let {
    steps,
    onhide,
  }: {
    /** The next steps, in order (`wantMore`); none draws nothing. */
    steps: readonly MadeStep[];
    /** After Hide is kept, so the page can let the tile go from its own reading too. */
    onhide?: (() => void) | undefined;
  } = $props();

  /** The tile's own words. */
  const say = {
    title: 'When you want more',
    hide: 'Hide',
    hideLabel: 'Hide these next steps',
    agent: (name: string) => `Connect ${name}`,
    agentGo: 'Connect',
    /* THE STEP DONE, said in words beside its tick in the well, so it is never a colour alone. */
    agentDone: (name: string) => `${name} is connected`,
    agentDoneDoes: 'Approved just now. It can reach this record.',
    bank: "Forward your bank's texts",
    mail: 'Forward your mail',
    file: 'Bring in a file from another app',
    /* WHAT FORWARDING DOES, said under its own name. The first run's sentence ("Forward it here, and…") was written
       under "Your bank's mail", and under "Forward your bank's texts" it said forward twice and called the texts "it". */
    bankDoes: 'Money fills itself from them.',
    mailDoes: 'The people who write to you fill in from it.',
    sourceGo: 'How',
    fileGo: 'Bring it in',
  };

  /** One step as its line draws it: the glyph, the name, what it would do, and where its button goes. */
  type Line = { key: string; icon: IconName; name: string; does: string; go: string; href: string; done?: true };

  /* A CODE APPROVED IN THE SHEET, which turns the agent's step to done for this visit. */
  let approved = $state(false);

  const lineOf = (s: MadeStep): Line =>
    s.kind === 'agent'
      ? approved
        ? { key: 'agent', icon: 'check', name: say.agentDone(s.agent.name), does: say.agentDoneDoes, go: '', href: '', done: true }
        : { key: 'agent', icon: 'plug', name: say.agent(s.agent.name), does: s.agent.finds, go: say.agentGo, href: '/settings/agents' }
      : {
          key: s.source.kind,
          icon: s.source.kind === 'bank' ? 'money' : s.source.kind === 'mail' ? 'inbox' : 'download',
          name: say[s.source.kind],
          does: s.source.kind === 'bank' ? say.bankDoes : s.source.kind === 'mail' ? say.mailDoes : s.source.finds,
          go: s.source.kind === 'file' ? say.fileGo : say.sourceGo,
          href: s.source.href,
        };

  const lines = $derived(steps.map(lineOf));

  /* HIDDEN AT ONCE, whether or not the page reads the preference again: the press is the answer. */
  let hidden = $state(false);

  function hide() {
    write({ nextStepsHidden: true });
    hidden = true;
    onhide?.();
  }

  /* THE SHEET IS THE OWNER'S, as on Settings, Agents: a key made in it is an owner's to make. */
  const shell = $derived(page.data as unknown as Partial<Shell>);
  const mayConnect = $derived(shell.me !== undefined && ownsRecord(shell.me));

  /* LOADED ON THE FIRST PRESS: the sheet, the record's lines and the live row's ask, all at once and kept. */
  type Connect = {
    Sheet: typeof import('$lib/agents/ConnectSheet.svelte').default;
    lines: ConnectLines;
    listen: (keys: boolean) => Promise<Listened | null>;
    /* THE SIX-DIGIT FIELD and its approval, in the sheet's chunk: Home's own entry carries neither. */
    Form: typeof import('$lib/agents/CodeForm.svelte').default;
    approve: Approve;
  };
  let connect = $state<Connect | null>(null);
  let sheetOpen = $state(false);
  let loading = $state(false);

  async function load(): Promise<Connect | null> {
    const [sheet, device, listen, form, code] = await Promise.all([
      import('$lib/agents/ConnectSheet.svelte'),
      import('$lib/record/device.ts'),
      import('$lib/agents/listen.ts'),
      import('$lib/agents/CodeForm.svelte'),
      import('$lib/agents/code-form.ts'),
    ]).catch(() => [null, null, null, null, null] as const);
    if (sheet === null || device === null || listen === null || form === null || code === null) return null;
    /* THE BARE HOST, as Settings' lines carry it; the setup line names this record when there is one. */
    const slug = shell.live === true ? (shell.index?.slug ?? null) : null;
    /* ONE CLIENT for the live row's ask and the approval, as Settings, Agents makes one for both. */
    const client = createClient({ base: apiBase() });
    return {
      Sheet: sheet.default,
      lines: device.connectLines(page.url.origin, slug),
      listen: listen.listenFor(client),
      Form: form.default,
      approve: code.approverOf(client),
    };
  }

  /* A PRESS WITH A MODIFIER OPENS THE LINK where the person asked for it; a sheet that cannot load goes there too. */
  async function openSheet(e: MouseEvent, href: string) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (loading) return;
    if (connect === null) {
      loading = true;
      connect = await load();
      loading = false;
      if (connect === null) return void goto(at(href));
    }
    sheetOpen = true;
  }
</script>

{#if !hidden && lines.length > 0}
  <Tile icon="more" title={say.title} class="want-more" data-want-more>
    {#snippet actions()}
      <Button weight="bare" size="sm" aria-label={say.hideLabel} onclick={hide}>{say.hide}</Button>
    {/snippet}
    <ul class="want-more-lines">
      {#each lines as line (line.key)}
        <li class="want-more-line" data-step={line.key}>
          <IconWell name={line.icon} />
          <span class="want-more-words">
            <span class="want-more-name">{line.name}</span>
            <span class="want-more-does">{line.does}</span>
          </span>
          {#if line.done}
            <!-- DONE: the tick in the well and the name saying so; there is nowhere left for a button to go. -->
          {:else if line.key === 'agent' && mayConnect}
            <Button size="sm" href={line.href} aria-busy={loading || undefined} onclick={(e) => void openSheet(e, line.href)}>{line.go}</Button>
          {:else}
            <Button size="sm" href={line.href}>{line.go}</Button>
          {/if}
        </li>
      {/each}
    </ul>
  </Tile>
{/if}

<!-- THE SIX DIGITS UNDER THE SETUP LINE, the owner's only, as on Settings, Agents: the sheet opens for nobody else. -->
{#snippet codeField()}
  {#if connect}<connect.Form id="home-user-code" approve={connect.approve} onchanged={() => (approved = true)} />{/if}
{/snippet}

{#if connect}
  <connect.Sheet bind:open={sheetOpen} lines={connect.lines} listen={connect.listen} code={mayConnect ? codeField : undefined} />
{/if}

<style>
  /* ONE LINE A STEP: the well, the words taking what is left, the button at the end. On a phone the words wrap and the
     button stays on the line, since both steps are short. */
  .want-more-lines {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .want-more-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: center;
  }

  .want-more-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .want-more-name {
    font-size: var(--fs-body);
    font-weight: 500;
    color: var(--ink);
  }

  .want-more-does {
    font-size: var(--fs-body);
    color: var(--ink-2);
  }
</style>
