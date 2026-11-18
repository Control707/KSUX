import { v, type Infer } from "convex/values";
import { campusValidator } from "../schema";
import { easternDate } from "./easternDate";

export const bannerTermPattern = /^\d{4}(01|05|08)$/;
export const bannerCoursePattern = /^[A-Z]{2,4} \d{4}[A-Z]?$/;
export const MAX_BANNER_SECTIONS = 300;
export const bannerTermKey = (term: string) => "banner_catalog:" + term;
export const bannerTermKeyPrefix = "banner_catalog:";

export const bannerSection = v.object({
  subjectCourse: v.string(), title: v.string(), crn: v.string(),
  sectionNumber: v.string(), campus: campusValidator,
  deliveryMode: v.union(v.literal("in_person"), v.literal("hybrid"), v.literal("online")),
  instructorName: v.string(),
  meetings: v.array(v.object({
    days: v.array(v.string()), startMinutes: v.number(), endMinutes: v.number(),
    timeLabel: v.string(), buildingName: v.string(), roomNumber: v.string(),
  })),
});
export type BannerSection = Infer<typeof bannerSection>;

// Compare values, not object insertion order (Convex canonicalizes stored keys).
export function bannerSectionSignature(row: Pick<BannerSection,
  "crn" | "sectionNumber" | "campus" | "deliveryMode" | "instructorName" | "meetings">) {
  return JSON.stringify([
    row.crn, row.sectionNumber, row.campus, row.deliveryMode, row.instructorName,
    row.meetings.map((m) => [m.days, m.startMinutes, m.endMinutes, m.timeLabel, m.buildingName, m.roomNumber]),
  ]);
}

export function termLabel(code: string) {
  const season = ({ "01": "Spring", "05": "Summer", "08": "Fall" } as Record<string, string>)[code.slice(4)];
  return season ? season + " " + code.slice(0, 4) : code;
}

export function activeBannerTerm(codes: string[], now = Date.now()) {
  const sorted = [...codes].sort();
  const currentMonth = easternDate(now).slice(0, 7).replace("-", "");
  return sorted.filter((code) => code <= currentMonth).at(-1) ?? sorted[0];
}

function cleanHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt|#39);/gi, (entity) =>
      ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" }[entity.toLowerCase()] ?? " "))
    .replace(/\s+/g, " ").trim();
}

function clock(hour: string, minute: string, half: string) {
  const h = Number(hour);
  const m = Number(minute);
  if (!h || h > 12 || m > 59) throw new Error("Invalid Banner meeting time");
  return (h % 12) * 60 + m + (half.toLowerCase() === "pm" ? 720 : 0);
}

export function validateBannerSections(rows: BannerSection[]) {
  if (!rows.length || rows.length > MAX_BANNER_SECTIONS) throw new Error("Unexpected Banner section count");
  const unique = new Map<string, BannerSection>();
  for (const row of rows) {
    if (!bannerCoursePattern.test(row.subjectCourse) || !/^\d{5}$/.test(row.crn)
      || !/^[A-Z0-9]{1,8}$/i.test(row.sectionNumber) || !row.title.trim() || row.title.length > 180
      || row.instructorName.length > 120 || row.meetings.length > 12
      || row.meetings.some((m) => !m.days.length || m.days.some((d) => !/^[UMTWRFS]$/.test(d))
        || !Number.isInteger(m.startMinutes) || !Number.isInteger(m.endMinutes)
        || m.startMinutes < 0 || m.endMinutes > 1440 || m.startMinutes >= m.endMinutes
        || !m.buildingName || m.buildingName.length > 160 || m.roomNumber.length > 40 || m.timeLabel.length > 60)) {
      throw new Error("Banner returned invalid section data");
    }
    const existing = unique.get(row.crn);
    if (existing && JSON.stringify(existing) !== JSON.stringify(row)) throw new Error("Conflicting Banner CRN " + row.crn);
    unique.set(row.crn, row);
  }
  return [...unique.values()].sort((a, b) => a.crn.localeCompare(b.crn));
}

