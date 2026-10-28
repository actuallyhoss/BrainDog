/**
 * "Send to…" at the paths the app calls it by, each the record method of the same route table (`routes/agents.ts`):
 *
 *   GET  /api/send/targets           → `sendTargets`   (query: row, project)
 *   POST /api/send                   → `sendTo`        (body: target, note, attach, may_change, profile, repo, row, project)
 *   GET  /api/send?open=1            → `sentList`      (query: open, row)
 *   GET  /api/send/<id>              → `sent`          { id }
 *   POST /api/send/<id>/withdraw     → `sendWithdraw`  { id }
 *   POST /api/send/<id>/reply        → `sendReply`     { id, note }
 *
 * A NAME FOR A PATH AND NOTHING MORE. `serveApi` asks this before it reads the method off the path, and then answers the
 * method exactly as it answers `/api/<method>`: the same row's group, its POST rule, its argument types and the record's
 * own guard. The id in a path is put over whatever the body said, so a body cannot point a path at another send. Both
 * hosts reach it through `serveApi`, so neither can serve these paths and the other not.
 */

/** A send as a path names it: `IN12`, or a row id. Anything else is no path of these. */
const SEND_ID = /^(?:IN[1-9][0-9]{0,9}|[A-Za-z0-9_-]{1,64})$/u;

/** The method a path names, and the arguments the path itself carries; `null` for a path that is not one of these. */
export function sendPathOf(method: string, pathname: string): { name: string; args: Record<string, string> } | null {
  const parts = pathname.replace(/^\/+api\/+/u, '').replace(/\/+$/u, '').split('/');
  if (parts[0] !== 'send') return null;
  const post = method === 'POST';
  if (parts.length === 1) return { name: post ? 'sendTo' : 'sentList', args: {} };
  const [, second = '', third] = parts;
  if (parts.length === 2 && second === 'targets') return { name: 'sendTargets', args: {} };
  if (!SEND_ID.test(second)) return null;
  if (parts.length === 2) return { name: 'sent', args: { id: second } };
  if (parts.length === 3 && third === 'withdraw') return { name: 'sendWithdraw', args: { id: second } };
  if (parts.length === 3 && third === 'reply') return { name: 'sendReply', args: { id: second } };
  return null;
}
