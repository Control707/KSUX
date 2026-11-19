export const agendaLabels = { class: "Class", deadline: "Deadline", event: "Event", study: "Study Session" } as const;

export const agendaTime = (time: number) => new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", weekday: "short",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(time);
