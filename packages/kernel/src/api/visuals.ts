/**
 * Visuals, the kernel's half: append a visual's lines and read them back (`../visual.ts`). The record decides who may.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant, type Json } from '../coerce.ts';
import { jcs } from '../declare.ts';
import type { KernelParts } from '../parts.ts';
import { slashMayWrite } from '../slash.ts';
import type { WriteContext } from '../index.ts';
import {
  VISUAL_FIELD,
  VISUAL_RECORD_MOST,
  VISUAL_VERSIONS_MOST,
  VISUAL_WEIGHT,
  VISUALS_ON_MOST,
  isVersion,
  visualLines,
  visualSaid,
  visualState,
  type VisualBody,
  type VisualLine,
  type VisualPicture,
} from '../visual.ts';

/**
 * One version as it is read back: its line, who made it and when, what it holds, and the write an undo takes back.
 * `draft` is true for one handed in as a draft and never kept: the one waiting, or one thrown away or passed over.
 */
export type VisualVersion = Omit<VisualBody, 'draft'> & { line: string; n: number; by: string; at: string; batch: string | null; draft: boolean };

/**
 * One visual on a thing: where it stands now, the draft waiting beside it, and how many versions it has had. A visual
 * whose only versions are drafts stands nowhere yet, so `now` is its draft, and `kept` says which of the two it is.
 */
export type VisualHeld = { id: string; target: string; title: string; now: VisualVersion; kept: boolean; draft: VisualVersion | null; versions: number; made_by: string; made_at: string };

/** One visual whole: where it stands (null once taken away, or before any version is kept), its draft, and every version. */
export type VisualWhole = { id: string; target: string; now: VisualVersion | null; draft: VisualVersion | null; versions: VisualVersion[] };

/**
 * What `writeVisual` is handed. `id` names the visual a new line is for, absent for a new one; `body`, `back` or `gone`
 * says what the line makes it. `w` is the writer, signed as every write is (a token by its run).
 */
export type VisualAsked = {
  target: string;
  id?: string;
  said: { body: VisualBody } | { back: string } | { gone: true } | { keep: string } | { drop: string };
  /** Bytes this line adds to what the record keeps: new pictures and a new page. */
  weight: number;
  note: string;
  w: WriteContext;
};

/** The kinds of thing a visual may be on, as the start of the log's target. */
const ON = ['entry', 'suggestion', 'decision'] as const;

const ofField = (field: string): string => field.slice(VISUAL_FIELD.length);

/** Every version line of a visual, numbered from 1, oldest first, each draft marked until a keep names it. */
function versionsIn(lines: readonly VisualLine[]): VisualVersion[] {
  const kept = new Set<string>();
  for (const l of lines) {
    const said = visualSaid(l.to_v);
    if (said !== null && 'keep' in said) kept.add(said.keep);
  }
  const out: VisualVersion[] = [];
  for (const l of lines) {
    const said = visualSaid(l.to_v);
    if (!isVersion(said)) continue;
    const { draft, ...body } = said;
    out.push({ ...body, line: l.id, n: out.length + 1, by: l.actor, at: l.ts, batch: l.batch, draft: draft === true && !kept.has(l.id) });
  }
  return out;
}

