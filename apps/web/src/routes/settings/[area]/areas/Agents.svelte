<!--
  Settings > Agents: connecting an agent three ways, approving a machine, everything that is connected, and what Slash
  may do on its own (`loop/finish/agents.md` AGT-8).

  THREE WAYS IN, ONE UNDER ANOTHER. Any MCP client takes the record's address and signs in through OAuth, which the owner
  allows on `/connect`; Claude Code with its hooks and skills is one install line and one `braindog setup`, which
  shows six digits to approve here; a script or a server is given a key, shown once, with the header it is sent in.

  THE SIX DIGITS LEAD WHILE A MACHINE IS WAITING. A person arriving from a terminal is holding a code and looking for
  the box, so while a machine waits the field is the first thing on the screen; otherwise it is the setup card's last
  step, which is where the code turns up.

  ONE LIST OF WHAT IS CONNECTED. A machine, a key and an app are three ways of letting something act on the record,
  and `connected` in `record/device.ts` folds them into rows that each say what it is, what it can do, when it last
  worked and which run last used it, with Revoke.

  ALL OF IT IS THE OWNER'S. Approving, minting, revoking and listing what can act on the record are ADMIN methods, so a
  colleague is not shown controls the record refuses them. A colleague sees `MyTokens.svelte` instead: keys for their
  own agent, which the record caps by their own levels (COL-10), and each of which the owner's list names by whose it is.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { INSTALL_LINES, OSES, osOf, type Os } from '$lib/device.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    CODE_DIGITS, LABEL_MAX, RUNS_READ, TOKEN_DAYS, connectLines, connected, headerLine, nameOf, reachOf, runName, runsOf,
    standing, waiting, type Answer, type Connection, type DeviceRow, type Run, type TokenRow,
  } from '$lib/record/device.ts';
  /* THE APPROVAL `/vault` SENDS TOO, from one module, so the two screens cannot drift apart. */
  import { answerLine as lineOf, approve, planOf, reprove, revoke, words as vaultWords, type Plan } from '$lib/record/vault.ts';
  import { callsOutOf, type CallOut } from '$lib/record/actions.ts';
  import { mintAgent, wrote } from '$lib/record/settings-write.ts';
  import { hostedHere } from '../../billing.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import { AGENTS_PACK, agentsPackDocument } from '@braindog/seed/packs';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { TONES, relative, since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import SlashAsks from '$lib/ui/SlashAsks.svelte';
  import SlashModel from '$lib/ui/SlashModel.svelte';
  import SlashDaily from '$lib/ui/SlashDaily.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
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
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /** What the record answered: its machines, its standing keys, and the newest runs, which name who used each. */
  type Held = { machines: DeviceRow[]; tokens: TokenRow[]; runs: Run[] };

  /**
   * THE MACHINES DECIDE WHETHER THE LIST WAS READ; the keys and the runs only add to it. A record that answers the
   * machines and not the keys still has a list worth drawing, and a run that cannot be read only leaves "last run"
   * off a row. There was a `sample` state here, which drew machines nobody connected; with no sample (DIRECTION 26) a
   * refusal is the record's sentence like any other.
   */
  async function listed(): Promise<Result<Held>> {
    const c = clientOf();
    const devices = await c.listDevices();
    if (!devices.ok) return devices;
    const keys = await c.listTokens();
    const runs = await c.list({ register: 'session', limit: RUNS_READ, order: [{ field: 'last_seen', dir: 'desc' }] });
    return {
      ok: true,
      value: {
        machines: devices.value,
        tokens: keys.ok ? standing(keys.value as TokenRow[]) : [],
        runs: runs.ok ? runsOf(runs.value.rows) : [],
      },
    };
  }

  /* ASKED ONLY OF AN OWNER, because every one of these reads is an owner's: a colleague asking would be told no, and
     that no would mark the whole screen refused for a question it had no reason to ask. */
  const held = read(() => (anOwner ? `agents:${apiBase()}` : null), listed);
  const rows = $derived(held.value ? connected(held.value.machines, held.value.tokens, held.value.runs) : []);
  const machines = $derived(held.value?.machines ?? []);
  const first = $derived(waiting(machines, Date.now()).length > 0);

  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  /* THE BEARER LIVES HERE AND NOWHERE ELSE, and only until Done or leaving the area, which unmounts this component. */
  let minted = $state<{ label: string; bearer: string } | null>(null);
  let mintLabel = $state('');
  /* OFF UNTIL THE OWNER TURNS IT ON, and off again for the next key: reading the inbox is chosen per key. */
  let mintInbox = $state(false);
  let minting = $state(false);
  let mintRefusal = $state('');
  /* ONE REVOKE AT A TIME, so a double press sends one. */
  let revoking = $state<string | null>(null);

  /* THE LINES CARRY THE BARE HOST, which only `settings-state.svelte.ts` reads (`lib/at-sites.test.ts`). */
  const origin = bareOrigin();
  /* THE SETUP LINE NAMES THIS RECORD, which the Cloud device flow needs; a shell with no record names none. */
  const lines = $derived(connectLines(origin, shell.live ? SLUG : null));
  /* THE INSTALLER FOR THE COMPUTER THIS BROWSER IS ON, and one press away from the other one. */
  let os = $state<Os>(osOf(globalThis.navigator));

  /** A mark for the states that need one; `13 §5.1`, so the glyph and the tone come from one map. */
  const DEVICE_TONE: Record<string, 'good' | 'warn' | 'bad' | undefined> = {
    pending: 'warn',
    approved: 'good',
    expired: 'warn',
    denied: 'bad',
  };

  /* A grant that has not finished working carries its state's mark; a key or a machine nobody has used carries one too,
     because the one nobody has used is the one to look at. */
  const toneOf = (c: Connection): 'good' | 'warn' | 'bad' | undefined =>
    c.machine && c.machine.status !== 'active' ? DEVICE_TONE[c.machine.status] : c.used === null ? 'warn' : undefined;

  /**
   * The facts under a row's name, each its own item, so a line that wraps breaks between facts and never leaves a
   * separator leading the next line (design-brief §5). A grant that is waiting or finished says only that: "never used"
   * beside "turned away" says nothing more.
   */
  function factsOf(c: Connection, nowMs: number): string[] {
    if (c.machine?.ended_by === 'operator' || c.token?.ended_by === 'operator') return [copy.endedByOperator];
    const status = c.machine?.status;
    if (status === 'pending' || status === 'expired' || status === 'denied' || status === 'revoked') return [copy.deviceState[status] ?? status];
    const facts: string[] = status === 'approved' ? [copy.deviceState.approved ?? status] : [];
    /* WHOSE KEY IT IS, since a colleague may mint their own (COL-10): Revoke means something different on a key the
       owner made and on one a colleague's agent runs on. `person_name` is on `listTokens`'s rows and not on the type
       `device.ts` declares, so it is read here as the optional it is. */
    const whose = (c.token as { person_name?: string | null } | null | undefined)?.person_name;
    if (whose) facts.push(ownWords.madeBy(whose));
    facts.push(c.used ? copy.usedWhen(since(c.used, nowMs)) : copy.neverUsed);
    if (c.token?.expires_at) facts.push(copy.endsWhen(relative(c.token.expires_at.slice(0, 10), nowMs)));
    return facts;
  }

  /* A new keystroke clears the last answer, so the field is never marked wrong for a value it no longer holds. */
  function retype(value: string) {
    typed = value;
    answer = null;
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const busy = opened();
    answer = await approve(typed, clientOf());
    closed(true, busy);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved') {
      typed = '';
      await held.reread();
    }
  }

  /* What the status line under the field says, or nothing. */
  const answerLine = $derived(lineOf(answer));

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it: the code stays typed and is sent again. */
  let reproving = $state(false);
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
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

  async function makeKey(e: SubmitEvent) {
    e.preventDefault();
    const label = mintLabel.trim().slice(0, LABEL_MAX);
    if (!label || minting) return;
    minting = true;
    mintRefusal = '';
    const busy = opened();
    /* THE BEARER IS SHOWN ONCE, from this answer, and never stored, logged or written anywhere else. */
    const out = await mintAgent(apiBase(), { label, inbox: mintInbox, days: TOKEN_DAYS });
    closed(true, busy);
    minting = false;
    if (!out.ok) {
      mintRefusal = out.fix;
      return;
    }
    minted = { label, bearer: out.value.bearer };
    mintLabel = '';
    mintInbox = false;
    await held.reread();
  }

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

  /* A LINE IS COPIED WITH ITS OWN SENTENCE, and the line is never quoted in the toast: the key is one of them. */
  const put = (line: string, said: string): void => void clipboard.put(line, line, said);
