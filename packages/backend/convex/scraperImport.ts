/**
 * Convex functions for importing scraped team data from the PlayMaker Scraper.
 * 
 * This module provides mutations and queries to:
 * - Preview what would be imported
 * - Batch import teams with overwrite or append mode
 * - Clear existing teams before import
 */

import { v } from "convex/values";
import { mutation, query, internalMutation, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// ============================================
// Types for scraped team data
// ============================================

// Schema for social handle from scraper
const socialHandleSchema = v.object({
  platform: v.string(),
  handle: v.string(),
  url: v.optional(v.string()),
  unique_id: v.optional(v.string()),
});

// Schema for sponsor from scraper
const sponsorSchema = v.object({
  name: v.string(),
  category: v.optional(v.string()),
  asset_type: v.optional(v.string()),
});

// Schema for source citation (data provenance)
const sourceCitationSchema = v.object({
  url: v.string(),
  source_type: v.string(),                      // "api", "website", "database", "static", "cached"
  source_name: v.string(),                       // Human-readable name
  retrieved_at: v.string(),                      // ISO timestamp
  title: v.optional(v.string()),                 // Page title if scraped from website
  domain: v.optional(v.string()),                // Extracted domain
  api_endpoint: v.optional(v.string()),          // API endpoint path
  query_params: v.optional(v.any()),             // Query parameters used
  fields_sourced: v.optional(v.array(v.string())), // Which fields came from this source
  is_primary: v.optional(v.boolean()),           // Primary source vs fallback
  confidence: v.optional(v.number()),            // 0.0-1.0 confidence score
  cache_hit: v.optional(v.boolean()),            // Whether this was from cache
});

// Full scraped team schema (matches TeamRow from Python scraper)
// Note: Values are in RAW format (not "in millions")
const scrapedTeamSchema = v.object({
  // Core fields
  name: v.string(),
  region: v.optional(v.string()),
  league: v.optional(v.string()),
  target_demographic: v.optional(v.string()),
  official_url: v.optional(v.string()),
  category: v.optional(v.string()),
  logo_url: v.optional(v.string()),
  
  // Geographic
  geo_city: v.optional(v.string()),
  geo_country: v.optional(v.string()),
  city_population: v.optional(v.number()),
  metro_gdp: v.optional(v.number()), // Raw value in dollars
  
  // Social media handles
  social_handles: v.optional(v.array(socialHandleSchema)),
  
  // Social media follower counts
  followers_x: v.optional(v.number()),
  followers_instagram: v.optional(v.number()),
  followers_facebook: v.optional(v.number()),
  followers_tiktok: v.optional(v.number()),
  subscribers_youtube: v.optional(v.number()),
  avg_game_attendance: v.optional(v.number()),
  
  // Family friendliness
  family_program_count: v.optional(v.number()),
  family_program_types: v.optional(v.array(v.string())),
  
  // Inventory/Sponsors
  owns_stadium: v.optional(v.boolean()),
  stadium_name: v.optional(v.string()),
  sponsors: v.optional(v.array(sponsorSchema)),
  
  // Valuation (raw values in dollars)
  avg_ticket_price: v.optional(v.number()),
  franchise_value: v.optional(v.number()), // Raw value in dollars
  annual_revenue: v.optional(v.number()), // Raw value in dollars
  
  // Brand alignment
  mission_tags: v.optional(v.array(v.string())),
  community_programs: v.optional(v.array(v.string())),
  cause_partnerships: v.optional(v.array(v.string())),
  
  // Metadata
  enrichments_applied: v.optional(v.array(v.string())),
  last_enriched: v.optional(v.string()),
  
  // Source/Citation Tracking (Data Provenance)
  sources: v.optional(v.array(sourceCitationSchema)),              // List of source citations
  field_sources: v.optional(v.any()),                               // Map of field -> [source_urls]
  scraped_at: v.optional(v.string()),                               // ISO timestamp of base scrape
  scraper_version: v.optional(v.string()),                          // Version of scraper that collected data
});

// ============================================
// Query functions
// ============================================

/**
 * Get current count of teams in All_Teams table
 */
export const getAllTeamsCount = query({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("All_Teams").collect();
    return teams.length;
  },
});

