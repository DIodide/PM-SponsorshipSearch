import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const TABLE_NAME = "All_Teams_Clean";

export const getAll = query({
    args: {},
    handler: async (ctx): Promise<AllTeamsClean[]> => {
      return await ctx.db.query("All_Teams_Clean").collect();
    },
});

/**
 * Get the total count of teams in the database
 * Uses the tableCounts table for O(1) lookup instead of scanning all documents
 */
export const getCount = query({
    args: {},
    handler: async (ctx): Promise<number> => {
      const countDoc = await ctx.db
        .query("tableCounts")
        .withIndex("by_table", (q) => q.eq("tableName", TABLE_NAME))
        .unique();
      return countDoc?.count ?? 0;
    },
});

/**
 * Increment the team count (call when inserting a team)
 */
export const incrementCount = mutation({
    args: {},
    handler: async (ctx): Promise<void> => {
      const countDoc = await ctx.db
        .query("tableCounts")
        .withIndex("by_table", (q) => q.eq("tableName", TABLE_NAME))
        .unique();
      
      if (countDoc) {
        await ctx.db.patch(countDoc._id, { count: countDoc.count + 1 });
      } else {
        await ctx.db.insert("tableCounts", { tableName: TABLE_NAME, count: 1 });
      }
    },
});

/**
 * Decrement the team count (call when deleting a team)
 */
export const decrementCount = mutation({
    args: {},
    handler: async (ctx): Promise<void> => {
      const countDoc = await ctx.db
        .query("tableCounts")
        .withIndex("by_table", (q) => q.eq("tableName", TABLE_NAME))
        .unique();
      
      if (countDoc && countDoc.count > 0) {
        await ctx.db.patch(countDoc._id, { count: countDoc.count - 1 });
      }
    },
});

/**
 * Backfill the count from existing data
 * Run this once to initialize the count, or to recalculate if it gets out of sync
 */
export const backfillCount = internalMutation({
    args: {},
    handler: async (ctx): Promise<number> => {
      // Count all teams by scanning (only done once during backfill)
      const teams = await ctx.db.query("All_Teams_Clean").collect();
      const count = teams.length;
      
      // Find or create the count document
      const existingCountDoc = await ctx.db
        .query("tableCounts")
        .withIndex("by_table", (q) => q.eq("tableName", TABLE_NAME))
        .unique();
      
      if (existingCountDoc) {
        await ctx.db.patch(existingCountDoc._id, { count });
      } else {
        await ctx.db.insert("tableCounts", { tableName: TABLE_NAME, count });
      }
      
      return count;
    },
});

/**
 * Paginated query for batch processing - fetches teams with embeddings in pages
 * to stay within Convex read limits (~4MB per page with 100 teams)
 */
export const getPage = query({
    args: { 
      cursor: v.optional(v.string()), 
      limit: v.number() 
    },
    handler: async (ctx, { cursor, limit }): Promise<{ 
      teams: AllTeamsClean[]; 
      nextCursor: string | null;
      isDone: boolean;
    }> => {
      const query = ctx.db.query("All_Teams_Clean");
      
      const result = await query.paginate({ 
        cursor: cursor ?? null, 
        numItems: limit 
      });
      
      return {
        teams: result.page,
        nextCursor: result.continueCursor,
        isDone: result.isDone,
      };
    },
});

/**
 * Get all teams without embedding fields - for returning to frontend
 * This dramatically reduces response size (~500 bytes per team vs ~42KB)
 */
export const getAllWithoutEmbeddings = query({
    args: {},
    handler: async (ctx): Promise<AllTeamsCleanWithoutEmbeddings[]> => {
      const teams = await ctx.db.query("All_Teams_Clean").collect();
      return teams.map(stripEmbeddings);
    },
});

/**
 * Helper function to strip embedding fields from a team object
 */
export function stripEmbeddings(team: AllTeamsClean): AllTeamsCleanWithoutEmbeddings {
  const {
    region_embedding,
    league_embedding,
    values_embedding,
    sponsors_embedding,
    family_programs_embedding,
    community_programs_embedding,
    partners_embedding,
    ...rest
  } = team;
  return rest;
}

/**
 * Full team type including embeddings (used for similarity computation)
 */
export type AllTeamsClean = {
    _id: Id<"All_Teams_Clean">;
    _creationTime?: number;
    name: string;
    region: string,
    league: string;
    category?: string;
    official_url: string;
    region_embedding: number[] | null;
    league_embedding: number[] | null;
    values_embedding: number[] | null;
    sponsors_embedding: number[] | null;
    family_programs_embedding: number[] | null;
    community_programs_embedding: number[] | null;
    partners_embedding: number[] | null;
    digital_reach: number | null;
    local_reach: number | null;
    family_friendly: number | null;
    value_tier: number;
    // Optional demographic weight fields
    women_weight?: number | null;
    men_weight?: number | null;
    gen_z_weight?: number | null;
    millenial_weight?: number | null;
    gen_x_weight?: number | null;
    boomer_weight?: number | null;
    kids_weight?: number | null;
    stadium_ownership?: boolean | null;
  };

/**
 * Team type without embeddings (used for frontend responses)
 * This is ~42KB smaller per team than AllTeamsClean
 */
export type AllTeamsCleanWithoutEmbeddings = Omit<AllTeamsClean, 
  | 'region_embedding' 
  | 'league_embedding' 
  | 'values_embedding' 
  | 'sponsors_embedding' 
  | 'family_programs_embedding' 
  | 'community_programs_embedding' 
  | 'partners_embedding'
>;