/**
 * The page for the reader who connects an agent. It may count the product's parts, because a reader
 * arrives there to ask exactly that.
 */
import { CLI_INSTALL, MCP } from '../links.ts';
export const agents = {
  /**
   * THE PAGE FOR THE READER WHO WANTS THE MECHANISM, so it may count: every number is read off the
   * code, and `test/content.test.ts` holds the tool and template lists to `packages/mcp`.
   */
  agents: {
    title: 'Connect your AI agents.',
    lead:
      'Claude, Codex, Cursor and any other MCP client can connect with a key you create. Everything an ' +
      'agent changes is saved under its name, and a few things always need a person.',

    connect: {
      title: 'Connect in a minute',
      ways: [
        {
          head: 'By address',
          said: 'Add this address to your MCP client. It opens the app so you can approve it, once, and picks the record.',
          code: MCP,
        },
        {
          head: 'From a terminal',
          said: 'The command line signs a machine in and serves your record to the agents on it, with keys they can use and never read.',
          code: CLI_INSTALL,
        },
      ],
    },

    mcp: {
      /* `packages/mcp/src/index.ts`: `TOOLS` holds sixteen entries, nine carrying `writes: false`. `triage` joined last
         (`loop/finish/contracts.md` §6.2). */
      title: 'Sixteen tools, and nine of them only read.',
      lead: 'An agent reads the record the way a person does, and what it writes lands as an event carrying its name. Nothing here is a separate copy of your data.',
      readsTitle: 'Read',
      reads: ['record_index', 'context', 'schema', 'get', 'list', 'search', 'history', 'activity', 'governance'],
      writesTitle: 'Write',
      writes: ['propose', 'create', 'update', 'log', 'handoff', 'meet', 'triage'],
      /* `TEMPLATES` in the same file; `test/content.test.ts` holds this list and its count to it. */
      resourcesTitle: 'Seven resources a client can read directly',
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

    report: {
      title: 'Let a project report its own numbers.',
      lead: 'A report key can only add rows to one list, with fields you fix when you create it. It cannot read anything, so it is safe to put in a CI job or on a server.',
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

    cannot: {
      title: 'What only a person can do.',
      lead: 'Whatever key an agent holds, these need somebody signed in to the app.',
      rows: [
        { what: 'Answer a decision', said: 'Deciding needs a person, signed in. No token reaches it.' },
        { what: 'Invite anybody', said: 'An invitation, a new token, an export and the list of vault grants all need a browser session.' },
        { what: 'Read a secret', said: 'The record indexes what a key opens, never the key. A value leaves the vault for one call and is never written down.' },
      ],
    },
  },
} as const;
