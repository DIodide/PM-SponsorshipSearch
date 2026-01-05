"use client";

import { useState, useCallback } from "react";
import type { SearchFilters } from "@/app/page";
import type { TeamRecommendation } from "@/components/search/TeamCard";
import type { ProgressStep } from "@/components/search/ProgressSteps";

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

export function useStreamingSearch() {
  const [steps, setSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [teams, setTeams] = useState<TeamRecommendation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingTeamId, setStreamingTeamId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS);
    setTeams([]);
    setIsSearching(false);
    setIsComplete(false);
    setError(null);
    setStreamingTeamId(null);
  }, []);

  const updateStepStatus = useCallback((stepId: string, status: ProgressStep["status"]) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === stepId) {
          return { ...step, status };
        }
        const currentIndex = prev.findIndex((s) => s.id === stepId);
        const thisIndex = prev.findIndex((s) => s.id === step.id);
        if (thisIndex < currentIndex && step.status !== "completed") {
          return { ...step, status: "completed" };
        }
        return step;
      })
    );
  }, []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
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
    },
    [updateStepStatus]
  );

  const search = useCallback(
    async (query: string, filters: SearchFilters) => {
      reset();
      setIsSearching(true);

      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!convexUrl) {
        setError("Convex URL not configured");
        setIsSearching(false);
        return;
      }

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
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        console.error("Search error:", err);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setIsSearching(false);
      }
    },
    [reset, handleStreamEvent]
  );

  return {
    steps,
    teams,
    isSearching,
    isComplete,
    error,
    streamingTeamId,
    search,
    reset,
  };
}

