<!--
  Keys: who is asking to open them, what they are, and which machines may.

  FOUR SECTIONS, IN THE ORDER OF URGENCY, as the old tool's Access screen asks it. A request waiting for
  its six digits is time-boxed, so it leads, and it is drawn only while there is one. Then the Keys
  index, then the vault passphrase that guards them (`Passphrase.svelte`, an owner's only), then the
  machines holding a vault grant, each with Revoke. While the passphrase is on, opening or putting a
  key asks for it, and it goes with that one request and is not kept.

  NEVER A VALUE, A CODE OR A HANDLE. A key row says whether a value is sealed, how often it was opened
  and when; the six digits are typed here and never printed; a machine is named by its label.

  THE APPROVAL IS SETTINGS', NOT A COPY OF IT. `record/vault.ts` holds the one `approve`, the one
  `answerLine` and the one `reprove`, and `/settings/agents` calls the same three.

  THE INDEX AND THE MACHINES HAVE TWO DIFFERENT CEILINGS, AND THAT IS THE DECISION. What the registers
  index is what a key OPENS and never the key, and a credential never goes in the record, so reading
  the index is not reading a secret: a colleague at `read` may have it, and `/r/credentials` already
  gives it to them. Who may open keys, and the acts on this screen, stay owner-only. Refusing one of
  those two is not an answer about the other, and this screen used to draw the first refusal it got
  as the whole page. `said.ts` holds what the record said and what is drawn from it.

  `/vault` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).
