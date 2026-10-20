import { briefFromNote } from '@braindog/kernel';
import { LOOK_B_CSS } from '@braindog/theme/look-b.ts';

/**
 * The cards BrainDog draws inside an agent's app (DIRECTION §45 decision 7): a project, a decision and a rule, as MCP Apps UI
 * resources, with the same facts always in the tool's text lines for hosts that draw nothing (Claude Code).
 *
 * TWO CONVENTIONS, ONE PAGE. MCP Apps hosts (Claude, VS Code, Cursor) read `_meta.ui.resourceUri` and hand the widget
 * the result over `postMessage`; ChatGPT reads `_meta["openai/outputTemplate"]` and puts it on `window.openai`. The page
 * listens to both, so a host that knows either draws it and one that knows neither shows the text.
 *
 * Pure: no record, no clock. `cardOf` shapes a tool's answer into the small object the page draws, and the page never
 * answers a question by itself; a button is only ever a press the person made.
 */

/** The MCP Apps resource type, and the ChatGPT Apps SDK one for the same page. */
export const MCP_APP_TYPE = 'text/html;profile=mcp-app';
export const SKYBRIDGE_TYPE = 'text/html+skybridge';

export type CardKind = 'project' | 'decision' | 'rule';

/** Each card's addresses: the MCP Apps one, then the ChatGPT one, which needs the skybridge type under its own address. */
export const CARD_URIS: Record<CardKind, { app: string; openai: string }> = {
  project: { app: 'ui://braindog/project.html', openai: 'ui://braindog/project.skybridge.html' },
  decision: { app: 'ui://braindog/decision.html', openai: 'ui://braindog/decision.skybridge.html' },
  rule: { app: 'ui://braindog/rule.html', openai: 'ui://braindog/rule.skybridge.html' },
};

/** The tool-list `_meta` that attaches a card to a tool, for both conventions. */
export const cardMeta = (kind: CardKind): Record<string, unknown> => ({
  ui: { resourceUri: CARD_URIS[kind].app },
  'openai/outputTemplate': CARD_URIS[kind].openai,
  'openai/widgetAccessible': true,
});

/** Which card a tool carries, by tool name. */
export const CARD_OF_TOOL: Record<string, CardKind> = { get: 'project', governance: 'decision' };

export type ProjectCard = {
  kind: 'project';
  name: string;
  hue: number | null;
  /** The projects list's `lane` said in its own words ("Building"), or null. */
  lane: string | null;
  brief: string | null;
  next: string | null;
  money: string | null;
  working: string | null;
  href: string | null;
};
type CardOption = { id: string; label: string; because: string | null; suggested: boolean };
export type DecisionCard = {
  kind: 'decision';
  question: string;
  options: CardOption[];
  /** The tool a button calls through the host bridge. Null today: no tool answers for the person, so buttons link. */
  answerTool: string | null;
  spoken: string;
  href: string | null;
};
export type RuleCard = {
  kind: 'rule';
  /** What the rule would do, in one sentence. */
  does: string;
  /** What it was tried against, from the sample result the proposal carries, or null when it carries none. */
  tried: string | null;
  options: CardOption[];
  answerTool: null;
  spoken: string;
  href: string | null;
};
/* NO OPTION PICTURES YET: the web's (apps/web option-visual.ts) need the account balance and month's spend, which the
   governance answer does not carry, and a text-free picture of a change says nothing. Add them when the answer holds a ground. */
export type Card = ProjectCard | DecisionCard | RuleCard;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** An amount in minor units and its currency, said as a person reads it: "GBP 1,200", "JPY 5,000". */
export function moneyLine(amount: number, currency: string): string {
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    /* An unknown code is said with two decimals rather than refused: this is a card, not the ledger. */
  }
  const major = amount / 10 ** digits;
  return `${currency} ${major.toLocaleString('en', { maximumFractionDigits: digits })}`;
}

/* The projects list declares `revenue` (money) and no other figure; the rest are for lists that name theirs differently. */
const MONEY_KEYS = ['revenue', 'budget', 'spend', 'income', 'cost', 'money', 'value'];

