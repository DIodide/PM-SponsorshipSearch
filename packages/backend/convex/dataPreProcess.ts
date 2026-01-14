// packages/backend/convex/nflProcess.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

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

export const insertCleanRow = mutation({
    args: {
      row: v.any()
    },
    handler: async (ctx, { row }) => {
      await ctx.db.insert("NFL_seed_clean", row);
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

export const buildCleanTable = action({
    args: {},
    handler: async (ctx) => {
      const seed = await ctx.runQuery(api.NFL_seed.getAll, {});
      if (seed.length === 0) return "No rows in NFL_seed.";
  
      // Precompute stats
      const valuations = seed.map((r: Doc<"NFL_seed">) => r.valuation ?? null);
      const attendance = seed.map((r: Doc<"NFL_seed">) => r.game_attendance ?? null);
      const ig = seed.map((r: Doc<"NFL_seed">) => r.instagram_followers ?? null);
  
      const valStats = computeStats(valuations);
      const attStats = computeStats(attendance);
      const igStats = computeStats(ig);
  
      // YUBI: manually set for now
      const apiKey = "AIzaSyDbIacwlgypDwJlSXzewLprCEdbMuaATkk";
  
      for (const row of seed) {
        // === Numeric normalization ===
        const filledVal = fillNull(row.valuation, valStats.mean);
        const filledAtt = fillNull(row.game_attendance, attStats.mean);
        const filledIG = fillNull(row.instagram_followers, igStats.mean);
  
        const normalizedVal = (filledVal - valStats.mean) / valStats.sd;
        const normalizedAtt = (filledAtt - attStats.mean) / attStats.sd;
        const normalizedIG = (filledIG - igStats.mean) / igStats.sd;
  
        // === Embeddings (allowed in actions only) ===
        const embed = async (txt: string) => {
          const body = {
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: txt }] }
          };
  
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedText?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(body)
            }
          );
  
          const json = await res.json();
          return json.embedding.values;
        };
  
        const cleanRow = {
          name: row.name,
          region: row.region,
          league: row.league,
          official_url: row.official_url,
  
          region_embedding: await embed(row.region ?? ""),
          league_embedding: await embed(row.league ?? ""),
          brand_values_embedding: await embed(row.brand_values ?? ""),
          current_partners_embedding: await embed(row.current_partners ?? ""),
  
          game_attendance_norm: normalizedAtt,
          valuation_norm: normalizedVal,
          instagram_followers_norm: normalizedIG
        };
  
        // === Store into NFL_clean ===
        await ctx.runMutation(api.dataPreProcess.insertCleanRow, { row: cleanRow });
      }
  
      return "NFL_clean built successfully.";
    },
});