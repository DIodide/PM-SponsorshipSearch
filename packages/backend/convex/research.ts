"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import { z } from "zod";

// Filters schema for validation
const filtersSchema = v.object({
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  regions: v.optional(v.array(v.string())),
  demographics: v.optional(v.array(v.string())),
  brandValues: v.optional(v.array(v.string())),
  leagues: v.optional(v.array(v.string())),
  goals: v.optional(v.array(v.string())),
});

// Zod schema for team extraction
const discoveredTeamSchema = z.object({
  name: z.string().describe("Official team name"),
  league: z.string().describe("League abbreviation (e.g., NFL, NBA, MLS, NWSL, USL, etc.)"),
  sport: z.string().describe("Sport type (e.g., football, basketball, soccer, baseball, hockey)"),
  city: z.string().describe("City where the team is based"),
  state: z.string().describe("Two-letter state code (e.g., CA, NY, TX)"),
  region: z.enum(["northeast", "southeast", "midwest", "southwest", "west"]).describe("US region"),
  marketSize: z.enum(["small", "medium", "large"]).describe("Market size based on metro population"),
  brandValues: z.array(z.string()).describe("Core brand values (e.g., community, family, innovation, tradition, performance, excellence)"),
  reasoning: z.string().describe("Why this team is a good match for the brand query"),
  pros: z.array(z.string()).min(2).max(5).describe("Advantages of sponsoring this team"),
  cons: z.array(z.string()).min(1).max(3).describe("Potential challenges or considerations"),
  estimatedSponsorshipRange: z.object({
    min: z.number().describe("Minimum estimated sponsorship cost in USD"),
    max: z.number().describe("Maximum estimated sponsorship cost in USD"),
  }).optional(),
  socialHandles: z.object({
    twitter: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    facebook: z.string().optional(),
  }).optional(),
  website: z.string().url().optional(),
  confidence: z.number().min(0).max(100).describe("AI confidence in this recommendation (0-100)"),
});

const discoveredTeamsSchema = z.object({
  teams: z.array(discoveredTeamSchema).min(1).max(10),
  searchSummary: z.string().describe("Brief summary of the search and findings"),
});

// Initialize Google Generative AI client (uses API key, much simpler than Vertex)
function getGoogleAI() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is required. Get one at https://aistudio.google.com/app/apikey");
  }
  
  return createGoogleGenerativeAI({ apiKey });
}

// Source URL type
interface SourceUrl {
  url: string;
  title?: string;
  domain?: string;
}

// Web search result with sources
interface WebSearchResult {
  content: string;
  sources: SourceUrl[];
}

// Web search via Tavily API
async function searchWeb(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    console.warn("TAVILY_API_KEY not set, using mock search results");
    return mockSearchResults(query);
  }
  
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "advanced",
        include_domains: [
          "wikipedia.org",
          "espn.com",
          "sports-reference.com",
          "mlssoccer.com",
          "nba.com",
          "nfl.com",
          "mlb.com",
          "nhl.com",
        ],
        max_results: 10,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract source URLs
    const sources: SourceUrl[] = data.results.map((r: { title: string; url: string }) => {
      const urlObj = new URL(r.url);
      return {
        url: r.url,
        title: r.title,
        domain: urlObj.hostname.replace('www.', ''),
      };
    });
    
    // Format results for the AI
    const formattedResults = data.results
      .map((r: { title: string; url: string; content: string }) => 
        `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n---`
      )
      .join("\n");
    
    return {
      content: formattedResults || mockSearchResults(query).content,
      sources,
    };
  } catch (error) {
    console.error("Tavily search error:", error);
    return mockSearchResults(query);
  }
}

// Mock search results for development/fallback
function mockSearchResults(query: string): WebSearchResult {
  const mockSources: SourceUrl[] = [
    { url: "https://www.milb.com/", title: "Minor League Baseball", domain: "milb.com" },
    { url: "https://www.uslchampionship.com/", title: "USL Championship", domain: "uslchampionship.com" },
    { url: "https://www.nwslsoccer.com/", title: "NWSL Soccer", domain: "nwslsoccer.com" },
    { url: "https://www.espn.com/", title: "ESPN Sports", domain: "espn.com" },
  ];
  
  return {
    content: `
Sports Teams Search Results for: "${query}"

1. Minor League Baseball Teams
Many minor league baseball teams across the US offer affordable sponsorship opportunities
with strong community engagement. Teams like the Durham Bulls, Las Vegas Aviators, and
Sacramento River Cats have dedicated local fanbases.

2. USL Championship Soccer
The USL Championship features 24 teams across the US. Teams like Louisville City FC,
Phoenix Rising FC, and Sacramento Republic FC offer growing audiences with passionate fans.

3. NWSL Women's Soccer
The National Women's Soccer League has 12 teams with rapidly growing attendance and
social media following. Teams like Portland Thorns, Orlando Pride, and Kansas City Current
offer unique sponsorship opportunities.

4. Minor League Hockey
ECHL and AHL teams provide excellent regional sponsorship opportunities with engaged fans
and affordable partnership packages.

5. Indoor Football & Arena Leagues
Arena football and indoor leagues offer cost-effective sponsorship with high visibility
and community integration.
`,
    sources: mockSources,
  };
}

