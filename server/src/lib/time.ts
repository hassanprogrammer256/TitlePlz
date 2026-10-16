/** Short relative label: "just now", "4m ago", "3h ago", "2d ago". */
export function timeAgo(date: Date | number, now: number = Date.now()): string {
  const diff = Math.max(0, now - (typeof date === 'number' ? date : date.getTime()));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Countdown as HH:MM:SS (hours may exceed 99). Zero once expired. */
export function formatRemaining(until: Date | number, now: number = Date.now()): string {
  const total = Math.max(0, Math.floor(((typeof until === 'number' ? until : until.getTime()) - now) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
