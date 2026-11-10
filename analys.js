'use strict';

/* ---------- Data ---------- */

const entries = loadEntries();
const RANGE_KEY = 'demirdiary.analysRange';
const MAX_GAP = 3; // dagar mellan två värden som fortfarande binds ihop med en linje
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
    const avg = points.reduce((a, p) => a + p.value, 0) / points.length;
    $(id).textContent = format(avg);
    $(`${id}-sub`).textContent = `snitt av ${points.length} ${points.length === 1 ? 'dag' : 'dagar'}`;
  };
  show('avg-sleep', collect('sleep'), formatSleep);
  show('avg-mood', collect('mood'), (v) => `${formatNumber(v)} ${moodOf(Math.round(v)).emoji}`);
  show('avg-wakeups', collect('wakeups'), (v) => formatNumber(v));
}

/* ---------- Graf ---------- */

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

function createChart(container, config) {
  const chart = { container, config, render, update };
  let geom = null;
  let layer = null;
  let tooltip = null;

  function render() {
    container.replaceChildren();
    const { start, end } = rangeBounds();
    const points = collect(config.field);
    const width = Math.max(260, container.clientWidth);
    const height = 200;
    const pad = { top: 12, right: 40, bottom: 26, left: 34 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const n = end - start + 1;
    const step = plotW / n;
    const x = (d) => pad.left + (d - start + 0.5) * step;
    const [yMin, yMax] = config.domain(points);
    const y = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    geom = { start, end, x, y, step, pad, width, height, plotH, points };

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
    const bands = svg('g', {}, root);
    for (let d = start; d <= end; d++) {
      const mark = entryFor(d)?.mark;
      if (!mark) continue;
      svg('rect', {
        x: x(d) - step / 2,
        y: pad.top,
        width: Math.max(step, 1),
        height: plotH,
        class: mark === 'period' ? 'band-period' : 'band-ovulation',
      }, bands);
    }

    // Stödlinjer och y-axel
    const grid = svg('g', {}, root);
    for (const t of config.yTicks(yMin, yMax)) {
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: 'grid' }, grid);
      const label = svg('text', { x: pad.left - 8, y: y(t), class: 'tick tick-y' }, grid);
      label.textContent = config.yLabel(t);
    }
    svg('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, class: 'axis' }, grid);

    // x-axel
    for (const t of xTicks(start, end, x)) {
      const label = svg('text', { x: x(t.day), y: height - 6, class: 'tick tick-x' }, grid);
      label.textContent = t.label;
    }

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

    if (!points.length) {
      const empty = svg('text', { x: pad.left + plotW / 2, y: pad.top + plotH / 2, class: 'empty-label' }, root);
      empty.textContent = config.emptyText;
    }

    layer = svg('g', { class: 'hover-layer' }, root);

    // Yta som fångar pekaren. Den är större än linjen så att man träffar datumet, inte linjen.
    const hit = svg('rect', { x: 0, y: 0, width, height: pad.top + plotH, class: 'hit' }, root);
    const dayAt = (clientX) => {
      const rect = root.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      return Math.min(end, Math.max(start, start + Math.floor((px - pad.left) / step)));
    };
    hit.addEventListener('pointermove', (e) => setHover(dayAt(e.clientX), chart));
    hit.addEventListener('pointerdown', (e) => setHover(dayAt(e.clientX), chart));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setHover(null, null); });

    root.addEventListener('focus', () => {
      const lastAny = lastDayWithData() ?? end;
      setHover(state.hoverDay ?? lastAny, chart);
    });
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
    const value = entryFor(day)?.[config.field];
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
  for (let d = end; d >= start; d--) {
    const e = entryFor(d);
    if (e && (typeof e.sleep === 'number' || typeof e.mood === 'number')) return d;
  }
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
  const mood = typeof e.mood === 'number' ? moodOf(e.mood) : null;
  row('series-mood', mood ? mood.emoji : '–', mood ? mood.label.toLowerCase() : 'humör');
  if (e.mark) {
    const m = document.createElement('div');
    m.className = 'tooltip-mark';
    m.textContent = e.mark === 'period' ? 'Mens' : 'Ägglossning';
    el.append(m);
  }
}

const charts = [
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
    emptyText: 'Ingen sömn ifylld under perioden',
    describe: (points) => points.length
      ? `Sömn i timmar per natt, ${points.length} nätter. Använd piltangenterna för att gå mellan dagarna.`
      : 'Sömn: inga värden under perioden.',
  }),
  createChart($('mood-chart'), {
    field: 'mood',
    seriesClass: 'series-mood',
    domain: () => [0.6, 5.4],
    yTicks: () => [1, 2, 3, 4, 5],
    yLabel: (t) => moodOf(t).emoji,
    endLabel: (v) => moodOf(v).emoji,
    emptyText: 'Inget humör ifyllt under perioden',
    describe: (points) => points.length
      ? `Humör från 1 till 5, ${points.length} dagar. Använd piltangenterna för att gå mellan dagarna.`
      : 'Humör: inga värden under perioden.',
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
    if (!e || (e.sleep === undefined && e.mood === undefined && e.wakeups === undefined && !e.mark)) continue;
    const tr = document.createElement('tr');
    const mood = e.mood ? moodOf(e.mood) : null;
    const cells = [
      formatDayNum(d, { weekday: 'short', day: 'numeric', month: 'short' }),
      typeof e.sleep === 'number' ? formatSleep(e.sleep) : '–',
      typeof e.wakeups === 'number' ? String(e.wakeups) : '–',
      mood ? `${mood.emoji} ${mood.label}` : '–',
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