// Generate hash for cache key
function generateQueryHash(query: string, filters: Record<string, unknown>): string {
  const normalizedQuery = query.toLowerCase().trim();
  const sortedFilters = JSON.stringify(filters, Object.keys(filters).sort());
  const combined = `${normalizedQuery}:${sortedFilters}`;
  
  // Simple hash function (for production, use crypto.subtle)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Discovered team type with sources
interface DiscoveredTeam {
  name: string;
  league: string;
  sport: string;
  city: string;
  state: string;
  region: string;
  marketSize: string;
  brandValues: string[];
  reasoning: string;
  pros: string[];
  cons: string[];
  estimatedSponsorshipRange?: { min: number; max: number };
  socialHandles?: {
    twitter?: string;
    instagram?: string;
    tiktok?: string;
    facebook?: string;
  };
  website?: string;
  confidence: number;
  sourceUrls?: SourceUrl[];
}

// Main AI discovery action
export const discoverTeams = action({
  args: {
    query: v.string(),
    filters: filtersSchema,
    useCache: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    teams: DiscoveredTeam[];
    searchSummary: string;
    fromCache: boolean;
    sources: SourceUrl[];
  }> => {
    const useCache = args.useCache !== false;
    const queryHash = generateQueryHash(args.query, args.filters);
    
    // Check cache first
    if (useCache) {
      const cached = await ctx.runQuery(internal.cache.getCachedResults, { queryHash });
      if (cached && cached.expiresAt > Date.now()) {
        // Update hit count
        await ctx.runMutation(internal.cache.incrementHitCount, { cacheId: cached._id });
        return {
          teams: cached.results as DiscoveredTeam[],
          searchSummary: `Retrieved ${cached.results.length} cached results`,
          fromCache: true,
          sources: [], // Cache doesn't store sources separately
        };
      }
    }
    
    // Perform web search
    const searchPrompt = buildSearchQuery(args.query, args.filters);
    const searchResults = await searchWeb(searchPrompt);
    const { content: searchContent, sources: searchSources } = searchResults;
    
    // Use AI to extract and structure team information
    
    const systemPrompt = `You are a sports sponsorship research assistant. Your job is to identify sports teams that would be good sponsorship opportunities for brands based on their requirements.

Analyze the search results and brand requirements to recommend sports teams. Focus on:
1. Teams that match the geographic, demographic, and brand value requirements
2. Both major league and minor league opportunities
3. Emerging leagues and teams with growth potential
4. Realistic sponsorship cost estimates based on market size and league tier

For sponsorship ranges, use these guidelines:
- Major League (NFL, NBA, MLB, NHL): $500,000 - $50,000,000+
- MLS, NWSL: $100,000 - $5,000,000
- Minor League Baseball (AAA): $50,000 - $500,000
- Minor League Baseball (AA, A): $25,000 - $200,000
- USL Championship: $25,000 - $300,000
- ECHL/AHL Hockey: $20,000 - $150,000
- Arena/Indoor Football: $10,000 - $100,000

Provide realistic, well-researched recommendations with specific team names.`;

    const userPrompt = `Brand Query: "${args.query}"

Brand Requirements:
${args.filters.budgetMin || args.filters.budgetMax ? `- Budget: $${args.filters.budgetMin?.toLocaleString() || 0} - $${args.filters.budgetMax?.toLocaleString() || "unlimited"}` : "- Budget: Flexible"}
${args.filters.regions?.length ? `- Target Regions: ${args.filters.regions.join(", ")}` : "- Target Regions: Any US region"}
${args.filters.demographics?.length ? `- Target Demographics: ${args.filters.demographics.join(", ")}` : ""}
${args.filters.brandValues?.length ? `- Brand Values: ${args.filters.brandValues.join(", ")}` : ""}
${args.filters.leagues?.length ? `- Preferred Leagues: ${args.filters.leagues.join(", ")}` : "- Leagues: Open to all"}
${args.filters.goals?.length ? `- Sponsorship Goals: ${args.filters.goals.join(", ")}` : ""}

Web Search Results:
${searchContent}

Based on the search results and brand requirements, identify 5-10 specific sports teams that would be excellent sponsorship opportunities. Include a mix of established and emerging teams at various budget levels.`;

    try {
      const google = getGoogleAI();
      const { object: result } = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: discoveredTeamsSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });
      
      // Add source URLs to each team
      const teamsWithSources: DiscoveredTeam[] = result.teams.map(team => ({
        ...team,
        sourceUrls: searchSources,
      }));
      
      // Cache the results (with sources)
      if (useCache && teamsWithSources.length > 0) {
        await ctx.runMutation(internal.cache.cacheResults, {
          queryHash,
          query: args.query,
          filters: args.filters,
          results: teamsWithSources,
          ttlHours: 24, // Cache for 24 hours
        });
      }
      
      return {
        teams: teamsWithSources,
        searchSummary: result.searchSummary,
        fromCache: false,
        sources: searchSources,
      };
    } catch (error) {
      console.error("AI team discovery error:", error);
      
      // Return fallback results on AI error
      const fallbackTeams = getFallbackTeams(args.filters);
      return {
        teams: fallbackTeams.map(t => ({ ...t, sourceUrls: searchSources })),
        searchSummary: "AI discovery failed, returning fallback recommendations",
        fromCache: false,
        sources: searchSources,
      };
    }
  },
});

