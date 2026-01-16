// packages/backend/convex/nflProcess.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

/**
 * Compute mean and sd, ignoring null; returns {mean, sd}
 */
function computeStats(nums: (number | null | undefined)[]): {
  mean: number;
  sd: number;
} {
  const filtered = nums.filter((n): n is number => typeof n === "number");

  if (filtered.length === 0) return { mean: 0, sd: 1 };

  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const variance =
    filtered.reduce((a, b) => a + (b - mean) ** 2, 0) / filtered.length;
  const sd = Math.sqrt(variance) || 1;

  return { mean, sd };
}

/**
 * Replace nulls with mean of column.
 */
// YUBI: should not need this function
function fillNull(value: number | null | undefined, mean: number): number {
  if (value === null || value === undefined) return mean;
  return value;
}

export const insertCleanRow = mutation({
    args: {
      row: v.any()
    },
    handler: async (ctx, { row }) => {
      await ctx.db.insert("All_Teams_Clean", row);
    }
});  


/**
 * MAIN MUTATION:
 * - Reads from NFL_seed
 * - Fills missing numeric values with column mean
 * - Normalizes numeric fields
 * - Embeds all string fields with Gemini
 * - Writes into NFL_clean
 */

// Define embed outside the action for better readability
async function embed(txt: string | undefined | null, apiKey: string): Promise<number[] | null> {
    if (!txt || txt.trim() === "") return null;
  
    const body = {
      model: "models/embedding-001",
      content: { parts: [{ text: txt }] }
    };
  
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
  
    const json = await res.json();
    if (!res.ok) throw new Error(`Gemini Error: ${json.error?.message || res.statusText}`);
    
    return json.embedding.values;
  }
  
  export const buildCleanTable = action({
    args: {},
    handler: async (ctx) => {

        // 1. Access the environment variable via process.env
        const apiKey = process.env.GEMINI_API_KEY;

        // 2. Immediate validation: Stop early if the key is missing
        if (!apiKey) {
            throw new Error(
                "GEMINI_API_KEY is not set. Run 'npx convex env set GEMINI_API_KEY <your-key>'."
            );
        }

      const seed = await ctx.runQuery(api.All_Teams.getAll, {});
      if (seed.length === 0) return "No rows in All_Teams.";
  
      const attendance = computeStats(seed.map((r: Doc<"All_Teams">) => r.avg_game_attendance ?? null));
      const population = computeStats(seed.map((r: Doc<"All_Teams">) => r.city_population ?? null));
      const gdp = computeStats(seed.map((r: Doc<"All_Teams">) => r.metro_gdp_millions ?? null));

    // put social media info on burner for now because Ibraheem hasn't been able to scrape it yet
      const x = computeStats(seed.map((r: Doc<"All_Teams">) => r.followers_x ?? null));
      const instagram = computeStats(seed.map((r: Doc<"All_Teams">) => r.followers_instagram ?? null));
      const facebook = computeStats(seed.map((r: Doc<"All_Teams">) => r.followers_facebook ?? null));
      const tiktok = computeStats(seed.map((r: Doc<"All_Teams">) => r.followers_tiktok ?? null));
      const youtube = computeStats(seed.map((r: Doc<"All_Teams">) => r.subscribers_youtube ?? null));
      const family_programs = computeStats(seed.map((r: Doc<"All_Teams">) => r.family_program_count ?? null));
      const ticketStats = computeStats(seed.map((r: Doc<"All_Teams">) => r.avg_ticket_price ?? null));
      const valuation = computeStats(seed.map((r: Doc<"All_Teams">) => r.franchise_value_millions ?? null));
      const revenue = computeStats(seed.map((r: Doc<"All_Teams">) => r.annual_revenue_millions ?? null));

      // weights for scoring of team tier
      const weights = { val: 0.4, rev: 0.3, ticket: 0.2, gdp: 0.1 };

      for (const row of seed) {
        // Parallelize the 4 embedding calls for THIS row
        // We use Promise.all to "await" all of them together
        const [regionEmb, leagueEmb, valuesEmb, sponsorsEmb, familyProgramsEmb, missionEmb, communityProgramsEmb, partnersEmb] = await Promise.all([
            row.region ? embed(row.region, apiKey) : Promise.resolve(null),
            // Should I use league or category?
            row.league ? embed(row.league, apiKey) : Promise.resolve(null),
            row.values ? embed(row.values, apiKey) : Promise.resolve(null),
            row.sponsors ? embed(row.sponsors, apiKey) : Promise.resolve(null),
            row.family_program_types ? embed(row.family_program_types, apiKey) : Promise.resolve(null),
            row.mission_tags ? embed(row.mission_tags, apiKey) : Promise.resolve(null),
            row.community_programs ? embed(row.community_programs, apiKey) : Promise.resolve(null),
            row.cause_partnerships ? embed(row.cause_partnerships, apiKey) : Promise.resolve(null),
        ]);

        // normalize all of the numerical values
        const attendance_norm = (row.avg_game_attendance != null) ? (row.avg_game_attendance - attendance.mean) / attendance.sd : null
        const valuation_norm = (row.franchise_value_millions != null) ? (row.franchise_value_millions - valuation.mean) / valuation.sd : null
        const gdp_norm = (row.metro_gdp_millions != null) ? (row.metro_gdp_millions - gdp.mean) / gdp.sd : null
        const ticket_price_norm = (row.avg_ticket_price != null) ? (row.avg_ticket_price - ticketStats.mean) / ticketStats.sd : null
        const family_programs_norm = (row.family_program_count != null) ? (row.family_program_count - family_programs.mean) / family_programs.sd : null
        const revenue_norm = (row.annual_revenue_millions != null) ? (row.annual_revenue_millions - revenue.mean) / revenue.sd : null
        const population_norm = (row.city_population != null) ? (row.city_population - population.mean) / population.sd : null
        const x_norm =  (row.followers_x != null) ? (row.followers_x - x.mean) / x.sd : null
        const instagram_norm =  (row.followers_instagram != null) ? (row.followers_instagram - instagram.mean) / instagram.sd : null
        const facebook_norm =  (row.followers_facebook != null) ? (row.followers_facebook - facebook.mean) / facebook.sd : null
        const tiktok_norm =  (row.followers_tiktok != null) ? (row.followers_tiktok - tiktok.mean) / tiktok.sd : null
        const youtube_norm =  (row.subscribers_youtube != null) ? (row.subscribers_youtube - youtube.mean) / youtube.sd : null      
        
        const digital_reach_score = (instagram_norm ?? 0) + (x_norm ?? 0) + (facebook_norm ?? 0) + (tiktok_norm ?? 0) + (youtube_norm ?? 0)
        const local_reach_score = (attendance_norm ?? 0) + (population_norm ?? 0)

        // 3. Compute Weighted Score
        let totalWeightedScore = 0;
        let totalWeightApplied = 0;

        if (valuation_norm !== null) { totalWeightedScore += valuation_norm * weights.val; totalWeightApplied += weights.val; }
        if (revenue_norm !== null) { totalWeightedScore += revenue_norm * weights.rev; totalWeightApplied += weights.rev; }
        if (ticket_price_norm !== null) { totalWeightedScore += ticket_price_norm * weights.ticket; totalWeightApplied += weights.ticket; }
        if (gdp_norm !== null) { totalWeightedScore += gdp_norm * weights.gdp; totalWeightApplied += weights.gdp; }

        const finalScore = totalWeightApplied > 0 ? totalWeightedScore / totalWeightApplied : 0;
        // 4. Assign the Tier
        // YUBI: this could assign a tier of 0 to some teams, which is NOT what I want
        // YUBI: check these cutoff values, they are very arbitrary
        const valueTierScore = finalScore > 0.5 ? 3 : finalScore < -0.5 ? 1 : 2;

        const cleanRow = {
          name: row.name,
          region: row.region,
          league: row.league,
          official_url: row.official_url,
  
          region_embedding: regionEmb,
          league_embedding: leagueEmb,
          values_embedding: valuesEmb,
          sponsors_embedding: sponsorsEmb,
          family_programs_embedding: familyProgramsEmb,
          mission_embedding: missionEmb,
          community_programs_embedding: communityProgramsEmb,
          partners_embedding: partnersEmb,

            digital_reach: digital_reach_score,
            local_reach: local_reach_score,
            family_friendly: family_programs_norm,

            value_tier: valueTierScore,
  
        };
  
        await ctx.runMutation(api.dataPreProcess.insertCleanRow, { row: cleanRow });
      }
  
      return "All_Teams_Clean built successfully.";
    },
  });