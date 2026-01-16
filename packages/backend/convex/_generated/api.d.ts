/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as All_Teams from "../All_Teams.js";
import type * as All_Teams_Clean from "../All_Teams_Clean.js";
import type * as NFL_seed from "../NFL_seed.js";
import type * as NFL_seed_clean from "../NFL_seed_clean.js";
import type * as brandSimilarity from "../brandSimilarity.js";
import type * as cache from "../cache.js";
import type * as crons from "../crons.js";
import type * as dataPreProcess from "../dataPreProcess.js";
import type * as dataPreProcessFull from "../dataPreProcessFull.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as jobsHelpers from "../jobsHelpers.js";
import type * as research from "../research.js";
import type * as scraperImport from "../scraperImport.js";
import type * as search from "../search.js";
import type * as searchScore from "../searchScore.js";
import type * as seedData from "../seedData.js";
import type * as similarityScoring from "../similarityScoring.js";
import type * as social from "../social.js";
import type * as socialHelpers from "../socialHelpers.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  All_Teams: typeof All_Teams;
  All_Teams_Clean: typeof All_Teams_Clean;
  NFL_seed: typeof NFL_seed;
  NFL_seed_clean: typeof NFL_seed_clean;
  brandSimilarity: typeof brandSimilarity;
  cache: typeof cache;
  crons: typeof crons;
  dataPreProcess: typeof dataPreProcess;
  dataPreProcessFull: typeof dataPreProcessFull;
  http: typeof http;
  jobs: typeof jobs;
  jobsHelpers: typeof jobsHelpers;
  research: typeof research;
  scraperImport: typeof scraperImport;
  search: typeof search;
  searchScore: typeof searchScore;
  seedData: typeof seedData;
  similarityScoring: typeof similarityScoring;
  social: typeof social;
  socialHelpers: typeof socialHelpers;
  teams: typeof teams;
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