/** One money figure if the row has one: a field that is `{ amount, currency }`, or a number beside a currency. */
function moneyOf(fields: Record<string, unknown>): string | null {
  for (const k of MONEY_KEYS) {
    const v = fields[k];
    if (isObject(v) && typeof v.amount === 'number' && typeof v.currency === 'string') return moneyLine(v.amount, v.currency);
    if (typeof v === 'number' && typeof fields.currency === 'string') return moneyLine(v, fields.currency);
  }
  /* A money field under any other name is known by its shape. */
  for (const v of Object.values(fields)) if (isObject(v) && typeof v.amount === 'number' && typeof v.currency === 'string') return moneyLine(v.amount, v.currency);
  return null;
}

const hueOf = (row: Record<string, unknown>, fields: Record<string, unknown>): number | null => {
  for (const v of [fields.hue, row.hue]) if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 360) return v;
  return null;
};

/* The portfolio pack's `lane` values and the labels it shows for them. */
const LANES: Record<string, string> = { building: 'Building', earning: 'Earning', parked: 'Parked', retired: 'Finished' };

/**
 * The app's address for the card's link: the record's own page when the server knows the record's slug (`boot`'s
 * `record.slug`), else the app's front door, or null when the host did not say where it serves the app.
 */
const appLink = (origin: string | undefined, slug?: string | null): string | null =>
  origin === undefined ? null : `${origin.replace(/\/+$/, '')}/app${slug ? `/${encodeURIComponent(slug)}` : ''}`;

/**
 * A `get` answer for a projects row as a project card, or null for anything else (a figure, another list's row, a
 * refusal), so only a project is drawn as one. It reads the fields the portfolio pack declares for that list (name,
 * about, next, hue, lane, note, agent, revenue); the brief is `about`, else the clean first lines of `note`.
 */
export function projectCard(structured: Record<string, unknown>, origin?: string, slug?: string | null): ProjectCard | null {
  const spoken = text(structured.spoken);
  if (spoken === null || !/^projects#\d+$/i.test(spoken)) return null;
  const fields = isObject(structured.fields) ? structured.fields : {};
  const name = text(fields.name);
  if (name === null) return null;
  const note = text(fields.note);
  const lane = text(fields.lane);
  return {
    kind: 'project',
    name,
    hue: hueOf(structured, fields),
    lane: lane === null ? null : (LANES[lane] ?? null),
    brief: text(fields.about) ?? (note === null ? null : briefFromNote(note, name).join(' ') || null),
    next: text(fields.next),
    money: moneyOf(fields),
    working: text(fields.agent),
    href: appLink(origin, slug),
  };
}

/** A question's options, from the row or its body, the suggested one leading and marked (the first when none is). */
function optionsOf(row: Record<string, unknown>): CardOption[] {
  const body = isObject(row.body) ? row.body : {};
  const suggested = text(row.suggested);
  const raw = Array.isArray(row.options) ? row.options : Array.isArray(body.options) ? body.options : [];
  const options = raw
    .filter(isObject)
    .map((o) => ({ id: text(o.id), label: text(o.label), because: text(o.because) ?? text(o.does) }))
    .filter((o): o is { id: string; label: string; because: string | null } => o.id !== null && o.label !== null)
    .map((o) => ({ ...o, suggested: suggested === null ? false : o.id === suggested }));
  options.sort((a, b) => Number(b.suggested) - Number(a.suggested));
  if (options.length > 0 && !options.some((o) => o.suggested)) options[0] = { ...options[0]!, suggested: true };
  return options;
}

/** The one open question a `governance` answer holds, or null when it holds none or several. */
function openQuestion(structured: Record<string, unknown>): { row: Record<string, unknown>; question: string } | null {
  const rows = Array.isArray(structured.rows) ? structured.rows : [];
  const row = rows.length === 1 && isObject(rows[0]) ? rows[0] : null;
  if (row === null) return null;
  const question = text(row.question);
  if (question === null || (row.status !== undefined && row.status !== 'open')) return null;
  return { row, question };
}

/**
 * A `governance` answer for one question (called with `id`) as a decision card, or null when it is not exactly one
 * open question. The suggested option leads and is the primary button; the rest follow as they came.
 */
export function decisionCard(structured: Record<string, unknown>, origin?: string, slug?: string | null): DecisionCard | null {
  const one = openQuestion(structured);
  if (one === null) return null;
  return {
    kind: 'decision',
    question: one.question,
    options: optionsOf(one.row),
    answerTool: null,
    spoken: text(one.row.spoken) ?? text(one.row.id) ?? '',
    href: appLink(origin, slug),
  };
}

/** The rule a proposal would install: a change whose `to` is a rule, or a drafted pattern's ingest. Null for any other body. */
function ruleOf(row: Record<string, unknown>): Record<string, unknown> | null {
  const body = isObject(row.body) ? row.body : null;
  if (body === null) return null;
  const kind = text(row.body_kind);
  if (kind === 'pattern') return isObject(body.ingest) && isObject(body.ingest.body) ? body.ingest.body : {};
  if (kind === 'automation' || kind === 'rule') return isObject(body.body) ? body.body : body;
  const to = body.to;
  if (kind === 'change' && isObject(to) && (to.kind === 'rule' || (typeof to.id === 'string' && to.id.startsWith('rule.')))) return isObject(to.body) ? to.body : {};
  return null;
}

/** The first sentence of some words, held to a card line. */
const oneSentence = (words: string): string => {
  const first = words.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/u)[0] ?? words;
  return first.length > 200 ? `${first.slice(0, 197).trimEnd()}...` : first;
};