</script>

<!--
  APPROVING, MINTING AND LISTING ARE THE OWNER'S, which this screen once never asked: `deviceApprove`, `createToken`,
  `listDevices` and `listTokens` all need `owner`, and a `read` colleague was offered the six-digit field and its
  Approve button. So everything but Slash's sections is drawn inside this arm, and a colleague is given their own keys.
-->
{#if anOwner}
  <!--
    THE SIX-DIGIT FIELD, drawn once, in one of two places: first on the screen while a machine is waiting, and as the
    setup card's last step otherwise. A `<form>`, so Enter sends it. Paste is never blocked and there is no
    `maxlength`: the CLI prints the code in two groups, and seven digits is refused out loud rather than trimmed to a
    different code.
  -->
  {#snippet codeForm()}
    <form class="code-form field-row" onsubmit={tryCode} novalidate>
      <label class="field-row-label" for="user-code">{copy.codeLabel}</label>
      <div class="field-row-controls">
        <div class="field field-lg">
          <input
            class="field-input code-input"
            id="user-code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            autocapitalize="off"
            spellcheck="false"
            placeholder={'0'.repeat(CODE_DIGITS)}
            value={typed}
            oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
            aria-describedby="user-code-said"
            aria-invalid={answerLine?.tone === 'bad' ? 'true' : undefined}
          />
        </div>
        <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
      </div>
      <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. The mark
           beside the sentence carries its tone, so the tone is never colour alone. -->
      <p class="code-said" id="user-code-said" role="status" data-intent={answerLine?.tone}>
        {#if answerLine}<span role="img" aria-label={TONES[answerLine.tone].label}>{TONES[answerLine.tone].glyph}</span> {answerLine.line}{/if}
      </p>
      {#if answer?.kind === 'signin'}
        <div class="row-actions">
          <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
        </div>
      {/if}
    </form>
  {/snippet}

  <!-- A LINE TO COPY: the text in the code face, breaking anywhere so a long line never pushes the page sideways, and
       its button beside it, or under it where the two do not fit. -->
  {#snippet copyable(line: string, button: string, said: string)}
    <div class="line">
      <code class="mono">{line}</code>
      <Button onclick={() => put(line, said)}>{button}</Button>
    </div>
  {/snippet}

  {#if first}
    <Section title={copy.approveTitle}>{@render codeForm()}</Section>
  {/if}

  <Section title={copy.connectTitle}>
    <ul class="doors">
      <li class="door">
        <h3 class="door-title"><Icon name="globe" size="s" />{copy.doorAny}</h3>
        <p class="hint">{copy.doorAnyHint}</p>
        {@render copyable(lines.mcp, copy.copyAddress, copy.lineCopied)}
        <p class="step">{copy.doorAnyClaude}</p>
        {@render copyable(lines.claude, copy.copyCommand, copy.lineCopied)}
      </li>
      <li class="door">
        <h3 class="door-title"><Icon name="session" size="s" />{copy.doorSetup}</h3>
        <p class="hint">{copy.doorSetupHint}</p>
        <p class="step">{copy.doorInstall}</p>
        <div class="segmented" role="group" aria-label={copy.doorOs}>
          {#each OSES as o (o)}
            <button type="button" class="segment" aria-pressed={os === o} data-on={os === o ? '' : undefined} onclick={() => (os = o)}>{copy.osNames[o]}</button>
          {/each}
        </div>
        {@render copyable(INSTALL_LINES[os], copy.copyCommand, copy.lineCopied)}
        <p class="step">{copy.doorSetupRun}</p>
        {@render copyable(lines.setup, copy.copyCommand, copy.lineCopied)}
        {#if !first}{@render codeForm()}{/if}
      </li>
      <li class="door">
        <h3 class="door-title"><Icon name="key" size="s" />{copy.doorKey}</h3>
        <!-- THE KEY IS DRAWN ONCE, from `minted`, which Done and leaving the area both empty; nothing else on this
             screen holds it. -->
        {#if minted}
          {@const bearer = minted.bearer}
          <div class="minted" role="status">
            <p class="step">{copy.tokenOnce}</p>
            {@render copyable(bearer, copy.copyKey, copy.keyCopied)}
            <p class="step">{copy.doorKeyHeader}</p>
            {@render copyable(headerLine(bearer), copy.copyHeader, copy.lineCopied)}
            <div class="row-actions">
              <Button weight="bare" onclick={() => (minted = null)}>{copy.connectDone}</Button>
            </div>
          </div>
        {:else}
          <p class="hint">{copy.doorKeyHint}</p>
          <form class="field-row" onsubmit={makeKey}>
            <label class="field-row-label" for="agent-label">{copy.doorKeyLabel}</label>
            <div class="field-row-controls">
              <div class="field">
                <input class="field-input" id="agent-label" type="text" maxlength={LABEL_MAX} bind:value={mintLabel} aria-describedby="agent-label-said" />
              </div>
              <Button type="submit" disabled={minting || mintLabel.trim() === ''}>{copy.doorKeyGo}</Button>
            </div>
            <!-- THE INBOX IS ONE THING ON OR OFF, so it is the switch the rest of Settings uses, and it starts off. -->
            <div class="setting-row">
              <p class="hint">{copy.connectInboxHint}</p>
              <button
                type="button"
                class="switch"
                role="switch"
                aria-checked={mintInbox}
                aria-label={copy.connectInbox}
                onclick={() => (mintInbox = !mintInbox)}><span class="switch-track"></span></button
              >
            </div>
            <p class="code-said" id="agent-label-said" role="status" data-intent={mintRefusal ? 'bad' : undefined}>
              {#if mintRefusal}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {mintRefusal}{/if}
            </p>
          </form>
        {/if}
      </li>
    </ul>
  </Section>

  <!-- Every row the record keeps, denied ones included: "I said no to a request I did not make" (`12 §6.1`). Never a
       secret, a handle or an id: a row is named by what runs on it or the name it was given (`12 §3`). -->
  <Section title={copy.connectedTitle} count={rows.length}>
    {#if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if rows.length === 0}
      <Empty kind="no-data-yet" title={copy.connectedNone} body={copy.connectedNoneWhy} />
    {:else}
      {@const nowMs = Date.now()}
      <ul class="whos">
        {#each rows as c (c.key)}
          {@const tone = toneOf(c)}
          <li class="who" data-intent={tone}>
            <div class="who-head">
              {#if tone}
                <span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>
              {:else}<Icon name={c.machine ? 'session' : 'key'} size="s" />{/if}
              <!-- `dir="auto"`: an app names itself, in whatever script it chose. -->
              <span class="who-name" dir="auto">{nameOf(c)}</span>
              <span class="who-detail who-reach">{reachOf(c)}</span>
              <span class="who-detail who-facts">
                {#each factsOf(c, nowMs) as fact}<span>{fact}</span>{/each}
                <!-- THE RUN THAT LAST USED IT, BY THE NAME ITS WRITES ARE SIGNED WITH, and a link to what it did. `.tap`
                     because `S47` in small text is a target far under a thumb's 44px. -->
                {#if c.run}<span>{copy.lastRun} <a class="run tap" href={at(`/r/session/${c.run.seq}`)}>{runName(c.run)}</a></span>{/if}
              </span>
              <span class="who-do">
                {#if c.live}
                  <Button weight="bare" tone="bad" disabled={revoking !== null} onclick={() => void revokeRow(c)}>{copy.revokeKey}</Button>
                {/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if offer}
      <div class="code-form">
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
  </Section>
{:else}
  <!-- A COLLEAGUE CONNECTS THEIR OWN AGENT, with a key of their own capped by their own levels, rather than being shown
       three ways in that the record would refuse them at the end (COL-10, `loop/finish/contracts.md` X54). -->
  <MyTokens />
{/if}
<SlashAsks owner={anOwner} />
<SlashModel owner={anOwner} />
<!-- SLASH LOOKING ON ITS OWN is the owner's choice, beside the agents they let in (`loop/research-spark.md` S15). -->
<SlashDaily link />

<style>
  /* UNBOXED, AND EVERY ONE OF THESE WAS A CARD. A machine and a key are rows on the page with a
     hairline between them, the way every other list in the product is drawn. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
  }

  /* THE SOFT HAIRLINE A LIST'S ROWS ARE PARTED BY everywhere (design 6.5), and not `--line`, which is a field's edge. */
  .who + .who {
    border-block-start: 1px solid var(--line-soft);
  }

  /* THE NAME, WHAT IS KNOWN ABOUT IT UNDER THE NAME, AND THE CONTROL AT THE END OF BOTH. The head was
     a wrapping line, so the facts and the button landed wherever the name's length left room, and a
     row with a reach sentence pushed its Revoke onto a line of its own. */
  .who-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-2);
  }

  .who-head > :first-child {
    grid-column: 1;
    grid-row: 1;
  }

  .who-head > .who-name {
    grid-column: 2;
    grid-row: 1;
  }

  .who-head > .who-detail {
    grid-column: 2;
  }

  .who-head > .who-do {
    grid-column: 3;
    grid-row: 1 / span 2;
    margin-inline-start: var(--sp-2);
  }

  /* A NAME AN APP OR A MACHINE CHOSE MAY BE ONE LONG WORD, a host name most of all, and it breaks rather than
     pushing the row past the edge at 320. */
  .who-name {
    color: var(--ink);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .who-detail {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* WHAT IT WOULD BE ALLOWED TO DO GETS ITS OWN LINE, at full width.

     It is the sentence the decision is made from, and as a third clause it would have landed
     wherever the name's length happened to leave room: sometimes beside the state, sometimes
     under it, never twice the same across five rows. Its own line puts it under the name, which is
     where the eye goes after reading who is asking.

     `--ink2` rather than `--dim`: the row's other clauses are context and this one is the question. */
  .who-reach {
    color: var(--ink2);
  }

  /* The controls sit at the end of the head line and never shrink: a button that wraps its own
     label is a button somebody reads twice. */
  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* ONE COLUMN ON A PHONE, AND REVOKE ON A LINE OF ITS OWN. Beside the name it took a third of a 390px row from
     the words that say what is being revoked, and a destructive button pressed by mistake next to a name is the
     worst tap on this screen. */
  @media (width < 640px) {
    .who-head {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .who-head > .who-do {
      grid-column: 1 / -1;
      grid-row: auto;
      margin-inline-start: 0;
    }
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE CODE-ENTRY CONTROL.

     The label, the field and its button are `settings.css`'s field row, which puts the field and the
     button at one height and wraps them to two lines where they stop fitting side by side. Nothing
     here sets a colour: the ring is `controls.css`'s, on the wrapper, and the answer's tone comes
     from `[data-intent]`. `.code-form` and `.code-label` stay for the blocks below the form that
     show a key once and offer an install, which are not field rows. */
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

  /* THE SIX-DIGIT FIELD KEEPS ITS OWN WIDTH rather than taking the row as a field row's field does
     (`settings.css`), for the reason `.code-input` gives below. */
  .field-row-controls :global(.field:has(.code-input)) {
    flex: 0 1 auto;
  }

  /* SIX DIGITS AND NO MORE ROOM THAN SIX DIGITS NEED. A field stretched across the panel invites a
     sentence; one sized to its content says what belongs in it without a word. `ch` on a tabular
     face is the honest unit, and `font-variant-numeric` keeps the six from jumping about as they
     are typed: proportional digits reflow the whole field on every keystroke. */
  .code-input {
    flex: 0 1 12ch;
    font-size: var(--t-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
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

  /* THE ONE PLACE A MONOSPACE FACE IS RIGHT. `Money.svelte` argues against it for figures (a mono
     face gives the thousands separator a full character width), and a key or a command is not a
     figure: it is a string somebody compares character by character against another screen, or
     pastes into a terminal. `--font-id` is the theme's face for exactly that (design-brief §3).

     A BASE64 KEY HAS NO SPACES IN IT, so it is one 43-character word, and it reached 432px inside a
     400px screen: every line here breaks anywhere and keeps its own spaces, so the page body never
     scrolls sideways (`13 §10`, the layout gate's first rule). */
  .mono {
    flex: 1 1 24ch;
    min-inline-size: 0;
    margin: 0;
    padding-block: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--sunk);
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    letter-spacing: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* A LINE AND ITS COPY BUTTON on one row where both fit, the button under the line where they do not. */
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE THREE WAYS IN, one under another at every width, each holding a line too long to share a row with another's.
     UNBOXED, as the rows below them are: each was a bordered card inside the section, the box in a box design 6.8.6
     rules out, so a way in is now a block with a soft hairline above the next one. */
  .doors {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .door {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding-block: var(--sp-4);
  }

  .door:first-child {
    padding-block-start: 0;
  }

  .door + .door {
    border-block-start: 1px solid var(--line-soft);
  }

  .door-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  /* WHAT THE NEXT LINE IS FOR, as a label is drawn above its field. */
  .step {
    margin: 0;
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .minted {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE FACTS UNDER A NAME WRAP AS WHOLE ITEMS, with space between them and no separator to lead a line. */
  .who-facts {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
  }

  /* A LINK AS EVERY LINK IS DRAWN (design-brief §3): ink, with a 1px underline at 40% ink, 3px below. */
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

  /* THE SENTENCE AND ITS SWITCH (`.setting-row`) ARE LAID OUT BY `settings.css`, which every area shares. */

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
