/**
 * What is wrong with the list a rule's `link` names, asked with the lists' schemas and nothing else.
 *
 * ITS OWN FILE SO THE INSTALL CAN ASK IT. `declare.ts` checks a rule as it lands and `rules.ts` runs one, and `rules.ts`
 * reads `flow-lint.ts` and `declare.ts` as it loads: an install that imported this from `rules.ts` closed a ring of
 * imports, and whichever file a caller opened first found the others half made. This file imports neither.
 */

import type { Refusal } from '@braindog/ports';
import { isColumn, QUANTIFIERS, type Schema } from '@braindog/where';

import type { LinkTo, RuleDecl } from './rules.ts';

/** The fields of the linked list a `where` asks about, in the order it names them. Another list's are not this one's. */
export function whereFields(node: unknown, out: string[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) whereFields(child, out);
    return;
  }
  const said = node as Record<string, unknown>;
  if ('pointed' in said) return;
  for (const q of QUANTIFIERS) whereFields(said[q], out);
  if (typeof said.field === 'string' && !out.includes(said.field)) out.push(said.field);
}

/**
 * What is wrong with a rule's `link.to.where` or `link.to.take`, or `null`.
 *
 * A FILTER OVER A FIELD THE LINKED LIST DOES NOT DECLARE IS REFUSED, NOT READ AS "NO ROW". Compiled, such a filter
 * matches nothing, so the rule would install, file nothing for ever and say only that nothing bears that name. The
 * dry run refuses the rule with this, and the pass leaves the one step out and says so, for a rule stored before
 * anything asked. A list that is not installed is not this check's to refuse: such a link has always linked nothing.
 *
 * Exported so the install can ask it of a rule as it lands; it takes the lists' schemas and nothing else.
 */
export function linkFault(schemaOf: (register: string) => Schema | null, rule: Pick<RuleDecl, 'rule' | 'then'>): Refusal | null {
  for (const [i, action] of (Array.isArray(rule.then) ? rule.then : []).entries()) {
    const to = (action as { link?: { to?: Partial<LinkTo> } } | null)?.link?.to;
    if (to === null || typeof to !== 'object' || typeof to.register !== 'string') continue;
    const schema = schemaOf(to.register);
    if (schema === null) continue;
    const known = (field: string): boolean => Object.hasOwn(schema.fields, field) || isColumn(field);
    if (to.where !== undefined) {
      const at = `then[${i}].link.to.where`;
      if (to.where === null || typeof to.where !== 'object' || Array.isArray(to.where))
        return { code: 'DECLARATION_INVALID', fix: `rule.${rule.rule}'s ${at} is written as a filter, such as { field: state, is: live }.`, at };
      const fields: string[] = [];
      whereFields(to.where, fields);
      const missing = fields.find((field) => !known(field));
      if (missing !== undefined) return { code: 'FIELD_UNKNOWN', fix: `rule.${rule.rule}'s ${at} filters ${to.register}, and ${to.register} has no field called ${missing}.`, at };
    }
    if (to.take !== undefined) {
      const at = `then[${i}].link.to.take`;
      if (typeof to.take !== 'string' || !Object.hasOwn(schema.fields, to.take))
        return { code: 'FIELD_UNKNOWN', fix: `rule.${rule.rule}'s ${at} takes a field of ${to.register}, and ${to.register} has no field called ${String(to.take)}.`, at };
    }
  }
  return null;
}

/**
 * What is wrong with a rule's `link.to.also`, or `null`.
 *
 * ASKED OF THE RULE'S OWN LIST, which `linkFault` is not handed: `also` names a field of the row being linked, and
 * what is written there is a row of the linked list, so the field is a ref to that list. One that is not would hold an
 * id nothing can open. The install refuses the rule with this as it lands, the dry run refuses it too, and the pass leaves
 * the one step out and says so, for a rule stored before anything asked. HERE BESIDE `linkFault`, so the install can
 * ask it without closing the ring of imports this file was made to keep open.
 */
export function alsoFault(schemaOf: (register: string) => Schema | null, rule: Pick<RuleDecl, 'rule' | 'register' | 'then'>): Refusal | null {
  for (const [i, action] of (Array.isArray(rule.then) ? rule.then : []).entries()) {
    const link = (action as { link?: { field?: unknown; to?: Partial<LinkTo> } } | null)?.link;
    const to = link?.to;
    if (to === null || typeof to !== 'object' || to.also === undefined) continue;
    const at = `then[${i}].link.to.also`;
    const no = (fix: string, code: Refusal['code'] = 'DECLARATION_INVALID'): Refusal => ({ code, fix: `rule.${rule.rule}'s ${at} ${fix}`, at });
    if (typeof to.also !== 'string' || to.also === '') return no('names a field, such as filed_by.');
    if (to.take === undefined) return no(`writes what was found beside what is taken from it, and this link takes nothing. Give it a take, or link ${to.also} in a step of its own.`);
    if (to.also === link?.field) return no(`names ${to.also}, the field this link already writes. Name a second field.`);
    const own = schemaOf(rule.register);
    if (own === null) continue;
    const field = Object.hasOwn(own.fields, to.also) ? own.fields[to.also] : undefined;
    if (field === undefined) return no(`writes a field of ${rule.register}, and ${rule.register} has no field called ${to.also}.`, 'FIELD_UNKNOWN');
    if (field.type !== 'ref' || field.to !== to.register) return no(`writes what was found in ${to.register}, and ${to.also} is not a ref to ${to.register}.`);
  }
  return null;
}
