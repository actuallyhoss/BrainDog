/* THE SECOND DECOY. A slash straight after `${` opens a regular expression and does not divide. */
export function lead(said: string) {
  return `${/^[A-Z]+/.exec(said)?.[0] ?? said}`;
}
/* When the lexer read that slash as a division it lost its place at the brace above, and took this
   comment for the inside of a template, so it said payroll here. A comment is not code, and this
   file is not a finding. */
export const none = 0;
