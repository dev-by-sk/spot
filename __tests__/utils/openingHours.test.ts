import { isPlaceOpenNow } from '@/utils/openingHours';

// Helper to build a periods JSON string
function periods(...entries: { openDay: number; openTime: string; closeDay?: number; closeTime?: string }[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      open: { day: e.openDay, time: e.openTime },
      ...(e.closeDay != null && e.closeTime != null
        ? { close: { day: e.closeDay, time: e.closeTime } }
        : {}),
    })),
  );
}

// Helper: create a Date for a specific day/time
// day: 0=Sun, 1=Mon, ... 6=Sat
function makeDate(day: number, hours: number, minutes: number): Date {
  // Jan 5 2025 is a Sunday (day 0)
  const d = new Date(2025, 0, 5 + day, hours, minutes, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Null / invalid input
// ---------------------------------------------------------------------------

describe('null and invalid input', () => {
  it('returns null for null input', () => {
    expect(isPlaceOpenNow(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(isPlaceOpenNow(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(isPlaceOpenNow('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(isPlaceOpenNow('not json')).toBeNull();
  });

  it('returns null for JSON that is not an array', () => {
    expect(isPlaceOpenNow('{"open": {"day": 1, "time": "0900"}}')).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(isPlaceOpenNow('[]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 24-hour places
// ---------------------------------------------------------------------------

describe('24-hour places', () => {
  it('returns true for a single period with no close (always open)', () => {
    const json = periods({ openDay: 0, openTime: '0000' });
    expect(isPlaceOpenNow(json, makeDate(3, 14, 30))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Same-day periods (no midnight span)
// ---------------------------------------------------------------------------

describe('same-day periods', () => {
  // Mon 9:00 AM - 5:00 PM
  const monPeriod = periods({ openDay: 1, openTime: '0900', closeDay: 1, closeTime: '1700' });

  it('returns true when within opening hours', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(1, 12, 0))).toBe(true);
  });

  it('returns true at exact opening time', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(1, 9, 0))).toBe(true);
  });

  it('returns false at exact closing time', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(1, 17, 0))).toBe(false);
  });

  it('returns false before opening time', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(1, 7, 30))).toBe(false);
  });

  it('returns false after closing time', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(1, 19, 0))).toBe(false);
  });

  it('returns false on a different day', () => {
    expect(isPlaceOpenNow(monPeriod, makeDate(2, 12, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multiple periods on the same day (lunch + dinner)
// ---------------------------------------------------------------------------

describe('multiple periods on the same day', () => {
  const lunchDinner = periods(
    { openDay: 3, openTime: '1100', closeDay: 3, closeTime: '1400' },
    { openDay: 3, openTime: '1700', closeDay: 3, closeTime: '2200' },
  );

  it('returns true during lunch', () => {
    expect(isPlaceOpenNow(lunchDinner, makeDate(3, 12, 30))).toBe(true);
  });

  it('returns true during dinner', () => {
    expect(isPlaceOpenNow(lunchDinner, makeDate(3, 19, 0))).toBe(true);
  });

  it('returns false between lunch and dinner', () => {
    expect(isPlaceOpenNow(lunchDinner, makeDate(3, 15, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Midnight-spanning periods
// ---------------------------------------------------------------------------

describe('midnight-spanning periods', () => {
  // Fri 22:00 - Sat 02:00
  const friNight = periods({ openDay: 5, openTime: '2200', closeDay: 6, closeTime: '0200' });

  it('returns true on the opening-day side (Fri 23:00)', () => {
    expect(isPlaceOpenNow(friNight, makeDate(5, 23, 0))).toBe(true);
  });

  it('returns true on the closing-day side (Sat 01:00)', () => {
    expect(isPlaceOpenNow(friNight, makeDate(6, 1, 0))).toBe(true);
  });

  it('returns false before opening (Fri 21:00)', () => {
    expect(isPlaceOpenNow(friNight, makeDate(5, 21, 0))).toBe(false);
  });

  it('returns false after closing (Sat 03:00)', () => {
    expect(isPlaceOpenNow(friNight, makeDate(6, 3, 0))).toBe(false);
  });

  it('returns false on an unrelated day (Wed 23:00)', () => {
    expect(isPlaceOpenNow(friNight, makeDate(3, 23, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Saturday → Sunday wrap (week boundary)
// ---------------------------------------------------------------------------

describe('week boundary (Sat → Sun)', () => {
  // Sat 22:00 - Sun 02:00
  const satNight = periods({ openDay: 6, openTime: '2200', closeDay: 0, closeTime: '0200' });

  it('returns true Saturday at 23:30', () => {
    expect(isPlaceOpenNow(satNight, makeDate(6, 23, 30))).toBe(true);
  });

  it('returns true Sunday at 01:00', () => {
    expect(isPlaceOpenNow(satNight, makeDate(0, 1, 0))).toBe(true);
  });

  it('returns false Sunday at 03:00', () => {
    expect(isPlaceOpenNow(satNight, makeDate(0, 3, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full week schedule
// ---------------------------------------------------------------------------

describe('full week schedule', () => {
  const fullWeek = periods(
    { openDay: 0, openTime: '1000', closeDay: 0, closeTime: '1500' }, // Sun
    { openDay: 1, openTime: '0900', closeDay: 1, closeTime: '1700' }, // Mon
    { openDay: 2, openTime: '0900', closeDay: 2, closeTime: '1700' }, // Tue
    { openDay: 3, openTime: '0900', closeDay: 3, closeTime: '1700' }, // Wed
    { openDay: 4, openTime: '0900', closeDay: 4, closeTime: '1700' }, // Thu
    { openDay: 5, openTime: '0900', closeDay: 5, closeTime: '1700' }, // Fri
    // Sat closed (no period)
  );

  it('returns true on a weekday within hours', () => {
    expect(isPlaceOpenNow(fullWeek, makeDate(2, 10, 0))).toBe(true);
  });

  it('returns false on Saturday (no period)', () => {
    expect(isPlaceOpenNow(fullWeek, makeDate(6, 12, 0))).toBe(false);
  });

  it('returns true on Sunday within shorter hours', () => {
    expect(isPlaceOpenNow(fullWeek, makeDate(0, 12, 0))).toBe(true);
  });

  it('returns false on Sunday outside shorter hours', () => {
    expect(isPlaceOpenNow(fullWeek, makeDate(0, 16, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Consecutive midnight-spanning periods
// ---------------------------------------------------------------------------

describe('consecutive midnight-spanning periods', () => {
  // Thu 22:00 - Fri 02:00, Fri 22:00 - Sat 02:00
  const consecutiveNights = periods(
    { openDay: 4, openTime: '2200', closeDay: 5, closeTime: '0200' },
    { openDay: 5, openTime: '2200', closeDay: 6, closeTime: '0200' },
  );

  it('returns true Fri at 01:00 (tail of Thu night)', () => {
    expect(isPlaceOpenNow(consecutiveNights, makeDate(5, 1, 0))).toBe(true);
  });

  it('returns true Fri at 23:00 (start of Fri night)', () => {
    expect(isPlaceOpenNow(consecutiveNights, makeDate(5, 23, 0))).toBe(true);
  });

  it('returns false Fri at 12:00 (gap between periods)', () => {
    expect(isPlaceOpenNow(consecutiveNights, makeDate(5, 12, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Periods with missing/malformed open.time
// ---------------------------------------------------------------------------

describe('malformed period data', () => {
  // BUG FOUND: a single period with no close AND no open.time was incorrectly
  // treated as a 24-hour place. Fixed by adding an open.time check to the
  // 24-hour detection.
  it('skips periods with missing open.time and returns false if no other match', () => {
    const json = JSON.stringify([
      { open: { day: 1 } }, // missing time
    ]);
    expect(isPlaceOpenNow(json, makeDate(1, 12, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG FLAG: multi-day spanning period (not produced by Google, but
// if it were, intermediate days would incorrectly return false)
// ---------------------------------------------------------------------------

// A hypothetical period open Fri 18:00 through Sun 02:00 as a single period.
// Google wouldn't return this, but the logic only checks openDay and closeDay,
// so Saturday (an intermediate day) would return false.
describe('multi-day span (hypothetical)', () => {
  const multiDay = periods({ openDay: 5, openTime: '1800', closeDay: 0, closeTime: '0200' });

  it('returns true on open day (Fri 20:00)', () => {
    expect(isPlaceOpenNow(multiDay, makeDate(5, 20, 0))).toBe(true);
  });

  it('returns true on close day (Sun 01:00)', () => {
    expect(isPlaceOpenNow(multiDay, makeDate(0, 1, 0))).toBe(true);
  });

  // FLAG: intermediate day Saturday is not handled — returns false
  // because the logic only checks day === openDay or day === closeDay.
  // Not a real-world issue since Google splits periods per-day.
  it('returns false on intermediate day Saturday (incorrect but expected)', () => {
    expect(isPlaceOpenNow(multiDay, makeDate(6, 12, 0))).toBe(false);
  });
});
