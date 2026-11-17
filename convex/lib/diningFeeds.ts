import { easternDate } from "./easternDate";
import { fetchUpstreamWithRetry, type UpstreamFetchFn } from "./syncGuard";

export const KSU_DINING_HOURS = "https://campus.kennesaw.edu/offices-services/dining/hours-locations.php";
export const KSU_NUTRISLICE = "https://ksu.nutrislice.com/menu/";
const NUTRISLICE_API = "https://ksu.api.nutrislice.com/menu/api";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

type OpenHours = { openMin: number; closeMin: number } | null;
type DiningHours = {
  byDay: Array<OpenHours | undefined>;
  closedDates: Array<{ start: string; end: string }>;
};
type DiningVenueIdentity = { slug: string; name: string; campus: "Kennesaw" | "Marietta" };

function cleanHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&(?:ndash|mdash|#8211|#8212);/gi, "-")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:rsquo|lsquo|apos|#39|#8217);/gi, "'")
    .replace(/\s+/g, " ").trim();
}

function nameKey(name: string) {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseClock(value: string, period: string): number | null {
  const [hour, minute = "0"] = value.split(":").map((part) => part.trim());
  const h = Number(hour);
  const m = Number(minute);
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  return (h % 12) * 60 + m + (period.toLowerCase() === "pm" ? 720 : 0);
}

function weekdayIndices(value: string): number[] {
  const matches = [...value.toLowerCase().matchAll(new RegExp(DAYS.join("|"), "g"))]
    .map((match) => DAYS.indexOf(match[0]));
  if (matches.length !== 2 || !/[-–—]/.test(value)) return matches;
  const days = [matches[0]!];
  while (days[days.length - 1] !== matches[1]!) days.push((days[days.length - 1]! + 1) % 7);
  return days;
}

function parseVenueHours(section: string): Array<OpenHours | undefined> {
  const body = section.split(/<ul\b/i)[0] ?? section;
  const lines = body.split(/<\/(?:p|div)>|<br\b[^>]*>/i).map(cleanHtml);
  const byDay: Array<OpenHours | undefined> = Array(7).fill(undefined);
  const ends = /^(\d{1,2}(?::\s*\d{2})?)\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}(?::\s*\d{2})?)\s*(AM|PM)\b/i;
  for (const line of lines) {
    const [days, value] = line.split("|").map((chunk) => chunk.trim());
    if (!days || !value) continue;
    const indices = weekdayIndices(days);
    if (/^closed\b/i.test(value)) {
      for (const day of indices) byDay[day] = null;
      continue;
    }
    const match = ends.exec(value);
    if (!match) continue;
    const closeMin = parseClock(match[3]!, match[4]!);
    let openMin = parseClock(match[1]!, match[2] ?? match[4]!);
    if (openMin !== null && closeMin !== null && openMin >= closeMin && !match[2]) {
      openMin = parseClock(match[1]!, match[4]!.toLowerCase() === "am" ? "PM" : "AM");
    }
    if (openMin === null || closeMin === null || closeMin <= openMin) continue;
    for (const day of indices) byDay[day] = { openMin, closeMin };
  }
  return byDay;
}

function campusClosures(section: string, semesterYear: number): DiningHours["closedDates"] {
  const lines = section.split(/<\/(?:p|div|li)>|<br\b[^>]*>/i).map(cleanHtml);
  const dates = new RegExp(`(${MONTHS.join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?`, "gi");
  return lines.flatMap((line) => {
    if (!/all locations closed/i.test(line)) return [];
    const matches = [...line.matchAll(dates)];
    const first = matches[0];
    const last = matches[matches.length - 1];
    if (!first || !last) return [];
    const format = (match: RegExpMatchArray, year: number) => [
      String(year), String(MONTHS.indexOf(match[1]!.toLowerCase()) + 1).padStart(2, "0"), match[2]!.padStart(2, "0"),
    ].join("-");
    const firstYear = Number(first[3] ?? semesterYear);
    const lastYear = Number(last[3] ?? (MONTHS.indexOf(last[1]!.toLowerCase()) < MONTHS.indexOf(first[1]!.toLowerCase())
      ? firstYear + 1 : firstYear));
    return [{ start: format(first, firstYear), end: format(last, lastYear) }];
  });
}

const VENUE_HEADINGS: Record<string, string> = {
  "the-commons": "The Commons Dining Hall",
  stingers: "Stingers Dining Hall",
  "j-building": "STACKS",
  "hisso-sushi": "Hissho Sushi + Nobi-Cha Bubble Tea",
  "high-point-cafe": "High Point Café",
};

