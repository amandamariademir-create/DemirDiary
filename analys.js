'use strict';

/* ---------- Data ---------- */

const entries = loadEntries();
const RANGE_KEY = 'demirdiary.analysRange';
const MAX_GAP = 3; // dagar mellan två värden som fortfarande binds ihop med en linje
const MIN_COMPARE_DAYS = 3; // minsta antal dagar i varje grupp för att jämföra
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  days: readRange(),
  hoverDay: null,
  activeChart: null,
};

function readRange() {
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY));
    if ([30, 90, 182, 365].includes(saved)) return saved;
  } catch { /* ignoreras */ }
  return 30;
}

function saveRange(days) {
  try { localStorage.setItem(RANGE_KEY, String(days)); } catch { /* ignoreras */ }
}

function rangeBounds() {
  const end = keyToDayNum(todayKey());
  return { start: end - state.days + 1, end };
}

const entryFor = (dayNum) => entries[dayNumToKey(dayNum)];
const moodOf = (value) => MOODS.find((m) => m.value === value);
const formatNumber = (n, digits = 1) => n.toLocaleString('sv-SE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const formatSleep = (h) => `${formatNumber(h)} h`;
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

function collect(field) {
  const { start, end } = rangeBounds();
  const points = [];
  for (let d = start; d <= end; d++) {
    const value = entryFor(d)?.[field];
    if (typeof value === 'number') points.push({ day: d, value });
  }
  return points;
}

/* ---------- Snittvärden ---------- */

function renderStats() {
  const show = (id, points, format) => {
    if (!points.length) {
      $(id).textContent = '–';
      $(`${id}-sub`).textContent = 'inga värden ännu';
      return;
    }
    $(id).textContent = format(average(points.map((p) => p.value)));
    $(`${id}-sub`).textContent = `snitt av ${points.length} ${points.length === 1 ? 'dag' : 'dagar'}`;
  };
  show('avg-sleep', collect('sleep'), formatSleep);
  show('avg-energy', collect('energy'), (v) => formatNumber(v));
  show('avg-mood', collect('mood'), (v) => `${formatNumber(v)} ${moodOf(Math.round(v)).emoji}`);
  show('avg-wakeups', collect('wakeups'), (v) => formatNumber(v));
}

/* ---------- Jämförelse: med och utan aktivitet ---------- */

// Sömnen som registreras på en dag gäller natten mot den dagen.
// Därför jämförs en aktivitet med sömnen som registreras dagen efter.
function compareActivity(activity) {
  const { start, end } = rangeBounds();
  const groups = {
    sleep: { with: [], without: [] },
    energy: { with: [], without: [] },
  };
  let doneDays = 0;
  let loggedDays = 0;
  for (let d = start; d <= end; d++) {
    const e = entryFor(d);
    if (!e) continue; // en dag utan något ifyllt räknas varken som med eller utan
    loggedDays++;
    const did = !!e[activity.key];
    if (did) doneDays++;
    const group = did ? 'with' : 'without';
    if (typeof e.energy === 'number') groups.energy[group].push(e.energy);
    const nextSleep = d < end ? entryFor(d + 1)?.sleep : undefined;
    if (typeof nextSleep === 'number') groups.sleep[group].push(nextSleep);
  }
  return { groups, doneDays, loggedDays };
}

const signed = (d, suffix = '') => {
  const r = Math.round(d * 10) / 10; // samma avrundning som visas, så att det inte står "+0"
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${formatNumber(Math.abs(r))}${suffix}`;
};

function renderCompare() {
  const root = $('compare');
  root.replaceChildren();

  const metrics = [
    { key: 'sleep', label: 'Sömn natten efter', series: 'series-sleep', max: (vals) => Math.max(10, ...vals), format: formatSleep, diff: (d) => signed(d, ' h') },
    { key: 'energy', label: 'Energi samma dag', series: 'series-energy', max: () => 5, format: (v) => formatNumber(v), diff: (d) => signed(d) },
  ];

  for (const activity of ACTIVITIES) {
    const { groups, doneDays, loggedDays } = compareActivity(activity);
    const block = document.createElement('div');
    block.className = 'compare-block';

    const head = document.createElement('div');
    head.className = 'compare-head';
    const title = document.createElement('h3');
    title.textContent = `${activity.emoji} ${activity.label}`;
    const count = document.createElement('span');
    count.textContent = `${doneDays} av ${loggedDays} ifyllda dagar`;
    head.append(title, count);
    block.append(head);

    for (const m of metrics) {
      const g = groups[m.key];
      const metric = document.createElement('div');
      metric.className = 'compare-metric';
      const label = document.createElement('div');
      label.className = 'compare-label';
      label.textContent = m.label;
      metric.append(label);

      if (g.with.length < MIN_COMPARE_DAYS || g.without.length < MIN_COMPARE_DAYS) {
        const empty = document.createElement('p');
        empty.className = 'compare-empty';
        empty.textContent = `Behöver minst ${MIN_COMPARE_DAYS} dagar med och ${MIN_COMPARE_DAYS} utan (nu ${g.with.length} och ${g.without.length}).`;
        metric.append(empty);
        block.append(metric);
        continue;
      }

      const withAvg = average(g.with);
      const withoutAvg = average(g.without);
      const max = m.max([withAvg, withoutAvg]);
      const rows = [
        { name: `Med ${activity.label.toLowerCase()}`, value: withAvg, n: g.with.length, cls: m.series },
        { name: 'Utan', value: withoutAvg, n: g.without.length, cls: 'bar-neutral' },
      ];
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.setAttribute('role', 'img');
        row.setAttribute('aria-label', `${r.name}: ${m.format(r.value)}, snitt av ${r.n} dagar`);
        const name = document.createElement('span');
        name.className = 'bar-name';
        name.textContent = r.name;
        const track = document.createElement('span');
        track.className = 'bar-track';
        const bar = document.createElement('span');
        bar.className = `bar ${r.cls}`;
        bar.style.width = `${Math.max(2, (r.value / max) * 100)}%`;
        track.append(bar);
        const value = document.createElement('span');
        value.className = 'bar-value';
        value.textContent = m.format(r.value);
        const n = document.createElement('span');
        n.className = 'bar-n';
        n.textContent = `${r.n} d`;
        row.append(name, track, value, n);
        metric.append(row);
      }
      const diff = document.createElement('div');
      diff.className = 'compare-diff';
      diff.textContent = `Skillnad ${m.diff(withAvg - withoutAvg)}`;
      metric.append(diff);
      block.append(metric);
    }
    root.append(block);
  }
}

/* ---------- Grafer ---------- */

function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}

// Väljer datumetiketter för x-axeln utan att de krockar.
function xTicks(start, end, x) {
  const n = end - start + 1;
  const candidates = [];
  for (let d = start; d <= end; d++) {
    const dt = new Date(d * DAY_MS);
    const weekday = dt.getUTCDay();
    const date = dt.getUTCDate();
    if (n <= 45 && weekday === 1) {
      candidates.push({ day: d, label: formatDayNum(d, { day: 'numeric', month: 'short' }) });
    } else if (n > 45 && n <= 100 && (date === 1 || date === 15)) {
      candidates.push({ day: d, label: formatDayNum(d, { day: 'numeric', month: 'short' }) });
    } else if (n > 100 && date === 1) {
      candidates.push({ day: d, label: formatDayNum(d, { month: 'short' }) });
    }
  }
  const minGap = 46;
  const ticks = [];
  for (const t of candidates) {
    if (!ticks.length || x(t.day) - x(ticks[ticks.length - 1].day) >= minGap) ticks.push(t);
  }
  return ticks;
}

function drawLine(root, geom, config) {
  const { x, y, pad, width, plotH, points } = geom;
  const grid = svg('g', {}, root);
  for (const t of config.yTicks(geom.yMin, geom.yMax)) {
    svg('line', { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: 'grid' }, grid);
    const label = svg('text', { x: pad.left - 8, y: y(t), class: 'tick tick-y' }, grid);
    label.textContent = config.yLabel(t);
  }
  svg('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, class: 'axis' }, grid);

  // Linje: binds ihop när det är högst MAX_GAP dagar mellan värdena
  let d = '';
  const isolated = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const joinPrev = prev && p.day - prev.day <= MAX_GAP;
    const joinNext = next && next.day - p.day <= MAX_GAP;
    d += `${joinPrev ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`;
    if (!joinPrev && !joinNext) isolated.push(p);
  });
  if (d) svg('path', { d, class: `line ${config.seriesClass}` }, root);
  for (const p of isolated) {
    svg('circle', { cx: x(p.day), cy: y(p.value), r: 4, class: `dot ${config.seriesClass}` }, root);
  }

  // Senaste värdet markeras och skrivs ut vid slutet av linjen
  const last = points[points.length - 1];
  if (last) {
    svg('circle', { cx: x(last.day), cy: y(last.value), r: 4, class: `dot ${config.seriesClass}` }, root);
    const label = svg('text', { x: x(last.day) + 8, y: y(last.value), class: 'end-label' }, root);
    label.textContent = config.endLabel(last.value);
  }
}

function drawStrip(root, geom) {
  const { start, end, x, step, pad, width, plotH } = geom;
  const rowH = plotH / ACTIVITIES.length;
  const markW = Math.max(1, Math.min(step - 2, 10));
  ACTIVITIES.forEach((a, i) => {
    const cy = pad.top + rowH * (i + 0.5);
    svg('line', { x1: pad.left, x2: width - pad.right, y1: cy, y2: cy, class: 'grid' }, root);
    const label = svg('text', { x: pad.left - 8, y: cy, class: 'tick tick-y' }, root);
    label.textContent = a.emoji;
    for (let d = start; d <= end; d++) {
      if (!entryFor(d)?.[a.key]) continue;
      svg('rect', {
        x: x(d) - markW / 2,
        y: cy - 6,
        width: markW,
        height: 12,
        rx: Math.min(3, markW / 2),
        class: `act act-${a.key}`,
      }, root);
    }
  });
  svg('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, class: 'axis' }, root);
}

function createChart(container, config) {
  const chart = { render, update };
  let geom = null;
  let layer = null;
  let tooltip = null;

  function render() {
    container.replaceChildren();
    const { start, end } = rangeBounds();
    const points = config.field ? collect(config.field) : [];
    const width = Math.max(260, container.clientWidth);
    const height = config.height ?? 200;
    const pad = { top: 12, right: 40, bottom: 26, left: 34 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const n = end - start + 1;
    const step = plotW / n;
    const x = (d) => pad.left + (d - start + 0.5) * step;
    const [yMin, yMax] = config.domain ? config.domain(points) : [0, 1];
    const y = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    geom = { start, end, x, y, yMin, yMax, step, pad, width, height, plotH, points };

    const root = svg('svg', {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: 'img',
      tabindex: '0',
      class: 'chart-svg',
      'aria-label': config.describe(points),
    });

    // Bakgrund: mens och ägglossning
    for (let d = start; d <= end; d++) {
      const mark = entryFor(d)?.mark;
      if (!mark) continue;
      svg('rect', {
        x: x(d) - step / 2,
        y: pad.top,
        width: Math.max(step, 1),
        height: plotH,
        class: mark === 'period' ? 'band-period' : 'band-ovulation',
      }, root);
    }

    if (config.kind === 'strip') drawStrip(root, geom);
    else drawLine(root, geom, config);

    for (const t of xTicks(start, end, x)) {
      const label = svg('text', { x: x(t.day), y: height - 6, class: 'tick tick-x' }, root);
      label.textContent = t.label;
    }

    if (config.isEmpty(points)) {
      const empty = svg('text', { x: pad.left + plotW / 2, y: pad.top + plotH / 2, class: 'empty-label' }, root);
      empty.textContent = config.emptyText;
    }

    layer = svg('g', { class: 'hover-layer' }, root);

    // Hela grafens bredd fångar pekaren, så att man träffar datumet och inte behöver träffa linjen.
    const hit = svg('rect', { x: 0, y: 0, width, height: pad.top + plotH, class: 'hit' }, root);
    const dayAt = (clientX) => {
      const rect = root.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      return Math.min(end, Math.max(start, start + Math.floor((px - pad.left) / step)));
    };
    hit.addEventListener('pointermove', (e) => setHover(dayAt(e.clientX), chart));
    hit.addEventListener('pointerdown', (e) => setHover(dayAt(e.clientX), chart));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(null, null); });

    root.addEventListener('focus', () => setHover(state.hoverDay ?? lastDayWithData() ?? end, chart));
    root.addEventListener('blur', () => setHover(null, null));
    root.addEventListener('keydown', (e) => {
      const moves = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 };
      if (e.key in moves) {
        e.preventDefault();
        const next = (state.hoverDay ?? end) + moves[e.key];
        setHover(Math.min(end, Math.max(start, next)), chart);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setHover(e.key === 'Home' ? start : end, chart);
      } else if (e.key === 'Escape') {
        setHover(null, null);
      }
    });

    container.append(root);
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.setAttribute('role', 'status');
    container.append(tooltip);
    update();
  }

  function update() {
    if (!layer) return;
    layer.replaceChildren();
    tooltip.classList.remove('show');
    const day = state.hoverDay;
    if (day === null || day < geom.start || day > geom.end) return;

    const cx = geom.x(day);
    svg('line', { x1: cx, x2: cx, y1: geom.pad.top, y2: geom.pad.top + geom.plotH, class: 'crosshair' }, layer);
    const value = config.field ? entryFor(day)?.[config.field] : undefined;
    if (typeof value === 'number') {
      svg('circle', { cx, cy: geom.y(value), r: 5, class: `dot ${config.seriesClass}` }, layer);
    }

    if (state.activeChart !== chart) return;
    fillTooltip(tooltip, day);
    tooltip.classList.add('show');
    const tipW = tooltip.offsetWidth;
    const scale = container.clientWidth / geom.width;
    let left = cx * scale + 12;
    if (left + tipW > container.clientWidth) left = cx * scale - tipW - 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
  }

  return chart;
}

function lastDayWithData() {
  const { start, end } = rangeBounds();
  for (let d = end; d >= start; d--) if (entryFor(d)) return d;
  return null;
}

// En och samma ruta visar alla värden för dagen, oavsett vilken graf man pekar i.
function fillTooltip(el, day) {
  el.replaceChildren();
  const e = entryFor(day) || {};
  const head = document.createElement('div');
  head.className = 'tooltip-date';
  head.textContent = formatDayNum(day, { weekday: 'short', day: 'numeric', month: 'long' });
  el.append(head);

  const row = (keyClass, value, label) => {
    const r = document.createElement('div');
    r.className = 'tooltip-row';
    const key = document.createElement('span');
    key.className = `line-key ${keyClass}`;
    const v = document.createElement('strong');
    v.textContent = value;
    const l = document.createElement('span');
    l.textContent = label;
    r.append(key, v, l);
    el.append(r);
  };

  row('series-sleep', typeof e.sleep === 'number' ? formatSleep(e.sleep) : '–', 'sömn');
  if (typeof e.wakeups === 'number') row('no-key', String(e.wakeups), e.wakeups === 1 ? 'uppvaknande' : 'uppvaknanden');
  row('series-energy', typeof e.energy === 'number' ? String(e.energy) : '–', 'energi');
  const mood = typeof e.mood === 'number' ? moodOf(e.mood) : null;
  row('series-mood', mood ? mood.emoji : '–', mood ? mood.label.toLowerCase() : 'humör');

  const extras = [
    ...ACTIVITIES.filter((a) => e[a.key]).map((a) => `${a.emoji} ${a.label}`),
    ...(e.mark ? [e.mark === 'period' ? 'Mens' : 'Ägglossning'] : []),
  ];
  if (extras.length) {
    const m = document.createElement('div');
    m.className = 'tooltip-mark';
    m.textContent = extras.join(' · ');
    el.append(m);
  }
}

const describeLine = (name, unit) => (points) => points.length
  ? `${name}, ${points.length} ${unit}. Använd piltangenterna för att gå mellan dagarna.`
  : `${name}: inga värden under perioden.`;

const charts = [
  createChart($('activity-chart'), {
    kind: 'strip',
    height: 90,
    isEmpty: () => {
      const { start, end } = rangeBounds();
      for (let d = start; d <= end; d++) if (ACTIVITIES.some((a) => entryFor(d)?.[a.key])) return false;
      return true;
    },
    emptyText: 'Inga aktiviteter ifyllda under perioden',
    describe: () => 'Dagar med träning och dagsljus. Använd piltangenterna för att gå mellan dagarna.',
  }),
  createChart($('sleep-chart'), {
    field: 'sleep',
    seriesClass: 'series-sleep',
    domain: (points) => {
      const max = Math.max(10, ...points.map((p) => p.value));
      return [0, Math.ceil(max / 2) * 2];
    },
    yTicks: (min, max) => {
      const ticks = [];
      const stepSize = max > 12 ? 4 : 2;
      for (let t = min; t <= max; t += stepSize) ticks.push(t);
      return ticks;
    },
    yLabel: (t) => String(t),
    endLabel: (v) => formatSleep(v),
    isEmpty: (points) => !points.length,
    emptyText: 'Ingen sömn ifylld under perioden',
    describe: describeLine('Sömn i timmar per natt', 'nätter'),
  }),
  createChart($('energy-chart'), {
    field: 'energy',
    seriesClass: 'series-energy',
    height: 170,
    domain: () => [0.6, 5.4],
    yTicks: () => [1, 2, 3, 4, 5],
    yLabel: (t) => String(t),
    endLabel: (v) => String(v),
    isEmpty: (points) => !points.length,
    emptyText: 'Ingen energi ifylld under perioden',
    describe: describeLine('Energi från 1 till 5', 'dagar'),
  }),
  createChart($('mood-chart'), {
    field: 'mood',
    seriesClass: 'series-mood',
    height: 170,
    domain: () => [0.6, 5.4],
    yTicks: () => [1, 2, 3, 4, 5],
    yLabel: (t) => moodOf(t).emoji,
    endLabel: (v) => moodOf(v).emoji,
    isEmpty: (points) => !points.length,
    emptyText: 'Inget humör ifyllt under perioden',
    describe: describeLine('Humör från 1 till 5', 'dagar'),
  }),
];

function setHover(day, chart) {
  state.hoverDay = day;
  state.activeChart = chart;
  for (const c of charts) c.update();
}

/* ---------- Tabell ---------- */

function renderTable() {
  const body = $('table-body');
  body.replaceChildren();
  const { start, end } = rangeBounds();
  let rows = 0;
  for (let d = end; d >= start; d--) {
    const e = entryFor(d);
    if (!e) continue;
    const tr = document.createElement('tr');
    const mood = e.mood ? moodOf(e.mood) : null;
    const cells = [
      formatDayNum(d, { weekday: 'short', day: 'numeric', month: 'short' }),
      typeof e.sleep === 'number' ? formatSleep(e.sleep) : '–',
      typeof e.wakeups === 'number' ? String(e.wakeups) : '–',
      typeof e.energy === 'number' ? String(e.energy) : '–',
      mood ? `${mood.emoji} ${mood.label}` : '–',
      e.exercise ? 'Ja' : '',
      e.daylight ? 'Ja' : '',
      e.mark === 'period' ? 'Mens' : e.mark === 'ovulation' ? 'Ägglossning' : '',
    ];
    cells.forEach((text, i) => {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.scope = 'row';
      cell.textContent = text;
      tr.append(cell);
    });
    body.append(tr);
    rows++;
  }
  $('table-empty').hidden = rows > 0;
}

/* ---------- Filter och start ---------- */

function renderAll() {
  for (const btn of document.querySelectorAll('#range-filter button')) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.days) === state.days));
  }
  state.hoverDay = null;
  state.activeChart = null;
  renderStats();
  renderCompare();
  for (const c of charts) c.render();
  renderTable();
}

$('range-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-days]');
  if (!btn) return;
  state.days = Number(btn.dataset.days);
  saveRange(state.days);
  renderAll();
});

// Rita om när skärmen ändrar bredd, till exempel när telefonen vrids.
let lastWidth = 0;
new ResizeObserver(() => {
  const w = $('sleep-chart').clientWidth;
  if (w !== lastWidth) {
    lastWidth = w;
    for (const c of charts) c.render();
  }
}).observe($('sleep-chart'));

// Dölj rutan när man trycker utanför graferna på en pekskärm.
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.chart')) setHover(null, null);
});

renderAll();
