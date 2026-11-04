/**
 * What an installed add-on lets people and agents start (add-ons phase 3, lane C): `addonActions` reads every tool,
 * command and row action of the add-ons that are on, and `addonTool` starts one: an agent's tool with its arguments, a
 * command from the command bar with what it asked, or a row action with its row.
 *
 * THE CODE IS ALWAYS ONE OF THE ADD-ON'S OWN SCRIPTS, THE VERSION THE PERSON APPROVED, run now in the host's sandbox
 * through the same trial path `scriptTry` takes (`tryScript`), so every rule of a scheduled run holds: its own egress,
 * its own keys sent only to the host each opens, its ceilings, the plan's allowance and the meter. A script declares
 * `runs: { tool | command | row: true }` before anything may start it this way (`pack-actions.ts` in declare).
 *
 * THE KEYS IT DECLARED OPEN, AS ON ITS CLOCK. The owner approved, at install, this script sending this key to this host,
 * and a door lets anybody on the internet start a script that does exactly that, so an agent of the person's starting
 * it is no wider. What is narrower here is sight: the script reads through the caller's own `list` and `get`, held to
 * its `reads:` (`scriptReadsAs`), so a tool shows an agent nothing that agent could not read itself.
 *
 * ITS WRITES ARE THE CALLER'S. Nothing the sandbox asks for is applied as the script: each create and update goes
 * through the record's own `create` and `update` under the caller's context, so a token's write meets its rung (filed
 * as a question where the ladder says so) and a person's lands as theirs, with the Undo every write has. A tool that
 * did not say `writes: true` declared no writes, so the sandbox refuses any.
 */

import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** The longest answer a tool hands back, as JSON. Past it the agent is told to ask for less. */
const ANSWER_MOST = 16_000;
/**
 * THE MOST TIMES AGENTS MAY START ONE ADD-ON'S TOOLS IN A DAY (UTC), all its tools together. A run spends one of the
 * plan's runs and may call out, so an agent caught in a loop stops here long before the month is spent. The person's
 * own commands and row actions are not counted.
 */
export const AGENT_TOOL_RUNS_PER_DAY = 200;
/** Where the day's count is kept, by add-on id: `{ day, n }`. */
const TOOL_RUNS_HOLDER = 'braindog:addon-tool-runs';

