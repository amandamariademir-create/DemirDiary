'use strict';

/* ---------- Data ---------- */

const entries = loadEntries();
const RANGE_KEY = 'demirdiary.analysRange';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_GAP = 3; // dagar mellan två värden som fortfarande binds ihop med en linje

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
const formatNumber = (n, digits = 1) => n.toLocaleString('sv-SE', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
const formatSleep = (h) => `${formatNumber(h)} h`;
const activityText = (entry, key) => {
  const m = minutesOf(entry, key);
  if (m) return formatMinutes(m);
  return entry?.[key] === true ? 'ja, tid saknas' : '–';
};

function collect(field) {
  const { start, end } = rangeBounds();
  const points = [];
  for (let d = start; d <= end; d++) {
    const value = entryFor(d)?.[field];
    if (typeof value === 'number') points.push({ day: d, value });
  }
  return points;
}

/* ---------- Sammanfattning ---------- */

function renderStats() {
  for (const [field, format] of [['sleep', formatSleep], ['wakeups', (v) => formatNumber(v)]]) {
    const points = collect(field);
    $(`stat-${field}`).textContent = points.length ? format(average(points.map((p) => p.value))) : '–';
    $(`stat-${field}-sub`).textContent = points.length
      ? `snitt av ${points.length} ${points.length === 1 ? 'natt' : 'nätter'}`
      : 'inget ifyllt ännu';
  }

  const { start, end } = rangeBounds();
  for (const a of ACTIVITIES) {
    let days = 0;
    const minutes = [];
    for (let d = start; d <= end; d++) {
      const e = entryFor(d);
      if (!e?.[a.key]) continue;
      days++;
      const m = minutesOf(e, a.key);
      if (m) minutes.push(m);
    }
    $(`stat-${a.key}`).textContent = `${days} ${days === 1 ? 'dag' : 'dagar'}`;
    $(`stat-${a.key}-sub`).textContent = minutes.length
      ? `snitt ${formatMinutes(Math.round(average(minutes)))} per dag`
      : days ? 'ingen tid ifylld' : `av ${state.days} dagar`;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- Grafer ---------- */

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
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

// Vänster skala: sömn i timmar. Höger skala: träning och dagsljus i minuter.
// Höger skalas siffror hamnar på samma stödlinjer som vänster, och båda börjar på 0.
function drawYGrid(root, geom, config) {
  const { y, pad, width, plotH, leftTicks, right } = geom;
  leftTicks.forEach((t, i) => {
    svg('line', { x1: pad.left, x2: width - pad.right, y1: y(t), y2: y(t), class: 'grid' }, root);
    const label = svg('text', { x: pad.left - 8, y: y(t), class: 'tick tick-y' }, root);
    label.textContent = config.yLabel(t);
    const rightLabel = svg('text', { x: width - pad.right + 8, y: y(t), class: 'tick tick-y-right' }, root);
    rightLabel.textContent = String(i * right.step);
  });
  svg('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, class: 'axis' }, root);

  const leftTitle = svg('text', { x: 0, y: 10, class: 'axis-title' }, root);
  leftTitle.textContent = config.leftTitle;
  const rightTitle = svg('text', { x: width, y: 10, class: 'axis-title axis-title-right' }, root);
  rightTitle.textContent = config.rightTitle;
}

function drawLine(root, geom, config) {
  const { x, y, points } = geom;

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

  // Senaste värdet markeras med en prick
  const last = points[points.length - 1];
  if (last) svg('circle', { cx: x(last.day), cy: y(last.value), r: 4, class: `dot ${config.seriesClass}` }, root);
}

// Stapel med rundade hörn upptill och rak kant mot nollinjen.
function barPath(x0, x1, yTop, yBase) {
  const r = Math.min(4, (x1 - x0) / 2, yBase - yTop);
  return `M${x0},${yBase}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x1 - r}Q${x1},${yTop} ${x1},${yTop + r}V${yBase}Z`;
}

// Träning och dagsljus som två staplar bredvid varandra för varje dag, i timmar.
function drawActivityBars(root, geom) {
  const { start, end, x, right, step, pad, plotH } = geom;
  const base = pad.top + plotH;
  const groupW = Math.max(1, Math.min(50, step - 2)); // luft mellan dagarna
  const gap = groupW >= 6 ? 2 : 0; // luft mellan de två staplarna samma dag
  const barW = (groupW - gap) / ACTIVITIES.length;
  for (let d = start; d <= end; d++) {
    const e = entryFor(d);
    if (!e) continue;
    ACTIVITIES.forEach((a, i) => {
      const x0 = x(d) - groupW / 2 + i * (barW + gap);
      const m = minutesOf(e, a.key);
      if (m) {
        svg('path', { d: barPath(x0, x0 + barW, right.y(m), base), class: `bar-mark act-${a.key}` }, root);
      } else if (e[a.key] === true) {
        // Dagen är markerad men tiden saknas: en låg grå stapel.
        svg('path', { d: barPath(x0, x0 + barW, base - 4, base), class: 'bar-unknown' }, root);
      }
    });
  }
}

function createChart(container, config) {
  const chart = { render, update };
  let geom = null;
  let layer = null;
  let tooltip = null;

  function render() {
    container.replaceChildren();
    const { start, end } = rangeBounds();
    const points = collect(config.field);
    const width = Math.max(260, container.clientWidth);
    const height = config.height ?? 180;
    const pad = { top: 26, right: 34, bottom: 26, left: 30 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const n = end - start + 1;
    const step = plotW / n;
    const x = (d) => pad.left + (d - start + 0.5) * step;
    const [yMin, yMax] = config.domain(points);
    const y = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const leftTicks = config.yTicks(yMin, yMax);
    const right = config.rightAxis(leftTicks.length - 1);
    right.y = (v) => pad.top + plotH - (v / right.max) * plotH;
    geom = { start, end, x, y, yMin, yMax, leftTicks, right, step, pad, width, height, plotH, points };

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

    drawYGrid(root, geom, config);
    drawActivityBars(root, geom);
    drawLine(root, geom, config); // linjen sist, så att den syns ovanpå staplarna

    for (const t of xTicks(start, end, x)) {
      const label = svg('text', { x: x(t.day), y: height - 6, class: 'tick tick-x' }, root);
      label.textContent = t.label;
    }

    if (config.isEmpty(points)) {
      const empty = svg('text', { x: pad.left + plotW / 2, y: pad.top + plotH / 2, class: 'empty-label' }, root);
      empty.textContent = config.emptyText;
    }

    layer = svg('g', { class: 'hover-layer' }, root);

    // Hela grafens bredd fångar pekaren, så att man träffar datumet och inte behöver träffa stapeln.
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
    tooltip = el('div', 'tooltip');
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
    if (typeof value === 'number') svg('circle', { cx, cy: geom.y(value), r: 5, class: `dot ${config.seriesClass}` }, layer);

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
function fillTooltip(box, day) {
  box.replaceChildren();
  const e = entryFor(day) || {};
  box.append(el('div', 'tooltip-date', formatDayNum(day, { weekday: 'short', day: 'numeric', month: 'long' })));

  const row = (keyClass, value, label) => {
    const r = el('div', 'tooltip-row');
    r.append(el('span', keyClass), el('strong', '', value), el('span', '', label));
    box.append(r);
  };

  row('line-key series-sleep', typeof e.sleep === 'number' ? formatSleep(e.sleep) : '–', 'sömn');
  if (typeof e.wakeups === 'number') row('line-key no-key', String(e.wakeups), e.wakeups === 1 ? 'uppvaknande' : 'uppvaknanden');
  for (const a of ACTIVITIES) row(`rect-key act-${a.key}`, activityText(e, a.key), a.label.toLowerCase());

  if (e.mark) box.append(el('div', 'tooltip-mark', e.mark === 'period' ? 'Mens' : 'Ägglossning'));
}

// Allt i samma graf och på samma skala (timmar), så att sömn och aktiviteter går att jämföra rakt av.
function activityMinutesInRange() {
  const { start, end } = rangeBounds();
  const minutes = [];
  for (let d = start; d <= end; d++) {
    for (const a of ACTIVITIES) {
      const m = minutesOf(entryFor(d), a.key);
      if (m) minutes.push(m);
    }
  }
  return minutes;
}

// Höger skala: väljer ett jämnt steg i minuter så att den högsta stapeln får plats
// och skalans siffror hamnar på samma stödlinjer som sömnskalan.
function minutesAxis(intervals) {
  const max = Math.max(30, ...activityMinutesInRange());
  const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360];
  const step = steps.find((s) => s * intervals >= max) || Math.ceil(max / intervals / 60) * 60;
  return { step, max: step * intervals };
}

const charts = [
  createChart($('combined-chart'), {
    field: 'sleep',
    seriesClass: 'series-sleep',
    height: 220,
    domain: (points) => {
      const max = Math.max(10, ...points.map((p) => p.value));
      return [0, Math.ceil(max / 2) * 2];
    },
    yTicks: (min, max) => {
      const ticks = [];
      for (let t = min; t <= max; t += max > 12 ? 4 : 2) ticks.push(t);
      return ticks;
    },
    yLabel: (t) => String(t),
    rightAxis: minutesAxis,
    leftTitle: 'Sömn, timmar',
    rightTitle: 'Träning/dagsljus, min',
    isEmpty: (points) => {
      if (points.length) return false;
      const { start, end } = rangeBounds();
      for (let d = start; d <= end; d++) if (ACTIVITIES.some((a) => entryFor(d)?.[a.key])) return false;
      return true;
    },
    emptyText: 'Ingen sömn, träning eller dagsljus ifylld under perioden',
    describe: (points) => `Sömn som linje i timmar (vänster skala), träning och dagsljus som staplar i minuter (höger skala). ${points.length} nätter med sömn. Använd piltangenterna för att gå mellan dagarna.`,
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
    const cells = [
      formatDayNum(d, { weekday: 'short', day: 'numeric', month: 'short' }),
      typeof e.sleep === 'number' ? formatSleep(e.sleep) : '–',
      typeof e.wakeups === 'number' ? String(e.wakeups) : '–',
      ...ACTIVITIES.map((a) => activityText(e, a.key)),
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
  const w = $('combined-chart').clientWidth;
  if (w !== lastWidth) {
    lastWidth = w;
    for (const c of charts) c.render();
  }
}).observe($('combined-chart'));

// Dölj rutan när man trycker utanför graferna på en pekskärm.
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.chart')) setHover(null, null);
});

renderAll();
