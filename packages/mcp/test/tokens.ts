/**
 * The token estimate every budget in these tests is held to: `44-SPEC-MCP` §5.8, verbatim, a run heuristic biased above
 * o200k_base and never below it on its calibration set. One copy, so the tool list's ceiling and the briefing's are
 * counted the same way.
 */

const RUN = /[A-Z]{2,}|[A-Za-z]+|[0-9]+|[!-\/:-@\[-`{-~]+|\n+|[^\x00-\x7F]/gu;

export function tokenBudget(text: string): number {
  let n = 0;
  for (const [s] of text.matchAll(RUN)) {
    const c = s.charCodeAt(0);
    if (/^[A-Z]{2,}$/.test(s)) n += Math.ceil(s.length / 2);
    else if (/^[A-Za-z]/.test(s)) n += Math.ceil(s.length / 5);
    else if (c >= 48 && c <= 57) n += Math.ceil(s.length / 3);
    else if (s[0] === '\n') n += 1;
    else if (c > 127) n += 1;
    else n += Math.ceil(s.length / 3);
  }
  return n;
}
