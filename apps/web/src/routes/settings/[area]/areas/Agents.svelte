<!--
  Settings > Agents: one button that connects an agent, approving a machine, everything that is connected, and what
  Slash may do on its own.

  ONE BUTTON, CONNECT AN AGENT (AGT-A07), where three boxes of text stood. It opens the connect sheet
  (`lib/agents/ConnectSheet.svelte`), loaded with `import()` on the first press so the entry carries none of it: six
  ways in, each line with its Copy, a script's key made in its own tile, and a live row that says Connected when the
  app makes its first call.

  THE SIX DIGITS LEAD WHILE A MACHINE IS WAITING. A person arriving from a terminal is holding a code and looking for
  the box, so while a machine waits the field is the first thing on the screen; otherwise it is drawn in the sheet under
  the setup line, which is where the code turns up.

  ONE LIST OF WHAT IS CONNECTED. A machine, a key and an app are three ways of letting something act on the record,
  and `connected` in `record/device.ts` folds them into rows that each say what it is, what it can do, when it last
  worked and which run last used it, with Revoke.

  ALL OF IT IS THE OWNER'S. Approving, minting, revoking and listing what can act on the record are ADMIN methods, so a
  colleague is not shown controls the record refuses them. A colleague sees `MyTokens.svelte` instead: keys for their
  own agent, which the record caps by their own levels, and each of which the owner's list names by whose it is.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    RUNS_READ, connectLines, connected, nameOf, reachKey, reachOf, reportKeyOf,
    runName, runsOf, standing, waiting, type Connection, type DeviceRow, type Run, type TokenRow,
  } from '$lib/record/device.ts';
  import { lineOf, partsOf } from '$lib/record/apps.ts';
  import { planOf, revoke, words as vaultWords, type Plan } from '$lib/record/vault.ts';
  /* THE SIX-DIGIT FIELD, ONE COMPONENT that Home's connect sheet draws too; it approves through `vault.ts` `approve`,
     the approval `/vault` sends, so the screens cannot drift apart. */
  import CodeForm from '$lib/agents/CodeForm.svelte';
  import { approverOf } from '$lib/agents/code-form.ts';
  import { callsOutOf, type CallOut } from '$lib/record/actions.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { hostedHere } from '../../billing.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import { AGENTS_PACK, agentsPackDocument } from '@braindog/seed/packs';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { listenFor } from '$lib/agents/listen.ts';
  import { leavingFetch } from '$lib/ui/leaving.ts';
  import { TONES, relative, since } from 'braindog-render';
  import { isQuiet } from '@braindog/kernel';
  import { liveOf, type RunLive } from '$lib/ui/face.ts';
  import { PRESENCE_WORDS, presenceSaid, type RunPresence } from '$lib/ui/presence-words.ts';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import SlashAsks from '$lib/ui/SlashAsks.svelte';
  import SlashModel from '$lib/ui/SlashModel.svelte';
  import SlashDaily from '$lib/ui/SlashDaily.svelte';
  import SlashReads from '$lib/ui/SlashReads.svelte';
  import TrustRows from '$lib/ui/TrustRows.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import MyTokens from './MyTokens.svelte';
  import { words as ownWords } from './my-tokens.ts';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const SLUG = $derived(shell.index.slug);

  let client: ReturnType<typeof createClient> | null = null;
  const leaving = leavingFetch();
  $effect(() => leaving.stop);
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase(), fetch: leaving.io }));

  /**
   * What the record answered: its machines, its standing keys, the newest runs, which name who used each, and whether
   * each of those runs is at work now, gone quiet or stopped (`RunLive`), which the faces draw as their ring, and the one
   * word each reads as beside it (`RunPresence`): a run that finished reads Ended, not Stopped.
   */
  type Held = { machines: DeviceRow[]; tokens: TokenRow[]; runs: Run[]; live: Map<number, RunLive>; presence: Map<number, RunPresence> };

  /**
   * Each run's state as its face draws it, from the run's own `state` and when it was last heard from.
   *
   * THE KERNEL'S OWN QUIET, `isQuiet`: an open run not heard from in 15 minutes (`WORKING_MS`) has gone quiet, worked out when read, as
   * the record works it out for its live runs, so a face here and the board of runs never disagree about one run. The
   * 45 minutes of `isStale` is when the record stops joining a call to a run, which is not what a person is shown.
   */
  function livenessOf(rows: readonly unknown[], nowMs: number, words?: Map<number, RunPresence>): Map<number, RunLive> {
    const out = new Map<number, RunLive>();
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const r = row as { seq?: unknown; fields?: unknown };
      if (typeof r.seq !== 'number' || typeof r.fields !== 'object' || r.fields === null) continue;
      const f = r.fields as Record<string, unknown>;
      /* `last_seen` ALONE, which `isQuiet` reads itself: a run that never said it is never shown at work. */
      out.set(r.seq, liveOf(f.state, isQuiet({ fields: f as never }, nowMs)));
      /* AND ITS WORD, the six the record tells apart (`presence-words.ts`): the ring stays the face's three. */
      words?.set(r.seq, presenceSaid((r as { state?: unknown }).state, f, nowMs));
    }
    return out;
  }

  /**
   * THE MACHINES DECIDE WHETHER THE LIST WAS READ; the keys and the runs only add to it. A record that answers the
   * machines and not the keys still has a list worth drawing, and a run that cannot be read only leaves "last run"
   * off a row. There was a `sample` state here, which drew machines nobody connected; with no sample a
   * refusal is the record's sentence like any other.
   */
  async function listed(): Promise<Result<Held>> {
    const c = clientOf();
    const devices = await c.listDevices();
    if (!devices.ok) return devices;
    const keys = await c.listTokens();
    const runs = await c.list({ register: 'session', limit: RUNS_READ, order: [{ field: 'last_seen', dir: 'desc' }] });
    const presence = new Map<number, RunPresence>();
    return {
      ok: true,
      value: {
        machines: devices.value,
        tokens: keys.ok ? standing(keys.value as TokenRow[]) : [],
        runs: runs.ok ? runsOf(runs.value.rows) : [],
        live: runs.ok ? livenessOf(runs.value.rows, Date.now(), presence) : new Map(),
        presence,
      },
    };
  }

  /* ASKED ONLY OF AN OWNER, because every one of these reads is an owner's: a colleague asking would be told no, and
     that no would mark the whole screen refused for a question it had no reason to ask. */
  const held = read(() => (anOwner ? `agents:${apiBase()}` : null), listed);
  const rows = $derived(held.value ? connected(held.value.machines, held.value.tokens, held.value.runs) : []);
  const machines = $derived(held.value?.machines ?? []);
  const first = $derived(waiting(machines, Date.now()).length > 0);

  /* ONE APPROVAL OF THE SIX DIGITS over this screen's own client, made when first asked; a refusal keeps the code
     typed, and an approval reads the list again (`CodeForm.svelte`). */
  const approveCode = (typed: string) => approverOf(clientOf())(typed);

  /* ONE REVOKE AT A TIME, so a double press sends one. */
  let revoking = $state<string | null>(null);

  /* THE LINES CARRY THE BARE HOST, which only `settings-state.svelte.ts` reads (`lib/at-sites.test.ts`). */
  const origin = bareOrigin();
  /* THE SETUP LINE NAMES THIS RECORD, which the Cloud device flow needs; a shell with no record names none. */
  const lines = $derived(connectLines(origin, shell.live ? SLUG : null));

  /**
   * THE WORDS THE CONNECTED TILE ADDS: what each key can do in two words, at the end of its row, and
   * the line under the list that says what a propose-only key means for the person reading it.
   */
  const words = {
    scope: { read: 'can read', propose: 'can propose', write: 'can write' } as Record<string, string>,
    /* A GRANT THAT IS NOT A KEY'S SCOPE says what it may do in its own two words, and the sentence under its name says
       for how long; a one-time grant is "once", which is the whole of what makes it one. */
    grant: { login: 'can sign in', runner: 'can run work', vault: 'can open keys', vaultAll: 'can open keys', shape: 'can take scrambled copies' } as Record<string, string>,
    once: 'once',
    report: 'sends numbers',
    allAtWork: 'all at work now',
    atWork: (n: number) => `${n} at work now`,
    proposeOnly: (names: string, one: boolean) =>
      `${names} can only propose, so anything ${one ? 'it' : 'they'} would change waits for you in Needs you.`,
    readOnly: (names: string, one: boolean) => `${names} can only read, so ${one ? 'it changes' : 'they change'} nothing.`,
  };

  /**
   * A MACHINE WAITING FOR SIX DIGITS IS THE ONE ROW THAT WAITS ON THE READER, so its well is amber (waiting
   * on someone); every other state is said in words on the row, and a colour would only repeat them.
   */
  const waitsOnYou = (c: Connection): boolean => c.machine?.status === 'pending';

  /**
   * What a connection may do, in the two words the row ends with, and whether that says all of it.
   *
   * A PLAIN KEY'S SCOPE IS THE WHOLE ANSWER, so its row says it once, at the end. A key that also reads the inbox, a
   * report key and a machine's grant each carry more than two words can say (what it reaches, for how long), so their
   * row keeps `reachOf`'s sentence under the name as well.
   */
  function scopeOf(c: Connection): { word: string | null; whole: boolean } {
    const t = c.token;
    if (t) {
      if (reportKeyOf(t.label)) return { word: words.report, whole: false };
      return { word: words.scope[t.scope] ?? null, whole: !t.reach?.includes('inbox') };
    }
    const m = c.machine;
    if (!m) return { word: null, whole: false };
    return { word: words.grant[reachKey(m.reach, m.scope)] ?? words.once, whole: false };
  }

  /** The run's ring: at work, gone quiet or stopped, from the record's own row for it. */
  const liveOfRun = (run: Run): RunLive => held.value?.live.get(run.seq) ?? 'stopped';

  /** The run's word beside its face: Working now, Gone quiet, Left a step, Ended, Stopped or From before. */
  const wordOfRun = (run: Run): string | null => {
    const p = held.value?.presence.get(run.seq);
    return p ? PRESENCE_WORDS[p] : null;
  };

  /* HOW MANY ARE AT WORK NOW, which is the tile's meta only when some are: "all at work now" when every connection that
     can act has a run working, and the count when only some do. */
  const atWork = $derived.by(() => {
    const working = rows.filter((c) => c.live && c.run !== null && liveOfRun(c.run) === 'working').length;
    if (working === 0) return undefined;
    return working === rows.filter((c) => c.live).length ? words.allAtWork : words.atWork(working);
  });

  /**
   * THE LINE UNDER THE LIST: what the narrowest keys here mean for the reader. A key that can only propose sends every
   * change it would make to Decide, and saying so by name is what makes "can propose" a thing a person understands.
   */
  const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });
  const reading = $derived.by(() => {
    const plain = (scope: string): string[] =>
      rows.filter((c) => c.live && c.token?.scope === scope && !reportKeyOf(c.token.label)).map((c) => nameOf(c));
    const proposers = plain('propose');
    if (proposers.length > 0) return words.proposeOnly(LIST.format(proposers), proposers.length === 1);
    const readers = plain('read');
    if (readers.length > 0) return words.readOnly(LIST.format(readers), readers.length === 1);
    return null;
  });

  /**
   * The facts under a row's name, each its own item, so a line that wraps breaks between facts and never leaves a
   * separator leading the next line. A grant that is waiting or finished says only that: "never used"
   * beside "turned away" says nothing more.
   */
  function factsOf(c: Connection, nowMs: number, idle: number | null): string[] {
    if (c.machine?.ended_by === 'operator' || c.token?.ended_by === 'operator') return [copy.endedByOperator];
    const status = c.machine?.status;
    if (status === 'pending' || status === 'expired' || status === 'denied' || status === 'revoked') return [copy.deviceState[status] ?? status];
    const facts: string[] = status === 'approved' ? [copy.deviceState.approved ?? status] : [];
    /* WHOSE KEY IT IS, since a colleague may mint their own: Revoke means something different on a key the
       owner made and on one a colleague's agent runs on. `person_name` is on `listTokens`'s rows and not on the type
       `device.ts` declares, so it is read here as the optional it is. */
    const whose = (c.token as { person_name?: string | null } | null | undefined)?.person_name;
    if (whose) facts.push(ownWords.madeBy(whose));
    /* A CONNECTION GONE QUIET FOR OVER A WEEK SAYS SO IN ITS OWN MARKED WORDS on the row, so not twice here. */
    if (idle === null) facts.push(c.used ? copy.usedWhen(since(c.used, nowMs)) : copy.neverUsed);
    if (c.token?.expires_at) facts.push(copy.endsWhen(relative(c.token.expires_at.slice(0, 10), nowMs)));
    return facts;
  }

  /**
   * Revoke one row, and read the list again whether or not the record agreed.
   *
   * A MACHINE THAT SIGNED IN IS REVOKED AS A MACHINE: the kernel takes the key its grant minted with it
   * (`deviceRevoke`), which is why `connected` drew the two as one row.
   */
  async function revokeRow(c: Connection) {
    if (revoking !== null) return;
    revoking = c.key;
    const busy = opened();
    const out = c.machine ? await revoke(clientOf(), machines, c.machine.handle) : c.token ? wrote(await clientOf().revokeToken({ id: c.token.id })) : null;
    closed(true, busy);
    if (out !== null && !out.ok) toasts.push(out.fix, { intent: 'warn' });
    await held.reread();
    revoking = null;
  }

  /*
   * THE CONNECT SHEET, a chunk of its own: imported on the first press, so nothing of it is in what every screen loads.
   * The key form moved into it (its script tile), with the bearer it shows once.
   */
  let ConnectSheet = $state<typeof import('$lib/agents/ConnectSheet.svelte').default | null>(null);
  let sheetOpen = $state(false);
  let loadingSheet = $state(false);
  async function openSheet() {
    if (ConnectSheet === null) {
      loadingSheet = true;
      const loaded = await import('$lib/agents/ConnectSheet.svelte').catch(() => null);
      loadingSheet = false;
      if (loaded === null) {
        toasts.push(copy.screenFailed, { intent: 'warn' });
        return;
      }
      ConnectSheet = loaded.default;
    }
    sheetOpen = true;
  }

  /* WHAT THE SHEET'S LIVE ROW ASKS every two seconds (`lib/agents/listen.ts`), which Today's first step asks too, over
     this screen's own client, made when first asked. */
  const listen = (keys: boolean) => listenFor(clientOf())(keys);

  /* THE LIST IS READ AGAIN WHEN THE SHEET CLOSES, so what connected while it was open is in it. */
  let sheetWas = false;
  $effect(() => {
    const now = sheetOpen;
    if (!now && sheetWas) untrack(() => void held.reread());
    sheetWas = now;
  });

  /*
   * THE AGENTS ADD-ON, OFFERED ONCE SOMETHING IS CONNECTED, when this record does not have it, and on every visit
   * after that until it is installed or put off: the first connection is when a record starts to have agents worth a
   * page, and a key shown once was the only moment it was offered before. The plan is the record's own `planPack`
   * answer in the Packs screen's words, and Install sends its `planHash` back, so what installs is what was shown.
   * Not now changes nothing.
   */
  let offer = $state<Plan | null>(null);
  /* ASKED ONCE PER VISIT, and never again after Not now: the list is read again after every press, and each read
     would otherwise plan the pack again. */
  let offerAsked = false;
  $effect(() => {
    if (!rows.some((c) => c.live && c.machine?.status !== 'pending')) return;
    /* `untrack` FOR THE INGEST AREA'S REASON: `opened()` reads and writes the same state, and an effect that
       depends on what it writes runs for ever. */
    untrack(() => {
      if (offerAsked) return;
      offerAsked = true;
      void offerPack(clientOf());
    });
  });
  /* THE PLAN'S `calls_out`, beside the plan rather than in it, so `vault.ts` does not pull in `actions.ts`. */
  let offerCalls = $state<CallOut[]>([]);
  let installing = $state(false);
  let offerSaid = $state('');

  const packName = (kind: 'register' | 'page' | 'metric', id: string): string => {
    const named = kind === 'register' ? AGENTS_PACK.registers[id]?.name : kind === 'metric' ? AGENTS_PACK.metrics[id]?.name : AGENTS_PACK.pages[id]?.title;
    return typeof named === 'string' && !named.includes('{{') ? named : id.charAt(0).toUpperCase() + id.slice(1);
  };

  /* THE LINES THE OFFER DRAWS ARE THE LINES INSTALL APPROVES. The record refuses an install that adds a
     call without them, and this screen shows every one through `CallsOut` before Install is pressed. */
  let offerApprove: string[] = [];

  async function offerPack(c: ReturnType<typeof createClient>) {
    const busy = opened();
    const packs = await c.packs();
    if (!packs.ok || packs.value.some((p) => p.id === AGENTS_PACK.manifest.id)) {
      closed(true, busy);
      return;
    }
    const planned = await c.planPack({ doc: agentsPackDocument(), source: { kind: 'local' } });
    closed(true, busy);
    offerSaid = '';
    const diff = planned.ok ? (planned.value as { diff?: { calls_out?: unknown; approve?: unknown } }).diff : undefined;
    offer = planned.ok ? planOf(diff, packName) : null;
    offerCalls = callsOutOf(diff?.calls_out);
    offerApprove = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  }

  async function installOffer() {
    if (!offer || installing) return;
    installing = true;
    const busy = opened();
    const out = wrote(await clientOf().installPack({ doc: agentsPackDocument(), source: { kind: 'local' }, planHash: offer.planHash, ...(offerApprove.length > 0 ? { approve: offerApprove } : {}) }));
    closed(true, busy);
    installing = false;
    if (out.ok) {
      offer = null;
      toasts.push(vaultWords.packInstalled, { intent: 'good' });
    } else if (!out.ok && out.from === 'refused' && out.code === 'PLAN_STALE') {
      /* THE PLAN MOVED UNDER IT, so it is read again and shown again: what installs is what was shown.
         The sentence says the plan moved only when a fresh plan is on screen to approve. */
      await offerPack(clientOf());
      offerSaid = offer ? out.fix : '';
    } else offerSaid = out.fix;
  }
