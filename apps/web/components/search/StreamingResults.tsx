"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ProgressSteps, type ProgressStep } from "./ProgressSteps";
import { TeamCard, type TeamRecommendation } from "./TeamCard";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { SearchFilters } from "@/app/page";

interface StreamingResultsProps {
  query: string;
  filters: SearchFilters;
  onReset: () => void;
}

type StreamEvent =
  | { type: "step"; step: string; status: "active" | "completed" }
  | { type: "team"; team: TeamRecommendation }
  | { type: "complete"; totalResults: number }
  | { type: "error"; message: string };

const INITIAL_STEPS: ProgressStep[] = [
  { id: "analyze", label: "Analyzing your brand requirements...", status: "pending" },
  { id: "search", label: "Searching sports teams database...", status: "pending" },
  { id: "evaluate", label: "Evaluating audience alignment...", status: "pending" },
  { id: "rank", label: "Ranking by budget and brand fit...", status: "pending" },
  { id: "generate", label: "Generating recommendations...", status: "pending" },
];

export function StreamingResults({ query, filters, onReset }: StreamingResultsProps) {
  const [steps, setSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [teams, setTeams] = useState<TeamRecommendation[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingTeamId, setStreamingTeamId] = useState<string | null>(null);
  const hasStartedRef = useRef(false);

  const updateStepStatus = useCallback((stepId: string, status: ProgressStep["status"]) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) {
          return { ...step, status };
        }
        // Mark previous steps as completed
        const currentIndex = prev.findIndex((s) => s.id === stepId);
        const thisIndex = prev.findIndex((s) => s.id === step.id);
        if (thisIndex < currentIndex && step.status !== "completed") {
          return { ...step, status: "completed" };
        }
        return step;
      })
    );
  }, []);

  const runSearch = useCallback(async () => {
    // Prevent double execution in React Strict Mode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Reset state at the start of search
    setTeams([]);
    setSteps(INITIAL_STEPS);
    setIsComplete(false);
    setError(null);

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      // Fall back to mock data for demo
      runMockSearch();
      return;
    }

    // Convert Convex URL to HTTP endpoint
    const httpUrl = convexUrl.replace(".convex.cloud", ".convex.site");

    try {
      const response = await fetch(`${httpUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, filters }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              handleStreamEvent(event);
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      // Fall back to mock data for demo
      runMockSearch();
    }
  }, [query, filters]);

  const handleStreamEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "step":
        updateStepStatus(event.step, event.status);
        break;
      case "team":
        setStreamingTeamId(event.team.id);
        setTeams((prev) => [...prev, event.team]);
        setTimeout(() => setStreamingTeamId(null), 1000);
        break;
      case "complete":
        setIsComplete(true);
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        break;
      case "error":
        setError(event.message);
        break;
    }
  };

  // Mock search for demo purposes when backend is not available
  const runMockSearch = async () => {
    // Clear teams at start of mock search
    setTeams([]);
    
    const mockTeams: TeamRecommendation[] = [
      {
        id: "1",
        name: "Phoenix Suns",
        league: "NBA",
        city: "Phoenix",
        state: "AZ",
        region: "southwest",
        score: 92,
        reasoning:
          "The Phoenix Suns offer excellent alignment with your target demographics and brand values. Their fan base skews younger and tech-savvy, with strong engagement across digital platforms.",
        pros: [
          "Large, engaged millennial and Gen Z fan base",
          "Strong digital and social media presence",
          "Growing market with increasing corporate interest",
        ],
        cons: [
          "Premium pricing due to recent team success",
          "Competitive sponsorship landscape in the market",
        ],
        demographics: {
          avgAge: 34,
          primaryAudience: ["Young Professionals", "Tech Workers"],
          incomeLevel: "upper-middle",
        },
        estimatedCost: { min: 500000, max: 2000000 },
        brandValues: ["innovation", "performance", "excellence"],
        dealStructure: {
          suggestedAssets: ["Courtside Signage", "Digital Integration", "VIP Hospitality"],
          activationIdeas: ["Tech Demo Zone", "App Partnership", "Influencer Events"],
        },
      },
      {
        id: "2",
        name: "Austin FC",
        league: "MLS",
        city: "Austin",
        state: "TX",
        region: "southwest",
        score: 88,
        reasoning:
          "Austin FC provides access to one of America's fastest-growing tech hubs with a passionate, young fan base that values innovation and community engagement.",
        pros: [
          "Access to Austin's booming tech scene",
          "Highly educated, affluent fan demographic",
          "Strong community-focused brand identity",
        ],
        cons: [
          "Newer franchise with less historical data",
          "Smaller venue capacity limits exposure",
        ],
        demographics: {
          avgAge: 31,
          primaryAudience: ["Tech Workers", "Young Professionals"],
          incomeLevel: "high",
        },
        estimatedCost: { min: 250000, max: 1000000 },
        brandValues: ["innovation", "community", "sustainability"],
        dealStructure: {
          suggestedAssets: ["Jersey Patch", "Stadium Naming", "Digital Content"],
          activationIdeas: ["SXSW Partnership", "Tech Meetups", "Sustainability Initiative"],
        },
      },
      {
        id: "3",
        name: "Las Vegas Raiders",
        league: "NFL",
        city: "Las Vegas",
        state: "NV",
        region: "west",
        score: 85,
        reasoning:
          "The Raiders offer massive national exposure with their move to Las Vegas, attracting a diverse fan base and premium hospitality opportunities.",
        pros: [
          "Massive national brand recognition",
          "State-of-the-art stadium facilities",
          "Entertainment capital location draws visitors",
        ],
        cons: [
          "Higher sponsorship costs due to NFL premium",
          "Competitive market for attention in Vegas",
        ],
        demographics: {
          avgAge: 38,
          primaryAudience: ["Sports Enthusiasts", "Affluent Travelers"],
          incomeLevel: "upper-middle",
        },
        estimatedCost: { min: 1000000, max: 5000000 },
        brandValues: ["excellence", "tradition", "performance"],
        dealStructure: {
          suggestedAssets: ["Stadium Signage", "Broadcast Integration", "Suite Access"],
          activationIdeas: ["Fan Experience Zone", "VIP Events", "Content Series"],
        },
      },
    ];

    // Simulate streaming with delays
    const stepOrder = ["analyze", "search", "evaluate", "rank", "generate"];

    for (const stepId of stepOrder) {
      updateStepStatus(stepId, "active");
      await new Promise((r) => setTimeout(r, 800));
      updateStepStatus(stepId, "completed");
    }

    // Stream in teams one by one
    for (const team of mockTeams) {
      setStreamingTeamId(team.id);
      setTeams((prev) => [...prev, team]);
      await new Promise((r) => setTimeout(r, 600));
      setStreamingTeamId(null);
    }

    setIsComplete(true);
  };

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onReset} className="text-muted-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={18} className="mr-2" />
          Back to Search
        </Button>
      </div>

      {/* Query Summary */}
      <div className="p-4 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-start gap-3">
          <HugeiconsIcon icon={Search01Icon} size={20} className="text-playmaker-blue mt-0.5" />
          <div>
            <div className="font-medium">{query || "Filtered Search"}</div>
            {Object.entries(filters).some(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : true)) && (
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-2">
                {filters.budgetMin && filters.budgetMax && (
                  <span>
                    Budget: ${filters.budgetMin.toLocaleString()} - ${filters.budgetMax.toLocaleString()}
                  </span>
                )}
                {filters.regions.length > 0 && <span>Regions: {filters.regions.join(", ")}</span>}
                {filters.leagues.length > 0 && <span>Leagues: {filters.leagues.join(", ")}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      {!isComplete && (
        <div className="p-4 rounded-lg bg-card border border-border">
          <ProgressSteps steps={steps} />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      {teams.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {isComplete ? `Found ${teams.length} Recommendations` : "Finding matches..."}
            </h2>
          </div>

          <div className="space-y-4">
            {teams.map((team, index) => (
              <TeamCard
                key={`${team.id}-${index}`}
                team={team}
                rank={index + 1}
                isStreaming={streamingTeamId === team.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {isComplete && teams.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No teams found matching your criteria.</p>
          <Button onClick={onReset} className="mt-4">
            Try a different search
          </Button>
        </div>
      )}
    </div>
  );
}