/**
 * Get teams grouped by league for preview
 */
export const getTeamsByLeague = query({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("All_Teams").collect();
    
    const byLeague: Record<string, number> = {};
    for (const team of teams) {
      const league = team.league ?? "Unknown";
      byLeague[league] = (byLeague[league] ?? 0) + 1;
    }
    
    return {
      total: teams.length,
      byLeague,
    };
  },
});

/**
 * Get sample teams for preview
 */
export const getSampleTeams = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const teams = await ctx.db.query("All_Teams").take(limit);
    return teams;
  },
});

/**
 * Check if a team exists by name
 */
export const teamExists = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("All_Teams")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .take(1);
    return teams.length > 0;
  },
});

// ============================================
// Mutation functions
// ============================================

/**
 * Clear all teams from All_Teams table
 */
export const clearAllTeams = mutation({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("All_Teams").collect();
    let deleted = 0;
    
    for (const team of teams) {
      await ctx.db.delete(team._id);
      deleted++;
    }
    
    return { deleted };
  },
});

/**
 * Import a single team (internal, called by batch importer)
 */
export const importSingleTeam = mutation({
  args: {
    team: scrapedTeamSchema,
  },
  handler: async (ctx, args) => {
    const { team } = args;
    
    // Convert scraped team to All_Teams schema
    // Handle null vs undefined - Convex schema expects null for empty values
    const teamData: Doc<"All_Teams"> extends { _id: Id<"All_Teams">; _creationTime: number } 
      ? Omit<Doc<"All_Teams">, "_id" | "_creationTime"> 
      : never = {
      name: team.name,
      region: team.region ?? null,
      league: team.league ?? null,
      target_demographic: team.target_demographic ?? null,
      official_url: team.official_url ?? null,
      category: team.category ?? null,
      logo_url: team.logo_url ?? null,
      geo_city: team.geo_city ?? null,
      geo_country: team.geo_country ?? null,
      city_population: team.city_population ?? null,
      metro_gdp: team.metro_gdp ?? null,
      social_handles: team.social_handles ?? null,
      followers_x: team.followers_x ?? null,
      followers_instagram: team.followers_instagram ?? null,
      followers_facebook: team.followers_facebook ?? null,
      followers_tiktok: team.followers_tiktok ?? null,
      subscribers_youtube: team.subscribers_youtube ?? null,
      avg_game_attendance: team.avg_game_attendance ?? null,
      family_program_count: team.family_program_count ?? null,
      family_program_types: team.family_program_types ?? null,
      owns_stadium: team.owns_stadium ?? null,
      stadium_name: team.stadium_name ?? null,
      sponsors: team.sponsors ?? null,
      avg_ticket_price: team.avg_ticket_price ?? null,
      franchise_value: team.franchise_value ?? null,
      annual_revenue: team.annual_revenue ?? null,
      mission_tags: team.mission_tags ?? null,
      community_programs: team.community_programs ?? null,
      cause_partnerships: team.cause_partnerships ?? null,
      enrichments_applied: team.enrichments_applied ?? null,
      last_enriched: team.last_enriched ?? null,
      sources: team.sources ?? null,
      field_sources: team.field_sources ?? null,
      scraped_at: team.scraped_at ?? null,
      scraper_version: team.scraper_version ?? null,
    };
    
    const id = await ctx.db.insert("All_Teams", teamData);
    return id;
  },
});

/**
 * Batch import teams (up to 100 at a time due to Convex limits)
 */
