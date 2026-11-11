'use strict';

// Räknar ut soluppgång och solnedgång direkt i appen, utan internet.
// Bygger på soluppgångsekvationen (samma metod som NOAA använder, förenklad).
// Noggrannheten är ungefär ±2 minuter, vilket räcker för att planera en promenad.

const SUN_RAD = Math.PI / 180;
const J2000 = 2451545.0;
const DAY_IN_MS = 86400000;

// y, m (0–11), d är det lokala datumet. lat/lon i grader (öst och norr positiva).
function sunTimes(y, m, d, lat, lon) {
  const sin = (deg) => Math.sin(deg * SUN_RAD);
  const cos = (deg) => Math.cos(deg * SUN_RAD);

  const julianMidnight = Date.UTC(y, m, d) / DAY_IN_MS + 2440587.5;
  const n = Math.ceil(julianMidnight - J2000 + 0.0008);
  const meanNoon = n - lon / 360;
  const anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
  const center = 1.9148 * sin(anomaly) + 0.02 * sin(2 * anomaly) + 0.0003 * sin(3 * anomaly);
  const longitude = (anomaly + center + 180 + 102.9372) % 360;
  const transit = J2000 + meanNoon + 0.0053 * sin(anomaly) - 0.0069 * sin(2 * longitude);
  const sinDecl = sin(longitude) * sin(23.4397);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  // -0.833° tar hänsyn till solskivans storlek och ljusets brytning i atmosfären.
  const cosHourAngle = (sin(-0.833) - sin(lat) * sinDecl) / (cos(lat) * cosDecl);

  const toDate = (julian) => new Date((julian - 2440587.5) * DAY_IN_MS);
  const noon = toDate(transit);
  if (cosHourAngle > 1) return { polar: 'night', noon };
  if (cosHourAngle < -1) return { polar: 'day', noon };
  const hourAngle = Math.acos(cosHourAngle) / SUN_RAD;
  return {
    sunrise: toDate(transit - hourAngle / 360),
    sunset: toDate(transit + hourAngle / 360),
    noon,
  };
}

if (typeof module !== 'undefined') module.exports = { sunTimes };
