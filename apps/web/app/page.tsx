"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchPanel } from "@/components/search/SearchPanel";
import { StreamingResults } from "@/components/search/StreamingResults";
import { Sidebar, type SearchHistory } from "@/components/search/Sidebar";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, SparklesIcon, Target01Icon, ChartLineData01Icon, Menu01Icon } from "@hugeicons/core-free-icons";

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

// Load history from localStorage
const loadHistory = (): SearchHistory[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("searchHistory");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save history to localStorage
const saveHistory = (history: SearchHistory[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("searchHistory", JSON.stringify(history.slice(0, 20))); // Keep last 20
  } catch {
    // Ignore storage errors
  }
};

export default function Page() {
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    query: "",
    filters: defaultFilters,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<SearchHistory[]>([]);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleSearch = (query: string, filters: SearchFilters) => {
    // Add to history - keep all searches even with duplicate queries
    const newHistoryItem: SearchHistory = {
      id: Date.now().toString(),
      query,
      filters,
      timestamp: Date.now(),
    };
    const newHistory = [newHistoryItem, ...history];
    setHistory(newHistory);
    saveHistory(newHistory);

    setSearchState({
      isSearching: true,
      query,
      filters,
    });
  };

  const handleSearchComplete = useCallback((resultsCount: number) => {
    // Update the most recent history item with results count
    setHistory((prev: SearchHistory[]) => {
      const firstItem = prev[0];
      if (!firstItem) return prev;
      const updated: SearchHistory[] = [
        {
          id: firstItem.id,
          query: firstItem.query,
          filters: firstItem.filters,
          timestamp: firstItem.timestamp,
          resultsCount,
        },
        ...prev.slice(1)
      ];
      saveHistory(updated);
      return updated;
    });
  }, []);

  const handleSelectHistory = (item: SearchHistory) => {
    setSearchState({
      isSearching: true,
      query: item.query,
      filters: item.filters,
    });
    setSidebarOpen(false);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const handleReset = () => {
    setSearchState({
      isSearching: false,
      query: "",
      filters: defaultFilters,
    });
  };

  return (
    <>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        history={history}
        onSelectHistory={handleSelectHistory}
        onClearHistory={handleClearHistory}
        onNewSearch={handleReset}
        currentQuery={searchState.query}
      />

      <main className={`min-h-screen hero-gradient transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-0"}`}>
        {/* Header */}
        <header className="border-b border-border backdrop-blur-sm bg-background/80 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              >
                <HugeiconsIcon icon={Menu01Icon} size={20} className="text-muted-foreground" />
              </button>
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

        <div className="max-w-5xl mx-auto px-6 py-8">
          {!searchState.isSearching ? (
            /* Landing State */
            <div className="flex flex-col items-center justify-center min-h-[70vh]">
              {/* Hero */}
              <div className="text-center mb-12 max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                  Your Brand X 
                  <span className="text-foreground"> Sports Team Partnership</span>
                </h1>
                
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
              onComplete={handleSearchComplete}
            />
          )}
        </div>
      </main>
    </>
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