export const batchImportTeams = mutation({
  args: {
    teams: v.array(scrapedTeamSchema),
  },
  handler: async (ctx, args) => {
    const { teams } = args;
    const ids: Id<"All_Teams">[] = [];
    
    for (const team of teams) {
      const teamData = {
        name: team.name,
        region: team.region ?? null,
        league: team.league ?? null,
        target_demographic: team.target_demographic ?? null,
        official_url: team.official_url ?? null,
        category: team.category ?? null,
        logo_url: team.logo_url ?? null,
        geo_city: team.geo_city ?? null,
        geo_country: team.geo_country ?? null,
        city_population: team.city_population ?? null,
        metro_gdp: team.metro_gdp ?? null,
        social_handles: team.social_handles ?? null,
        followers_x: team.followers_x ?? null,
        followers_instagram: team.followers_instagram ?? null,
        followers_facebook: team.followers_facebook ?? null,
        followers_tiktok: team.followers_tiktok ?? null,
        subscribers_youtube: team.subscribers_youtube ?? null,
        avg_game_attendance: team.avg_game_attendance ?? null,
        family_program_count: team.family_program_count ?? null,
        family_program_types: team.family_program_types ?? null,
        owns_stadium: team.owns_stadium ?? null,
        stadium_name: team.stadium_name ?? null,
        sponsors: team.sponsors ?? null,
        avg_ticket_price: team.avg_ticket_price ?? null,
        franchise_value: team.franchise_value ?? null,
        annual_revenue: team.annual_revenue ?? null,
        mission_tags: team.mission_tags ?? null,
        community_programs: team.community_programs ?? null,
        cause_partnerships: team.cause_partnerships ?? null,
        enrichments_applied: team.enrichments_applied ?? null,
        last_enriched: team.last_enriched ?? null,
        sources: team.sources ?? null,
        field_sources: team.field_sources ?? null,
        scraped_at: team.scraped_at ?? null,
        scraper_version: team.scraper_version ?? null,
      };
      
      const id = await ctx.db.insert("All_Teams", teamData);
      ids.push(id);
    }
    
    return { imported: ids.length, ids };
  },
});

/**
 * Full import with overwrite option
 * If overwrite is true, clears existing teams first
 */
export const fullImport = mutation({
  args: {
    teams: v.array(scrapedTeamSchema),
    overwrite: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { teams, overwrite } = args;
    let deleted = 0;
    
    // If overwrite, clear existing teams first
    if (overwrite) {
      const existingTeams = await ctx.db.query("All_Teams").collect();
      for (const team of existingTeams) {
        await ctx.db.delete(team._id);
        deleted++;
      }
    }
    
    // Import new teams
    const ids: Id<"All_Teams">[] = [];
    for (const team of teams) {
      const teamData = {
        name: team.name,
        region: team.region ?? null,
        league: team.league ?? null,
        target_demographic: team.target_demographic ?? null,
        official_url: team.official_url ?? null,
        category: team.category ?? null,
        logo_url: team.logo_url ?? null,
        geo_city: team.geo_city ?? null,
        geo_country: team.geo_country ?? null,
        city_population: team.city_population ?? null,
        metro_gdp: team.metro_gdp ?? null,
        social_handles: team.social_handles ?? null,
        followers_x: team.followers_x ?? null,
        followers_instagram: team.followers_instagram ?? null,
        followers_facebook: team.followers_facebook ?? null,
        followers_tiktok: team.followers_tiktok ?? null,
        subscribers_youtube: team.subscribers_youtube ?? null,
        avg_game_attendance: team.avg_game_attendance ?? null,
        family_program_count: team.family_program_count ?? null,
        family_program_types: team.family_program_types ?? null,
        owns_stadium: team.owns_stadium ?? null,
        stadium_name: team.stadium_name ?? null,
        sponsors: team.sponsors ?? null,
        avg_ticket_price: team.avg_ticket_price ?? null,
        franchise_value: team.franchise_value ?? null,
        annual_revenue: team.annual_revenue ?? null,
        mission_tags: team.mission_tags ?? null,
        community_programs: team.community_programs ?? null,
        cause_partnerships: team.cause_partnerships ?? null,
        enrichments_applied: team.enrichments_applied ?? null,
        last_enriched: team.last_enriched ?? null,
        sources: team.sources ?? null,
        field_sources: team.field_sources ?? null,
        scraped_at: team.scraped_at ?? null,
        scraper_version: team.scraper_version ?? null,
      };
      
      const id = await ctx.db.insert("All_Teams", teamData);
      ids.push(id);
    }
    
    return {
      success: true,
      deleted,
      imported: ids.length,
      mode: overwrite ? "overwrite" : "append",
    };
  },
});
