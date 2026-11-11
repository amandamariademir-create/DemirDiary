'use strict';

function saveEntries() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    return true;
  } catch {
    showToast('Kunde inte spara. Webbläsaren tillåter kanske inte lagring.');
    return false;
  }
}

let entries = loadEntries();

/* ---------- Cykelberäkning ---------- */

const isPeriod = (entry) => !!entry && entry.mark === 'period';
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

function computeCycle() {
  const periodDays = Object.keys(entries)
    .filter((k) => isPeriod(entries[k]))
    .map(keyToDayNum)
    .sort((a, b) => a - b);

  // Slå ihop mensdagar till perioder. En missad dag emellan räknas som samma mens.
  const periods = [];
  for (const d of periodDays) {
    const last = periods[periods.length - 1];
    if (last && d - last.end <= 2) last.end = d;
    else periods.push({ start: d, end: d });
  }

  // Cykellängd = dagar mellan två mensstarter. Orimliga värden tas bort.
  const cycleLengths = [];
  for (let i = 1; i < periods.length; i++) {
    const len = periods[i].start - periods[i - 1].start;
    if (len >= 15 && len <= 60) cycleLengths.push(len);
  }
  const recentCycles = cycleLengths.slice(-6);
  const avgCycle = recentCycles.length ? Math.round(average(recentCycles)) : null;

  const recentPeriods = periods.slice(-6).map((p) => p.end - p.start + 1);
  const avgPeriod = recentPeriods.length ? Math.round(average(recentPeriods)) : null;

  const today = keyToDayNum(todayKey());
  const lastStart = periods.length ? periods[periods.length - 1].start : null;
  const cycleLen = avgCycle ?? DEFAULT_CYCLE_LENGTH;
  const periodLen = avgPeriod ?? DEFAULT_PERIOD_LENGTH;

  let nextStart = null;
  let nextOvulation = null;
  const predicted = new Set();
  const predictedOvulation = new Set();
  if (lastStart !== null) {
    nextStart = lastStart + cycleLen;
    for (let c = 0; c < PREDICTED_CYCLES; c++) {
      const start = nextStart + c * cycleLen;
      for (let d = start; d < start + periodLen; d++) {
        const key = dayNumToKey(d);
        if (d >= today && !isPeriod(entries[key])) predicted.add(key);
      }

      // Ägglossning ungefär 14 dagar före varje uppskattad mens. Hoppa över cykeln
      // om du redan har markerat ägglossning nära den dagen.
      const ov = start - LUTEAL_PHASE;
      if (ov < today || hasOvulationNear(ov)) continue;
      if (nextOvulation === null) nextOvulation = ov;
      const ovKey = dayNumToKey(ov);
      if (!entries[ovKey]?.mark) predictedOvulation.add(ovKey);
    }
  }

  return {
    today,
    avgCycle,
    avgPeriod,
    nextStart,
    nextOvulation,
    cycleDay: lastStart !== null && lastStart <= today ? today - lastStart + 1 : null,
    usingDefault: avgCycle === null,
    predicted,
    predictedOvulation,
  };
}

function hasOvulationNear(dayNum, range = 5) {
  for (let d = dayNum - range; d <= dayNum + range; d++) {
    if (entries[dayNumToKey(d)]?.mark === 'ovulation') return true;
  }
  return false;
}

function relativeDays(diff) {
  if (diff > 1) return `om ${diff} dagar`;
  if (diff === 1) return 'imorgon';
  if (diff === 0) return 'idag';
  return `${-diff} ${-diff === 1 ? 'dag' : 'dagar'} sen`;
}

/* ---------- Översikt ---------- */

function renderStats(cycle) {
  $('stat-cycle-day').textContent = cycle.cycleDay ?? '–';
  $('stat-avg-cycle').textContent = cycle.avgCycle ? `${cycle.avgCycle} dagar` : '–';
  $('stat-avg-period').textContent = cycle.avgPeriod ? `${cycle.avgPeriod} dagar` : '–';

  const assumption = cycle.usingDefault ? ' (antar 28 dagars cykel)' : '';
  if (cycle.nextStart === null) {
    for (const id of ['stat-next', 'stat-ovulation']) $(id).textContent = '–';
    $('stat-next-sub').textContent = 'Registrera din mens för att få en uppskattning';
    $('stat-ovulation-sub').textContent = '';
    return;
  }
  $('stat-next').textContent = formatDayNum(cycle.nextStart);
  $('stat-next-sub').textContent = relativeDays(cycle.nextStart - cycle.today) + assumption;

  if (cycle.nextOvulation === null) {
    $('stat-ovulation').textContent = '–';
    $('stat-ovulation-sub').textContent = '';
  } else {
    $('stat-ovulation').textContent = formatDayNum(cycle.nextOvulation);
    $('stat-ovulation-sub').textContent = relativeDays(cycle.nextOvulation - cycle.today) + assumption;
  }
}

/* ---------- Kalender ---------- */

const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();

