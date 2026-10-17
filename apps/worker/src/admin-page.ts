/**
 * admin.brain.dog's three files as strings (`admin.ts` serves them): the page, its style and its script.
 *
 * NOTHING INLINE AND NOTHING FROM ANYWHERE ELSE. The CSP is `'self'` for scripts and styles, so the page loads
 * `/admin.js` and `/admin.css` and has no `<script>` body and no `style=`. No font is served on this host, so Lexend
 * and Geist are named first and the system face is what most browsers draw; the look is Look B's tokens either way.
 *
 * THE SCRIPT PUTS A STRANGER'S WORDS ON THE PAGE AS TEXT, never as markup: an application's name, email and link are
 * typed by whoever applied, so every one goes in through `textContent` and a link is drawn only when it is http(s).
 */

import { LOOK_B_CSS } from '@braindog/theme/look-b.ts';

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>BrainDog admin</title>
<link rel="stylesheet" href="/admin.css">
<script src="/admin.js" defer></script>
</head>
<body>
<main class="board">
<header class="head">
<h1>BrainDog admin</h1>
<p class="lead">Who applied, who to invite, and the invites already out.</p>
</header>
<noscript><p class="tile said">This page needs JavaScript to reach BrainDog.</p></noscript>
<section class="tile" id="key" aria-labelledby="key-title">
<h2 id="key-title">Operator key</h2>
<form id="key-form" class="form">
<label for="key-field">The key this BrainDog was given for its operator</label>
<input id="key-field" name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required>
<div class="actions">
<button type="submit" class="primary">Open admin</button>
<button type="button" id="forget" hidden>Forget the key</button>
</div>
</form>
<p class="said" id="key-said" role="status" aria-live="polite"></p>
</section>
<div class="grid" id="desk" hidden>
<section class="tile wide" id="applications" aria-labelledby="applications-title">
<h2 id="applications-title">Applications</h2>
<p class="said" id="applications-said" role="status" aria-live="polite"></p>
<ul class="things" id="applications-list"></ul>
</section>
<section class="tile" id="invite" aria-labelledby="invite-title">
<h2 id="invite-title">Invite someone</h2>
<form id="invite-form" class="form">
<label for="invite-email">Their email</label>
<input id="invite-email" name="email" type="email" autocomplete="off" required>
<label for="invite-note">A note for you, if you like</label>
<input id="invite-note" name="note" type="text" autocomplete="off" maxlength="200">
<div class="actions"><button type="submit" class="primary">Send the invite</button></div>
</form>
<div class="said" id="invite-said" role="status" aria-live="polite"></div>
</section>
<section class="tile" id="invites" aria-labelledby="invites-title">
<h2 id="invites-title">Invites</h2>
<p class="said" id="invites-said" role="status" aria-live="polite"></p>
<ul class="things" id="invites-list"></ul>
</section>
</div>
</main>
</body>
</html>
`;

/* THE TOKENS ARE LOOK B'S OWN, from the theme package, the one place a colour may be written, so this page and the
   site draw from one palette and this file names none. It carries more names than the page uses; the rules below
   read only the semantic ones. */
export const ADMIN_CSS = String.raw`${LOOK_B_CSS}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--board); color: var(--ink); font: 400 16px/1.55 var(--ui); -webkit-font-smoothing: antialiased; }
a { color: var(--red-ink); }
:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
h1, h2, h3 { font-family: var(--head); font-weight: 600; margin: 0; }
.board { padding: 24px clamp(16px, 4vw, 48px) 48px; display: flex; flex-direction: column; gap: 16px; }
.head h1 { font-size: 28px; line-height: 1.15; letter-spacing: -0.035em; }
.head .lead { margin: 6px 0 0; font-size: 17px; color: var(--ink2); }
.grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.tile { background: var(--tile); border-radius: 16px; padding: 20px; min-width: 0; }
.tile h2 { font-size: 20px; letter-spacing: -0.035em; margin-bottom: 12px; }
.form { display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
label { font-size: 15px; color: var(--ink2); }
input { font: inherit; color: var(--ink); background: var(--soft); border: 0; border-radius: 8px; padding: 10px 12px; min-height: 44px; width: 100%; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
button { font: 500 15px/1.2 var(--ui); color: var(--ink); background: var(--soft); border: 0; border-radius: 8px; padding: 10px 14px; min-height: 40px; cursor: pointer; }
button:hover { background: var(--rule); }
button.primary { background: var(--red-fill); color: var(--on-red); }
button.primary:hover { background: var(--red-press); }
button:disabled { opacity: .55; cursor: default; }
.said { margin: 8px 0 0; font-size: 15px; color: var(--ink2); }
.said:empty { display: none; }
.said.bad { color: var(--red-ink); }
.things { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.things li { padding: 14px 0; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.things li:first-child { border-top: 0; padding-top: 0; }
.name { font-weight: 600; overflow-wrap: anywhere; }
.meta { font-size: 15px; color: var(--muted); overflow-wrap: anywhere; }
.what { font-size: 15px; color: var(--ink2); overflow-wrap: anywhere; }
.ref, .when { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.state { font-size: 15px; font-weight: 500; color: var(--muted); }
.state.waiting { color: var(--red-ink); }
.state.waiting::before { content: "● "; }
.state.done { color: var(--good); }
.copy { display: flex; gap: 8px; margin-top: 8px; }
.copy input { font-family: var(--mono); font-size: 13px; }
@media (min-width: 900px) {
  .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .wide { grid-column: 1 / -1; }
}
@media (pointer: coarse) { button { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

/* Plain script, no framework and nothing from anywhere else. The key lives in sessionStorage and in one header. */
export const ADMIN_JS = String.raw`'use strict';
(function () {
  var STORE = 'braindog-admin-key';
  var WRONG_KEY = "That key is not this BrainDog's operator key.";
  var $ = function (id) { return document.getElementById(id); };

  function keyOf() { try { return sessionStorage.getItem(STORE) || ''; } catch (e) { return ''; } }
  function keep(key) { try { sessionStorage.setItem(STORE, key); } catch (e) { /* a private window keeps it for the page only */ } }
  function forget() { try { sessionStorage.removeItem(STORE); } catch (e) { /* nothing was kept */ } }

  function at(where) { return typeof where === 'string' ? $(where) : where; }

  function say(where, words, bad) {
    var place = at(where);
    place.textContent = words;
    place.classList.toggle('bad', bad === true);
  }

  function el(tag, cls, text) {
    var made = document.createElement(tag);
    if (cls) made.className = cls;
    if (text !== undefined && text !== null) made.textContent = String(text);
    return made;
  }

  function when(ms) {
    if (typeof ms !== 'number') return '';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* Every call to an operator door. The key goes in the Authorization header and nowhere else. */
  function ask(path, body) {
    var init = { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit', headers: { Authorization: 'Bearer ' + keyOf() } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (said) {
        if (res.status === 401) { signedOut(WRONG_KEY); throw new Error('key'); }
        if (!res.ok || said.ok === false) throw new Error(trouble(res.status));
        return said.value === undefined ? {} : said.value;
      });
    });
  }

  function trouble(status) {
    if (status === 404) return 'This BrainDog has no operator key set, so there is nothing to manage here.';
    if (status === 400) return 'That did not look right. Check what you typed and try again.';
    if (status === 409 || status === 422) return 'That one was already decided.';
    if (status === 429) return 'Too many tries. Wait a minute and try again.';
    return 'That did not work. Try again in a minute.';
  }

  function failed(where) {
    return function (e) { if (e.message !== 'key') say(where, e.message, true); };
  }

  function signedOut(words) {
    forget();
    $('key-field').value = '';
    $('desk').hidden = true;
    $('forget').hidden = true;
    $('applications-list').textContent = '';
    $('invites-list').textContent = '';
    say('invite-said', '');
    say('key-said', words, words === WRONG_KEY);
  }

  /* The link an invite made, said as mailed or offered to copy when the mail could not go. */
  function sent(where, link, mailed) {
    var place = at(where);
    place.textContent = '';
    place.classList.remove('bad');
    if (mailed) { place.appendChild(el('p', '', 'Invited, the link is mailed.')); return; }
    place.appendChild(el('p', '', 'The mail could not go, so send this link yourself.'));
    var pair = el('div', 'copy');
    var field = el('input');
    field.type = 'text';
    field.readOnly = true;
    field.value = link || '';
    field.setAttribute('aria-label', 'The invite link');
    var button = el('button', '', 'Copy the link');
    button.type = 'button';
    button.addEventListener('click', function () {
      field.select();
      if (navigator.clipboard) navigator.clipboard.writeText(field.value).then(function () { button.textContent = 'Copied'; }, function () { /* the field stays selected */ });
    });
    pair.appendChild(field);
    pair.appendChild(button);
    place.appendChild(pair);
  }

  function linkOf(text) {
    var low = String(text || '').toLowerCase();
    if (low.indexOf('https://') !== 0 && low.indexOf('http://') !== 0) return el('span', 'what', text);
    var a = el('a', 'what', text);
    a.href = text;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  var APPLIED = { waiting: 'Waiting for you', invited: 'Invited', declined: 'Declined' };

  function application(item) {
    var li = el('li');
    li.appendChild(el('span', 'name', item.name));
    li.appendChild(el('span', 'meta', item.email));
    if (item.use) li.appendChild(el('span', 'what', item.use));
    if (item.link) li.appendChild(linkOf(item.link));
    li.appendChild(el('span', 'when', 'Applied ' + when(item.made_at)));
    var state = el('span', 'state' + (item.state === 'waiting' ? ' waiting' : item.state === 'invited' ? ' done' : ''), APPLIED[item.state] || item.state);
    li.appendChild(state);
    if (item.state === 'waiting') {
      var acts = el('div', 'actions');
      var said = el('div', 'said');
      var invite = el('button', 'primary', 'Invite');
      invite.type = 'button';
      invite.addEventListener('click', function () {
        invite.disabled = true;
        ask('/account/ops/applications', { invite: item.id }).then(function (out) {
          acts.hidden = true;
          state.className = 'state done';
          state.textContent = APPLIED.invited;
          sent(said, out.link, out.mailed === true);
          loadInvites();
        }, failed(said)).then(function () { invite.disabled = false; });
      });
      var decline = el('button', '', 'Decline');
      decline.type = 'button';
      decline.addEventListener('click', function () {
        if (!window.confirm('Decline ' + String(item.name) + '? They are not told.')) return;
        ask('/account/ops/applications', { decline: item.id }).then(loadApplications, failed(said));
      });
      acts.appendChild(invite);
      acts.appendChild(decline);
      li.appendChild(acts);
      li.appendChild(said);
    }
    return li;
  }

  var CODE = { open: 'Open', held: 'Being used now', spent: 'Used', ended: 'Ended' };

  function code(item) {
    var li = el('li');
    var top = el('span', 'name', item.note ? item.note : 'No note');
    top.appendChild(document.createTextNode(' '));
    top.appendChild(el('span', 'ref', item.ref));
    li.appendChild(top);
    li.appendChild(el('span', 'when', 'Made ' + when(item.made_at) + (item.ends_at ? ', ends ' + when(item.ends_at) : ', never ends')));
    li.appendChild(el('span', 'state' + (item.state === 'spent' ? ' done' : ''), (CODE[item.state] || item.state) + (item.state === 'spent' && item.made ? ' by ' + item.made : '')));
    if (item.state === 'open' || item.state === 'held') {
      var acts = el('div', 'actions');
      var end = el('button', '', 'End');
      end.type = 'button';
      end.addEventListener('click', function () {
        end.disabled = true;
        ask('/account/ops/invite', { end: item.ref }).then(loadInvites, failed('invites-said')).then(function () { end.disabled = false; });
      });
      acts.appendChild(end);
      li.appendChild(acts);
    }
    return li;
  }

  function fill(listId, saidId, items, draw, none) {
    var list = $(listId);
    list.textContent = '';
    say(saidId, items.length === 0 ? none : '');
    var sorted = items.slice().sort(function (a, b) { return (b.made_at || 0) - (a.made_at || 0); });
    sorted.forEach(function (item) { list.appendChild(draw(item)); });
  }

  function loadApplications() {
    return ask('/account/ops/applications').then(function (value) {
      var items = Array.isArray(value) ? value : Array.isArray(value.applications) ? value.applications : [];
      fill('applications-list', 'applications-said', items, application, 'Nobody has applied yet.');
    }, failed('applications-said'));
  }

  function loadInvites() {
    return ask('/account/ops/invite').then(function (value) {
      var items = Array.isArray(value) ? value : Array.isArray(value.codes) ? value.codes : [];
      fill('invites-list', 'invites-said', items, code, 'No invites yet.');
    }, failed('invites-said'));
  }

  function open() {
    say('key-said', '');
    $('desk').hidden = false;
    $('forget').hidden = false;
    loadApplications();
    loadInvites();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('key-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var key = $('key-field').value.trim();
      $('key-field').value = '';
      if (key === '') return;
      keep(key);
      open();
    });
    $('forget').addEventListener('click', function () { signedOut('The key is forgotten.'); });
    $('invite-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var email = $('invite-email').value.trim();
      var note = $('invite-note').value.trim();
      say('invite-said', 'Sending the invite.');
      var asked = { email: email };
      if (note !== '') asked.note = note;
      ask('/account/ops/invite', asked).then(function (out) {
        sent('invite-said', Array.isArray(out.links) ? out.links[0] : '', out.mailed === true);
        $('invite-email').value = '';
        $('invite-note').value = '';
        loadInvites();
        loadApplications();
      }, failed('invite-said'));
    });
    if (keyOf() !== '') open();
  });
})();
`;
