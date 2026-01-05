import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Teams table with demographic and sponsorship data
  teams: defineTable({
    name: v.string(),
    league: v.string(),
    sport: v.string(),
    city: v.string(),
    state: v.string(),
    region: v.string(), // northeast, southeast, midwest, southwest, west
    marketSize: v.string(), // small, medium, large
    
    // Demographic information
    demographics: v.object({
      avgAge: v.optional(v.number()),
      genderSplit: v.optional(v.object({ 
        male: v.number(), 
        female: v.number() 
      })),
      incomeLevel: v.optional(v.string()), // low, middle, upper-middle, high
      primaryAudience: v.optional(v.array(v.string())), // families, young professionals, etc.
    }),
    
    // Brand alignment values
    brandValues: v.array(v.string()), // community, performance, innovation, tradition, etc.
    
    // Sponsorship information
    estimatedSponsorshipRange: v.optional(v.object({
      min: v.number(),
      max: v.number(),
    })),
    
    // Additional metadata
    founded: v.optional(v.number()),
    venue: v.optional(v.string()),
    avgAttendance: v.optional(v.number()),
    socialFollowing: v.optional(v.number()),
    website: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    
    // Data quality flags
    isVerified: v.optional(v.boolean()),
    lastUpdated: v.optional(v.number()),
  })
    .index("by_league", ["league"])
    .index("by_sport", ["sport"])
    .index("by_region", ["region"])
    .index("by_marketSize", ["marketSize"])
    .searchIndex("search_teams", {
      searchField: "name",
      filterFields: ["league", "sport", "region", "marketSize"],
    }),

  // Search sessions for tracking user queries
  searchSessions: defineTable({
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
    status: v.string(), // pending, processing, completed, failed
    resultsCount: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  // Search results linking sessions to teams with scoring
  searchResults: defineTable({
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
  })
    .index("by_session", ["sessionId"])
    .index("by_session_rank", ["sessionId", "rank"]),
});
