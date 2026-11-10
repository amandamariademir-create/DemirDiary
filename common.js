'use strict';

// Delas av dagboken (index.html) och analyssidan (analys.html).

/* ---------- Inställningar ---------- */

const STORAGE_KEY = 'demirdiary.v1';
const DEFAULT_CYCLE_LENGTH = 28;
const DEFAULT_PERIOD_LENGTH = 5;
const LUTEAL_PHASE = 14; // ägglossningen sker ungefär 14 dagar före nästa mens
const PREDICTED_CYCLES = 3; // hur många kommande menstillfällen som visas i kalendern

const MARKS = [
  { value: 'none', label: 'Inget' },
  { value: 'period', label: 'Mens' },
  { value: 'ovulation', label: 'Ägglossning' },
];
// Äldre sparade uppgifter hade mängd mens. Lätt, medel och kraftig blir "mens".
const LEGACY_PERIOD_FLOWS = new Set(['light', 'medium', 'heavy']);

const MOODS = [
  { value: 1, emoji: '😢', label: 'Mycket dåligt' },
  { value: 2, emoji: '🙁', label: 'Dåligt' },
  { value: 3, emoji: '😐', label: 'Okej' },
  { value: 4, emoji: '🙂', label: 'Bra' },
  { value: 5, emoji: '😄', label: 'Mycket bra' },
];

const ACTIVITIES = [
  { key: 'exercise', label: 'Träning', emoji: '🏃' },
  { key: 'daylight', label: 'Dagsljus', emoji: '☀️' },
];
const MAX_MINUTES = 1440;

const minutesOf = (entry, key) => (typeof entry?.[key] === 'number' ? entry[key] : null);
const formatMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/* ---------- Datum ---------- */

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dagnummer räknas i UTC så att sommartid inte ger fel antal dagar.
function keyToDayNum(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}
function dayNumToKey(n) {
  const dt = new Date(n * DAY_MS);
  return toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
function todayKey() {
  const t = new Date();
  return toKey(t.getFullYear(), t.getMonth(), t.getDate());
}
function formatDayNum(n, opts = { day: 'numeric', month: 'long' }) {
  return new Date(n * DAY_MS).toLocaleDateString('sv-SE', { ...opts, timeZone: 'UTC' });
}

/* ---------- Lagring ---------- */

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const entry = {};
  const mark = raw.mark ?? (LEGACY_PERIOD_FLOWS.has(raw.flow) ? 'period' : undefined);
  if (mark === 'period' || mark === 'ovulation') entry.mark = mark;
  const mood = Number(raw.mood);
  if (MOODS.some((m) => m.value === mood)) entry.mood = mood;
  // Träning och dagsljus sparas i minuter. "true" kommer från en äldre version
  // där man bara markerade ja/nej, och betyder att tiden saknas.
  for (const a of ACTIVITIES) {
    const v = raw[a.key];
    const minutes = Math.round(Number(v));
    if (v === true || v === 'on') entry[a.key] = true;
    else if (v !== null && v !== '' && v !== undefined && Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_MINUTES) {
      entry[a.key] = minutes;
    }
  }
  if (typeof raw.note === 'string' && raw.note.trim()) entry.note = raw.note.slice(0, 2000);
  return Object.keys(entry).length ? entry : null;
}

function sanitizeEntries(raw) {
  const clean = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const [key, value] of Object.entries(raw)) {
    if (!KEY_RE.test(key)) continue;
    const entry = sanitizeEntry(value);
    if (entry) clean[key] = entry;
  }
  return clean;
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return sanitizeEntries(JSON.parse(raw).entries);
  } catch {
    return {};
  }
}

const $ = (id) => document.getElementById(id);

/* ---------- App (PWA) ---------- */

// Gör att sidan kan installeras på hemskärmen och fungera utan internet.
// Fungerar bara när sidan är publicerad (https), inte när index.html öppnas som fil.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Be webbläsaren att inte rensa dagboken automatiskt när det blir ont om utrymme.
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((done) => done || navigator.storage.persist()).catch(() => {});
}
