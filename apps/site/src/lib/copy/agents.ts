/**
 * The page for the reader who connects an agent. It may count the product's parts, because a reader
 * arrives there to ask exactly that.
 */
import { CLI_INSTALL, MCP } from '../links.ts';

/** Where the site is, for the lines a reader pastes into a terminal or a client's settings. */
const ORIGIN = 'https://brain.dog';

/**
 * The line that puts `braindog` on a Windows computer. `apps/web/src/lib/device.ts` `INSTALL_LINES` holds the same
 * pair for the app's own install panel; the site cannot import the web app, and `static/cli/install.ps1` is the file it
 * fetches.
 */
const CLI_INSTALL_WINDOWS = `irm ${ORIGIN}/cli/install.ps1 | iex`;

/**
 * THE ONE LINE A NEW MACHINE NEEDS AFTER THE INSTALL (contracts X55), exactly as every page and doc prints it.
 * `apps/cli/src/setup.ts` runs `login`, `install`, the MCP registration, `tools write` and `skills sync` in turn.
 */
const SETUP = `braindog setup ${ORIGIN}/app/<slug>`;

/** What a pasted snippet holds where the reader's own key goes. */
const KEY = '<your key>';

export const agents = {
  /**
   * THE PAGE FOR THE READER WHO WANTS THE MECHANISM, so it may count: every number is read off the
   * code, and `test/content.test.ts` holds the tool and template lists to `packages/mcp`.
   */
  agents: {
    title: 'Connect your AI agents.',
    /* `loop/DIRECTION.md` §0: the record is the data layer agents write to and read from as they work. */
    lead:
      'Claude, Codex, Cursor and any other MCP client can read and write your record. What your agents learn ' +
      'stays there for the next one, every change carries the name of the agent that made it, and a few ' +
      'things always need a person.',

    /**
     * WHAT AN AGENT GIVES AND WHAT IT GETS BACK, `loop/DIRECTION.md` §0 in the reader's words. Each line names
     * the tool that does it in the comment beside it, and every tool is in `packages/mcp/src/index.ts` `TOOLS`.
     */
    value: {
      title: 'Your agents keep the record, and the record briefs them.',
      lead: 'An agent at work meets people, makes keys and finds things out. BrainDog keeps all of it as it happens, and hands it to whichever agent starts next.',
      givesTitle: 'What an agent gives, without being asked',
      gives: [
        /* `meet`: matched by email or handle, added if new, linked to the project with where they met. */
        { what: 'The people it meets', said: 'matched to the ones you know, with where it met them.' },
        /* `braindog keys put`, the deposit door (`apps/cli/src/main.ts`); the record indexes what a key opens. */
        { what: 'Keys', said: 'sealed into the vault, with what each one opens and never the value.' },
        /* `context` names "the keys and servers you may use"; `braindog setup` registers them per machine. */
        { what: 'The MCP servers it uses', said: 'so the next machine is set up from the record.' },
        /* `handoff`: what it is doing, what it tried, and the one next step. */
        { what: 'Its session and handoff', said: 'what it did, what it ruled out, and the next step.' },
        /* `handoff` carries learnings; `context` returns them to every later session. */
        { what: 'What it learned', said: 'kept for the next agent that would otherwise get it wrong.' },
        /* `create`, `update`, `log` and `propose`, each written as an event under the agent's name. */
        { what: 'The work', said: 'rows it added or changed, and the changes it proposes for you to decide.' },
      ],
      getsTitle: 'What it gets back',
      gets: [
        /* `context`: "Your session, your project, its open work, questions waiting on the person...". */
        { what: 'A briefing when it starts', said: 'open work, what is waiting on you, and what was decided.' },
        /* `context` again, scoped to the project the session is in. */
        { what: 'Context for its project', said: 'the people, keys and servers that belong to it.' },
        /* `braindog:skill/{name}` in `TEMPLATES`, and `braindog skills sync`. */
        { what: 'Skills', said: 'the ones you and other agents wrote, updated as they learn.' },
        /* `braindog keys exec`: a value leaves the vault for one command under a grant you approved. */
        { what: 'Keys on a grant', said: 'used for one command and never shown to it.' },
        /* The app's Agents area lists each agent with its sessions and what it wrote. */
        { what: 'A page of its own', said: 'its sessions and everything it wrote, for you to look through.' },
      ],
      /**
       * THE DRAWING: AGENTS AT WORK AND THE BRIEFING THE NEXT ONE OPENS WITH. The names are the clients
       * `lead` names; the people, keys and figures are made up and belong to no record.
       */
      drawn: {
        label: 'Agents at work leave what they found in the record, and the next one starts with a briefing.',
        crew: [
          { name: 'Claude Code', face: 'C', did: 'Met Dana Reyes, who reviews the release' },
          { name: 'Codex', face: 'X', did: 'Sealed a key that opens the payments service' },
          { name: 'Cursor', face: 'Cu', did: 'Learned that the build needs Node 24' },
        ],
        briefing: {
          title: 'Briefing',
          for: 'Claude Code, on the website',
          rows: [
            { what: 'Open work', said: '3 tasks, 1 waiting on you' },
            { what: 'Decided', said: 'Ship the pricing page on Friday' },
            { what: 'People', said: 'Dana Reyes reviews the release' },
            { what: 'Keys it may use', said: 'Payments service, by name' },
            { what: 'Learned', said: 'The build needs Node 24' },
          ],
        },
      },
    },

    connect: {
      title: 'Connect in a minute',
      ways: [
        {
          /* AGT-3's OAuth at `/mcp` (`apps/worker/src/route.ts` `servesMcp`): the client opens the app to approve. */
          head: 'By address',
          said: 'Add this address to your MCP client. It opens the app so you can approve it, once, and pick the record. No key is copied anywhere.',
          lines: [{ label: 'MCP address', code: MCP }],
        },
        {
          /* `static/cli/install.sh` and `install.ps1`, then `apps/cli/src/setup.ts`. */
          head: 'From a terminal',
          said: 'Install the command line, then point it at your record. It signs the machine in, connects the agents on it and adds the skill below, with keys they can use and never read.',
          lines: [
            { label: 'macOS and Linux', code: CLI_INSTALL },
            { label: 'Windows', code: CLI_INSTALL_WINDOWS },
            { label: 'Then, with your record’s address', code: SETUP },
          ],
        },
      ],
      /**
       * THE FALLBACK, FOR A CLIENT THAT CANNOT OPEN A BROWSER. `packages/mcp/src/http.ts` reads a bearer on
       * `Authorization`; each snippet is its client's own settings shape, with the reader's key left to paste.
       */
      key: {
        title: 'Or paste a key',
        /* A key is a row of the record's own `tokens` table (`packages/kernel/src/migrations/0001_kernel.ts`). */
        said: 'When a client cannot open the app, make a key for it in the app and paste it where the snippet says. A key belongs to one record, so make your record first.',
        clients: [
          {
            name: 'Claude Code',
            code: `claude mcp add --transport http braindog ${MCP} --header "Authorization: Bearer ${KEY}"`,
          },
          {
            name: 'Codex, in ~/.codex/config.toml',
            code: `[mcp_servers.braindog]\nurl = "${MCP}"\nhttp_headers = { Authorization = "Bearer ${KEY}" }`,
          },
          {
            name: 'Cursor, in .cursor/mcp.json',
            code: JSON.stringify({ mcpServers: { braindog: { url: MCP, headers: { Authorization: `Bearer ${KEY}` } } } }, null, 2),
          },
        ],
      },
      /**
       * THE AGENT SKILL, served at `links.ts` `SKILL` by `routes/agents/braindog/SKILL.md/+server.ts` from the
       * repository's `skills/braindog/SKILL.md` (contracts X25), which `apps/cli/src/install.ts` places.
       */
      skill: {
        title: 'The Agent Skill',
        said: 'One file that tells an agent when to reach for BrainDog, where to connect, which tools do what, and the house rules: propose changes, deposit keys, log what it learned.',
        where: 'The terminal setup puts it in place for you. By hand, save it as skills/braindog/SKILL.md in your agent’s settings folder, such as .claude in your home folder.',
        open: 'Read the skill',
      },
    },

    mcp: {
      /* `packages/mcp/src/index.ts`: `TOOLS` holds sixteen entries, nine carrying `writes: false`. `triage` joined last
         (`loop/finish/contracts.md` §6.2). */
      title: 'Sixteen tools, and nine of them only read.',
      lead: 'An agent reads the record the way a person does, and what it writes lands as an event carrying its name. Nothing here is a separate copy of your data.',
      readsTitle: 'Read',
      reads: ['record_index', 'context', 'schema', 'get', 'list', 'search', 'history', 'activity', 'governance'],
      writesTitle: 'Write',
      /* The line under the split of the tools, said from the lead: the writes carry a name, the reads change nothing. */
      reading: 'Every write lands in the record as an event under the agent’s name. A read changes nothing.',
      writes: ['propose', 'create', 'update', 'log', 'handoff', 'meet', 'triage'],
      /* `TEMPLATES` in the same file; `test/content.test.ts` holds this list and its count to it. */
      resourcesTitle: 'Seven addresses a client fills in itself',
      resources: [
        { uri: 'braindog:schema/{register}', said: 'The fields of one register.' },
        { uri: 'braindog:page/{slug}', said: 'One page with every block run: rows and figures, never markup.' },
        { uri: 'braindog:metric/{id}', said: 'One figure, with its target and how it compares.' },
        { uri: 'braindog:skill/{name}', said: 'The text of one skill, and when to reach for it.' },
        { uri: 'braindog:declaration/{slug}', said: 'One page as declared, to change and propose back.' },
        { uri: 'braindog:automation/{id}', said: 'One automation as declared, with its last ten runs, each step with its outcome.' },
        { uri: 'braindog:inbox/{state}', said: 'The arrivals in one state: untriaged, review, skipped, matched, proposed, ignored, or all. Skipped is where a wrong skip rule shows.' },
      ],
    },

    /**
     * THE WAYS IN FROM OUTSIDE, EACH WITH ITS ONE CURL LINE AND ITS LIMITS (SCR-5, folded in by contracts X30).
     * They are ordered by how much they can do: a door takes what it is sent and reads nothing, a report key adds
     * rows to one list, and a key reads and writes as its scope allows.
     */
    outside: {
      title: 'Let other systems send in what they know.',
      lead: 'A service, a script or a CI job can reach your record without anybody signed in. Each way in does one thing, and is limited to it.',
      /* The line under the three ways drawn by reach, in the order this list holds them. */
      order:
        'Ordered by how much each can do: a door takes what it is sent and reads nothing, a report key adds rows to one ' +
        'list, and a key reads and writes as its scope allows.',
      /* What the reach chart counts for each way, one step a segment: takes in, adds rows, reads and writes. */
      reach: ['Takes in', 'Adds rows', 'Reads and writes'],
      ways: [
        {
          /* `packages/host/src/ingest.ts`: the Cloud's `/in/webhook/<rec_id>/<ingest-id>/<token>`, answered 202. */
          head: 'A door',
          said: 'An address in your record that another service posts to, such as a form, a shop or a bank’s alerts. What arrives waits in the inbox until it is filed.',
          code: `curl -X POST ${ORIGIN}/in/webhook/<record>/<door>/<secret> -H "Content-Type: application/json" -d '{"event":"signup","email":"dana@example.com"}'`,
          limits: [
            /* `declare.ts` `verify:`: a path secret by default, or `hmac_sha256`, `stripe` or `github`. */
            { what: 'Secret or signed', said: 'The address holds a secret. Stripe and GitHub doors check the signature on each delivery instead.' },
            /* `WEBHOOK_LIMIT` in `packages/host/src/ingest.ts`. */
            { what: '1 MB a delivery', said: 'Counted on the bytes as they arrive, and refused past it.' },
            /* `IN_PER_MINUTE` in `apps/worker/src/route.ts`, with `retry-after` on the refusal. */
            { what: '120 a minute', said: 'For each door. A sender past it is told how long to wait.' },
            /* ingest.ts: stored before anything reads it, and 202 with an empty body for every payload. */
            { what: 'Kept, and says nothing', said: 'Every delivery is stored before anything reads it, and every sender gets the same empty answer.' },
          ],
        },
        {
          /* `packages/record/src/report.ts`; the line is `apps/web/src/lib/record/reporting.ts` `curlLine`. */
          head: 'A report key',
          said: 'A key that only adds rows to one list, with fields you fix when you create it. It cannot read anything, so it is safe to put in a CI job or on a server.',
          code: `curl -X POST ${ORIGIN}/api/report -H "Authorization: Bearer <report key>" -H "Content-Type: application/json" -d '{"name":"Sign-ups","value":12}'`,
          /* Every figure off `packages/record/src/report.ts`. */
          limits: [
            { what: 'Write only', said: 'It cannot read lists, figures or people. Anything else it tries is refused.' },
            { what: 'One list', said: 'Chosen when you create the key, and it never changes.' },
            { what: 'Up to 8 fixed fields', said: 'Values you set on the key that the project cannot change.' },
            { what: '100 rows a call', said: 'A bigger batch is refused whole, never half written.' },
            { what: '256 KB a call', said: 'Measured as the JSON of its rows.' },
            { what: '600 rows a minute', said: 'Counted from the first report in each minute.' },
          ],
        },
        {
          /* `packages/mcp/src/http.ts`: a bearer on `/mcp`, and `tools/list` needs no session first. */
          head: 'A key',
          said: 'The same key a client pastes above, for a script that talks to the record directly. It acts under the name you gave it.',
          code: `curl -X POST ${MCP} -H "Authorization: Bearer ${KEY}" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
          limits: [
            /* The `scope` check in `packages/kernel/src/migrations/0001_kernel.ts`: read, propose or write, no admin. */
            { what: 'Reads unless told more', said: 'Each key reads, proposes or writes, and you choose which when you make it.' },
            /* A key is a row of one record's `tokens` table. */
            { what: 'One record', said: 'It opens the record it was made in, and no other.' },
            /* `MAX_BODY_BYTES` in `packages/mcp/src/http.ts`. */
            { what: '1 MB a request', said: 'A bigger call is refused before it is read.' },
            /* `braindog token create --days`, and revoking in the app. */
            { what: 'Ends when you say', said: 'Revoke it in the app at any time, or give it a number of days when you make it.' },
          ],
        },
      ],
    },

    cannot: {
      title: 'What only a person can do.',
      lead: 'Whatever key an agent holds, these need somebody signed in to the app.',
      rows: [
        { what: 'Answer a decision', said: 'Deciding needs a person, signed in. No token reaches it.' },
        { what: 'Invite anybody', said: 'An invitation, a new token, an export and the list of vault grants all need a browser session.' },
        { what: 'Read a secret', said: 'The record indexes what a key opens, never the key. A value leaves the vault for one call and is never written down.' },
      ],
    },

    /* The copy button on every code panel (`routes/agents/Code.svelte`). It says copied only when the browser did. */
    copy: {
      label: 'Copy',
      copied: 'Copied.',
      failed: 'This browser would not copy. Select the text instead.',
    },
  },
} as const;
