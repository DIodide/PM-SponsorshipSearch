import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all teams with optional filtering
export const list = query({
  args: {
    league: v.optional(v.string()),
    sport: v.optional(v.string()),
    region: v.optional(v.string()),
    marketSize: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let teamsQuery = ctx.db.query("teams");
    
    if (args.league) {
      teamsQuery = ctx.db.query("teams").withIndex("by_league", (q) => q.eq("league", args.league!));
    } else if (args.sport) {
      teamsQuery = ctx.db.query("teams").withIndex("by_sport", (q) => q.eq("sport", args.sport!));
    } else if (args.region) {
      teamsQuery = ctx.db.query("teams").withIndex("by_region", (q) => q.eq("region", args.region!));
    } else if (args.marketSize) {
      teamsQuery = ctx.db.query("teams").withIndex("by_marketSize", (q) => q.eq("marketSize", args.marketSize!));
    }
    
    const limit = args.limit ?? 100;
    return await teamsQuery.take(limit);
  },
});

// Get a single team by ID
export const get = query({
  args: { id: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Search teams by name
export const searchByName = query({
  args: { 
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("teams")
      .withSearchIndex("search_teams", (q) => q.search("name", args.searchTerm))
      .take(limit);
  },
});

// Create a new team
export const create = mutation({
  args: {
    name: v.string(),
    league: v.string(),
    sport: v.string(),
    city: v.string(),
    state: v.string(),
    region: v.string(),
    marketSize: v.string(),
    demographics: v.object({
      avgAge: v.optional(v.number()),
      genderSplit: v.optional(v.object({ 
        male: v.number(), 
        female: v.number() 
      })),
      incomeLevel: v.optional(v.string()),
      primaryAudience: v.optional(v.array(v.string())),
    }),
    brandValues: v.array(v.string()),
    estimatedSponsorshipRange: v.optional(v.object({
      min: v.number(),
      max: v.number(),
    })),
    founded: v.optional(v.number()),
    venue: v.optional(v.string()),
    avgAttendance: v.optional(v.number()),
    socialFollowing: v.optional(v.number()),
    website: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("teams", {
      ...args,
      isVerified: false,
      lastUpdated: Date.now(),
    });
  },
});

// Batch create teams (for seeding)
export const batchCreate = mutation({
  args: {
    teams: v.array(v.object({
      name: v.string(),
      league: v.string(),
      sport: v.string(),
      city: v.string(),
      state: v.string(),
      region: v.string(),
      marketSize: v.string(),
      demographics: v.object({
        avgAge: v.optional(v.number()),
        genderSplit: v.optional(v.object({ 
          male: v.number(), 
          female: v.number() 
        })),
        incomeLevel: v.optional(v.string()),
        primaryAudience: v.optional(v.array(v.string())),
      }),
      brandValues: v.array(v.string()),
      estimatedSponsorshipRange: v.optional(v.object({
        min: v.number(),
        max: v.number(),
      })),
      founded: v.optional(v.number()),
      venue: v.optional(v.string()),
      avgAttendance: v.optional(v.number()),
      socialFollowing: v.optional(v.number()),
      website: v.optional(v.string()),
      logoUrl: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const ids = [];
    for (const team of args.teams) {
      const id = await ctx.db.insert("teams", {
        ...team,
        isVerified: false,
        lastUpdated: Date.now(),
      });
      ids.push(id);
    }
    return ids;
  },
});

// Update a team
export const update = mutation({
  args: {
    id: v.id("teams"),
    name: v.optional(v.string()),
    league: v.optional(v.string()),
    sport: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    region: v.optional(v.string()),
    marketSize: v.optional(v.string()),
    demographics: v.optional(v.object({
      avgAge: v.optional(v.number()),
      genderSplit: v.optional(v.object({ 
        male: v.number(), 
        female: v.number() 
      })),
      incomeLevel: v.optional(v.string()),
      primaryAudience: v.optional(v.array(v.string())),
    })),
    brandValues: v.optional(v.array(v.string())),
    estimatedSponsorshipRange: v.optional(v.object({
      min: v.number(),
      max: v.number(),
    })),
    founded: v.optional(v.number()),
    venue: v.optional(v.string()),
    avgAttendance: v.optional(v.number()),
    socialFollowing: v.optional(v.number()),
    website: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    isVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    await ctx.db.patch(id, {
      ...filteredUpdates,
      lastUpdated: Date.now(),
    });
    
    return await ctx.db.get(id);
  },
});

// Delete a team
export const remove = mutation({
  args: { id: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Get unique values for filters
export const getFilterOptions = query({
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    
    const leagues = [...new Set(teams.map(t => t.league))].sort();
    const sports = [...new Set(teams.map(t => t.sport))].sort();
    const regions = [...new Set(teams.map(t => t.region))].sort();
    const marketSizes = [...new Set(teams.map(t => t.marketSize))].sort();
    const brandValues = [...new Set(teams.flatMap(t => t.brandValues))].sort();
    
    return {
      leagues,
      sports,
      regions,
      marketSizes,
      brandValues,
    };
  },
});

// Get team count
export const count = query({
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    return teams.length;
  },
});

