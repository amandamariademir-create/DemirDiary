'use strict';

// "Idag" överst på kalendersidan: dagsljus kvar och mjuka serier (streaks).
// Använder entries, $, showToast och datumfunktionerna från common.js och app.js.

/* ---------- Plats ---------- */

const LOCATION_KEY = 'demirdiary.location';

const CITIES = [
  ['Stockholm', 59.33, 18.07], ['Göteborg', 57.71, 11.97], ['Malmö', 55.6, 13.0],
  ['Uppsala', 59.86, 17.64], ['Västerås', 59.61, 16.55], ['Örebro', 59.27, 15.21],
  ['Linköping', 58.41, 15.62], ['Norrköping', 58.59, 16.19], ['Helsingborg', 56.05, 12.69],
  ['Jönköping', 57.78, 14.16], ['Lund', 55.7, 13.19], ['Växjö', 56.88, 14.81],
  ['Karlstad', 59.38, 13.5], ['Gävle', 60.67, 17.14], ['Falun', 60.61, 15.63],
  ['Sundsvall', 62.39, 17.31], ['Östersund', 63.18, 14.64], ['Umeå', 63.83, 20.26],
  ['Luleå', 65.58, 22.15], ['Kiruna', 67.86, 20.23], ['Visby', 57.64, 18.3],
  ['Kalmar', 56.66, 16.36], ['Halmstad', 56.67, 12.86], ['Borås', 57.72, 12.94],
];

function readLocation() {
  try {
    const loc = JSON.parse(localStorage.getItem(LOCATION_KEY));
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && typeof loc.name === 'string') return loc;
  } catch { /* ignoreras */ }
  return null;
}

function saveLocation(loc) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    showToast('Kunde inte spara platsen i den här webbläsaren.');
  }
}

/* ---------- Dagsljus ---------- */

const clock = (date) => date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function sunFor(date, loc) {
  return sunTimes(date.getFullYear(), date.getMonth(), date.getDate(), loc.lat, loc.lon);
}

// Väljer vad som ska stå i rutan beroende på var på dagen man är.
function sunMessage(now, loc) {
  const sun = sunFor(now, loc);
  if (sun.polar === 'night') return { icon: '🌙', main: 'Solen går inte upp idag', sub: 'Det är polarnatt där du är.' };
  if (sun.polar === 'day') return { icon: '☀️', main: 'Solen går inte ner idag', sub: 'Midnattssol – dagsljus hela dygnet.' };

  const { sunrise, sunset } = sun;
  const dayLength = sunset - sunrise;
  const progress = Math.min(1, Math.max(0, (now - sunrise) / dayLength));
  const bar = { sunrise, sunset, progress };

  if (now < sunrise) {
    const lunch = sunset.getHours() >= 13 ? ' Hinner du en lunchpromenad?' : '';
    return {
      icon: '🌅',
      main: `Solen går upp ${clock(sunrise)} och ner ${clock(sunset)}`,
      sub: `${formatDuration(dayLength)} dagsljus idag.${lunch}`,
      bar,
    };
  }

  if (now < sunset) {
    const left = sunset - now;
    let tip;
    if (left < 45 * 60000) tip = 'Passa på att gå ut nu!';
    else if (now.getHours() < 12) tip = 'Hinner du en lunchpromenad?';
    else tip = 'Hinner du en promenad innan det blir mörkt?';
    return { icon: '☀️', main: `Solen går ner ${clock(sunset)}`, sub: `${formatDuration(left)} dagsljus kvar. ${tip}`, bar };
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const next = sunFor(tomorrow, loc);
  return {
    icon: '🌙',
    main: `Solen har gått ner för idag (${clock(sunset)})`,
    sub: next.sunrise ? `I morgon går den upp ${clock(next.sunrise)}.` : '',
    bar,
  };
}

function renderSun() {
  const loc = readLocation();
  const card = $('sun-card');
  if (!loc) {
    card.hidden = true;
    $('sun-setup').hidden = false;
    $('sun-setup-intro').hidden = false;
    return;
  }
  card.hidden = false;

  const msg = sunMessage(new Date(), loc);
  $('sun-icon').textContent = msg.icon;
  $('sun-main').textContent = msg.main;
  $('sun-sub').textContent = msg.sub;

  const minutes = minutesOf(entries[todayKey()], 'daylight');
  $('sun-logged').textContent = minutes ? `Du har varit ute ${formatMinutes(minutes)} idag ☀️` : '';
  $('sun-logged').hidden = !minutes;

  const bar = $('sun-bar');
  bar.hidden = !msg.bar;
  if (msg.bar) {
    $('sun-bar-fill').style.width = `${msg.bar.progress * 100}%`;
    $('sun-bar-start').textContent = clock(msg.bar.sunrise);
    $('sun-bar-end').textContent = clock(msg.bar.sunset);
    bar.setAttribute('aria-label', `Dagsljus från ${clock(msg.bar.sunrise)} till ${clock(msg.bar.sunset)}`);
  }
  $('sun-place').textContent = `${loc.name} · tiderna är ungefärliga (±3 min)`;
}

function setupLocationPicker() {
  const select = $('sun-city');
  for (const [name] of CITIES) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const city = CITIES.find(([name]) => name === select.value);
    if (!city) return;
    saveLocation({ name: city[0], lat: city[1], lon: city[2] });
    select.value = '';
    $('sun-setup').hidden = true;
    renderSun();
  });

  // Position kräver att sidan är publicerad (https). Annars visas bara orterna.
  const geoButton = $('sun-geo');
  geoButton.hidden = !('geolocation' in navigator) || !window.isSecureContext;
  geoButton.addEventListener('click', () => {
    geoButton.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoButton.disabled = false;
        // Avrundas till en decimal (ungefär 10 km) – mer behövs inte för soltiderna.
        const round = (v) => Math.round(v * 10) / 10;
        saveLocation({ name: 'Din position', lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) });
        $('sun-setup').hidden = true;
        renderSun();
      },
      () => {
        geoButton.disabled = false;
        showToast('Kunde inte hämta din position. Välj en ort i listan i stället.');
      },
      { maximumAge: 24 * 3600 * 1000, timeout: 15000 },
    );
  });

  $('sun-change').addEventListener('click', () => {
    const setup = $('sun-setup');
    setup.hidden = !setup.hidden;
    $('sun-setup-intro').hidden = true;
  });
}

