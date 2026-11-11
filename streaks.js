'use strict';

// Mjuka serier (streaks) för träning och dagsljus, som visas på analyssidan.
// Använder entries från analys.js och $, ACTIVITIES och datumfunktionerna från common.js.

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

renderStreaks();

// Räkna om när man kommer tillbaka till appen, till exempel en ny dag.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderStreaks();
});
