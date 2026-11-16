import { expect, test } from "@playwright/test";

test.describe("Seam 3 — KSUX 2-Tab Live WebSocket & Offline Commuter PWA Smoke (#26)", () => {
  test("exercises Welcome gate, 2-tab Judge Demo personas, Campus switcher, Parking Report, @scrappy + SSE Drafts, Deal Chat handoff, Moderation restore, Reset Demo, and Offline fallback", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();

    // 1. Cold-start Welcome Gate exposes zero real Student content before auth
    await tab1.goto(`${baseURL}/`);
    await expect(tab1.getByTestId("dual-path-welcome")).toBeVisible();
    await expect(tab1.getByTestId("welcome-edu-signin-btn")).toBeVisible();
    await expect(tab1.getByTestId("welcome-enter-demo-btn")).toBeVisible();

    // 2. Direct ?demo=1 boots straight into isolated Judge Demo Mode as Maya Patel (@maya_cs, Kennesaw)
    await tab1.goto(`${baseURL}/?demo=1`);
    const demoPill1 = tab1.getByTestId("judge-demo-pill");
    await expect(demoPill1).toContainText("Maya (Kennesaw)", {
      timeout: 20_000,
    });
    await expect(tab1.getByTestId("now-bento-hud")).toBeVisible();
    // Install prompt is hidden by default in Judge Demo Mode
    await expect(tab1.getByTestId("install-pwa-card")).toHaveCount(0);

    // 3. Copy Co-Test Link -> open Tab 2 as @alex_owl on the SAME demoSessionId without overwriting Tab 1!
    await demoPill1.click();
    await tab1.getByTestId("copy-cotest-link-btn").click();
    const previewEl = tab1.getByTestId("cotest-link-preview");
    await expect(previewEl).toBeVisible();
    const coTestUrl = await previewEl.getAttribute("data-cotest-url");
    expect(coTestUrl).toContain("persona=alex_owl");
    // Close menu on Tab 1
    await demoPill1.click();

    const tab2 = await context.newPage();
    await tab2.goto(coTestUrl!);
    const demoPill2 = tab2.getByTestId("judge-demo-pill");
    await expect(demoPill2).toContainText("Alex (Kennesaw)", {
      timeout: 20_000,
    });

    // Verify independent per-tab sessionStorage personas!
    const persona1 = await tab1.evaluate(() =>
      window.sessionStorage.getItem("ksux_demo_persona")
    );
    const persona2 = await tab2.evaluate(() =>
      window.sessionStorage.getItem("ksux_demo_persona")
    );
    expect(persona1).toBe("maya_cs");
    expect(persona2).toBe("alex_owl");
    await expect(demoPill1).toContainText("Maya");

    // 4. Campus Switcher scoping on Tab 1 (Kennesaw -> Marietta -> Kennesaw)
    await tab1.getByTestId("campus-switch-marietta").click();
    await expect(tab1.getByTestId("bento-parking-tile")).toContainText(
      "Marietta West Deck"
    );
    // Enrolled Course Hubs (CS 3305) & KM Shuttle remain preserved across Campus switch!
    await expect(tab1.getByTestId("bento-schedule-tile")).toContainText(
      "CS 3305"
    );
    await expect(tab1.getByTestId("bento-shuttle-tile")).toContainText(
      "KM Kennesaw / Marietta"
    );

    await tab1.getByTestId("campus-switch-kennesaw").click();
    await expect(tab1.getByTestId("bento-parking-tile")).toContainText(
      "Central Parking Deck"
    );

    // 5. Live Parking Report + Spot Opening sync across tabs
    await tab2.goto(`${baseURL}/parking?demo=${new URL(coTestUrl!).searchParams.get("demo")}&persona=alex_owl`);
    await expect(
      tab2.getByTestId("parking-lot-card-central-parking-deck")
    ).toBeVisible();
    await tab2.getByTestId("leaving-5min-central-parking-deck").click();
    await expect(tab2.getByTestId("parking-status-banner")).toContainText(
      "Leaving in ~5 min"
    );
    await expect(tab1.getByTestId("now-spot-opening-badge").first()).toBeVisible();

    // 6. @scrappy Feed mention + Ask Scrappy SSE with Citation Pills & Pre-Filled Draft Card
    await tab1.goto(`${baseURL}/feed`);
    await tab1.getByTestId("open-post-composer-btn").click();
    await tab1
      .getByTestId("post-composer-textarea")
      .fill("@scrappy Where are open study rooms on Kennesaw right now?");
    await tab1.getByTestId("publish-post-btn").click();
    await expect(tab1.getByTestId("feed-post-card").first()).toContainText(
      "@scrappy Where are open study rooms"
    );

    await tab1.goto(`${baseURL}/scrappy`);
    await tab1
      .getByTestId("ask-scrappy-input")
      .fill("Draft a Listing to sell my CS 3305 textbook for $40");
    await tab1.getByTestId("ask-scrappy-send-btn").click();
    await expect(tab1.getByTestId("scrappy-draft-card")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      tab1.getByTestId("scrappy-citation-pill").first()
    ).toBeVisible();

    // 7. 2-Tab Live WebSocket Deal Chat Handoff: Confirm Meetup -> Pending -> Sold -> Confirm Pickup!
    await tab1.goto(`${baseURL}/chats`);
    await tab1.getByTestId("chats-filter-deal").click();
    await tab1.getByTestId("inbox-row-deal").first().click();
    await expect(tab1.getByTestId("deal-handoff-card")).toBeVisible();
    const dealPath = new URL(tab1.url()).pathname;

    // Tab 2 (@alex_owl, seller) opens the exact same Deal Chat
    await tab2.goto(`${baseURL}${dealPath}`);
    await expect(tab2.getByTestId("deal-handoff-card")).toBeVisible();

    // Buyer (@maya_cs in Tab 1) taps Confirm Meetup -> Seller (@alex_owl in Tab 2) sees "confirmed" live!
    await tab1.getByTestId("confirm-meetup-btn").click();
    await expect(tab2.getByTestId("handoff-card-status")).toHaveText(
      /confirmed/i,
      { timeout: 10_000 }
    );

    // Seller (@alex_owl in Tab 2) marks Pending -> then Sold -> Buyer (@maya_cs in Tab 1) sees Sold live!
    await tab2.getByTestId("seller-mark-pending-btn").click();
    await expect(tab1.getByTestId("deal-listing-status-badge")).toHaveText(
      /pending/i,
      { timeout: 10_000 }
    );

    await tab2.getByTestId("seller-mark-sold-btn").click();
    await expect(tab1.getByTestId("deal-listing-status-badge")).toHaveText(
      /sold/i,
      { timeout: 10_000 }
    );

    // Primary Buyer (@maya_cs in Tab 1) taps Confirm Pickup -> both tabs show Pickup Confirmed ✓!
    await tab1.getByTestId("buyer-confirm-pickup-btn").click();
    await expect(tab2.getByTestId("pickup-confirmed-badge")).toBeVisible({
      timeout: 10_000,
    });

    // 8. Moderation Queue (Demo) restore + Reset Demo State
    await tab1.goto(`${baseURL}/moderation`);
    await expect(tab1.getByTestId("moderation-queue-view")).toBeVisible();
    await tab1.getByTestId("moderation-restore-btn").first().click();
    await expect(tab1.getByTestId("moderation-queue-view")).toContainText(
      "All clear"
    );

    await tab1.getByTestId("judge-demo-pill").click();
    await tab1.getByTestId("reset-demo-state-btn").click();
    // Pre-quarantined item re-appears cleanly after Reset Demo State!
    await expect(tab1.getByTestId("moderation-restore-btn").first()).toBeVisible({
      timeout: 10_000,
    });

    // 9. Warm Now HUD & Parking GeoJSON, verify zero chatMessages in ksux_commuter_cache, then go Offline!
    await tab1.goto(`${baseURL}/`);
    await expect(tab1.getByTestId("bento-schedule-tile")).toContainText(
      "CS 3305"
    );
    await tab1.goto(`${baseURL}/parking`);
    await expect(tab1.getByTestId("campus-geo-map")).toBeVisible();

    const cacheBeforeOffline = await tab1.evaluate(() =>
      window.localStorage.getItem("ksux_commuter_cache")
    );
    expect(cacheBeforeOffline).toBeTruthy();
    expect(cacheBeforeOffline).not.toContain("chatMessages");
    expect(cacheBeforeOffline).not.toContain("Taking the KM Big Owl Bus");

    await context.setOffline(true);
    await tab1.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(tab1.getByTestId("offline-commuter-banner")).toBeVisible();
    await expect(tab1.getByTestId("map-offline-zero-tile-badge")).toBeVisible();

    // Exit Judge Demo Mode wipes ksux_commuter_cache immediately
    await context.setOffline(false);
    await tab1.evaluate(() => window.dispatchEvent(new Event("online")));
    await tab1.getByTestId("judge-demo-pill").click();
    await tab1.getByTestId("verify-edu-from-demo-btn").click();

    const cacheAfterExit = await tab1.evaluate(() =>
      window.localStorage.getItem("ksux_commuter_cache")
    );
    expect(cacheAfterExit).toBeNull();

    await context.close();
  });
});