-->
<script lang="ts">
  import { apiBase, at, signInFirst } from '$lib/at.ts';
  import { onDestroy, onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { since, relative } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { CODE_DIGITS, type Answer, type DeviceRow } from '$lib/record/device.ts';
  import {
    answerLine, approve, asks, daysFor, holders, keysOf, lastUsers, lockOf, namesOf, reconnectOf, reprove, revoke, runPath, scopeName,
    wantsPassphrase, withPassphrase, words,
    type GrantState, type KeyRow, type Lock, type ProjectMark, type UsedByRun,
  } from '$lib/record/vault.ts';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { read } from '$lib/data/record.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { countSaid, machinesTellOf, mayAct, saidOf, tellOf, words as tells, type Said } from './said.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import PassField from './PassField.svelte';
  import Passphrase from './Passphrase.svelte';

  /**
   * Whether the record has answered yet. THERE IS NO THIRD STATE: this screen drew the sample's grants and keys,
   * dated by the sample's clock, wherever a 401 or an unreachable host came back with no slug, and the sample went
   * on 25 September (DIRECTION 26). Those two refusals are now said like any other.
   */
  let from = $state<'reading' | 'live'>('reading');
  let machines = $state<DeviceRow[]>([]);
  let keys = $state<KeyRow[]>([]);
  /** The run that opened each key last, by the key's row id, from `usedBy`. A key missing here says only its counts. */
  let lastBy = $state<ReadonlyMap<string, UsedByRun>>(new Map());
  let names: ReadonlyMap<string, string> & { marks?: ReadonlyMap<string, ProjectMark> } = $state(new Map());
  let client: ReturnType<typeof createClient> | null = null;

  /**
   * WHAT THE RECORD SAID TO THREE OF THE FOUR READS, kept rather than dropped.
   *
   * A fresh self-host answers `REGISTER_UNKNOWN` to both lists and this screen drew "No keys yet."
   * over them; a colleague at `read` is refused the machines and this screen drew that one sentence
   * as the whole page, although the same person may read the Keys index on `/r/credentials`.
   * `said.ts` has the measurements and the reasoning.
   *
   * THE FOURTH READ, `things`, IS THE ONE WITH NOTHING TO SAY, so it is not kept: a project the
   * record would not name is drawn as the chip "A project" by `scopeName` and `keysOf`, which is
   * already this screen declining to guess, and a second sentence about it would say no more.
   */
  let devices = $state<Said>({ kind: 'held' });
  let index = $state<Said>({ kind: 'held' });
  let counted = $state<Said>({ kind: 'held' });

  const waiting = $derived(asks(machines));
  const holding = $derived(holders(machines));
  /** Adding, replacing, revealing, retiring and approving: the acts, which the machines read stands for. */
  const acts = $derived(from === 'live' && mayAct(devices));
  /**
   * The sentence for an act that is not this person's: the record's own, or nothing.
   *
   * THE INDEX'S REFUSAL IS ASKED SECOND, because an owner refused nothing is still refused a key form
   * over a register the record does not hold, and `devices` has no sentence about that half.
   *
   * NOTHING IS WHAT A PRESS BEFORE THE RECORD ANSWERED GETS. The fallback was the demo's sentence, and with the
   * sample gone the only way to reach it is a control pressed while both reads are still `held` from the start,
   * which is a screen still reading and not a refusal; that sentence there would have told an owner their record
   * was the demo.
   */
  const cannot = (): string | null => (devices.kind !== 'held' ? devices.fix : index.kind !== 'held' ? index.fix : null);
  function refuse() {
    const line = cannot();
    if (line) toasts.push(line, { intent: 'warn' });
  }
  const indexTell = $derived(tellOf(index));
  const machinesTell = $derived(machinesTellOf(devices));
  /** Whether `listGrants` answered, so a row may say how often it was opened rather than guessing never. */
  const counts = $derived(counted.kind === 'held');

  onMount(() => {
    void read(async () => {
      client = createClient({ base: apiBase() });
      const listed = await client.listDevices();
      /* A SIGN-IN THAT LAPSED SINCE THE SHELL BOOTED goes where the shell would have sent it, by the shell's own
         rule, rather than drawing the sample as it did or a page of refusals nobody can act on. Every other
         refusal is about one half of this screen and is said there. */
      const signIn = !listed.ok && 'refusal' in listed ? signInFirst(listed.refusal.code, location) : null;
      if (signIn) {
        location.assign(signIn);
        return false;
      }
      /**
       * THE INDEX IS READ WHATEVER THE MACHINES SAID. `listDevices` is about who may open keys and is
       * owner-only; the Keys index is about what a key OPENS, which is ordinary metadata a reader may
       * have, and `/r/credentials` already draws it to them. Refusing one is not an answer about the other.
       */
      devices = saidOf(listed);
      if (listed.ok) machines = listed.value;
      /* A record without the agents pack has no Keys register, and it says so rather than answering an empty index. */
      const [projects, credentials, grants] = await Promise.all([
        client.list({ register: 'things', limit: 200 }),
        client.list({ register: 'credentials', limit: 200 }),
        client.listGrants(),
      ]);
      type Row = { id: string; seq: number | null; fields: Record<string, unknown>; state: string | null };
      index = saidOf(credentials);
      counted = saidOf(grants);
      /* A RECORD WITH NO PROJECTS LIST NAMES NO PROJECT, and the chips say "A project" where a scope
         points at one this screen cannot name, which is this screen saying where the record said nothing. */
      names = projects.ok ? namesOf(projects.value.rows as Row[]) : new Map();
      keys = credentials.ok ? keysOf(credentials.value.rows as Row[], grants.ok ? (grants.value as GrantState[]) : [], names) : [];
      forConnectors = connectorGrants(grants.ok ? grants.value : []);
      void whoOpened();
      from = 'live';
      /* THE PASSPHRASE IS ASKED ABOUT ONLY FOR A PERSON WHO MAY ACT HERE: its two methods are the vault gate's, as the
         machines read is, so anyone that read refused would be refused this too, and it would say nothing new. */
      if (mayAct(devices)) void probe();
      reconnect();
      /* The screen has an answer if either half answered; a screen refused both halves is a refused screen. */
      return devices.kind === 'held' || index.kind === 'held';
    });
  });
  $effect(() => drew('ready'));

  /* WHAT A KEY'S "…" MENU IS CALLED TO A SCREEN READER, by the key's name, as a flow card's menu is (`flow.ts`). */
  const moreFor = (label: string) => `More for: ${label}`;

  /* ── the passphrase ── */

  /**
   * WHETHER THE VAULT IS BEHIND A PASSPHRASE, which decides whether opening or putting a key asks for it. `lockOf` says
   * how it is found out; a key door that answers "type the passphrase" also moves it to on, so a vault turned on from
   * another tab since this one read it asks at the next press rather than failing twice.
   */
  let lock = $state<Lock>({ state: 'reading' });
  async function probe() {
    if (!client) return;
    lock = await lockOf(client);
  }

  /* ── the code ── */
  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  let reproving = $state(false);
  const said = $derived(answerLine(answer));

  function retype(value: string) {
    typed = value;
    answer = null;
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const at = opened();
    answer = await approve(typed, client);
    closed(true, at);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved' && client) {
      typed = '';
      const again = await client.listDevices();
      if (again.ok) machines = again.value;
    }
  }

  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
  }

  async function revokeRow(row: DeviceRow) {
    if (!acts || !client) {
      refuse();
      return;
    }
    const at = opened();
    const out = await revoke(client, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }
  /**
   * A KEY OUT OF SERVICE. `revokeGrant` is VAULT, so this reaches the record only from a browser session proved in
   * the last fifteen minutes; the bytes are destroyed and the row stays, because what it opened is a fact.
   *
   * THE INDEX IS READ AGAIN rather than patched here, so the line a person reads is the record and not a guess.
   */
  async function retireKey(k: KeyRow) {
    if (!acts || !client || !k.grant) {
      refuse();
      return;
    }
    const at = opened();
    const out = await client.revokeGrant({ id: k.grant });
    closed(true, at);
    if (!out.ok) {
      toasts.push('refusal' in out ? out.refusal.fix : copy.writeRaced, { intent: 'warn' });
      return;
    }
    toasts.push(copy.keyRevoked(k.label), { intent: 'good' });
    await reread();
  }

  /** The index, read again from the record rather than patched here, so the line a person reads is the record. */
  async function reread() {
    if (!client) return;
    const [credentials, grants] = await Promise.all([client.list({ register: 'credentials', limit: 200 }), client.listGrants()]);
    type Row = { id: string; seq: number | null; fields: Record<string, unknown>; state: string | null };
    if (credentials.ok) keys = keysOf(credentials.value.rows as Row[], grants.ok ? (grants.value as GrantState[]) : [], names);
    if (grants.ok) forConnectors = connectorGrants(grants.value);
    void whoOpened();
  }

  /* WHO OPENED EACH KEY LAST, asked after the index is drawn, so a slow answer never holds the keys back; the line
     appears under a key when its answer does. */
  async function whoOpened() {
    if (!client) return;
    lastBy = await lastUsers(client, keys);
  }

  /* ── putting a key in, and reading one back ── */

  /**
   * THE TWO DOORS THIS SECTION USES ARE NOT RECORD METHODS. `/api/keys/put` and `/api/keys/open` are a step on
   * the host in front of the record: this page sends a value once, the host seals it with its own key store, and
   * the record is handed sealed bytes and never a credential (ADR-062). They take a browser session, refuse every
   * bearer, and want an owner whose last sign-in is under fifteen minutes old, which is the record's own rule.
   */
  let sheet = $state<{ mode: 'add' } | { mode: 'replace'; row: KeyRow } | null>(null);
  const blank = () => ({ label: '', opens: '', kind: 'api_token', project: '', value: '', connector: false, passphrase: '' });

  /**
   * WHICH KEYS A SCHEDULED CONNECTOR CAN OPEN, by grant id, from `listGrants`' `sealed_under`.
   *
   * READ SO A REPLACED VALUE STAYS WHERE IT WAS. A replacement is sealed again under the key the sheet asks for, so a
   * connector's key replaced with the toggle unset would come back as one only a person can open, and the connector
   * would stop on its next run. The toggle starts where the key already is.
   */
  let forConnectors = $state<ReadonlySet<string>>(new Set());
  const connectorGrants = (grants: unknown): ReadonlySet<string> =>
    new Set(
      (Array.isArray(grants) ? (grants as { id?: unknown; sealed_under?: unknown }[]) : [])
        .filter((g) => g.sealed_under === 'connector' && typeof g.id === 'string')
        .map((g) => g.id as string),
    );

  /* THE SHEET'S OWN WORDS for the one control this unit adds, kept beside it rather than in the vault's shared list. */
  const connectorWords = {
    field: 'For a scheduled connector',
    hint: 'A connector that runs on a schedule, with nobody signed in, opens only a key added for it. Leave this off for a key you use yourself.',
  };
  let form = $state(blank());
  let saving = $state(false);
  let sheetSaid = $state('');
  const sheetTitle = $derived(sheet === null ? words.addKey : sheet.mode === 'replace' ? words.replaceTitle(sheet.row.label) : words.addKey);
  const sheetHint = $derived(sheet?.mode === 'replace' ? words.valueAgain : words.valueHint);

  /**
   * THE ONE KEY ON THE SCREEN, and the two timers that take it away: it hides itself after thirty seconds, and a
   * copy leaves the clipboard a minute later (`12 §6` rule 2). Only one is ever shown, so revealing a second puts
   * the first away rather than leaving two of them on the page.
   */
  const HIDE_S = 30;
  const CLIP_MS = 60_000;
  let shown = $state<{ id: string; label: string; value: string; left: number } | null>(null);
  let revealing = $state('');
  let ticker: ReturnType<typeof setInterval> | null = null;
  let clipboard: ReturnType<typeof setTimeout> | null = null;

  function forget() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    shown = null;
  }

  /* AND LEAVING THE SCREEN PUTS IT AWAY. A route change destroys this component, and a timer still holding the
     last value would be a value alive in a tab nobody is looking at. */
  onDestroy(() => {
    forget();
    if (clipboard) clearTimeout(clipboard);
  });

  const shut = () => {
    sheet = null;
    resumeAfter = null;
  };

  /**
   * AND THE BUTTON IS NOT THE ONLY DOOR INTO THIS SHEET. `reconnect()` below calls it straight from the
   * address, and `reconnectOf` hands back `{ mode: 'add' }` for any label the index does not hold,
   * which on an index that came back absent or refused is EVERY label: the Add button is drawn only
   * where `index.kind === 'held'`, and this path walked round it into an eight-field sheet whose save
   * the record would refuse. The guard is here as well as on the button, so both doors answer alike.
   */
  function openAdd() {
    if (!acts || !client || index.kind !== 'held') {
      refuse();
      return;
    }
    sheetSaid = '';
    form = blank();
    sheet = { mode: 'add' };
  }

  /**
   * A PAUSED ACTION'S "Reconnect key" LANDS HERE, on the sheet for the key it named: Replace when the vault holds it, Add with
   * the name filled in when it does not. The action it came from is resumed once the key is saved, so the row that said
   * "Reconnect the key and it runs again" is true after one save rather than a save and a trip back to press Resume.
   */
  let resumeAfter: string | null = null;
  function reconnect() {
    const asked = reconnectOf(new URL(location.href).searchParams, keys);
    if (!asked) return;
    resumeAfter = asked.then;
    if (asked.mode === 'replace') return openReplace(asked.row);
    openAdd();
    form = { ...blank(), label: asked.label };
  }

  function openReplace(row: KeyRow) {
    if (!acts || !client) {
      refuse();
      return;
    }
    sheetSaid = '';
    form = { ...blank(), connector: row.grant !== null && forConnectors.has(row.grant) };
    sheet = { mode: 'replace', row };
  }

  /**
   * A KEY PUT IN, OR ONE ROW'S VALUE REPLACED.
   *
   * THE RECORD'S OWN SENTENCE IS SHOWN IN THE SHEET rather than as a toast, because what it is about is a field
   * that is still on the screen, and a sheet that closes on a refusal is a sheet that throws away the typing.
   */
  async function saveKey(e?: SubmitEvent) {
    e?.preventDefault();
    if (sheet === null || saving) return;
    if (!acts || !client) {
      refuse();
      return;
    }
    const mode = sheet.mode;
    saving = true;
    sheetSaid = '';
    const at = opened();
    /* `sealed_under` ONLY WHEN THE TOGGLE IS ON, so a key for a person sends the body it always sent. */
    const under = form.connector ? { sealed_under: 'connector' as const } : {};
    /* THE PASSPHRASE GOES WITH THIS ONE REQUEST and is emptied from the sheet whatever comes back (`12 §6`). */
    const unlock = withPassphrase(lock, form.passphrase);
    form.passphrase = '';
    const args =
      sheet.mode === 'add'
        ? { label: form.label, opens: form.opens, kind: form.kind, value: form.value, ...(form.project === '' ? {} : { project: form.project }), ...under, ...unlock }
        : { label: sheet.row.label, opens: sheet.row.opens, credential: sheet.row.id, value: form.value, ...under, ...unlock };
    const out = await client.putKey(args);
    closed(true, at);
    saving = false;
    if (!out.ok) {
      /* A VAULT TURNED ON SINCE THIS SCREEN ASKED says so here, and the sheet grows the field it needs. */
      if (wantsPassphrase(out)) lock = { state: 'on' };
      sheetSaid = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      return;
    }
    /* THE FIRST KEY GIVES THE RECORD A KEY OF ITS OWN, which is what a passphrase is put on, so the switch asks again. */
    if (lock.state === 'none') void probe();
    toasts.push(mode === 'add' ? words.keyAdded(out.value.label) : words.keyReplaced(out.value.label), { intent: 'good' });
    form = blank();
    sheet = null;
    await reread();
    if (resumeAfter !== null) {
      const ingest = resumeAfter;
      resumeAfter = null;
      const back = await client.call('resumeAction', { ingest });
      if (back.ok) toasts.push(actionWords.resumed(ingest), { intent: 'good' });
      else toasts.push('refusal' in back ? back.refusal.fix : copy.writeRaced, { intent: 'warn' });
    }
  }

  /**
   * THE SHEET THAT ASKS FOR THE PASSPHRASE BEFORE A KEY IS OPENED, while the vault is behind one. The passphrase goes
   * with the one request it was typed for and the field is emptied whatever comes back, so nothing on this screen
   * holds it between two keys.
   */
  let asking = $state<KeyRow | null>(null);
  let askPass = $state('');
  let askSaid = $state('');
  function openAsk(k: KeyRow) {
    askPass = '';
    askSaid = '';
    asking = k;
  }
  function shutAsk() {
    asking = null;
    askPass = '';
    askSaid = '';
  }
  function askGo(e?: SubmitEvent) {
    e?.preventDefault();
    if (asking === null || askPass === '') return;
    void revealKey(asking, askPass);
  }

  /**
   * ONE KEY, READ BACK ONCE. The record counts it as a `grant.read`, so revealing is an act and not an address:
   * nothing here is reachable by a URL, nothing is written into the query string, and nothing is kept.
   */
  async function revealKey(k: KeyRow, passphrase = '') {
    if (!acts || !client) {
      refuse();
      return;
    }
    if (revealing !== '') return;
    /* BEHIND A PASSPHRASE, REVEAL ASKS FOR IT FIRST, in a sheet of its own, rather than sending a request it knows the
       record will refuse. */
    if (lock.state === 'on' && passphrase === '') {
      openAsk(k);
      return;
    }
    revealing = k.id;
    const at = opened();
    const out = await client.openKey({ credential: k.id, ...withPassphrase(lock, passphrase) });
    closed(true, at);
    revealing = '';
    askPass = '';
    if (!out.ok) {
      const fix = 'refusal' in out ? out.refusal.fix : copy.writeRaced;
      if (wantsPassphrase(out)) {
        lock = { state: 'on' };
        openAsk(k);
      }
      /* A REFUSAL WHILE THE SHEET IS UP IS SAID IN IT, a wrong passphrase above all, so the next try is one field away. */
      if (asking !== null) askSaid = fix;
      else toasts.push(fix, { intent: 'warn' });
      return;
    }
    shutAsk();
    forget();
    shown = { id: k.id, label: out.value.label, value: out.value.value, left: HIDE_S };
    ticker = setInterval(() => {
      if (shown === null) return;
      const left = shown.left - 1;
      if (left <= 0) forget();
      else shown = { ...shown, left };
    }, 1000);
  }

  /** A copy, and the clipboard cleared a minute later whatever is on the screen by then (`12 §6` rule 2). */
  async function copyShown() {
    if (shown === null) return;
    try {
      await navigator.clipboard.writeText(shown.value);
    } catch {
      /* A browser that will not write to the clipboard says so by doing nothing, and the value is still on screen. */
      return;
    }
    toasts.push(words.copied, { intent: 'good' });
    if (clipboard) clearTimeout(clipboard);
    clipboard = setTimeout(() => void navigator.clipboard.writeText('').catch(() => undefined), CLIP_MS);
  }