/** What the proposal's sample result says, as a person reads it, or null when it carries none. */
function triedOf(row: Record<string, unknown>): string | null {
  const body = isObject(row.body) ? row.body : {};
  const got = [row.dry_run, body.dry_run, row.sample, body.sample].find((v) => v !== undefined && v !== null);
  if (typeof got === 'string') return text(got);
  if (isObject(got)) {
    const said = text(got.said) ?? text(got.summary);
    if (said !== null) return said;
    if (typeof got.matches === 'number') {
      const won = typeof got.won === 'number' ? `, and it would take ${got.won} of them` : '';
      return `Tried against a sample: ${got.matches} matched${won}.`;
    }
  }
  const samples = Array.isArray(body.samples) ? body.samples.length : 0;
  return samples > 0 ? `Tried against ${samples} sample ${samples === 1 ? 'arrival' : 'arrivals'}.` : null;
}

/**
 * A `governance` answer for one open question whose body is a rule (an automation or pattern proposal) as a rule card:
 * what it would do, what it was tried against, and the decision's buttons as links. Null for any other question.
 */
export function ruleCard(structured: Record<string, unknown>, origin?: string, slug?: string | null): RuleCard | null {
  const one = openQuestion(structured);
  if (one === null) return null;
  const rule = ruleOf(one.row);
  if (rule === null) return null;
  /* The rule's own words first, else the question the proposal asked, which already says it in a sentence. */
  const says = text(rule.does) ?? text(rule.about) ?? text(rule.summary) ?? text(rule.name) ?? one.question;
  return {
    kind: 'rule',
    does: oneSentence(says),
    tried: triedOf(one.row),
    options: optionsOf(one.row),
    answerTool: null,
    spoken: text(one.row.spoken) ?? text(one.row.id) ?? '',
    href: appLink(origin, slug),
  };
}

/** The card a tool's answer draws, or null: the tool carries none, or this answer is not one the card can draw. */
export function cardOf(
  tool: string,
  args: Record<string, unknown>,
  structured: Record<string, unknown>,
  origin?: string,
  slug?: string | null,
): Card | null {
  const kind = CARD_OF_TOOL[tool];
  if (kind === 'project') return projectCard(structured, origin, slug);
  /* A RULE IS A DECISION WITH A RULE IN IT: asked first, so the one question draws as the card that says what it would do. */
  if (kind === 'decision') return args.id === undefined ? null : (ruleCard(structured, origin, slug) ?? decisionCard(structured, origin, slug));
  return null;
}

