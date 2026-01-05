import { v } from "convex/values";
import { internalQuery, internalMutation, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Cache result type for internal use
const cachedTeamSchema = v.object({
  name: v.string(),
  league: v.string(),
  sport: v.string(),
  city: v.string(),
  state: v.string(),
  region: v.string(),
  marketSize: v.string(),
  brandValues: v.array(v.string()),
  reasoning: v.string(),
  pros: v.array(v.string()),
  cons: v.array(v.string()),
  estimatedSponsorshipRange: v.optional(v.object({
    min: v.number(),
    max: v.number(),
  })),
  socialHandles: v.optional(v.object({
    twitter: v.optional(v.string()),
    instagram: v.optional(v.string()),
    tiktok: v.optional(v.string()),
    facebook: v.optional(v.string()),
  })),
  website: v.optional(v.string()),
  confidence: v.number(),
});

const filtersSchema = v.object({
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  regions: v.optional(v.array(v.string())),
  demographics: v.optional(v.array(v.string())),
  brandValues: v.optional(v.array(v.string())),
  leagues: v.optional(v.array(v.string())),
  goals: v.optional(v.array(v.string())),
});

// Get cached results by query hash
export const getCachedResults = internalQuery({
  args: { queryHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("researchCache")
      .withIndex("by_hash", (q) => q.eq("queryHash", args.queryHash))
      .first();
  },
});

// Cache new results
export const cacheResults = internalMutation({
  args: {
    queryHash: v.string(),
    query: v.string(),
    filters: filtersSchema,
    results: v.array(cachedTeamSchema),
    ttlHours: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + (args.ttlHours * 60 * 60 * 1000);
    
    // Check if entry exists and update, or create new
    const existing = await ctx.db
      .query("researchCache")
      .withIndex("by_hash", (q) => q.eq("queryHash", args.queryHash))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        results: args.results,
        createdAt: now,
        expiresAt,
      });
      return existing._id;
    }
    
    return await ctx.db.insert("researchCache", {
      queryHash: args.queryHash,
      query: args.query,
      filters: args.filters,
      results: args.results,
      createdAt: now,
      expiresAt,
      hitCount: 0,
    });
  },
});

// Increment cache hit count
export const incrementHitCount = internalMutation({
  args: { cacheId: v.id("researchCache") },
  handler: async (ctx, args) => {
    const cache = await ctx.db.get(args.cacheId);
    if (cache) {
      await ctx.db.patch(args.cacheId, {
        hitCount: cache.hitCount + 1,
      });
    }
  },
});

// Clean up expired cache entries (called by cron job)
export const cleanExpiredCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    const expired = await ctx.db
      .query("researchCache")
      .withIndex("by_expiry")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }
    
    return { deletedCount: expired.length };
  },
});

// Get cache statistics
export const getCacheStats = query({
  args: {},
  handler: async (ctx) => {
    const allCache = await ctx.db.query("researchCache").collect();
    
    const now = Date.now();
    const activeEntries = allCache.filter(c => c.expiresAt > now);
    const expiredEntries = allCache.filter(c => c.expiresAt <= now);
    const totalHits = allCache.reduce((sum, c) => sum + c.hitCount, 0);
    
    return {
      totalEntries: allCache.length,
      activeEntries: activeEntries.length,
      expiredEntries: expiredEntries.length,
      totalHits,
      averageHitsPerEntry: allCache.length > 0 ? totalHits / allCache.length : 0,
    };
  },
});

// Invalidate cache by query (useful for admin operations)
export const invalidateCache = mutation({
  args: { queryHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.queryHash) {
      const entry = await ctx.db
        .query("researchCache")
        .withIndex("by_hash", (q) => q.eq("queryHash", args.queryHash))
        .first();
      
      if (entry) {
        await ctx.db.delete(entry._id);
        return { deleted: 1 };
      }
      return { deleted: 0 };
    }
    
    // Clear all cache
    const all = await ctx.db.query("researchCache").collect();
    for (const entry of all) {
      await ctx.db.delete(entry._id);
    }
    return { deleted: all.length };
  },
});

// Extend TTL for high-value cache entries
export const extendCacheTTL = internalMutation({
  args: {
    cacheId: v.id("researchCache"),
    additionalHours: v.number(),
  },
  handler: async (ctx, args) => {
    const cache = await ctx.db.get(args.cacheId);
    if (cache) {
      const newExpiry = cache.expiresAt + (args.additionalHours * 60 * 60 * 1000);
      await ctx.db.patch(args.cacheId, { expiresAt: newExpiry });
    }
  },
});

