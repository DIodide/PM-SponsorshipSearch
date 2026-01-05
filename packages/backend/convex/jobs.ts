"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";

// ============================================
// Social Stats Update Job
// ============================================

export const updateAllSocialStats = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[Job] Starting daily social stats update");
    
    // Get all teams with social media handles
    const teams = await ctx.runQuery(internal.teams.getAllTeams, {});
    
    let updated = 0;
    let errors = 0;
    const platforms = ["twitter", "instagram", "tiktok", "facebook"] as const;
    
    for (const team of teams) {
      const socialMedia = team.socialMedia as Record<string, { handle: string; lastUpdated: number } | undefined> | undefined;
      
      if (!socialMedia) continue;
      
      for (const platform of platforms) {
        const platformData = socialMedia[platform];
        
        if (!platformData?.handle) continue;
        
        // Only update if older than 20 hours (to avoid redundant updates)
        const isStale = !platformData.lastUpdated || 
          (Date.now() - platformData.lastUpdated) > 20 * 60 * 60 * 1000;
        
        if (!isStale) continue;
        
        try {
          // Queue the update instead of processing inline
          await ctx.runMutation(internal.socialHelpers.queueSocialUpdate, {
            teamId: team._id,
            platform,
          });
          updated++;
        } catch (error) {
          console.error(`Failed to queue ${platform} update for ${team.name}:`, error);
          errors++;
        }
      }
    }
    
    console.log(`[Job] Queued ${updated} social media updates, ${errors} errors`);
    return { queued: updated, errors };
  },
});

// ============================================
// Team Data Refresh Job
// ============================================

export const refreshTeamData = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[Job] Starting weekly team data refresh");
    
    // Get teams that haven't been updated in 7 days
    const teams = await ctx.runQuery(internal.teams.getAllTeams, {});
    const staleThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    const staleTeams = teams.filter(t => !t.lastUpdated || t.lastUpdated < staleThreshold);
    
    console.log(`[Job] Found ${staleTeams.length} stale teams to refresh`);
    
    let refreshed = 0;
    
    for (const team of staleTeams.slice(0, 50)) { // Limit to 50 per run
      try {
        // Use AI to enrich team data
        const enrichment = await ctx.runAction(api.research.enrichTeamData, {
          teamName: team.name,
          league: team.league,
        });
        
        // Update team with new data if available
        if (enrichment.socialHandles) {
          // Queue social updates for any new handles found
          const handles = enrichment.socialHandles;
          for (const [platform, handle] of Object.entries(handles)) {
            if (handle) {
              await ctx.runMutation(internal.socialHelpers.queueSocialUpdate, {
                teamId: team._id,
                platform,
              });
            }
          }
        }
        
        // Update lastUpdated timestamp
        await ctx.runMutation(internal.jobsHelpers.markTeamRefreshed, { teamId: team._id });
        refreshed++;
      } catch (error) {
        console.error(`Failed to refresh team ${team.name}:`, error);
      }
      
      // Rate limiting - wait between requests
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`[Job] Refreshed ${refreshed} teams`);
    return { refreshed, total: staleTeams.length };
  },
});

// ============================================
// New Team Discovery Job
// ============================================

export const discoverNewTeams = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[Job] Starting weekly team discovery");
    
    // Get recent popular search queries to discover relevant teams
    const recentSearches = await ctx.runQuery(internal.jobsHelpers.getRecentSearchQueries, {
      limit: 10,
    });
    
    // Also add some standard discovery queries
    const discoveryQueries = [
      "new minor league sports teams 2024",
      "emerging professional sports teams sponsorship",
      "USL Championship teams",
      "NWSL expansion teams",
      "independent baseball league teams",
    ];
    
    // Combine with recent search queries
    const allQueries = [
      ...recentSearches.map(s => s.query),
      ...discoveryQueries,
    ].slice(0, 5); // Limit to 5 queries per run
    
    let totalDiscovered = 0;
    
    for (const query of allQueries) {
      try {
        const result = await ctx.runAction(api.research.discoverTeams, {
          query,
          filters: {},
          useCache: true,
        });
        
        if (!result.fromCache && result.teams.length > 0) {
          // Save newly discovered teams
          const savedIds = await ctx.runAction(internal.research.saveDiscoveredTeams, {
            teams: result.teams.map(t => ({
              name: t.name,
              league: t.league,
              sport: t.sport,
              city: t.city,
              state: t.state,
              region: t.region,
              marketSize: t.marketSize,
              brandValues: t.brandValues,
              estimatedSponsorshipRange: t.estimatedSponsorshipRange,
              socialHandles: t.socialHandles,
              website: t.website,
            })),
          });
          
          totalDiscovered += savedIds.length;
          console.log(`[Job] Discovered ${savedIds.length} new teams from query: "${query}"`);
        }
      } catch (error) {
        console.error(`Failed discovery for query "${query}":`, error);
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`[Job] Total newly discovered teams: ${totalDiscovered}`);
    return { discovered: totalDiscovered };
  },
});

// ============================================
// Analytics Jobs
// ============================================

export const generateWeeklyReport = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[Job] Generating weekly analytics report");
    
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // Get search session stats
    const sessions = await ctx.runQuery(internal.jobsHelpers.getSessionStats, {
      since: oneWeekAgo,
    });
    
    // Get team stats
    const teams = await ctx.runQuery(internal.teams.getAllTeams, {});
    const aiDiscoveredTeams = teams.filter(t => t.source === "ai_discovery");
    
    // Get cache stats
    const cacheStats = await ctx.runQuery(api.cache.getCacheStats, {});
    
    const report = {
      period: {
        start: new Date(oneWeekAgo).toISOString(),
        end: new Date().toISOString(),
      },
      searches: {
        total: sessions.total,
        completed: sessions.completed,
        avgResultsPerSearch: sessions.avgResults,
      },
      teams: {
        total: teams.length,
        aiDiscovered: aiDiscoveredTeams.length,
        verifiedCount: teams.filter(t => t.isVerified).length,
      },
      cache: cacheStats,
      generatedAt: new Date().toISOString(),
    };
    
    console.log("[Job] Weekly Report:", JSON.stringify(report, null, 2));
    return report;
  },
});

