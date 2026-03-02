interface Period {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

/**
 * Determines if a place is currently open based on Google Places periods data.
 * Returns `true` if open, `false` if closed, `null` if data is missing/unparseable.
 */
export function isPlaceOpenNow(
  periodsJson: string | null | undefined,
  now?: Date,
): boolean | null {
  if (!periodsJson) return null;

  let periods: Period[];
  try {
    periods = JSON.parse(periodsJson);
  } catch {
    return null;
  }

  if (!Array.isArray(periods) || periods.length === 0) return null;

  // 24-hour place: single period with no close (and valid open time)
  if (periods.length === 1 && !periods[0].close && periods[0].open?.time) {
    return true;
  }

  const d = now ?? new Date();
  const day = d.getDay(); // 0 = Sunday
  const currentTime = d.getHours() * 100 + d.getMinutes(); // e.g. 1430

  for (const period of periods) {
    if (!period.open?.time) continue;

    const openDay = period.open.day;
    const openTime = parseInt(period.open.time, 10);

    if (!period.close) {
      if (openDay === day && currentTime >= openTime) return true;
      continue;
    }

    const closeDay = period.close.day;
    const closeTime = parseInt(period.close.time, 10);

    const spansMidnight = closeDay !== openDay || closeTime < openTime;

    if (spansMidnight) {
      if (day === openDay && currentTime >= openTime) return true;
      if (day === closeDay && currentTime < closeTime) return true;
    } else {
      if (day === openDay && currentTime >= openTime && currentTime < closeTime) {
        return true;
      }
    }
  }

  return false;
}
