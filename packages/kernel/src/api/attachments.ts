/**
 * Attachments, the kernel's half: append an attachment's lines and read them back (`../attachment.ts`). The record
 * decides who may; this keeps the lines whole, counts new bytes in one transaction with the write, and answers which
 * things name a file, for the file door's `fileHeld`.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant, type Json } from '../coerce.ts';
import { jcs } from '../declare.ts';
import type { KernelParts } from '../parts.ts';
import { slashMayWrite } from '../slash.ts';
import type { WriteContext } from '../index.ts';
import {
  ATTACHED_FIELD,
  ATTACHED_ON_MOST,
  ATTACHED_RECORD_MOST,
  ATTACHED_VERSIONS_MOST,
  ATTACHED_WEIGHT,
  attachedLines,
  attachedSaid,
  attachedState,
  isAttachedVersion,
  type AttachedBody,
  type AttachedLine,
} from '../attachment.ts';

/** One version as it is read back: its line, who put it and when, and the write an undo takes back. */
export type AttachedVersion = AttachedBody & { line: string; n: number; by: string; at: string; batch: string | null };

/** One attachment on a thing as it stands now: its name, the version it is at, how many it has had, who first put it. */
export type AttachedHeld = { id: string; target: string; name: string; now: AttachedVersion; versions: number; made_by: string; made_at: string; changed_at: string };

/** One attachment whole: where it stands (`null` once taken off), its name, and every version, oldest first. */
export type AttachedWhole = { id: string; target: string; name: string; now: AttachedVersion | null; versions: AttachedVersion[]; made_by: string; made_at: string; last: { by: string; at: string; batch: string | null } };

/** What `writeAttachment` is handed: a new attachment (no `id`) or a line on one, and the bytes it adds to the record. */
export type AttachedAsked = {
  target: string;
  id?: string;
  said: { body: AttachedBody } | { rename: string } | { gone: true } | { back: string };
  weight: number;
  note: string;
  w: WriteContext;
};

/** The kinds of thing an attachment may be on, as the start of the log's target: the same as a visual's. */
const ON = ['entry', 'suggestion', 'decision'] as const;

const ofField = (field: string): string => field.slice(ATTACHED_FIELD.length);

function versionsIn(lines: readonly AttachedLine[]): AttachedVersion[] {
  const out: AttachedVersion[] = [];
  for (const l of lines) {
    const said = attachedSaid(l.to_v);
    if (!isAttachedVersion(said)) continue;
    out.push({ ...said, line: l.id, n: out.length + 1, by: l.actor, at: l.ts, batch: l.batch });
  }
  return out;
}

