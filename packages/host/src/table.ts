/**
 * The route table, alone: which methods exist, their groups, whether each writes and what each takes.
 *
 * IT IS ITS OWN FILE SO A BROWSER CAN READ IT WITHOUT THE HOST. `@braindog/client` needs the names and which of them
 * write, and nothing else here; it took them from `index.ts`, whose re-exports reach the kernel, the record and every
 * door, and so every screen's first load carried the whole kernel for a list of words. This file imports only the rows
 * under `routes/`, which are data too. `index.ts` re-exports everything here, so no other caller changes.
 */

import { EXTRA_ROUTES } from './routes/index.ts';

/**
 * What one argument IS, so the text a stranger typed becomes the value the handler was written for.
 *
 * THREE, AND NOT A SCHEMA. `text` is taken verbatim, `integer` is a whole number or a refusal, and
 * `json` is a structure that had to be encoded to survive a query string at all. Everything a read
 * route takes today is one of the three, and the one thing this vocabulary must not become is a
 * validator: what a register is called, what a slug may contain and what a predicate may ask are
 * the record's own questions, answered by the record with its own sentences. This says only what
 * shape the value arrives in, which is the one question the record cannot answer, because by the
 * time it is asked the text has already been guessed at.
 */
export type ArgType = 'text' | 'integer' | 'json';

/**
 * The six groups `30 §5` splits the surface into, and it splits it by WHO MAY REACH IT rather than
 * by convenience, which is what makes ADR-018's "the web app is a client of the agent API"
 * enforceable rather than aspirational.
 *
 * `INTERNAL` IS HERE SO IT CAN BE REFUSED. It is the host's own surface and not routable from
 * outside; naming it in the type is what lets `router-groups` say "no route carries this" instead of
 * hoping nobody adds one.
 */
export const GROUPS = ['DATA', 'READ+', 'KEYCHAIN', 'JOBS', 'ADMIN', 'INTERNAL'] as const;
export type Group = (typeof GROUPS)[number];

/** One method the host exposes: its name, its group, and what it does to the record. */
export type Route = {
  /** The name a caller sends. `record.list`, and the dot is the group. */
  name: string;
  /**
   * Which of `30 §5`'s six.
   *
   * EVERY ROUTE DECLARES ONE, and `30 §5` asks for exactly this: "the router asserts it: every
   * route declares its group, and a CI test walks the router and fails on a route with no group".
   * The rule it keeps is the one that stops the surface drifting: *if a screen needs something
   * outside DATA and READ+, it is either a browser-session group (KEYCHAIN, JOBS, ADMIN) or it is a
   * design error.* There is no third case, and a group in the table is how a reviewer sees which
   * case a new method is claiming to be.
   */
  group: Group;
  /** Whether it changes anything. A read is safe to retry; a write is not. */
  writes: boolean;
  /**
   * A read sent as a write: it changes nothing, but its arguments are too large for an address, so it goes as a POST.
   * Only `previewPage` is one. The looks that cannot press hand it on, and nothing else reads this mark.
   */
  postRead?: true;
  /** One line, for the CLI's help and the MCP tool description. */
  what: string;
  /**
   * The arguments this route takes, and what each one is. Reads only: a write is a POST and a JSON
   * body already carries its own shapes.
   *
   * EVERY QUERY VALUE WAS JSON-DECODED AND HANDED ON UNCOERCED. `serveApi` tried `JSON.parse` on
   * each one and fell back to the raw text when the parse failed, so the caller chose the SHAPE of
   * every argument and not only its contents, and nothing between here and the SQL driver looked at
   * it again. Fuzzing the read routes with fourteen hostile shapes per argument produced fifty-two
   * GET requests answering 500 `INTERNAL`: `?seq={"a":1}` was "Provided value cannot be bound to
   * SQLite parameter 2", `?register={"length":1}` was "Unknown named parameter 'length'", and
   * `GET /api/search?q=x&limit=1.5`, which is a typo rather than an attack, was "datatype
   * mismatch". A refusal is a value, and a 500 answering a read is the failure this layer exists to
   * prevent.
   *
   * THE RULE WAS ALREADY WRITTEN DOWN AND LANDED ON TWO ROUTES OUT OF SIX.
   * `packages/record/src/index.ts` around line 744 says it in as many words, over `page`'s slug:
   * *"COERCED AT THE EDGE. These arrive from a query string a stranger wrote, and `.split` on an
   * absent one threw a TypeError out of the route."* `metric` had it too. `get`, `history`,
   * `search`, `governance`, `schema` and `list` did not, and a per-route coercion inside the record
   * is four more places to forget. So it is here, as data, in the same line that declares the
   * group: a route added tomorrow says what it takes where a reviewer is already looking.
   *
   * AND IT IS WHAT STOPS A STRING CHANGING TYPE ON THE WIRE. Guessing meant a string whose text is
   * valid JSON stopped being a string: a page really declared at the slug `2026` was listed by
   * `pages` and then answered `REQUIRED_MISSING`, "A page is asked for by its slug", to a caller
   * that had sent one. `text` is the answer to that, and it is the same answer for a browser
   * following the link as for the client.
   */
  takes?: Readonly<Record<string, ArgType>>;
};

