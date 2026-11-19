'use strict';

// Veckosammanfattning för förra veckan (måndag–söndag), jämfört med veckan innan.
// Allt räknas ut i appen. Använder entries från app.js eller analys.js och
// $, ACTIVITIES och datumfunktionerna från common.js.

const WEEK_DISMISS_KEY = 'demirdiary.weekDismissed';

function weekStart(dayNum) {
  const weekday = (new Date(dayNum * DAY_MS).getUTCDay() + 6) % 7; // måndag = 0
  return dayNum - weekday;
}

// ISO-veckonummer (som i svenska kalendrar).
// Veckan hör till det år där dess torsdag ligger.
function weekNumber(dayNum) {
  const thursday = weekStart(dayNum) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  return Math.floor((thursday - keyToDayNum(`${year}-01-01`)) / 7) + 1;
}

function summarizeWeek(start) {
  const sum = { logged: 0, sleep: [], wakeups: [] };
  for (const a of ACTIVITIES) sum[a.key] = { days: 0, minutes: 0 };
  for (let d = start; d < start + 7; d++) {
    const e = entries[dayNumToKey(d)];
    if (!e) continue;
    sum.logged++;
    if (typeof e.sleep === 'number') sum.sleep.push(e.sleep);
    if (typeof e.wakeups === 'number') sum.wakeups.push(e.wakeups);
    for (const a of ACTIVITIES) {
      if (!e[a.key]) continue;
      sum[a.key].days++;
      sum[a.key].minutes += minutesOf(e, a.key) || 0;
    }
  }
  const avg = (list) => (list.length ? list.reduce((x, y) => x + y, 0) / list.length : null);
  sum.sleepAvg = avg(sum.sleep);
  sum.wakeupsAvg = avg(sum.wakeups);
  return sum;
}

const fmtHours = (minutes) => (minutes >= 60
  ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
  : `${minutes} min`);
const fmtDecimal = (n) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

function change(now, before, unit = '') {
  if (before === null || before === undefined || now === null || now === undefined) return '';
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return 'samma som veckan innan';
  return `${diff > 0 ? '+' : '−'}${fmtDecimal(Math.abs(diff))}${unit} mot veckan innan`;
}

// En kort, vänlig mening. Sömnen bedöms inte, eftersom den mest beror på barnen.
function weekMessage(week, prev) {
  if (!week.logged) return '';
  const ex = week.exercise.days - prev.exercise.days;
  const wk = week.walk.days - prev.walk.days;
  const dl = week.daylight.minutes - prev.daylight.minutes;
  const activeDays = week.exercise.days + week.walk.days;
  if (activeDays >= 4 && week.daylight.days >= 5) return 'En riktigt aktiv vecka – fortsätt så.';
  if (ex > 0 && dl > 0) return 'Mer träning och mer dagsljus än veckan innan. Bra jobbat.';
  if (ex > 0) return 'Fler träningspass än veckan innan. Bra jobbat.';
  if (wk > 0) return 'Fler promenader än veckan innan. Bra jobbat.';
  if (dl > 0) return 'Mer tid i dagsljus än veckan innan. Bra jobbat.';
  if (!prev.logged) return 'Bra start – nu finns en vecka att jämföra med.';
  return 'Ny vecka, nya chanser. En promenad i dagsljus räcker långt.';
}

