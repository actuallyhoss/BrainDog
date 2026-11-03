/**
 * WHAT AN ADD-ON LETS PEOPLE AND AGENTS DO WITH IT: `tools` an agent calls, `commands` in the app's command bar, and
 * `row_actions` on a list's rows (add-ons phase 3, lane C). Each is a line in the manifest that points at one of the
 * add-on's own scripts, so the code that runs is always a `script` declaration: checked by the kernel, shown whole on
 * the plan, held to its own `egress`, `keys`, `reads` and `writes` in the sandbox. These keys add no authority of
 * their own; they say who may start a script and with what input.
 *
 * A SCRIPT SAYS IT MAY BE STARTED THIS WAY (`runs: { tool: true }`, `{ command: true }`, `{ row: true }`), as a rule's
 * script says `runs: { rule: true }`, so a script written for a clock cannot be called by an agent because a manifest
 * line named it. And a tool whose script writes says `writes: true`, so the plan can say "and may change" before the
 * person agrees, and the record holds its writes to the caller's own rung.
 *
 * READ HERE, BESIDE THE DECLARATIONS, because each line is checked against the script it names. Kept in the manifest
 * and so in the checksum.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** The most of each one add-on may carry. */
export const PACK_TOOLS_MOST = 8;
export const PACK_COMMANDS_MOST = 12;
export const PACK_ROW_ACTIONS_MOST = 8;
const TAKES_MOST = 12;
const ASKS_MOST = 6;

/** What a tool's argument is: words, a whole number, or any JSON. */
export const TOOL_ARG_TYPES = ['text', 'integer', 'json'] as const;
export type ToolArgType = (typeof TOOL_ARG_TYPES)[number];
/** What a command asks the person for before it runs. */
export const COMMAND_ASK_TYPES = ['text', 'integer', 'day'] as const;
export type CommandAskType = (typeof COMMAND_ASK_TYPES)[number];

/** One tool an add-on gives the record's agents, reached as `act {call: "addon.<id>.<name>"}`. */
export type PackTool = { name: string; says: string; takes?: Record<string, ToolArgType>; script: string; writes?: true };
/** One entry an add-on puts in the command bar: it opens one of its pages, or runs one of its scripts. */
export type PackCommand = { id: string; title: string; opens?: string; runs?: string; asks?: { id: string; label: string; type: CommandAskType }[] };
/** One action on the rows of a list: its script is handed the row. */
export type PackRowAction = { list: string; title: string; script: string };

export type PackActions = { tools?: PackTool[]; commands?: PackCommand[]; row_actions?: PackRowAction[] };

/** The add-on's own declarations, as the reader needs them: id, kind and body. */
type Decl = { kind: string; id: string; body: Record<string, unknown> };

const NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
const ARG = /^[a-z][a-z0-9_]{0,31}$/u;
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const line = (v: unknown, most: number): string | null => (typeof v === 'string' && v.trim() !== '' && [...v.trim()].length <= most ? v.trim().replace(/\s+/gu, ' ') : null);

/** A script of this add-on by its bare name, with what it says about how it runs and what it writes. */
function scriptNamed(decls: readonly Decl[], name: unknown): { runs: Record<string, unknown>; writes: string[]; reads: string[] } | null {
  if (typeof name !== 'string') return null;
  const d = decls.find((x) => x.kind === 'script' && x.id === `script.${name}`);
  if (d === undefined) return null;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  return { runs: isMap(d.body.runs) ? d.body.runs : {}, writes: strings(d.body.writes), reads: strings(d.body.reads) };
}

/**
 * The manifest's `tools`, `commands` and `row_actions`, read and held to the scripts and pages the file declares. Absent
 * keys read as nothing. A refusal names the key and says the fix.
 */
