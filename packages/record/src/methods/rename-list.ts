/**
 * `renameList({ list, name, one? })`: the owner gives one list a new name after setup, as setup's own `names` does at
 * the start (`arrange.ts` `placedSettings`). One call for every caller: Slash's "rename this list to Shops", the first
 * run's drafts ("You call your people Clients"), Settings > Words and an agent on his word.
 *
 * THE NAME GOES WHERE THE RECORD ALREADY KEEPS IT. A list the speaking use case names (`label_<list>`, and `one_<list>`
 * for what one of them is called) is renamed by that setting, so the add-on's declaration is untouched and keeps taking
 * its updates; that is the word every screen draws. A list no use case names has its own name changed, the one
 * declaration rewritten with nothing else in it touched, as Settings' "rename a list" did through Decide.
 *
 * UNDO IS THE SAME CALL WITH THE OLD NAME, which the answer carries as `was`. Owner's, in a browser, as every write to
 * what the record is called is.
 */

import { SPEAKS, labelSetting, speakingPack } from '@braindog/declare';
import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** The longest name a list takes: the nav's own label ceiling (`LABEL_MOST`), so a rail never cuts it. */
export const LIST_NAME_MOST = 40;

/** What a rename answers: the name it had, the one it has now, and where the record kept it. */
export type ListRenamed = { list: string; was: string; name: string; one: string | null; kept: 'words' | 'list'; said: string };

const fold = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/gu, ' ').trim();

export function methods(deps: RecordDeps) {
  const { kernel, admin, no, tail } = deps;

  /** The use case this record speaks in, as the voice rule reads it (`arrange.ts` `speakingNow`). */
  const speaker = (): string | null =>
    speakingPack(
      kernel.packStates().map((p) => {
        if (!p.id.startsWith('usecase-')) return { id: p.id, disabled_at: p.disabled_at };
        const read = kernel.packConfig(p.id);
        const said = read.ok ? read.value.values[SPEAKS] : null;
        return { id: p.id, disabled_at: p.disabled_at, speaks: typeof said === 'boolean' ? said : null };
      }),
    );

  return {
    async renameList(args: { list?: unknown; name?: unknown; one?: unknown } | undefined, ctx: CallContext): Promise<Result<ListRenamed>> {
      const stop = admin(ctx, 'rename a list');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const stray = Object.keys(said).find((k) => !['list', 'name', 'one'].includes(k));
      if (stray !== undefined) return no('FIELD_UNKNOWN', `${stray} is not something this call takes. It takes list, name and one.`, { at: stray, allowed: ['list', 'name', 'one'] });
      const list = typeof said.list === 'string' ? said.list.trim() : '';
      if (list === '') return no('REQUIRED_MISSING', 'list is the list to rename, by its id, such as projects.', { at: 'list' });
      const decl = kernel.register(list);
      if (!decl) return no('DECLARATION_UNKNOWN', `There is no list called ${list} here.`, { at: 'list' });
      const name = typeof said.name === 'string' ? said.name.replace(/\s+/gu, ' ').trim() : '';
      if (name === '' || [...name].length > LIST_NAME_MOST) return no('VALUE_MALFORMED', `name is what to call the list, a word or a few, at most ${LIST_NAME_MOST} characters.`, { at: 'name' });
      const one = typeof said.one === 'string' && said.one.trim() !== '' ? said.one.replace(/\s+/gu, ' ').trim().slice(0, LIST_NAME_MOST) : null;

      /* THE NAME IT GOES BY NOW: the speaking use case's word for it where one is set, else its own. */
      const who = speaker();
      const read = who === null ? null : kernel.packConfig(who);
      const config = read?.ok ? read.value : null;
      const key = labelSetting(list);
      const worded = config !== null && Object.hasOwn(config.config, key);
      const held = worded ? config!.values[key] : undefined;
      const was = typeof held === 'string' && held.trim() !== '' ? held.trim() : decl.name;
      if (was === name && one === null) return no('VALUE_MALFORMED', `${name} is its name already.`, { at: 'name' });

      /* NO TWO LISTS ONE NAME: the rail and every sentence would name two things alike. */
      const other = [...kernel.registers().values()].find((r) => r.id !== list && fold(r.name) === fold(name));
      if (other) return no('VALUE_MALFORMED', `There is already a list called ${other.name}. Pick another name.`, { at: 'name' });

      if (worded && who !== null) {
        const oneKey = labelSetting(`${list}:one`);
        const values: Record<string, string> = { [key]: name, ...(one !== null && Object.hasOwn(config!.config, oneKey) ? { [oneKey]: one } : {}) };
        const out = kernel.setPackConfig(who, values, { actor: ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id });
        await tail(out);
        if (!out.ok) return out as Result<never>;
        return ok({ list, was, name, one, kept: 'words', said: `${was} is called ${name} now.` });
      }

      /* NO USE CASE NAMES IT: the list's own declaration, its name and nothing else, at the version it was read at. */
      const row = kernel.declarations().find((d) => d.kind === 'register' && d.id === `register.${list}`);
      if (!row) return no('DECLARATION_UNKNOWN', `There is no list called ${list} here.`, { at: 'list' });
      const body = { ...(JSON.parse(row.body) as Record<string, unknown>), name, ...(one !== null ? { one } : {}) };
      const out = await kernel.install([{ id: row.id, kind: 'register', body: body as never }], { id: row.id, version: row.version }, { actor: ctx.principal.kind === 'token' ? ctx.principal.person : ctx.principal.id });
      await tail(out);
      if (!out.ok) return out as Result<never>;
      return ok({ list, was, name, one, kept: 'list', said: `${was} is called ${name} now.` });
    },
  };
}