export function extension(parts: KernelParts) {
  const { sql } = parts;

  const weight = (): number => Number(sql.one<{ next: number }>('SELECT next FROM counter WHERE name = ?', ATTACHED_WEIGHT)?.next ?? 0);

  /** An attachment's thing and field from its id, which is its first line's: one read on the log's own key. */
  const placeOf = (id: string): { target: string; field: string } | null => {
    const row = sql.one<{ target: string | null; field: string | null }>("SELECT target, field FROM event WHERE id = ? AND kind = 'note'", id);
    return row && row.target !== null && row.field === `${ATTACHED_FIELD}${id}` ? { target: row.target, field: row.field } : null;
  };

  const wholeOf = (id: string, target: string, lines: readonly AttachedLine[]): AttachedWhole | null => {
    if (lines.length === 0) return null;
    const versions = versionsIn(lines);
    if (versions.length === 0) return null;
    const { standing, name } = attachedState(lines);
    const last = lines[lines.length - 1]!;
    return {
      id,
      target,
      name: name ?? versions[versions.length - 1]!.name,
      now: versions.find((v) => v.line === standing) ?? null,
      versions,
      made_by: lines[0]!.actor,
      made_at: lines[0]!.ts,
      last: { by: last.actor, at: last.ts, batch: last.batch },
    };
  };

  return {
    attachedWeight: weight,

    /** The thing an attachment is on, as the log keys it, or `null` for an id that is no attachment. */
    attachmentOn: (id: string): string | null => placeOf(id)?.target ?? null,

    /** Every attachment one thing carries now, oldest first; those taken off are not among them. */
    attachmentsOn(target: string): AttachedHeld[] {
      const lines = sql.all<AttachedLine>(
        `SELECT rowid, id, ts, actor, target, field, to_v, batch FROM event WHERE target = ? AND kind = 'note' AND field GLOB '${ATTACHED_FIELD}*' ORDER BY rowid`,
        target,
      );
      const byField = new Map<string, AttachedLine[]>();
      for (const l of lines) byField.set(l.field, [...(byField.get(l.field) ?? []), l]);
      const out: AttachedHeld[] = [];
      for (const [field, of] of byField) {
        const whole = wholeOf(ofField(field), target, of);
        if (whole === null || whole.now === null) continue;
        out.push({ id: whole.id, target, name: whole.name, now: whole.now, versions: whole.versions.length, made_by: whole.made_by, made_at: whole.made_at, changed_at: whole.last.at });
      }
      return out;
    },

    /** One attachment whole by its id, or `null`. */
    attachmentOf(id: string): AttachedWhole | null {
      const at = placeOf(id);
      return at === null ? null : wholeOf(id, at.target, attachedLines(sql, at.target, at.field));
    },

    /**
     * The things whose attachment lines name a file (as its bytes or its words), for `fileHeld`. One `instr` over the
     * attachment lines only; the record keeps the answer while the log stands still.
     */
    attachmentTargetsNaming(sha256: string): string[] {
      return sql
        .all<{ target: string }>(`SELECT DISTINCT target FROM event WHERE kind = 'note' AND field GLOB '${ATTACHED_FIELD}*' AND to_v IS NOT NULL AND instr(to_v, ?) > 0`, sha256)
        .map((r) => r.target);
    },

    /** Append one line to an attachment, or start one. Counted and written in one transaction, so two at once cannot both fit. */
    writeAttachment(asked: AttachedAsked): Result<{ id: string; line: string; batch: string; n: number | null }> {
      const colon = asked.target.indexOf(':');
      const kind = colon > 0 ? asked.target.slice(0, colon) : '';
      if (!(ON as readonly string[]).includes(kind) || colon === asked.target.length - 1)
        return no('REF_UNKNOWN', 'A file is attached to a task, a project, a row, a question or a decision, and this names none of them.', { at: 'on' });
      const { w } = asked;
      return parts.transaction(() => {
        const theirs = parts.foreignRun<{ id: string; line: string; batch: string; n: number | null }>(w);
        if (theirs) return theirs;
        let field: string;
        let id: string;
        if (asked.id === undefined) {
          if (!('body' in asked.said)) return no('REF_UNKNOWN', 'There is no such attachment to change.', { at: 'id' });
          const held = Number(
            sql.one<{ n: number }>(`SELECT count(DISTINCT field) AS n FROM event WHERE target = ? AND kind = 'note' AND field GLOB '${ATTACHED_FIELD}*'`, asked.target)?.n ?? 0,
          );
          if (held >= ATTACHED_ON_MOST) return no('OUT_OF_BOUNDS', `This carries ${ATTACHED_ON_MOST} files, the most one thing takes. Remove one, or attach a new version of one by its name.`, { at: 'on' });
          id = parts.mint();
          field = `${ATTACHED_FIELD}${id}`;
        } else {
          const at = placeOf(asked.id);
          if (at === null || at.target !== asked.target) return no('REF_UNKNOWN', 'There is no such attachment on this to change.', { at: 'id' });
          ({ field } = at);
          id = asked.id;
          const lines = attachedLines(sql, at.target, field);
          if ('body' in asked.said && versionsIn(lines).length >= ATTACHED_VERSIONS_MOST)
            return no('OUT_OF_BOUNDS', `This file has ${ATTACHED_VERSIONS_MOST} versions, the most one keeps. Attach it under a new name.`, { at: 'id' });
          if ('back' in asked.said && !versionsIn(lines).some((v) => v.line === (asked.said as { back: string }).back))
            return no('REF_UNKNOWN', 'There is no such version of this file to put back.', { at: 'version' });
        }
        if (asked.weight > 0 && weight() + asked.weight > ATTACHED_RECORD_MOST)
          return no('OUT_OF_BOUNDS', `The files here come to ${ATTACHED_RECORD_MOST / 1024 / 1024 / 1024} GB, the most one BrainDog keeps. Remove some, or attach smaller ones.`, { at: 'file' });
        const to: Json = 'body' in asked.said ? (asked.said.body as unknown as Json) : (asked.said as unknown as Json);
        const line = asked.id === undefined ? id : parts.mint();
        const batch = w.batch ?? parts.mint();
        const actor = parts.signedBy(w);
        /* A MODEL SUGGESTS, PROPOSES AND PREDICTS (`slash.ts`), and a file is put by somebody who may write. */
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
          sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 0)', ATTACHED_WEIGHT);
          sql.exec('UPDATE counter SET next = next + ? WHERE name = ?', asked.weight, ATTACHED_WEIGHT);
        }
        const n = 'body' in asked.said ? versionsIn(attachedLines(sql, asked.target, field)).length : null;
        return ok({ id, line, batch, n });
      });
    },
  };
}
