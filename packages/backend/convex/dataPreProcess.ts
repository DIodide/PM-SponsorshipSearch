// packages/backend/convex/nflProcess.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Calls Google's Gemini embedding API using the published REST interface.
 * Assumes your environment variables are:
 *   GEMINI_API_KEY
 */
async function getGeminiEmbedding(text: string): Promise<number[]> {
    // YUBI ASK: where should I store this api key?
  // const apiKey = process.env.GEMINI_API_KEY;
  // YUBI: manually add this api key for now, from my personal account
  const apiKey = "AIzaSyDbIacwlgypDwJlSXzewLprCEdbMuaATkk";
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment.");
  }

  const payload = {
    model: "models/gemini-embedding-001",
    content: {
      parts: [
        { text }
      ]
    }
  };

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini embedding API error: ${await res.text()}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

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


/**
 * MAIN MUTATION:
 * - Reads from NFL_seed
 * - Fills missing numeric values with column mean
 * - Normalizes numeric fields
 * - Embeds all string fields with Gemini
 * - Writes into NFL_clean
 */
export const buildCleanTable = mutation({
  args: {},
  handler: async (ctx) => {
    const seed = await ctx.db.query("NFL_seed").collect();
    if (seed.length === 0) return "NFL_seed empty.";

    // Extract numeric columns
    const valuations = seed.map(r => r.valuation ?? null);
    const attendance = seed.map(r => r.game_attendance ?? null);
    const igFollowers = seed.map(r => r.instagram_followers ?? null);

    // Compute statistics
    const valStats = computeStats(valuations);
    const attStats = computeStats(attendance);
    const igStats = computeStats(igFollowers);

    // For each row:
    for (const row of seed) {
        // 1. Handle Numeric Normalization (Keep null as null)
        const valuationNorm = row.valuation !== null && row.valuation !== undefined
          ? (row.valuation - valStats.mean) / valStats.sd
          : null;
  
        const attendanceNorm = row.game_attendance !== null && row.game_attendance !== undefined
          ? (row.game_attendance - attStats.mean) / attStats.sd
          : null;
  
        const igNorm = row.instagram_followers !== null && row.instagram_followers !== undefined
          ? (row.instagram_followers - igStats.mean) / igStats.sd
          : null;

      // Embed all string fields: name, region, league, official_url, brand_values, current_partners
      const nameEmbedding = await getGeminiEmbedding(row.name ?? "");
      const regionEmbedding = await getGeminiEmbedding(row.region ?? "");
      const leagueEmbedding = await getGeminiEmbedding(row.league ?? "");
      
      // Conditional API calls to save costs/quota: only embed if not null
      const brandEmbedding = row.brand_values 
        ? await getGeminiEmbedding(row.brand_values) 
        : null;
        
      const partnerEmbedding = row.current_partners 
        ? await getGeminiEmbedding(row.current_partners) 
        : null;
      await ctx.db.insert("NFL_seed_clean", {
        name: row.name,
        region: row.region,
        league: row.league,
        official_url: row.official_url,

        // Embeddings
        name_embedding: nameEmbedding,
        region_embedding: regionEmbedding,
        league_embedding: leagueEmbedding,
        brand_values_embedding: brandEmbedding,
        current_partners_embedding: partnerEmbedding,

        // Normalized numeric fields
        game_attendance_norm: attendanceNorm,
        valuation_norm: valuationNorm,
        instagram_followers_norm: igNorm,
      });
    }

    return "NFL_clean table successfully built.";
  },
});