function renderCalendar(cycle) {
  const title = new Date(viewYear, viewMonth, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  $('month-title').textContent = title;

  const container = $('days');
  container.replaceChildren();

  const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // måndag först
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const tKey = todayKey();

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement('div');
    blank.className = 'day empty';
    container.append(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = toKey(viewYear, viewMonth, d);
    const entry = entries[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    btn.dataset.key = key;

    if (entry?.mark) btn.classList.add(`mark-${entry.mark}`);
    if (cycle.predicted.has(key)) btn.classList.add('predicted');
    if (cycle.predictedOvulation.has(key)) btn.classList.add('predicted-ovulation');
    if (key === tKey) btn.classList.add('today');
    if (key > tKey) btn.classList.add('future');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = d;
    btn.append(num);

    const acts = ACTIVITIES.filter((a) => entry?.[a.key]).map((a) => a.emoji).join('');
    if (acts) {
      const span = document.createElement('span');
      span.className = 'acts';
      span.textContent = acts;
      btn.append(span);
    }

    if (entry?.note) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      btn.append(dot);
    }

    btn.setAttribute('aria-label', describeDay(key, entry, cycle.predicted.has(key), cycle.predictedOvulation.has(key)));
    btn.addEventListener('click', () => openDay(key));
    container.append(btn);
  }
}

function describeDay(key, entry, predicted, predictedOvulation) {
  const parts = [formatDayNum(keyToDayNum(key), { weekday: 'long', day: 'numeric', month: 'long' })];
  if (typeof entry?.sleep === 'number') parts.push(`sömn ${String(entry.sleep).replace('.', ',')} timmar`);
  if (entry?.mark) parts.push(MARKS.find((m) => m.value === entry.mark).label.toLowerCase());
  for (const a of ACTIVITIES) {
    if (!entry?.[a.key]) continue;
    const m = minutesOf(entry, a.key);
    parts.push(m ? `${a.label.toLowerCase()} ${formatMinutes(m)}` : a.label.toLowerCase());
  }
  if (entry?.note) parts.push('har anteckning');
  if (predicted) parts.push('uppskattad mens');
  if (predictedOvulation) parts.push('uppskattad ägglossning');
  return parts.join(', ');
}

function render() {
  const cycle = computeCycle();
  renderStats(cycle);
  renderCalendar(cycle);
  if (typeof renderToday === 'function') renderToday(); // från today.js
}

/* ---------- Dagsformulär ---------- */

const dialog = $('day-dialog');
const form = $('day-form');
let currentKey = null;

function buildOption(type, name, value, text, title) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.value = value;
  const span = document.createElement('span');
  span.textContent = text;
  if (title) {
    label.title = title;
    input.setAttribute('aria-label', title);
  }
  label.append(input, span);
  return label;
}

function buildForm() {
  $('mark-options').append(...MARKS.map((m) => buildOption('radio', 'mark', m.value, m.label)));
}

function openDay(key) {
  currentKey = key;
  const entry = entries[key] || {};
  $('dialog-title').textContent = formatDayNum(keyToDayNum(key), { weekday: 'long', day: 'numeric', month: 'long' });

  form.reset();
  form.querySelector(`input[name="mark"][value="${entry.mark || 'none'}"]`).checked = true;
  $('sleep').value = entry.sleep ?? '';
  $('wakeups').value = entry.wakeups ?? '';
  for (const a of ACTIVITIES) {
    const input = $(a.key);
    input.value = minutesOf(entry, a.key) ?? '';
    // Från äldre version: dagen är markerad men tiden saknas. Den behålls tills du skriver in minuter.
    input.dataset.legacy = entry[a.key] === true ? '1' : '';
    input.placeholder = entry[a.key] === true ? 'Ja, tid saknas' : '';
  }
  $('note').value = entry.note || '';

  dialog.showModal();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const entry = sanitizeEntry({
    mark: data.get('mark'),
    sleep: $('sleep').value,
    wakeups: $('wakeups').value,
    ...Object.fromEntries(ACTIVITIES.map((a) => {
      const input = $(a.key);
      const value = input.value.trim();
      return [a.key, value === '' && input.dataset.legacy === '1' ? true : value];
    })),
    note: $('note').value,
  });
  if (entry) entries[currentKey] = entry;
  else delete entries[currentKey];
  if (saveEntries()) showToast('Sparat');
  dialog.close();
  render();
});

$('clear-day').addEventListener('click', () => {
  if (!entries[currentKey]) { dialog.close(); return; }
  if (!confirm('Vill du ta bort allt som är registrerat för den här dagen?')) return;
  delete entries[currentKey];
  if (saveEntries()) showToast('Dagen är rensad');
  dialog.close();
  render();
});

$('cancel-day').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

/* ---------- Navigering ---------- */

function shiftMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  render();
}
$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));
$('go-today').addEventListener('click', () => {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();
  render();
});

/* ---------- Export och import ---------- */

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), entries }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `demirdiary-${todayKey()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Säkerhetskopian är nedladdad');
});

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = sanitizeEntries(parsed.entries);
    const count = Object.keys(imported).length;
    if (!count) { showToast('Filen innehöll inga dagar att importera'); return; }
    if (!confirm(`Importera ${count} dagar? Dagar som redan finns skrivs över med uppgifterna från filen.`)) return;
    entries = { ...entries, ...imported };
    if (saveEntries()) showToast(`${count} dagar importerade`);
    render();
  } catch {
    showToast('Kunde inte läsa filen. Är det en säkerhetskopia från DemirDiary?');
  }
});

/* ---------- Toast ---------- */

let toastTimer;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ---------- Start ---------- */

buildForm();
render();
