/**
 * `seed`: the gates' record, the self-host in memory with the seed installed and its clock pinned.
 *
 * THE SAME RECORD EVERY BROWSER GATE DRAWS (`tools/gates/record.mjs`), started and forwarded to by the gates' own
 * code, so a look and a gate never disagree about what the seed holds. It may be pressed, and it never counts as seen:
 * an invented record is for the gates and for nothing else.
 */

import { forward, forwards, recordsAnswer, startRecord } from '../../gates/record.mjs';

export async function open() {
  const record = await startRecord(0);
  return {
    name: 'seed',
    record: 'the seed',
    seen: false,
    pressable: true,
    prefix: '',
    cannot: [],
    async handle(req, res, at) {
      /* THE SWITCHER'S QUESTION, which the shell asks on every screen: the seed's one record, as a host lists it.
         Left to the 404 below, every seed picture carried one failed request and two console errors. */
      if (req.method === 'GET' && /^\/+account\/records\/?$/u.test(at.pathname)) {
        for await (const _ of req);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(recordsAnswer()));
      }
      if (!forwards(at.pathname)) {
        for await (const _ of req);
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The seed answers nothing at ${at.pathname}.` } }));
      }
      req.url = `${at.pathname}${at.search}`;
      return forward(req, res, record.base);
    },
    counts: () => ({}),
    close: () => record.close(),
  };
}
