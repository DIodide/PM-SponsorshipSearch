import { query } from "./_generated/server";

export const getAll = query({
    args: {},
    handler: async (ctx): Promise<NFLTeam[]> => {
      return await ctx.db.query("NFL_seed_clean").collect();
    },
});
  

// YUBI: is this what it should be?
export type NFLTeam = {
    _id: Id<"NFL_seed_clean">;
    name: string;
    region: string;
    league: string;
    official_url: string;
    region_embedding: number[] | null;
    league_embedding: number[] | null;
    brand_values_embedding: number[] | null;
    current_partners_embedding: number[] | null;
    game_attendance_norm: number | null;
    valuation_norm: number | null;
    instagram_followers_norm: number | null;
  };
  