/**
 * The rows written in this file. NOBODY ADDS ONE HERE ANY MORE: a new route is a row in `routes/<unit>.ts`, registered in
 * `routes/index.ts`, beside its record method in `packages/record/src/methods/<unit>.ts`. These stay together, because moving every one of them would be a diff every reader has to check for a
 * changed group and nothing would be gained by it.
 */
const CORE_ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this BrainDog holds, and how many rows are in each register.' },
  { name: 'schema', group: 'READ+', writes: false, what: 'What one register holds: its fields, their types, and what each may take.',
    takes: { register: 'text' } },
  { name: 'get', group: 'DATA', writes: false, what: 'One row, by the number a person says out loud: tasks#3, or S1.',
    takes: { register: 'text', seq: 'integer', spoken: 'text', values: 'json' } },
  { name: 'list', group: 'DATA', writes: false, what: 'Rows of one register, narrowed by a predicate, newest first.',
    /* `cursor` IS `text` AND NOT `json`, and it is the one argument where that matters. A keyset
       cursor is `<when>|<id>`, which is not valid JSON, so it survived the guessing by accident;
       reading it as the text the record minted is the same answer on purpose.

       `includeDeleted` IS `json` SO A GET CAN ASK FOR DELETED ROWS AT ALL. The kernel reads it as `=== true`, and
       undeclared it arrived as the four letters "true": measured at afb3b1b2, `GET /api/list?includeDeleted=true`
       answered the live rows alone, 200, nothing said, while the same read as a POST answered the deleted ones too.
       The CLI's import sent that POST by hand for want of this line. Decoded, `true` is `true`; a value that is not
       true or false is the record's to refuse (`record.list`), because read as false it is the same silent answer. */
    takes: { register: 'text', where: 'json', limit: 'integer', cursor: 'text', order: 'json', includeDeleted: 'json', fields: 'json', short: 'json' } },
  /* ONE READ FOR EVERY PILL OF A FIELD: the list screen asked `list` once a value, a dozen requests before it settled. */
  { name: 'countBy', group: 'DATA', writes: false, what: 'How many entries of one list hold each value of one field.',
    takes: { register: 'text', by: 'text', where: 'json' } },
  { name: 'history', group: 'READ+', writes: false, what: 'The writes that made one row, in order, each with who and when.',
    takes: { register: 'text', seq: 'integer' } },
  { name: 'backlinks', group: 'READ+', writes: false, what: 'What points at one row: the rows of other lists whose reference fields name it, a page at a time.',
    takes: { register: 'text', seq: 'integer', limit: 'integer', cursor: 'text' } },
  /* `cursor` IS NOT DECLARED ON THESE TWO, SO IT ARRIVES AS THE TEXT IT WAS SENT on a GET and as itself in a POST. It
     was `integer`, and a member held to named lists is now handed `e.<event id>` rather than the event's rowid
     (the rowid between two of her lines counted the events she was not shown), so
     the host refused her own cursor with a 422 before the record could read it. `text` would refuse the owner's rowid
     in a POST body, which is a number there. The record checks both spellings and says what it wanted. */
  { name: 'whatsNew', group: 'READ+', writes: false, what: 'What changed since you last read, newest first, held to what you may see.',
    takes: {} },
  { name: 'recentHistory', group: 'READ+', writes: false, what: 'Every change here, newest first, a page at a time, held to what you may see.',
    takes: { limit: 'integer' } },
  /* `state` IS DECLARED BECAUSE THE RECORD TAKES IT. It was missing, so the table told a reader the inbox answered only
     what waits on a person, when `?state=skipped` and `?state=all` already reached the record as undeclared text.
     `repeats` IS JSON, as `includeDeleted` on list is: undeclared, `?repeats=true` reached the record as the text "true",
     which it refuses, so the Inbox's "Held as repeats" read always came back empty. */
  { name: 'inbox', group: 'READ+', writes: false, what: 'What arrived and no rule filed, newest first, a page at a time, in one state or all of them, with a count for each. An owner reads it, and so does a token for all of this BrainDog that its owner gave the inbox reach. No other token does. With digest it answers every state at once, the newest 100 of each with the body cut to 180 characters, and with id one arrival whole.',
    takes: { state: 'text', cursor: 'integer', limit: 'integer', repeats: 'json', digest: 'json', id: 'text' } },
  { name: 'search', group: 'DATA', writes: false, what: 'Rows whose text matches, across every register you can see, best first.',
    takes: { q: 'text', limit: 'integer' } },
  { name: 'version', group: 'READ+', writes: false, what: "This BrainDog's version, to tell whether anything you may see has changed. An owner who reads every list gets the newest event's rowid and may ask what changed since; anybody else gets a number that is only equal or not, never larger or smaller. Given since, the lists that moved since then.",
    takes: { since: 'integer' } },
  { name: 'whoami', group: 'READ+', writes: false, what: 'Who you are here, and which verbs you reach.' },
  { name: 'sessionsLive', group: 'READ+', writes: false, what: 'The runs that are live now, with how long since each was heard from.' },
  { name: 'context', group: 'READ+', writes: false, what: 'Where an agent stands: its run, its project, the last handoff, who is live, what waits, and what applies here.' },
  { name: 'digestToday', group: 'READ+', writes: false, what: 'What the digest would say if it went now. It sends nothing.',
    takes: { digest: 'text' } },
  { name: 'pages', group: 'READ+', writes: false, what: 'Every page this BrainDog can draw, templates expanded.' },
  /* THE PAGES CENSUS AND THE PATHS CHECK: two reads beside `pages`, writing nothing. `checkPaths` takes a
     whole document, so a caller sends it as a POST body; a read may arrive either way. `register` is the list the document
     is written into, whose fields a page made for its rows fills. */
  { name: 'pagesCensus', group: 'READ+', writes: false, what: 'Each page you can open, counted: what it holds, what it could not show you, each placeholder that names nothing and each dash where a value goes. It changes nothing.',
    takes: {} },
  { name: 'checkPaths', group: 'READ+', writes: false, what: 'Each placeholder a document holds, and whether your BrainDog has anything by that name. It changes nothing.',
    takes: { document: 'text', register: 'text' } },
  /* `filter` IS THE READER'S OWN CHOICE over the page's declared filters, a field to the value chosen, so it is JSON: on a
     GET it is `?filter={"project":"oxbow"}`. What it may name is the record's question (`kernel.page`), not this table's.
     `walk` IS HOW FAR A FORECAST LOOKS when the reader asks past the two years walked unasked: `?walk=1825` or
     `?walk=last`. It is text because one answer is a word; the record turns a digit string into days. `shape` (`?shape=1`)
     asks a project's page to carry what its shape's parts draw, each its own method's answer (`project-shape.ts`). */
  { name: 'page', group: 'READ+', writes: false, what: "One page, with every block run: rows and figures, never markup. A filter narrows it to what you chose, and shape carries a project's own parts.",
    takes: { slug: 'text', filter: 'json', walk: 'text', shape: 'text' } },
  { name: 'metric', group: 'READ+', writes: false, what: 'One figure, with its target and how it compares.',
    takes: { metric: 'text' } },
  /* EVERY FIGURE, AND NOT ONLY A DRAWN ONE. `metric` reads an id already known and `page`
     names the figures its blocks draw, which on money-core as it ships was 18 of 36; nothing routed listed the rest, so
     neither could MCP's `record_index`. It takes nothing and evaluates nothing. */
  { name: 'figures', group: 'READ+', writes: false, what: 'Every figure you may read: its id, its name, how it is written, its list, its pack and whether it takes a parameter. Never a reading.' },
  { name: 'listGrants', group: 'KEYCHAIN', writes: false, what: 'What each credential opens. Never the credential.' },
  { name: 'revokeGrant', group: 'KEYCHAIN', writes: true, what: 'Take a credential out of service. The bytes go; the row stays, because what it opened is a fact.' },
  { name: 'dryRun', group: 'READ+', writes: false, what: 'What a rule would do, before anybody turns it on. It writes nothing.',
    takes: { rule: 'json', limit: 'integer' } },
  /* A DRAFT SCRIPT, RUN NOW (`script-try.ts`). READ+ AND NOT ADMIN, because `admin` refuses every token and the caller
     this exists for is an agent trying a script before it proposes one,
     at `propose`'s rung, as `dryRun` is READ+ for a rule. What READ+ would otherwise let through is held elsewhere: a
     token's trial opens no key, its reads are the caller's own and never `system`'s, and the allowance is asked first.
     `writes: true` ALTHOUGH IT WRITES NOTHING TO THE RECORD, because the flag is what makes a route a POST and a trial
     is not safe to repeat: it spends a run of the plan and may send a POST of its own to a provider. As a GET it would
     also carry the whole source in a query string, and a prefetched link could run it. */
  { name: 'scriptTry', group: 'READ+', writes: true, what: 'Run a draft script now and answer the writes it would make, its log and any refusal. It writes nothing, and it is counted as a run.' },
  /* A PROPOSED PAGE, DRAWN BEFORE ANYBODY ACCEPTS IT. READ+ beside `page`, since it draws what
     `page` draws and holds each block to the caller the same way. `writes: true` ALTHOUGH IT WRITES NOTHING, for one of
     `scriptTry`'s reasons: a page body of up to twenty blocks is no query string. It also kept a caller-written body
     that walks a list off the Cloud's public demo, which answered any GET to anybody; that door is gone,
     and the flag stays for the first reason. */
  { name: 'previewPage', group: 'READ+', writes: true, postRead: true, what: 'Draw a page body nobody has installed, as page would draw it, each block held to what you may read. It installs nothing and writes nothing.' },
  { name: 'governance', group: 'READ+', writes: false, what: 'What has been proposed, what was decided, and what was predicted.',
    takes: { register: 'text', id: 'text', status: 'text', limit: 'integer', cursor: 'text' } },
  { name: 'propose', group: 'DATA', writes: true, what: 'Put a question in front of a person. It changes nothing by itself.' },
  { name: 'decide', group: 'DATA', writes: true, what: 'Answer one, with the reason. No token reaches this.' },
  { name: 'packs', group: 'READ+', writes: false, what: 'Which packs this BrainDog has, and at what version.' },
  { name: 'packConfig', group: 'READ+', writes: false, what: "One pack's settings, and the value each holds now.",
    takes: { id: 'text' } },
  { name: 'arrangement', group: 'READ+', writes: false, what: 'How this BrainDog is arranged and what may be proposed about it: packs, the catalogue, voice and pages; one page declaration; or a grammar.',
    takes: { page: 'text', grammar: 'text' } },
  { name: 'pageVersions', group: 'READ+', writes: false, what: "One page's versions, newest first, each with its source, when it was applied and by whom.",
    takes: { page: 'text' } },
  { name: 'exportUseCase', group: 'READ+', writes: false, what: "This BrainDog's arrangement as a use-case file: modules, its own lists and pages, voice and labels, and only the example rows named.",
    takes: { usecase: 'text', title: 'text', summary: 'text', version: 'text', audience: 'text', author: 'text', examples: 'json', step: 'text', nav: 'json', signals: 'json', skills: 'json' } },
  { name: 'actions', group: 'READ+', writes: false, what: "Every scheduled action: what it calls, how often, whether it is paused and why, and this month's runs." },
  /* THE AUTOMATIONS, READ BY THE CANVAS AND BY AN AGENT THROUGH ONE METHOD. With
     no `rule` it is the list; with one it is that automation with its last ten runs, each step's outcome beside it, and
     `before` and `limit` page that rule's older runs (the method widened, not a new row). */
  { name: 'automations', group: 'READ+', writes: false, what: 'Every automation: what starts it, when it runs next and how its runs went; or one, with its last ten runs step by step, and older runs a page at a time.',
    takes: { rule: 'text', before: 'text', limit: 'integer' } },
  /* THE SCRIPTS, WHICH NOTHING LISTED. `resumeScript` was routed and no read named what it could resume: `actions` stops at
     `pull`, `call` and `poll`. Held by the record to the lists each script reads and writes. */
  { name: 'scripts', group: 'READ+', writes: false, what: 'Every installed script: what it may read, write and fetch, whether it is paused, its last run and its refused runs in a row.' },
  { name: 'planPack', group: 'ADMIN', writes: false, what: 'What installing a pack would do to this BrainDog. It writes nothing.',
    takes: { doc: 'json', source: 'json' } },
  { name: 'slash', group: 'ADMIN', writes: false, what: 'What Slash noticed about how this BrainDog is used, and the arrangement proposals it would file. It writes nothing.' },
  { name: 'slashPropose', group: 'ADMIN', writes: true, what: "Put Slash's proposals on Decide, through propose's checks. Given asked, a description of what to build, and page, the page it is about, it files what slashDraft would answer for it instead. It changes nothing until the owner accepts one.",
    takes: { asked: 'text', page: 'text' } },
  { name: 'slashDaily', group: 'ADMIN', writes: true, what: 'Whether Slash looks once a day on its own and puts what it finds on Decide. On unless the owner turns it off.' },
  { name: 'slashForm', group: 'ADMIN', writes: true, what: "Ask Slash's model for a first plan from what the owner said a project is, and put it on Decide as rows. Nothing is made until the owner accepts it.",
    takes: { usecase: 'text', said: 'text' } },
  { name: 'planUseCase', group: 'ADMIN', writes: false, what: 'What installing a shared use-case file would do, pack by pack. It writes nothing.',
    takes: { doc: 'json', text: 'text', source: 'json', modules: 'json' } },
  { name: 'fetchShared', group: 'ADMIN', writes: false, what: 'The text of a shared use-case or add-on file at an https address or git:owner/repo@ref:path, read by the host with no credentials. It writes nothing.',
    takes: { url: 'text' } },
  { name: 'fetchUseCase', group: 'ADMIN', writes: false, what: 'The text of a shared use-case file at an https address, read by the host with no credentials. It writes nothing.',
    takes: { url: 'text' } },
  /* THE WHOLE FIRST RUN AS ONE CALL. The browser ran it as a script of a dozen calls, so a closed tab left a
     record part made. ADMIN as `installPack` is: it installs add-ons, and only the owner in a browser may. */
  { name: 'setup', group: 'ADMIN', writes: true, what: 'Make this BrainDog from what its owner accepted, in one call: the add-ons in order, then their name, their words, the settings and what they asked to start with. It answers what was done and what was not, and asked with again it writes only what is missing.' },
  { name: 'installPack', group: 'ADMIN', writes: true, what: 'Apply the plan somebody approved, with the calls-out lines it asks for. In the app, or by your agents while they act without asking.' },
  { name: 'uninstallPack', group: 'ADMIN', writes: true, what: 'Take one back out. Its declarations go; its rows stay, or with data: true go to the bin until it is installed again.' },
  { name: 'disablePack', group: 'ADMIN', writes: true, what: 'Turn a pack off. It stays listed, its rows stay, and what leans on it is named first.' },
  { name: 'enablePack', group: 'ADMIN', writes: true, what: 'Turn a pack back on, over the rows it kept.' },
  { name: 'resumeAction', group: 'ADMIN', writes: true, what: 'Start a paused scheduled action again, now. A refused key pauses one, and nothing else restarts it.' },
  { name: 'resumeScript', group: 'ADMIN', writes: true, what: 'Start a script paused by three refused runs in a row again, now. Nothing else restarts it, and three more refused runs pause it again.' },
  /* A BROWSER SESSION ONLY, as `installPack` is: a run writes rows as the rule and notifies, so pressing Run now is a
     person's decision, and an agent's way to one is `propose`. */
  { name: 'automationRun', group: 'ADMIN', writes: true, what: 'Run an automation now, one that declares a Run now button. The owner in the app, or his agents while he lets them do everything without asking.' },
  { name: 'cancelRun', group: 'ADMIN', writes: true, what: 'Stop a run that has not finished. A run stopped while it waits never resumes.' },
  { name: 'fileArrival', group: 'ADMIN', writes: true, what: 'File one arrival from the inbox as a row in a list. The row is written like any other, and the arrival leaves the inbox.' },
  { name: 'archiveArrival', group: 'ADMIN', writes: true, what: 'Take one arrival out of the inbox without filing it. Its bytes are kept, and asking twice is the same answer.' },
  { name: 'setPackConfig', group: 'ADMIN', writes: true, what: "Change a pack's settings. They are read the next time the pack is planned and installed." },
  { name: 'setDeclaration', group: 'ADMIN', writes: true, what: 'Set one declaration from the app, through the same lint a pack gets.' },
  { name: 'retireDeclaration', group: 'ADMIN', writes: true, what: 'Retire one. Its rows stay; a declaration is a shape.' },
  /* SLASH'S LOOK OVER A PAGE, ANSWERED BY THE PERSON WHO SAW IT LAND, who may undo it or keep it. ADMIN for
     `setDeclaration`'s reason: a look is a declaration, and what it puts back or keeps is the page everybody opens. */
  { name: 'undoLook', group: 'ADMIN', writes: true, what: 'Put a page back the way it was before Slash arranged it. Only while that arrangement is still the one Slash wrote.' },
  { name: 'keepLook', group: 'ADMIN', writes: true, what: 'Keep how Slash arranged a page once its Undo has passed, so the page says who kept it. The arrangement itself is not changed.' },
  /* UNDO ON THE SERVER, so what was handed to an agent can be taken back: one batch of changes or one decision, and
     every change one run made. ADMIN for `restore`'s reason, a person in a browser: what is put back is the record
     everybody reads, and no token reaches either, so an agent cannot quietly take back what a person saw. `dry` answers the plan in names and
     the hash that applying it needs, so what is put back is the plan the person read and nothing that moved since. */
  { name: 'undo', group: 'ADMIN', writes: true, what: 'Put back one set of changes, or what one decision did. Ask with dry first to read what would go back; a change somebody has made since is left alone.' },
  { name: 'undoRun', group: 'ADMIN', writes: true, what: 'Put back every change one agent run made. Ask with dry first to read what would go back; a change somebody has made since is left alone.' },
  { name: 'ruleApply', group: 'ADMIN', writes: true, what: 'Run one rule over the entries already there, as one batch one Undo takes back. `dry` first, to see what it would change.' },
  { name: 'examples', group: 'ADMIN', writes: false, what: 'The example rows setting up planted that nobody has touched, counted by list. It writes nothing.' },
  { name: 'clearExamples', group: 'ADMIN', writes: true, what: 'Delete every example row nobody has touched. A row somebody edited, or one a row of theirs points at, stays.' },
  { name: 'members', group: 'ADMIN', writes: false, what: 'Who is here, at what level, and where.' },
  { name: 'invite', group: 'ADMIN', writes: true, what: 'Put somebody on, or move them. A level per register. An address alone mints a single-use link, sent by nobody.' },
  { name: 'invitations', group: 'ADMIN', writes: false, what: 'Every invitation nobody has used or withdrawn, the ones that ran out marked expired. Never a link.' },
  { name: 'revokeInvite', group: 'ADMIN', writes: true, what: 'Withdraw an invitation. Its link stops working at once.' },
  { name: 'removeMember', group: 'ADMIN', writes: true, what: 'Take somebody off. Never the last owner.' },
  { name: 'listTokens', group: 'ADMIN', writes: false, what: 'Every agent token, with when it was last used. Never the token.' },
  { name: 'createToken', group: 'ADMIN', writes: true, what: 'Mint one. The secret is in the answer and is stored nowhere.' },
  { name: 'revokeToken', group: 'ADMIN', writes: true, what: 'Revoke one. The second call says the same as the first.' },
  { name: 'createReportKey', group: 'ADMIN', writes: true, what: 'Mint a report key: a token that sends rows to one list, with the fields it always carries, and reaches nothing else. The secret is in the answer only.' },
  { name: 'reportKeys', group: 'ADMIN', writes: false, what: 'Every report key, with the list it sends rows to and the fields it fixes. Never the key.' },
  { name: 'deviceApprove', group: 'ADMIN', writes: true, what: 'Let in the device showing these six digits. A sign-in in the last fifteen minutes.' },
  { name: 'listDevices', group: 'ADMIN', writes: false, what: 'Every device grant by its handle, with when it was last heard from. Never the id it polls with.' },
  { name: 'revokeDevice', group: 'ADMIN', writes: true, what: 'Revoke one device by its handle. A login grant takes its token with it.' },
  /* THE SHORTCUT'S DOOR, AND AN OWNER'S IN A BROWSER for `deviceApprove`'s reason: whoever holds the token can put a
     bank line of their choosing into the ledger at `exact`. Unrouted, the mint was reachable from a test and from
     nothing a person could open: `packages/host/test/ingest-shortcut.test.ts` (8) answered 404 `ROUTE_UNKNOWN`. */
  { name: 'ingestMint', group: 'ADMIN', writes: true, what: "Make the token a webhook ingest's address carries, and answer that address. It is shown once, only its digest is kept, and minting again replaces it." },
  /* THE DOORS THIS RECORD DECLARES, so the screen that mints their tokens learns them from the record and names none of
     its own. An owner's, for the mint's reason; the digest is never in it. */
  { name: 'doors', group: 'ADMIN', writes: false, what: 'Every webhook door this BrainDog declares: what it is, how it is verified, whether a token is held for it and the list it writes. Never the token.' },
  /* `writes: true` BECAUSE IT WRITES. An export appends an `export` event (12 §6's rule that a
     keychain whose reads are not audited cannot say whether anything got out) and a GET that mutates
     the record is a GET a proxy may replay and a browser may prefetch. */
  { name: 'export', group: 'ADMIN', writes: true, what: 'This BrainDog as a file: a line per row, and it imports back.' },
  /* `replace` IS A RESTORE AND NOT A MERGE: the file must be this record's own copy, and it replaces every row that travels.
     Anything else into a record that holds rows is still refused `IMPORT_NOT_EMPTY` (`packages/kernel/src/index.ts`, `import`). */
  { name: 'import', group: 'ADMIN', writes: true, what: 'A file into an EMPTY BrainDog, or with replace, this BrainDog put back from its own copy, what it was kept first where this host keeps copies. Anything else is a merge nobody asked for.' },
  { name: 'snapshot', group: 'ADMIN', writes: true, what: 'A copy of all of this BrainDog, now, kept by this host. A host that keeps none says so.' },
  { name: 'snapshots', group: 'ADMIN', writes: false, what: 'The copies this host keeps, newest first, each with when it was taken and its size.' },
  { name: 'restore', group: 'ADMIN', writes: true, what: 'Put this BrainDog back to one kept copy. What it was is kept as a copy first.' },
  { name: 'erase', group: 'ADMIN', writes: true, what: 'Erase a person: every value naming them, in one transaction, and one event that names them only as a hash.' },
  { name: 'deleteRecord', group: 'ADMIN', writes: true, what: 'Delete this BrainDog, with its name typed to confirm. There is no undo.' },
  { name: 'markRead', group: 'DATA', writes: true, what: 'How far you have read, named as an event. A person only, and never an event of its own.' },
  /* A DRAWN VIEW'S WRITE (add-ons phase 4): checked against the block's own `actions:` and written as the viewer. */
  { name: 'drawnAct', group: 'DATA', writes: true, what: "A row added or changed by a drawn view, only as its block's acts allow, written as you." },
  { name: 'setPref', group: 'DATA', writes: true, what: 'One of your own settings: the rail order, the pages hidden from it, the navigation shape, whether new pages are suggested, or what you dismissed. A person only, and not an event.' },
  /* A PHONE ASKING TO BE TOLD, AND TELLING IT TO STOP. READ+ because they are verbs over no row, as `boot`
     and `whoami` are; POSTs because each keeps or removes a `push_sub` row. Only a person's own, and never an event. */
  { name: 'subscribePush', group: 'READ+', writes: true, what: 'This browser asks to be told when something needs you. A person only, their own, and not an event.' },
  { name: 'unsubscribePush', group: 'READ+', writes: true, what: 'This browser stops being told. Only your own subscription is taken away.' },
  { name: 'log', group: 'DATA', writes: true, what: 'A note against a row. It changes nothing and is still a write.' },
  { name: 'create', group: 'DATA', writes: true, what: 'Add a row. BrainDog gives it its number.' },
  { name: 'report', group: 'DATA', writes: true, what: 'Rows a project sends with its report key, one or up to a hundred, into the list the key is bound to. A report key reaches this and nothing else.' },
  { name: 'update', group: 'DATA', writes: true, what: 'Change a row, against the version you read.' },
  { name: 'makePrivate', group: 'DATA', writes: true, what: 'Keep a row you made to yourself, or share it with everyone on this BrainDog again. Only its maker can.' },
  { name: 'attach', group: 'DATA', writes: true, what: 'Say which run this agent is and where it stands. A token only: a person is never a run.' },
  { name: 'handoff', group: 'DATA', writes: true, what: "Keep a run's handoff true: the next step, what was tried, a note, its state." },
  { name: 'undoOwn', group: 'DATA', writes: true, what: "Take back one of your own writes by the batch its receipt gave. Only your own run's writes; anything else is refused." },
  { name: 'meet', group: 'DATA', writes: true, what: 'Someone or some organisation met in the work: matched by a key (email, handle, domain), or added; a name alone is only noted.' },
  /* THE SAVED VIEWS. Reading one is READ+ and held to the list it belongs to, because a view names
     that list's fields and the values somebody filtered on; saving and retiring one change what the
     list offers everybody who opens it, which is the ADMIN argument `setDeclaration` already makes. */
  { name: 'views', group: 'READ+', writes: false, what: 'The saved ways of looking at one list, or at every list you can read.',
    takes: { register: 'text' } },
  { name: 'view', group: 'READ+', writes: false, what: 'One saved view: its filter, what it searched for, its order and its columns.',
    takes: { register: 'text', id: 'text' } },
  { name: 'saveView', group: 'ADMIN', writes: true, what: 'Save the way this list is being looked at, under a name. Saving over one replaces it.' },
  { name: 'retireView', group: 'ADMIN', writes: true, what: 'Take a saved view off a list. Its rows are untouched: a view is a question, not a row.' },
];

/** Every route: the rows above, then the ones under `routes/` (`routes/index.ts`). */
export const ROUTES: readonly Route[] = [...CORE_ROUTES, ...EXTRA_ROUTES];
