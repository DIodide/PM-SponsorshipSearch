import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Streaming search endpoint
http.route({
  path: "/search",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { query, filters } = await request.json();

    // Create a streaming response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          // Step 1: Analyzing requirements
          sendEvent({ type: "step", step: "analyze", status: "active" });
          await new Promise((r) => setTimeout(r, 500));
          sendEvent({ type: "step", step: "analyze", status: "completed" });

          // Step 2: Searching database
          sendEvent({ type: "step", step: "search", status: "active" });

          // Get teams from database
          const teams = await ctx.runQuery(internal.search.searchTeams, {
            query: query || "",
            filters: filters || {},
          });

          await new Promise((r) => setTimeout(r, 400));
          sendEvent({ type: "step", step: "search", status: "completed" });

          // Step 3: Evaluating alignment
          sendEvent({ type: "step", step: "evaluate", status: "active" });
          await new Promise((r) => setTimeout(r, 600));
          sendEvent({ type: "step", step: "evaluate", status: "completed" });

          // Step 4: Ranking teams
          sendEvent({ type: "step", step: "rank", status: "active" });

          // Score and rank teams
          const scoredTeams = teams.map((team) => ({
            team,
            score: calculateMatchScore(team, filters),
          }));

          scoredTeams.sort((a, b) => b.score - a.score);
          const topTeams = scoredTeams.slice(0, 10);

          await new Promise((r) => setTimeout(r, 500));
          sendEvent({ type: "step", step: "rank", status: "completed" });

          // Step 5: Generating recommendations
          sendEvent({ type: "step", step: "generate", status: "active" });

          // Stream each team result
          for (let i = 0; i < topTeams.length; i++) {
            const { team, score } = topTeams[i];

            const recommendation = {
              id: team._id,
              name: team.name,
              league: team.league,
              city: team.city,
              state: team.state,
              region: team.region,
              score,
              reasoning: generateReasoning(team, filters, score),
              pros: generatePros(team, filters),
              cons: generateCons(team, filters),
              demographics: team.demographics,
              estimatedCost: team.estimatedSponsorshipRange,
              brandValues: team.brandValues,
              dealStructure: {
                suggestedAssets: generateAssets(team),
                activationIdeas: generateActivations(team),
              },
            };

            sendEvent({ type: "team", team: recommendation });
            await new Promise((r) => setTimeout(r, 300));
          }

          sendEvent({ type: "step", step: "generate", status: "completed" });
          sendEvent({ type: "complete", totalResults: topTeams.length });
        } catch (error) {
          console.error("Search error:", error);
          sendEvent({
            type: "error",
            message: error instanceof Error ? error.message : "Search failed",
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// CORS preflight
http.route({
  path: "/search",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// Helper functions for generating content
function calculateMatchScore(
  team: {
    region: string;
    league: string;
    brandValues: string[];
    estimatedSponsorshipRange?: { min: number; max: number };
    demographics: {
      avgAge?: number;
      primaryAudience?: string[];
      incomeLevel?: string;
    };
  },
  filters: {
    budgetMin?: number;
    budgetMax?: number;
    regions?: string[];
    demographics?: string[];
    brandValues?: string[];
    leagues?: string[];
    goals?: string[];
  }
): number {
  let score = 50;

  if (filters.regions?.length) {
    score += filters.regions.includes(team.region) ? 20 : 0;
  } else {
    score += 10;
  }

  if (filters.leagues?.length) {
    score += filters.leagues.includes(team.league) ? 15 : 0;
  } else {
    score += 7;
  }

  if (filters.brandValues?.length) {
    const matches = team.brandValues.filter((v) => filters.brandValues!.includes(v));
    score += Math.round(20 * (matches.length / filters.brandValues.length));
  } else {
    score += 10;
  }

  if (team.estimatedSponsorshipRange) {
    const { min, max } = team.estimatedSponsorshipRange;
    const budgetMin = filters.budgetMin ?? 0;
    const budgetMax = filters.budgetMax ?? Infinity;
    if (min >= budgetMin && max <= budgetMax) {
      score += 15;
    } else if (max >= budgetMin && min <= budgetMax) {
      score += 10;
    }
  } else {
    score += 7;
  }

  if (filters.demographics?.length && team.demographics.primaryAudience) {
    const hasMatch = team.demographics.primaryAudience.some((d) =>
      filters.demographics!.some((fd) => d.toLowerCase().includes(fd.toLowerCase()))
    );
    score += hasMatch ? 15 : 0;
  } else {
    score += 7;
  }

  return Math.min(100, Math.max(0, score));
}

function generateReasoning(
  team: { name: string; league: string; city: string; brandValues: string[] },
  filters: { brandValues?: string[]; demographics?: string[] },
  score: number
): string {
  const quality = score >= 85 ? "excellent" : score >= 70 ? "strong" : "good";
  const values = team.brandValues.slice(0, 2).join(" and ");

  return `The ${team.name} offer ${quality} alignment with your brand objectives. ` +
    `As a ${team.league} team based in ${team.city}, they provide access to a dedicated fan base ` +
    `with strong emphasis on ${values}. Their market position and audience demographics ` +
    `make them a compelling partnership opportunity.`;
}

function generatePros(
  team: { marketSize: string; demographics: { primaryAudience?: string[] }; brandValues: string[] },
  filters: { brandValues?: string[] }
): string[] {
  const pros: string[] = [];

  if (team.marketSize === "large") {
    pros.push("Large market with significant brand exposure potential");
  } else if (team.marketSize === "medium") {
    pros.push("Strong regional presence with engaged fan community");
  } else {
    pros.push("Cost-effective entry point with dedicated local following");
  }

  if (team.demographics.primaryAudience?.length) {
    pros.push(`Access to ${team.demographics.primaryAudience[0]} demographic`);
  }

  if (filters.brandValues?.some((v) => team.brandValues.includes(v))) {
    pros.push("Strong brand values alignment");
  }

  pros.push("Flexible sponsorship packages available");

  return pros.slice(0, 4);
}

function generateCons(
  team: { marketSize: string; league: string },
  filters: { budgetMin?: number; budgetMax?: number }
): string[] {
  const cons: string[] = [];

  if (team.marketSize === "large") {
    cons.push("Premium pricing due to market size");
  }

  if (team.league === "NFL" || team.league === "NBA") {
    cons.push("Competitive sponsorship landscape");
  }

  if (filters.budgetMax && filters.budgetMax < 500000) {
    cons.push("May require negotiation for budget alignment");
  }

  cons.push("Activation execution requires dedicated resources");

  return cons.slice(0, 3);
}

function generateAssets(team: { league: string }): string[] {
  const baseAssets = ["In-Venue Signage", "Digital Content Rights", "Hospitality Packages"];

  switch (team.league) {
    case "NFL":
    case "NBA":
      return [...baseAssets, "Broadcast Integration", "Premium Suite Access"];
    case "MLB":
      return [...baseAssets, "Batting Practice Access", "First Pitch Opportunities"];
    case "NHL":
      return [...baseAssets, "Ice-Level Signage", "Zamboni Sponsorship"];
    case "MLS":
      return [...baseAssets, "Jersey Patch", "Training Ground Access"];
    default:
      return baseAssets;
  }
}

function generateActivations(team: { league: string; city: string }): string[] {
  return [
    "Fan Experience Zone",
    "Social Media Campaigns",
    "Community Outreach Programs",
    "VIP Meet & Greets",
    "Local Event Sponsorship",
  ].slice(0, 4);
}

export default http;