export function parseBannerCoursePage(html: string, term: string, course: string): BannerSection[] {
  if (html.length > 1_000_000 || !/<\/html\s*>/i.test(html)) throw new Error("Incomplete Banner response");
  const headings = [...html.matchAll(/<th\b[^>]*>\s*<a\b[^>]*href=["'][^"']*p_disp_detail_sched\?term_in=(\d{6})(?:&amp;|&)crn_in=(\d{5})["'][^>]*>([\s\S]*?)<\/a>\s*<\/th>/gi)];
  const sectionLinks = [...html.matchAll(/<a\b[^>]*href=["'][^"']*p_disp_detail_sched\b/gi)];
  if (sectionLinks.length !== headings.length) throw new Error("Incomplete Banner section headings");
  if (!headings.length) throw new Error("No published Banner sections found for " + course + " / " + term);
  const rows: BannerSection[] = [];
  for (const [index, match] of headings.entries()) {
    if (match[1] !== term) throw new Error("Banner returned another term");
    const title = /^(.+?)\/([A-Z0-9]{1,8})\s+-\s+(.+)$/i.exec(cleanHtml(match[3]!));
    if (!title || title[1] !== course) throw new Error("Banner returned an unexpected course");
    const block = html.slice(match.index + match[0].length, headings[index + 1]?.index);
    const tableIndex = block.search(/<table\b[^>]*summary=["']This table lists the scheduled meeting/i);
    if (tableIndex === -1) throw new Error("Missing published Banner meeting table");
    const tail = block.slice(tableIndex);
    let depth = 0;
    const closingTag = [...tail.matchAll(/<\/?table\b[^>]*>/gi)].find(([tag]) => {
      depth += tag.startsWith("</") ? -1 : 1;
      return depth === 0;
    });
    if (!closingTag) throw new Error("Incomplete Banner meeting table");
    const meetingTable = tail.slice(0, closingTag.index);
    const cells = [...meetingTable.matchAll(/<td\b[^>]*class\s*=\s*["']dddefault["'][^>]*>([\s\S]*?)<\/td>/gi)];
    if (!cells.length || cells.length % 7 !== 0) throw new Error("Incomplete Banner meeting row");

    let campus: BannerSection["campus"] | undefined;
    let deliveryMode: BannerSection["deliveryMode"] = "in_person";
    const meetings: BannerSection["meetings"] = [];
    const instructors = new Set<string>();
    for (let i = 0; i < cells.length; i += 7) {
      const [site, method, where, time, , , instructor] = cells.slice(i, i + 7);
      const siteName = cleanHtml(site![1]!);
      const nextCampus = siteName === "Kennesaw Campus" ? "Kennesaw" : siteName === "Marietta Campus" ? "Marietta" : undefined;
      if (!nextCampus) {
        if (!siteName) throw new Error("Missing campus in Banner");
        continue;
      }
      if (campus && nextCampus !== campus) throw new Error("Multiple Campus values for one Banner section");
      campus = nextCampus;
      const mode = cleanHtml(method![1]!);
      deliveryMode = /hybrid/i.test(mode) ? "hybrid" : /online/i.test(mode) ? "online" : "in_person";
      const name = cleanHtml(instructor![1]!).replace(/\s*\(\s*[PS]\s*\)\s*$/, "");
      if (name && !name.includes("@")) instructors.add(name);
      const timeLabel = cleanHtml(time![1]!.split(/<br\s*\/?>/i)[0]!);
      if (!timeLabel) throw new Error("Missing Banner meeting time");
      if (/^(TBA|ARR|Arranged)$/i.test(timeLabel)) continue;
      const times = /^(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(timeLabel);
      if (!times) throw new Error("Unrecognized Banner meeting time");
      const dayMarkup = meetingTable.slice(where!.index + where![0].length, time!.index);
      const marked = [...dayMarkup.matchAll(/<td\b[^>]*>\s*(?:&nbsp;|X)\s*<\/td>/gi)];
      if (marked.length !== 7) throw new Error("Incomplete Banner meeting days");
      const days = [..."UMTWRFS"].filter((_, day) => /<td\b[^>]*>\s*X\s*<\/td>/i.test(marked[day]?.[0] ?? ""));
      const [buildingName, room] = where![1]!.split(/<br\s*\/?>/i).map(cleanHtml);
      meetings.push({
        days, startMinutes: clock(times[1]!, times[2]!, times[3]!),
        endMinutes: clock(times[4]!, times[5]!, times[6]!),
        timeLabel, buildingName: buildingName ?? "", roomNumber: (room ?? "").replace(/^Room\s+/i, ""),
      });
    }
    if (campus) rows.push({
      subjectCourse: course, title: title[3]!, sectionNumber: title[2]!, crn: match[2]!,
      campus, deliveryMode, instructorName: [...instructors].join(", ").slice(0, 120) || "Unassigned", meetings,
    });
  }
  return validateBannerSections(rows);
}

export function bannerCourseUrl(term: string, course: string) {
  if (!bannerTermPattern.test(term) || !bannerCoursePattern.test(course)) throw new Error("Use a published Banner term and course code");
  const [subject, code] = course.split(" ");
  const url = new URL("https://owlexpress.kennesaw.edu/prodban/bwckctlg.p_disp_listcrse");
  url.search = new URLSearchParams({ term_in: term, subj_in: subject!, crse_in: code!, schd_in: "E" }).toString();
  return url;
}