// Build optimized search query
function buildSearchQuery(query: string, filters: {
  regions?: string[];
  leagues?: string[];
  budgetMin?: number;
  budgetMax?: number;
}): string {
  const parts = [query];
  
  if (filters.regions?.length) {
    parts.push(`sports teams in ${filters.regions.join(" or ")}`);
  }
  
  if (filters.leagues?.length) {
    parts.push(filters.leagues.join(" "));
  } else {
    parts.push("minor league professional sports teams sponsorship opportunities");
  }
  
  if (filters.budgetMin && filters.budgetMin < 100000) {
    parts.push("affordable sponsorship");
  } else if (filters.budgetMax && filters.budgetMax > 1000000) {
    parts.push("major league sponsorship");
  }
  
  return parts.join(" ");
}

// Fallback teams when AI fails
function getFallbackTeams(filters: {
  regions?: string[];
  budgetMin?: number;
  budgetMax?: number;
}): Array<{
  name: string;
  league: string;
  sport: string;
  city: string;
  state: string;
  region: string;
  marketSize: string;
  brandValues: string[];
  reasoning: string;
  pros: string[];
  cons: string[];
  estimatedSponsorshipRange: { min: number; max: number };
  confidence: number;
}> {
  const allFallbacks = [
    {
      name: "Sacramento Republic FC",
      league: "USL Championship",
      sport: "soccer",
      city: "Sacramento",
      state: "CA",
      region: "west" as const,
      marketSize: "medium" as const,
      brandValues: ["community", "growth", "family"],
      reasoning: "Sacramento Republic FC offers strong community engagement with an expanding fanbase in the California capital region.",
      pros: ["Passionate fanbase", "Growing market", "Affordable entry point", "Strong community ties"],
      cons: ["Not yet MLS", "Limited national exposure"],
      estimatedSponsorshipRange: { min: 50000, max: 250000 },
      confidence: 75,
    },
    {
      name: "Durham Bulls",
      league: "Triple-A Baseball",
      sport: "baseball",
      city: "Durham",
      state: "NC",
      region: "southeast" as const,
      marketSize: "medium" as const,
      brandValues: ["tradition", "community", "family"],
      reasoning: "The Durham Bulls are one of the most recognized minor league baseball brands with iconic status from pop culture.",
      pros: ["Iconic brand recognition", "Strong local following", "Historic venue", "Cost-effective"],
      cons: ["Seasonal sport", "Regional focus"],
      estimatedSponsorshipRange: { min: 75000, max: 400000 },
      confidence: 80,
    },
    {
      name: "Portland Thorns FC",
      league: "NWSL",
      sport: "soccer",
      city: "Portland",
      state: "OR",
      region: "west" as const,
      marketSize: "medium" as const,
      brandValues: ["excellence", "community", "innovation", "inclusion"],
      reasoning: "Portland Thorns are a premier NWSL franchise with record-breaking attendance and strong brand alignment for progressive companies.",
      pros: ["League-leading attendance", "Strong social media presence", "Aligned with women's sports growth", "Passionate fanbase"],
      cons: ["Premium pricing for NWSL", "Regional market"],
      estimatedSponsorshipRange: { min: 150000, max: 1000000 },
      confidence: 85,
    },
    {
      name: "Louisville City FC",
      league: "USL Championship",
      sport: "soccer",
      city: "Louisville",
      state: "KY",
      region: "southeast" as const,
      marketSize: "medium" as const,
      brandValues: ["community", "excellence", "tradition"],
      reasoning: "Louisville City FC has established themselves as a premier USL franchise with strong attendance and community support.",
      pros: ["New purpose-built stadium", "Strong attendance figures", "Multiple USL titles", "Growing market"],
      cons: ["Limited national visibility", "Newer brand"],
      estimatedSponsorshipRange: { min: 40000, max: 200000 },
      confidence: 78,
    },
    {
      name: "Las Vegas Aviators",
      league: "Triple-A Baseball",
      sport: "baseball",
      city: "Las Vegas",
      state: "NV",
      region: "west" as const,
      marketSize: "large" as const,
      brandValues: ["entertainment", "innovation", "growth"],
      reasoning: "The Las Vegas Aviators offer unique exposure in a major entertainment market with modern facilities.",
      pros: ["Growing sports market", "Modern stadium", "Entertainment destination", "Corporate hospitality opportunities"],
      cons: ["Competition from major leagues", "Transient population"],
      estimatedSponsorshipRange: { min: 100000, max: 500000 },
      confidence: 77,
    },
  ];
  
  // Filter by region if specified
  let filtered = allFallbacks;
  if (filters.regions?.length) {
    filtered = allFallbacks.filter(t => filters.regions!.includes(t.region));
    // If no matches, return all
    if (filtered.length === 0) filtered = allFallbacks;
  }
  
  // Filter by budget if specified
  if (filters.budgetMax) {
    filtered = filtered.filter(t => t.estimatedSponsorshipRange.min <= filters.budgetMax!);
  }
  
  return filtered.slice(0, 5);
}

