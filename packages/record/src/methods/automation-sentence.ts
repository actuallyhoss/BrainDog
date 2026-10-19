/**
 * `automationSentence`: an automation written as a sentence, turned into the body it means, with what it would have done
 * over the last 30 days of real rows. It installs nothing and runs nothing: the person keeps it with a press, which is
 * the ordinary `propose` of the `change` this answers with (`apps/web/.../AutomationSentence.svelte`, or an agent's own).
 *
 * THE RULE PARSER FIRST (`kernel/src/sentence.ts`), THE MODEL ONLY WHEN IT CANNOT READ THE SENTENCE. The model is Slash's
 * described path (`slashDescribed`), an owner's call that spends the month's asks, so a token and a record with no model
 * get the parser's own reason and nothing else is spent.
 *
 * LOOKED OVER THE LAST 30 DAYS BY READING ROWS AS THE CALLER MAY, never by running the body: a list the caller cannot
 * read gives no row, and an arrival is the owner's to read, as the Inbox is.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { evaluate, INBOX_RAW, parseWhere } from '@braindog/where';
import { parseSentence, type Replay, type SentenceParts, type SentenceWorld } from '@braindog/kernel';

import { pathOf, said as saidOf } from '../automations.ts';
import type { CallContext } from '../index.ts';
import { previewerOf } from '../slash.ts';
import type { RecordDeps } from './index.ts';

type Body = Record<string, unknown>;

/** How far back the look goes, and the most rows read and named. */
export const LOOK_DAYS = 30;
const READ_ROWS = 500;
const NAMED = 5;
const SENTENCE_MOST = 600;
const DAY_MS = 86_400_000;

export type Looked = {
  days: number;
  runs: number;
  /** True when more rows matched than were read, so `runs` is a floor. */
  atLeast: boolean;
  sample: string[];
  /** The answer in the words a person reads: "It would have run 4 times in the last 30 days: Rent, Phone." */
  line: string;
};

export type Sentenced = {
  /** The automation's id, bare: `rule.<this>` is what a change names. */
  rule: string;
  /** The sentence in BrainDog's words. */
  said: string;
  by: 'rules' | 'model';
  /** The body as it would install, `rule` being the id asked for. */
  body: Body;
  path: 'inline' | 'run';
  looked: Looked | null;
  /** What to tell the person beside it: what the body cannot do, or why there is no look. */
  notes: string[];
  /** The sentence in pressable pieces, or `null` for one the model wrote, which the rule parser cannot take apart. */
  parts: SentenceParts | null;
};

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

