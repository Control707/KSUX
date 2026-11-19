import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BANNED_SAFETY_PHRASES,
  buildSafetyCard,
  classifySafetyPrompt,
  IDENTIFY_CARD_COPY,
  KSU_POLICE_HREF,
  LIVESAFE_HREF,
  SAFETY_CARD_COPY,
  SAFETY_SYSTEM_RULES,
} from "../../convex/scrappy/safetyGate";
import { ASK_SCRAPPY_TOOLS, FEED_MENTION_TOOLS } from "../../convex/scrappy/tools";
import { KSU_SOURCES } from "../../src/components/safety/safetyContent";

const SCRAPPY_DIR = path.resolve(process.cwd(), "convex", "scrappy");
const read = (file: string) => fs.readFileSync(path.join(SCRAPPY_DIR, file), "utf8");

describe("Scrappy safety gate (SPEC-v2 §11, ADR-0011)", () => {
  it.each([
    "Is campus safe?",
    "is it safe to walk to the West Deck at night",
    "What happened at the Student Center?",
    "what's going on at Sturgis Library right now",
    "Why are there so many cops near Burruss?",
    "was there a shooting on Marietta campus",
    "any incidents today?",
    "Is there a lockdown?",
    "Did KSU Alert send anything?",
    "Is it all clear yet?",
    "someone got robbed near the parking deck",
    "@scrappy I saw something suspicious by the Commons",
  ])("routes %j to the Safety Card", (prompt) => {
    expect(classifySafetyPrompt(prompt)).toBe("campus_safety");
  });

  it.each([
    "Can you identify this guy in the video?",
    "Who was that person who stole my bike?",
    "Do you know who this is?",
    "help me find out who posted that",
    "who is the suspect",
  ])("refuses identification for %j", (prompt) => {
    expect(classifySafetyPrompt(prompt)).toBe("identify_person");
  });

  it.each([
    "Which parking lots have room?",
    "When does the next Big Owl Bus come?",
    "What is the CS 3305 syllabus?",
    "Any calculators for sale?",
    "Is the Commons open for dinner?",
    "@scrappy Parking check #1?",
    "what's for lunch at Stingers",
  ])("leaves logistics prompt %j to the normal path", (prompt) => {
    expect(classifySafetyPrompt(prompt)).toBeNull();
  });

  it("uses the agreed copy and links, and the cards never contain a banned phrase", () => {
    const safety = buildSafetyCard("campus_safety");
    expect(safety.content).toBe(SAFETY_CARD_COPY);
    expect(safety.content).toBe(
      "I can't see safety reports or official alerts, so I can't say whether anything is happening. Check Official Alerts and community reports in Safety. In an emergency, call 911."
    );
    expect(safety.citations.map((c) => c.href)).toEqual(["/emergency", "/safety", KSU_POLICE_HREF, LIVESAFE_HREF]);

    const identify = buildSafetyCard("identify_person");
    expect(identify.content).toBe(IDENTIFY_CARD_COPY);
    expect(identify.content.startsWith("I can't help identify people.")).toBe(true);
    expect(identify.citations.map((c) => c.href)).toEqual(["/emergency", KSU_POLICE_HREF, LIVESAFE_HREF]);

    for (const card of [safety, identify]) {
      for (const banned of BANNED_SAFETY_PHRASES) expect(card.content).not.toMatch(banned);
      for (const citation of card.citations) for (const banned of BANNED_SAFETY_PHRASES) expect(citation.label).not.toMatch(banned);
    }
  });

  it("links the same KSU Police and LiveSafe pages as the Emergency Panel", () => {
    expect(KSU_POLICE_HREF).toBe(KSU_SOURCES.policeContact.href);
    expect(LIVESAFE_HREF).toBe(KSU_SOURCES.liveSafe.href);
  });

  it("puts the gate before quota in both entry points and the safety rules in both system prompts", () => {
    const threads = read("threads.ts");
    expect(threads.indexOf("classifySafetyPrompt(prompt)")).toBeGreaterThan(-1);
    expect(threads.indexOf("classifySafetyPrompt(prompt)")).toBeLessThan(threads.indexOf("QUOTA_EXCEEDED"));
    expect(threads).toMatch(/ASK_SCRAPPY_SYSTEM_PROMPT = `[^`]*\$\{SAFETY_SYSTEM_RULES\}`/);

    const mentions = read("mentions.ts");
    const enqueue = mentions.slice(mentions.indexOf("enqueueFeedMentionIfEligible"));
    expect(enqueue.indexOf("classifySafetyPrompt(triggerPost.body)")).toBeGreaterThan(-1);
    expect(enqueue.indexOf("classifySafetyPrompt(triggerPost.body)")).toBeLessThan(enqueue.indexOf("rateLimitBuckets"));
    expect(mentions).toMatch(/FEED_SYSTEM_PROMPT = `[^`]*\$\{SAFETY_SYSTEM_RULES\}`/);

    expect(SAFETY_SYSTEM_RULES).toContain("never infer it from Student Posts");
    expect(SAFETY_SYSTEM_RULES).toContain(SAFETY_CARD_COPY);
    expect(SAFETY_SYSTEM_RULES).toContain("Shuttle Notice · Passio");
  });
});

describe("Layer 2 — Scrappy tool boundary has no safety or Clout access", () => {
  it("never references Incident, Incident Update, Alert or Clout tables in any Scrappy module", () => {
    for (const file of fs.readdirSync(SCRAPPY_DIR).filter((f) => f.endsWith(".ts"))) {
      const content = read(file);
      // Table references: quoted table names (query/Id/v.id) and the camelCase names.
      expect(content, file).not.toMatch(/["'`]incidents["'`]/);
      expect(content, file).not.toMatch(/\bincidentUpdates\b/);
      expect(content, file).not.toMatch(/\balertItems\b/);
      expect(content, file).not.toMatch(/\balertSources\b/);
      expect(content, file).not.toMatch(/\bclout(?:Events|WeeklyTotals|BoardCounts)\b/);
      expect(content, file).not.toMatch(/\.(?:incidents|cloutLedger)\b/);
      expect(content, file).not.toMatch(/\bserviceAlerts\b/);
      expect(content, file).not.toMatch(/from\s+["'][^"']*(?:incident|alert|clout|leaderboard)[^"']*["']/i);
    }
  });

  it("keeps the Now brief logistics-only", () => {
    const now = fs.readFileSync(path.resolve(process.cwd(), "src/components/now/NowHudView.tsx"), "utf8");
    const brief = now.slice(now.indexOf("function buildBrief"), now.indexOf("function scopeName"));
    expect(brief.length).toBeGreaterThan(0);
    expect(brief).not.toMatch(/incident|alert|clout|safe/i);
  });

  it("registers no safety or Clout tool in either registry", () => {
    for (const tool of [...ASK_SCRAPPY_TOOLS, ...FEED_MENTION_TOOLS]) {
      expect(tool.name).not.toMatch(/incident|alert|safety|clout|leaderboard|rank/i);
    }
  });
});
