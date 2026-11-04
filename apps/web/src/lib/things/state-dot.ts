/** Which dot a state wears: a row's lateness is said where the date is, not in its state's colour. */
export function dotOf(decl: { done?: readonly string[] | undefined } | undefined, value: string): 'open' | 'part' | 'done' {
  if (decl?.done?.includes(value)) return 'done';
  return /^part(?:$|[_\s-])/iu.test(value) ? 'part' : 'open';
}
