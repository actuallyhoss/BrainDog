/**
 * THE TRIP COUNTDOWN (widgets plan §7.1, Call 18): a drawn widget over one trip from the Trips add-on, the days until it
 * at the size it is drawn, and the day of it while it is on. Its block carries `until:` the trip's last day, so the
 * board stops drawing it once he is back (`stillShown`).
 *
 * DRAWN BECAUSE NO KIND COUNTS DAYS TO ONE ROW: a timeline says the day, and a countdown is the number. It is held to the
 * design check like any drawn component: the theme's colours only, nothing wider than a phone, and words when there is
 * nothing to draw. It reads `braindog.size` to draw less in a small frame and the days as dots in a tall one.
 */
export const TRIP_COUNTDOWN = `<div class="trip" id="trip"></div>
<style>
  .trip { display: grid; gap: 4px; }
  .trip button { all: unset; cursor: pointer; display: grid; gap: 4px; }
  .trip .n { font-size: 40px; line-height: 1.05; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .trip .what { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trip .when { color: var(--ink-3); font-size: 13px; }
  .trip .road { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px; }
  .trip .road i { display: block; width: 8px; height: 8px; border-radius: 4px; background: var(--rule); }
  .trip .road i.on { background: var(--red); }
  .trip.small .n { font-size: 32px; }
  .trip.small .when, .trip.small .road, .trip.wide .road, .trip.full .road { display: none; }
  .trip .none { color: var(--ink-3); }
</style>
<script>
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(s) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(s == null ? '' : s));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function said(t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  function today() { var n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  braindog.on(function (data, theme, size) {
    var box = document.getElementById('trip');
    box.className = 'trip ' + (size || 'wide');
    box.textContent = '';
    var now = today();
    var rows = data.rows.filter(function (r) {
      var end = day(r.fields.to) || day(r.fields.from);
      return end !== null && end >= now;
    });
    if (rows.length === 0) { box.append(el('p', 'none', 'No trip coming up.')); return; }
    var r = rows[0];
    var from = day(r.fields.from) || now;
    var to = day(r.fields.to) || from;
    var name = r.fields.name == null || r.fields.name === '' ? 'Your trip' : String(r.fields.name);
    var left = Math.round((from - now) / 864e5);
    var b = el('button');
    b.onclick = function () { braindog.open(r.ref); };
    if (left > 0) {
      b.append(el('div', 'n', left === 1 ? '1 day' : left + ' days'), el('div', 'what', 'until ' + name));
    } else {
      var k = Math.round((now - from) / 864e5) + 1;
      var all = Math.round((to - from) / 864e5) + 1;
      b.append(el('div', 'n', all > 1 ? 'Day ' + k + ' of ' + all : 'Today'), el('div', 'what', name));
    }
    b.append(el('div', 'when', to !== from ? said(from) + ' to ' + said(to) : said(from)));
    if (left > 0 && left <= 60) {
      var road = el('div', 'road');
      for (var i = 0; i < Math.min(left, 42); i++) road.append(el('i', i === 0 ? 'on' : null));
      b.append(road);
    }
    box.append(b);
  });
</script>`;
