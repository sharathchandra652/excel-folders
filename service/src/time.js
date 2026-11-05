// India has no daylight saving, so IST is a fixed UTC+5:30 offset.
const IST_MS = 330 * 60 * 1000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Parts of a UTC instant as seen on an IST clock. */
export function ist(input) {
  const d = new Date(new Date(input).getTime() + IST_MS);
  return {
    date: d.toISOString().slice(0, 10), // YYYY-MM-DD
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    day: DAYS[d.getUTCDay()],
  };
}

/** UTC instant for 00:00 IST on a YYYY-MM-DD date. */
export function istMidnight(date) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_MS);
}

export function todayIst(now = new Date()) {
  return ist(now).date;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 05-11-2026 */
export function dmy(date) {
  const [y, m, d] = date.split('-');
  return `${d}-${m}-${y}`;
}

/** 04:53 PM */
export function clock(hour, minute) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function hourLabel(h) {
  const f = (x) => {
    const v = x % 24;
    return `${v % 12 === 0 ? 12 : v % 12} ${v < 12 ? 'AM' : 'PM'}`;
  };
  return `${f(h)} – ${f(h + 1)}`;
}
