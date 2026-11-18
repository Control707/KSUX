export const scheduleWeekdays = [
  ["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["R", "Thu"],
  ["F", "Fri"], ["S", "Sat"], ["U", "Sun"],
] as const;

export function scheduleTimeInput(minutes: number): string {
  return [Math.floor(minutes / 60), minutes % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatPrivateClassMeeting(entry: {
  days: string[];
  startMinutes: number;
  endMinutes?: number;
  location?: string;
}): string {
  const days = scheduleWeekdays.filter(([code]) => entry.days.includes(code)).map(([, day]) => day).join(", ");
  const start = scheduleTimeInput(entry.startMinutes);
  const end = entry.endMinutes === undefined ? "" : "–" + scheduleTimeInput(entry.endMinutes);
  return [days + " " + start + end + " ET", entry.location].filter(Boolean).join(" · ");
}