/** An id in the grammar's shape, `[a-z][a-z0-9-]` and thirty-two at most, from the sentence's words. */
export function slugOf(said: string): string {
  const id = said.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  const led = /^[a-z]/u.test(id) ? id : `r-${id}`;
  return led.slice(0, 32).replace(/-+$/u, '') || 'automation';
}

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** What a look says, from how many rows and which. */
export function lookLine(runs: number, atLeast: boolean, sample: readonly string[]): string {
  if (runs === 0) return `It would not have run in the last ${LOOK_DAYS} days.`;
  const times = `${atLeast ? 'at least ' : ''}${runs} time${runs === 1 ? '' : 's'}`;
  return `It would have run ${times} in the last ${LOOK_DAYS} days: ${sample.join(', ')}${runs > sample.length ? ', and more' : ''}.`;
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, scoped, readable, admin, no, clock } = deps;
  const described = (deps as RecordDeps & { slashDescribed?: NonNullable<RecordDeps['slashDescribed']> }).slashDescribed;

  const liveBody = (id: string): Body | undefined => {
    const found = sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1', id)?.body;
    if (found === undefined) return undefined;
    const body: unknown = JSON.parse(found);
    return isObject(body) ? body : undefined;
  };

  /** The lists and doors this caller may name, as the parser reads them. Lists they cannot read are not in it. */
  const worldOf = (ctx: CallContext): SentenceWorld => {
    const lists = [...kernel.registers().values()]
      .filter((r) => readable(ctx, r.id) === null)
      .map((r) => {
        const declared = liveBody(`register.${r.id}`);
        return {
          id: r.id,
          name: r.name,
          one: typeof declared?.one === 'string' ? declared.one : undefined,
          title: r.title,
          state: typeof declared?.state === 'string' ? declared.state : undefined,
          fields: r.fields.filter((f) => f.retired !== true && f.derived !== true).map((f) => ({ id: f.id, type: f.type, label: f.label, values: f.values, labels: f.labels, to: f.to })),
        };
      });
    const doors = sql
      .all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0")
      .flatMap((d) => {
        const body: unknown = JSON.parse(d.body);
        if (!isObject(body)) return [];
        const writes = isObject(body.writes) && typeof body.writes.register === 'string' ? body.writes.register : null;
        if (writes !== null && readable(ctx, writes) !== null) return [];
        const id = d.id.slice('ingest.'.length);
        return [{ id, name: typeof body.name === 'string' ? body.name : id, register: writes }];
      });
    return { lists, doors };
  };

  /** The rows of the last days that the sentence would have acted on, read as the caller reads. */
  const lookAt = (replay: Replay, ctx: CallContext): { looked: Looked | null; note?: string } => {
    const now = clock.now();
    const since = new Date(now - LOOK_DAYS * DAY_MS).toISOString();
    if (replay.kind === 'arrival') {
      if (admin(ctx, 'read the inbox') !== null) return { looked: null, note: 'Only the owner can look back over what arrived.' };
      const filter = parseWhere(replay.where === '' ? undefined : replay.where, INBOX_RAW, { nowMs: now });
      if (filter.bad.length > 0) return { looked: null, note: filter.bad[0]!.fix };
      const rows = sql.all<{ ts: string; channel: string; headers: string | null; body: string | null }>('SELECT ts, channel, headers, body FROM inbox_raw WHERE ts >= ? ORDER BY ts DESC LIMIT ?', since, READ_ROWS);
      const hit: string[] = [];
      let runs = 0;
      for (const r of rows) {
        let headers: Body = {};
        try {
          const parsed: unknown = JSON.parse(r.headers ?? '{}');
          if (isObject(parsed)) headers = parsed;
        } catch {
          headers = {};
        }
        const from = typeof headers.from === 'string' ? headers.from : '';
        const address = /<([^>]+)>/u.exec(from)?.[1] ?? from;
        const fields = {
          channel: r.channel,
          from,
          from_name: from.replace(/<.*$/u, '').replace(/"/gu, '').trim(),
          from_address: address,
          from_domain: address.split('@')[1] ?? '',
          to: typeof headers.to === 'string' ? headers.to : '',
          subject: typeof headers.subject === 'string' ? headers.subject : '',
          body: r.body ?? '',
          state: 'untriaged',
          ts: r.ts,
        };
        if (!evaluate(filter.predicate, fields, INBOX_RAW)) continue;
        runs++;
        if (hit.length < NAMED) hit.push(fields.subject !== '' ? fields.subject : fields.body.slice(0, 40).trim() || 'a message');
      }
      return { looked: { days: LOOK_DAYS, runs, atLeast: rows.length === READ_ROWS, sample: hit, line: lookLine(runs, rows.length === READ_ROWS, hit) } };
    }

    if (readable(ctx, replay.register) !== null) return { looked: null };
    if (/, or /u.test(replay.where)) return { looked: null, note: 'It joins its conditions with "or", so I could not look it back over your rows.' };
    const title = kernel.registers().get(replay.register)?.title;
    const window =
      replay.kind === 'time'
        ? [`${replay.field} after ${day(now - (LOOK_DAYS + 1) * DAY_MS + replay.within * DAY_MS)}`, `${replay.field} before ${day(now + (replay.within + 1) * DAY_MS)}`]
        : [];
    const where = [replay.where, ...window].filter((x) => x !== '').join(', ');
    const got = kernel.list({
      register: replay.register,
      ...(where === '' ? {} : { where }),
      limit: READ_ROWS,
      ...(replay.kind === 'written' && replay.op === 'update' ? { order: [{ field: 'updated_at', dir: 'desc' as const }] } : {}),
      ...(replay.kind === 'written' && replay.op === 'delete' ? { includeDeleted: true } : {}),
      reads: (register: string) => readable(ctx, register) === null,
    });
    if (!got.ok) return { looked: null, note: got.refusal.fix };
    const inWindow = got.value.rows.filter((r) => {
      if (replay.kind === 'time') return true;
      if (replay.op === 'create') return r.created_at >= since;
      if (replay.op === 'update') return r.updated_at >= since && r.updated_at > r.created_at && r.deleted_at === null;
      return r.deleted_at !== null && r.deleted_at >= since;
    });
    const names = inWindow.slice(0, NAMED).map((r) => (title !== undefined && typeof r.fields[title] === 'string' && r.fields[title] !== '' ? (r.fields[title] as string) : r.seq === null ? r.id : `${r.register}#${r.seq}`));
    const atLeast = got.value.rows.length === READ_ROWS && got.value.matched > READ_ROWS;
    return { looked: { days: LOOK_DAYS, runs: inWindow.length, atLeast, sample: names, line: lookLine(inWindow.length, atLeast, names) } };
  };

  /** A replay for a body the model wrote: its list, its first op and a `when` that is a sentence, else none. */
  const replayOfBody = (body: Body): Replay | null => {
    const on = isObject(body.on) ? body.on : {};
    const written = isObject(on.written) ? on.written : null;
    const register = typeof body.register === 'string' ? body.register : typeof written?.register === 'string' ? written.register : null;
    if (register === null || (body.when !== undefined && typeof body.when !== 'string')) return null;
    if (/today|yesterday|tomorrow|[+-]\d+[dwm]\b/u.test(String(body.when ?? ''))) return null;
    const op = Array.isArray(written?.op) && written.op.length === 1 ? written.op[0] : 'create';
    return { kind: 'written', register, op: op === 'update' || op === 'delete' ? op : 'create', where: typeof body.when === 'string' ? body.when : '' };
  };

  return {
    /**
     * An automation written as a sentence: the body it means, the sentence read back in BrainDog's words, and what it
     * would have done over the last 30 days. READ+, routed as a POST though it keeps nothing, as `checkAutomation` is.
     */
    async automationSentence(args: { sentence?: unknown; rule?: unknown } | undefined, ctx: CallContext): Promise<Result<Sentenced>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const given = (args ?? {}) as Body;
      const odd = Object.keys(given).find((k) => k !== 'sentence' && k !== 'rule');
      if (odd !== undefined) return no('FIELD_UNKNOWN', `${odd} is not something this call takes. It takes sentence, rule.`, { at: odd, allowed: ['sentence', 'rule'] });
      if (typeof given.sentence !== 'string' || given.sentence.trim() === '')
        return no('REQUIRED_MISSING', 'sentence is the automation in words, such as "When a bill is due in 3 days, tell me."', { at: 'sentence' });
      if ([...given.sentence].length > SENTENCE_MOST) return no('OUT_OF_BOUNDS', `Say it in at most ${SENTENCE_MOST} characters.`, { at: 'sentence' });
      const asked = typeof given.rule === 'string' && /^[a-z][a-z0-9-]{0,31}$/u.test(given.rule) ? given.rule : null;
      /* A NAME NO RULE HAS EVER HAD, counting retired ones: a change to an id is a change to that rule, not a second one. */
      const fresh = (said: string): string => {
        const base = slugOf(said);
        for (let n = 1; ; n += 1) {
          const id = n === 1 ? base : `${base.slice(0, 32 - String(n).length - 1)}-${n}`;
          if (sql.one('SELECT 1 AS x FROM declaration WHERE id = ?', `rule.${id}`) === undefined) return id;
        }
      };
      let rule = asked ?? 'sentence';

      let by: 'rules' | 'model' = 'rules';
      let body: Body;
      let said: string;
      let replay: Replay | null;
      let notes: string[] = [];
      let parts: SentenceParts | null = null;
      const parsed = parseSentence(given.sentence, worldOf(ctx), rule);
      if (parsed.ok) {
        ({ body, said, replay, notes, parts } = parsed);
        if (asked === null) rule = fresh(said);
        body = { ...body, rule };
      } else {
        /* THE MODEL ONLY WHEN THE PARSER CANNOT, and only for an owner in the app, since it spends the month's asks. */
        if (described === undefined || admin(ctx, 'ask Slash to write an automation') !== null) return no('VALUE_MALFORMED', parsed.why, { at: 'sentence' });
        const drafted = await described({ asked: `Write this as one automation, a rule declaration, and nothing else: ${given.sentence.trim()}` }, ctx, previewerOf(this, ctx));
        if (!drafted.ok) return no('VALUE_MALFORMED', `${parsed.why} ${drafted.refusal.fix}`, { at: 'sentence' });
        const decls = drafted.value.drafts.flatMap((d) => ('declarations' in d.change.to ? d.change.to.declarations : [d.change.to]));
        const made = decls.find((d) => (d as { kind?: unknown }).kind === 'rule') as { body?: unknown } | undefined;
        if (!made || !isObject(made.body)) return no('VALUE_MALFORMED', parsed.why, { at: 'sentence' });
        by = 'model';
        const draft = { ...made.body, rule };
        const read = saidOf(draft);
        said = `${read.trigger}${read.steps.length > 0 ? `, then ${read.steps.join(', then ')}` : ''}.`;
        if (asked === null) rule = fresh(said);
        body = { ...draft, rule, name: said };
        replay = replayOfBody(body);
      }

      const id = `rule.${rule}`;
      const fault = kernel.lint([{ id, kind: 'rule', body: body as never }]);
      if (fault) return { ok: false, refusal: fault };
      const look = replay === null ? null : lookAt(replay, ctx);
      if (look?.note !== undefined) notes = [...notes, look.note];
      return ok({ rule, said, by, body, path: pathOf(body), looked: look?.looked ?? null, notes, parts });
    },
  };
}
