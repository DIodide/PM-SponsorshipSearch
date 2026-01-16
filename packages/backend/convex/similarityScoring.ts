import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { AllTeamsClean } from "./All_Teams_Clean";


// ----------------------
// Utility Functions
// ----------------------

function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB); // [-1,1]
}

function euclideanSimilarity(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  const distance = Math.abs(a - b);
  return 1 / (1 + distance); // Converts distance → similarity in (0,1]
}

// ----------------------
// Embedding Helper
// ----------------------
// Replace this with your actual embedding provider call.
async function embedText(text: string): Promise<number[] | null> {
  if (!text || text.trim() === "") return null;

  // Example: Replace with your embedding API
  // const response = await fetch("https://api.openai.com/v1/embeddings", {...})
  // return response.data[0].embedding;

  return Array(256).fill(0).map(() => Math.random());  
}

// ----------------------
// Convex Action: Compute Similarity
// ----------------------

export const computeBrandSimilarity = action({
  args: {
    query: v.string(),
    filters: v.object({
      regions: v.array(v.string()),
      demographics: v.array(v.string()),
      brandValues: v.array(v.string()),
      leagues: v.array(v.string()),
      goals: v.array(v.string()),
      budgetMin: v.optional(v.number()),
      budgetMax: v.optional(v.number()),
    }),
  },

  handler: async (ctx, args): Promise<(AllTeamsClean & { similarity_score: number })[]> => {
    const { query, filters } = args;

    // ------------------------------------------------------------
    // 1. Build Brand Vector (Embeddings + Normalized Numeric Inputs)
    // ------------------------------------------------------------

    const brandRegion = filters.regions.join(" ");
    const brandLeague = filters.leagues.join(" ");
    const brandValues = filters.brandValues.join(" ");
    // YUBI: THIS IS NOT ACCURATE
    // const brandPartners = filters.demographics.join(" "); // interpret "demographics" as partner-related inputs if needed
    const brandAudience = filters.demographics.join(" ");
    const brandGoals = filters.goals.join(" ");

    const brandVector = {
      region_embedding: await embedText(brandRegion),
      league_embedding: await embedText(brandLeague),
      values_embedding: await embedText(brandValues),
      audience_embedding: await embedText(brandAudience),
      goals_embedding: await embedText(brandGoals),
    };

    // ------------------------------------------------------------
    // 2. Fetch All Team Objects
    // ------------------------------------------------------------

    const teams: AllTeamsClean[] = await ctx.runQuery(api.All_Teams_Clean.getAll, {});

    if (!teams || teams.length === 0) {
      return [];
    }

    // ------------------------------------------------------------
    // 3. Compute Similarities Per Team
    // ------------------------------------------------------------

    const scored: (AllTeamsClean & { similarity_score: number })[] = teams.map((team: AllTeamsClean) => {
        const simRegion = cosineSimilarity(brandVector.region_embedding, team.region_embedding);
        const simLeague = cosineSimilarity(brandVector.league_embedding, team.league_embedding);
        const simValues = cosineSimilarity(brandVector.values_embedding, team.values_embedding);
        const simGoals = cosineSimilarity(brandVector.goals_embedding, team.partners_embedding);

        // use goals embedding and audience embedding
        // YUBI: add more similarity scores that take into account local presence, digital presence, etc.
      
        const components = [
          simRegion,
          simLeague,
          simValues,
          simGoals
          // YUBI: want to add more components here
        ];
      
        const active = components.filter((v) => typeof v === "number") as number[];

        // YUBI: this is robust against unknown values in a team by only dividing by the number of known values per team
        const avgScore =
          active.length > 0 ? active.reduce((s, v) => s + v, 0) / active.length : 0;
      
        return {
          ...team,
          similarity_score: avgScore,
        };
      });
      


    // ------------------------------------------------------------
    // 4. Sort by similarity descending
    // ------------------------------------------------------------

    scored.sort(
        (a: { similarity_score: number }, b: { similarity_score: number }) =>
          b.similarity_score - a.similarity_score
      );
      

    return scored;
  },
});
