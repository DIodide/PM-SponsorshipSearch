import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getAll = query({
    args: {},
    handler: async (ctx): Promise<AllTeamsClean[]> => {
      return await ctx.db.query("All_Teams_Clean").collect();
    },
});
  
export type AllTeamsClean = {
    _id: Id<"All_Teams_Clean">;
    name: string;
    region: string,
    league: string;
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
  };
  