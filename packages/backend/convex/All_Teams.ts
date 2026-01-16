// packages/backend/convex/All_Teams.ts

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all rows from All_Teams.
 * This is used by the action that processes and cleans the data.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("All_Teams").collect();
  },
});

/**
 * Optional helper: get a single row by ID.
 */
export const getById = query({
  args: { id: v.id("All_Teams") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Optional: allow inserting new seed records.
 * Not required for your preprocessing pipeline, but useful for development.
 */
export const insert = mutation({
  args: {
        name: v.string(),
      region: v.optional(v.union(v.string(), v.null())),
      league: v.optional(v.union(v.string(), v.null())),
      target_demographic: v.optional(v.union(v.string(), v.null())),
      official_url: v.optional(v.union(v.string(), v.null())),
      category: v.optional(v.union(v.string(), v.null())),
      logo_url: v.optional(v.union(v.string(), v.null())),
      geo_city: v.optional(v.union(v.string(), v.null())),
      geo_country: v.optional(v.union(v.string(), v.null())),
      
      city_population: v.optional(v.union(v.number(), v.null())),
      metro_gdp_millions: v.optional(v.union(v.number(), v.null())),
      followers_x: v.optional(v.union(v.number(), v.null())),
      followers_instagram: v.optional(v.union(v.number(), v.null())),
      followers_facebook: v.optional(v.union(v.number(), v.null())),
      followers_tiktok: v.optional(v.union(v.number(), v.null())),
      subscribers_youtube: v.optional(v.union(v.number(), v.null())),
      avg_game_attendance: v.optional(v.union(v.number(), v.null())),
      
      family_program_count: v.optional(v.union(v.number(), v.null())),
      family_program_types: v.optional(v.union(v.array(v.string()), v.null())),
      owns_stadium: v.optional(v.union(v.boolean(), v.null())),
      stadium_name: v.optional(v.union(v.string(), v.null())),
      sponsors: v.optional(v.union(v.any(), v.null())),
      
      avg_ticket_price: v.optional(v.union(v.number(), v.null())),
      franchise_value_millions: v.optional(v.union(v.number(), v.null())),
      annual_revenue_millions: v.optional(v.union(v.number(), v.null())),
      
      mission_tags: v.optional(v.union(v.array(v.string()), v.null())),
      community_programs: v.optional(v.union(v.array(v.string()), v.null())),
      cause_partnerships: v.optional(v.union(v.array(v.string()), v.null())),
      enrichments_applied: v.optional(v.union(v.array(v.string()), v.null())),
      last_enriched: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("All_Teams", args);
  },
});