import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Create a new search session
export const createSession = mutation({
  args: {
    query: v.string(),
    filters: v.object({
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
      regions: v.optional(v.array(v.string())),
      demographics: v.optional(v.array(v.string())),
      brandValues: v.optional(v.array(v.string())),
      leagues: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("searchSessions", {
      query: args.query,
      filters: args.filters,
      status: "pending",
      createdAt: Date.now(),
    });
    return sessionId;
  },
});

// Update session status
export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("searchSessions"),
    status: v.string(),
    resultsCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      ...(args.resultsCount !== undefined && { resultsCount: args.resultsCount }),
      ...(args.status === "completed" && { completedAt: Date.now() }),
    });
  },
});

// Get session by ID
export const getSession = query({
  args: { sessionId: v.id("searchSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// Save a search result
export const saveResult = mutation({
  args: {
    sessionId: v.id("searchSessions"),
    teamId: v.id("teams"),
    score: v.number(),
    rank: v.number(),
    reasoning: v.string(),
    pros: v.array(v.string()),
    cons: v.array(v.string()),
    dealStructure: v.optional(v.object({
      estimatedCost: v.number(),
      suggestedAssets: v.array(v.string()),
      activationIdeas: v.array(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("searchResults", args);
  },
});

// Get results for a session
export const getResults = query({
  args: { sessionId: v.id("searchSessions") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("searchResults")
      .withIndex("by_session_rank", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Enrich with team data
    const enrichedResults = await Promise.all(
      results.map(async (result) => {
        const team = await ctx.db.get(result.teamId);
        return { ...result, team };
      })
    );

    return enrichedResults;
  },
});

// Internal query to search teams with filters
export const searchTeams = internalQuery({
  args: {
    query: v.string(),
    filters: v.object({
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
      regions: v.optional(v.array(v.string())),
      demographics: v.optional(v.array(v.string())),
      brandValues: v.optional(v.array(v.string())),
      leagues: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    let teams = await ctx.db.query("teams").collect();

    // Apply filters
    if (args.filters.regions && args.filters.regions.length > 0) {
      teams = teams.filter((t) => args.filters.regions!.includes(t.region));
    }

    if (args.filters.leagues && args.filters.leagues.length > 0) {
      teams = teams.filter((t) => args.filters.leagues!.includes(t.league));
    }

    if (args.filters.budgetMin !== undefined || args.filters.budgetMax !== undefined) {
      teams = teams.filter((t) => {
        if (!t.estimatedSponsorshipRange) return true;
        const { min, max } = t.estimatedSponsorshipRange;
        const budgetMin = args.filters.budgetMin ?? 0;
        const budgetMax = args.filters.budgetMax ?? Infinity;
        return max >= budgetMin && min <= budgetMax;
      });
    }

    if (args.filters.brandValues && args.filters.brandValues.length > 0) {
      teams = teams.filter((t) =>
        t.brandValues.some((v) => args.filters.brandValues!.includes(v))
      );
    }

    return teams;
  },
});

// Get recent search sessions (for history feature)
export const getRecentSessions = query({
  args: { 
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    
    let sessionsQuery = ctx.db
      .query("searchSessions")
      .withIndex("by_createdAt")
      .order("desc");
    
    if (args.status) {
      sessionsQuery = ctx.db
        .query("searchSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc");
    }
    
    return await sessionsQuery.take(limit);
  },
});

// Get related searches based on filters similarity
export const getRelatedSearches = query({
  args: { 
    currentFilters: v.object({
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
      regions: v.optional(v.array(v.string())),
      demographics: v.optional(v.array(v.string())),
      brandValues: v.optional(v.array(v.string())),
      leagues: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    }),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;
    
    // Get recent successful sessions
    const sessions = await ctx.db
      .query("searchSessions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .take(100);
    
    // Score sessions by similarity to current filters
    const scored = sessions.map(session => {
      let similarity = 0;
      
      // Region overlap
      if (args.currentFilters.regions?.length && session.filters.regions?.length) {
        const overlap = args.currentFilters.regions.filter(
          r => session.filters.regions!.includes(r)
        ).length;
        similarity += overlap * 10;
      }
      
      // League overlap
      if (args.currentFilters.leagues?.length && session.filters.leagues?.length) {
        const overlap = args.currentFilters.leagues.filter(
          l => session.filters.leagues!.includes(l)
        ).length;
        similarity += overlap * 15;
      }
      
      // Brand values overlap
      if (args.currentFilters.brandValues?.length && session.filters.brandValues?.length) {
        const overlap = args.currentFilters.brandValues.filter(
          v => session.filters.brandValues!.includes(v)
        ).length;
        similarity += overlap * 10;
      }
      
      // Budget range overlap
      const currentMin = args.currentFilters.budgetMin ?? 0;
      const currentMax = args.currentFilters.budgetMax ?? Infinity;
      const sessionMin = session.filters.budgetMin ?? 0;
      const sessionMax = session.filters.budgetMax ?? Infinity;
      
      if (sessionMax >= currentMin && sessionMin <= currentMax) {
        similarity += 20;
      }
      
      return { session, similarity };
    });
    
    // Filter out exact matches and sort by similarity
    const filtered = scored
      .filter(s => s.similarity > 0 && s.similarity < 100)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    return filtered.map(f => ({
      ...f.session,
      similarity: f.similarity,
    }));
  },
});

// Get search analytics
export const getSearchAnalytics = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 7;
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const sessions = await ctx.db
      .query("searchSessions")
      .filter(q => q.gt(q.field("createdAt"), since))
      .collect();
    
    // Aggregate analytics
    const totalSearches = sessions.length;
    const completedSearches = sessions.filter(s => s.status === "completed").length;
    const failedSearches = sessions.filter(s => s.status === "failed").length;
    const avgResultsCount = sessions
      .filter(s => s.resultsCount !== undefined)
      .reduce((sum, s) => sum + (s.resultsCount || 0), 0) / (completedSearches || 1);
    
    // Top regions
    const regionCounts = new Map<string, number>();
    sessions.forEach(s => {
      s.filters.regions?.forEach(r => {
        regionCounts.set(r, (regionCounts.get(r) || 0) + 1);
      });
    });
    
    // Top leagues
    const leagueCounts = new Map<string, number>();
    sessions.forEach(s => {
      s.filters.leagues?.forEach(l => {
        leagueCounts.set(l, (leagueCounts.get(l) || 0) + 1);
      });
    });
    
    // Top brand values
    const brandValueCounts = new Map<string, number>();
    sessions.forEach(s => {
      s.filters.brandValues?.forEach(v => {
        brandValueCounts.set(v, (brandValueCounts.get(v) || 0) + 1);
      });
    });
    
    return {
      period: { days, since: new Date(since).toISOString() },
      totalSearches,
      completedSearches,
      failedSearches,
      successRate: totalSearches > 0 ? completedSearches / totalSearches : 0,
      avgResultsCount,
      topRegions: Array.from(regionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([region, count]) => ({ region, count })),
      topLeagues: Array.from(leagueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([league, count]) => ({ league, count })),
      topBrandValues: Array.from(brandValueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count })),
    };
  },
});

// Delete old sessions (cleanup)
export const deleteOldSessions = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldSessions = await ctx.db
      .query("searchSessions")
      .filter(q => q.lt(q.field("createdAt"), cutoff))
      .collect();
    
    // Delete sessions and their results
    for (const session of oldSessions) {
      // Delete associated results
      const results = await ctx.db
        .query("searchResults")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      
      for (const result of results) {
        await ctx.db.delete(result._id);
      }
      
      await ctx.db.delete(session._id);
    }
    
    return { deletedSessions: oldSessions.length };
  },
});

// Calculate match score for a team
export const calculateScore = (
  team: {
    region: string;
    league: string;
    brandValues: string[];
    estimatedSponsorshipRange?: { min: number; max: number };
    demographics: {
      avgAge?: number;
      primaryAudience?: string[];
      incomeLevel?: string;
    };
  },
  filters: {
    budgetMin?: number;
    budgetMax?: number;
    regions?: string[];
    demographics?: string[];
    brandValues?: string[];
    leagues?: string[];
    goals?: string[];
  }
): number => {
  let score = 50; // Base score

  // Region match (20%)
  if (filters.regions && filters.regions.length > 0) {
    if (filters.regions.includes(team.region)) {
      score += 20;
    }
  } else {
    score += 10; // Partial credit if no region preference
  }

  // League match (15%)
  if (filters.leagues && filters.leagues.length > 0) {
    if (filters.leagues.includes(team.league)) {
      score += 15;
    }
  } else {
    score += 7;
  }

  // Brand values alignment (20%)
  if (filters.brandValues && filters.brandValues.length > 0) {
    const matchingValues = team.brandValues.filter((v) =>
      filters.brandValues!.includes(v)
    );
    const alignmentRatio = matchingValues.length / filters.brandValues.length;
    score += Math.round(20 * alignmentRatio);
  } else {
    score += 10;
  }

  // Budget fit (15%)
  if (team.estimatedSponsorshipRange) {
    const { min, max } = team.estimatedSponsorshipRange;
    const budgetMin = filters.budgetMin ?? 0;
    const budgetMax = filters.budgetMax ?? Infinity;

    if (min >= budgetMin && max <= budgetMax) {
      score += 15; // Perfect fit
    } else if (max >= budgetMin && min <= budgetMax) {
      score += 10; // Partial overlap
    }
  } else {
    score += 7;
  }

  // Demographics match (15%)
  if (
    filters.demographics &&
    filters.demographics.length > 0 &&
    team.demographics.primaryAudience
  ) {
    const matchingDemo = team.demographics.primaryAudience.filter((d) =>
      filters.demographics!.some(
        (fd) => d.toLowerCase().includes(fd.toLowerCase())
      )
    );
    if (matchingDemo.length > 0) {
      score += 15;
    }
  } else {
    score += 7;
  }

  return Math.min(100, Math.max(0, score));
};

