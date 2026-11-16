/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authNode from "../authNode.js";
import type * as courses from "../courses.js";
import type * as crons from "../crons.js";
import type * as demo_fixtures from "../demo/fixtures.js";
import type * as demo_session from "../demo/session.js";
import type * as feed from "../feed.js";
import type * as housekeeping from "../housekeeping.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_icsParser from "../lib/icsParser.js";
import type * as lib_parkingMath from "../lib/parkingMath.js";
import type * as lib_safety from "../lib/safety.js";
import type * as lib_smtpAdapter from "../lib/smtpAdapter.js";
import type * as lib_syllabusAdapter from "../lib/syllabusAdapter.js";
import type * as lib_viewer from "../lib/viewer.js";
import type * as moderation from "../moderation.js";
import type * as seed from "../seed.js";
import type * as shell from "../shell.js";
import type * as storageNode from "../storageNode.js";
import type * as students from "../students.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authNode: typeof authNode;
  courses: typeof courses;
  crons: typeof crons;
  "demo/fixtures": typeof demo_fixtures;
  "demo/session": typeof demo_session;
  feed: typeof feed;
  housekeeping: typeof housekeeping;
  "lib/crypto": typeof lib_crypto;
  "lib/icsParser": typeof lib_icsParser;
  "lib/parkingMath": typeof lib_parkingMath;
  "lib/safety": typeof lib_safety;
  "lib/smtpAdapter": typeof lib_smtpAdapter;
  "lib/syllabusAdapter": typeof lib_syllabusAdapter;
  "lib/viewer": typeof lib_viewer;
  moderation: typeof moderation;
  seed: typeof seed;
  shell: typeof shell;
  storageNode: typeof storageNode;
  students: typeof students;
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
