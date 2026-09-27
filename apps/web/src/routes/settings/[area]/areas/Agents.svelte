<!--
  Settings > Agents: approving a machine, the machines and keys that can act on this record,
  connecting a new agent, and what Slash may do on its own.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* THE DECLARATION CACHE, WHICH ONLY THE RECORD FILLS (`held.ts`). */
  import { REGISTERS } from '$lib/record/held.ts';
  import {
    CODE_DIGITS, LABEL_MAX, TOKEN_DAYS, connectLines, reachKey, revocable,
    reportKeyOf, standing, type Answer, type DeviceRow, type TokenRow,
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
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const SLUG = $derived(shell.index.slug);

  /**
   * WHERE THIS AREA'S ROWS CAME FROM. `refused` is a host that answered no, and its sentence is shown.
   *
   * THERE WAS A `sample` STATE, for a host with no record behind it, which drew machines and tokens
   * out of `data.ts` that nobody had connected and dated them by the sample's `NOW`. With no sample
   * (DIRECTION 26) a signed-out or unreached host is a refusal like any other, in the client's words.
   */
  let agentsFrom = $state<'reading' | 'live' | 'refused'>('reading');
  let agentsRefusal = $state('');
  let machines = $state<DeviceRow[]>([]);
  let tokens = $state<TokenRow[]>([]);
  let agentClient: ReturnType<typeof createClient> | null = null;
  /* WHAT A PRESS SAYS WHEN THERE IS NO RECORD TO SEND IT TO: the host's refusal, or, before one arrives, that it was not reached. */
  const agentsCannot = () => agentsRefusal || copy.recordNotReached;

  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  /* THE BEARER LIVES HERE AND NOWHERE ELSE, and only until Done or leaving the area, which unmounts this component. */
  let minted = $state<{ label: string; bearer: string } | null>(null);
  let mintLabel = $state('');
  /* OFF UNTIL THE OWNER TURNS IT ON, and off again for the next agent: reading the inbox is chosen per token. */
  let mintInbox = $state(false);
  let minting = $state(false);
  let mintRefusal = $state('');
  let origin = $state('');

  /** A mark for the states that need one; `13 §5.1`, so the glyph and the tone come from one map. */
  const DEVICE_TONE: Record<string, 'good' | 'warn' | 'bad' | undefined> = {
    pending: 'warn',
    approved: 'good',
    expired: 'warn',
    denied: 'bad',
  };

  /* READ ON ARRIVING AT THE AREA. Leaving it takes the bearer and the offer with the component, which
     is what the page's old `area !== 'agents'` arm did by hand. `untrack` for the reason the Ingest
     area gives. */
  $effect(() => {
    untrack(() => void readAgents());
  });

  async function readAgents() {
    const at = opened();
    origin = bareOrigin();
    agentClient ??= createClient({ base: apiBase() });
    const listed = await agentClient.listDevices();
    if (!listed.ok) {
      agentsRefusal = 'refusal' in listed ? listed.refusal.fix : copy.writeRaced;
      agentsFrom = 'refused';
      closed(true, at);
      return;
    }
    machines = listed.value;
    const held = await agentClient.listTokens();
    tokens = held.ok ? standing(held.value as TokenRow[]) : [];
    agentsFrom = 'live';
    closed(true, at);
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
    const at = opened();
    answer = await approve(typed, agentClient);
    closed(true, at);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved' && agentClient) {
      typed = '';
      const again = await agentClient.listDevices();
      if (again.ok) machines = again.value;
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

  async function revokeMachine(row: DeviceRow) {
    if (agentsFrom !== 'live' || !agentClient) {
      toasts.push(agentsCannot(), { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = await revoke(agentClient, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }

  async function revokeTokenRow(row: TokenRow) {
    if (agentsFrom !== 'live' || !agentClient) {
      toasts.push(agentsCannot(), { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = wrote(await agentClient.revokeToken({ id: row.id }));
    closed(true, at);
    if (out.ok) tokens = tokens.filter((t) => t.id !== row.id);
    else {
      toasts.push(out.fix, { intent: 'warn' });
      const held = await agentClient.listTokens();
      if (held.ok) tokens = standing(held.value as TokenRow[]);
    }
  }

  async function connectAgent(e: SubmitEvent) {
    e.preventDefault();
    const label = mintLabel.trim().slice(0, LABEL_MAX);
    if (!label || minting) return;
    if (agentsFrom !== 'live' || !agentClient) {
      mintRefusal = agentsCannot();
      return;
    }
    minting = true;
    mintRefusal = '';
    const at = opened();
    /* THE BEARER IS SHOWN ONCE, from this answer, and never stored, logged or written anywhere else. */
    const out = await mintAgent(apiBase(), { label, inbox: mintInbox, days: TOKEN_DAYS });
    closed(true, at);
    minting = false;
    if (!out.ok) {
      mintRefusal = out.fix;
      return;
    }
    minted = { label, bearer: out.value.bearer };
    mintLabel = '';
    mintInbox = false;
    const held = await agentClient.listTokens();
    if (held.ok) tokens = standing(held.value as TokenRow[]);
    await offerPack(agentClient);
  }

  /*
   * THE AGENTS ADD-ON, OFFERED ONCE A TOKEN IS SHOWN, when this record does not have it. The plan is
   * the record's own `planPack` answer in the Packs screen's words, and Install sends its `planHash`
   * back, so what installs is what was shown. Not now changes nothing.
   */
  let offer = $state<Plan | null>(null);
  /* THE PLAN'S `calls_out`, beside the plan rather than in it, so `vault.ts` does not pull in `actions.ts`. */
  let offerCalls = $state<CallOut[]>([]);
  let installing = $state(false);
  let offerSaid = $state('');

  const packName = (kind: 'register' | 'page', id: string): string => {
    const named = kind === 'register' ? AGENTS_PACK.registers[id]?.name : AGENTS_PACK.pages[id]?.title;
    return typeof named === 'string' && !named.includes('{{') ? named : id.charAt(0).toUpperCase() + id.slice(1);
  };

  /* THE LINES THE OFFER DRAWS ARE THE LINES INSTALL APPROVES. The record refuses an install that adds a
     call without them, and this screen shows every one through `CallsOut` before Install is pressed. */
  let offerApprove: string[] = [];

  async function offerPack(client: ReturnType<typeof createClient>) {
    const at = opened();
    const held = await client.packs();
    if (!held.ok || held.value.some((p) => p.id === AGENTS_PACK.manifest.id)) {
      closed(true, at);
      return;
    }
    const planned = await client.planPack({ doc: agentsPackDocument(), source: { kind: 'local' } });
    closed(true, at);
    offerSaid = '';
    const diff = planned.ok ? (planned.value as { diff?: { calls_out?: unknown; approve?: unknown } }).diff : undefined;
    offer = planned.ok ? planOf(diff, packName) : null;
    offerCalls = callsOutOf(diff?.calls_out);
    offerApprove = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  }

  async function installOffer() {
    if (!offer || installing || !agentClient) return;
    installing = true;
    const at = opened();
    const out = wrote(await agentClient.installPack({ doc: agentsPackDocument(), source: { kind: 'local' }, planHash: offer.planHash, ...(offerApprove.length > 0 ? { approve: offerApprove } : {}) }));
    closed(true, at);
    installing = false;
    if (out.ok) {
      offer = null;
      toasts.push(vaultWords.packInstalled, { intent: 'good' });
    } else if (!out.ok && out.from === 'refused' && out.code === 'PLAN_STALE') {
      /* THE PLAN MOVED UNDER IT, so it is read again and shown again: what installs is what was shown.
         The sentence says the plan moved only when a fresh plan is on screen to approve. */
      await offerPack(agentClient);
      offerSaid = offer ? out.fix : '';
    } else offerSaid = out.fix;
  }

  /* THE LOGIN LINE NAMES THIS RECORD, which the Cloud device flow needs; a shell with no record names none. */
  const lines = $derived(connectLines(origin, shell.live ? SLUG : null));
</script>

<!--
  THE FIELD COMES FIRST, because a machine prints this address: the person arriving is holding six
  digits and looking for the box. A `<form>`, so Enter sends it.
-->
<!--
  AND APPROVING A MACHINE IS THE OWNER'S, which this screen never asked.

  `deviceApprove` needs `owner`, and a `read` colleague was offered the six-digit field and the
  `Approve` button beside it. The two sections below already draw the record's own refusal over
  the lists they cannot read, so this one is taken away rather than explained twice.
-->
{#if anOwner}
<Section title={copy.approveTitle}>
  <form class="code-form field-row" onsubmit={tryCode} novalidate>
    <label class="field-row-label" for="user-code">{copy.codeLabel}</label>
    <div class="field-row-controls">
      <div class="field field-lg">
        <!-- Paste is never blocked and there is no `maxlength`: the CLI prints the code in two
             groups, and seven digits is refused out loud rather than trimmed to a different code. -->
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
    <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
    <p class="code-said" id="user-code-said" role="status" data-intent={answerLine?.tone}>{answerLine?.line ?? ''}</p>
    {#if answer?.kind === 'signin'}
      <div class="row-actions">
        <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
      </div>
    {/if}
  </form>
</Section>
{/if}

<!-- Every row the record keeps, denied ones included: "I said no to a request I did not make" (`12 §6.1`). -->
<Section title={copy.machines} count={machines.length}>
  {#if agentsFrom === 'refused'}
    <Empty kind="error" title={agentsRefusal} />
  {:else if agentsFrom !== 'reading' && machines.length === 0}
    <!-- THE LINE THAT WORKS, NOT THE COMMAND'S NAME. This printed `braindog login` with nothing
         after it, which the CLI refuses without a host (`research-first-sign-in.md` friction
         6), while "Connect an agent" below already printed `lines.login` naming this record. -->
    <Empty kind="no-data-yet" title={copy.noDevices} agentPrompt={lines.login} />
  {/if}
  <ul class="whos">
    {#each machines as d (d.handle)}
      {@const tone = DEVICE_TONE[d.status]}
      <li class="who" data-intent={tone}>
        <div class="who-head">
          {#if tone}
            <span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>
          {:else}<Icon name="session" size="s" />{/if}
          <!-- The label the machine sent. The handle is how the record names the row, and it means nothing to a person. -->
          <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
          <!-- `since`, because `last_used` is an instant and `relative` takes a day. -->
          <span class="who-detail">
            {d.ended_by === 'operator' ? copy.endedByOperator : (copy.deviceState[d.status] ?? d.status)} · {d.last_used ? copy.usedWhen(since(d.last_used, Date.now())) : copy.neverUsed}
          </span>
          <span class="who-detail who-reach">{copy.reachMeans[reachKey(d.reach, d.scope)] ?? d.reach}</span>
          <span class="who-do">
            {#if revocable(d) && d.ended_by !== 'operator'}
              <Button weight="bare" tone="bad" onclick={() => void revokeMachine(d)}>{copy.revokeKey}</Button>
            {/if}
          </span>
        </div>
      </li>
    {/each}
  </ul>
</Section>

<!-- `12 §3`: what can act as you, with a revoke button, and never the secret itself. -->
<Section title={copy.tokens} count={tokens.length}>
  {#if agentsFrom === 'live' && tokens.length === 0}
    <Empty kind="no-data-yet" title={copy.noKeys} />
  {/if}
  <ul class="whos">
    {#each tokens as t (t.id)}
      {@const report = reportKeyOf(t.label)}
      <!-- The one nobody has used is the one to look at, so it carries a mark as well as the words. -->
      <li class="who" data-intent={t.last_used_at === null ? 'warn' : undefined}>
        <div class="who-head">
          {#if t.last_used_at === null}
            <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
          {:else}<Icon name="key" size="s" />{/if}
          <span class="who-name">{report ? copy.reportKeyNamed(report.name) : (t.label ?? copy.unnamedToken)}</span>
          <span class="who-detail">{report ? copy.reportKeyCan(report.register ? (REGISTERS[report.register]?.name ?? report.register) : '') : (copy.keyCan[t.scope] ?? t.scope)}</span>
          <span class="who-detail">
            {#if t.ended_by === 'operator'}{copy.endedByOperator}{:else}{t.last_used_at ? copy.usedWhen(since(t.last_used_at, Date.now())) : copy.neverUsed}{#if t.expires_at}{' · '}{copy.endsWhen(relative(t.expires_at.slice(0, 10), Date.now()))}{/if}{/if}
          </span>
          <span class="who-do">
            {#if t.ended_by !== 'operator'}
              <Button weight="bare" tone="bad" onclick={() => void revokeTokenRow(t)}>{copy.revokeKey}</Button>
            {/if}
          </span>
        </div>
      </li>
    {/each}
  </ul>

  <!--
    CONNECT AN AGENT. The bearer is drawn once, from `minted`, which Done and leaving the area both
    empty; nothing else on this screen holds it. The two lines carry no token (`48 §2`).
  -->
  <!-- AND MINTING ONE IS THE OWNER'S TOO. `createToken` needs `owner`, and `SlashDaily` below
       already draws nothing on a record the caller does not own: this is that rule, applied to
       the control above it rather than only to the one under it. The section keeps its heading
       and its count, because what is in the list is still a fact about this record. -->
  {#if anOwner}
  {#if minted}
    {@const bearer = minted.bearer}
    <div class="code-form" role="status">
      <p class="code-label">{copy.tokenOnce}</p>
      <p class="mono wrap">{bearer}</p>
      <div class="row-actions">
        <Button weight="primary" onclick={() => void clipboard.put(bearer, copy.tokenCopied)}>{copy.copyToken}</Button>
      </div>
      <p class="code-label">{copy.onNewMachine}</p>
      <p class="mono wrap">{lines.login}</p>
      <div class="row-actions">
        <Button weight="quiet" onclick={() => void clipboard.put(lines.login, copy.lineCopied)}>{copy.copyLine}</Button>
      </div>
      <p class="code-label">{copy.inClaudeCode}</p>
      <p class="mono wrap">{lines.mcp}</p>
      <div class="row-actions">
        <Button weight="quiet" onclick={() => void clipboard.put(lines.mcp, copy.lineCopied)}>{copy.copyLine}</Button>
        <Button weight="bare" onclick={() => ((minted = null), (offer = null))}>{copy.connectDone}</Button>
      </div>
    </div>
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
                  <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
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
          <Button weight="primary" disabled={installing || offer.conflicts.length > 0} onclick={() => void installOffer()}>{copy.install}</Button>
          <Button weight="bare" onclick={() => (offer = null)}>{vaultWords.notNow}</Button>
        </div>
        <p class="code-said" role="status" data-intent={offerSaid ? 'bad' : undefined}>{offerSaid}</p>
      </div>
    {/if}
  {:else}
    <form class="code-form field-row" onsubmit={connectAgent}>
      <label class="field-row-label" for="agent-label">{copy.connectTitle}</label>
      <div class="field-row-controls">
        <div class="field">
          <input
            class="field-input"
            id="agent-label"
            type="text"
            maxlength={LABEL_MAX}
            placeholder={copy.connectLabel}
            aria-label={copy.connectLabel}
            bind:value={mintLabel}
            aria-describedby="agent-label-said"
          />
        </div>
        <Button weight="primary" type="submit" disabled={minting || mintLabel.trim() === ''}>{copy.connectGo}</Button>
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
      <p class="code-said" id="agent-label-said" role="status" data-intent={mintRefusal ? 'bad' : undefined}>{mintRefusal}</p>
    </form>
  {/if}
  {/if}
</Section>
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

  .who + .who {
    border-block-start: 1px solid var(--line);
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

  .who-name {
    color: var(--ink);
    font-weight: 600;
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

  /* A BASE64 KEY HAS NO SPACES IN IT, so it is one 43-character word and it reached 432px inside a
     400px screen. `13 §10` and the layout gate's first rule: the page body never scrolls sideways. */
  .wrap {
    overflow-wrap: anywhere;
  }

  /* THE PACKS SCREEN'S PLAN, drawn the same way where an agent is connected. */
  .plan {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
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
     face gives the thousands separator a full character width), and a key is not a figure: it is a
     string somebody compares character by character against another screen. */
  .mono {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: var(--t-sm);
    letter-spacing: 0;
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
