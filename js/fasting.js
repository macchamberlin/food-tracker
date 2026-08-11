// Eating-window math. Windows are "HH:MM" 24h strings and may wrap past midnight
// (e.g. start=22:00, end=06:00), so all checks go through minute-of-day arithmetic.

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function isWithinWindow(date, windowStart, windowEnd) {
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  const now = minutesOfDay(date);
  if (start === end) return true; // zero-length window means "always eating" — treat as no restriction
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // wraps past midnight
}

export function getFastingStatus(now, settings, lastEntryTimestamp) {
  const { windowStart, windowEnd } = settings;
  const inWindow = isWithinWindow(now, windowStart, windowEnd);

  const hoursSinceLastMeal =
    lastEntryTimestamp != null ? (now.getTime() - lastEntryTimestamp) / 3600000 : null;

  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  const nowMin = minutesOfDay(now);

  let minutesUntilChange;
  if (inWindow) {
    minutesUntilChange = end > nowMin ? end - nowMin : end + 1440 - nowMin;
  } else {
    minutesUntilChange = start > nowMin ? start - nowMin : start + 1440 - nowMin;
  }
  const hoursUntilChange = minutesUntilChange / 60;

  return {
    inWindow,
    hoursSinceLastMeal,
    hoursUntilChange,
    label: inWindow
      ? `Eating window — closes in ${formatHours(hoursUntilChange)}`
      : `Fasting — window opens in ${formatHours(hoursUntilChange)}`,
  };
}

export function formatHours(h) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
}

// HH:MM:SS ticking display for the live fasting timer.
export function formatDuration(hours) {
  const totalSeconds = Math.max(0, Math.round(hours * 3600));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function windowLengthHours(windowStart, windowEnd) {
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  const diff = end > start ? end - start : end + 1440 - start;
  return diff / 60;
}

// How long the fast lasted between the previous day's last meal and this day's first —
// the classic "16 hours fasted" stat. Returns null if either day has no logged entries.
export function fastedHoursBeforeFirstMeal(todayEntries, prevDayEntries) {
  if (!todayEntries?.length || !prevDayEntries?.length) return null;
  const firstToday = Math.min(...todayEntries.map((e) => e.timestamp));
  const lastPrev = Math.max(...prevDayEntries.map((e) => e.timestamp));
  const hours = (firstToday - lastPrev) / 3600000;
  return hours > 0 ? hours : null;
}
