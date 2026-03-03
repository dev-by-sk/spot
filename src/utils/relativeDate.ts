const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

export function relativeDate(dateString: string): string {
  const now = Date.now();
  // Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by default,
  // which causes off-by-one-day bugs in negative UTC offsets. Append a time
  // component to force local midnight parsing instead.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? `${dateString}T00:00:00`
    : dateString;
  const then = new Date(normalized).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return h === 1 ? '1 hour ago' : `${h} hours ago`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    if (d === 1) return 'yesterday';
    return `${d} days ago`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return w === 1 ? '1 week ago' : `${w} weeks ago`;
  }
  if (seconds < YEAR) {
    const m = Math.floor(seconds / MONTH);
    return m === 1 ? '1 month ago' : `${m} months ago`;
  }
  const y = Math.floor(seconds / YEAR);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}