export function extension(parts: KernelParts) {
  const { sql } = parts;

  /** The weight every visual kept here adds up to, as the counter holds it. */
  const weight = (): number => Number(sql.one<{ next: number }>('SELECT next FROM counter WHERE name = ?', VISUAL_WEIGHT)?.next ?? 0);

  /** A visual's thing and field from its id, which is its first line's: one read on the log's own key. */
  const placeOf = (id: string): { target: string; field: string } | null => {
    const row = sql.one<{ target: string | null; field: string | null }>("SELECT target, field FROM event WHERE id = ? AND kind = 'note'", id);
    return row && row.target !== null && row.field === `${VISUAL_FIELD}${id}` ? { target: row.target, field: row.field } : null;
  };

  const wholeOf = (target: string, field: string): VisualWhole => {
    const lines = visualLines(sql, target, field);
    const versions = versionsIn(lines);
    const { standing, draft } = visualState(lines);
    return { id: ofField(field), target, now: versions.find((v) => v.line === standing) ?? null, draft: versions.find((v) => v.line === draft) ?? null, versions };
  };

  return {
    visualWeight: weight,

    /** The thing a visual is on, as the log keys it (`entry:<id>`), or `null` for an id that is no visual. */
    visualOn: (id: string): string | null => placeOf(id)?.target ?? null,

    /**
     * Every visual one thing carries now, oldest first: those taken away are not among them. A draft never stands in for
     * the kept version; one with only a draft is listed by it, marked. The record has asked whether the caller sees the
     * thing before it hands `target` here.
     */
    visualsOn(target: string): VisualHeld[] {
      const lines = sql.all<VisualLine>(
        `SELECT rowid, id, ts, actor, target, field, to_v, batch FROM event WHERE target = ? AND kind = 'note' AND field GLOB '${VISUAL_FIELD}*' ORDER BY rowid`,
        target,
      );
      const byField = new Map<string, VisualLine[]>();
      for (const l of lines) byField.set(l.field, [...(byField.get(l.field) ?? []), l]);
      const out: VisualHeld[] = [];
      for (const [field, of] of byField) {
        const versions = versionsIn(of);
        const { standing, draft } = visualState(of);
        const kept = versions.find((v) => v.line === standing);
        const waits = versions.find((v) => v.line === draft) ?? null;
        const now = kept ?? waits;
        if (!now) continue;
        out.push({ id: ofField(field), target, title: now.title, now, kept: kept !== undefined, draft: waits, versions: versions.length, made_by: of[0]!.actor, made_at: of[0]!.ts });
      }
      return out;
    },

    /** One visual whole by its id, or `null`. */
    visualOf(id: string): VisualWhole | null {
      const at = placeOf(id);
      return at === null ? null : wholeOf(at.target, at.field);
    },

    /** Append one line to a visual, or start one. Counted and written in one transaction, so two at once cannot both fit. */
    writeVisual(asked: VisualAsked): Result<{ id: string; line: string; batch: string; n: number | null }> {
      const colon = asked.target.indexOf(':');
      const kind = colon > 0 ? asked.target.slice(0, colon) : '';
      if (!(ON as readonly string[]).includes(kind) || colon === asked.target.length - 1)
        return no('REF_UNKNOWN', 'A visual is on a task, a project, a question or a decision, and this names none of them.', { at: 'on' });
      const { w } = asked;
      return parts.transaction(() => {
        const theirs = parts.foreignRun<{ id: string; line: string; batch: string; n: number | null }>(w);
        if (theirs) return theirs;
        let field: string;
        let id: string;
        if (asked.id === undefined) {
          const held = Number(
            sql.one<{ n: number }>(`SELECT count(DISTINCT field) AS n FROM event WHERE target = ? AND kind = 'note' AND field GLOB '${VISUAL_FIELD}*'`, asked.target)?.n ?? 0,
          );
          if (held >= VISUALS_ON_MOST) return no('OUT_OF_BOUNDS', `This carries ${VISUALS_ON_MOST} visuals, the most one thing takes. Give one a new version instead.`, { at: 'on' });
          id = parts.mint();
          field = `${VISUAL_FIELD}${id}`;
        } else {
          const at = placeOf(asked.id);
          if (at === null || at.target !== asked.target) return no('REF_UNKNOWN', 'There is no such visual on this to change.', { at: 'visual' });
          ({ field } = at);
          id = asked.id;
          const lines = visualLines(sql, at.target, field);
          if ('body' in asked.said && versionsIn(lines).length >= VISUAL_VERSIONS_MOST)
            return no('OUT_OF_BOUNDS', `This visual has ${VISUAL_VERSIONS_MOST} versions, the most one keeps. Start a new one.`, { at: 'visual' });
          /* A KEEP OR A THROW AWAY NAMES THE DRAFT THAT WAITS, checked in the same transaction as the write, so two presses
             at once settle it once. */
          const settles = 'keep' in asked.said ? asked.said.keep : 'drop' in asked.said ? asked.said.drop : null;
          if (settles !== null && visualState(lines).draft !== settles)
            return no('TRANSITION_ILLEGAL', 'This draft was already kept or thrown away, or a newer version came after it.', { at: 'version' });
        }
        if (asked.id === undefined && !('body' in asked.said)) return no('REF_UNKNOWN', 'There is no such visual to keep or throw away.', { at: 'visual' });
        if (asked.weight > 0 && weight() + asked.weight > VISUAL_RECORD_MOST)
          return no('OUT_OF_BOUNDS', `The visuals here come to ${VISUAL_RECORD_MOST / 1024 / 1024} MB, the most one record keeps. Take one away or hand in smaller pictures.`, { at: 'pictures' });
        const to: Json = 'body' in asked.said ? (asked.said.body as unknown as Json) : (asked.said as unknown as Json);
        const line = asked.id === undefined ? id : parts.mint();
        const batch = w.batch ?? parts.mint();
        const actor = parts.signedBy(w);
        /* A MODEL SUGGESTS, PROPOSES AND PREDICTS (`slash.ts`), and a visual is drawn by somebody who may write. */
        slashMayWrite(actor, 'note');
        sql.exec(
          'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v, note, batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          line,
          instant(parts.clock.now()),
          actor,
          'note',
          asked.target,
          kind,
          field,
          jcs(to),
          asked.note.slice(0, 280),
          batch,
        );
        if (asked.weight > 0) {
          sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 0)', VISUAL_WEIGHT);
          sql.exec('UPDATE counter SET next = next + ? WHERE name = ?', asked.weight, VISUAL_WEIGHT);
        }
        const n = 'body' in asked.said ? versionsIn(visualLines(sql, asked.target, field)).length : null;
        return ok({ id, line, batch, n });
      });
    },
  };
}

export type { VisualPicture };
