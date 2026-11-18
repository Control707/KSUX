# Remaining screen migrations

Phase 0 ([#72](https://github.com/Control707/KSUX/issues/72)) shipped the Direction C tokens, the shell, the shared primitives and the shared map frame. These screens still carry v1 styling and are Phase 1A work. Until each one migrates, the `a11y` job checks only the shell chrome around it, and its file stays on the px-text allow-list in `tests/unit/a11y-static-boundaries.test.ts`.

When a screen migrates: use the tokens and primitives, remove its file from the allow-list, and move its route into the full-page axe list in `tests/a11y/shell.spec.ts`.

| Screen | File | Known v1 gaps |
|---|---|---|
| Welcome, OTP, onboarding | `shell/WelcomeGate.tsx`, `auth/EduOtpModal.tsx`, `auth/OnboardingFlow.tsx` | px text; the OTP modal must move to `Dialog` with paste and `autocomplete="one-time-code"` |
| Now | `now/NowHudView.tsx` | px text; Scrappy brief headline; "All KSU" scope copy |
| Feed | `feed/FeedView.tsx` | px text; composer and replies must use `Dialog`; stream rename to "All KSU" |
| Marketplace | `marketplace/MarketplaceView.tsx`, `DealHandoffPanel.tsx` | px text; photo-first Listings and gallery; sell form in `Dialog` |
| Chats | `chats/ChatsInboxView.tsx`, `ChatThreadView.tsx` | px text; pinned composer; message announcements |
| Scrappy | `scrappy/ScrappyView.tsx` | px text; pinned composer; streamed-answer announcements |
| Parking | `parking/ParkingView.tsx` | Layout A bottom sheet; no-estimate display; reuse `StatusChip` |
| Transit | `transit/TransitView.tsx` | Layout A; route code/pattern identity; stale-bus rules; ≤2 min announcements |
| Study, Dining, Events, Clubs, Course Hubs | `study/`, `dining/`, `communities/`, `courses/` | px text; unlabelled selects; campus badges |
| Profile, Moderation | `profile/ProfileView.tsx`, `moderation/ModerationQueueView.tsx` | px text; Report dialog moves to `Dialog` |
| Shared | `shared/CampusEntityCard.tsx`, `shared/ReportTrigger.tsx`, `pwa/PwaSupport.tsx` | px text; Report menu rename to "Report to KSUX moderators" |

## Shared-map follow-ups

- The map follows the light Positron basemap until Parking and Transit gain the dark theme in Phase 1A; then switch to OpenFreeMap dark with the theme.
- Route line patterns (solid, dashed, dotted) and bus stale styling arrive with the Transit Layout A work ([#67](https://github.com/Control707/KSUX/issues/67)).
- The Incidents layer arrives with Phase 1B.
