import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Social media account schema (reusable)
const socialAccountSchema = v.object({
  handle: v.string(),
  followers: v.number(),
  engagement: v.optional(v.number()), // engagement rate percentage
  lastUpdated: v.number(),
});

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
    
    // Social media accounts
    socialMedia: v.optional(v.object({
      twitter: v.optional(socialAccountSchema),
      instagram: v.optional(socialAccountSchema),
      tiktok: v.optional(socialAccountSchema),
      facebook: v.optional(socialAccountSchema),
    })),
    
    // Additional metadata
    founded: v.optional(v.number()),
    venue: v.optional(v.string()),
    avgAttendance: v.optional(v.number()),
    socialFollowing: v.optional(v.number()), // Deprecated: use socialMedia instead
    website: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    
    // Data quality flags
    isVerified: v.optional(v.boolean()),
    lastUpdated: v.optional(v.number()),
    
    // Source tracking for AI-discovered teams
    source: v.optional(v.string()), // "manual", "ai_discovery", "api_import"
    discoveredAt: v.optional(v.number()),
    
    // Source URLs for AI-discovered data
    sourceUrls: v.optional(v.array(v.object({
      url: v.string(),
      title: v.optional(v.string()),
      domain: v.optional(v.string()),
    }))),
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

  // Research cache for AI-generated team discoveries
  researchCache: defineTable({
    queryHash: v.string(), // SHA-256 hash of query + filters
    query: v.string(), // Original query for debugging
    filters: v.object({
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
      regions: v.optional(v.array(v.string())),
      demographics: v.optional(v.array(v.string())),
      brandValues: v.optional(v.array(v.string())),
      leagues: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    }),
    results: v.array(v.object({
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
      confidence: v.number(), // 0-100 confidence score from AI
      sourceUrls: v.optional(v.array(v.object({
        url: v.string(),
        title: v.optional(v.string()),
        domain: v.optional(v.string()),
      }))),
    })),
    createdAt: v.number(),
    expiresAt: v.number(), // TTL for cache invalidation
    hitCount: v.number(), // Track cache usage
  })
  .index("by_hash", ["queryHash"])
  .index("by_expiry", ["expiresAt"]),

  NFL_seed: defineTable({
    name: v.string(),
    region: v.string(),
    // YUBI: ASK Ibraheem, how confident are we that we will have the region of every team?
    league: v.string(),
    official_url: v.string(),
    // These fields are marked as optional (v.optional) because 
    // some rows in your CSV had missing (null) values.
    game_attendance: v.optional(v.number()),
    valuation: v.optional(v.number()),
    instagram_followers: v.optional(v.number()),
    brand_values: v.optional(v.string()),
    current_partners: v.optional(v.string()),
  })
    // 1. Look up a team by its exact name
    .index("by_name", ["name"])
    // 2. Filter teams by region
    .index("by_region", ["region"])
    // 3. Filter by league
    .index("by_league", ["league"]),

  NFL_seed_clean: defineTable({
    name: v.string(),
    region: v.string(),
    league: v.string(),
    official_url: v.string(),

    // Embeddings: Must be nullable because our script returns null for empty strings
    region_embedding: v.union(v.array(v.number()), v.null()),
    league_embedding: v.union(v.array(v.number()), v.null()),
    brand_values_embedding: v.union(v.array(v.number()), v.null()),
    current_partners_embedding: v.union(v.array(v.number()), v.null()),

    // Normalized numeric fields: These are correctly defined as nullable
    game_attendance_norm: v.union(v.number(), v.null()),
    valuation_norm: v.union(v.number(), v.null()),
    instagram_followers_norm: v.union(v.number(), v.null()),
  })
  .index("by_name", ["name"])
  .index("by_region", ["region"])
  .index("by_league", ["league"]),
    

  // Social media update jobs queue
  socialUpdateQueue: defineTable({
    teamId: v.id("teams"),
    platform: v.string(), // twitter, instagram, tiktok, facebook
    status: v.string(), // pending, processing, completed, failed
    lastAttempt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    scheduledFor: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_scheduled", ["scheduledFor"]),

    All_Teams: defineTable({
      // Name remains required and non-nullable
      name: v.string(),
  
      // All other fields modified to allow null
      region: v.optional(v.union(v.string(), v.null())),
      league: v.optional(v.union(v.string(), v.null())),
      target_demographic: v.optional(v.union(v.string(), v.null())),
      official_url: v.optional(v.union(v.string(), v.null())),
      category: v.optional(v.union(v.string(), v.null())),
      logo_url: v.optional(v.union(v.string(), v.null())),
      geo_city: v.optional(v.union(v.string(), v.null())),
      geo_country: v.optional(v.union(v.string(), v.null())),
      
      city_population: v.optional(v.union(v.number(), v.null())),
      metro_gdp: v.optional(v.union(v.number(), v.null())), // Raw value in dollars
      
      // Social media handles - array of platform/handle/url objects
      social_handles: v.optional(v.union(v.array(v.object({
        platform: v.string(),
        handle: v.string(),
        url: v.optional(v.union(v.string(), v.null())),
        unique_id: v.optional(v.union(v.string(), v.null())),
      })), v.null())),
      
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
      franchise_value: v.optional(v.union(v.number(), v.null())), // Raw value in dollars
      annual_revenue: v.optional(v.union(v.number(), v.null())), // Raw value in dollars
      
      mission_tags: v.optional(v.union(v.array(v.string()), v.null())),
      community_programs: v.optional(v.union(v.array(v.string()), v.null())),
      cause_partnerships: v.optional(v.union(v.array(v.string()), v.null())),
      enrichments_applied: v.optional(v.union(v.array(v.string()), v.null())),
      last_enriched: v.optional(v.union(v.string(), v.null())),
    })
    .index("by_name", ["name"])
    .index("by_league", ["league"])
    .index("by_category", ["category"]),
    // YUBI: is there anything else I want to index by?

    All_Teams_Clean: defineTable({
      // String fields
      name: v.string(),
      region: v.string(),
      league: v.string(),
      official_url: v.string(),
  
      // These allow the specific null value returned by your Promise.resolve(null)
    region_embedding: v.union(v.array(v.float64()), v.null()),
    league_embedding: v.union(v.array(v.float64()), v.null()),
    values_embedding: v.union(v.array(v.float64()), v.null()),
    sponsors_embedding: v.union(v.array(v.float64()), v.null()),
    family_programs_embedding: v.union(v.array(v.float64()), v.null()),
    community_programs_embedding: v.union(v.array(v.float64()), v.null()),
    partners_embedding: v.union(v.array(v.float64()), v.null()),
  
      // Numeric score fields
      digital_reach: v.number(),
      local_reach: v.number(),
      family_friendly: v.union(v.number(), v.null()),
      value_tier: v.number(),
    })
    // Optional: Add indexes for non-embedding fields if you plan to filter by them
    .index("by_name", ["name"])
    .index("by_league", ["league"]),
});
