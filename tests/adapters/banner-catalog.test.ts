import { expect, it } from "vitest";
import { activeBannerTerm, parseBannerCoursePage } from "../../convex/lib/bannerCatalog";

const published = [
  '<html><body><table><tr><th><a href="/prodban/bwckschd.p_disp_detail_sched?term_in=202608&amp;crn_in=83190">CS 3305/01 - Data Structures</a></th></tr>',
  '<tr><td><table summary="This table lists the scheduled meeting times and assigned instructors for this class."><tr>',
  '<td class="dddefault">Marietta Campus</td><td class="dddefault">Traditional F2F</td>',
  '<td class="dddefault">Atrium Building<br>Room 1010</td>',
  '<td><table><tr><td>&nbsp;</td><td>&nbsp;</td><td>X</td><td>&nbsp;</td><td>X</td><td>&nbsp;</td><td>&nbsp;</td></tr></table></td>',
  '<td class="dddefault">11:10 am - 12:30 pm<br>Lecture</td><td class="dddefault">Aug 24, 2026</td><td class="dddefault">Dec 07, 2026</td>',
  '<td class="dddefault">Example Instructor (<abbr>P</abbr>)<a href="mailto:excluded@example.test"><img alt="email"></a></td>',
  '</tr></table></td></tr></table></body></html>',
].join("");

it("parses published nested meeting data without retaining email or inventing times", () => {
  const rows = parseBannerCoursePage(published, "202608", "CS 3305");
  expect(rows).toEqual([expect.objectContaining({
    crn: "83190", campus: "Marietta", instructorName: "Example Instructor",
    meetings: [expect.objectContaining({
      days: ["T", "R"], startMinutes: 670, endMinutes: 750, buildingName: "Atrium Building", roomNumber: "1010",
    })],
  })]);
  expect(JSON.stringify(rows)).not.toContain("@");
  expect(() => parseBannerCoursePage(published.slice(0, -12), "202608", "CS 3305")).toThrow(/Incomplete/);
  expect(() => parseBannerCoursePage(published, "202701", "CS 3305")).toThrow(/another term/);
});

it("rejects a partial page when a section heading cannot be parsed", () => {
  const malformedSection = '<tr><th><a href="/prodban/bwckschd.p_disp_detail_sched?term_in=202608&amp;crn_in=83191">CS 3305/02 - Data Structures</a> extra markup</th></tr>';
  expect(() => parseBannerCoursePage(published.replace("</body>", malformedSection + "</body>"), "202608", "CS 3305")).toThrow(/Incomplete Banner section/);
});

it("rejects missing meeting times rather than clearing a known schedule", () => {
  expect(() => parseBannerCoursePage(published.replace("11:10 am - 12:30 pm", ""), "202608", "CS 3305")).toThrow(/Missing Banner meeting time/);
  expect(parseBannerCoursePage(published.replace("11:10 am - 12:30 pm", "TBA"), "202608", "CS 3305")[0]?.meetings).toEqual([]);
});

it("rejects incomplete weekday markup instead of shifting a meeting to another day", () => {
  expect(() => parseBannerCoursePage(published.replace("<td>&nbsp;</td>", "<td></td>"), "202608", "CS 3305")).toThrow(/Incomplete Banner meeting days/);
});

it("selects a new published term at the Eastern month boundary", () => {
  const codes = ["202701", "202608"];
  expect(activeBannerTerm(codes, Date.UTC(2027, 0, 1, 4, 59))).toBe("202608");
  expect(activeBannerTerm(codes, Date.UTC(2027, 0, 1, 5))).toBe("202701");
});
