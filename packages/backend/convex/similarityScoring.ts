import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { AllTeamsClean } from "./All_Teams_Clean";

function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB); // [-1,1]
}

// ----------------------
// Embedding Helper
// ----------------------

// YUBI: added embedding logic, make sure that this is correct
async function embedText(txt: string | undefined | null): Promise<number[] | null> {
    if (!txt || txt.trim() === "") return null;

    // 1. Access the environment variable via process.env
    const apiKey = process.env.GEMINI_API_KEY;
  
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
    // const brandPartners = filters.demographics.join(" "); // interpret "demographics" as partner-related inputs if needed
    const brandAudience = filters.demographics.join(" ");
    const brandGoals = filters.goals.join(" ");

    // YUBI: use direct inputs

    // Set target value tier of team using goals
    let target_value_tier = 2
    if (brandGoals.includes("prestige-credibility")) {
        target_value_tier += 1
    } else if (brandGoals.includes("brand-awareness")) {
        target_value_tier += 1
    } else if (brandGoals.includes("business-to-business")) {
        target_value_tier += 1
    } else if (brandGoals.includes("fan-connection-activation-control")) {
        target_value_tier -= 2
    }

    // constrain the target value tier to be within 1 and 3
    if (target_value_tier < 1) {
        target_value_tier = 1
    } else if (target_value_tier > 3) {
        target_value_tier = 3
    }

    // YUBI: use direct inputs to compute demographic similarity
    // YUBI: use budget inputs to compute target value tier

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
        
        // YUBI: not relevant
        const simGoals = cosineSimilarity(brandVector.goals_embedding, team.partners_embedding);

        // YUBI: this has a range of 2, but we want it to span from -1 to 1
        const valuationSim = (1-Math.abs(target_value_tier - team.value_tier))

        // Set target value tier of team using goals
        let demSim = 0
        if (brandAudience.includes("gen-z") && team.gen_z_weight != null) {
            demSim += team.gen_z_weight
        } else if (brandAudience.includes("millennials") && team.millenial_weight != null) {
            demSim += team.millenial_weight
        } else if (brandAudience.includes("gen-x") && team.gen_x_weight != null) {
            demSim += team.gen_x_weight
        } else if (brandAudience.includes("boomer") && team.boomer_weight != null) {
            demSim += team.boomer_weight
        } else if (brandAudience.includes("kids") && team.kids_weight != null) {
            demSim += team.kids_weight
        } else if (brandAudience.includes("women") && team.women_weight != null) {
            demSim += team.women_weight
        } else if (brandAudience.includes("men") && team.men_weight != null) {
            demSim += team.men_weight
        }

        const components = [
          simRegion,
          simLeague,
          simValues,
          valuationSim,
          demSim
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
