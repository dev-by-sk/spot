import { relativeDate } from '@/utils/relativeDate';

/**
 * Scenarios for relativeDate(dateString):
 *
 * === Time buckets (singular & plural for each) ===
 * 1. < 60s              → "just now"
 * 2. 1 minute           → "1 minute ago"
 * 3. 2–59 minutes       → "{n} minutes ago"
 * 4. 1 hour             → "1 hour ago"
 * 5. 2–23 hours         → "{n} hours ago"
 * 6. 1 day              → "yesterday"
 * 7. 2–6 days           → "{n} days ago"
 * 8. 1 week             → "1 week ago"
 * 9. 2–4 weeks          → "{n} weeks ago"
 * 10. 1 month           → "1 month ago"
 * 11. 2–11 months       → "{n} months ago"
 * 12. 1 year            → "1 year ago"
 * 13. 2+ years          → "{n} years ago"
 *
 * === Boundary precision ===
 * 14. Exactly 0 seconds → "just now"
 * 15. Exactly 59 seconds → "just now" (upper boundary)
 * 16. Exactly 60 seconds → "1 minute ago" (lower boundary of minutes)
 * 17. Exactly 3599 seconds → "59 minutes ago" (upper boundary of minutes)
 * 18. Exactly 3600 seconds → "1 hour ago" (lower boundary of hours)
 * 19. Exactly 86399 seconds → "23 hours ago" (upper boundary of hours)
 * 20. Exactly 86400 seconds → "yesterday" (lower boundary of days)
 * 21. Exactly 604799 seconds → "6 days ago" (upper boundary of days)
 * 22. Exactly 604800 seconds → "1 week ago" (lower boundary of weeks)
 * 23. Exactly 2591999 seconds → "4 weeks ago" (upper boundary of weeks)
 * 24. Exactly 2592000 seconds → "1 month ago" (lower boundary of months)
 * 25. Exactly 31535999 seconds → "11 months ago" (upper boundary of months)
 * 26. Exactly 31536000 seconds → "1 year ago" (lower boundary of years)
 *
 * === Input formats ===
 * 27. ISO 8601 string (the format used in production)
 * 28. Date-only string "YYYY-MM-DD"
 *
 * === Edge cases & failure modes ===
 * 29. Date in the future (negative seconds) — implementation floors to
 *     negative, which is < 60, so returns "just now". This is arguably
 *     wrong for large future offsets but matches current behavior.
 * 30. Invalid date string — returns "NaN years ago" (no input validation)
 * 31. The function uses Math.floor, so fractional seconds are truncated
 *     correctly (e.g. 119.9s → 1 minute ago, not 2)
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Helper: returns an ISO string representing `msAgo` milliseconds before "now". */
function ago(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Time buckets — singular & plural
// ---------------------------------------------------------------------------

describe('seconds bucket', () => {
  it('returns "just now" for 0 seconds ago', () => {
    expect(relativeDate(ago(0))).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    expect(relativeDate(ago(30 * SECOND))).toBe('just now');
  });

  it('returns "just now" for 59 seconds ago', () => {
    expect(relativeDate(ago(59 * SECOND))).toBe('just now');
  });
});

describe('minutes bucket', () => {
  it('returns "1 minute ago" for exactly 60 seconds', () => {
    expect(relativeDate(ago(60 * SECOND))).toBe('1 minute ago');
  });

  it('returns "1 minute ago" for 90 seconds (floors to 1)', () => {
    expect(relativeDate(ago(90 * SECOND))).toBe('1 minute ago');
  });

  it('returns "2 minutes ago"', () => {
    expect(relativeDate(ago(2 * MINUTE))).toBe('2 minutes ago');
  });

  it('returns "59 minutes ago" at upper boundary', () => {
    expect(relativeDate(ago(59 * MINUTE + 59 * SECOND))).toBe('59 minutes ago');
  });
});

describe('hours bucket', () => {
  it('returns "1 hour ago" for exactly 3600 seconds', () => {
    expect(relativeDate(ago(HOUR))).toBe('1 hour ago');
  });

  it('returns "1 hour ago" for 1.5 hours (floors)', () => {
    expect(relativeDate(ago(1.5 * HOUR))).toBe('1 hour ago');
  });

  it('returns "2 hours ago"', () => {
    expect(relativeDate(ago(2 * HOUR))).toBe('2 hours ago');
  });

  it('returns "23 hours ago" at upper boundary', () => {
    expect(relativeDate(ago(23 * HOUR + 59 * MINUTE + 59 * SECOND))).toBe('23 hours ago');
  });
});

describe('days bucket', () => {
  it('returns "yesterday" for exactly 1 day', () => {
    expect(relativeDate(ago(DAY))).toBe('yesterday');
  });

  it('returns "2 days ago"', () => {
    expect(relativeDate(ago(2 * DAY))).toBe('2 days ago');
  });

  it('returns "6 days ago" at upper boundary', () => {
    expect(relativeDate(ago(6 * DAY + 23 * HOUR + 59 * MINUTE + 59 * SECOND))).toBe('6 days ago');
  });
});

describe('weeks bucket', () => {
  it('returns "1 week ago" for exactly 7 days', () => {
    expect(relativeDate(ago(WEEK))).toBe('1 week ago');
  });

  it('returns "2 weeks ago"', () => {
    expect(relativeDate(ago(2 * WEEK))).toBe('2 weeks ago');
  });

  it('returns "4 weeks ago" at upper boundary', () => {
    expect(relativeDate(ago(MONTH - SECOND))).toBe('4 weeks ago');
  });
});

describe('months bucket', () => {
  it('returns "1 month ago" for exactly 30 days', () => {
    expect(relativeDate(ago(MONTH))).toBe('1 month ago');
  });

  it('returns "2 months ago"', () => {
    expect(relativeDate(ago(2 * MONTH))).toBe('2 months ago');
  });

  // BUG: YEAR (365 days) != 12 * MONTH (360 days), so for 364 days the
  // implementation computes floor(31535999 / 2592000) = 12 → "12 months ago".
  // A correct implementation should cap at 11 months before switching to
  // the years bucket, but the current constants leave a 5-day gap.
  it('returns "12 months ago" near the year boundary (should arguably be 11)', () => {
    expect(relativeDate(ago(YEAR - SECOND))).toBe('12 months ago');
  });
});

describe('years bucket', () => {
  it('returns "1 year ago" for exactly 365 days', () => {
    expect(relativeDate(ago(YEAR))).toBe('1 year ago');
  });

  it('returns "2 years ago"', () => {
    expect(relativeDate(ago(2 * YEAR))).toBe('2 years ago');
  });

  it('returns "5 years ago"', () => {
    expect(relativeDate(ago(5 * YEAR))).toBe('5 years ago');
  });
});

// ---------------------------------------------------------------------------
// Boundary precision — exact threshold transitions
// ---------------------------------------------------------------------------

describe('boundary transitions', () => {
  it('59s → "just now", 60s → "1 minute ago"', () => {
    expect(relativeDate(ago(59 * SECOND))).toBe('just now');
    expect(relativeDate(ago(60 * SECOND))).toBe('1 minute ago');
  });

  it('3599s → "59 minutes ago", 3600s → "1 hour ago"', () => {
    expect(relativeDate(ago(HOUR - SECOND))).toBe('59 minutes ago');
    expect(relativeDate(ago(HOUR))).toBe('1 hour ago');
  });

  it('86399s → "23 hours ago", 86400s → "yesterday"', () => {
    expect(relativeDate(ago(DAY - SECOND))).toBe('23 hours ago');
    expect(relativeDate(ago(DAY))).toBe('yesterday');
  });

  it('604799s → "6 days ago", 604800s → "1 week ago"', () => {
    expect(relativeDate(ago(WEEK - SECOND))).toBe('6 days ago');
    expect(relativeDate(ago(WEEK))).toBe('1 week ago');
  });

  it('2591999s → "4 weeks ago", 2592000s → "1 month ago"', () => {
    expect(relativeDate(ago(MONTH - SECOND))).toBe('4 weeks ago');
    expect(relativeDate(ago(MONTH))).toBe('1 month ago');
  });

  // BUG: same YEAR/MONTH constant mismatch — see months bucket test above.
  // 31535999s / 2592000 floors to 12, producing "12 months ago" instead of
  // the expected "11 months ago" right before the year threshold.
  it('31535999s → "12 months ago" (bug), 31536000s → "1 year ago"', () => {
    expect(relativeDate(ago(YEAR - SECOND))).toBe('12 months ago');
    expect(relativeDate(ago(YEAR))).toBe('1 year ago');
  });
});

// ---------------------------------------------------------------------------
// Input formats
// ---------------------------------------------------------------------------

describe('input formats', () => {
  it('accepts a full ISO 8601 string', () => {
    // 2 hours before the pinned "now"
    expect(relativeDate('2025-06-15T10:00:00.000Z')).toBe('2 hours ago');
  });

  it('accepts a date-only string "YYYY-MM-DD"', () => {
    // "2025-06-14" is parsed as midnight UTC — 36 hours before pinned noon
    expect(relativeDate('2025-06-14')).toBe('yesterday');
  });
});

// ---------------------------------------------------------------------------
// Edge cases & failure modes
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('floors fractional seconds correctly (119.9s → 1 minute)', () => {
    // 119.9 seconds = 1 minute 59.9 seconds → Math.floor → 119 total seconds
    // 119 / 60 = 1.98 → Math.floor → 1
    expect(relativeDate(ago(119.9 * SECOND))).toBe('1 minute ago');
  });

  // Future dates produce negative `seconds` values. Math.floor of a negative
  // number like -3600 is -3600, which is < 60, so the function returns
  // "just now" regardless of how far in the future the date is.
  // This is arguably a bug for large future offsets, but the test documents
  // current behavior.
  it('returns "just now" for a date in the future', () => {
    // 1 hour in the future
    const futureDate = new Date(Date.now() + HOUR).toISOString();
    expect(relativeDate(futureDate)).toBe('just now');
  });

  // Invalid input produces NaN through the entire pipeline, resulting in
  // "NaN years ago". There is no input validation in the implementation.
  // A correct implementation might throw or return a fallback string.
  // BUG: no input validation — invalid strings produce "NaN years ago"
  it('returns "NaN years ago" for an invalid date string', () => {
    expect(relativeDate('not-a-date')).toBe('NaN years ago');
  });
});