/**
 * Look B's tokens, taken from `@braindog/theme` as a string because a sandboxed widget can import no stylesheet. The
 * system faces stand in for Lexend and Geist because it may load no font file. Only the mark's lightness and chroma are
 * set here, and they are numbers.
 */
const CSS = `${LOOK_B_CSS}
:root{--mark-l:0.55;--mark-c:0.09;--hue:oklch(var(--mark-l) var(--mark-c) var(--h,0))}
@media (prefers-color-scheme:dark){:root{--mark-l:0.72;--mark-c:0.12}}
*{box-sizing:border-box}
body{margin:0;background:transparent;color:var(--ink);font:14px/1.45 var(--ui)}
.card{background:var(--tile);border:1px solid var(--rule);border-radius:12px;padding:16px;max-width:480px}
h1{margin:0 0 6px;font:600 20px/1.2 var(--head);color:var(--ink)}
h1.tint{color:var(--hue)}
.lane{display:inline-block;margin:0 0 8px;font-weight:500;color:var(--muted)}
h1.q{font-size:18px}
p{margin:0 0 10px;color:var(--ink2)}
.row{display:flex;gap:8px;margin:0 0 6px;color:var(--ink2)}
.row b{flex:none;width:72px;font-weight:500;color:var(--muted)}
.fig{font:600 20px/1.2 var(--head);color:var(--ink)}
.opts{display:flex;flex-direction:column;gap:8px;margin:12px 0}
.opt{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:1px solid var(--rule);background:var(--soft);color:var(--ink);font:500 14px/1.3 var(--ui);cursor:pointer;text-decoration:none}
.opt small{display:block;margin-top:2px;font-weight:400;color:var(--muted)}
.opt.primary{background:var(--red-fill);border-color:var(--red-fill);color:var(--on-red)}
.opt.primary small{color:var(--on-red);opacity:.82}
.opt:hover{border-color:var(--red)}.opt.primary:hover{background:var(--red-press)}
.opt:focus-visible,a.open:focus-visible{outline:2px solid var(--red);outline-offset:2px}
a.open{display:inline-block;margin-top:8px;color:var(--red);font-weight:500;text-decoration:none}
a.open:hover{text-decoration:underline}
.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--live);margin-right:6px}
.note{color:var(--muted);font-size:13px}
`;

/**
 * The page's script, shared by both cards. It takes the result from whichever convention the host speaks, draws with
 * textContent only (no markup from the record is ever parsed), and asks the host to tool-call only on a press.
 */