export function parseOfficialDiningHours(html: string, venues: DiningVenueIdentity[]) {
  const headings = [...html.matchAll(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/gi)];
  const semester = headings.map((heading) => cleanHtml(heading[1]!))
    .find((heading) => /\b20\d{2}\s+hours of operation/i.test(heading));
  const semesterYear = Number(semester?.match(/\b20\d{2}\b/)?.[0]);
  const importantDates = headings.findIndex((heading) => /^important dates$/i.test(cleanHtml(heading[1]!)));
  const closedDates = importantDates >= 0 && Number.isFinite(semesterYear)
    ? campusClosures(html.slice(headings[importantDates]!.index, headings[importantDates + 1]?.index), semesterYear)
    : [];
  let campus: DiningVenueIdentity["campus"] | undefined;
  const hours: Array<{ slug: string; hoursScheduleJson: string }> = [];

  for (const [index, section] of headings.entries()) {
    const heading = cleanHtml(section[1]!);
    if (heading === "Kennesaw Campus" || heading === "Marietta Campus") {
      campus = heading.startsWith("Kennesaw") ? "Kennesaw" : "Marietta";
      continue;
    }
    const key = nameKey(heading);
    const venue = venues.find((candidate) => candidate.campus === campus
      && nameKey(VENUE_HEADINGS[candidate.slug] ?? candidate.name) === key);
    if (!venue) continue;
    const htmlSection = html.slice(section.index! + section[0].length, headings[index + 1]?.index);
    const byDay = parseVenueHours(htmlSection);
    if (byDay.every((day) => day === undefined)) continue;
    // JSON has no undefined array entry. Leave missing days out of the map.
    const posted = Object.fromEntries(byDay.flatMap((day, index) => day === undefined ? [] : [[index, day]]));
    hours.push({ slug: venue.slug, hoursScheduleJson: JSON.stringify({ byDay: posted, closedDates }) });
  }
  return hours;
}

export async function fetchOfficialDiningHours(venues: DiningVenueIdentity[], fetchImpl?: UpstreamFetchFn) {
  const response = await fetchUpstreamWithRetry(KSU_DINING_HOURS, { headers: { Accept: "text/html" } }, fetchImpl);
  return parseOfficialDiningHours(await response.text(), venues);
}

type MenuItem = { name: string; calories?: number; dietaryTags?: string[]; allergens?: string[] };
type MenuStation = { name: string; items: MenuItem[] };
type School = { slug: string; id: number; types: Array<{ id: number; name: string }> };

export async function fetchNutrisliceDirectory(fetchImpl?: UpstreamFetchFn): Promise<School[]> {
  const response = await fetchUpstreamWithRetry(`${NUTRISLICE_API}/schools/?format=json`,
    { headers: { Accept: "application/json" } }, fetchImpl);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid Nutrislice school directory");
  return rows.flatMap((row) => {
    if (typeof row?.slug !== "string" || !Number.isSafeInteger(row?.id) || !Array.isArray(row.active_menu_types)) return [];
    const types = row.active_menu_types.filter((menu: any) => Number.isSafeInteger(menu?.id) && typeof menu.name === "string")
      .map((menu: any) => ({ id: Number(menu.id), name: String(menu.name).slice(0, 100) }));
    return [{ slug: row.slug, id: row.id, types }];
  });
}

const DIETARY_ICONS = new Map([
  ["vegan", "vegan"],
  ["vegetarian", "vegetarian"],
  ["gluten-free", "gluten_free"],
  ["halal", "halal_friendly"],
]);
const ALLERGEN_ICONS = new Map([
  ["dairy", ["milk"]],
  ["wheat", ["wheat"]],
  ["egg", ["egg"]],
  ["soy", ["soy"]],
  ["fish", ["fish"]],
  ["sesame", ["sesame"]],
  ["crustaceans", ["shellfish"]],
  ["peanuts", ["peanuts"]],
  ["tree-nuts", ["tree_nuts"]],
  ["coconut", ["coconut"]],
  ["may-contain-nuts", ["peanuts", "tree_nuts"]],
]);

