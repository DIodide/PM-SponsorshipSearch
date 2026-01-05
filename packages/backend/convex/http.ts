import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// Minimum teams threshold for triggering AI discovery
const MIN_TEAMS_THRESHOLD = 3;

// Streaming search endpoint with AI fallback
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

        // Track search session
        let sessionId: Id<"searchSessions"> | null = null;

        try {
          // Create search session for tracking
          sessionId = await ctx.runMutation(api.search.createSession, {
            query: query || "",
            filters: filters || {},
          });
          
          sendEvent({ type: "session", sessionId });

          // Step 1: Analyzing requirements
          sendEvent({ type: "step", step: "analyze", status: "active" });
          await new Promise((r) => setTimeout(r, 500));
          sendEvent({ type: "step", step: "analyze", status: "completed" });

          // Step 2: Searching database
          sendEvent({ type: "step", step: "search", status: "active" });

          // Get teams from database
          let teams = await ctx.runQuery(internal.search.searchTeams, {
            query: query || "",
            filters: filters || {},
          });

          const hasEnoughResults = teams.length >= MIN_TEAMS_THRESHOLD;
          let usedAIDiscovery = false;

          // If not enough results, trigger AI discovery
          if (!hasEnoughResults) {
            sendEvent({ 
              type: "info", 
              message: "Limited database results, searching for additional teams..." 
            });
            
            try {
              // Call AI discovery action
              const discoveryResult = await ctx.runAction(api.research.discoverTeams, {
                query: query || "sports sponsorship opportunities",
                filters: filters || {},
                useCache: true,
              });
              
              if (discoveryResult.teams.length > 0) {
                usedAIDiscovery = true;
                sendEvent({ 
                  type: "info", 
                  message: discoveryResult.fromCache 
                    ? `Found ${discoveryResult.teams.length} cached recommendations`
                    : `Discovered ${discoveryResult.teams.length} new team opportunities` 
                });
              }
              
              // Merge discovered teams with database results
              // Convert discovered teams to match DB format for scoring
              const discoveredTeams = discoveryResult.teams.map((dt, idx) => ({
                _id: `discovered-${idx}` as unknown as typeof teams[0]["_id"],
                _creationTime: Date.now(),
                ...dt,
                demographics: {
                  avgAge: undefined,
                  genderSplit: undefined,
                  incomeLevel: undefined,
                  primaryAudience: [],
                },
                isDiscovered: true,
                aiReasoning: dt.reasoning,
                aiPros: dt.pros,
                aiCons: dt.cons,
                aiConfidence: dt.confidence,
              }));
              
              // Combine database teams with discovered teams
              // DB teams first, then discovered teams that aren't duplicates
              const existingNames = new Set(teams.map(t => t.name.toLowerCase()));
              const newDiscovered = discoveredTeams.filter(
                dt => !existingNames.has(dt.name.toLowerCase())
              );
              
              teams = [...teams, ...newDiscovered];
            } catch (aiError) {
              console.warn("AI discovery failed, continuing with DB results:", aiError);
              sendEvent({ 
                type: "warning", 
                message: "AI discovery unavailable, showing available results" 
              });
            }
          }

          await new Promise((r) => setTimeout(r, 400));
          sendEvent({ type: "step", step: "search", status: "completed" });

          // Handle case where we still have no results
          if (teams.length === 0) {
            sendEvent({ 
              type: "error", 
              message: "No teams found matching your criteria. Try broadening your search filters." 
            });
            sendEvent({ type: "complete", totalResults: 0 });
            controller.close();
            return;
          }

          // Step 3: Evaluating alignment
          sendEvent({ type: "step", step: "evaluate", status: "active" });
          await new Promise((r) => setTimeout(r, 600));
          sendEvent({ type: "step", step: "evaluate", status: "completed" });

          // Step 4: Ranking teams
          sendEvent({ type: "step", step: "rank", status: "active" });

          // Score and rank teams
          const scoredTeams = teams.map((team) => {
            const isDiscovered = (team as { isDiscovered?: boolean }).isDiscovered;
            const aiConfidence = (team as { aiConfidence?: number }).aiConfidence;
            
            // For AI-discovered teams, blend AI confidence with calculated score
            let score = calculateMatchScore(team, filters);
            if (isDiscovered && aiConfidence) {
              score = Math.round((score * 0.6) + (aiConfidence * 0.4));
            }
            
            return { team, score, isDiscovered };
          });

          scoredTeams.sort((a, b) => b.score - a.score);
          const topTeams = scoredTeams.slice(0, 10);

          await new Promise((r) => setTimeout(r, 500));
          sendEvent({ type: "step", step: "rank", status: "completed" });

          // Step 5: Generating recommendations
          sendEvent({ type: "step", step: "generate", status: "active" });

          // Stream each team result
          for (let i = 0; i < topTeams.length; i++) {
            const { team, score, isDiscovered } = topTeams[i];
            const teamData = team as typeof team & {
              isDiscovered?: boolean;
              aiReasoning?: string;
              aiPros?: string[];
              aiCons?: string[];
            };

            const recommendation = {
              id: team._id,
              name: team.name,
              league: team.league,
              city: team.city,
              state: team.state,
              region: team.region,
              score,
              // Use AI-generated content for discovered teams, fallback for DB teams
              reasoning: isDiscovered && teamData.aiReasoning 
                ? teamData.aiReasoning 
                : generateReasoning(team, filters, score),
              pros: isDiscovered && teamData.aiPros 
                ? teamData.aiPros 
                : generatePros(team, filters),
              cons: isDiscovered && teamData.aiCons 
                ? teamData.aiCons 
                : generateCons(team, filters),
              demographics: team.demographics,
              estimatedCost: team.estimatedSponsorshipRange,
              brandValues: team.brandValues,
              dealStructure: {
                suggestedAssets: generateAssets(team),
                activationIdeas: generateActivations(team),
              },
              isDiscovered: isDiscovered || false,
            };

            sendEvent({ type: "team", team: recommendation });
            await new Promise((r) => setTimeout(r, 300));
          }

          sendEvent({ type: "step", step: "generate", status: "completed" });
          
          // Update session as completed
          if (sessionId) {
            await ctx.runMutation(api.search.updateSessionStatus, {
              sessionId,
              status: "completed",
              resultsCount: topTeams.length,
            });
            
            // Save top results to database for history
            for (let i = 0; i < Math.min(topTeams.length, 5); i++) {
              const { team, score, isDiscovered } = topTeams[i];
              const teamData = team as typeof team & {
                aiReasoning?: string;
                aiPros?: string[];
                aiCons?: string[];
              };
              
              // Only save if it's a real team ID (not discovered)
              if (!isDiscovered && typeof team._id === "string" && !team._id.startsWith("discovered-")) {
                try {
                  await ctx.runMutation(api.search.saveResult, {
                    sessionId,
                    teamId: team._id,
                    score,
                    rank: i + 1,
                    reasoning: teamData.aiReasoning || generateReasoning(team, filters, score),
                    pros: teamData.aiPros || generatePros(team, filters),
                    cons: teamData.aiCons || generateCons(team, filters),
                    dealStructure: {
                      estimatedCost: team.estimatedSponsorshipRange?.min || 0,
                      suggestedAssets: generateAssets(team),
                      activationIdeas: generateActivations(team),
                    },
                  });
                } catch (saveError) {
                  console.warn("Failed to save search result:", saveError);
                }
              }
            }
          }
          
          sendEvent({ 
            type: "complete", 
            totalResults: topTeams.length,
            usedAIDiscovery,
            sessionId,
          });
        } catch (error) {
          console.error("Search error:", error);
          
          // Update session as failed
          if (sessionId) {
            await ctx.runMutation(api.search.updateSessionStatus, {
              sessionId,
              status: "failed",
            });
          }
          
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