const SCRIPT = `
(function(){
var root=document.getElementById('root'),KIND=document.documentElement.getAttribute('data-card');
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function row(k,v){var r=el('div','row');r.appendChild(el('b',null,k));r.appendChild(el('span',null,v));return r}
function link(c){if(!c.href)return null;var a=el('a','open','Open in BrainDog');a.href=c.href;a.target='_blank';a.rel='noopener noreferrer';return a}
var nextId=1,waiting={},bridge=false;
function post(m){window.parent.postMessage(m,'*')}
function call(name,args){
  if(window.openai&&window.openai.callTool)return window.openai.callTool(name,args);
  return new Promise(function(ok,no){var id=nextId++;waiting[id]={ok:ok,no:no};post({jsonrpc:'2.0',id:id,method:'tools/call',params:{name:name,arguments:args}})});
}
function size(){post({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:document.body.scrollHeight}})}
function project(c){
  var box=el('div','card');
  var h=el('h1',null,c.name);
  /* The hue tints the name only when the row has one, in the web's own lightness and chroma. */
  if(c.hue!=null){document.documentElement.style.setProperty('--h',String(c.hue));h.className='tint'}
  box.appendChild(h);
  if(c.lane)box.appendChild(el('div','lane',c.lane));
  if(c.brief)box.appendChild(el('p',null,c.brief));
  if(c.next)box.appendChild(row('Next',c.next));
  if(c.money){var m=row('Money',c.money);m.lastChild.className='fig';box.appendChild(m)}
  if(c.working){var w=row('Working','');w.lastChild.appendChild(el('i','live'));w.lastChild.appendChild(document.createTextNode(c.working));box.appendChild(w)}
  var a=link(c);if(a)box.appendChild(a);return box;
}
function rule(c){
  var box=el('div','card');box.appendChild(el('h1','q',c.does));
  if(c.tried)box.appendChild(row('Tried',c.tried));
  buttons(c,box);return box;
}
function decision(c){
  var box=el('div','card');box.appendChild(el('h1','q',c.question));
  buttons(c,box);return box;
}
function buttons(c,box){
  var opts=el('div','opts');
  c.options.forEach(function(o){
    var b;
    if(c.answerTool&&(window.openai||bridge)){
      b=el('button','opt'+(o.suggested?' primary':''));
      b.type='button';
      /* The press is the person's own; nothing here picks an option unasked. */
      b.onclick=function(){
        b.disabled=true;
        call(c.answerTool,{id:c.spoken,option:o.id}).then(function(){opts.replaceChildren(el('p','note','Sent. BrainDog has your answer.'));size()},function(){b.disabled=false;b.textContent='Could not send. Answer in BrainDog.'});
      };
    }else{
      b=el('a','opt'+(o.suggested?' primary':''));if(c.href){b.href=c.href;b.target='_blank';b.rel='noopener noreferrer'}
    }
    b.appendChild(document.createTextNode(o.label+(o.suggested?' (suggested)':'')));
    if(o.because)b.appendChild(el('small',null,o.because));
    opts.appendChild(b);
  });
  if(c.options.length)box.appendChild(opts);else box.appendChild(el('p','note','Answer this in BrainDog.'));
  var a=link(c);if(a)box.appendChild(a);
}
function draw(out){
  var c=out&&(out.card||(out.structuredContent&&out.structuredContent.card));
  /* The decision page also draws a rule, for a host that attached the decision template to the tool and cannot swap it per answer. */
  if(!c||(c.kind!==KIND&&!(KIND==='decision'&&c.kind==='rule')))return;
  root.replaceChildren(c.kind==='project'?project(c):c.kind==='rule'?rule(c):decision(c));size();
}
window.addEventListener('message',function(e){
  var m=e.data;if(!m||m.jsonrpc!=='2.0')return;
  if(m.id!=null&&waiting[m.id]){var w=waiting[m.id];delete waiting[m.id];if(m.error)w.no(m.error);else w.ok(m.result);return}
  if(m.method==='ui/notifications/tool-result')draw(m.params);
});
if(window.openai&&window.openai.toolOutput)draw(window.openai.toolOutput);
window.addEventListener('openai:set_globals',function(){if(window.openai)draw(window.openai.toolOutput)});
/* The MCP Apps handshake: a host without it ignores the message and the page waits for a result or toolOutput. */
if(window.parent!==window){bridge=true;post({jsonrpc:'2.0',id:nextId++,method:'ui/initialize',params:{protocolVersion:'2025-11-21',appInfo:{name:'braindog-card',version:'1'},appCapabilities:{}}});post({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}})}
})();
`;

/** One card's whole page: inline style and script, nothing fetched, nothing to load but the host's own message. */
export const cardHtml = (kind: CardKind): string =>
  `<!doctype html><html lang="en" data-card="${kind}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>BrainDog ${kind}</title><style>${CSS}</style></head><body><div id="root"><div class="card note">Loading</div></div><script>${SCRIPT}</script></body></html>`;

/** The resources the server lists and reads for the cards. */
export const cardResources = (): { uri: string; name: string; description: string; mimeType: string; kind: CardKind }[] =>
  (['project', 'decision', 'rule'] as const).flatMap((kind) => [
    { uri: CARD_URIS[kind].app, name: `${kind} card`, description: `A ${kind} drawn as a card.`, mimeType: MCP_APP_TYPE, kind },
    { uri: CARD_URIS[kind].openai, name: `${kind} card for ChatGPT`, description: `The same ${kind} card for ChatGPT.`, mimeType: SKYBRIDGE_TYPE, kind },
  ]);

/** A card resource by address, or undefined when the address is not one. */
export const cardResource = (uri: string) => cardResources().find((r) => r.uri === uri);
