import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ============================================
// Helper Mutations/Queries for Jobs (Non-Node.js)
// ============================================

export const markTeamRefreshed = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      lastUpdated: Date.now(),
    });
  },
});

export const getRecentSearchQueries = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const sessions = await ctx.db
      .query("searchSessions")
      .withIndex("by_createdAt")
      .filter(q => q.gt(q.field("createdAt"), oneWeekAgo))
      .order("desc")
      .take(100);
    
    // Group by query and count
    const queryCounts = new Map<string, number>();
    for (const session of sessions) {
      const count = queryCounts.get(session.query) || 0;
      queryCounts.set(session.query, count + 1);
    }
    
    // Sort by count and return top queries
    const sorted = Array.from(queryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.limit)
      .map(([query, count]) => ({ query, count }));
    
    return sorted;
  },
});

export const getSessionStats = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("searchSessions")
      .filter(q => q.gt(q.field("createdAt"), args.since))
      .collect();
    
    const completed = sessions.filter(s => s.status === "completed");
    const totalResults = completed.reduce((sum, s) => sum + (s.resultsCount || 0), 0);
    
    return {
      total: sessions.length,
      completed: completed.length,
      failed: sessions.filter(s => s.status === "failed").length,
      avgResults: completed.length > 0 ? totalResults / completed.length : 0,
    };
  },
});