function parseFoodLabels(food: {
  dietary_tags?: unknown;
  allergens?: unknown;
  icons_approved?: unknown;
  icons?: { food_icons?: unknown } | null;
}) {
  const dietary = Array.isArray(food.dietary_tags)
    ? food.dietary_tags.filter((tag): tag is string => typeof tag === "string") : undefined;
  const reportedAllergens = Array.isArray(food.allergens)
    && food.allergens.every((item): item is string => typeof item === "string" && item.trim().length > 0)
    ? food.allergens : undefined;
  const dietaryTags = new Set(dietary);
  const allergens = new Set(reportedAllergens);
  let hasRecognizedIcon = false;
  let hasUnknownIcon = false;

  if (food.icons_approved === true && Array.isArray(food.icons?.food_icons)) {
    for (const icon of food.icons.food_icons) {
      if (icon?.enabled === false) continue;
      if (icon?.enabled !== true || typeof icon.slug !== "string") {
        hasUnknownIcon = true;
        continue;
      }
      const dietaryTag = DIETARY_ICONS.get(icon.slug);
      const allergenTags = ALLERGEN_ICONS.get(icon.slug);
      if (dietaryTag) dietaryTags.add(dietaryTag);
      for (const allergen of allergenTags ?? []) allergens.add(allergen);
      if (dietaryTag || allergenTags) hasRecognizedIcon = true;
      else if (icon.slug !== "pork" && icon.slug !== "honey") hasUnknownIcon = true;
    }
  }

  return {
    dietaryTags: dietaryTags.size > 0 || dietary !== undefined ? [...dietaryTags] : undefined,
    // Empty/unapproved live icon lists are not evidence of an allergen review. Only
    // explicit normalized data or a usable approved icon report can pass the exclusion filter.
    allergens: reportedAllergens !== undefined || (hasRecognizedIcon && !hasUnknownIcon)
      ? [...allergens] : undefined,
  };
}

function parseMenuDay(week: any, date: string): MenuItem[] | undefined {
  const day = Array.isArray(week?.days) ? week.days.find((row: any) => row?.date === date) : undefined;
  if (!day || day.has_unpublished_menus || !Array.isArray(day.menu_items)) return undefined;
  return day.menu_items.flatMap((entry: any) => {
    const food = entry?.food;
    if (entry?.is_section_title || typeof food?.name !== "string" || !food.name.trim()) return [];
    const calories = food.rounded_nutrition_info?.calories;
    return [{ name: food.name.trim().slice(0, 120),
      calories: Number.isFinite(calories) ? calories : undefined, ...parseFoodLabels(food) }];
  });
}

export async function fetchNutrisliceMenus(schools: School[], venueSlugs: Set<string>, now: number, fetchImpl?: UpstreamFetchFn) {
  const today = easternDate(now);
  const tomorrow = easternDate(now, 1);
  const jobs = schools.filter((school) => venueSlugs.has(school.slug)).flatMap((school) =>
    school.types.map((type) => ({ school, type })));
  const venues = new Map<string, { today: MenuStation[]; tomorrow: MenuStation[]; incomplete: boolean }>();
  for (let offset = 0; offset < Math.min(200, jobs.length); offset += 8) {
    await Promise.all(jobs.slice(offset, Math.min(200, offset + 8)).map(async ({ school, type }) => {
      let venue = venues.get(school.slug);
      if (!venue) {
        venue = { today: [], tomorrow: [], incomplete: false };
        venues.set(school.slug, venue);
      }
      const fetchWeek = async (date: string) => {
        const path = date.replaceAll("-", "/");
        const response = await fetchUpstreamWithRetry(`${NUTRISLICE_API}/weeks/school/${school.id}/menu-type/${type.id}/${path}`,
          { headers: { Accept: "application/json" } }, fetchImpl);
        return response.json();
      };
      try {
        const week = await fetchWeek(today);
        const todaysItems = parseMenuDay(week, today);
        const tomorrowsItems = parseMenuDay(week, tomorrow)
          ?? parseMenuDay(await fetchWeek(tomorrow), tomorrow);
        if (!todaysItems || !tomorrowsItems) {
          venue.incomplete = true;
          return;
        }
        if (todaysItems.length) venue.today.push({ name: type.name, items: todaysItems });
        if (tomorrowsItems.length) venue.tomorrow.push({ name: type.name, items: tomorrowsItems });
      } catch {
        venue.incomplete = true;
      }
    }));
  }
  for (const job of jobs.slice(200)) {
    const venue = venues.get(job.school.slug);
    if (venue) venue.incomplete = true;
  }
  return [...venues].flatMap(([slug, result]) => result.incomplete ? [] : [{
    slug, todayMenuDateET: today, tomorrowMenuDateET: tomorrow,
    todayMenuJson: JSON.stringify({ stations: result.today.sort((a, b) => a.name.localeCompare(b.name)) }),
    tomorrowMenuJson: JSON.stringify({ stations: result.tomorrow.sort((a, b) => a.name.localeCompare(b.name)) }),
  }]);
}