/** One installed add-on that is on, with what its manifest gives. */
type Held = { id: string; title: string; tools: Body[]; commands: Body[]; row_actions: Body[] };

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no } = deps;

  /** Every add-on that is on, with its tools, commands and row actions, read off the manifest this record stores. */
  const heldOn = (): Held[] =>
    sql.all<{ id: string; manifest: string }>('SELECT id, manifest FROM pack WHERE disabled_at IS NULL ORDER BY id').flatMap((r) => {
      let m: unknown;
      try {
        m = JSON.parse(r.manifest);
      } catch {
        return [];
      }
      if (!isMap(m)) return [];
      const of = (key: string): Body[] => (Array.isArray(m[key]) ? (m[key] as unknown[]).filter(isMap) : []);
      const held: Held = { id: r.id, title: text(m.title) ?? r.id, tools: of('tools'), commands: of('commands'), row_actions: of('row_actions') };
      return held.tools.length + held.commands.length + held.row_actions.length > 0 ? [held] : [];
    });

  /** The live script an add-on owns, by its bare name: its body and version, or `null`. */
  const scriptOf = (pack: string, name: string): { body: Body; version: number } | null => {
    const row = sql.one<{ version: number; body: string; owner: string | null }>(
      `SELECT version, body, coalesce(pack_id, json_extract(body, '$.pack')) AS owner FROM declaration
        WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0`,
      `script.${name}`,
    );
    if (!row || row.owner !== pack) return null;
    try {
      const body = JSON.parse(row.body) as unknown;
      return isMap(body) ? { body, version: row.version } : null;
    } catch {
      return null;
    }
  };

  /** A list's words for the person: its name, else its id with spaces. */
  const listWords = (register: string): string => {
    const bare = register.replace(/^register\./u, '');
    return kernel.register(bare)?.name ?? bare.replace(/_/gu, ' ');
  };

  /** Arguments held to what a tool takes: no stranger, each of its type. A refusal names the argument. */
  const argsFault = (takes: Body, given: Body): { code: string; fix: string; at: string } | null => {
    for (const [k, v] of Object.entries(given)) {
      const type = takes[k];
      if (type === undefined) return { code: 'FIELD_UNKNOWN', fix: `${k} is not something this tool takes. It takes ${Object.keys(takes).join(', ') || 'nothing'}.`, at: `args.${k}` };
      if (type === 'text' && typeof v !== 'string') return { code: 'VALUE_MALFORMED', fix: `${k} is text.`, at: `args.${k}` };
      if (type === 'integer' && !Number.isSafeInteger(v)) return { code: 'VALUE_MALFORMED', fix: `${k} is a whole number.`, at: `args.${k}` };
    }
    return null;
  };

  return {
    /**
     * Every tool, command and row action of the add-ons that are on. `{ list? }` keeps the row actions to one list.
     * A row action on a list the caller cannot read is left out.
     */
    async addonActions(args: { list?: unknown } | undefined, ctx: CallContext): Promise<Result<unknown>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Body;
      const extra = Object.keys(said).find((k) => k !== 'list');
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes list.`, { at: extra, allowed: ['list'] });
      const only = text(said.list)?.replace(/^register\./u, '') ?? null;
      const held = heldOn();
      const tools = held.flatMap((h) =>
        h.tools.map((t) => ({ call: `addon.${h.id}.${String(t.name)}`, addon: h.id, addon_title: h.title, name: String(t.name), says: String(t.says ?? ''), takes: isMap(t.takes) ? t.takes : {}, writes: t.writes === true })),
      );
      const commands = held.flatMap((h) =>
        h.commands.map((c) => ({ addon: h.id, addon_title: h.title, id: String(c.id), title: String(c.title ?? c.id), ...(typeof c.opens === 'string' ? { opens: c.opens } : {}), ...(Array.isArray(c.asks) ? { asks: c.asks.filter(isMap) } : {}) })),
      );
      const rowActions = held.flatMap((h) =>
        h.row_actions.flatMap((a) => {
          const bare = String(a.list ?? '').replace(/^register\./u, '');
          if (only !== null && bare !== only) return [];
          if (deps.readable(ctx, bare) !== null) return [];
          return [{ addon: h.id, addon_title: h.title, list: bare, list_name: listWords(bare), title: String(a.title ?? a.script), script: String(a.script) }];
        }),
      );
      return { ok: true, value: { tools, commands, row_actions: rowActions } };
    },

    /**
     * Start one: `{ addon, tool, args? }` an agent's tool; `{ addon, command, values? }` a command; `{ addon, action,
     * row }` a row action, `action` its script's name and `row` the row's spoken id. A command that opens a page answers
     * `{ opens }` and runs nothing. Answers what the script said (`answer`), its log, and each write as the record took it.
     */
    async addonTool(args: Body | undefined, ctx: CallContext): Promise<Result<unknown>> {
      const stop = guard(ctx, 'propose');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Body;
      const takes = ['addon', 'tool', 'args', 'command', 'values', 'action', 'row'];
      const extra = Object.keys(said).find((k) => !takes.includes(k));
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${takes.join(', ')}.`, { at: extra, allowed: takes });
      const addon = text(said.addon);
      if (addon === null) return no('REQUIRED_MISSING', 'addon is the id of the plugin, as addonActions lists it.', { at: 'addon' });
      const held = heldOn().find((h) => h.id === addon);
      if (held === undefined) return no('NOT_FOUND', `No plugin called ${addon} is on here with a tool, a command or a row action. addonActions lists what is.`, { at: 'addon' });
      const asked = [said.tool, said.command, said.action].filter((v) => v !== undefined).length;
      if (asked !== 1) return no('VALUE_MALFORMED', 'Say one of tool, command or action.', { at: 'tool' });

      let script: string;
      let input: unknown;
      let started: string;
      let writesAllowed = true;
      if (said.tool !== undefined) {
        const tool = held.tools.find((t) => t.name === said.tool);
        if (tool === undefined) return no('NOT_FOUND', `${held.title} has no tool called ${String(said.tool)}. It has ${held.tools.map((t) => String(t.name)).join(', ') || 'none'}.`, { at: 'tool' });
        const given = said.args ?? {};
        if (!isMap(given)) return no('VALUE_MALFORMED', "args is an object of the tool's own arguments.", { at: 'args' });
        const bad = argsFault(isMap(tool.takes) ? tool.takes : {}, given);
        if (bad) return no(bad.code, bad.fix, { at: bad.at });
        script = String(tool.script);
        input = given;
        started = `tool ${String(tool.name)}`;
        writesAllowed = tool.writes === true;
      } else if (said.command !== undefined) {
        const command = held.commands.find((c) => c.id === said.command);
        if (command === undefined) return no('NOT_FOUND', `${held.title} has no command called ${String(said.command)}.`, { at: 'command' });
        if (typeof command.opens === 'string') return { ok: true, value: { addon, command: command.id, opens: command.opens, say: `Opens ${command.opens.replace(/^page\./u, '')}.` } };
        const values = said.values ?? {};
        if (!isMap(values)) return no('VALUE_MALFORMED', 'values is an object of the answers to what the command asks.', { at: 'values' });
        const qs = (Array.isArray(command.asks) ? command.asks : []).filter(isMap);
        const stray = Object.keys(values).find((k) => !qs.some((q) => q.id === k));
        if (stray !== undefined) return no('FIELD_UNKNOWN', `${stray} is not something this command asks.`, { at: `values.${stray}` });
        script = String(command.runs);
        input = values;
        started = `command ${String(command.title ?? command.id)}`;
      } else {
        const action = held.row_actions.find((a) => a.script === said.action);
        if (action === undefined) return no('NOT_FOUND', `${held.title} has no row action that runs ${String(said.action)}.`, { at: 'action' });
        const spoken = text(said.row);
        if (spoken === null) return no('REQUIRED_MISSING', 'row is the spoken id of the row the action is on.', { at: 'row' });
        const bare = String(action.list).replace(/^register\./u, '');
        if (!deps.scriptReadsAs) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot start a plugin yet.');
        script = String(action.script);
        let row: unknown;
        try {
          row = await deps.scriptReadsAs(script, [bare], ctx).get(spoken);
        } catch (e) {
          return no('NOT_FOUND', e instanceof Error ? e.message : String(e), { at: 'row' });
        }
        if (!isMap(row) || row.register !== bare) return no('NOT_FOUND', `${spoken} is not a row of ${listWords(bare)} you can see.`, { at: 'row' });
        input = { row };
        started = `action ${String(action.title)}`;
      }

      const live = scriptOf(addon, script);
      if (live === null) return no('NOT_FOUND', `${held.title}'s script ${script} is not installed here any more. Reinstall the plugin.`, { at: 'addon' });
      if (sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", script)?.state === 'paused')
        return no('RUN_PAUSED', `${held.title}'s ${script} is paused, so nothing ran. Resume it on the Scripts page.`, { at: 'addon' });
      if (!deps.tryScript || !deps.scriptReadsAs || !deps.writeAs) return no('NOT_IN_THIS_BUILD', 'This BrainDog cannot start a plugin yet, so nothing ran.');

      const who = kernel.identity();
      const p = ctx.principal as { kind: string; id?: string; person?: string };
      /* AN AGENT'S TOOL RUNS ARE COUNTED BY THE DAY, per add-on, before the run, so a refused or failed one counts too. */
      if (p.kind === 'token' && said.tool !== undefined) {
        const day = new Date(deps.clock.now()).toISOString().slice(0, 10);
        const was = kernel.prefsOf(TOOL_RUNS_HOLDER)[addon] as { day?: unknown; n?: unknown } | undefined;
        const n = was !== undefined && was !== null && was.day === day && typeof was.n === 'number' ? was.n : 0;
        if (n >= AGENT_TOOL_RUNS_PER_DAY)
          return no(
            'RATE_LIMITED',
            `Agents have started ${held.title}'s tools ${AGENT_TOOL_RUNS_PER_DAY} times today, which is as many as one plugin gets in a day, so nothing ran. They can again tomorrow. If something is calling it over and over, stop it.`,
            { at: 'tool' },
          );
        kernel.setPref(TOOL_RUNS_HOLDER, addon, { day, n: n + 1 });
      }
      const body = live.body;
      const config = ((r) => (r.ok ? r.value.values : {}))(kernel.packConfig(addon)) as Record<string, never>;
      const ran = (await deps.tryScript({
        record: { id: who?.id ?? 'self', tz: who?.tz ?? 'UTC' },
        body: { ...body, script },
        config,
        input,
        reads: deps.scriptReadsAs(script, strings(body.reads), ctx),
        owner: true,
        stale: false,
        asker: String((p.kind === 'token' ? p.person : p.id) ?? ''),
      })) as Body;

      if (isMap(ran.held)) return no('RATE_LIMITED', `${held.title}'s ${started} did not run: ${String(ran.held.say ?? 'this month’s runs are used up')}.`, { at: 'addon' });
      if (isMap(ran.refused)) return no(String(ran.refused.code ?? 'INTERNAL'), `${held.title}'s ${started} stopped: ${String(ran.refused.why ?? '')}`, { at: 'addon' });
      const writes = Array.isArray(ran.writes) ? ran.writes.filter(isMap) : [];
      if (!writesAllowed && writes.length > 0) return no('FORBIDDEN', `${held.title}'s ${started} asked to change rows, and it did not say it writes, so nothing was changed.`, { at: 'tool' });

      const note = `By ${held.title}'s ${started}.`;
      const wrote: string[] = [];
      const filed: string[] = [];
      const refused: string[] = [];
      for (const w of writes) {
        let out: Result<unknown>;
        if (w.op === 'create') out = await deps.writeAs('create', { register: String(w.register), fields: w.fields, note }, ctx);
        else {
          const row = await deps.writeAs('get', { spoken: String(w.spoken) }, ctx);
          if (!row.ok || !isMap(row.value)) {
            refused.push(`${String(w.spoken)}: not a row you can change.`);
            continue;
          }
          const version = Number.isSafeInteger(w.version) ? { version: w.version as number } : {};
          out = await deps.writeAs('update', { register: row.value.register, seq: row.value.seq, patch: w.patch, note, ...version }, ctx);
        }
        if (!out.ok) {
          refused.push('refusal' in out ? out.refusal.fix : 'refused');
          continue;
        }
        const v = out.value as Body;
        if (isMap(v) && (typeof v.suggestion === 'string' || v.asked === true || typeof v.question === 'string')) filed.push(String(v.question ?? v.suggestion ?? 'a question'));
        else if (isMap(v)) wrote.push(String(v.spoken ?? (v.seq !== undefined ? `${String(v.register)}#${String(v.seq)}` : v.id)));
      }

      let answer: unknown = ran.answer;
      if (answer !== undefined && JSON.stringify(answer).length > ANSWER_MOST) answer = `The answer was over ${ANSWER_MOST} characters, so it is left out. Ask for less.`;
      const log = typeof ran.log === 'string' && ran.log !== '' ? ran.log.slice(0, 4000) : undefined;
      const parts = [
        `${held.title}'s ${started} ran.`,
        ...(wrote.length > 0 ? [`Changed ${wrote.length === 1 ? 'one row' : `${wrote.length} rows`}.`] : []),
        ...(filed.length > 0 ? [`Asked ${filed.length === 1 ? 'one question' : `${filed.length} questions`} on Decide.`] : []),
        ...(refused.length > 0 ? [`${refused.length} ${refused.length === 1 ? 'change was' : 'changes were'} refused: ${refused[0]!}`] : []),
      ];
      return {
        ok: true,
        value: {
          addon,
          ran: started,
          ...(answer === undefined ? {} : { answer }),
          ...(log === undefined ? {} : { log }),
          ...(wrote.length > 0 ? { wrote } : {}),
          ...(filed.length > 0 ? { asked: filed } : {}),
          ...(refused.length > 0 ? { refused } : {}),
          say: parts.join(' '),
        },
      };
    },
  };
}