function buildWeekCard({ dismissible = false } = {}) {
  const today = keyToDayNum(todayKey());
  const start = weekStart(today) - 7;
  const week = summarizeWeek(start);
  const prev = summarizeWeek(start - 7);

  const card = document.createElement('section');
  card.className = 'week-card';
  card.setAttribute('aria-label', 'Förra veckan');

  const range = `${formatDayNum(start, { day: 'numeric', month: 'short' })} – ${formatDayNum(start + 6, { day: 'numeric', month: 'short' })}`;
  const label = document.createElement('p');
  label.className = 'sun-label';
  label.textContent = `Förra veckan · v. ${weekNumber(start)} · ${range}`;
  card.append(label);

  const title = document.createElement('h2');
  title.className = 'week-title';
  if (!week.logged) {
    title.textContent = 'Inget ifyllt förra veckan';
    card.append(title);
    const p = document.createElement('p');
    p.className = 'week-note';
    p.textContent = 'Fyll i dina dagar så får du en sammanfattning här varje vecka.';
    card.append(p);
    return card;
  }
  const passes = week.exercise.days;
  const walks = week.walk.days;
  // Rubriken nämner bara det som blev av, så att det inte står "0 träningspass".
  const parts = [
    passes && `${passes} träningspass`,
    walks && `${walks} ${walks === 1 ? 'promenad' : 'promenader'}`,
    week.daylight.minutes && `${fmtHours(week.daylight.minutes)} i dagsljus`,
  ].filter(Boolean);
  title.textContent = parts.length
    ? (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]}`).replace(/^./, (c) => c.toUpperCase())
    : 'En lugn vecka';
  card.append(title);

  const rows = [
    ['Träning', `${passes} ${passes === 1 ? 'dag' : 'dagar'} · ${fmtHours(week.exercise.minutes)}`, change(passes, prev.logged ? prev.exercise.days : null, '')],
    ['Promenad', `${walks} ${walks === 1 ? 'dag' : 'dagar'} · ${fmtHours(week.walk.minutes)}`, change(walks, prev.logged ? prev.walk.days : null, '')],
    ['Dagsljus', `${week.daylight.days} ${week.daylight.days === 1 ? 'dag' : 'dagar'} · ${fmtHours(week.daylight.minutes)}`,
      prev.logged ? change(week.daylight.minutes / 60, prev.daylight.minutes / 60, ' h') : ''],
    ['Sömn', week.sleepAvg === null ? '–' : `${fmtDecimal(week.sleepAvg)} h per natt`,
      week.sleepAvg === null ? '' : change(week.sleepAvg, prev.sleepAvg, ' h')],
    ['Uppvaknanden', week.wakeupsAvg === null ? '–' : `${fmtDecimal(week.wakeupsAvg)} per natt`, ''],
    ['Ifyllt', `${week.logged} av 7 dagar`, ''],
  ];
  const list = document.createElement('dl');
  list.className = 'week-stats';
  for (const [name, value, delta] of rows) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = name;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (delta) {
      const small = document.createElement('span');
      small.className = 'week-delta';
      small.textContent = delta;
      dd.append(small);
    }
    row.append(dt, dd);
    list.append(row);
  }
  card.append(list);

  const note = document.createElement('p');
  note.className = 'week-note';
  note.textContent = weekMessage(week, prev);
  card.append(note);

  if (dismissible) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'link-btn week-close';
    close.textContent = 'Stäng';
    close.addEventListener('click', () => {
      try { localStorage.setItem(WEEK_DISMISS_KEY, dayNumToKey(weekStart(today))); } catch { /* ignoreras */ }
      card.remove();
    });
    card.append(close);
  }
  return card;
}

// Analyssidan: visas alltid. Kalendersidan: bara på måndagar, tills man stänger den.
function renderWeekly() {
  const slot = $('week-slot');
  if (!slot) return;
  slot.replaceChildren();
  const onCalendar = slot.dataset.page === 'kalender';
  if (onCalendar) {
    const today = keyToDayNum(todayKey());
    const weekday = today - weekStart(today);
    let dismissed = false;
    try { dismissed = localStorage.getItem(WEEK_DISMISS_KEY) === dayNumToKey(weekStart(today)); } catch { /* ignoreras */ }
    const lastWeekHasData = summarizeWeek(weekStart(today) - 7).logged > 0;
    if (weekday !== 0 || dismissed || !lastWeekHasData) return; // bara på måndagar
  }
  slot.append(buildWeekCard({ dismissible: onCalendar }));
}

renderWeekly();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderWeekly();
});