// Internal action to save discovered teams to database
export const saveDiscoveredTeams = internalAction({
  args: {
    teams: v.array(v.object({
      name: v.string(),
      league: v.string(),
      sport: v.string(),
      city: v.string(),
      state: v.string(),
      region: v.string(),
      marketSize: v.string(),
      brandValues: v.array(v.string()),
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
    })),
  },
  handler: async (ctx, args) => {
    const savedIds = [];
    
    for (const team of args.teams) {
      // Check if team already exists
      const existing = await ctx.runQuery(internal.teams.findByName, { name: team.name });
      
      if (!existing) {
        const id = await ctx.runMutation(internal.teams.createTeamInternal, {
          ...team,
          demographics: {
            avgAge: undefined,
            genderSplit: undefined,
            incomeLevel: undefined,
            primaryAudience: [],
          },
          source: "ai_discovery",
          discoveredAt: Date.now(),
        });
        savedIds.push(id);
      }
    }
    
    return savedIds;
  },
});

// Enrichment action to get more details about a specific team
export const enrichTeamData = action({
  args: {
    teamName: v.string(),
    league: v.string(),
  },
  handler: async (ctx, args): Promise<{
    demographics: {
      avgAge?: number;
      primaryAudience?: string[];
      incomeLevel?: string;
    };
    socialHandles: {
      twitter?: string;
      instagram?: string;
      tiktok?: string;
      facebook?: string;
    };
    additionalInfo: string;
  }> => {
    const searchQuery = `${args.teamName} ${args.league} team demographics fans social media official accounts`;
    const { content: searchContent } = await searchWeb(searchQuery);
    
    const google = getGoogleAI();
    
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      system: "You are a sports research assistant. Extract factual information about sports teams from search results.",
      prompt: `Extract the following information about ${args.teamName} from the search results:

1. Fan demographics (average age, primary audience type, income level)
2. Official social media handles (Twitter/X, Instagram, TikTok, Facebook)
3. Any additional relevant sponsorship information

Search Results:
${searchContent}

Respond in JSON format with keys: demographics, socialHandles, additionalInfo`,
    });
    
    try {
      return JSON.parse(text);
    } catch {
      return {
        demographics: {},
        socialHandles: {},
        additionalInfo: text,
      };
    }
  },
});