export function readPackActions(doc: Record<string, unknown>, decls: readonly Decl[]): Result<PackActions> {
  const out: PackActions = {};
  const bad = (fix: string, at: string): Result<PackActions> => no('VALUE_MALFORMED', fix, { at });

  if (doc.tools !== undefined) {
    const raw = doc.tools;
    if (!Array.isArray(raw) || raw.length > PACK_TOOLS_MOST) return bad(`tools is a list of at most ${PACK_TOOLS_MOST} tools.`, 'tools');
    const tools: PackTool[] = [];
    for (const [i, t] of raw.entries()) {
      const at = `tools.${i}`;
      if (!isMap(t) || Object.keys(t).some((k) => !['name', 'says', 'takes', 'script', 'writes'].includes(k)))
        return bad('A tool is { name, says, takes?, script, writes? } and nothing else.', at);
      if (typeof t.name !== 'string' || !NAME.test(t.name)) return bad('A tool is named in lower case, digits, - and _, at most 32, as in find-film.', `${at}.name`);
      if (tools.some((o) => o.name === t.name)) return bad(`Two tools are both called ${t.name}.`, `${at}.name`);
      const says = line(t.says, 200);
      if (says === null) return bad('A tool says what it does for an agent, in at most 200 characters.', `${at}.says`);
      let takes: Record<string, ToolArgType> | undefined;
      if (t.takes !== undefined) {
        if (!isMap(t.takes) || Object.keys(t.takes).length > TAKES_MOST)
          return bad(`takes maps each argument to text, integer or json, at most ${TAKES_MOST}.`, `${at}.takes`);
        takes = {};
        for (const [arg, type] of Object.entries(t.takes)) {
          if (!ARG.test(arg)) return bad(`${arg} is not an argument name: lower case, digits and _.`, `${at}.takes.${arg}`);
          if (!(TOOL_ARG_TYPES as readonly unknown[]).includes(type)) return bad(`${arg} is text, integer or json.`, `${at}.takes.${arg}`);
          takes[arg] = type as ToolArgType;
        }
      }
      const s = scriptNamed(decls, t.script);
      if (s === null) return bad(`${t.name} runs ${String(t.script)}, and a tool runs one of this add-on's own scripts, by its name.`, `${at}.script`);
      if (s.runs.tool !== true) return bad(`${t.name} runs ${String(t.script)}, which does not say an agent may start it. Add tool: true to its runs.`, `${at}.script`);
      if (t.writes !== undefined && t.writes !== true && t.writes !== false) return bad('writes is true when the tool changes rows, and left out when it only reads.', `${at}.writes`);
      if (s.writes.length > 0 && t.writes !== true)
        return bad(`${t.name}'s script writes to ${s.writes.join(', ')}. Say writes: true on the tool, so the person is told it changes rows.`, `${at}.writes`);
      tools.push({ name: t.name, says, ...(takes === undefined ? {} : { takes }), script: String(t.script), ...(t.writes === true ? { writes: true as const } : {}) });
    }
    if (tools.length > 0) out.tools = tools;
  }

  if (doc.commands !== undefined) {
    const raw = doc.commands;
    if (!Array.isArray(raw) || raw.length > PACK_COMMANDS_MOST) return bad(`commands is a list of at most ${PACK_COMMANDS_MOST} commands.`, 'commands');
    const commands: PackCommand[] = [];
    for (const [i, c] of raw.entries()) {
      const at = `commands.${i}`;
      if (!isMap(c) || Object.keys(c).some((k) => !['id', 'title', 'opens', 'runs', 'asks'].includes(k)))
        return bad('A command is { id, title, opens? or runs?, asks? } and nothing else.', at);
      if (typeof c.id !== 'string' || !NAME.test(c.id)) return bad('A command id is lower case, digits, - and _, at most 32.', `${at}.id`);
      if (commands.some((o) => o.id === c.id)) return bad(`Two commands are both called ${c.id}.`, `${at}.id`);
      const title = line(c.title, 60);
      if (title === null) return bad('A command has a title of at most 60 characters, as the command bar shows it.', `${at}.title`);
      if ((c.opens === undefined) === (c.runs === undefined)) return bad('A command either opens one of its pages (opens: page.<slug>) or runs one of its scripts (runs: <script>).', at);
      if (c.opens !== undefined) {
        if (typeof c.opens !== 'string' || !decls.some((d) => d.kind === 'page' && d.id === c.opens))
          return bad(`${c.id} opens ${String(c.opens)}, and a command opens a page this add-on declares, as page.<slug>.`, `${at}.opens`);
        if (c.asks !== undefined) return bad('A command that opens a page asks nothing; asks goes with runs.', `${at}.asks`);
      }
      if (c.runs !== undefined) {
        const s = scriptNamed(decls, c.runs);
        if (s === null) return bad(`${c.id} runs ${String(c.runs)}, and a command runs one of this add-on's own scripts, by its name.`, `${at}.runs`);
        if (s.runs.command !== true) return bad(`${c.id} runs ${String(c.runs)}, which does not say the command bar may start it. Add command: true to its runs.`, `${at}.runs`);
      }
      let asks: PackCommand['asks'];
      if (c.asks !== undefined) {
        if (!Array.isArray(c.asks) || c.asks.length > ASKS_MOST) return bad(`asks is a list of at most ${ASKS_MOST} questions.`, `${at}.asks`);
        asks = [];
        for (const [j, q] of c.asks.entries()) {
          const here = `${at}.asks.${j}`;
          if (!isMap(q) || typeof q.id !== 'string' || !ARG.test(q.id)) return bad('A question is { id, label, type } with an id in lower case, digits and _.', here);
          const label = line(q.label, 60);
          if (label === null) return bad('A question has a label of at most 60 characters.', `${here}.label`);
          const type = q.type ?? 'text';
          if (!(COMMAND_ASK_TYPES as readonly unknown[]).includes(type)) return bad('A question is text, integer or day.', `${here}.type`);
          if (asks.some((o) => o.id === q.id)) return bad(`Two questions are both called ${q.id}.`, `${here}.id`);
          asks.push({ id: q.id, label, type: type as CommandAskType });
        }
      }
      commands.push({ id: c.id, title, ...(typeof c.opens === 'string' ? { opens: c.opens } : {}), ...(typeof c.runs === 'string' ? { runs: c.runs } : {}), ...(asks === undefined || asks.length === 0 ? {} : { asks }) });
    }
    if (commands.length > 0) out.commands = commands;
  }

  if (doc.row_actions !== undefined) {
    const raw = doc.row_actions;
    if (!Array.isArray(raw) || raw.length > PACK_ROW_ACTIONS_MOST) return bad(`row_actions is a list of at most ${PACK_ROW_ACTIONS_MOST} actions.`, 'row_actions');
    const actions: PackRowAction[] = [];
    for (const [i, a] of raw.entries()) {
      const at = `row_actions.${i}`;
      if (!isMap(a) || Object.keys(a).some((k) => !['list', 'title', 'script'].includes(k))) return bad('A row action is { list, title, script } and nothing else.', at);
      const m = typeof a.list === 'string' ? /^register\.([a-z][a-z0-9_]*)$/u.exec(a.list) : null;
      if (m === null) return bad('A row action names its list as register.<id>.', `${at}.list`);
      const title = line(a.title, 40);
      if (title === null) return bad('A row action has a title of at most 40 characters, as the row menu shows it.', `${at}.title`);
      const s = scriptNamed(decls, a.script);
      if (s === null) return bad(`${title} runs ${String(a.script)}, and a row action runs one of this add-on's own scripts, by its name.`, `${at}.script`);
      if (s.runs.row !== true) return bad(`${title} runs ${String(a.script)}, which does not say a row may start it. Add row: true to its runs.`, `${at}.script`);
      const bare = m[1]!;
      const own = decls.some((d) => d.kind === 'register' && d.id === `register.${bare}`);
      if (!own && !s.reads.includes(bare) && !s.writes.includes(bare))
        return bad(`${title} is on ${a.list}, which ${String(a.script)} neither reads nor writes. Name the list in its reads or writes.`, `${at}.list`);
      if (actions.some((o) => o.script === a.script && o.list === a.list)) return bad(`${String(a.script)} is already an action on ${a.list}.`, at);
      actions.push({ list: a.list as string, title, script: String(a.script) });
    }
    if (actions.length > 0) out.row_actions = actions;
  }
  return ok(out);
}