</script>

<!--
  APPROVING, MINTING AND LISTING ARE THE OWNER'S, which this screen once never asked: `deviceApprove`, `createToken`,
  `listDevices` and `listTokens` all need `owner`, and a `read` colleague was offered the six-digit field and its
  Approve button. So everything but Slash's sections is drawn inside this arm, and a colleague is given their own keys.
-->
{#if anOwner}
  <!--
    THE SIX-DIGIT FIELD, drawn once, in one of two places: first on the screen while a machine is waiting, and as the
    setup card's last step otherwise. One component (`CodeForm.svelte`), which Home's connect sheet draws too: a `<form>`,
    so Enter sends it, with paste never blocked and no `maxlength`, since the CLI prints the code in two groups and seven
    digits is refused out loud rather than trimmed to a different code. The sheet takes it as a snippet.
  -->
  {#snippet codeForm()}
    <CodeForm id="user-code" approve={approveCode} onchanged={() => held.reread()} />
  {/snippet}

  {#if first}
    <Section title={copy.approveTitle}><CodeForm id="user-code" approve={approveCode} onchanged={() => held.reread()} /></Section>
  {/if}

  <!--
    EVERYTHING THAT CAN ACT ON THE RECORD, AS ONE LIST TILE: each machine or key with its face, what it
    can do in two words at the end of its row, and the line under the list that says what the narrowest of them means.
    Every row the record keeps, denied ones included: "I said no to a request I did not make" (`12 §6.1`). Never a
    secret, a handle or an id: a row is named by what runs on it or the name it was given (`12 §3`). A pure list, so the
    one tile that holds no chart.
  -->
  <Tile icon="session" title={copy.connectedTitle} count={held.state === 'ready' ? rows.length : undefined} meta={atWork}>
    {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if rows.length === 0}
      <Empty kind="no-data-yet" compact title={copy.connectedNone} body={copy.connectedNoneWhy} />
    {:else}
      {@const nowMs = Date.now()}
      <ul class="whos">
        {#each rows as c (c.key)}
          {@const scope = scopeOf(c)}
          {@const parts = partsOf(c, nowMs)}
          <li class="who" data-done={c.live ? undefined : ''}>
            <!-- A RUN'S FACE WHERE A RUN USED IT, its ring the run's state (at work, quiet, stopped); a well otherwise,
                 amber only on the machine waiting for the reader's six digits. -->
            {#if c.run}
              <AgentFace agent={c.run.agent} run={runName(c.run)} live={liveOfRun(c.run)} />
            {:else}
              <IconWell name={c.machine ? 'session' : 'key'} size="l" tone={waitsOnYou(c) ? 'warn' : undefined} />
            {/if}
            <span class="who-words">
              <!-- `dir="auto"`: an app names itself, in whatever script it chose. -->
              <span class="who-name" dir="auto">{parts.app}</span>
              <!-- WHERE IT RUNS AND HOW IT CAME IN, one quieter line: "On Studio, signed in", "A key you made". -->
              <span class="who-detail" dir="auto">{lineOf(c, parts)}</span>
              {#if !scope.whole}<span class="who-detail who-reach">{reachOf(c)}</span>{/if}
              <span class="who-detail who-facts">
                <!-- UNUSED FOR OVER A WEEK: the warn tone, and its mark beside the words, never the colour alone. -->
                {#if parts.idle !== null}<span class="who-idle"><span role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span> {copy.notUsedFor(parts.idle)}</span>{/if}
                {#each factsOf(c, nowMs, parts.idle) as fact}<span>{fact}</span>{/each}
                <!-- THE RUN THAT LAST USED IT, BY THE NAME ITS WRITES ARE SIGNED WITH, and a link to what it did. `.tap`
                     because `S47` in small text is a target far under a thumb's 44px. -->
                {#if c.run}<span>{copy.lastRun} <a class="run tap" href={at(`/r/session/${c.run.seq}`)}>{runName(c.run)}</a></span>{/if}
                <!-- WHERE THAT RUN IS NOW, in the record's six words: a finished run reads Ended, an imported one From before. -->
                {#if c.run && wordOfRun(c.run)}<span>{wordOfRun(c.run)}</span>{/if}
              </span>
            </span>
            {#if c.live && scope.word}<span class="who-scope">{scope.word}</span>{/if}
            <span class="who-do">
              {#if c.live}
                <Button weight="bare" size="sm" tone="bad" disabled={revoking !== null} onclick={() => void revokeRow(c)}>{copy.revokeKey}</Button>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
      {#if reading}<p class="reading">{reading}</p>{/if}
    {/if}
  </Tile>
  <TrustRows />

  <!-- THE AGENTS ADD-ON, OFFERED ONCE SOMETHING IS CONNECTED, on the ground under the list it follows from. -->
  {#if offer}
    <div class="code-form offer">
      <p class="code-label">{copy.installDiff}</p>
      {#if offer.summary}<p class="who-why">{offer.summary}</p>{/if}
      <dl class="plan">
        <dt>{copy.diffAdds}</dt>
        <dd>
          <ul class="plan-adds">
            {#each offer.adds as add (add.kind + add.name)}
              <li>
                <Icon name={add.kind === 'list' ? 'rows' : add.kind === 'figure' ? 'observe' : 'doc'} size="s" />
                <span class="plan-name">{add.name}</span>
                <span class="plan-detail">{add.detail}</span>
              </li>
            {/each}
          </ul>
        </dd>
        {#if offer.changes.length}
          <dt>{vaultWords.changesTitle}</dt>
          <dd>{#each offer.changes as c (c)}<p>{c}</p>{/each}</dd>
        {/if}
        {#if offer.conflicts.length}
          <dt>{copy.diffConflicts}</dt>
          <dd>{#each offer.conflicts as c (c)}<p>{c}</p>{/each}</dd>
        {/if}
        <CallsOut calls={offerCalls} hosted={hostedHere(shell)} />
        {#if offer.seeds}
          <dt>{copy.diffSeeds}</dt>
          <dd>{offer.seeds}</dd>
        {/if}
        <dt>{copy.diffTouches}</dt>
        <dd>{offer.touches}</dd>
      </dl>
      <div class="row-actions">
        <Button disabled={installing || offer.conflicts.length > 0} onclick={() => void installOffer()}>{copy.install}</Button>
        <Button weight="bare" onclick={() => (offer = null)}>{vaultWords.notNow}</Button>
      </div>
      <p class="code-said" role="status" data-intent={offerSaid ? 'bad' : undefined}>
        {#if offerSaid}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {offerSaid}{/if}
      </p>
    </div>
  {/if}

  <!-- CONNECT AN AGENT: one primary button where the three boxes stood. The sheet it opens is a chunk of its own, asked
       for on the first press; the six-digit field rides in it under the setup line while no machine waits above. -->
  <div class="connect">
    <Button weight="primary" disabled={loadingSheet} onclick={() => void openSheet()}>{copy.connectTitle}</Button>
  </div>
  {#if ConnectSheet}
    <ConnectSheet bind:open={sheetOpen} {lines} {listen} code={first ? undefined : codeForm} onchanged={() => void held.reread()} />
  {/if}

{:else}
  <!-- A COLLEAGUE CONNECTS THEIR OWN AGENT, with a key of their own capped by their own levels, rather than being shown
       three ways in that the record would refuse them at the end. -->
  <MyTokens />
{/if}
<SlashAsks owner={anOwner} />
<SlashModel owner={anOwner} />
<!-- SLASH LOOKING ON ITS OWN is the owner's choice, beside the agents they let in. -->
<SlashDaily link />
<!-- WHAT SLASH READS ON ITS OWN, and what a model is sent: the one switch for it, and the paragraph that says so. -->
<SlashReads />

<style>
  /* THE CONNECTED TILE'S ROWS: the face or the 32px well, the name over what is known about it, what it can
     do in two words, and Revoke at the end, at a two-line row's height with a hairline between each. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .who + .who {
    border-block-start: 1px solid var(--line);
  }

  /* A FINISHED GRANT KEEPS SAYING WHAT IT SAID, quieter: it can do nothing, and the rows that can come first. */
  .who[data-done] .who-name {
    color: var(--ink2);
  }

  /* THE FACE SITS IN THE WELL'S COLUMN, centred, so faces and wells start every name on one edge. */
  .who > :global(.agent-face) {
    justify-self: center;
  }

  .who-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  /* A NAME AN APP OR A MACHINE CHOSE MAY BE ONE LONG WORD, a host name most of all, and it breaks rather than
     pushing the row past the edge at 320. */
  .who-name {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .who-detail {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* WHAT IT WOULD BE ALLOWED TO DO, where two words do not say all of it: the sentence the decision is made from, so
     the second ink rather than the quiet one. */
  .who-reach {
    color: var(--ink2);
  }

  /* A CONNECTION NOBODY HAS USED FOR OVER A WEEK: worth a look, so the warn tone, with its mark. */
  .who-idle {
    color: var(--warn);
  }

  /* WHAT IT CAN DO, IN TWO WORDS, at the end of the row where the eye runs down the list. */
  .who-scope {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
  }

  /* The control sits at the end of the row and never shrinks: a button that wraps its own label is a button somebody
     reads twice. */
  .who-do {
    display: flex;
    flex: none;
    gap: var(--sp-2);
  }

  /* THE ONE WRITTEN LINE under the list, in ink. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* ON A PHONE THE TWO WORDS AND REVOKE GO UNDER THE NAME, starting where the name starts. Beside the name, Revoke took
     a third of a 390px row from the words that say what is being revoked, and a destructive button pressed by mistake
     next to a name is the worst tap on this screen. */
  @media (width < 640px) {
    .who {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
      align-items: start;
      row-gap: var(--sp-1);
      min-block-size: 60px;
    }

    .who-scope,
    .who-do {
      grid-column: 2;
    }
  }

  /* THE ADD-ON OFFER, on the ground under the tile it follows from. */
  .offer {
    margin-block-start: 0;
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE BLOCKS BELOW THE SIX-DIGIT FIELD, which show a key once and offer an install: not field rows. The field itself
     is `CodeForm.svelte`'s, with its own styles, since Home's connect sheet draws it too. Nothing here sets a colour:
     the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* WHAT THE ADD-ON WOULD ADD, as label and value on the page with nothing round them: a filled, bordered panel
     inside a section is the box in a box design 6.8.6 rules out. */
  .plan {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .plan dt {
    color: var(--dim);
    font-weight: 600;
  }

  .plan dd,
  .plan dd p {
    margin: 0;
  }

  /* ONE COLUMN ON A PHONE, for the reason the Packs screen's diff gives. */
  @media (width < 640px) {
    .plan {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .plan-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-adds li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-name {
    color: var(--ink);
  }

  .plan-detail {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* THE FACTS UNDER A NAME WRAP AS WHOLE ITEMS, with space between them and no separator to lead a line. */
  .who-facts {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
  }

  /* A LINK AS EVERY LINK IS DRAWN: ink, with a 1px underline at 40% ink, 3px below. */
  .run {
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* THE ONE BUTTON THAT CONNECTS AN AGENT, on the board under the list it adds to. */
  .connect {
    display: flex;
    margin-block-start: var(--sp-3);
  }
</style>
