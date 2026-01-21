import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getAll = query({
    args: {},
    handler: async (ctx): Promise<AllTeamsClean[]> => {
      return await ctx.db.query("All_Teams_Clean").collect();
    },
});

/**
 * Get the total count of teams in the database
 * Lightweight query that doesn't return the full team data
 */
export const getCount = query({
    args: {},
    handler: async (ctx): Promise<number> => {
      const teams = await ctx.db.query("All_Teams_Clean").collect();
      return teams.length;
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
    digital_reach: number;
    local_reach: number;
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
  