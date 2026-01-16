// packages/backend/convex/NFL_seed.ts

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all rows from NFL_seed.
 * This is used by the action that processes and cleans the data.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("NFL_seed").collect();
  },
});

/**
 * Optional helper: get a single row by ID.
 */
export const getById = query({
  args: { id: v.id("NFL_seed") },
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
    region: v.string(),
    league: v.string(),
    official_url: v.string(),
    game_attendance: v.optional(v.number()),
    valuation: v.optional(v.number()),
    instagram_followers: v.optional(v.number()),
    brand_values: v.optional(v.string()),
    current_partners: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("NFL_seed", args);
  },
});