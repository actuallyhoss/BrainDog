/**
 * THE AGENTS PAGE IN TWO PARTS (the Agents page of 24 Nov: "the whole agents tab, agent communication, all that; is
 * horrendous"). The page the agents add-on declares holds everything about agents: the box to tell one and the
 * conversations, who is working, what is up next, the runs, the share accepted unchanged, the doors to the lists the
 * agents keep, and whatever an add-on puts there (Profiles). What he comes for is the first three; the rest is looked
 * up now and then.
 *
 * SO THE PAGE IS DRAWN AS TWO, FROM ONE READ, AND NOTHING IS DECLARED AGAIN. `/p/agents` draws the conversations in the
 * main column and Working now and Up next in a rail beside them, with one quiet link at the rail's foot; `/p/agents?more`
 * draws everything else under its own title, Runs and setup, with the way back to Agents. A block an add-on adds to the
 * page lands on Runs and setup, since only the three parts he acts on are the page's lead.
 *
 * THE PAGE IS KNOWN BY WHAT IT DRAWS, never by its slug, as the route knows it (`plainHead`): the page whose sections
 * are the composer and the run list (`panel: instruct` and `panel: run-list`).
 *
 * PURE, so `node --test` reads it (`console.test.ts`).
 */

/** The query that opens the second part. */
export const MORE = 'more';

/** The second part's name, which the link to it and its head say. */
export const MORE_TITLE = 'Runs and setup';

/** The words of the one quiet link from the page to its second part. */
export const MORE_LINK = 'Runs, learnings, skills, tools and keys';

/** The three parts he acts on, by the panel each section draws, in the order the page draws them. */
const LEAD = ['instruct', 'presence', 'left-steps'] as const;

/** The panels the page goes in the rail beside the conversations. */
const RAIL = new Set<string>(['presence', 'left-steps']);

/** The rail's width in twelfths: the conversations take two thirds of a laptop, who is working the third beside. */
const RAIL_WIDTH = 4;

type Block = { kind: string; panel?: unknown; heading?: unknown; key?: unknown; body?: unknown } & Record<string, unknown>;

const panelOf = (b: Block): string | null => (b.kind === 'section' && typeof b.panel === 'string' ? b.panel : null);

/** Whether a page's blocks are the Agents page's: the box to tell an agent and the list of runs. */
export function isConsole(blocks: readonly object[]): boolean {
  const panels = new Set((blocks as Block[]).map(panelOf));
  return panels.has('instruct') && panels.has('run-list');
}

/** The doors to what the agents keep, each a row a `link` block writes out: its words, where it goes, and a note. */
export const DOORS: readonly (readonly [string, string, string])[] = [
  ['Learnings', '/r/learnings', 'What agents found out the hard way'],
  ['Skills', '/r/skills', 'What a session can do here'],
  ['Tools', '/r/tools', 'MCP servers, command lines and integrations'],
  ['Keys', '/keychain', 'The keys agents are handed'],
  ['What changed', '/p/brain', 'How learnings and skills changed over time'],
  ['Everything you told agents', '/r/instructions', 'Every instruction, finished ones too'],
  ['All agent runs', '/r/session', 'Every session, open and ended'],
  ['Automations', '/automations', 'What runs by itself, and when'],
];

/**
 * The blocks one part draws, and the page's layout for it.
 *
 *   - `lead`: the composer and the conversations, then Working now and Up next in the rail, then the one link.
 *   - `more`: the runs, the doors to what the agents keep, then every other block the page holds, in its own order.
 */
/**
 * A BLOCK OF THE PAGE'S OWN SHAPE, for one the page did not answer: a drawn block carries what the record answers with
 * every block (its refusals, rows, columns and matches), and one missing them stops the page drawing. The page's own
 * line of doors is the shape, its words and conditions taken off.
 */
function shapeOf(all: readonly Block[]): Block {
  const base = all.find((b) => b.key === 'brain-link') ?? all.find((b) => b.kind === 'note') ?? null;
  const { body: _body, when: _when, values: _values, says_at: _says, tone: _tone, key: _key, heading: _heading, icon: _icon, ...rest } = base ?? ({ kind: 'note' } as Block);
  return { refusals: [], rows: [], columns: [], entries: [], matched: 0, ...rest, kind: 'note' };
}

export function consoleOf<B extends object>(blocks: readonly B[], part: 'lead' | 'more', href: string): { blocks: B[]; layout: { rail: number; sticky: boolean } | null } {
  const all = blocks as unknown as Block[];
  const shape = shapeOf(all);
  if (part === 'lead') {
    const lead = LEAD.flatMap((p) => all.filter((b) => panelOf(b) === p)).map((b): Block => (RAIL.has(panelOf(b)!) ? { ...b, area: 'rail', span: 12 } : { ...b, span: 12 }));
    const link: Block = { ...shape, kind: 'note', key: 'agents-more', span: 12, area: 'rail', body: `[${MORE_LINK}](${href}?${MORE})` };
    return { blocks: [...lead, link] as unknown as B[], layout: { rail: RAIL_WIDTH, sticky: false } };
  }
  /* THE OLD LINE OF DOORS GOES: the doors are a list of their own here, each with what it holds. */
  const rest = all.filter((b) => {
    const p = panelOf(b);
    return !(p !== null && (LEAD as readonly string[]).includes(p)) && b.key !== 'brain-link';
  });
  /* WRITTEN OUT, as a declared link block is (`authored`), which the record answers with no rows of its own. */
  const doors: Block = { ...shape, kind: 'link', key: 'agent-doors', heading: 'What your agents keep', icon: 'learning', span: 12, authored: DOORS.map((d) => ({ cells: [...d] })) };
  /* THE RUNS LEAD, what he comes here for most; the doors follow them, and whatever else the page holds after. */
  const runs = rest.filter((b) => panelOf(b) === 'run-list');
  return { blocks: [...runs, doors, ...rest.filter((b) => !runs.includes(b))] as unknown as B[], layout: null };
}
