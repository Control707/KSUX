/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agenda from "../agenda.js";
import type * as auth from "../auth.js";
import type * as authNode from "../authNode.js";
import type * as chats from "../chats.js";
import type * as clout from "../clout.js";
import type * as communities from "../communities.js";
import type * as courses from "../courses.js";
import type * as crons from "../crons.js";
import type * as demo_fixtures from "../demo/fixtures.js";
import type * as demo_session from "../demo/session.js";
import type * as demo_v2Fixtures from "../demo/v2Fixtures.js";
import type * as feed from "../feed.js";
import type * as housekeeping from "../housekeeping.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_agendaItems from "../lib/agendaItems.js";
import type * as lib_bannerCatalog from "../lib/bannerCatalog.js";
import type * as lib_campusChat from "../lib/campusChat.js";
import type * as lib_chatPreview from "../lib/chatPreview.js";
import type * as lib_cloutLedger from "../lib/cloutLedger.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_diningFeeds from "../lib/diningFeeds.js";
import type * as lib_easternDate from "../lib/easternDate.js";
import type * as lib_icsParser from "../lib/icsParser.js";
import type * as lib_incidentPolicy from "../lib/incidentPolicy.js";
import type * as lib_mediaCleanup from "../lib/mediaCleanup.js";
import type * as lib_parkingCampusLine from "../lib/parkingCampusLine.js";
import type * as lib_officialAlerts from "../lib/officialAlerts.js";
import type * as lib_parkingMath from "../lib/parkingMath.js";
import type * as lib_passio from "../lib/passio.js";
import type * as lib_pushAdapter from "../lib/pushAdapter.js";
import type * as lib_safety from "../lib/safety.js";
import type * as lib_scrappyStream from "../lib/scrappyStream.js";
import type * as lib_sessionCredential from "../lib/sessionCredential.js";
import type * as lib_shuttleRead from "../lib/shuttleRead.js";
import type * as lib_smtpAdapter from "../lib/smtpAdapter.js";
import type * as lib_syllabusAdapter from "../lib/syllabusAdapter.js";
import type * as lib_syncGuard from "../lib/syncGuard.js";
import type * as lib_v2Launch from "../lib/v2Launch.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as lib_workflowTime from "../lib/workflowTime.js";
import type * as marketplace from "../marketplace.js";
import type * as moderation from "../moderation.js";
import type * as officialAlerts from "../officialAlerts.js";
import type * as parking from "../parking.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as saved from "../saved.js";
import type * as scrappy_mentions from "../scrappy/mentions.js";
import type * as scrappy_router from "../scrappy/router.js";
import type * as scrappy_safetyGate from "../scrappy/safetyGate.js";
import type * as scrappy_threads from "../scrappy/threads.js";
import type * as scrappy_tools from "../scrappy/tools.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as shell from "../shell.js";
import type * as storageNode from "../storageNode.js";
import type * as students from "../students.js";
import type * as study from "../study.js";
import type * as sync_eventsSync from "../sync/eventsSync.js";
import type * as sync_libcalSync from "../sync/libcalSync.js";
import type * as sync_transitDiningSync from "../sync/transitDiningSync.js";
import type * as transitDining from "../transitDining.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agenda: typeof agenda;
  auth: typeof auth;
  authNode: typeof authNode;
  chats: typeof chats;
  clout: typeof clout;
  communities: typeof communities;
  courses: typeof courses;
  crons: typeof crons;
  "demo/fixtures": typeof demo_fixtures;
  "demo/session": typeof demo_session;
  "demo/v2Fixtures": typeof demo_v2Fixtures;
  feed: typeof feed;
  housekeeping: typeof housekeeping;
  http: typeof http;
  incidents: typeof incidents;
  leaderboard: typeof leaderboard;
  "lib/agendaItems": typeof lib_agendaItems;
  "lib/bannerCatalog": typeof lib_bannerCatalog;
  "lib/campusChat": typeof lib_campusChat;
  "lib/chatPreview": typeof lib_chatPreview;
  "lib/cloutLedger": typeof lib_cloutLedger;
  "lib/crypto": typeof lib_crypto;
  "lib/diningFeeds": typeof lib_diningFeeds;
  "lib/easternDate": typeof lib_easternDate;
  "lib/icsParser": typeof lib_icsParser;
  "lib/incidentPolicy": typeof lib_incidentPolicy;
  "lib/mediaCleanup": typeof lib_mediaCleanup;
  "lib/parkingCampusLine": typeof lib_parkingCampusLine;
  "lib/officialAlerts": typeof lib_officialAlerts;
  "lib/parkingMath": typeof lib_parkingMath;
  "lib/passio": typeof lib_passio;
  "lib/pushAdapter": typeof lib_pushAdapter;
  "lib/safety": typeof lib_safety;
  "lib/scrappyStream": typeof lib_scrappyStream;
  "lib/sessionCredential": typeof lib_sessionCredential;
  "lib/shuttleRead": typeof lib_shuttleRead;
  "lib/smtpAdapter": typeof lib_smtpAdapter;
  "lib/syllabusAdapter": typeof lib_syllabusAdapter;
  "lib/syncGuard": typeof lib_syncGuard;
  "lib/v2Launch": typeof lib_v2Launch;
  "lib/viewer": typeof lib_viewer;
  "lib/workflowTime": typeof lib_workflowTime;
  marketplace: typeof marketplace;
  moderation: typeof moderation;
  officialAlerts: typeof officialAlerts;
  parking: typeof parking;
  push: typeof push;
  pushNode: typeof pushNode;
  saved: typeof saved;
  "scrappy/mentions": typeof scrappy_mentions;
  "scrappy/router": typeof scrappy_router;
  "scrappy/safetyGate": typeof scrappy_safetyGate;
  "scrappy/threads": typeof scrappy_threads;
  "scrappy/tools": typeof scrappy_tools;
  search: typeof search;
  seed: typeof seed;
  shell: typeof shell;
  storageNode: typeof storageNode;
  students: typeof students;
  study: typeof study;
  "sync/eventsSync": typeof sync_eventsSync;
  "sync/libcalSync": typeof sync_libcalSync;
  "sync/transitDiningSync": typeof sync_transitDiningSync;
  transitDining: typeof transitDining;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