</script>

<svelte:head><title>{titleOf(copy.vault)}</title></svelte:head>

<PageHead icon="vault" title={copy.vault} />

<div class="page">
  {#if waiting.length}
    <Section title={words.waiting} count={waiting.length}>
      <ul class="whos">
        {#each waiting as d (d.handle)}
          <li class="who" data-intent="warn">
            <div class="who-head">
              <Icon name="key" size="s" />
              <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
              <Chip label={scopeName(d.scope, names)} />
              <span class="who-detail">{words.days(daysFor(d.scope))}</span>
            </div>
          </li>
        {/each}
      </ul>

      <form class="code-form" onsubmit={tryCode} novalidate>
        <label class="code-label" for="vault-code">{copy.codeLabel}</label>
        <div class="code-row">
          <div class="field field-lg">
            <input
              class="field-input code-input"
              id="vault-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              autocapitalize="off"
              spellcheck="false"
              placeholder={'0'.repeat(CODE_DIGITS)}
              value={typed}
              oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
              aria-describedby="vault-code-said"
              aria-invalid={said?.tone === 'bad' ? 'true' : undefined}
            />
          </div>
          <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
        </div>
        <p class="code-said" id="vault-code-said" role="status" data-intent={said?.tone}>{said?.line ?? ''}</p>
        {#if answer?.kind === 'signin'}
          <div class="row-actions">
            <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
          </div>
        {/if}
      </form>
    </Section>
  {/if}

  <Section title={words.keys} count={keys.length}>
    {#if indexTell}
      <!--
        WHAT THE RECORD SAID, RATHER THAN "No keys yet." OVER IT. A record with no Keys register and a
        record that will not hand the index over are two different states, and both used to be drawn as
        the third, an index that came back empty.
      -->
      <Empty kind={indexTell.kind} title={indexTell.title} body={indexTell.body}>
        {#snippet actions()}
          {#if index.kind === 'absent'}<Button weight="primary" href="/packs">{tells.browse}</Button>{/if}
        {/snippet}
      </Empty>
    {:else if from !== 'reading' && keys.length === 0}
      <Empty kind="no-data-yet" title={words.noKeys} body={words.noKeysHow} />
    {/if}
    <!-- AND NO FORM OVER A LIST THAT IS NOT THERE: an eight-field sheet whose save the record would refuse. -->
    {#if acts && index.kind === 'held'}
      <div class="row-actions">
        <Button weight="primary" onclick={openAdd}>{words.addKey}</Button>
      </div>
    {/if}
    <ul class="whos">
      {#each keys as k (k.id)}
        <!--
          ONE ROW ANATOMY, THE KEYS LIST'S (design 2.14, SYS-6): the name on line one; where it applies, what it opens and
          how often it was opened on line two; one visible verb and a "…" menu at the end. The scope chip lived on the
          name's line and wrapped under it on some rows and not others, so it now always leads line two. A key whose
          value is kept elsewhere says nothing about it, rather than a phrase on every row: it simply has no Reveal.
        -->
        <li class="who key">
          <div class="who-head">
            <Icon name="key" size="s" />
            <span class="who-name">{k.label}</span>
          </div>
          <p class="key-meta">
            <ScopeChip scope={k.scope} />
            {#if k.opens}<span class="key-opens">{k.opens}</span>{/if}
            {#if k.sealed}<span
                >{words.sealed}{#if counts}{', '}{words.opened(k.opened)}{#if k.lastOpened}{', '}{words.lastOpened(since(k.lastOpened, Date.now()))}{/if}{:else}{' · '}{countSaid(counted)}{/if}</span
              >{/if}
          </p>
          {#if lastBy.get(k.id)}
            {@const u = lastBy.get(k.id)!}
            {@const href = runPath(u.run)}
            <p class="who-why who-used">
              {#if href}<a href={at(href)}>{words.openedBy(u.run, u.agent, since(u.at, Date.now()))}</a>{:else}{words.openedBy(u.run, u.agent, since(u.at, Date.now()))}{/if}
            </p>
          {/if}
          {#if shown && shown.id === k.id}
            <!--
              THE ONE PLACE A VALUE IS DRAWN. It goes by itself, the countdown says when, and nothing puts it in
              the address, in the page title or in a toast.
            -->
            <div class="shown">
              <output class="shown-value" for={`key-${k.id}`}>{shown.value}</output>
              <div class="who-do">
                <Button weight="quiet" onclick={() => void copyShown()}>{words.copyValue}</Button>
                <Button weight="bare" onclick={forget}>{words.hide}</Button>
                <span class="who-detail">{words.hidesIn(shown.left)}</span>
              </div>
            </div>
          {/if}
          {#if acts}
            <div class="who-do">
              {#if k.grant && k.sealed}
                <!-- ONLY WHERE THERE IS SOMETHING SEALED TO OPEN: an index row points at no grant. -->
                <Button weight="quiet" disabled={revealing === k.id} onclick={() => void revealKey(k)}>
                  {revealing === k.id ? words.revealing : words.reveal}
                </Button>
              {/if}
              <!-- REPLACE AND REVOKE IN THE KEY'S OWN MENU (design 2.14): six bordered "Replace value" buttons down the
                   page were the loudest thing on it, and neither is what a person comes to the vault to do most. -->
              <Menu label={moreFor(k.label)} align="end">
                {#snippet trigger()}
                  <span class="more-trigger"><Icon name="more" size="s" /><span class="vh">{moreFor(k.label)}</span></span>
                {/snippet}
                <button type="button" class="mi" role="menuitem" onclick={() => openReplace(k)}>{words.replace}</button>
                {#if k.grant && k.sealed}
                  <button type="button" class="mi" role="menuitem" data-tone="bad" onclick={() => void retireKey(k)}>{copy.revokeKey}</button>
                {/if}
              </Menu>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </Section>

  <!-- THE PASSPHRASE BESIDE THE KEYS IT GUARDS, and only for a person who may act here: it is an owner's decision. -->
  {#if acts}
    <Passphrase {lock} {client} onturn={(next) => (lock = next)} />
  {/if}

  <Section title={words.mayOpen} count={holding.length}>
    {#if machinesTell}
      <!-- THE HALF THAT IS OWNER-ONLY SAYS SO IN THE RECORD'S WORDS, and it no longer takes the page with it. -->
      <Empty kind={machinesTell.kind} title={machinesTell.title} body={machinesTell.body} />
    {:else if from !== 'reading' && holding.length === 0}
      <Empty kind="no-data-yet" title={words.noMachines} />
    {/if}
    <ul class="whos">
      {#each holding as d (d.handle)}
        <li class="who">
          <div class="who-head">
            <Icon name="session" size="s" />
            <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
            <Chip label={scopeName(d.scope, names)} />
            <span class="who-detail">
              {d.last_used ? copy.usedWhen(since(d.last_used, Date.now())) : copy.neverUsed} · {copy.endsWhen(relative(d.expires.slice(0, 10), Date.now()))}
            </span>
            {#if acts}
              <span class="who-do">
                <Button weight="bare" tone="bad" onclick={() => void revokeRow(d)}>{copy.revokeKey}</Button>
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Section>

  <Sheet open={sheet !== null} title={sheetTitle} subtitle={sheetHint} onclose={shut}>
    <form class="key-form" id="key-form" onsubmit={saveKey} novalidate>
      {#if sheet?.mode === 'add'}
        <label class="field-label" for="key-label">{words.nameField}</label>
        <div class="field"><input class="field-input" id="key-label" type="text" autocomplete="off" bind:value={form.label} /></div>
        <p class="field-hint">{words.nameHint}</p>

        <label class="field-label" for="key-opens">{words.opensAsk}</label>
        <div class="field"><input class="field-input" id="key-opens" type="text" autocomplete="off" bind:value={form.opens} /></div>
        <p class="field-hint">{words.opensHint}</p>

        <label class="field-label" for="key-kind">{words.kindField}</label>
        <div class="field">
          <select class="field-input" id="key-kind" bind:value={form.kind}>
            {#each words.kinds as kind (kind.id)}<option value={kind.id}>{kind.name}</option>{/each}
          </select>
        </div>

        <!--
          ONLY WHERE THERE IS A PROJECT TO PICK. On a record with no projects list the record refuses
          that read, and this select then offered one option, "No project", which is a control that
          cannot change anything.
        -->
        {#if names.size > 0}
          <label class="field-label" for="key-project">{words.projectField}</label>
          <div class="field">
            <select class="field-input" id="key-project" bind:value={form.project}>
              <option value="">{words.projectNone}</option>
              {#each [...names] as [id, name] (id)}<option value={id}>{name}</option>{/each}
            </select>
          </div>
        {/if}
      {/if}

      <label class="field-label" for="key-value">{words.valueField}</label>
      <!-- A PASSWORD FIELD, so it is not drawn while it is typed and no browser offers to remember it. -->
      <div class="field">
        <input class="field-input" id="key-value" type="password" autocomplete="off" spellcheck="false" bind:value={form.value} />
      </div>

      <!-- WHILE THE VAULT IS BEHIND A PASSPHRASE the key is sealed only with it, so the sheet asks for it here. -->
      {#if lock.state === 'on'}
        <PassField id="key-passphrase" label={words.passField} hint={words.keyPassHint} autocomplete="current-password" bind:value={form.passphrase} />
      {/if}

      <!-- THE WHOLE LINE IS THE TARGET, the box and its words, so a thumb on a phone finds it at the tap height. -->
      <label class="field-toggle" for="key-connector">
        <input id="key-connector" type="checkbox" bind:checked={form.connector} />
        <span>{connectorWords.field}</span>
      </label>
      <p class="field-hint">{connectorWords.hint}</p>
      {#if sheetSaid}<p class="code-said" data-intent="bad" role="status">{sheetSaid}</p>{/if}
    </form>
    {#snippet footer()}
      <Button weight="quiet" onclick={shut}>{words.cancel}</Button>
      <Button weight="primary" type="submit" form="key-form" disabled={saving}>{saving ? words.saving : words.save}</Button>
    {/snippet}
  </Sheet>

  <Sheet open={asking !== null} title={asking ? words.askTitle(asking.label) : words.passField} subtitle={words.askHint} onclose={shutAsk}>
    <form class="key-form" id="ask-form" onsubmit={askGo} novalidate>
      <PassField id="ask-passphrase" label={words.passField} autocomplete="current-password" bind:value={askPass} invalid={askSaid !== ''} />
      {#if askSaid}<p class="code-said" data-intent="bad" role="status">{askSaid}</p>{/if}
    </form>
    {#snippet footer()}
      <Button weight="quiet" onclick={shutAsk}>{words.cancel}</Button>
      <Button weight="primary" type="submit" form="ask-form" disabled={revealing !== '' || askPass === ''}>
        {revealing !== '' ? words.revealing : words.askGo}
      </Button>
    {/snippet}
  </Sheet>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    /* THE PAGE'S CAP IS THE TOKEN EVERY SCREEN SHARES (design 6.7), not a width of its own. */
    max-inline-size: var(--page-max);
  }

  /* The rows are Settings' rows: unboxed, a hairline between them, the controls at the end of the line. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A KEY IS ONE ROW WITH ITS ACTIONS AT THE END. It was four stacked lines, the name, what it
     opens, and a row of buttons under both, so six keys filled two screens. The name line and what
     it opens stack on the left; the actions sit at the trailing edge, centred on both. */
  .who {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-4);
    padding-block: var(--sp-3);
  }

  .who > :not(.who-do) {
    grid-column: 1;
  }

  .who > .who-do {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .who > .shown {
    grid-column: 1 / -1;
    margin-block: var(--sp-2);
  }

  /* ON A PHONE THE ACTIONS STAY AT THE END and sit level with the name, Reveal and the "…" beside each other, so a key
     is still one block beside its verb rather than a button on a line of its own. */
  @media (width < 640px) {
    .who {
      align-items: start;
      column-gap: var(--sp-3);
    }

    .who > .who-do {
      grid-row: 1 / span 3;
    }
  }

  /* THE SOFT HAIRLINE A LIST'S ROWS ARE PARTED BY everywhere (design 6.5), and not `--line`, which is a field's edge. */
  .who + .who {
    border-block-start: 1px solid var(--line-soft);
  }

  .who-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* A NAME ONE LONG WORD WIDE, a host name most of all, breaks rather than pushing the row past the edge at 320. */
  .who-name {
    min-inline-size: 0;
    color: var(--ink);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  /* A KEY'S LINE TWO, the Keys list's: where it applies first, so the chip starts every row's second line and never
     wraps under the name on one row and not the next, then what it opens, then how often it was opened. */
  .key-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .key-opens {
    min-inline-size: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .key > .who-do {
    align-items: center;
    flex-wrap: nowrap;
  }

  /* THE "…" TRIGGER: the size of a control at a desk and of a thumb under one. `Menu` puts it in a `.tap` button. */
  .more-trigger {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    border-radius: var(--r-sm);
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) {
    .more-trigger:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* A label for a screen reader only, scoped here because there is no global one. */
  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A MENU'S ROW, as a flow card's menu draws one; `Menu` makes them 48px rows at 16px when it rises as a sheet. */
  .mi {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* RED ONLY UNDER THE POINTER OR THE FOCUS, as a destructive item is drawn in every menu (`FlowCard`). */
  .mi[data-tone='bad']:hover,
  .mi[data-tone='bad']:focus-visible {
    color: var(--danger);
  }

  @media (pointer: coarse) {
    .more-trigger {
      inline-size: var(--tap);
      block-size: var(--tap);
    }

    .mi {
      min-block-size: var(--tap);
    }
  }

  .who-detail {
    flex: 1 1 auto;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE RUN THAT OPENED THE KEY LAST, a link to it: quieter than what the key opens, and wrapping on a phone. */
  .who-used {
    color: var(--dim);
    overflow-wrap: anywhere;
  }

  .who-used a {
    color: inherit;
  }

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

  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE BUTTON IS THE FIELD'S HEIGHT, so the two read as one control and not a tall box beside a
     short one. */
  .code-row :global(.btn) {
    min-block-size: var(--tap);
  }

  .code-input {
    flex: 0 1 12ch;
    font-size: var(--t-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* The revealed value: its own block, monospaced, wrapping rather than scrolling, and never truncated. */
  .shown {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--s2);
  }

  .shown-value {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .key-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .field-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .field-hint {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ONE COLUMN AT ANY WIDTH, the box then its words, which wrap rather than push the sheet sideways. The control is
     ink and not the accent (D-1). */
  .field-toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .field-toggle input {
    flex: none;
    inline-size: 20px;
    block-size: 20px;
    margin: 0;
    accent-color: var(--ink);
  }

  .field-toggle span {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
