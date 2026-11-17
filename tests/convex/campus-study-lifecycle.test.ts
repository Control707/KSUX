import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestConvex,
  createVerifiedTestStudent,
} from "../helpers/convexTestEnv";

const HOUR = 60 * 60_000;

async function setupStudyRoom() {
  const t = createTestConvex();
  const host = await createVerifiedTestStudent(t, {
    handle: "study_workshop_host",
    displayName: "Workshop Host",
  });
  const studyRoomId = await t.run((ctx) =>
    ctx.db.insert("studyRooms", {
      slug: "library-workshop",
      campus: "Kennesaw",
      buildingName: "Library",
      roomNumber: "Room A",
      roomKind: "libcal",
      capacity: 6,
      amenities: [],
    })
  );
  return { t, host, studyRoomId };
}

describe("Study Session lifecycle and LibCal snapshots", () => {
  afterEach(() => vi.useRealTimers());

  it("returns an unclaimed seat to the Study Session so another Student can join", async () => {
    const { t, host, studyRoomId } = await setupStudyRoom();
    const first = await createVerifiedTestStudent(t, {
      handle: "first_study_guest",
      displayName: "First Guest",
    });
    const second = await createVerifiedTestStudent(t, {
      handle: "second_study_guest",
      displayName: "Second Guest",
    });
    const startTime = Date.now() + HOUR;
    const { sessionId } = await t.mutation(api.study.createStudySession, {
      sessionToken: host.sessionToken,
      studyRoomId,
      title: "Open Library Workshop",
      visibility: "campus_open",
      startTime,
      endTime: startTime + HOUR,
      maxSeats: 2,
    });
    const toggle = (sessionToken: string) =>
      t.mutation(api.study.toggleStudySessionAttendance, { sessionToken, sessionId });

    expect(await toggle(first.sessionToken)).toMatchObject({ attending: true, seatCount: 2 });
    await expect(toggle(second.sessionToken)).rejects.toThrow(/seats.*filled/);
    expect(await toggle(first.sessionToken)).toMatchObject({ attending: false, seatCount: 1 });
    expect(await toggle(second.sessionToken)).toMatchObject({ attending: true, seatCount: 2 });
  });

  it("updates the Study Session Group Chat member count when an attendee leaves", async () => {
    const { t, host, studyRoomId } = await setupStudyRoom();
    const guest = await createVerifiedTestStudent(t, {
      handle: "departing_study_guest",
      displayName: "Departing Study Guest",
    });
    const startTime = Date.now() + HOUR;
    const { sessionId, groupChatId } = await t.mutation(api.study.createStudySession, {
      sessionToken: host.sessionToken,
      studyRoomId,
      title: "Open Library Workshop",
      visibility: "campus_open",
      startTime,
      endTime: startTime + HOUR,
      maxSeats: 2,
    });
    const toggle = () => t.mutation(api.study.toggleStudySessionAttendance, {
      sessionToken: guest.sessionToken,
      sessionId,
    });

    expect(await toggle()).toMatchObject({ attending: true, seatCount: 2 });
    expect(await toggle()).toMatchObject({ attending: false, seatCount: 1 });
    const chat = await t.run((ctx) => ctx.db.get(groupChatId));
    expect(chat?.memberCount).toBe(1);
  });

  it("keeps the original Group Chat lock time when End Session is retried", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const startTime = Date.parse("2026-11-17T15:00:00Z");
    vi.setSystemTime(startTime);
    const { t, host, studyRoomId } = await setupStudyRoom();
    const { sessionId, groupChatId } = await t.mutation(api.study.createStudySession, {
      sessionToken: host.sessionToken,
      studyRoomId,
      title: "Open Library Workshop",
      visibility: "campus_open",
      startTime,
      endTime: startTime + 2 * HOUR,
      maxSeats: 4,
    });
    const end = () => t.mutation(api.study.endStudySession, {
      sessionToken: host.sessionToken,
      sessionId,
    });

    vi.setSystemTime(startTime + HOUR / 2);
    await end();
    const firstLock = await t.run((ctx) => ctx.db.get(groupChatId));
    expect(firstLock?.readonlyAfter).toBe(startTime + HOUR / 2 + 24 * HOUR);

    vi.setSystemTime(startTime + HOUR);
    await end();
    const secondLock = await t.run((ctx) => ctx.db.get(groupChatId));
    expect(secondLock?.readonlyAfter).toBe(firstLock?.readonlyAfter);
  });

  it("warns when any half-hour in a confirmed Study Session remains open on LibCal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const startTime = Date.parse("2026-11-17T15:00:00Z");
    vi.setSystemTime(startTime - HOUR);
    const { t, host, studyRoomId } = await setupStudyRoom();
    await t.run((ctx) => ctx.db.insert("studyRoomSnapshots", {
      studyRoomId,
      dateET: "2026-11-17",
      slotMask48: 1n << 21n,
      updatedAt: Date.now(),
    }));
    const { sessionId } = await t.mutation(api.study.createStudySession, {
      sessionToken: host.sessionToken,
      studyRoomId,
      title: "Open Library Workshop",
      visibility: "campus_open",
      startTime,
      endTime: startTime + HOUR,
      libcalHostConfirmed: true,
      maxSeats: 4,
    });
    const data = await t.query(api.study.listStudyRoomsAndSessions, {
      sessionToken: host.sessionToken,
      dateChoice: "today",
    });

    expect(data.rooms[0]?.openHalfHourSlotsCount).toBe(1);
    expect(data.sessions.find((session) => session._id === sessionId)).toMatchObject({
      unreservedLibCalWarning: true,
    });
  });

  it("selects the next Eastern calendar day when fall-back Sunday has 25 hours", async () => {
    const { t, host } = await setupStudyRoom();
    const data = await t.query(api.study.listStudyRoomsAndSessions, {
      sessionToken: host.sessionToken,
      dateChoice: "tomorrow",
      nowOverride: Date.parse("2026-11-01T04:30:00Z"),
    });

    expect(data.targetDateET).toBe("2026-11-02");
  });
});
