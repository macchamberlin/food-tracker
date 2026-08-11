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

export function getFastingStatus(now, settings, todayEntries) {
  const { windowStart, windowEnd } = settings;
  const inWindow = isWithinWindow(now, windowStart, windowEnd);

  let hoursSinceLastMeal = null;
  if (todayEntries.length > 0) {
    const last = todayEntries.reduce((latest, e) =>
      e.timestamp > latest.timestamp ? e : latest
    );
    hoursSinceLastMeal = (now.getTime() - last.timestamp) / 3600000;
  }

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
