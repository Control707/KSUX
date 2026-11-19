import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { classDestination, classMeetings, classTrip, nextClass, type Schedule } from "../../src/lib/classWayfinding";
import { placesFromGeoJson } from "../../src/lib/campusPlaces";

const places = placesFromGeoJson(JSON.parse(fs.readFileSync("public/data/campus-buildings.geojson", "utf8")));
function schedule(entries: Partial<Schedule["privateClasses"][number]>[]): Schedule {
  return { enrolledCourses: [], personalDeadlines: [], privateClasses: entries.map((entry, index) => ({
    termCode: "202608", key: String(index), title: "Private class", days: ["R"], startMinutes: 600, ...entry,
  })) };
}

describe("next-class wayfinding", () => {
  it("sorts both campuses in Eastern time, ignores a previous/future semester and rolls over a week", () => {
    const data = schedule([
      { title: "Later Kennesaw", startMinutes: 720, location: "Burruss Building 101" },
      { title: "Next Marietta", startMinutes: 600, location: "Engineering Technology Center Room 201" },
      { title: "Old semester", termCode: "202601", startMinutes: 590 },
      { title: "Future semester", termCode: "202701", startMinutes: 580 },
    ]);
    const meeting = nextClass(data, Date.parse("2026-11-19T14:00:00Z"))!;
    expect(meeting.title).toBe("Next Marietta");
    expect(new Date(meeting.startsAt).toISOString()).toBe("2026-11-19T15:00:00.000Z");
    expect(classDestination(meeting, places)?.campus).toBe("Marietta");
    const later = nextClass(data, Date.parse("2026-11-19T18:00:00Z"))!;
    expect(new Date(later.startsAt).toISOString()).toBe("2026-11-26T15:00:00.000Z");
  });

  it("keeps the same wall-clock meeting across the DST change", () => {
    const meeting = nextClass(schedule([{ days: ["M"] }]), Date.parse("2026-10-31T23:00:00Z"))!;
    expect(new Date(meeting.startsAt).toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(nextClass(schedule([{ days: ["M"] }]), Date.parse("2026-12-31T20:00:00Z"))).toBeNull();
  });

  it("uses an imported matched meeting once and retains Banner room and Campus", () => {
    const data = schedule([{ sectionId: "section" as never, location: undefined }]);
    data.enrolledCourses = [{
      enrollmentId: "enrollment", sectionId: "section", courseHubId: "hub", subjectCourse: "CS 3305", title: "Data structures",
      termCode: "202608", campus: "Marietta", deliveryMode: "in_person",
      meetings: [{ days: ["M"], startMinutes: 700, endMinutes: 750, timeLabel: "", buildingName: "Engineering Technology Center", roomNumber: "201" }],
    }] as Schedule["enrolledCourses"];
    expect(classMeetings(data)).toMatchObject([{ startMinutes: 600, campus: "Marietta", room: "201", location: "Engineering Technology Center" }]);
    data.privateClasses = [];
    expect(classMeetings(data)).toMatchObject([{ startMinutes: 700, campus: "Marietta", room: "201" }]);
  });

  it("resolves building aliases with rooms, leaves online and unknown locations usable without guessing", () => {
    const data = schedule([{ location: "Burruss Building Room 101" }, { location: "Online via Zoom" }, { location: "Lab 201" }]);
    const [building, online, unmatched] = classMeetings(data);
    expect(classDestination(building!, places)?.name).toBe("Burruss Building");
    expect(classDestination(online!, places)).toBeNull();
    expect(classDestination(unmatched!, places)).toBeNull();
    expect(online?.online).toBe(true);
  });

  it("finds destination stops on both campuses and the real KM connection from a saved Kennesaw stop", () => {
    const k = places.find((place) => place.name === "Burruss Building")!;
    const m = places.find((place) => place.name === "Engineering Technology Center")!;
    expect(classTrip(k, { campus: "Kennesaw", name: "Campus" })?.stop.campus).toBe("Kennesaw");
    expect(classTrip(m, { campus: "Marietta", name: "Campus" })?.stop.campus).toBe("Marietta");
    const trip = classTrip(m, { campus: "Kennesaw", stopId: "361", name: "Rec Center" })!;
    expect(trip).toMatchObject({ crossCampus: true, route: { shortName: "KM" }, boarding: { stopId: "361" }, stop: { campus: "Marietta" } });
  });
});
