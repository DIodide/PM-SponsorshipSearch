import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { AllTeamsClean } from "./All_Teams_Clean";

function cosineSimilarity(a: number[] | null, b: number[] | null): number {
  // 1. Check if either vector is null, undefined, or empty
  if (!a || !b || a.length === 0 || b.length === 0) return 0;

  // 2. Ensure vectors are the same length to avoid undefined multiplication
  if (a.length !== b.length) {
    console.warn("Vector length mismatch:", a.length, b.length);
    return 0;
  }
  
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (normA === 0 || normB === 0) return 0;

  const similarity = dot / (normA * normB);
  return isNaN(similarity) ? 0 : similarity;
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
      query_embedding: await embedText(query)
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
        // scale is close to 0.7 to 0.9
        const simRegion = cosineSimilarity(brandVector.region_embedding, team.region_embedding);
        const simLeague = cosineSimilarity(brandVector.league_embedding, team.league_embedding);
        const simValues = cosineSimilarity(brandVector.values_embedding, team.values_embedding);

        // compute similarity between target audience and different programs
        const simAudience1 = cosineSimilarity(brandVector.audience_embedding, team.community_programs_embedding);
        const simAudience2 = cosineSimilarity(brandVector.audience_embedding, team.family_programs_embedding);
        const simAudience = (simAudience1 + simAudience2) / 2;
        // compute similarity between brand values and different programs
        const simValueProg1 = cosineSimilarity(brandVector.values_embedding, team.community_programs_embedding);
        const simValueProg2 = cosineSimilarity(brandVector.values_embedding, team.family_programs_embedding);
        const simValueProg = (simValueProg1 + simValueProg2) / 2;

        // aggregate value and audience and query together
        let simQuery = cosineSimilarity(brandVector.query_embedding, team.league_embedding);
        simQuery += cosineSimilarity(brandVector.query_embedding, team.values_embedding);
        simQuery += cosineSimilarity(brandVector.query_embedding, team.community_programs_embedding);
        simQuery /= 3;

        
        // YUBI: is this useful? how can we use info about partners and sponsors?
        const simGoals = cosineSimilarity(brandVector.goals_embedding, team.partners_embedding);

        // YUBI: this has a range of 0 to 1
        const tierDiff = Math.abs(target_value_tier - (team.value_tier ?? 1));
        const valuationSim = 1 - (tierDiff / 2); // 0 diff = 1.0 score; 2 diff = 0.0 score

        // Set target value tier of team using goals
        let demSim = 0
        let demCounter = 0
        if (brandAudience.includes("gen-z")) {
          // YUBI: what happens if the weight value is null?
            demSim += team.gen_z_weight ?? 0
            demCounter += 1
        } else if (brandAudience.includes("millennials")) {
            demSim += team.millenial_weight ?? 0
            demCounter += 1
        } else if (brandAudience.includes("gen-x")) {
            demSim += team.gen_x_weight ?? 0
            demCounter += 1
        } else if (brandAudience.includes("boomer")) {
            demSim += team.boomer_weight ?? 0
            demCounter += 1
        } else if (brandAudience.includes("kids")) {
            demSim += team.kids_weight ?? 0
            demCounter += 1
        } else if (brandAudience.includes("women")) {
            demSim += team.women_weight ?? 0
            if (team.category.includes("WNBA") || team.category.includes("NWSL")) {
              demSim += 1
            }
            demCounter += 1
        } else if (brandAudience.includes("men")) {
            demSim += team.men_weight ?? 0
            if (team.category.includes("WNBA") || team.category.includes("NWSL")) {
              demSim -= 0.5
            }
            demCounter += 1
        } else if (brandAudience.includes("families")) {
            demSim += team.family_friendly ?? 0
            demCounter += 1
        }

        // YUBI: normalize demSim so it doesn't have as much influence
        // roughly a range of 0 to 1
        // demSim = demCounter > 0 ? demSim / demCounter : 0;
        demSim = demCounter > 0 ? Math.min(demSim / demCounter, 1) : 0;

        // set reach score
        let reachSim = 0
        if (brandGoals.includes("digital-presence")) {
          reachSim = team.digital_reach ?? 0
        } else if (brandGoals.includes("local-presence")) {
          reachSim = team.local_reach ?? 0
        } else {
          reachSim = ((team.digital_reach ?? 0) + (team.local_reach ?? 0)) / 2
        }

        // YUBI: reachSim seems like a great metric, so I want to try and use it

        const components = [
          simRegion,
          // YUBI: replace similar league with similar query because I already have filter step below
          simQuery,
          simValues,
          valuationSim,
          demSim,
          reachSim
          // YUBI: test if these components are useful
          // simAudience
          // simValueProg
        ];
        
        // YUBI: modify weights as desired
        const WEIGHTS = {
          region: 0.3,    
          query: 0.1,      
          values: 0.1,  
          valuation: 0.3,  
          demographics: 0.1, 
          reach: 0.1
        };

        // We multiply each score by its weight
        let weightedScore = 
          (simRegion * WEIGHTS.region) +
          (simQuery * WEIGHTS.query) +
          (simValues * WEIGHTS.values) +
          (valuationSim * WEIGHTS.valuation) +
          (demSim * WEIGHTS.demographics +
          (reachSim * WEIGHTS.reach)
          );
      
        const active = components.filter((v) => typeof v === "number") as number[];

        // YUBI: this is robust against unknown values in a team by only dividing by the number of known values per team
        const avgScore =
          active.length > 0 ? active.reduce((s, v) => s + v, 0) / active.length : 0;
        
        // set score to 0 if the team's sport does not align with what sports the brand wants
        // check if the length of the string brandLeague has more than 2 characters
        if (brandLeague.length > 2) {
          if (!brandLeague.includes(team.category)) {
            weightedScore = 0
          } 
        }

        // YUBI: not using avgScore for now 
        return {
          ...team,
          similarity_score: weightedScore,
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
