/** Device-local calendar date as YYYY-MM-DD (not UTC). */
export function localToday(): string {
  return formatLocalDate(new Date());
}

/**
 * Workout / plan "today". When lateNightUntilHour is set (e.g. 2), times before that
 * hour still count as the previous calendar day so late finishes land on yesterday's plan.
 */
export function workoutToday(lateNightUntilHour?: number | null): string {
  const d = new Date();
  const hour = lateNightUntilHour ?? 0;
  if (hour > 0 && d.getHours() < hour) {
    d.setDate(d.getDate() - 1);
  }
  return formatLocalDate(d);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatLocalDate(dt);
}

export function filterUpcomingDays<T extends { date: string }>(days: T[], from = localToday()): T[] {
  return days.filter((d) => d.date >= from).sort((a, b) => a.date.localeCompare(b.date));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an instant with time; add weekday + month day when not today/tomorrow. */
export function formatFastWhen(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dayIso = formatLocalDate(d);
  const today = formatLocalDate(new Date(nowMs));
  const tomorrow = addDaysIso(today, 1);
  const yesterday = addDaysIso(today, -1);
  if (dayIso === today) return `today at ${time}`;
  if (dayIso === tomorrow) return `tomorrow at ${time}`;
  if (dayIso === yesterday) return `yesterday at ${time}`;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} at ${time}`;
}
