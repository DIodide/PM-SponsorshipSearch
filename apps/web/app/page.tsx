"use client";

import { useState } from "react";
import { SearchPanel } from "@/components/search/SearchPanel";
import { StreamingResults } from "@/components/search/StreamingResults";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, SparklesIcon, Target01Icon, ChartLineData01Icon } from "@hugeicons/core-free-icons";

export type SearchFilters = {
  budgetMin?: number;
  budgetMax?: number;
  regions: string[];
  demographics: string[];
  brandValues: string[];
  leagues: string[];
  goals: string[];
};

export type SearchState = {
  isSearching: boolean;
  query: string;
  filters: SearchFilters;
  sessionId?: string;
};

const defaultFilters: SearchFilters = {
  regions: [],
  demographics: [],
  brandValues: [],
  leagues: [],
  goals: [],
};

export default function Page() {
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    query: "",
    filters: defaultFilters,
  });

  const handleSearch = (query: string, filters: SearchFilters) => {
    setSearchState({
      isSearching: true,
      query,
      filters,
    });
  };

  const handleReset = () => {
    setSearchState({
      isSearching: false,
      query: "",
      filters: defaultFilters,
    });
  };

  return (
    <main className="min-h-screen hero-gradient">
      {/* Header */}
      <header className="border-b border-border backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">PM</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">Sponsorship Search</span>
          </div>
          {searchState.isSearching && (
            <button
              onClick={handleReset}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              New Search
            </button>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {!searchState.isSearching ? (
          /* Landing State */
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            {/* Hero */}
            <div className="text-center mb-12 max-w-2xl">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Find Your Perfect
                <span className="text-foreground"> Sports Partnership</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                Discover sponsorship opportunities tailored to your brand&apos;s goals, 
                budget, and values across 150+ professional sports teams.
              </p>
            </div>

            {/* Search Panel */}
            <div className="w-full max-w-2xl">
              <SearchPanel onSearch={handleSearch} />
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full max-w-3xl">
              <FeatureCard
                icon={Target01Icon}
                title="Audience Match"
                description="Find teams whose fan demographics align with your target market"
              />
              <FeatureCard
                icon={ChartLineData01Icon}
                title="Budget Fit"
                description="Discover opportunities that match your sponsorship budget"
              />
              <FeatureCard
                icon={SparklesIcon}
                title="Brand Alignment"
                description="Connect with teams that share your brand values"
              />
            </div>
          </div>
        ) : (
          /* Results State */
          <StreamingResults
            query={searchState.query}
            filters={searchState.filters}
            onReset={handleReset}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          <p>Powered by PlayMaker — The Operating System for Sports Sponsorships</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: typeof Search01Icon; 
  title: string; 
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4">
        <HugeiconsIcon icon={Icon} size={20} className="text-muted-foreground" />
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
