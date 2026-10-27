/**
 * WHICH WAY A ROW'S AMOUNT WENT. On a phone the ledger's amounts carried no sign, so an
 * Apple bill, three Amazon lines and a salary paid in read alike. A list's amount says it as Money's page does: money out
 * is "−EGP 279.03" and money in "+EGP 600.00", in the same ink, the sign being a word on the figure and never a colour.
 *
 * READ FROM THE DECLARATION, FOR ANY LIST. The field that says which way is the choice field that declares it qualifies
 * the amount (`qualifies:`), else a money list's one required choice of two values that is not its state. Which of its
 * values goes out is said by the value's own word: `out`, or `owed_by_me`. A list that says neither has no sign.
 */

import type { Fields, FieldDecl, RegisterDecl } from './schema.ts';

/** The money field a list leads with: the first in its card's fields, else the first it declares. */
export function amountField(decl: RegisterDecl | undefined): FieldDecl | undefined {
  if (!decl) return undefined;
  const ids = [...decl.mobile.slice(1), ...decl.fields.map((f) => f.id)];
  return ids.map((id) => decl.fields.find((f) => f.id === id && !f.retired)).find((f) => f?.type === 'money');
}

/** The choice field that says which way `figure` goes (`amountField` where none is named), or `undefined`. */
export function wayField(decl: RegisterDecl | undefined, figure: FieldDecl | undefined = amountField(decl)): FieldDecl | undefined {
  if (!decl || !figure) return undefined;
  const choices = decl.fields.filter((f) => f.type === 'enum' && !f.retired && f.id !== decl.state && (f.values?.length ?? 0) >= 2);
  const declared = choices.find((f) => f.qualifies === figure.id);
  if (declared) return declared;
  if (figure.type !== 'money') return undefined;
  const two = choices.filter((f) => f.required && f.values?.length === 2);
  return two.length === 1 ? two[0] : undefined;
}

/** A value that sends money out, by its own word. */
const OUT = /^(?:out|outgoing|spent|expense|debit)$|_out$|_by_me$/u;
/** A value that brings money in, by its own word. */
const IN = /^(?:in|incoming|income|credit)$|_in$|_to_me$/u;

/** Which way a row's amount went: `out`, `in`, or `null` where the list or the row does not say. */
export function wayOf(decl: RegisterDecl | undefined, fields: Readonly<Fields>): 'in' | 'out' | null {
  const by = wayField(decl);
  if (!by) return null;
  const v = fields[by.id];
  if (typeof v !== 'string') return null;
  const outs = (by.values ?? []).filter((x) => OUT.test(x));
  const ins = (by.values ?? []).filter((x) => IN.test(x));
  if (outs.length !== 1 || ins.length !== 1) return null;
  return v === outs[0] ? 'out' : v === ins[0] ? 'in' : null;
}

/** An amount as a cell says it, with its way: "−EGP 279.03", "+EGP 600.00". One that is signed already keeps its sign. */
export function signedSaid(said: string, way: 'in' | 'out' | null): string {
  if (way === null || said === '' || /^[−+-]/u.test(said)) return said;
  return `${way === 'out' ? '−' : '+'}${said}`;
}