/* ---------- Mjuka serier ---------- */

// En serie räknar dagar med aktiviteten. Den tål en missad dag (en vilodag)
// och bryts först när två dagar i rad saknas. Idag räknas inte som missad
// förrän dagen är slut.
function softStreak(key) {
  const today = keyToDayNum(todayKey());
  const done = (d) => !!entries[dayNumToKey(d)]?.[key];
  const doneToday = done(today);
  const chain = [];
  let missesInRow = 0;
  for (let d = doneToday ? today : today - 1; d > today - 3660; d--) {
    if (done(d)) {
      chain.push(true);
      missesInRow = 0;
    } else {
      missesInRow++;
      if (missesInRow >= 2) break;
      chain.push(false);
    }
  }
  while (chain.length && !chain[chain.length - 1]) chain.pop(); // en serie börjar alltid med en gjord dag
  const days = chain.filter(Boolean).length;
  const restDays = chain.length - days;
  const atRisk = days > 0 && !doneToday && !done(today - 1);
  return { days, restDays, doneToday, atRisk, done, today };
}

function renderStreaks() {
  const root = $('streaks');
  root.replaceChildren();
  for (const a of ACTIVITIES) {
    const s = softStreak(a.key);
    const tile = document.createElement('div');
    tile.className = `streak${s.atRisk ? ' at-risk' : ''}`;

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = `${a.emoji} ${a.label} i serie`;

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = s.days ? `${s.days} ${s.days === 1 ? 'dag' : 'dagar'}` : '–';

    const sub = document.createElement('span');
    sub.className = 'stat-sub';
    if (!s.days) sub.textContent = 'Gör det idag så startar en ny serie.';
    else if (s.doneToday) sub.textContent = `Klart idag ✓${s.restDays ? ` · ${s.restDays} ${s.restDays === 1 ? 'vilodag' : 'vilodagar'}` : ''}`;
    else if (s.atRisk) sub.textContent = 'Igår var vilodag – gör det idag så håller serien.';
    else sub.textContent = 'Inte gjort idag än. Serien håller även om du vilar idag.';

    // De senaste 7 dagarna som prickar, äldst till vänster.
    const dots = document.createElement('span');
    dots.className = 'streak-dots';
    const states = [];
    for (let d = s.today - 6; d <= s.today; d++) {
      const dot = document.createElement('span');
      const isDone = s.done(d);
      dot.className = `streak-dot${isDone ? ` done act-${a.key}` : ''}${d === s.today ? ' today' : ''}`;
      dots.append(dot);
      states.push(isDone ? 'gjort' : d === s.today ? 'inte än' : 'missat');
    }
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', `Senaste 7 dagarna: ${states.join(', ')}`);

    tile.append(label, value, sub, dots);
    root.append(tile);
  }
}

/* ---------- Start ---------- */

function renderToday() {
  renderSun();
  renderStreaks();
}

setupLocationPicker();
renderToday();

// Uppdatera tiden kvar varje minut, och allt när man kommer tillbaka till appen.
setInterval(renderSun, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderToday();
});
